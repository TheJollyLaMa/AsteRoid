'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { Wallet } = require('ethers');
const LegacyGame = require('../legacy/voyager-1.3-mini-emblem/game');
const Game = require('../../src/js/game');
const RULESET = require('../../src/js/ruleset');
const OLD_RULESET = require('../legacy/voyager-1.3-mini-emblem/ruleset');
const { gameForRuleset } = require('../src/replay-rulesets');
const { replayRun } = require('../src/game-adapter');
const { createTicketService, TICKET_TTL_MS } = require('../src/tickets');
const { stableJson, runHash, verifyRun } = require('../src/run-verifier');
const { createService } = require('../src/index');
const { makeVoucherService } = require('../src/vouchers');

const SECRET = 'legacy-fixture-secret-at-least-thirty-two-bytes';
const ADDRESS = '0x0000000000000000000000000000000000000001';
const NOW = Date.UTC(2026, 10, 7, 9, 30);

function oldTicket(address = ADDRESS) {
  const ticket = createTicketService({ secret: SECRET, now: () => NOW }).issue(address).ticket;
  ticket.ruleset = OLD_RULESET;
  return { ticket, mac: `0x${createHmac('sha256', SECRET).update(stableJson(ticket)).digest('hex')}` };
}

test('legacy archive is pinned and keeps old capture and campaign rules', () => {
  const source = readFileSync(require.resolve('../legacy/voyager-1.3-mini-emblem/game'));
  assert.equal(createHash('sha256').update(source).digest('hex'), '12ba23c1d7c35dd92b2f22fe8ee4aad21c4aa07ed6503d92b6736a5b394509ce');
  assert.equal(gameForRuleset(OLD_RULESET), LegacyGame);
  assert.equal(gameForRuleset(RULESET), Game);
  assert.throws(() => gameForRuleset('older-build'), /unsupported older game ruleset/);
  const game = new LegacyGame({ seed: 44 });
  game.setPilot({ address: ADDRESS, isPilot: true });
  game.startCampaign(1, 'pilot');
  game.startLevel(game.sector2Level);
  for (const guard of [...game.vault.guards]) game.destroyAsteroid(guard, false);
  game.captureVault();
  assert.equal(game.getProgress('pilot').sector2Unlocked, true);
  assert.equal(game.getProgress('pilot').unlocked, 11);
  assert.equal(game.runCaptures.length, 1);
  game.startLevel(10);
  game.completeLevel();
  assert.equal(game.state, 'warping');
  const missed = new LegacyGame({ seed: 44 });
  missed.startCampaign(10, 'pilot');
  missed.completeLevel();
  assert.equal(missed.state, 'victory');
});

test('legacy tickets retain exact ruleset, MAC, seed, wallet, expiry and single-use checks', () => {
  let now = NOW;
  const service = createTicketService({ secret: SECRET, now: () => now });
  const ticket = oldTicket();
  const run = { ruleset: OLD_RULESET, seed: ticket.ticket.seed, ticket, runId: 'old-flight' };
  const verify = candidate => service.verify({ address: ADDRESS, run: candidate });
  const verified = verify(run);
  assert.equal(verified.ticket.ruleset, OLD_RULESET);
  assert.equal(service.issue(ADDRESS).ticket.ruleset, RULESET);
  assert.throws(() => verify({ ...run, ruleset: RULESET }), /ruleset does not match/);
  assert.throws(() => verify({ ...run, ruleset: 'older-build' }), /older game ruleset/);
  assert.throws(() => verify({ ...run, seed: run.seed ^ 1 }), /seed does not match/);
  assert.throws(() => verify({ ...run, ticket: { ...ticket, mac: `0x${'0'.repeat(64)}` } }), /MAC is invalid/);
  assert.throws(() => service.verify({ address: '0x0000000000000000000000000000000000000002', run }), /address does not match/);
  const used = new Map();
  service.consume(verified, run, 'signed-hash', used);
  assert.throws(() => service.verify({ address: ADDRESS, run: { ...run, runId: 'another-flight' }, usedTickets: used }), /already been used/);
  now += TICKET_TTL_MS;
  assert.throws(() => verify(run), /expired/);
});

test('real legacy input logs replay and verify unchanged; forged captures are rejected', async () => {
  const wallet = Wallet.createRandom();
  const game = new LegacyGame({ seed: 44, now: () => NOW });
  game.setPilot({ address: wallet.address, isPilot: true });
  game.startCampaign(1, 'pilot');
  for (let frame = 0; frame < 240; frame++) game.step([{ right: frame < 120, fire: true }]);
  const run = game.getRunLog();
  assert.equal(run.ruleset, OLD_RULESET);
  assert.deepEqual(replayRun(run), game.summary());
  const verified = await verifyRun({ run, address: wallet.address, signature: await wallet.signMessage(runHash(run)), isPilot: async () => true });
  assert.deepEqual(verified.result, game.summary());
  const forged = { ...run, result: { ...game.summary(), captures: [{ tier: 1, prize: { tokenId: 70, project: 'DecentHead' } }] } };
  await assert.rejects(verifyRun({ run: forged, address: wallet.address, signature: await wallet.signMessage(runHash(forged)), isPilot: async () => true }), /Replay result does not match/);
});

test('previous-release signed ticket reaches funded prize issuance through HTTP, never a transfer', async t => {
  const wallet = Wallet.createRandom();
  const queued = [];
  const result = { records: [{ id: 'legacy-level-9', level: 9, difficulty: 'pilot' }], captures: [{ tier: 1, level: 9, prize: { tokenId: 70, project: 'DecentHead' } }], survivors: 1 };
  const service = createService({
    now: () => NOW,
    env: { TICKET_SECRET: SECRET },
    pilotRegistry: { isPilot: async () => true },
    vouchers: makeVoucherService({
      privateKey: Wallet.createRandom().privateKey, chainId: 8453,
      stampsAddress: '0x0000000000000000000000000000000000000002',
      prizesAddress: '0x0000000000000000000000000000000000000003',
      rewardsAddress: '0x0000000000000000000000000000000000000004',
      nftAddress: '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B'
    }),
    rewardInventory: { read: async () => ({ stock: 1, claimed: false }) },
    queues: { append: async (kind, item) => { queued.push({ kind, item }); return { status: 'queued' }; }, read: async () => ({ pending: [] }) },
    pinata: { pinRecord: async () => { throw new Error('No stamp expected for a level-9 capture'); } },
    replay: async run => { assert.equal(gameForRuleset(run.ruleset), LegacyGame); return result; }
  });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => service.server.close(resolve)));
  const ticket = oldTicket(wallet.address);
  const run = { runId: 'legacy-capture-flight', ruleset: OLD_RULESET, seed: ticket.ticket.seed, ticket,
    startLevel: 1, players: 1, difficulty: 'pilot', frames: [[{}]], pilot: { address: wallet.address, isPilot: true }, result };
  const response = await fetch(`http://127.0.0.1:${service.server.address().port}/runs`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: wallet.address, run, signature: await wallet.signMessage(runHash(run)) })
  });
  const payload = await response.json();
  assert.equal(response.status, 201, payload.error);
  assert.equal(payload.vouchers.length, 1);
  assert.equal(payload.vouchers[0].kind, 'prize');
  assert.equal(payload.vouchers[0].tokenId, '70');
  assert.equal(queued.length, 1);
  assert.equal(queued[0].kind, 'prizes');
});
