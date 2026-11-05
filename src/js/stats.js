// Per-level stats, combo tracking, battle log sampling and LevelRecord building.
//
// Definitions:
// - shotsFired: player projectiles spawned (a 7-way spread volley counts 7); volleys: trigger pulls.
// - hits: projectiles that struck at least one asteroid (a piercing plasma bolt counts once),
//   so accuracy = hits / shotsFired is always within 0..1.
// - asteroidsSpawned: layout asteroids plus fragments from broken rocks.
// - asteroidsDestroyed: asteroids destroyed by shots or by ramming them.
// - asteroidsMissed: un-destroyed asteroids that passed behind the ship.
// - enemyShotsDodged: enemy bullets that expired or left the world without touching the ship.
// - hitsTaken: hits that cost power; collisions: rocks the ship flew into (shielded or not);
//   shieldBlocks: bullets or rocks absorbed by the shield; damageTaken: power lost.
// - pickupsMissed: pickups that passed behind the ship uncollected.
// - combo: consecutive asteroid kills by the player's shots, each within COMBO_WINDOW seconds of
//   the previous kill, without the ship losing power in between. maxCombo is the level best.
// - closestCall: smallest gap in px between the ship's and a dodged enemy bullet's edges
//   (-1 when no enemy bullet was dodged).
const WEAPON_TYPES = ['blaster', 'spread', 'rapid', 'plasma'];
const PICKUP_TYPES = ['spread', 'rapid', 'plasma', 'power', 'shield'];
const COMBO_WINDOW = 2;
const RECORD_SCHEMA = 'asteroid-level-record/1';
const GAME_NAME = 'AsteRoid: Galactic Gauntlet';
const GAME_VERSION = '2.0.0';
const WORLD_WIDTH = 800;
const BATTLE_LOG_CAPS = { path: 300, kills: 400, hitsTaken: 200, pickups: 100, misses: 400 };
const PATH_INTERVAL = 0.25;

const COUNTER_FIELDS = [
    'shotsFired', 'volleys', 'hits', 'asteroidsSpawned', 'asteroidsDestroyed', 'asteroidsMissed',
    'shootersDestroyed', 'fragmentsDestroyed', 'enemyShotsFired', 'enemyShotsDodged', 'hitsTaken',
    'collisions', 'shieldBlocks', 'damageTaken', 'pickupsMissed', 'timeInPov', 'timeInOverview'
];

// Lifetime / run totals: counters are summed, maxCombo is a max, closestCall a min.
const TOTALS_COUNTER_FIELDS = [
    'levelsPlayed', 'levelsCleared', 'levelsFailed', 'levelsAbandoned', 'campaignsStarted', 'victories',
    'livesLost', 'playTimeSec', ...COUNTER_FIELDS
];

const zeroMap = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));
const round = (value, places = 2) => {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
};
const ratio = (hits, shots) => (shots > 0 ? Math.min(1, hits / shots) : 0);

function createLevelStats() {
    return {
        ...zeroMap(COUNTER_FIELDS),
        shotsByWeapon: zeroMap(WEAPON_TYPES),
        pickupsCollected: zeroMap(PICKUP_TYPES),
        maxCombo: 0,
        closestCall: -1
    };
}

function createTotals() {
    return {
        ...zeroMap(TOTALS_COUNTER_FIELDS),
        shotsByWeapon: zeroMap(WEAPON_TYPES),
        pickupsCollected: zeroMap(PICKUP_TYPES),
        maxCombo: 0,
        closestCall: -1,
        accuracy: 0
    };
}

function minCall(a, b) {
    if (a < 0) return b;
    if (b < 0) return a;
    return Math.min(a, b);
}

// outcome: 'cleared' | 'failed' | 'abandoned'
function mergeTotals(totals, stats, { outcome, livesLost = 0, durationSec = 0 } = {}) {
    for (const key of COUNTER_FIELDS) totals[key] = round((totals[key] || 0) + (stats[key] || 0));
    for (const key of WEAPON_TYPES) totals.shotsByWeapon[key] += stats.shotsByWeapon[key] || 0;
    for (const key of PICKUP_TYPES) totals.pickupsCollected[key] += stats.pickupsCollected[key] || 0;
    totals.maxCombo = Math.max(totals.maxCombo, stats.maxCombo || 0);
    totals.closestCall = minCall(totals.closestCall, stats.closestCall);
    totals.levelsPlayed += 1;
    if (outcome === 'cleared') totals.levelsCleared += 1;
    else if (outcome === 'failed') totals.levelsFailed += 1;
    else if (outcome === 'abandoned') totals.levelsAbandoned += 1;
    totals.livesLost += livesLost;
    totals.playTimeSec = round(totals.playTimeSec + durationSec);
    totals.accuracy = ratio(totals.hits, totals.shotsFired);
    return totals;
}

class LevelTracker {
    constructor() {
        this.stats = createLevelStats();
        this.log = { path: [], kills: [], hitsTaken: [], pickups: [], misses: [] };
        this.pathInterval = PATH_INTERVAL;
        this.pathTimer = PATH_INTERVAL;
        this.combo = 0;
        this.comboTimer = 0;
        this.livesLost = 0;
        this.finalized = false;
    }

    push(list, entry) {
        const log = this.log[list];
        if (log.length < BATTLE_LOG_CAPS[list]) log.push(entry.map((v) => (typeof v === 'number' ? Math.round(v) : v)));
    }

    tick(dt, ship, view) {
        if (view === 'pov') this.stats.timeInPov += dt;
        else this.stats.timeInOverview += dt;
        if (this.comboTimer > 0) {
            this.comboTimer = Math.max(0, this.comboTimer - dt);
            if (this.comboTimer === 0) this.combo = 0;
        }
        this.pathTimer += dt;
        if (this.pathTimer >= this.pathInterval) {
            this.pathTimer = 0;
            this.samplePath(ship);
        }
    }

    samplePath(ship) {
        const path = this.log.path;
        path.push([Math.round(ship.x), Math.round(ship.y)]);
        if (path.length > BATTLE_LOG_CAPS.path) {
            // Halve the resolution so the full flight always fits.
            this.log.path = path.filter((_, i) => i % 2 === 0);
            this.pathInterval *= 2;
        }
    }

    shot(weaponType, count) {
        this.stats.volleys += 1;
        this.stats.shotsFired += count;
        if (weaponType in this.stats.shotsByWeapon) this.stats.shotsByWeapon[weaponType] += count;
    }

    hit() {
        this.stats.hits += 1;
    }

    spawned(count) {
        this.stats.asteroidsSpawned += count;
    }

    destroyed(asteroid, byPlayerShot) {
        const s = this.stats;
        s.asteroidsDestroyed += 1;
        if (asteroid.shooter) s.shootersDestroyed += 1;
        if (asteroid.fragment) s.fragmentsDestroyed += 1;
        this.push('kills', [asteroid.x, asteroid.y, asteroid.size, asteroid.shooter ? 1 : 0]);
        if (byPlayerShot) {
            this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
            this.comboTimer = COMBO_WINDOW;
            s.maxCombo = Math.max(s.maxCombo, this.combo);
        }
    }

    missed(x, y) {
        this.stats.asteroidsMissed += 1;
        this.push('misses', [x, y]);
    }

    enemyShot() {
        this.stats.enemyShotsFired += 1;
    }

    dodged(nearest) {
        this.stats.enemyShotsDodged += 1;
        if (Number.isFinite(nearest)) this.stats.closestCall = minCall(this.stats.closestCall, round(Math.max(0, nearest), 1));
    }

    collision() {
        this.stats.collisions += 1;
    }

    shieldBlock() {
        this.stats.shieldBlocks += 1;
    }

    damaged(amount, x, y) {
        this.stats.hitsTaken += 1;
        this.stats.damageTaken = round(this.stats.damageTaken + amount);
        this.push('hitsTaken', [x, y]);
        this.combo = 0;
        this.comboTimer = 0;
    }

    pickup(type, x, y) {
        if (type in this.stats.pickupsCollected) this.stats.pickupsCollected[type] += 1;
        this.push('pickups', [x, y, type]);
    }

    pickupMissed() {
        this.stats.pickupsMissed += 1;
    }

    lifeLost() {
        this.livesLost += 1;
    }

    snapshot() {
        const s = this.stats;
        return {
            shotsFired: s.shotsFired,
            volleys: s.volleys,
            shotsByWeapon: { ...s.shotsByWeapon },
            hits: s.hits,
            accuracy: ratio(s.hits, s.shotsFired),
            asteroidsSpawned: s.asteroidsSpawned,
            asteroidsDestroyed: s.asteroidsDestroyed,
            asteroidsMissed: s.asteroidsMissed,
            shootersDestroyed: s.shootersDestroyed,
            fragmentsDestroyed: s.fragmentsDestroyed,
            enemyShotsFired: s.enemyShotsFired,
            enemyShotsDodged: s.enemyShotsDodged,
            hitsTaken: s.hitsTaken,
            collisions: s.collisions,
            shieldBlocks: s.shieldBlocks,
            damageTaken: round(s.damageTaken),
            pickupsCollected: { ...s.pickupsCollected },
            pickupsMissed: s.pickupsMissed,
            maxCombo: s.maxCombo,
            timeInPov: round(s.timeInPov),
            timeInOverview: round(s.timeInOverview),
            closestCall: s.closestCall
        };
    }

    battleLog(level, ship) {
        const path = this.log.path.map((point) => point.slice());
        const last = [Math.round(ship.x), Math.round(ship.y)];
        if (path.length < BATTLE_LOG_CAPS.path) path.push(last);
        else path[path.length - 1] = last;
        const copy = (list) => list.map((entry) => entry.slice());
        return {
            levelLength: level.length,
            worldWidth: WORLD_WIDTH,
            path,
            kills: copy(this.log.kills),
            hitsTaken: copy(this.log.hitsTaken),
            pickups: copy(this.log.pickups),
            misses: copy(this.log.misses)
        };
    }
}

function randomSuffix() {
    return Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
}

function buildLevelRecord({ level, tracker, ship, view, score, startedAt, completedAt, durationSec, suffix = randomSuffix() }) {
    const completedIso = new Date(completedAt).toISOString();
    return {
        schema: RECORD_SCHEMA,
        id: `${completedIso}-${level.difficulty}-L${level.number}-${suffix}`,
        game: GAME_NAME,
        gameVersion: GAME_VERSION,
        level: level.number,
        levelName: level.name,
        difficulty: level.difficulty,
        difficultyLabel: level.difficultyLabel,
        seed: level.seed,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: completedIso,
        durationSec: round(durationSec),
        score: { total: score.total, level: score.level, bonus: score.bonus },
        ship: {
            livesRemaining: ship.lives,
            livesLost: tracker.livesLost,
            finalPower: Math.round(ship.power),
            finalWeapon: { type: ship.weapon.type, tier: ship.weapon.tier },
            view
        },
        stats: tracker.snapshot(),
        battleLog: tracker.battleLog(level, ship)
    };
}

module.exports = {
    WEAPON_TYPES,
    PICKUP_TYPES,
    COMBO_WINDOW,
    RECORD_SCHEMA,
    GAME_NAME,
    GAME_VERSION,
    WORLD_WIDTH,
    BATTLE_LOG_CAPS,
    COUNTER_FIELDS,
    TOTALS_COUNTER_FIELDS,
    LevelTracker,
    createLevelStats,
    createTotals,
    mergeTotals,
    buildLevelRecord
};
