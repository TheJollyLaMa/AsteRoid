const test = require('node:test');
const assert = require('node:assert/strict');

const Game = require('../src/js/game');
const Asteroid = require('../src/js/asteroid');
const Bullet = require('../src/js/bullet');
const { BATTLE_LOG_CAPS, COMBO_WINDOW, RECORD_SCHEMA, LevelTracker } = require('../src/js/stats');
const { validateLevelRecord } = require('../src/js/save');

const FIXED_NOW = Date.parse('2026-11-05T12:00:00.000Z');

function playingGame(level = 1, difficulty = 'cadet') {
    let now = FIXED_NOW;
    const game = new Game({ now: () => (now += 1000) });
    game.selectedDifficulty = difficulty;
    game.startCampaign(level);
    game.asteroids = [];
    game.pickups = [];
    game.ship.invulnerable = 0;
    return game;
}

const run = (game, frames, input = {}) => {
    for (let i = 0; i < frames; i++) game.update(1 / 60, input);
};

test('firing counts projectiles, volleys and shots by weapon', () => {
    const game = playingGame();
    game.update(0.016, { fire: true });
    assert.equal(game.levelStats.shotsFired, 1);
    assert.equal(game.levelStats.volleys, 1);
    game.ship.weapon = { type: 'spread', tier: 3 };
    game.ship.cooldown = 0;
    game.update(0.016, { fire: true });
    const stats = game.levelStats;
    assert.equal(stats.shotsFired, 8);
    assert.equal(stats.volleys, 2);
    assert.deepEqual(stats.shotsByWeapon, { blaster: 1, spread: 7, rapid: 0, plasma: 0, nova: 0, prism: 0, singularity: 0 });
    assert.equal(stats.hits, 0);
    assert.equal(stats.accuracy, 0);
});

test('hits, kills, accuracy and combo', () => {
    const game = playingGame();
    game.asteroids = [new Asteroid({ x: game.ship.x, y: game.ship.y + 60, size: 14, hp: 1 })];
    game.update(0.016, { fire: true });
    run(game, 10);
    let stats = game.levelStats;
    assert.equal(stats.hits, 1);
    assert.equal(stats.asteroidsDestroyed, 1);
    assert.equal(stats.accuracy, 1);
    assert.equal(game.combo, 1);
    assert.ok(game.comboTimer > 0 && game.comboTimer <= COMBO_WINDOW);

    game.asteroids = [new Asteroid({ x: game.ship.x, y: game.ship.y + 60, size: 14, hp: 1, shooter: true })];
    game.ship.cooldown = 0;
    game.update(0.016, { fire: true });
    run(game, 10);
    stats = game.levelStats;
    assert.equal(game.combo, 2);
    assert.equal(stats.maxCombo, 2);
    assert.equal(stats.shootersDestroyed, 1);

    game.ship.cooldown = 0;
    game.update(0.016, { fire: true });
    run(game, 120);
    stats = game.levelStats;
    assert.equal(stats.shotsFired, 3);
    assert.equal(stats.accuracy, 2 / 3);
    assert.equal(game.combo, 0, 'combo lapses after the window');
    assert.equal(stats.maxCombo, 2);
});

test('taking damage resets the combo and is recorded', () => {
    const game = playingGame();
    game.tracker.destroyed({ x: 0, y: 0, size: 10, shooter: false }, true);
    game.tracker.destroyed({ x: 0, y: 0, size: 10, shooter: false }, true);
    assert.equal(game.combo, 2);
    game.damageShip(20, 5, 6);
    assert.equal(game.combo, 0);
    const stats = game.levelStats;
    assert.equal(stats.hitsTaken, 1);
    assert.equal(stats.damageTaken, 20);
    assert.equal(stats.maxCombo, 2);
    game.ship.invulnerable = 0;
    game.ship.shield = 3;
    game.damageShip(20, 0, 0);
    assert.equal(game.levelStats.shieldBlocks, 1);
    assert.equal(game.levelStats.hitsTaken, 1);
});

test('asteroids passing behind the ship count as missed', () => {
    const game = playingGame();
    game.asteroids = [new Asteroid({ x: 100, y: game.ship.y + 40, size: 14 })];
    const spawnedBefore = game.levelStats.asteroidsSpawned;
    run(game, 90);
    assert.equal(game.levelStats.asteroidsMissed, 1);
    assert.equal(game.levelStats.asteroidsSpawned, spawnedBefore, 'injected rocks are not layout spawns');
    const missed = game.drainEvents().filter((e) => e.type === 'asteroidMissed');
    assert.equal(missed.length, 1);
    assert.ok(Number.isFinite(missed[0].x) && Number.isFinite(missed[0].y));
});

test('fragments count as spawned and destroyed fragments', () => {
    const game = playingGame();
    const before = game.levelStats.asteroidsSpawned;
    const fragments = game.destroyAsteroid(new Asteroid({ x: 400, y: game.ship.y + 300, size: 30, hp: 1 }));
    assert.equal(fragments.length, 2);
    assert.equal(game.levelStats.asteroidsSpawned, before + 2);
    game.destroyAsteroid(fragments[0]);
    assert.equal(game.levelStats.fragmentsDestroyed, 1);
});

test('enemy bullets that expire are dodged and record the closest call', () => {
    const game = playingGame(3);
    game.enemyBullets = [new Bullet({ x: game.ship.x + 30, y: game.ship.y + 5, vy: game.level.scrollSpeed, size: 4, life: 0.1, owner: 'enemy' })];
    game.tracker.enemyShot();
    run(game, 12);
    const stats = game.levelStats;
    assert.equal(stats.enemyShotsDodged, 1);
    assert.ok(stats.closestCall >= 0 && stats.closestCall < 20, `closestCall ${stats.closestCall}`);
    game.enemyBullets = [new Bullet({ x: game.ship.x, y: game.ship.y, damage: 10, owner: 'enemy' })];
    run(game, 2);
    assert.equal(game.levelStats.enemyShotsDodged, 1, 'a bullet that hits is not dodged');
    assert.equal(game.levelStats.hitsTaken, 1);
});

test('enemy fire is counted', () => {
    const game = playingGame(3);
    game.asteroids = [new Asteroid({ x: game.ship.x, y: game.ship.y + 300, size: 20, shooter: true, fireCooldown: 0 })];
    game.update(0.016, {});
    assert.equal(game.levelStats.enemyShotsFired, 1);
});

test('pickups collected by type and missed pickups', () => {
    const game = playingGame();
    game.pickups = [
        { x: game.ship.x, y: game.ship.y, type: 'shield', size: 14 },
        { x: 700, y: game.ship.y + 30, type: 'rapid', size: 14 }
    ];
    run(game, 90);
    const stats = game.levelStats;
    assert.equal(stats.pickupsCollected.shield, 1);
    assert.equal(stats.pickupsMissed, 1);
});

test('rock collisions are counted', () => {
    const game = playingGame();
    game.asteroids = [new Asteroid({ x: game.ship.x, y: game.ship.y, size: 14, hp: 1 })];
    game.update(0.016, {});
    assert.equal(game.levelStats.collisions, 1);
    assert.equal(game.levelStats.hitsTaken, 1);
});

test('view time is tracked', () => {
    const game = playingGame();
    run(game, 60);
    game.handleAction('toggleView');
    run(game, 30);
    const stats = game.levelStats;
    assert.ok(Math.abs(stats.timeInOverview - 1) < 0.02);
    assert.ok(Math.abs(stats.timeInPov - 0.5) < 0.02);
});

test('battle log path is capped at 300 points but spans the whole flight', () => {
    const tracker = new LevelTracker();
    for (let i = 0; i < 20000; i++) tracker.tick(0.05, { x: 400, y: i }, 'overview');
    assert.ok(tracker.log.path.length <= BATTLE_LOG_CAPS.path);
    assert.ok(tracker.log.path.length > 100);
    assert.ok(tracker.log.path[tracker.log.path.length - 1][1] > 19000);
    for (let i = 0; i < 1000; i++) tracker.destroyed({ x: 1, y: 2, size: 3, shooter: true }, false);
    assert.equal(tracker.log.kills.length, BATTLE_LOG_CAPS.kills);
});

test('clearing a level emits a JSON-safe LevelRecord and stores it', () => {
    const game = playingGame(1, 'pilot');
    game.asteroids = [new Asteroid({ x: game.ship.x, y: game.ship.y + 60, size: 14, hp: 1 })];
    game.update(0.016, { fire: true });
    run(game, 120, {});
    game.scrollY = game.level.length;
    game.update(0.016, {});
    const events = game.drainEvents();
    const types = events.map((e) => e.type);
    assert.ok(types.indexOf('levelRecord') < types.indexOf('levelComplete'));
    const { record } = events.find((e) => e.type === 'levelRecord');
    assert.equal(record.schema, RECORD_SCHEMA);
    assert.equal(record.game, 'AsteRoid: Galactic Gauntlet');
    assert.equal(record.gameVersion, '2.0.0');
    assert.equal(record.level, 1);
    assert.equal(record.levelName, 'Drydock Drift');
    assert.equal(record.difficulty, 'pilot');
    assert.equal(record.difficultyLabel, 'Pilot');
    assert.equal(record.seed, game.level.seed);
    assert.match(record.id, /^2026-11-05T12:00:\d\d\.\d{3}Z-pilot-L1-[0-9a-z]+$/);
    assert.ok(Date.parse(record.completedAt) > Date.parse(record.startedAt));
    assert.deepEqual(Object.keys(record.score).sort(), ['bonus', 'level', 'total']);
    assert.equal(record.score.total, game.score);
    assert.equal(record.score.bonus, game.levelBonus);
    assert.deepEqual(Object.keys(record.ship).sort(), ['finalPower', 'finalWeapon', 'livesLost', 'livesRemaining', 'view']);
    for (const key of ['shotsFired', 'shotsByWeapon', 'hits', 'accuracy', 'asteroidsSpawned', 'asteroidsDestroyed', 'asteroidsMissed',
        'shootersDestroyed', 'fragmentsDestroyed', 'enemyShotsFired', 'enemyShotsDodged', 'hitsTaken', 'collisions', 'shieldBlocks',
        'damageTaken', 'pickupsCollected', 'pickupsMissed', 'maxCombo', 'timeInPov', 'timeInOverview', 'closestCall']) {
        assert.ok(key in record.stats, key);
    }
    assert.equal(record.stats.hits, 1);
    assert.equal(record.stats.asteroidsDestroyed, 1);
    assert.deepEqual(Object.keys(record.battleLog).sort(), ['hitsTaken', 'kills', 'levelLength', 'misses', 'path', 'pickups', 'worldWidth']);
    assert.equal(record.battleLog.worldWidth, 800);
    assert.equal(record.battleLog.kills.length, 1);
    assert.equal(record.battleLog.kills[0].length, 4);
    assert.ok(record.battleLog.path.length > 2);

    assert.deepEqual(JSON.parse(JSON.stringify(record)), record, 'JSON-safe');
    const numbers = [];
    JSON.stringify(record, (k, v) => (typeof v === 'number' && numbers.push(v), v));
    assert.ok(numbers.every(Number.isFinite));
    assert.deepEqual(validateLevelRecord(record), record, 'passes save validation unchanged');
    assert.deepEqual(game.getWinRecords(), [record]);
    assert.ok(game.getLifetimeStats().levelsCleared === 1);
});

test('level 10 emits levelRecord before victory', () => {
    const game = playingGame(10);
    game.scrollY = game.level.length;
    game.update(0.016, {});
    const types = game.drainEvents().map((e) => e.type);
    assert.ok(types.includes('levelRecord'));
    assert.ok(types.indexOf('levelRecord') < types.indexOf('victory'));
    assert.equal(game.getRunStats().victories, 1);
});

test('win records are capped at 200, newest last', () => {
    const game = playingGame();
    for (let i = 0; i < 205; i++) {
        game.startLevel(1);
        game.asteroids = [];
        game.scrollY = game.level.length;
        game.update(0.016, {});
    }
    const wins = game.getWinRecords();
    assert.equal(wins.length, 200);
    assert.ok(Date.parse(wins[199].completedAt) > Date.parse(wins[0].completedAt));
});

test('failed and abandoned attempts feed lifetime totals once', () => {
    const game = playingGame(2);
    game.ship.lives = 1;
    game.update(0.016, { fire: true });
    game.damageShip(500, 0, 0);
    run(game, 200);
    assert.equal(game.state, 'gameOver');
    game.handleAction('menu');
    const lifetime = game.getLifetimeStats();
    assert.equal(lifetime.levelsFailed, 1);
    assert.equal(lifetime.levelsPlayed, 1);
    assert.equal(lifetime.livesLost, 1);
    assert.equal(lifetime.shotsFired, 1);
    game.handleAction('confirm');
    run(game, 10);
    game.handleAction('pause');
    game.handleAction('menu');
    assert.equal(game.getLifetimeStats().levelsAbandoned, 1);
    assert.equal(game.getLifetimeStats().campaignsStarted, 2);
});

test('zero-valued injected clock and duplicate completion calls are safe', () => {
    const game = new Game({ now: () => 0 });
    game.startCampaign(1);
    game.asteroids = [];
    game.scrollY = game.level.length;
    game.update(0.016, {});
    assert.equal(game.getLifetimeStats().levelsCleared, 1);
    const score = game.score;
    game.completeLevel();
    assert.equal(game.score, score);
    assert.equal(game.getWinRecords().length, 1);
});
