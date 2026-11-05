'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { Wallet } = require('ethers');
const { createQueueWriter } = require('../src/queue-writer');
const { createService } = require('../src/index');
const { makeVoucherService } = require('../src/vouchers');
const { runHash } = require('../src/run-verifier');
const Game = require('../../src/js/game');
const { PRIZES } = require('../../src/js/prizes');

test('one funded unit cannot be reserved twice, including concurrent local writes', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'voyager-rewards-'));
  t.after(() => rm(root, { recursive: true }));
  const queue = createQueueWriter({ repoRoot: root });
  const item = index => ({
    player: Wallet.createRandom().address, runId: `run-${index}`, runHash: `hash-${index}`,
    tokenId: '75', signature: 'signed', voucher: { deadline: Math.floor(Date.now() / 1000) + 3600 }
  });

  test('bundles reserve raw ERC20 and native amounts, not just NFT stock', async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'voyager-bundles-'));
    t.after(() => rm(root, { recursive: true }));
    const queue = createQueueWriter({ repoRoot: root });
    const token = '0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736';
    const item = index => ({ tokenId: '76', player: Wallet.createRandom().address, runId: `bundle-${index}`,
      signature: 'signed', voucher: { nftAmount: '1', paymentToken: token, tokenAmount: '100000000000000000000',
        nativeAmount: '1000', deadline: Math.floor(Date.now() / 1000) + 3600 } });
    await queue.append('prizes', item(1), { stock: 100, paymentToken: token,
      tokenBalance: '100000000000000000000', nativeBalance: '1000' });
    await assert.rejects(queue.append('prizes', item(2), { stock: 100, paymentToken: token,
      tokenBalance: '100000000000000000000', nativeBalance: '1000' }), /unreserved ERC-20/);
    const native = item(3); native.voucher.tokenAmount = '0'; native.voucher.nftAmount = '0';
    await assert.rejects(queue.append('prizes', native, { stock: 0, nativeBalance: '1000' }), /unreserved native/);
    assert.equal((await queue.read('prizes')).pending.length, 1);
  });
  const first = item(1);
  const outcomes = await Promise.allSettled([
    queue.append('prizes', first, { stock: 1 }),
    queue.append('prizes', item(2), { stock: 1 })
  ]);
  assert.equal(outcomes.filter(entry => entry.status === 'fulfilled').length, 1);
  assert.match(outcomes.find(entry => entry.status === 'rejected').reason.message, /no unreserved funded inventory/);
  assert.equal((await queue.read('prizes')).pending.length, 1);
  assert.equal((await queue.append('prizes', first, { stock: 0 })).status, 'already-queued');
  await assert.rejects(queue.append('prizes', item(3), { stock: NaN }), /Invalid verified/);
});

function marathon(difficulty, player) {
  const game = new Game({ seed: 44, now: () => 1_800_000_000_000 });
  game.setPilot({ address: player.address, isPilot: true });
  game.startCampaign(1, difficulty);
  for (let level = 1; level <= 20; level++) {
    game.startLevel(level);
    if (level === 9 || level === 19) {
      game.vault = { tier: level === 9 ? 1 : 2, prize: PRIZES[level === 9 ? 1 : 2][0], shielded: false };
      game.captureVault();
    }
    game.completeLevel();
  }
  return game.summary();
}

test('referee signs distinct marathon/perfect claims and queues the Pilot bonus, never Cadet awards', async (t) => {
  const player = Wallet.createRandom();
  const captured = [];
  let stock = 100;
  let result;
  const service = createService({
    env: { TICKET_SECRET: 'test-secret-with-at-least-thirty-two-bytes!' },
    vouchers: makeVoucherService({
      privateKey: Wallet.createRandom().privateKey, chainId: 8453,
      stampsAddress: '0x0000000000000000000000000000000000000001',
      prizesAddress: '0x0000000000000000000000000000000000000002',
      rewardsAddress: '0x0000000000000000000000000000000000000003',
      nftAddress: '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B'
    }),
    rewardInventory: { async read(player, tokenId, bonus) { return { stock, claimed: false,
      ...(bonus ? { paymentToken: bonus.token, tokenBalance: '10000000000000000000000' } : {}) }; } },
    pilotRegistry: { async isPilot() { return true; } },
    queues: { async append(kind, item) { captured.push({ kind, item }); return { status: 'queued' }; }, async read() { return { pending: [] }; } },
    pinata: { async pinRecord(record) { return { status: 'pinned', metadataURI: `ipfs://${record.id}` }; } },
    replay: async () => result
  });
  t.after(() => service.server.emit('close'));
  async function submit(difficulty, summary) {
    const ticket = service.ticketService.issue(player.address);
    const run = { runId: `award-${difficulty}`, ruleset: require('../../src/js/ruleset'), difficulty, startLevel: 1, players: 1,
      seed: ticket.ticket.seed, ticket, frames: [[{}]], pilot: { address: player.address, isPilot: true } };
    result = summary;
    return service.processRun({ run, address: player.address, signature: await player.signMessage(runHash(run)),
      verifiedTicket: service.ticketService.verify({ address: player.address, run, usedTickets: service.usedTickets }) });
  }
  const ace = await submit('ace', marathon('ace', player));
  const acePrizes = ace.vouchers.filter(entry => entry.kind === 'prize');
  assert.equal(new Set(acePrizes.map(entry => entry.voucher.claimId)).size, 4);
  assert.deepEqual(acePrizes.slice(-2).map(entry => entry.tokenId), ['80', '75']);
  const pilot = await submit('pilot', marathon('pilot', player));
  const pilotPrize = pilot.vouchers.find(entry => entry.awardKind === 'perfect-pilot');
  assert.equal(pilotPrize.tokenId, '76');
  assert.equal(pilotPrize.bonus.amount, '100000000000000000000');
  assert.equal(pilotPrize.bonus.status, 'atomic-with-nft');
  assert.ok(captured.find(entry => entry.item.receiptRecordId && entry.item.tokenId === '76'));
  const cadet = await submit('cadet', { records: [{ id: 'cadet-record', level: 1, difficulty: 'cadet' }], captures: [] });
  assert.equal(cadet.vouchers.length, 0);
  await assert.rejects(submit('cadet', marathon('ace', player)), /full marathon/);
  stock = 0;
  await assert.rejects(submit('ace', marathon('ace', player)), /unfunded; no claim voucher issued/);
});
