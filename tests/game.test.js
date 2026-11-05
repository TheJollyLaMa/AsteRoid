const test = require('node:test');
const assert = require('node:assert/strict');

const Game = require('../src/js/game');
const Asteroid = require('../src/js/asteroid');
const Bullet = require('../src/js/bullet');
const { getLevel, LEVEL_COUNT, TOTAL_LEVEL_COUNT, LEVEL_NAMES } = require('../src/js/levels');
const { DIFFICULTIES } = require('../src/js/difficulty');
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
    assert.equal(TOTAL_LEVEL_COUNT, 20);
    const levels = Array.from({ length: 10 }, (_, i) => getLevel(i + 1));
    for (let i = 1; i < levels.length; i++) {
        assert.ok(levels[i].scrollSpeed > levels[i - 1].scrollSpeed);
        assert.ok(levels[i].density > levels[i - 1].density);
        assert.ok(levels[i].shooterChance > levels[i - 1].shooterChance);
        assert.ok(levels[i].fireInterval < levels[i - 1].fireInterval);
        assert.ok(levels[i].enemyBulletSpeed > levels[i - 1].enemyBulletSpeed);
    }
    assert.throws(() => getLevel(21), RangeError);
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
    const saved = JSON.parse(storage.getItem(Game.STORAGE_KEY));
    assert.equal(saved.progress.byDifficulty.cadet.unlocked, 2);
    assert.equal(saved.progress.byDifficulty.pilot.unlocked, 1);
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

// The pre-difficulty tuning, copied verbatim so cadet can be checked against it.
function legacyLevel(n) {
    return {
        number: n,
        name: LEVEL_NAMES[n - 1],
        length: 2600 + n * 500,
        scrollSpeed: 60 + n * 10,
        density: 5 + n * 2,
        movingChance: n <= 3 ? 0 : Math.min(0.85, (n - 3) * 0.13),
        driftSpeed: n <= 3 ? 0 : 6 + n * 3,
        approachSpeed: n <= 4 ? 0 : (n - 4) * 10,
        shooterChance: 0.1 + n * 0.04,
        fireInterval: 3.4 - n * 0.2,
        enemyBulletSpeed: 110 + n * 16,
        aimError: Math.max(0.04, 0.35 - n * 0.03),
        bulletDamage: 8 + n,
        gauntlets: Math.ceil(n / 2),
        pickups: 4 + Math.floor(n / 2),
        seed: 1000 + n * 7919
    };
}

const layoutSnapshot = ({ asteroids, pickups }) => ({
    asteroids: asteroids.map((a) => [a.x, a.y, a.size, a.vx, a.vy, a.maxHp, a.shooter]),
    pickups: pickups.map((p) => [p.x, p.y, p.type])
});

test('cadet keeps the original tuning and layouts exactly', () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
        const legacy = legacyLevel(n);
        const cadet = getLevel(n, 'cadet');
        assert.equal(JSON.stringify(cadet), JSON.stringify(legacy), `level ${n} byte-identical configuration`);
        assert.deepEqual(getLevel(n), cadet);
        assert.deepEqual(
            layoutSnapshot(populateLevel(cadet, createRng(cadet.seed))),
            layoutSnapshot(populateLevel(legacy, createRng(legacy.seed))),
            `level ${n} layout`
        );
    }
});

test('ace is harder than pilot, which is harder than cadet', () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
        const [c, p, a] = ['cadet', 'pilot', 'ace'].map((d) => getLevel(n, d));
        for (const key of ['scrollSpeed', 'density', 'shooterChance', 'enemyBulletSpeed', 'bulletDamage', 'gauntlets']) {
            assert.ok(p[key] > c[key] && a[key] > p[key], `level ${n} ${key}`);
        }
        for (const key of ['fireInterval', 'aimError', 'powerRestore', 'shieldTime']) {
            assert.ok(p[key] < (c[key] ?? DIFFICULTIES.cadet[key]) && a[key] < p[key], `level ${n} ${key}`);
        }
        assert.ok(a.pickups <= p.pickups && p.pickups <= c.pickups);
        assert.ok(a.movingChance >= p.movingChance && p.movingChance >= c.movingChance);
        assert.ok(a.scoreMultiplier > p.scoreMultiplier && p.scoreMultiplier > 1);
    }
    assert.ok(getLevel(1, 'ace').movingChance > 0, 'ace rocks move from level 1');
    assert.ok(DIFFICULTIES.ace.lives < DIFFICULTIES.cadet.lives);
    const aceLayout = populateLevel(getLevel(1, 'ace'), createRng(getLevel(1, 'ace').seed));
    const cadetLayout = populateLevel(getLevel(1), createRng(getLevel(1).seed));
    assert.ok(aceLayout.asteroids.length > cadetLayout.asteroids.length * 1.5);
    assert.ok(aceLayout.pickups.length < cadetLayout.pickups.length);
    assert.throws(() => getLevel(1, 'nightmare'), RangeError);
});

test('levels are deterministic per level and difficulty', () => {
    for (const d of ['pilot', 'ace']) {
        const a = populateLevel(getLevel(6, d), createRng(getLevel(6, d).seed));
        const b = populateLevel(getLevel(6, d), createRng(getLevel(6, d).seed));
        assert.deepEqual(layoutSnapshot(a), layoutSnapshot(b));
        assert.notEqual(getLevel(6, d).seed, getLevel(6).seed);
    }
});

test('ace gauntlet walls are solid', () => {
    const level = getLevel(1, 'ace');
    const { asteroids } = populateLevel(level, createRng(level.seed));
    const wall = asteroids.filter((a) => a.size === 20 && a.maxHp === 2);
    assert.ok(wall.length >= 28, 'two full rows of armoured wall rocks');
});

test('title screen picks a difficulty; progress is tracked per difficulty', () => {
    const storage = memoryStorage();
    const game = new Game({ storage });
    assert.equal(game.selectedDifficulty, 'cadet');
    game.handleAction('difficultyNext');
    assert.equal(game.selectedDifficulty, 'pilot');
    game.handleAction('difficultyNext');
    game.handleAction('difficultyNext');
    assert.equal(game.selectedDifficulty, 'cadet', 'wraps around');
    game.handleAction('difficultyPrev');
    assert.equal(game.selectedDifficulty, 'ace');
    assert.equal(game.selectedDifficultyLabel, 'Ace');
    game.handleAction('confirm');
    assert.equal(game.difficulty, 'ace');
    assert.equal(game.difficultyLabel, 'Ace');
    assert.equal(game.level.difficulty, 'ace');
    assert.equal(game.ship.lives, DIFFICULTIES.ace.lives);
    game.asteroids = [];
    game.scrollY = game.level.length;
    game.update(0.016, {});
    assert.equal(game.state, 'levelComplete');
    assert.equal(game.progress.unlocked, 2);
    assert.ok(game.progress.bestLevelScores['1'] > 0);
    assert.equal(game.getProgress('cadet').unlocked, 1);
    game.handleAction('difficultyNext');
    assert.equal(game.selectedDifficulty, 'ace', 'difficulty is fixed outside the title screen');

    const resumed = new Game({ storage });
    assert.equal(resumed.selectedDifficulty, 'ace', 'remembers the last difficulty played');
    assert.equal(resumed.selectedLevel, 2);
    assert.equal(resumed.progress.unlocked, 2);
    resumed.handleAction('right');
    assert.equal(resumed.selectedLevel, 2, 'cannot pick past the unlocked level');
    resumed.handleAction('difficultyPrev');
    assert.equal(resumed.selectedDifficulty, 'pilot');
    assert.equal(resumed.selectedLevel, 1, 'pilot is still locked to level 1');
    assert.equal(resumed.progress.unlocked, 1);
});

test('score multiplier rewards harder difficulties', () => {
    const scores = {};
    for (const d of ['cadet', 'pilot', 'ace']) {
        const game = new Game();
        game.selectedDifficulty = d;
        game.startCampaign(1);
        game.asteroids = [];
        game.destroyAsteroid(new Asteroid({ x: 0, y: 0, size: 14, hp: 1 }));
        scores[d] = game.score;
    }
    assert.equal(scores.cadet, 75);
    assert.ok(scores.ace > scores.pilot && scores.pilot > scores.cadet);
});

test('legacy progress migrates to cadet', () => {
    const storage = memoryStorage();
    storage.setItem(Game.LEGACY_STORAGE_KEY, JSON.stringify({ unlocked: 7, highScore: 12345 }));
    const game = new Game({ storage });
    assert.equal(game.selectedDifficulty, 'cadet');
    assert.equal(game.progress.unlocked, 7);
    assert.equal(game.progress.highScore, 12345);
    assert.equal(game.getProgress('pilot').unlocked, 1);
});

test('pickup event keeps its event discriminator and reports pickupType', () => {
    const game = playingGame();
    game.pickups = [{ x: game.ship.x, y: game.ship.y, type: 'power', size: 14 }];
    game.update(0.016, {});
    const event = game.drainEvents().find((e) => e.type === 'pickup');
    assert.equal(event.pickupType, 'power');
    assert.equal(event.x, 400);
    assert.ok(Number.isFinite(event.y));
});

test('invalid campaign starts do not alter an existing game', () => {
    const game = playingGame();
    game.score = 123;
    assert.throws(() => game.startCampaign(11));
    assert.equal(game.score, 123);
    assert.equal(game.level.number, 1);
});
