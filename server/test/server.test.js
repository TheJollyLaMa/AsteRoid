'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Wallet, TypedDataEncoder, verifyTypedData, keccak256, concat, zeroPadValue } = require('ethers');
const Game = require('../../src/js/game.js');
const { TYPES, DOMAIN } = require('../src/eip712');
const { verifyRun, runHash } = require('../src/run-verifier');
const { createService } = require('../src/index');
const { createQueueWriter } = require('../src/queue-writer');
const { LobbyManager } = require('../src/arena');
const { hashSortedSurvivors, makeVoucherService, sortAddresses } = require('../src/vouchers');
const { createArenaGame, getFrameCount, replayRun } = require('../src/game-adapter');
let inputLog = null;
try { inputLog = require('../../src/js/inputlog.js'); } catch { /* Core input-log helper has not landed yet. */ }

const REFEREE_CONTRACTS = {
  arenaAddress: '0x0000000000000000000000000000000000000001',
  stampsAddress: '0x0000000000000000000000000000000000000002',
  prizesAddress: '0x0000000000000000000000000000000000000003',
  rewardsAddress: '0x0000000000000000000000000000000000000004',
  nftAddress: '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B'
};

function sampleRun(overrides = {}) {
  return {
    runId: 'test-run-1', ruleset: require('../../src/js/ruleset'), seed: 777, difficulty: 'cadet', startLevel: 1,
    players: 1, pilot: { address: '0x0000000000000000000000000000000000000001', isPilot: true },
    frames: [[{}]], ...overrides
  };
}

function sampleResult() {
  return {
    records: [{ id: 'win-1', level: 1, difficulty: 'cadet', score: { total: 25 } }],
    captures: [], survivors: []
  };
}

test('voucher signature recovers the referee address and EIP-712 digest matches ethers', async () => {
  const referee = Wallet.createRandom();
  const vouchers = makeVoucherService({
    privateKey: referee.privateKey, chainId: 84532, ...REFEREE_CONTRACTS
  });
  const record = { id: 'record-1', level: 3, difficulty: 'pilot' };
  const issued = await vouchers.stamp({
    player: Wallet.createRandom().address, record, metadataURI: 'ipfs://metadata', deadline: 2_000_000_000
  });
  const expectedDomain = { ...DOMAIN, chainId: 84532, verifyingContract: REFEREE_CONTRACTS.stampsAddress };
  const expectedDigest = TypedDataEncoder.hash(expectedDomain, { StampVoucher: TYPES.StampVoucher }, issued.value);
  assert.equal(issued.digest, expectedDigest);
  assert.equal(verifyTypedData(expectedDomain, { StampVoucher: TYPES.StampVoucher }, issued.value, issued.signature), referee.address);
  assert.equal(issued.domain.verifyingContract, REFEREE_CONTRACTS.stampsAddress);
  const prize = await vouchers.prize({
    player: Wallet.createRandom().address, nftContract: REFEREE_CONTRACTS.nftAddress,
    tokenId: 70, tier: 1, runId: 'run-for-prize', deadline: 2_000_000_000
  });
  const prizeDomain = { ...DOMAIN, chainId: 84532, verifyingContract: REFEREE_CONTRACTS.prizesAddress };
  assert.equal(prize.digest, TypedDataEncoder.hash(prizeDomain, { PrizeVoucher: TYPES.PrizeVoucher }, prize.value));
  assert.equal(verifyTypedData(prizeDomain, { PrizeVoucher: TYPES.PrizeVoucher }, prize.value, prize.signature), referee.address);
});

test('run replay accepts matching summary and rejects tampering', async () => {
  const player = Wallet.createRandom();
  const result = sampleResult();
  const run = sampleRun({ pilot: { address: player.address, isPilot: true }, result });
  const signature = await player.signMessage(runHash(run));
  const verified = await verifyRun({ run, address: player.address, signature, isPilot: async () => true, replay: async () => result });
  assert.equal(verified.player, player.address.toLowerCase());
  assert.equal(verified.result, result);

  const tampered = sampleRun({ pilot: { address: player.address, isPilot: true }, result: { ...result, records: [{ id: 'forged', level: 1, difficulty: 'cadet' }] } });
  const tamperedSig = await player.signMessage(runHash(tampered));
  await assert.rejects(verifyRun({ run: tampered, address: player.address, signature: tamperedSig, isPilot: async () => true, replay: async () => result }), /Replay result does not match/);
});

test('runId is idempotent and non-pilots are rejected by HTTP', async (t) => {
  const player = Wallet.createRandom();
  const referee = Wallet.createRandom();
  const vouchers = makeVoucherService({ privateKey: referee.privateKey, chainId: 84532, ...REFEREE_CONTRACTS });
  const queued = [];
  let replayCalls = 0;
  const service = createService({
    env: { CHAIN_ID: '84532', ...REFEREE_CONTRACTS, CORS_ORIGINS: 'http://localhost:8907' },
    pilotRegistry: { isPilot: async (address) => address.toLowerCase() === player.address.toLowerCase(), isAdmin: async () => false },
    vouchers,
    rewardInventory: { async read() { return { stock: 100, claimed: false }; } },
    queues: {
      async append(kind, item) { queued.push({ kind, item }); return { status: 'queued' }; },
      async read() { return { pending: [] }; }
    },
    pinata: { async pinRecord() { return { status: 'skipped', reason: 'test', metadataURI: '', imageURI: '' }; } },
    replay: async () => { replayCalls += 1; return { ...sampleResult(), captures: [{ tier: 1, level: 1, prize: { project: 'DecentHead', tokenId: 70, label: 'DecentHead v2.0.0 #70' } }, { tier: 2, level: 1, prize: { project: 'DecentCanopy', tokenId: 79, label: 'DecentCanopy v0.1.0 #79' } }] }; }
  });
  await new Promise((resolve) => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => service.server.close(resolve)));
  const url = `http://127.0.0.1:${service.server.address().port}`;
  const ticket = service.ticketService.issue(player.address);
  const run = sampleRun({ difficulty: 'pilot', pilot: { address: player.address, isPilot: true }, seed: ticket.ticket.seed, ticket });
  const signature = await player.signMessage(runHash(run));
  const request = () => fetch(`${url}/runs`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: player.address, run, signature })
  });
  const first = await request();
  const firstBody = await first.json();
  assert.equal(first.status, 201);
  const duplicate = await request();
  const duplicateBody = await duplicate.json();
  assert.equal(duplicate.status, 200);
  assert.equal(duplicateBody.idempotent, true);
  assert.equal(replayCalls, 1);
  assert.equal(queued.length, 3);
  assert.deepEqual(queued.map((entry) => entry.kind).sort(), ['prizes', 'prizes', 'stamps']);
  assert.equal(firstBody.vouchers.length, 3);
  const prizeRunIds = firstBody.vouchers.filter((v) => v.kind === 'prize').map((v) => v.voucher.claimId);
  assert.equal(new Set(prizeRunIds).size, 2, 'each capture is independently claimable on VoyagerPrizes');
  assert.equal(firstBody.pinning[0].status, 'skipped');
  const fetchedVouchers = await fetch(`${url}/vouchers/${player.address}`);
  assert.equal((await fetchedVouchers.json()).vouchers.length, 3);

  const nonPilot = Wallet.createRandom();
  const deniedRun = sampleRun({ runId: 'non-pilot-run' });
  const deniedSignature = await nonPilot.signMessage(runHash(deniedRun));
  const denied = await fetch(`${url}/runs`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: nonPilot.address, run: deniedRun, signature: deniedSignature })
  });
  assert.equal(denied.status, 401);
  assert.match((await denied.json()).error, /not a Decent Pilot/);
});



test('flight tickets are pilot-only, signed, seed-bound, expiring, and single use', async (t) => {
  const pilot = Wallet.createRandom();
  const secondPilot = Wallet.createRandom();
  const nonPilot = Wallet.createRandom();
  const issuedAt = Date.UTC(2026, 10, 5, 12, 0, 0);
  let now = issuedAt;
  const service = createService({
    now: () => now,
    env: { TICKET_SECRET: 'test-secret-with-at-least-thirty-two-bytes!', CORS_ORIGINS: 'http://localhost:8907' },
    pilotRegistry: { isPilot: async (address) => [pilot, secondPilot].some((entry) => entry.address.toLowerCase() === address.toLowerCase()) },
    queues: { async append() { return { status: 'queued' }; }, async read() { return { pending: [] }; } },
    pinata: { async pinRecord() { return { status: 'skipped', metadataURI: '', imageURI: '' }; } },
    replay: async () => ({ records: [], captures: [], survivors: [] })
  });
  await new Promise((resolve) => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => service.server.close(resolve)));
  const url = `http://127.0.0.1:${service.server.address().port}`;
  const issue = async (address) => {
    const response = await fetch(`${url}/tickets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }) });
    return { response, body: await response.json() };
  };
  const playerRunRequest = async (wallet, run) => fetch(`${url}/runs`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: wallet.address, run, signature: await wallet.signMessage(runHash(run)) })
  });

  const firstTicket = await issue(pilot.address);
  assert.equal(firstTicket.response.status, 201);
  assert.equal(firstTicket.body.ticket.address, pilot.address);
  assert.ok(Number.isInteger(firstTicket.body.ticket.seed) && firstTicket.body.ticket.seed >= 0 && firstTicket.body.ticket.seed <= 0xffffffff);
  assert.equal(Date.parse(firstTicket.body.ticket.expiresAt) - Date.parse(firstTicket.body.ticket.issuedAt), 6 * 60 * 60 * 1000);
  assert.match(firstTicket.body.mac, /^0x[\da-f]{64}$/i);
  const oldBuild = await playerRunRequest(pilot, sampleRun({
    runId: 'old-build', ruleset: 'older-build', seed: firstTicket.body.ticket.seed, ticket: firstTicket.body
  }));
  assert.equal(oldBuild.status, 422);
  assert.match((await oldBuild.json()).error, /older game ruleset/);

  const badMacRun = sampleRun({ runId: 'ticket-bad-mac', seed: firstTicket.body.ticket.seed, pilot: { address: pilot.address, isPilot: true }, ticket: { ...firstTicket.body, mac: `0x${'0'.repeat(64)}` } });
  const badMac = await playerRunRequest(pilot, badMacRun);
  assert.equal(badMac.status, 422);
  assert.match((await badMac.json()).error, /MAC is invalid/);

  const noTicketRun = sampleRun({ runId: 'ticket-missing', pilot: { address: pilot.address, isPilot: true } });
  const missing = await playerRunRequest(pilot, noTicketRun);
  assert.equal(missing.status, 422);
  assert.match((await missing.json()).error, /ticket is required/);

  const wrongAddressRun = sampleRun({ runId: 'ticket-wrong-address', seed: firstTicket.body.ticket.seed, pilot: { address: secondPilot.address, isPilot: true }, ticket: firstTicket.body });
  const wrongAddress = await playerRunRequest(secondPilot, wrongAddressRun);
  assert.equal(wrongAddress.status, 422);
  assert.match((await wrongAddress.json()).error, /address does not match/);

  const seedMismatchRun = sampleRun({ runId: 'ticket-seed-mismatch', seed: firstTicket.body.ticket.seed ^ 1, pilot: { address: pilot.address, isPilot: true }, ticket: firstTicket.body });
  const seedMismatch = await playerRunRequest(pilot, seedMismatchRun);
  assert.equal(seedMismatch.status, 422);
  assert.match((await seedMismatch.json()).error, /seed does not match/);

  now += 6 * 60 * 60 * 1000 + 1;
  const expiredRun = sampleRun({ runId: 'ticket-expired', seed: firstTicket.body.ticket.seed, pilot: { address: pilot.address, isPilot: true }, ticket: firstTicket.body });
  const expired = await playerRunRequest(pilot, expiredRun);
  assert.equal(expired.status, 422);
  assert.match((await expired.json()).error, /expired/);

  const deniedTicket = await issue(nonPilot.address);
  assert.equal(deniedTicket.response.status, 401);
  assert.match(deniedTicket.body.error, /not a Decent Pilot/);

  const freshTicket = (await issue(pilot.address)).body;
  const acceptedRun = sampleRun({ runId: 'ticket-happy-path', seed: freshTicket.ticket.seed, pilot: { address: pilot.address, isPilot: true }, ticket: freshTicket });
  const accepted = await playerRunRequest(pilot, acceptedRun);
  assert.equal(accepted.status, 201);
  const duplicate = await playerRunRequest(pilot, acceptedRun);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).idempotent, true);

  const reusedRun = { ...acceptedRun, runId: 'ticket-reused-different-run' };
  const reused = await playerRunRequest(pilot, reusedRun);
  assert.equal(reused.status, 422);
  assert.match((await reused.json()).error, /already been used/);
});

test('GitHub contents queue preserves duplicate vouchers and rejects conflicting run hashes', async () => {
  const files = new Map();
  let revision = 0;
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET';
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop());
    if (method === 'GET') {
      const stored = files.get(name);
      if (!stored) return { status: 404, ok: false, json: async () => ({}) };
      return { status: 200, ok: true, json: async () => ({ sha: stored.sha, content: Buffer.from(JSON.stringify(stored.data)).toString('base64') }) };
    }
    const body = JSON.parse(options.body);
    const data = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
    const sha = `revision-${++revision}`;
    files.set(name, { sha, data });
    return { status: 200, ok: true, json: async () => ({ sha }) };
  };
  const queue = createQueueWriter({ repoRoot: '.', token: 'test-token', repo: 'org/repo', fetchImpl });
  const item = { runId: 'stable-run', runHash: '0x1234', recordId: 'record-1', player: Wallet.createRandom().address, voucher: { recordId: '0xabcd' }, signature: '0xsignature' };
  assert.equal((await queue.append('stamps', item)).status, 'queued');
  const duplicate = await queue.append('stamps', item);
  assert.equal(duplicate.status, 'already-queued');
  assert.deepEqual(duplicate.item.voucher, item.voucher);
  await assert.rejects(queue.append('stamps', { ...item, runHash: '0xffff' }), /different run hash/);
});

test('lobby creates a new group when the sixth player joins and applies disconnect grace', () => {
  let now = 1000;
  const lobby = new LobbyManager({ now: () => now });
  const players = Array.from({ length: 6 }, () => Wallet.createRandom().address);
  const joined = players.map((address) => lobby.join({ address }));
  assert.equal(joined[0].room.id, joined[4].room.id);
  assert.notEqual(joined[5].room.id, joined[0].room.id);
  assert.equal(joined[0].room.players.size, 5);
  assert.equal(joined[5].room.players.size, 1);

  const dropped = players[0];
  assert.equal(lobby.disconnect(dropped), true);
  now += 9999;
  assert.equal(lobby.tick().length, 0);
  now += 1;
  const expired = lobby.tick();
  assert.equal(expired.length, 1);
  assert.equal(expired[0].player.alive, false);
});

test('invite-only lobby rooms reject strangers and admit invitees', () => {
  const lobby = new LobbyManager();
  const host = Wallet.createRandom();
  const invitee = Wallet.createRandom();
  const stranger = Wallet.createRandom();
  const { room } = lobby.join({ address: host.address, paidRoundId: '41', visibility: 'invite', invites: [invitee.address] });

  assert.equal(room.visibility, 'invite');
  assert.deepEqual(room.invites, new Set([invitee.address.toLowerCase()]));
  assert.throws(() => lobby.join({ address: stranger.address, paidRoundId: '41' }), /This arena round is invite-only\./);
  const accepted = lobby.join({ address: invitee.address, paidRoundId: '41', visibility: 'invalid', invites: ['invalid'] });
  assert.equal(accepted.room, room, 'existing room settings come from its host');
  assert.equal(accepted.player.address, invitee.address);
  assert.equal(lobby.join({ address: host.address, paidRoundId: '41' }).reconnected, true);

  assert.throws(() => lobby.join({ address: Wallet.createRandom().address, paidRoundId: '42', invites: ['invalid'] }), /Invalid arena invite address/);
  assert.throws(() => lobby.join({ address: Wallet.createRandom().address, paidRoundId: '43', invites: Array(5).fill(invitee.address) }), /at most 4 invitees/);
});

test('openRooms lists only public waiting paid rooms and applies filters', () => {
  let now = 100;
  const lobby = new LobbyManager({ now: () => now, maxPlayers: 2 });
  const players = Array.from({ length: 10 }, () => Wallet.createRandom());
  lobby.join({ address: players[0].address, paidRoundId: '1' });
  now += 1;
  lobby.join({ address: players[1].address, mode: 'versus', difficulty: 'pilot', paidRoundId: '2' });
  now += 1;
  lobby.join({ address: players[2].address, paidRoundId: '3', visibility: 'invite', invites: [players[3].address] });
  now += 1;
  const started = lobby.join({ address: players[4].address, paidRoundId: '4' }).room;
  started.started = true;
  now += 1;
  lobby.join({ address: players[5].address, paidRoundId: '5' });
  lobby.join({ address: players[6].address, paidRoundId: '5' });
  lobby.join({ address: players[7].address });

  assert.deepEqual(lobby.openRooms(), [
    { paidRoundId: '1', mode: 'coop', difficulty: 'cadet', players: 1, maxPlayers: 2, createdAt: 100 },
    { paidRoundId: '2', mode: 'versus', difficulty: 'pilot', players: 1, maxPlayers: 2, createdAt: 101 }
  ]);
  assert.deepEqual(lobby.openRooms({ mode: 'versus' }).map((room) => room.paidRoundId), ['2']);
  assert.deepEqual(lobby.openRooms({ difficulty: 'pilot' }).map((room) => room.paidRoundId), ['2']);
});

test('invitesFor lists only pending invitations for non-members', () => {
  const lobby = new LobbyManager();
  const host = Wallet.createRandom();
  const invitee = Wallet.createRandom();
  const other = Wallet.createRandom();
  lobby.join({ address: host.address, mode: 'versus', difficulty: 'ace', paidRoundId: '71', visibility: 'invite', invites: [invitee.address] });
  const acceptedRoom = lobby.join({ address: Wallet.createRandom().address, paidRoundId: '72', visibility: 'invite', invites: [invitee.address] }).room;
  lobby.join({ address: invitee.address, paidRoundId: '72' });
  const startedRoom = lobby.join({ address: Wallet.createRandom().address, paidRoundId: '73', visibility: 'invite', invites: [invitee.address] }).room;
  startedRoom.started = true;

  assert.deepEqual(lobby.invitesFor(invitee.address), [{
    paidRoundId: '71', mode: 'versus', difficulty: 'ace', host: host.address, players: 1, maxPlayers: 5
  }]);
  assert.deepEqual(lobby.invitesFor(host.address), []);
  assert.deepEqual(lobby.invitesFor(other.address), []);
  assert.ok(acceptedRoom.players.has(invitee.address.toLowerCase()));
});

test('arena websocket join passes visibility and returns it in joined message', async () => {
  const pilot = Wallet.createRandom();
  const service = createService({
    pilotRegistry: { isPilot: async () => true }, verifyPaidJoin: async () => true,
    queues: { async append() { return { status: 'queued' }; }, async read() { return { pending: [] }; } },
    pinata: { async pinRecord() { return { status: 'skipped', metadataURI: '', imageURI: '' }; } }
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = 'testnonce-123';
  const signature = await pilot.signMessage(`DecentVoyager arena session\n${pilot.address.toLowerCase()}\n${timestamp}\n${nonce}`);
  const sent = [];
  const socket = { readyState: 1, send(message) { sent.push(JSON.parse(message)); } };
  await service.arena.join(socket, {
    type: 'join', address: pilot.address, timestamp, nonce, signature, paidRoundId: '81',
    visibility: 'invite', invites: [Wallet.createRandom().address]
  });
  assert.equal(sent[0].type, 'joined');
  assert.equal(sent[0].visibility, 'invite');
  assert.equal([...service.arena.lobby.values()][0].visibility, 'invite');
  service.server.close();
});

test('arena discovery HTTP routes return public listings and wallet invitations', async (t) => {
  const host = Wallet.createRandom();
  const invitee = Wallet.createRandom();
  const service = createService({
    env: { CORS_ORIGINS: 'http://localhost:8907' },
    pilotRegistry: { isPilot: async () => true },
    queues: { async append() { return { status: 'queued' }; }, async read() { return { pending: [] }; } },
    pinata: { async pinRecord() { return { status: 'skipped', metadataURI: '', imageURI: '' }; } }
  });
  service.arena.lobby.join({ address: host.address, mode: 'coop', difficulty: 'cadet', paidRoundId: '91' });
  service.arena.lobby.join({ address: Wallet.createRandom().address, mode: 'versus', difficulty: 'ace', paidRoundId: '92', visibility: 'invite', invites: [invitee.address] });
  await new Promise((resolve) => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => service.server.close(resolve)));
  const url = `http://127.0.0.1:${service.server.address().port}`;

  const openResponse = await fetch(`${url}/arena/open?mode=coop`);
  const open = await openResponse.json();
  assert.equal(openResponse.status, 200);
  assert.equal(open.rounds.length, 1);
  assert.deepEqual(Object.keys(open.rounds[0]).sort(), ['createdAt', 'difficulty', 'maxPlayers', 'mode', 'paidRoundId', 'players']);
  assert.equal(open.rounds[0].paidRoundId, '91');
  const filtered = await fetch(`${url}/arena/open?difficulty=invalid`);
  assert.equal(filtered.status, 400);
  const duplicateFilter = await fetch(`${url}/arena/open?mode=coop&mode=versus`);
  assert.equal(duplicateFilter.status, 400);

  const invitesResponse = await fetch(`${url}/arena/invites/${invitee.address}`);
  const invites = await invitesResponse.json();
  assert.equal(invitesResponse.status, 200);
  assert.equal(invites.address, invitee.address);
  assert.equal(invites.invites.length, 1);
  const inviteRoom = [...service.arena.lobby.values()][1];
  assert.deepEqual(invites.invites[0], {
    paidRoundId: '92', mode: 'versus', difficulty: 'ace',
    host: inviteRoom.players.get(inviteRoom.host).address, players: 1, maxPlayers: 5
  });
  const malformedAddress = await fetch(`${url}/arena/invites/0x1234`);
  assert.equal(malformedAddress.status, 404);
});

test('settle payload sorts survivors and hashes Solidity packed address-array values', async () => {
  const addresses = [
    '0x00000000000000000000000000000000000000ff',
    '0x0000000000000000000000000000000000000002',
    '0x0000000000000000000000000000000000000001'
  ];
  const sorted = [...addresses].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const expectedHash = keccak256(concat(sorted.map((address) => zeroPadValue(address, 32))));
  assert.deepEqual(sortAddresses(addresses), sorted);
  assert.equal(hashSortedSurvivors(addresses), expectedHash);
  const referee = Wallet.createRandom();
  const vouchers = makeVoucherService({ privateKey: referee.privateKey, chainId: 84532, ...REFEREE_CONTRACTS });
  const settle = await vouchers.settle({ roundId: 9, survivors: addresses, nonce: 2, deadline: 2_000_000_000 });
  assert.deepEqual(settle.survivors, sorted);
  assert.equal(settle.survivorsHash, expectedHash);
  assert.equal(settle.value.survivorsHash, expectedHash);
  assert.equal(settle.digest, TypedDataEncoder.hash({ ...DOMAIN, chainId: 84532, verifyingContract: REFEREE_CONTRACTS.arenaAddress }, { Settle: TYPES.Settle }, settle.value));
  assert.equal(verifyTypedData(settle.domain, { Settle: TYPES.Settle }, settle.value, settle.signature), referee.address);
});

test('core Game.replay integration', { skip: typeof Game.replay !== 'function' ? 'Skipped clearly: core Game.replay has not landed yet.' : false }, () => {
  const frames = [[{ right: true }]];
  assert.equal(getFrameCount(frames, 1), 1);
  const run = sampleRun({ frames });
  const result = replayRun(run);
  const encodedResult = Game.replay({ ...run, frames: inputLog ? inputLog.encode(frames) : frames });
  assert.deepEqual(result.ships, encodedResult.ships);
  assert.ok(result && Array.isArray(result.records) && Array.isArray(result.captures));
  assert.ok(Array.isArray(result.survivors) || Number.isInteger(result.survivors));
});

test('core authoritative arena adapter integration', {
  skip: ['setPilot', 'setPlayers', 'step', 'serialize'].some((method) => typeof Game.prototype[method] !== 'function')
    ? 'Skipped clearly: core multiplayer Game APIs have not landed yet.' : false
}, () => {
  const game = createArenaGame({ players: 2, mode: 'coop', difficulty: 'cadet', seed: 777, pilot: { address: Wallet.createRandom().address, isPilot: true } });
  game.step([{}, {}]);
  assert.equal(game.serialize().ships.length, 2);
});
