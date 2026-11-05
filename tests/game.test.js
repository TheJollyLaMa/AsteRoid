const test = require('node:test');
const assert = require('node:assert/strict');

const Game = require('../src/js/game');
const Asteroid = require('../src/js/asteroid');
const Bullet = require('../src/js/bullet');
const { getLevel, LEVEL_COUNT } = require('../src/js/levels');
const { populateLevel } = require('../src/js/levelLayout');
const { createRng } = require('../src/js/rng');
const { applyWeaponPickup, downgradeWeapon, fireWeapon, createWeapon } = require('../src/js/weapons');
const { projectPov, povCamera, projectOverview } = require('../src/js/render/projection');

function memoryStorage() {
    const data = new Map();
    return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

function playingGame(level = 1) {
    const game = new Game({ storage: memoryStorage() });
    game.startCampaign(level);
    game.asteroids = [];
    game.pickups = [];
    game.ship.invulnerable = 0;
    return game;
}

test('there are 10 levels with rising difficulty', () => {
    assert.equal(LEVEL_COUNT, 10);
    const levels = Array.from({ length: 10 }, (_, i) => getLevel(i + 1));
    for (let i = 1; i < levels.length; i++) {
        assert.ok(levels[i].scrollSpeed > levels[i - 1].scrollSpeed);
        assert.ok(levels[i].density > levels[i - 1].density);
        assert.ok(levels[i].shooterChance > levels[i - 1].shooterChance);
        assert.ok(levels[i].fireInterval < levels[i - 1].fireInterval);
        assert.ok(levels[i].enemyBulletSpeed > levels[i - 1].enemyBulletSpeed);
    }
    assert.throws(() => getLevel(11), RangeError);
});

test('early levels use stationary asteroids, later levels move', () => {
    for (const n of [1, 2, 3]) {
        const { asteroids } = populateLevel(getLevel(n), createRng(getLevel(n).seed));
        assert.ok(asteroids.length > 0);
        assert.ok(asteroids.every((a) => a.vx === 0 && a.vy === 0), `level ${n} should be stationary`);
    }
    const late = populateLevel(getLevel(8), createRng(getLevel(8).seed));
    assert.ok(late.asteroids.some((a) => a.vy < 0), 'level 8 has rocks charging the ship');
});

test('levels are deterministic and keep the launch zone clear', () => {
    const a = populateLevel(getLevel(5), createRng(getLevel(5).seed));
    const b = populateLevel(getLevel(5), createRng(getLevel(5).seed));
    assert.deepEqual(a.asteroids.map((r) => [r.x, r.y]), b.asteroids.map((r) => [r.x, r.y]));
    assert.ok(a.asteroids.every((r) => r.y >= 500));
    assert.ok(a.pickups.length >= getLevel(5).pickups);
});

test('weapon pickups switch, upgrade to tier 3, and downgrade on death', () => {
    let weapon = createWeapon();
    weapon = applyWeaponPickup(weapon, 'spread');
    assert.deepEqual(weapon, { type: 'spread', tier: 1 });
    weapon = applyWeaponPickup(applyWeaponPickup(applyWeaponPickup(weapon, 'spread'), 'spread'), 'spread');
    assert.deepEqual(weapon, { type: 'spread', tier: 3 });
    const ship = { x: 400, y: 100, size: 12 };
    assert.equal(fireWeapon(weapon, ship, 60).bullets.length, 7);
    assert.deepEqual(downgradeWeapon(weapon), { type: 'spread', tier: 2 });
    assert.deepEqual(downgradeWeapon({ type: 'rapid', tier: 1 }), { type: 'blaster', tier: 1 });
});

test('flying through a pickup applies it', () => {
    const game = playingGame();
    game.ship.power = 30;
    game.pickups = [
        { x: game.ship.x, y: game.ship.y, type: 'plasma', size: 14 },
        { x: game.ship.x, y: game.ship.y, type: 'power', size: 14 }
    ];
    game.update(0.016, {});
    assert.equal(game.ship.weapon.type, 'plasma');
    assert.equal(game.ship.power, 70);
    assert.equal(game.pickups.length, 0);
});

test('shooter asteroids fire back at the ship and bullets drain power', () => {
    const game = playingGame(3);
    const shooter = new Asteroid({ x: game.ship.x, y: game.ship.y + 300, size: 20, shooter: true, fireCooldown: 0 });
    game.asteroids = [shooter];
    game.update(0.016, {});
    assert.equal(game.enemyBullets.length, 1);
    const bullet = game.enemyBullets[0];
    assert.ok(bullet.vy - game.level.scrollSpeed < 0, 'bullet travels toward the ship');

    game.enemyBullets = [new Bullet({ x: game.ship.x, y: game.ship.y, damage: 25, owner: 'enemy' })];
    game.update(0.016, {});
    assert.equal(game.ship.power, 75);
});

test('player shots destroy and split asteroids for score', () => {
    const game = playingGame();
    const rock = new Asteroid({ x: game.ship.x, y: game.ship.y + 60, size: 30, hp: 1 });
    game.asteroids = [rock];
    game.update(0.016, { fire: true });
    for (let i = 0; i < 20; i++) game.update(0.016, {});
    assert.ok(game.score > 0);
    assert.equal(game.asteroids.filter((a) => a.id === rock.id).length, 0);
    assert.equal(game.asteroids.length, 2, 'large rock splits into two fragments');
});

test('shield blocks damage; losing all power costs a life then respawns', () => {
    const game = playingGame();
    game.ship.shield = 5;
    game.damageShip(80, 0, 0);
    assert.equal(game.ship.power, 100);
    game.ship.shield = 0;
    game.damageShip(200, 0, 0);
    assert.equal(game.state, 'dying');
    assert.equal(game.ship.lives, 2);
    for (let i = 0; i < 200; i++) game.update(0.016, {});
    assert.equal(game.state, 'playing');
    assert.equal(game.ship.power, 100);
});

test('game over after the last life, and Enter retries the level', () => {
    const game = playingGame(2);
    game.ship.lives = 1;
    game.damageShip(500, 0, 0);
    for (let i = 0; i < 200; i++) game.update(0.016, {});
    assert.equal(game.state, 'gameOver');
    game.handleAction('confirm');
    assert.equal(game.state, 'playing');
    assert.equal(game.level.number, 2);
    assert.equal(game.ship.lives, 3);
});

test('reaching the jump gate completes the level, unlocks and saves progress', () => {
    const storage = memoryStorage();
    const game = new Game({ storage });
    game.startCampaign(1);
    game.asteroids = [];
    game.pickups = [];
    game.scrollY = game.level.length;
    game.update(0.016, {});
    assert.equal(game.state, 'levelComplete');
    assert.equal(game.progress.unlocked, 2);
    assert.equal(JSON.parse(storage.getItem(Game.STORAGE_KEY)).unlocked, 2);
    game.handleAction('confirm');
    assert.equal(game.level.number, 2);

    const resumed = new Game({ storage });
    assert.equal(resumed.selectedLevel, 2);
});

test('clearing level 10 wins the campaign', () => {
    const game = playingGame(10);
    game.scrollY = game.level.length;
    game.update(0.016, {});
    assert.equal(game.state, 'victory');
});

test('view toggles between overview and POV, and POV projects distant objects small', () => {
    const game = playingGame();
    assert.equal(game.view, 'overview');
    game.handleAction('toggleView');
    assert.equal(game.view, 'pov');
    const camera = povCamera(game.ship);
    const near = projectPov({ x: game.ship.x, y: game.ship.y + 100 }, camera);
    const far = projectPov({ x: game.ship.x, y: game.ship.y + 1000 }, camera);
    assert.ok(near.scale > far.scale);
    assert.ok(near.y > far.y, 'distant objects sit nearer the horizon');
    assert.equal(projectPov({ x: 0, y: camera.y - 10 }, camera), null);
    assert.ok(projectOverview({ x: 0, y: game.scrollY + 100 }, game.scrollY).y < projectOverview({ x: 0, y: game.scrollY }, game.scrollY).y);
});
