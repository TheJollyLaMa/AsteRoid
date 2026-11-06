import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePilots, isWhitelisted, loadPilots } from '../src/js/pilots/whitelist.mjs';
import { logHash } from '../src/js/pilots/flight-log.mjs';
import { normalizeVouchers } from '../src/js/pilots/rewards.mjs';
import { requirePilot } from '../src/js/pilots/gate.mjs';
import { createRunOutbox, OUTBOX_KEY } from '../src/js/pilots/run-outbox.mjs';
const address = '0x807061DF657A7697c04045dA7d16D941861cAABc';
test('pilot whitelist requires wallet and honors opt-out case-insensitively', () => {
  const list = parsePilots({ contributors: [{ walletAddress: address }, { walletAddress: address.toLowerCase(), whitelisted: false }, { github: 'copilot' }] });
  assert.equal(list.length, 1); assert.equal(isWhitelisted(address.toLowerCase(), list), true); assert.equal(isWhitelisted('0x0000000000000000000000000000000000000001', list), false);
  assert.throws(() => parsePilots({}), /contributors array/);
});
test('wallet actions require pilot state, non-pilots receive a friendly failure', () => {
  assert.equal(requirePilot({ isPilot: true }, 'Claim'), true);
  assert.throws(() => requirePilot({ isPilot: false }, 'Claim'), /Decent Pilots/);
});
test('signed run outbox retries failed sends and removes successful deliveries', async () => {
  const values = new Map(); let fail = true, attempts = 0;
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const outbox = createRunOutbox({ storage, baseUrl: () => 'https://referee.example', fetchImpl: async (url, init) => { attempts++; assert.equal(url, 'https://referee.example/runs'); assert.equal(init.method, 'POST'); return fail ? { ok: false, status: 503 } : { ok: true, json: async () => ({ accepted: true }) }; } });
  assert.equal((await outbox.enqueue({ runHash: '0x1', address })).length, 1);
  assert.equal(JSON.parse(values.get(OUTBOX_KEY)).length, 1);
  fail = false; assert.deepEqual(await outbox.retry(), { sent: true, pending: 0 });
  assert.equal(outbox.read().length, 0); assert.equal(attempts, 2);
});

test('pilot loader prefers raw main then falls back to the local public list', async () => {
  let calls = 0;
  const list = await loadPilots(async () => ++calls === 1 ? { ok: false, status: 404 } : { ok: true, json: async () => ({ contributors: [{ walletAddress: address }] }) });
  assert.equal(calls, 2); assert.equal(list.length, 1);
});
test('flight run hash is computed over the run log for explicit personal signing', () => {
  const runLog = { runId: 'run-1', frames: [] };
  assert.equal(logHash(runLog, { toUtf8Bytes: value => value, keccak256: value => `hash:${value}` }), 'hash:{"frames":[],"runId":"run-1"}');
});

test('voucher reader accepts the referee GET /vouchers response envelope', () => {
  const result = normalizeVouchers({ address, vouchers: [{ kind: 'stamp', voucher: { player: address, level: 2 }, signature: '0xsig' }, { kind: 'prize', voucher: { player: address, tokenId: '70' }, signature: '0xprize' }] });
  assert.equal(result.stamps[0].voucher.level, 2); assert.equal(result.prizes[0].voucher.tokenId, '70'); assert.equal(result.prizes[0].signature, '0xprize');
});

test('pilot flight tickets use the referee seed and MAC without prompting', async () => {
  const calls = [], applied = [], states = [];
  let phase = 'title';
  const game = { state: phase, setNextRunSeed(seed, ticket) { applied.push({ seed, ticket }); } };
  const makeTicket = (id, addr = address) => ({ id, address: addr, seed: id === 'ticket-1' ? 42 : 43, issuedAt: '2026-11-05T00:00:00.000Z', expiresAt: '2026-11-06T00:00:00.000Z' });
  const { createRunTicketManager } = await import('../src/js/pilots/ticket.mjs');
  const manager = createRunTicketManager({
    getGame: () => game, baseUrl: () => 'https://referee.example', now: () => Date.parse('2026-11-05T12:00:00Z'),
    setIntervalImpl: () => 1, clearIntervalImpl: () => {}, onStatus: text => states.push(text),
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      const index = calls.length;
      return { ok: true, json: async () => ({ ticket: makeTicket(`ticket-${index}`), mac: `mac-${index}` }) };
    },
  });
  manager.setPilot({ address, isPilot: true });
  await manager.ensureTicket();
  assert.equal(calls[0].url, 'https://referee.example/tickets');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(calls[0].body, { address });
  assert.deepEqual(applied, [{ seed: 42, ticket: { ticket: makeTicket('ticket-1'), mac: 'mac-1' } }]);

  game.state = 'playing';
  manager.runStarted('run-1');
  await manager.ensureTicket();
  assert.equal(calls.length, 2, 'a new ticket is prefetched after the flight starts');
  assert.equal(applied.length, 1, 'a ticket fetched during play waits for the title screen');
  game.state = 'gameOver';
  await manager.refresh();
  assert.equal(applied[1].seed, 43);
  assert.equal(applied[1].ticket.ticket.id, 'ticket-2');
  game.state = 'title';
  await manager.refresh();
  assert.equal(applied.length, 2, 'game-over restart and title do not duplicate the next ticket');
  assert.ok(states.some(text => text.includes('ready for your next launch')));
  manager.stop();
});

test('tickets reject wrong-wallet and expired responses and refresh for wallet changes', async () => {
  const messages = [], staged = [], secondAddress = '0x405Bb3Cdf23833bb27BAD6629b7cd4f01688235f';
  const { createRunTicketManager } = await import('../src/js/pilots/ticket.mjs');
  let requests = 0;
  const manager = createRunTicketManager({
    getGame: () => ({ state: 'title', setNextRunSeed(seed, ticket) { staged.push({ seed, ticket }); } }), baseUrl: () => 'https://referee.example',
    now: () => Date.parse('2026-11-05T12:00:00Z'), setIntervalImpl: () => 1, clearIntervalImpl: () => {},
    onStatus: text => messages.push(text), fetchImpl: async (_url, init) => {
      requests++;
      const requested = JSON.parse(init.body).address;
      const wrongWallet = requests === 1;
      const expiresAt = requests === 3 ? '2026-11-05T11:00:00Z' : '2026-11-06T00:00:00Z';
      return { ok: true, json: async () => ({ ticket: { id: `ticket-${requests}`, address: wrongWallet ? secondAddress : requested, seed: 1, expiresAt }, mac: 'mac' }) };
    },
  });
  manager.setPilot({ address, isPilot: true });
  await manager.ensureTicket();
  assert.equal(manager.current(), null, 'ticket bound to another wallet is rejected');
  assert.ok(messages.some(text => text.includes('GitHub fallback')));
  manager.setPilot({ address: secondAddress, isPilot: true });
  await manager.ensureTicket();
  assert.equal(manager.current().ticket.address, secondAddress, 'wallet change requests a fresh wallet-bound ticket');
  assert.equal(staged.length, 1);
  manager.runStarted('run-1');
  await manager.ensureTicket();
  assert.equal(manager.current(), null, 'expired ticket is rejected');
  manager.stop();
});
