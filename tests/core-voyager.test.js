const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../src/js/game');
const { getLevel, TOTAL_LEVEL_COUNT } = require('../src/js/levels');
const { createRng } = require('../src/js/rng');
const { encode, decode } = require('../src/js/inputlog');
const { groupPlayers, scaleForPlayers, createPlayerStats, awardScore, canEndLevel } = require('../src/js/multiplayer');
const { createVault } = require('../src/js/vault');

function activeGame(difficulty = 'cadet', pilot = false, seed = 12) {
    const game = new Game({ seed, now: () => 1_800_000_000_000, idFn: () => 'fixed-id' });
    if (pilot) game.setPilot({ address: '0x1234', isPilot: true });
    game.startCampaign(1, difficulty, seed);
    game.asteroids = [];
    game.pickups = [];
    game.ship.invulnerable = 0;
    return game;
}

test('fixed-step updates, input RLE, snapshots, and replay are deterministic', () => {
    const game = new Game({ seed: 12, now: () => 1_800_000_000_000, idFn: () => 'fixed-id' });
    game.startCampaign(1, 'cadet', 12);
    const frames = Array.from({ length: 180 }, (_, i) => [{ right: i < 80, fire: i % 3 === 0 }]);
    for (const frame of frames) game.step(frame);
    const log = game.getRunLog();
    assert.equal(decode(log.frames).length, frames.length);
    assert.ok(log.frames.runs.length < frames.length);
    assert.deepEqual(decode(encode(frames)), frames.map((f) => [{ left: false, right: Boolean(f[0].right), up: false, down: false, fire: Boolean(f[0].fire), special: false, weaponNext: false, view: false }]));
    const replayArgs = { seed: game.seed, difficulty: game.difficulty, startLevel: 1, players: 1, pilot: game.pilot, frames: log.frames };
    const first = Game.replay({ ...log, ...replayArgs });
    const second = Game.replay({ ...log, ...replayArgs });
    assert.deepEqual(first, second);
    assert.deepEqual(first, game.summary());
    const defaultSeedGame = new Game({ now: () => 1_800_000_000_000 });
    defaultSeedGame.startCampaign(1);
    const defaultFrames = Array.from({ length: 8 }, () => [{ fire: true }]);
    for (const frame of defaultFrames) defaultSeedGame.step(frame);
    assert.deepEqual(Game.replay({ ...defaultSeedGame.getRunLog() }), defaultSeedGame.summary());
    const tampered = structuredClone(log.frames);
    tampered.runs[0][1][0].mask ^= 2;
    assert.notDeepEqual(Game.replay({ ...replayArgs, frames: tampered }), first);
    const snapshot = game.serialize();
    assert.deepEqual(Game.fromSnapshot(snapshot).serialize(), snapshot);
    const title = new Game();
    const vaultGame = activeGame('ace', true, 44);
    vaultGame.sector2Level = 9;
    vaultGame.startLevel(9);
    const warping = activeGame('ace', true, 44);
    warping.state = 'warping';
    warping.stateTimer = 1.25;
    const multiplayer = activeGame();
    multiplayer.setPlayers(3, { mode: 'coop' });
    for (const stateGame of [title, vaultGame, warping, multiplayer]) {
        const stateSnapshot = stateGame.serialize();
        assert.ok(Object.hasOwn(stateSnapshot, 'vault'));
        assert.deepEqual(Game.fromSnapshot(stateSnapshot).serialize(), stateSnapshot, stateGame.state);
    }
    const legacySnapshot = { ...title.serialize() };
    delete legacySnapshot.vault;
    delete legacySnapshot.playerBullets;
    assert.equal(Game.fromSnapshot(legacySnapshot).vault, null);
    legacySnapshot.vault = null;
    assert.equal(Game.fromSnapshot(legacySnapshot).vault, null);
});

test('run seed source, queued tickets, map independence, and vault variation', () => {
    let nextSeed = 0x12345678;
    const game = new Game({ seedSource: () => nextSeed++ });
    game.startCampaign(1);
    assert.equal(game.seed, 0x12345678);
    const firstSeed = game.seed;
    const firstMap = game.asteroids.map((rock) => [rock.x, rock.y, rock.vx, rock.vy, rock.maxHp, rock.shooter, rock.shape]);
    game.setNextRunSeed(0x87654321, { roundId: 'ticket-7', opaque: { nonce: 3 } });
    game.startCampaign(1);
    assert.equal(game.seed, 0x87654321);
    assert.deepEqual(game.getRunLog().ticket, { roundId: 'ticket-7', opaque: { nonce: 3 } });
    assert.deepEqual(game.asteroids.map((rock) => [rock.x, rock.y, rock.vx, rock.vy, rock.maxHp, rock.shooter, rock.shape]), firstMap);
    game.startCampaign(1);
    assert.equal(game.seed, 0x12345679);
    assert.equal(game.getRunLog().ticket, null);
    assert.notEqual(game.seed, firstSeed);

    const otherSeedGame = new Game({ seed: 0x22223333 });
    otherSeedGame.startCampaign(1, 'cadet', 0x22223333);
    for (let level = 1; level <= TOTAL_LEVEL_COUNT; level++) {
        game.startLevel(level);
        otherSeedGame.startLevel(level);
        const map = (instance) => ({
            asteroids: instance.asteroids.map((rock) => [rock.x, rock.y, rock.vx, rock.vy, rock.maxHp, rock.shooter, rock.shape]),
            pickups: instance.pickups.map((pickup) => [pickup.x, pickup.y, pickup.type])
        });
        assert.deepEqual(map(game), map(otherSeedGame), `level ${level} map is run-seed independent`);
    }

    const vaults = [];
    for (let seed = 1; seed <= 80 && vaults.length < 2; seed++) {
        const candidate = new Game({ seedSource: () => seed });
        candidate.setPilot({ address: '0x1234', isPilot: true });
        candidate.startCampaign(1, 'ace');
        if (candidate.sector2Level !== 9) continue;
        candidate.startLevel(9);
        vaults.push({ seed, level: candidate.vault.level, x: candidate.vault.x, y: candidate.vault.y, prize: candidate.vault.prize.tokenId });
    }
    assert.equal(vaults.length, 2);
    assert.notDeepEqual(vaults[0], vaults[1]);
});

test('Nova Charger charges on hold and releases an expanding blast', () => {
    const game = activeGame();
    game.ship.weapon = { type: 'nova', tier: 2 };
    for (let i = 0; i < 60; i++) game.step([{ fire: true }]);
    assert.ok(game.ship.charge > 0.8);
    game.step([{}]);
    assert.ok(game.playerBullets.length > 0);
    const blast = game.playerBullets.at(-1);
    assert.ok(blast.maxRadius > 0);
    assert.ok(blast.damage >= 7);
    const events = game.drainEvents();
    assert.ok(events.some((event) => event.type === 'chargeStart'));
    assert.ok(events.some((event) => event.type === 'chargeRelease'));
});

test('special force-releases charge or grants a short shield', () => {
    const game = activeGame();
    game.ship.weapon = { type: 'nova', tier: 1 };
    game.step([{ fire: true }]);
    game.step([{ fire: true, special: true }]);
    assert.equal(game.ship.charge, 0);
    assert.ok(game.playerBullets.length > 0);
    const firstEvents = game.drainEvents();
    assert.ok(firstEvents.some((event) => event.type === 'chargeRelease' && event.forced));
    game.ship.weapon = { type: 'blaster', tier: 1 };
    game.ship.specialCooldown = 0;
    game.step([{ special: false }]);
    game.step([{ special: true }]);
    assert.ok(game.ship.shield > 0);
    assert.ok(game.drainEvents().some((event) => event.type === 'specialUsed'));
});

test('vaults require a whitelisted Pilot or Ace; capture refills power without gating Sector II', () => {
    const unauthorized = activeGame('ace', false, 44);
    unauthorized.startLevel(9);
    assert.equal(unauthorized.vault, null);
    const cadet = activeGame('cadet', true, 44);
    cadet.startLevel(9);
    assert.equal(cadet.vault, null);
    const pilot = activeGame('pilot', true, 44);
    pilot.sector2Level = 9;
    pilot.startLevel(9);
    pilot.vault.shielded = false;
    pilot.captureVault();
    assert.equal(pilot.save.progress.byDifficulty.pilot.sector2Unlocked, false);
    const game = activeGame('ace', true, 44);
    game.sector2Level = 9;
    game.startLevel(9);
    assert.equal(game.vault.tier, 1);
    assert.equal(game.vault.shielded, true);
    for (const guard of [...game.vault.guards]) game.destroyAsteroid(guard, false);
    assert.equal(game.vault.shielded, false);
    game.ship.power = 12;
    game.ship.x = game.vault.x;
    game.ship.y = game.vault.y;
    game.resolveShipHits();
    assert.equal(game.runCaptures.length, 1);
    assert.equal(game.runCaptures[0].tier, 1);
    assert.equal(game.ship.power, game.ship.maxPower);
    assert.equal(game.save.progress.byDifficulty.ace.sector2Unlocked, false);
    assert.equal(game.save.progress.byDifficulty.ace.unlocked, 1);
    assert.equal(game.summary().captures.length, 1);
    const events = game.drainEvents();
    assert.ok(events.some((event) => event.type === 'supporterCaptured'));
    assert.equal(events.some((event) => event.type === 'sectorUnlocked'), false);
    game.scrollY = game.level.length;
    game.completeLevel();
    assert.equal(game.getWinRecords().at(-1).captures[0].tier, 1);
    const exported = game.exportSave();
    const restored = new Game();
    restored.importSave(exported);
    assert.equal(restored.getProgress('ace').sector2Unlocked, false);
    assert.doesNotThrow(() => unauthorized.startCampaign(11, 'ace'));
    assert.throws(() => cadet.startCampaign(11, 'cadet'), /Cadet campaigns end at level 10/);
});

test('sector II has twenty harder levels and unlocks through warp', () => {
    assert.equal(getLevel(TOTAL_LEVEL_COUNT).number, 20);
    assert.ok(getLevel(11).scrollSpeed > getLevel(10).scrollSpeed);
    assert.equal(getLevel(18).futureSector, true);
    const game = activeGame('ace', true, 2);
    game.startLevel(10);
    game.asteroids = [];
    game.scrollY = game.level.length;
    game.step([{}]);
    assert.equal(game.state, 'warping');
    assert.ok(game.drainEvents().some((event) => event.type === 'warpStart'));
    for (let i = 0; i < 140; i++) game.step([{}]);
    assert.equal(game.level.number, 11);
    assert.ok(game.drainEvents().some((event) => event.type === 'warpEnd'));
});

test('Pilot and Ace reach level 20 with no wallet, no captures and old locked progress', () => {
    for (const difficulty of ['pilot', 'ace']) {
        for (const isPilot of [false, true]) {
            const game = activeGame(difficulty, isPilot, 44);
            const saved = game.exportSave();
            saved.progress.byDifficulty[difficulty].unlocked = 10;
            saved.progress.byDifficulty[difficulty].sector2Unlocked = false;
            game.importSave(saved);
            for (let level = 1; level <= 20; level++) {
                assert.equal(game.level.number, level);
                assert.equal(game.state, 'playing');
                game.asteroids = [];
                game.pickups = [];
                game.enemyBullets = [];
                game.scrollY = game.level.length;
                game.step([{}]);
                if (level === 20) {
                    assert.equal(game.state, 'victory');
                    break;
                }
                assert.equal(game.state, level === 10 ? 'warping' : 'levelComplete');
                if (level === 10) {
                    assert.equal(game.getProgress(difficulty).sector2Unlocked, true);
                    assert.equal(game.getProgress(difficulty).unlocked, 11);
                    const restored = new Game();
                    restored.importSave(game.exportSave());
                    assert.equal(restored.getProgress(difficulty).unlocked, 11);
                    assert.doesNotThrow(() => restored.startCampaign(11, difficulty));
                }
                for (let frame = 0; game.state !== 'playing' && frame < 220; frame++) game.step([{}]);
            }
            assert.equal(game.getWinRecords().length, 20);
            assert.equal(game.runStats.victories, 1);
            assert.equal(game.runCaptures.some(capture => !capture.kind), false);
            assert.equal(game.runCaptures.some(capture => capture.kind?.startsWith('perfect-')), false);
            if (!isPilot) {
                assert.equal(game.runCaptures.length, 0);
                assert.equal(game.lastRecord.marathon, undefined);
            }
            const restored = new Game();
            restored.importSave(game.exportSave());
            assert.equal(restored.getProgress(difficulty).unlocked, 20);
        }
    }
});

test('Cadet ends at 10 even with a legacy Sector II flag; guest Sector II replay stays deterministic', () => {
    const cadet = activeGame('cadet', true);
    cadet.save.progress.byDifficulty.cadet.sector2Unlocked = true;
    cadet.startLevel(10);
    cadet.completeLevel();
    assert.equal(cadet.state, 'victory');
    assert.equal(cadet.drainEvents().some(event => event.type === 'warpStart'), false);
    assert.throws(() => cadet.startCampaign(11, 'cadet'), /Cadet campaigns end at level 10/);
    for (const difficulty of ['pilot', 'ace']) {
        const game = activeGame(difficulty);
        game.startCampaign(11, difficulty, 44);
        for (let frame = 0; frame < 120; frame++) game.step([{ fire: true }]);
        assert.deepEqual(Game.replay(game.getRunLog()), game.summary());
    }
});

test('a guest retry clears the previous eligible run encounter schedule', () => {
    const game = activeGame('pilot', true);
    assert.ok(game.sector2VaultLevel >= 19);
    game.setPilot({ address: null, isPilot: false });
    game.startCampaign(1, 'pilot');
    assert.equal(game.sector2Level, null);
    assert.equal(game.sector2VaultLevel, null);
    game.startLevel(19);
    assert.equal(game.vault, null);
});

test('multiplayer scaling, grouping, and score rules support co-op and versus', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(scaleForPlayers), [1, 1, 0.8, 0.7, 0.7]);
    assert.deepEqual(groupPlayers([1, 2, 3, 4, 5, 6]), [[1, 2, 3, 4, 5], [6]]);
    assert.equal(canEndLevel([{ alive: true, reachedGate: true }, { alive: true, reachedGate: false }], 'coop'), true);
    assert.equal(canEndLevel([{ alive: true, reachedGate: true }, { alive: true, reachedGate: false }], 'versus'), false);
    const stats = createPlayerStats(2);
    awardScore(stats, 0, 100, 'coop');
    assert.deepEqual(stats.map((player) => player.score), [100, 100]);
    awardScore(stats, 1, 25, 'versus');
    assert.deepEqual(stats.map((player) => player.score), [100, 125]);
    const coOp = activeGame();
    coOp.setPlayers(2, { mode: 'coop' });
    const sharedRock = new (require('../src/js/asteroid'))({ x: 100, y: 100, size: 14, hp: 1 });
    sharedRock.lastPlayerIndex = 1;
    coOp.destroyAsteroid(sharedRock, true, true);
    assert.equal(coOp.playerStats[0].score, coOp.playerStats[1].score);
    const game = activeGame();
    game.setPlayers(3, { mode: 'versus' });
    assert.ok(game.drainEvents().some((event) => event.type === 'playerJoined'));
    game.startCampaign(1, 'cadet', 4);
    assert.deepEqual(game.ships.map((ship) => ship.scale), [0.8, 0.8, 0.8]);
    assert.equal(game.mode, 'versus');
    const versusRock = new (require('../src/js/asteroid'))({ x: 100, y: 100, size: 14, hp: 1 });
    versusRock.lastPlayerIndex = 2;
    game.destroyAsteroid(versusRock, true, true);
    assert.ok(game.playerStats[2].score > 0);
    assert.equal(game.playerStats[0].score, 0);
    game.ships[2].invulnerable = 0;
    game.damageShip(200, 0, 0, game.ships[2], 2);
    assert.ok(game.drainEvents().some((event) => event.type === 'playerDied' && event.index === 2));
});

test('Sector II future weapon pickups are valid and available in the new sector', () => {
    const { populateLevel } = require('../src/js/levelLayout');
    const { applyWeaponPickup, fireWeapon } = require('../src/js/weapons');
    const layout = populateLevel(getLevel(16), createRng(getLevel(16).seed));
    assert.ok(layout.pickups.some((pickup) => ['nova', 'prism', 'singularity'].includes(pickup.type)));
    for (const type of ['nova', 'prism', 'singularity']) {
        const weapon = applyWeaponPickup({ type: 'blaster', tier: 1 }, type);
        assert.equal(weapon.type, type);
        assert.ok(fireWeapon(weapon, { x: 400, y: 100, size: 12 }, 100).bullets.length > 0);
    }
});

test('seeded vault prizes and coordinates are reproducible', () => {
    assert.deepEqual(createVault(1, 9, createRng(7)), createVault(1, 9, createRng(7)));
});
