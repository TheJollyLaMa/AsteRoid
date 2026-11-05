const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../src/js/game');
const { PRIZES, PERFECT_PRIZES } = require('../src/js/prizes');
const { createVault } = require('../src/js/vault');
const { createRng } = require('../src/js/rng');

function finish({ difficulty = 'ace', loseLife = false, skipSecond = false, startLevel = 1 } = {}) {
    const game = new Game({ seed: 44, now: () => 1_800_000_000_000 });
    game.setPilot({ address: '0x807061DF657A7697c04045dA7d16D941861cAABc', isPilot: true });
    game.save.progress.byDifficulty[difficulty].sector2Unlocked = true;
    game.startCampaign(startLevel, difficulty);
    for (let level = startLevel; level <= 20; level++) {
        game.startLevel(level);
        if (level === 9 || level === 19 && !skipSecond) {
            game.vault = createVault(level === 9 ? 1 : 2, level, createRng(44));
            game.vault.shielded = false;
            game.captureVault();
        }
        game.tracker.stats.shotsFired = level;
        game.tracker.stats.asteroidsDestroyed = level;
        if (loseLife && level === 5) game.tracker.lifeLost();
        game.completeLevel();
    }
    return game;
}

test('Ace marathon receipt includes all levels, totals and ordered award references', () => {
    const game = finish();
    const record = game.getWinRecords().at(-1);
    assert.equal(game.state, 'victory');
    assert.equal(record.marathon.levels.length, 20);
    assert.equal(record.marathon.totals.shotsFired, 210);
    assert.equal(record.marathon.totals.asteroidsDestroyed, 210);
    assert.equal(record.marathon.totals.victories, 1);
    assert.equal(record.marathon.perfect, true);
    assert.deepEqual(record.marathon.awards.slice(-2).map(award => award.tokenId), ['80', '75']);
    assert.deepEqual(game.runCaptures.slice(-2).map(award => award.kind), ['marathon-completion', 'perfect-ace']);
    assert.ok(record.marathon.awards.every(award => award.status.includes('awaiting')));
});

test('Perfect Pilot has two guarded pickups and BigNuten plus exactly 100 BNut, not Voyager', () => {
    const game = finish({ difficulty: 'pilot' });
    const record = game.getWinRecords().at(-1);
    assert.equal(record.marathon.perfect, true);
    const last = record.marathon.awards.at(-1);
    assert.equal(last.tokenId, '76');
    assert.equal(last.bonus.amount, '100000000000000000000');
    assert.equal(last.bonus.decimals, 18);
    assert.equal(record.marathon.awards.some(award => award.tokenId === '80'), false);
    assert.equal(game.save.progress.byDifficulty.pilot.sector2Unlocked, true);
});

test('Any life lost, missed guarded pickup or resumed run disqualifies perfection', () => {
    for (const options of [{ loseLife: true }, { skipSecond: true }, { startLevel: 11 }]) {
        const game = finish(options);
        assert.equal(game.runCaptures.some(award => award.kind === 'perfect-ace'), false);
        if (options.startLevel) assert.equal(game.getWinRecords().at(-1).marathon, undefined);
        else assert.equal(game.getWinRecords().at(-1).marathon.perfect, false);
    }
});

test('Calendar is a normal future pickup; rare Busking and BigNuten are not random', () => {
    assert.ok(PRIZES[2].some(prize => prize.tokenId === 77));
    assert.ok(PRIZES[2].every(prize => ![75, 76, 80].includes(prize.tokenId)));
    assert.equal(PERFECT_PRIZES.ace.tokenId, 75);
    assert.equal(PERFECT_PRIZES.pilot.tokenId, 76);
});

test('real level-20 receipt survives save, metadata and claim boundaries', async () => {
    const { buildMetadata, buildClaim } = await import('../src/js/dnft/metadata.mjs');
    const game = finish({ difficulty: 'pilot' });
    const restored = new Game();
    restored.importSave(game.exportSave());
    const record = restored.getWinRecords().at(-1);
    const image = 'ipfs://QmPqCy2g53t4BaffprtfjfM4L5imACB1nWZK63HyN9o3Tj';
    const claimant = '0x807061DF657A7697c04045dA7d16D941861cAABc';
    const metadata = buildMetadata(record, { image, claimant });
    assert.match(metadata.name, /Pilot Marathon/);
    assert.deepEqual(metadata.properties.record.marathon, record.marathon);
    assert.equal(metadata.attributes.find(item => item.trait_type === 'marathon.totals.shotsFired').value, 210);
    assert.equal(buildClaim(record, { tokenURI: image, image, claimant, requestedAt: record.completedAt }).level, 20);
    assert.throws(() => buildClaim({ ...record, difficulty: 'cadet' }, { tokenURI: image, image, claimant }), /practice only/);
});
