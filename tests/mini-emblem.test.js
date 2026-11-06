const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../src/js/game');
const { populateLevel, MINI_EMBLEM_LEVELS, EXTRA_LIFE_LEVELS } = require('../src/js/levelLayout');
const { getLevel } = require('../src/js/levels');
const { createRng } = require('../src/js/rng');
const { validateLevelRecord } = require('../src/js/save');
const card = require('../src/js/render/cardMath');
const { normalizeEvent } = require('../src/js/render/events');
const { playerScale } = require('../src/js/render/players');

function quietGame() {
    const game = new Game({ seed: 11 });
    game.startCampaign(1, 'pilot');
    game.asteroids = [];
    game.enemyBullets = [];
    game.pickups = [];
    game.ship.invulnerable = 0;
    return game;
}

test('the Mini emblem appears once, deterministically, in its four levels only', () => {
    const found = [];
    for (let level = 1; level <= 20; level++) {
        const config = getLevel(level, level > 10 ? 'pilot' : 'cadet');
        const first = populateLevel(config, createRng(config.seed));
        assert.deepEqual(first.pickups, populateLevel(config, createRng(config.seed)).pickups);
        const minis = first.pickups.filter(pickup => pickup.type === 'mini');
        if (!minis.length) continue;
        found.push(level);
        assert.equal(minis.length, 1);
        assert.equal(minis[0].y, config.length * 0.4);
        assert.ok(minis[0].x >= 240 && minis[0].x < 560);
    }
    assert.deepEqual(found, MINI_EMBLEM_LEVELS);
    assert.ok(MINI_EMBLEM_LEVELS.every(level => !EXTRA_LIFE_LEVELS.includes(level)));
});

test('the emblem flies down toward the ship and weaves once it is in range', () => {
    const game = quietGame();
    const far = { type: 'mini', x: 400, homeX: 400, y: game.scrollY + 2000, size: 16 };
    const near = { type: 'mini', x: 400, homeX: 400, y: game.scrollY + 600, size: 16 };
    game.pickups = [far, near];
    game.updatePickups(0.5);
    assert.equal(far.y, game.scrollY + 2000);
    assert.equal(near.y, game.scrollY + 600 - 35);
    assert.notEqual(near.x, 400);
    assert.ok(near.x >= 60 && near.x <= 740);
});

test('collecting the emblem halves the ship until five real hits land', () => {
    const game = quietGame();
    const ship = game.ship;
    const fullSize = ship.size;
    game.pickups = [{ type: 'mini', x: ship.x, y: ship.y, size: 16 }];
    game.resolveShipHits();
    assert.equal(ship.miniHits, 5);
    assert.equal(ship.size, fullSize / 2);
    assert.equal(playerScale(1, ship), 0.5);
    assert.equal(game.levelStats.pickupsCollected.mini, 1);

    ship.shield = 3;
    game.damageShip(1, ship.x, ship.y);
    assert.equal(ship.miniHits, 5, 'shield-blocked hits do not count');
    ship.shield = 0;
    ship.invulnerable = 0.3;
    game.damageShip(1, ship.x, ship.y);
    assert.equal(ship.miniHits, 5, 'hits during invulnerability do not count');

    for (let hit = 0; hit < 5; hit++) {
        ship.invulnerable = 0;
        game.damageShip(1, ship.x, ship.y);
    }
    assert.equal(ship.miniHits, 0);
    assert.equal(ship.size, fullSize);
    assert.equal(playerScale(1, ship), 1);
    assert.equal(ship.power, ship.maxPower - 5, 'hits still cost power');
    assert.equal(game.levelStats.miniHitsAbsorbed, 5);
    assert.equal(game.drainEvents().filter(event => event.type === 'miniEnded').length, 1);
});

test('losing a life ends Mini mode, and the effect carries into the next level otherwise', () => {
    const game = quietGame();
    game.collectPickup({ type: 'mini', x: game.ship.x, y: game.ship.y });
    game.startLevel(2);
    assert.equal(game.ship.miniHits, 5);
    assert.equal(game.ship.size, game.ship.baseSize / 2);
    game.ship.invulnerable = 0;
    game.damageShip(1000, game.ship.x, game.ship.y);
    assert.equal(game.ship.miniHits, 0);
    assert.equal(game.ship.size, game.ship.baseSize);
});

test('multiplayer Mini ships keep their crew scale when they shrink and recover', () => {
    const game = quietGame();
    game.setPlayers(3);
    const ship = game.ships[2];
    const crewSize = ship.size;
    game.collectPickup({ type: 'mini', x: ship.x, y: ship.y }, ship, 2);
    assert.equal(ship.size, crewSize / 2);
    assert.equal(game.ships[0].miniHits, 0);
    ship.miniHits = 1;
    ship.invulnerable = 0;
    game.damageShip(1, ship.x, ship.y, ship, 2);
    assert.equal(ship.size, crewSize);
});

test('older level records without Lotus or Mini counters still validate', () => {
    const record = card.sampleRecord();
    assert.equal(record.stats.pickupsCollected.life, undefined);
    const valid = validateLevelRecord(record, 'Sample record');
    assert.equal(valid.stats.pickupsCollected.life, 0);
    assert.equal(valid.stats.pickupsCollected.mini, 0);
    assert.equal(valid.stats.miniHitsAbsorbed, 0);
});

test('pickup effects keep Lotus, Mini and Sector II kinds instead of treating them as power', () => {
    for (const kind of ['life', 'mini', 'nova', 'prism', 'singularity']) {
        assert.equal(normalizeEvent({ type: 'pickup', pickupType: kind }).pickupType, kind);
    }
    assert.equal(normalizeEvent({ type: 'pickup', pickupType: 'mystery' }).pickupType, 'power');
});
