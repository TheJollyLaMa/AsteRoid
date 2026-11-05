import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ADMIN, isAdmin, adminConfig } from '../src/js/admin/config.mjs';
import { splitMintBatches, buildProducts, parseQueue, verifyContract, reconcileReceipt } from '../src/js/admin/batch.mjs';
import { parseWorkers, loadLedger, assertLegacySupporterRelease } from '../src/js/admin/admin-panel.mjs';
const claim = { schema: 'asteroid-dnft-claim/1', recordId: 'test-L1', tokenURI: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3t67vyk7hedwhkcx7o7a7lbpi', image: 'ipfs://bafybeihs45httneokxvobxm3outngl2w677gssgkjxzklgqxafj32c42pi', claimant: DEFAULT_ADMIN, level: 1, difficulty: 'cadet', completedAt: '2026-11-05T18:00:00Z', requestedAt: '2026-11-05T18:00:01Z', score: { total: 1, level: 1, bonus: 0 } };
test('legacy admin release cannot split an atomic reward bundle', () => {
  assert.doesNotThrow(() => assertLegacySupporterRelease([{ tokenId: '70' }]));
  assert.throws(() => assertLegacySupporterRelease([{ protocol: 'reward-bundle/1', tokenId: '76' }]), /omit signed assets/);
  assert.throws(() => assertLegacySupporterRelease([{ tokenId: '76', bonus: { amount: '100' } }]), /omit signed assets/);
});
test('admin gating is exact, case insensitive and configurable', () => { assert.equal(isAdmin(DEFAULT_ADMIN.toLowerCase()), true); assert.equal(isAdmin(null), false); assert.equal(isAdmin('0x0000000000000000000000000000000000000001'), false); assert.equal(adminConfig({ royaltyFeeBps: 0 }).royaltyFeeBps, 0); });
test('batch splitting is limited to twenty; tuples fix recipient/one-of-one/royalty', () => {
  assert.deepEqual(splitMintBatches(Array.from({ length: 43 }, (_, i) => i)).map(batch => batch.length), [20, 20, 3]);
  for (const size of [0, 21, 1.5]) assert.throws(() => splitMintBatches([], size));
  assert.deepEqual(buildProducts([claim], { adminWallet: DEFAULT_ADMIN })[0], { recipient: claim.claimant, amount: 1, maxSupply: 1, tokenURI: claim.tokenURI, royaltyReceiver: DEFAULT_ADMIN, royaltyFeeBps: 500 });
  assert.throws(() => buildProducts([claim, claim], { adminWallet: DEFAULT_ADMIN }));
  assert.throws(() => buildProducts([claim], { adminWallet: DEFAULT_ADMIN, royaltyFeeBps: 10001 }));
});
test('queues and workers reject malformed/duplicate identities and filter non-whitelisted', () => {
  assert.equal(parseQueue({ pending: [claim], minted: [] }).pending.length, 1);
  assert.throws(() => parseQueue({ pending: [claim], minted: [claim] })); assert.throws(() => parseQueue({ pending: [] }));
  assert.equal(parseWorkers({ contributors: [{ github: 'TheJollyLaMa', walletAddress: DEFAULT_ADMIN, whitelisted: true }, { github: 'other', whitelisted: false }] }).length, 1);
  assert.throws(() => parseWorkers({ contributors: [{ github: '<script>', walletAddress: DEFAULT_ADMIN, whitelisted: true }] }));
});
test('contract verification refuses missing function or role', async () => {
  const provider = { getCode: async () => '0x04491a20' };
  class Contract { hasRole = async () => true; }
  await verifyContract(provider, Contract, adminConfig());
  await assert.rejects(verifyContract({ getCode: async () => '0x' }, Contract, adminConfig()), /Unverified/);
  class NoRole { hasRole = async () => false; }
  await assert.rejects(verifyContract(provider, NoRole, adminConfig()), /lacks/);
});
test('receipt requires exact contract registration and one matching edition', () => {
  const target = adminConfig().contractAddress, product = buildProducts([claim], { adminWallet: DEFAULT_ADMIN })[0];
  const registration = { name: 'TokenRegistered', args: { tokenId: 200n, creator: DEFAULT_ADMIN, kind: 0n, maxSupply: 1n, uri: claim.tokenURI } };
  const edition = { name: 'EditionMinted', args: { tokenId: 200n, to: claim.claimant, minter: DEFAULT_ADMIN, amount: 1n } };
  const contract = { target, interface: { parseLog: log => log.event } }, receipt = { status: 1, logs: [registration, edition].map(event => ({ address: target, event })) };
  assert.deepEqual(reconcileReceipt(receipt, contract, [product], DEFAULT_ADMIN), ['200']);
  assert.throws(() => reconcileReceipt({ ...receipt, status: 0 }, contract, [product], DEFAULT_ADMIN));
  assert.throws(() => reconcileReceipt({ ...receipt, logs: receipt.logs.slice(0, 1) }, contract, [product], DEFAULT_ADMIN));
  assert.throws(() => reconcileReceipt({ ...receipt, logs: [...receipt.logs, receipt.logs[0]] }, contract, [product], DEFAULT_ADMIN));
});
test('ledger fetching falls back without pretending unavailable is an empty queue', async () => {
  let calls = 0;
  assert.deepEqual(await loadLedger('victory-stamps.json', async () => ++calls === 1 ? { ok: false } : { ok: true, json: async () => ({ pending: [], minted: [] }) }), { pending: [], minted: [] });
  assert.equal(calls, 2); await assert.rejects(loadLedger('victory-stamps.json', async () => ({ ok: false })), /unavailable/);
});
