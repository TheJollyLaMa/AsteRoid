// Pure helpers for the battle card (testable in Node).
const WORLD_WIDTH = 800;

function hashString(value) {
    const str = String(value);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// mulberry32: tiny, fast, deterministic PRNG returning [0, 1).
function createSeededRng(seed) {
    let a = (Number(seed) >>> 0) || 0x9e3779b9;
    return function rng() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pad = (n, width = 2) => String(n).padStart(width, '0');

function formatUtc(iso) {
    const date = new Date(iso);
    if (!iso || Number.isNaN(date.getTime())) return 'UNKNOWN DATE';
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

function formatDuration(seconds) {
    const s = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

function formatPercent(fraction) {
    const f = Number(fraction);
    if (!Number.isFinite(f)) return '0%';
    return `${Math.round(Math.max(0, Math.min(1, f)) * 1000) / 10}%`;
}

// Layout in a 1200x1200 design space; renderers scale to the output size.
function cardLayout(width = 1200, height = 1200) {
    return {
        design: { width: 1200, height: 1200 },
        scale: { x: width / 1200, y: height / 1200 },
        frame: { x: 18, y: 18, w: 1164, h: 1164 },
        header: { x: 60, y: 50, w: 1080, h: 150 },
        map: { x: 70, y: 230, w: 540, h: 880 },
        panel: { x: 650, y: 230, w: 480, h: 880 },
        footer: { x: 60, y: 1130, w: 1080, h: 40 }
    };
}

// World point (x across the 800px lane, y forward along the level) -> card map rect.
// The level start sits at the bottom of the strip and the jump gate at the top.
function mapPoint(point, levelLength, rect, worldWidth = WORLD_WIDTH) {
    const x = Array.isArray(point) ? point[0] : point.x;
    const y = Array.isArray(point) ? point[1] : point.y;
    const length = Number(levelLength) > 0 ? Number(levelLength) : 1;
    const fx = Math.max(0, Math.min(1, (Number(x) || 0) / worldWidth));
    const fy = Math.max(0, Math.min(1, (Number(y) || 0) / length));
    return { x: rect.x + fx * rect.w, y: rect.y + rect.h - fy * rect.h };
}

function killRadius(size) {
    const s = Number(size) || 20;
    return Math.max(5, Math.min(34, 4 + s * 0.45));
}

function levelLengthOf(record) {
    const log = (record && record.battleLog) || {};
    if (Number(log.levelLength) > 0) return Number(log.levelLength);
    const path = Array.isArray(log.path) ? log.path : [];
    const maxY = path.reduce((m, p) => Math.max(m, Number(p[1]) || 0), 0);
    return maxY > 0 ? maxY : 3000;
}

// Deterministic sample record (schema v1) for previews and tests.
function sampleRecord(seed = 7) {
    const rng = createSeededRng(seed);
    const levelLength = 6100;
    const path = [];
    let x = 400;
    for (let i = 0; i <= 120; i++) {
        x = Math.max(40, Math.min(760, x + (rng() - 0.5) * 120));
        path.push([Math.round(x), Math.round((i / 120) * levelLength + 90)]);
    }
    const kills = [];
    for (let i = 0; i < 46; i++) {
        kills.push([Math.round(60 + rng() * 680), Math.round(300 + rng() * (levelLength - 300)), Math.round(12 + rng() * 26), rng() < 0.2 ? 1 : 0]);
    }
    const hitsTaken = [[Math.round(200 + rng() * 400), 2400], [Math.round(200 + rng() * 400), 4700]];
    const types = ['spread', 'rapid', 'plasma', 'power', 'shield'];
    const pickups = types.map((type, i) => [Math.round(100 + rng() * 600), 900 + i * 1000, type]);
    const misses = [[120, 3300], [690, 5200], [400, 1800]];
    return {
        schema: 'asteroid-level-record/1',
        id: `2026-11-05T17:45:00.000Z-pilot-L7-sample${seed}`,
        game: 'Decent Voyager: Galactic Gauntlet',
        gameVersion: '2.0.0',
        level: 7,
        levelName: 'Meteor Rain',
        difficulty: 'pilot',
        difficultyLabel: 'Pilot',
        seed: 1000 + 7 * 7919,
        startedAt: '2026-11-05T17:43:21.000Z',
        completedAt: '2026-11-05T17:45:00.000Z',
        durationSec: 99,
        score: { total: 48210, level: 6400, bonus: 2650 },
        ship: { livesRemaining: 2, livesLost: 1, finalPower: 64, finalWeapon: { type: 'plasma', tier: 2 }, view: 'pov' },
        stats: {
            shotsFired: 312, shotsByWeapon: { blaster: 120, spread: 60, rapid: 90, plasma: 42 }, hits: 201, accuracy: 201 / 312,
            asteroidsSpawned: 52, asteroidsDestroyed: 46, asteroidsMissed: 3, shootersDestroyed: 9, fragmentsDestroyed: 14,
            enemyShotsFired: 38, enemyShotsDodged: 35, hitsTaken: 2, collisions: 1, shieldBlocks: 4, damageTaken: 47,
            pickupsCollected: { spread: 1, rapid: 1, plasma: 1, power: 1, shield: 1 }, pickupsMissed: 1,
            maxCombo: 12, timeInPov: 61, timeInOverview: 38, closestCall: 6
        },
        battleLog: { levelLength, worldWidth: 800, path, kills, hitsTaken, pickups, misses }
    };
}

module.exports = {
    WORLD_WIDTH,
    hashString,
    createSeededRng,
    formatUtc,
    formatDuration,
    formatPercent,
    cardLayout,
    mapPoint,
    killRadius,
    levelLengthOf,
    sampleRecord
};
