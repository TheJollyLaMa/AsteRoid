import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWalletLaunch } from '../src/js/shell/launch-reminder.mjs';
import { mountPilots } from '../src/js/pilots/whitelist.mjs';

const address = '0x0000000000000000000000000000000000000001';
const fixture = () => {
  const calls = [];
  const state = { connected: true, address };
  return {
    calls, state,
    wallet: { snapshot: () => ({ ...state }) },
    pilots: { refresh: async value => { calls.push('pilot'); return { address: value.address, isPilot: true }; } },
    tickets: { ensureTicket: async () => { calls.push('ticket'); return { ticket: { address } }; } },
    difficulty: 'pilot'
  };
};

test('reward launch waits for eligibility, then the referee ticket', async () => {
  const input = fixture();
  let finish;
  input.pilots.refresh = () => new Promise(resolve => { finish = resolve; });
  const preparation = prepareWalletLaunch(input);
  assert.deepEqual(input.calls, []);
  finish({ address, isPilot: true });
  assert.deepEqual(await preparation, { address, isPilot: true });
  assert.deepEqual(input.calls, ['ticket']);
});

test('disconnected and non-Pilot wallets cannot silently start a reward flight', async () => {
  const input = fixture();
  input.state.connected = false;
  await assert.rejects(prepareWalletLaunch(input), /Connect your wallet/);
  input.state.connected = true;
  input.pilots.refresh = async () => ({ address, isPilot: false });
  await assert.rejects(prepareWalletLaunch(input), /free 10-level voyage/);
  assert.deepEqual(input.calls, []);
});

test('ticket failure and wallet changes keep reward launch blocked', async () => {
  const input = fixture();
  input.tickets.ensureTicket = async () => null;
  await assert.rejects(prepareWalletLaunch(input), /ticket is not ready/);
  input.tickets.ensureTicket = async () => { input.state.connected = false; return {}; };
  await assert.rejects(prepareWalletLaunch(input), /Wallet changed/);
});

test('Cadet practice checks wallet eligibility but does not require a reward ticket', async () => {
  const input = fixture();
  input.difficulty = 'cadet';
  await prepareWalletLaunch(input);
  assert.deepEqual(input.calls, ['pilot']);
});

test('Pilot refresh waits for the contributor list instead of dispatching a premature denial', async () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const events = [];
  globalThis.window = new EventTarget();
  globalThis.document = { getElementById: () => null };
  window.addEventListener('voyager:pilot', event => events.push(event.detail));
  let finish;
  const controller = mountPilots({
    fetchImpl: () => new Promise(resolve => { finish = resolve; }),
    readOnChain: async () => true
  });
  try {
    const first = controller.refresh({ connected: true, address });
    const second = controller.refresh({ connected: true, address });
    assert.deepEqual(events, []);
    finish({ ok: true, json: async () => ({ contributors: [{ walletAddress: address }] }) });
    assert.equal((await first).isPilot, true);
    assert.equal((await second).isPilot, true);
    assert.ok(events.every(event => event.isPilot));
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
