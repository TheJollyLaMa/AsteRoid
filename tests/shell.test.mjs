import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import vm from 'node:vm';
import { createSaveService, CID_KEY, validCID, validateSnapshot } from '../src/js/shell/ipfs-save.mjs';
import { ABOUT } from '../src/js/shell/about-modal.mjs';
import { parseInvites } from '../src/js/arena/lobby.mjs';

const cid = 'bafybeiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const fixture = (overrides = {}) => {
  const records = new Map();
  const calls = [];
  const snapshot = { schema:'asteroid-save/1', progress:{ level:3 }, records:[] };
  const game = { exportSave:() => snapshot, importSave:value => { calls.push(['import',value]); } };
  const session = { upload:async value => { calls.push(['upload',value]); return cid; }, restore:async value => { calls.push(['restore',value]); return snapshot; } };
  const storage = { getItem:key => records.get(key), setItem:(key,value) => records.set(key,value) };
  const service = createSaveService({ getGame:() => game, getSession:() => session, storage, redraw:() => calls.push(['draw']), ...overrides });
  return { service, game, session, storage, calls, snapshot };
};
test('save exports only core progress and remembers a validated receipt CID', async () => {
  const { service, calls, storage, snapshot } = fixture();
  assert.equal(service.available(),true);
  await assert.rejects(service.save(),/Confirm/);
  assert.equal(calls.length,0);
  assert.deepEqual(await service.save({ consent:true }),{ cid, remembered:true });
  assert.deepEqual(calls,[['upload',snapshot]]);
  assert.equal(storage.getItem(CID_KEY),cid);
  assert.equal(service.lastCID(),cid);
});
test('restore requires consent and a CID, validates JSON then delegates core validation', async () => {
  const { service, calls, game, snapshot } = fixture();
  await assert.rejects(service.restore(cid),/Confirm/);
  await assert.rejects(service.restore('https://ipfs.io/ipfs/'+cid,{ consent:true }),/valid IPFS CID/);
  assert.equal(calls.length,0);
  assert.deepEqual(await service.restore(` ${cid} `,{ consent:true }),{ cid });
  assert.deepEqual(calls,[['restore',cid],['import',snapshot],['draw']]);
  game.importSave = () => { throw new Error('Unsupported save schema'); };
  await assert.rejects(service.restore(cid,{ consent:true }),/Unsupported save schema/);
});
test('missing game or provider APIs fail clearly without network or success', async () => {
  const { service } = fixture({ getGame:() => null });
  assert.equal(service.available(),false);
  await assert.rejects(service.save({ consent:true }),/unavailable/);
  const absent = fixture({ getSession:() => null }).service;
  assert.equal(absent.available(),false);
  await assert.rejects(absent.restore(cid,{ consent:true }),/session is unavailable/);
});
test('invalid receipts and imported values cannot overwrite CID memory', async () => {
  const { service, session, storage, calls } = fixture();
  storage.setItem(CID_KEY,cid);
  session.upload = async () => 'bad';
  await assert.rejects(service.save({ consent:true }),/invalid CID/);
  assert.equal(service.lastCID(),cid);
  session.restore = async () => [];
  await assert.rejects(service.restore(cid,{ consent:true }),/JSON object/);
  assert.equal(calls.length,0);
});
test('browser storage failure retains a copyable CID and operations are locked', async () => {
  const { service, session } = fixture({ storage:{ getItem:() => { throw Error('blocked'); }, setItem:() => { throw Error('quota'); } } });
  assert.equal(service.lastCID(),'');
  assert.deepEqual(await service.save({ consent:true }),{ cid, remembered:false });
  let finish;
  session.upload = () => new Promise(resolve => { finish=resolve; });
  const pending = service.save({ consent:true });
  await Promise.resolve();
  await assert.rejects(service.restore(cid,{ consent:true }),/already running/);
  finish(cid); await pending;
});
test('snapshot boundary rejects non-object, cyclic and excessive progress', () => {
  for (const value of [null, [], 'save', 42]) assert.throws(() => validateSnapshot(value),/JSON object/);
  const cyclic={}; cyclic.self=cyclic;
  assert.throws(() => validateSnapshot(cyclic),/JSON-safe/);
  assert.throws(() => validateSnapshot({ data:'x'.repeat(4*1024*1024) }),/4 MB/);
  assert.equal(validCID('b'+'a'.repeat(200)),false);
});
test('header config is public Base-only with HTTPS project links and small local art', () => {
  const source=readFileSync(new URL('../src/decent-head.config.js',import.meta.url),'utf8');
  const context={ window:{} }; vm.runInNewContext(source,context);
  const config=context.window.DECENT_CONFIG;
  assert.equal(config.appName,'Decent Voyager'); assert.equal(config.chain.chainId,8453); assert.equal(config.voyager.chainId,8453); assert.equal(config.voyager.testnetChainId,84532);
  assert.equal(config.providers.default,'pinata'); assert.equal(config.ens.enabled,true);
  const supporter=config.supporterDnft;
  assert.equal(supporter.contract,'0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B'); assert.equal(supporter.tokenId,'80'); assert.equal(supporter.listingId,'19');
  assert.equal(supporter.escrowAddress,'0x31b07b83e99A9bdF379bf40225b8A80d3804C89d'); assert.equal(supporter.chain.chainId,8453); assert.equal(supporter.expectedPriceAmount,'10000000');
  assert.match(supporter.marketUrl,/^https:\/\//);
  assert.ok(statSync(new URL(`../src/assets/${supporter.image}`,import.meta.url)).size<=250000);
  for (const link of [...config.links,...config.relatedDapps]) assert.match(link.url,/^https:\/\//);
  assert.ok([...config.links,...config.relatedDapps].filter(link => /canopy|ecosystem/i.test(link.label)).every(link => link.url === 'https://thejollylama.github.io/DecentCanopy/'));
  assert.equal(config.about.sections,undefined);
  assert.equal(config.art.titleIcon,'./assets/brand/voyager-disc.png');
  assert.doesNotMatch(source,/\b(jwt|apiKey|apiSecret|privateKey)\s*:/);
  assert.ok(statSync(new URL('../src/assets/brand/voyager-disc.png',import.meta.url)).size<=100000);
});
test('static shell preserves bundle/canvas and host-module ordering for relative deployment', () => {
  const html=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
  assert.match(html,/<canvas id="gameCanvas" width="800" height="600"/);
  assert.ok(html.indexOf('decent-head.config.js')<html.indexOf('js/shell/main.mjs'));
  for (const path of ['js/dnft/claims.mjs','js/admin/admin-panel.mjs']) assert.ok(html.indexOf('bundle.js')<html.indexOf(path));
  assert.match(html, /Decent Voyager/);
  assert.match(html, /href="https:\/\/thejollylama.github.io\/DecentCanopy\/">Decent ecosystem/);
  assert.match(html, /id="diagnostic-download"/);
  for (const path of ['js/pilots/whitelist.mjs','js/pilots/flight-log.mjs','js/arena/lobby.mjs']) assert.ok(html.includes(path));
  assert.doesNotMatch(html,/(?:src|href)="\/(?!\/)/);
});

test('about content covers rewards, tutorials and the multiplayer walkthrough without dropdowns', () => {
  const source=readFileSync(new URL('../src/js/shell/about-modal.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/<details/);
  for (const title of ['Level 20 achievement NFT','Guarded Supporter pickups','Marathon and Perfect awards','Sector II · Far Future','Arena pot']) assert.ok(ABOUT.rewards.some(item => item.title===title));
  assert.ok(ABOUT.couch.length>=3); assert.ok(ABOUT.online.length>=5);
  assert.match(source,/Coming soon/); assert.match(source,/purchaseWithToken/);
  assert.match(ABOUT.recovery, /Online rounds continue/);
  assert.match(ABOUT.diagnostics, /Nothing is sent automatically/);
  assert.match(ABOUT.recovery, /bounded, reusable caches/);
  assert.match(ABOUT.diagnostics, /not measurements of actual GPU memory/);
  const html=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('about-modal.mjs')<html.indexOf('js/shell/main.mjs'));
  assert.doesNotMatch(html,/flight-note|pilot-rewards|No wallet needed to fly/);
  assert.match(html,/class="site-header"[\s\S]*id="dbusk-radio"[\s\S]*<main/);
});
test('arena invites accept up to four addresses or ENS names', () => {
  const a='0x'+'a'.repeat(40);
  assert.deepEqual(parseInvites(`${a}\nfriend.eth, ${a.toUpperCase().replace('0X','0x')}`),[a,'friend.eth']);
  assert.throws(() => parseInvites('not-a-wallet'),/not a wallet/);
  assert.throws(() => parseInvites(['a','b','c','d','e'].map(x => `${x}.eth`).join(' ')),/up to four/);
});
