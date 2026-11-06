const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../src/js/game');
const Asteroid = require('../src/js/asteroid');
const Bullet = require('../src/js/bullet');
const collision = require('../src/js/collision');
const { populateLevel, EXTRA_LIFE_LEVELS } = require('../src/js/levelLayout');
const { getLevel } = require('../src/js/levels');
const { createRng } = require('../src/js/rng');

test('exactly four deterministic White Lotus chances appear across the campaign', () => {
    const found = [];
    for (let level = 1; level <= 20; level++) {
        const config = getLevel(level, level > 10 ? 'pilot' : 'cadet');
        const first = populateLevel(config, createRng(config.seed));
        const second = populateLevel(config, createRng(config.seed));
        assert.deepEqual(first.pickups, second.pickups);
        const lives = first.pickups.filter(pickup => pickup.type === 'life');
        if (lives.length) {
            found.push(level);
            assert.equal(lives.length, 1);
            assert.equal(lives[0].x, 400);
            assert.equal(lives[0].y, config.length * 0.6);
        }
    }
    assert.deepEqual(found, EXTRA_LIFE_LEVELS);
});

test('extra life belongs to the collector and cannot erase prior life losses', () => {
    const game = new Game({ seed: 5 });
    game.startCampaign(1, 'pilot');
    game.setPlayers(2);
    game.asteroids = [];
    game.enemyBullets = [];
    game.ships[0].x = 200;
    game.ships[1].x = 600;
    game.tracker.lifeLost();
    const lives = game.ships.map(ship => ship.lives);
    game.pickups = [{ type: 'life', x: 600, y: game.ships[1].y, size: 20 }];
    game.resolveShipHits();
    game.resolveShipHits();
    assert.deepEqual(game.ships.map(ship => ship.lives), [lives[0], lives[1] + 1]);
    assert.equal(game.tracker.livesLost, 1);
    assert.equal(game.levelStats.pickupsCollected.life, 1);
    assert.equal(game.drainEvents().find(event => event.pickupType === 'life').player, 1);
});

test('restart resets the full run while preserving historical progress and records', () => {
    const game = new Game({ seedSource: (() => { let seed = 5; return () => seed++; })() });
    game.startCampaign(1);
    game.completeLevel();
    const previousRun = game.runId;
    game.advanceLevel();
    game.ship.weapon = { type: 'plasma', tier: 3 };
    game.runCaptures.push({ tier: 1 });
    game.state = 'gameOver';
    game.handleAction('confirm');
    assert.equal(game.level.number, 1);
    assert.equal(game.runStartLevel, 1);
    assert.equal(game.score, 0);
    assert.equal(game.ship.weapon.type, 'blaster');
    assert.deepEqual(game.runCaptures, []);
    assert.deepEqual(game.runRecords, []);
    assert.notEqual(game.runId, previousRun);
    assert.equal(game.getWinRecords().length, 1);
    assert.equal(game.progress.unlocked, 2);
    game.state = 'gameOver';
    game.handleAction('menu');
    game.handleAction('right');
    assert.equal(game.selectedLevel, 1);
});

test('spatial queries preserve brute-force first-hit and piercing collision order', () => {
    const rng = createRng(713);
    const game = new Game({ seed: 7 });
    game.startCampaign(1);
    game.asteroids = Array.from({ length: 350 }, (_, id) => new Asteroid({
        id, x: rng() * 800, y: rng() * 8000, size: 8 + rng() * 14, hp: 20, rng
    }));
    game.playerBullets = Array.from({ length: 120 }, (_, id) => new Bullet({
        x: rng() * 800, y: rng() * 8000, radius: id % 3 ? 0 : 80, pierce: id % 2 === 0, damage: 1
    }));
    const expected = game.asteroids.map(rock => ({ ...rock }));
    const expectedBullets = game.playerBullets.map(bullet => ({ ...bullet, hits: bullet.hits ? new Set() : null }));
    for (const bullet of expectedBullets) {
        for (const rock of expected) {
            if (rock.hp <= 0 || !collision(bullet, rock)) continue;
            rock.hp -= bullet.damage;
            if (bullet.hits) bullet.hits.add(rock.id);
            else bullet.life = 0;
            if (!bullet.pierce) break;
        }
    }
    game.resolvePlayerHits();
    assert.deepEqual(game.asteroids.map(rock => rock.hp), expected.map(rock => rock.hp));
    assert.deepEqual(game.playerBullets.map(bullet => [bullet.life, bullet.hits && [...bullet.hits]]),
        expectedBullets.map(bullet => [bullet.life, bullet.hits && [...bullet.hits]]));
});

test('cosmetic explosions are bounded, expire and do not grow during pause logs', () => {
    const game = new Game({ seed: 7 });
    game.startCampaign(1);
    for (let burst = 0; burst < 100; burst++) game.spawnExplosion(400, 900, '#fff', 70);
    assert.equal(game.particles.length, Game.MAX_PARTICLES);
    game.updateParticles(2);
    assert.equal(game.particles.length, 0);
    game.step([{}]);
    const log = game.getRunLog();
    const elapsed = game.runElapsed;
    game.handleAction('pause');
    for (let frame = 0; frame < 3600; frame++) game.step([{}]);
    assert.equal(game.getRunLog().frames.frames, log.frames.frames);
    assert.equal(game.runElapsed, elapsed);
});
