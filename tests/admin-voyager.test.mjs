import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingCounts, waitingTotal } from '../src/js/admin/pending.mjs';
import { createEnsCache } from '../src/js/admin/ens-cache.mjs';
const addr = '0x807061DF657A7697c04045dA7d16D941861cAABc';
test('admin pending badges count stamps, supporter prizes, and arena entries', () => {
  const counts = pendingCounts({ stamps: { pending: [{}, {}] }, payroll: { pending: [{ kind: 'supporter-prize' }, { kind: 'bounty' }] }, arena: { pending: [{}] } });
  assert.deepEqual(counts, { stamps: 2, prizes: 1, payroll: 2, arena: 1 }); assert.equal(waitingTotal(counts), 4);
});
test('ENS names and avatars are cached and failures gracefully fall back', async () => {
  const records = new Map(), storage = { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) };
  let names = 0, avatars = 0;
  const ens = createEnsCache({ storage, lookupName: async () => { names++; return 'pilot.eth'; }, lookupAvatar: async () => { avatars++; return 'https://avatar.example/p.png'; } });
  assert.deepEqual(await ens.resolve(addr), { name: 'pilot.eth', avatar: 'https://avatar.example/p.png' });
  assert.deepEqual(await ens.resolve(addr.toLowerCase()), { name: 'pilot.eth', avatar: 'https://avatar.example/p.png' });
  assert.equal(names, 1); assert.equal(avatars, 1);
  const failed = createEnsCache({ lookupName: async () => { throw Error('RPC down'); } });
  assert.deepEqual(await failed.resolve(addr), { name: null, avatar: null });
});
