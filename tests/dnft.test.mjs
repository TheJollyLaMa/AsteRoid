import test from 'node:test';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { buildMetadata, buildClaim } from '../src/js/dnft/metadata.mjs';
import { validateClaim, parseClaimBody, appendClaim, assertJsonSafe } from '../src/js/dnft/validation.mjs';
import { VictoryVault } from '../src/js/dnft/vault.mjs';
import { pinFile, gatewayUrl, canvasBlob } from '../src/js/dnft/pin.mjs';
import { issueUrl } from '../src/js/dnft/claims.mjs';
const wallet = '0x807061DF657A7697c04045dA7d16D941861cAABc';
const image = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3t67vyk7hedwhkcx7o7a7lbpi';
const tokenURI = 'ipfs://bafybeihs45httneokxvobxm3outngl2w677gssgkjxzklgqxafj32c42pi';
function record() { return { schema: 'asteroid-level-record/1', id: '2026-11-05-ace-L3-1', game: 'AsteRoid: Galactic Gauntlet', gameVersion: '2.0.0', level: 3, levelName: 'Pebble Lanes', difficulty: 'ace', difficultyLabel: 'Ace', seed: 42, completedAt: '2026-11-05T18:00:00.000Z', startedAt: '2026-11-05T17:59:00.000Z', durationSec: 60, score: { total: 600, level: 450, bonus: 150 }, ship: { livesRemaining: 2, livesLost: 1, finalPower: 80, finalWeapon: { type: 'plasma', tier: 2 }, view: 'pov' }, stats: { shotsFired: 100, shotsByWeapon: { blaster: 10, spread: 20, rapid: 30, plasma: 40 }, hits: 70, accuracy: .7, asteroidsSpawned: 60, asteroidsDestroyed: 55, asteroidsMissed: 5, shootersDestroyed: 2, fragmentsDestroyed: 10, enemyShotsFired: 20, enemyShotsDodged: 19, hitsTaken: 1, collisions: 0, shieldBlocks: 2, damageTaken: 20, pickupsCollected: { spread: 1, rapid: 2, plasma: 3, power: 1, shield: 1 }, pickupsMissed: 0, maxCombo: 12, timeInPov: 20, timeInOverview: 40, closestCall: null, futureStat: 42 }, battleLog: { levelLength: 1000, worldWidth: 800, path: [[1, 2]], kills: [], hitsTaken: [], pickups: [], misses: [] } }; }
function claim() { return buildClaim(record(), { tokenURI, image, claimant: wallet, requestedAt: '2026-11-05T18:00:01.000Z' }); }
test('metadata flattens every stat, ship and score, preserves raw JSON and date', () => {
  const input = record(), metadata = buildMetadata(input, { image, claimant: wallet });
  assert.equal(metadata.name, 'Decent Voyager Victory · L3 Pebble Lanes · Ace');
  assert.equal(metadata.external_url, 'https://thejollylama.github.io/DecentVoyager/');
  const attrs = new Map(metadata.attributes.map(item => [item.trait_type, item]));
  function check(value, prefix) { for (const [key, item] of Object.entries(value)) { const path = `${prefix}.${key}`; if (item !== null && typeof item === 'object') check(item, path); else assert.equal(attrs.get(path)?.value, item === null ? 'Unavailable' : item); } }
  for (const key of ['stats', 'ship', 'score']) check(input[key], key);
  assert.equal(attrs.get('completedAt').display_type, 'date'); assert.equal(attrs.get('completedAt').value, Date.parse(input.completedAt) / 1000);
  assert.equal(metadata.properties.chain, 'base'); assert.equal(metadata.properties.claimant, wallet);
  assert.deepEqual(metadata.properties.record, input); assert.deepEqual(JSON.parse(JSON.stringify(metadata)).properties.record, input);
  input.stats.hits = 1; assert.equal(metadata.properties.record.stats.hits, 70);
});
test('metadata and claims reject unsafe data, invalid wallet, missing pin', () => {
  for (const bad of [NaN, Infinity, undefined, 1n, () => {}]) assert.throws(() => assertJsonSafe({ bad }));
  const cyclic = {}; cyclic.self = cyclic; assert.throws(() => assertJsonSafe(cyclic));
  assert.throws(() => buildMetadata(record(), { image, claimant: '' }));
  assert.throws(() => buildMetadata(record(), { image: 'https://bad', claimant: wallet }));
});
test('claim validation is strict and strips untrusted extras', () => {
  const input = claim(); assert.deepEqual(validateClaim(input), input);
  for (const patch of [{ schema: 'x' }, { tokenURI: 'https://bad' }, { image: 'ipfs://../bad' }, { claimant: `0x${'0'.repeat(40)}` }, { level: 0 }, { level: 11 }, { difficulty: 'easy' }, { completedAt: 'never' }, { requestedAt: '2020-01-01T00:00:00Z' }, { score: { total: -1, level: 0, bonus: 0 } }]) assert.throws(() => validateClaim({ ...input, ...patch }));
  assert.equal(validateClaim({ ...input, command: 'danger' }).command, undefined);
});
test('issue parser accepts form/plain/fence and rejects ambiguous or executable text', () => {
  const json = JSON.stringify(claim());
  for (const body of [json, `### Claim JSON\n\n\`\`\`json\n${json}\n\`\`\``, `### Claim JSON\n\n${json}`]) assert.deepEqual(parseClaimBody(body), claim());
  assert.throws(() => parseClaimBody('console.log("bad")'));
  assert.throws(() => parseClaimBody(`\`\`\`json\n${json}\n\`\`\`\n\`\`\`json\n${JSON.stringify({ ...claim(), recordId: 'other' })}\n\`\`\``));
  const url = new URL(issueUrl(claim())); assert.equal(url.pathname, '/TheJollyLaMa/DecentVoyager/issues/new'); assert.equal(url.searchParams.get('claim'), JSON.stringify(claim(), null, 2)); assert.equal(url.searchParams.get('template'), 'victory-stamp.yml');
});
test('queue append dedupes record and token URI across pending/minted', () => {
  const initial = { pending: [], minted: [] }, first = appendClaim(initial, claim(), { number: 12, url: 'https://github.com/TheJollyLaMa/AsteRoid/issues/12' });
  assert.equal(first.added, true); assert.equal(initial.pending.length, 0); assert.equal(first.queue.pending[0].issueNumber, 12);
  assert.equal(appendClaim(first.queue, claim()).added, false);
  assert.equal(appendClaim(first.queue, { ...claim(), recordId: 'other' }).added, false);
  assert.equal(appendClaim({ pending: [], minted: first.queue.pending }, claim()).added, false);
});
test('vault merges restored records while retaining pin/request status durably', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const vault = new VictoryVault(storage); vault.merge([record(), record()]); assert.equal(vault.entries.length, 1);
  vault.merge([{ schema: 'asteroid-level-record/1', id: 'broken' }]); assert.equal(vault.entries.length, 1);
  vault.update(record().id, { status: 'requested', tokenURI }); vault.merge([record()]);
  assert.equal(new VictoryVault(storage).entries[0].status, 'requested');
  const bad = new VictoryVault({ getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } }); bad.merge([record()]); assert.match(bad.error, /unavailable/); assert.equal(bad.entries.length, 1);
});
test('pin uses visitor Pinata headers or Kubo add and validates returned CID', async () => {
  const cid = image.slice(7), file = new Blob(['png'], { type: 'image/png' }); let seen;
  const pinata = { provider: 'pinata', options: { pinata: { uploadUrl: 'https://pin.example/file' } }, headers: () => ({ Authorization: 'Bearer visitor-session' }) };
  assert.equal(await pinFile(pinata, file, 'battle.png', async (url, options) => { seen = { url, options }; return { ok: true, json: async () => ({ IpfsHash: cid }) }; }), image);
  assert.equal(seen.options.headers.Authorization, 'Bearer visitor-session'); assert.equal(seen.options.body.get('file').name, 'battle.png');
  const kubo = { provider: 'local', options: { local: { apiUrl: 'http://127.0.0.1:5001/' } }, headers() { throw Error('must not use Pinata credentials'); } };
  await pinFile(kubo, file, 'battle.png', async (url, options) => { assert.equal(url, 'http://127.0.0.1:5001/api/v0/add?pin=true'); assert.equal(options.headers, undefined); return { ok: true, text: async () => JSON.stringify({ Hash: cid }) + '\n' }; });
  await assert.rejects(pinFile(pinata, file, 'battle.png', async () => ({ ok: true, json: async () => ({ IpfsHash: 'bad' }) })), /invalid CID/);
  assert.equal(gatewayUrl('ipfs://../bad'), ''); assert.equal(gatewayUrl(image, 'javascript:bad'), '');
  assert.throws(() => canvasBlob({}), /unavailable/);
});

test('receiving game actual levelRecord passes vault, metadata, claim and queue boundaries', () => {
  const Game = createRequire(import.meta.url)('../src/js/game.js');
  let clock = Date.parse('2026-11-05T12:00:00Z');
  const game = new Game({ now: () => (clock += 1000) });
  game.selectedDifficulty = 'ace'; game.startCampaign(3); game.asteroids = []; game.pickups = [];
  game.update(.016, { fire: true }); game.scrollY = game.level.length; game.update(.016, {});
  const emitted = game.drainEvents().find(event => event.type === 'levelRecord'); assert.ok(emitted);
  const vault = new VictoryVault({ getItem: () => null, setItem() {} }); vault.merge(game.getWinRecords());
  assert.equal(vault.entries[0].record.id, emitted.record.id);
  const metadata = buildMetadata(emitted.record, { image, claimant: wallet });
  assert.equal(metadata.properties.record.stats.shotsFired, emitted.record.stats.shotsFired);
  assert.equal(metadata.properties.record.difficulty, 'ace');
  const request = buildClaim(emitted.record, { tokenURI, image, claimant: wallet, requestedAt: '2026-11-05T18:00:00Z' });
  assert.equal(appendClaim({ pending: [], minted: [] }, request).added, true);
});
