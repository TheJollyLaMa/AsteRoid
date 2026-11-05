// Save format, validation, legacy migration and quota-tolerant persistence.
const { LEVEL_COUNT, TOTAL_LEVEL_COUNT } = require('./levels');
const { DIFFICULTY_IDS, isDifficulty, difficultyLabel } = require('./difficulty');
const {
    WEAPON_TYPES,
    PICKUP_TYPES,
    RECORD_SCHEMA,
    GAME_NAME,
    BATTLE_LOG_CAPS,
    TOTALS_COUNTER_FIELDS,
    createTotals
} = require('./stats');

const SAVE_APP = 'asteroid-galactic-gauntlet';
const SAVE_VERSION = 1;
const STORAGE_KEY = 'asteroid-galactic-gauntlet-save';
const LEGACY_STORAGE_KEY = 'asteroid-galactica-progress';
const BACKUP_KEY = 'asteroid-galactic-gauntlet-save-unreadable';
const MAX_WINS = 200;
const MAX_IMPORT_WINS = 2000;
const MAX_SAVE_CHARS = 10 * 1024 * 1024;
const MAX_SCORE = 1e10;
const MAX_STRING = 200;

function createProgress() {
    return { unlocked: 1, highScore: 0, bestLevelScores: {}, sector2Unlocked: false };
}

function createEmptySave() {
    return {
        app: SAVE_APP,
        version: SAVE_VERSION,
        savedAt: null,
        progress: {
            lastDifficulty: 'cadet',
            byDifficulty: Object.fromEntries(DIFFICULTY_IDS.map((id) => [id, createProgress()]))
        },
        lifetime: createTotals(),
        wins: []
    };
}

function migrateLegacy(legacy) {
    const save = createEmptySave();
    const cadet = save.progress.byDifficulty.cadet;
    if (legacy && Number.isInteger(legacy.unlocked)) cadet.unlocked = Math.min(LEVEL_COUNT, Math.max(1, legacy.unlocked));
    const high = Number(legacy && legacy.highScore);
    if (Number.isFinite(high) && high > 0) cadet.highScore = Math.min(MAX_SCORE, Math.floor(high));
    return save;
}

function isLegacyShape(obj) {
    return isPlainObject(obj) && !('app' in obj) && Number.isInteger(obj.unlocked);
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function fail(message) {
    throw new Error(message);
}

function num(value, where, { min = 0, max = MAX_SCORE, integer = false } = {}) {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${where} must be a number.`);
    if (integer && !Number.isInteger(value)) fail(`${where} must be a whole number.`);
    if (value < min || value > max) fail(`${where} must be between ${min} and ${max}.`);
    return value;
}

function str(value, where, max = MAX_STRING) {
    if (typeof value !== 'string' || value.length === 0) fail(`${where} must be text.`);
    if (value.length > max) fail(`${where} is too long.`);
    return value;
}

function isoDate(value, where) {
    str(value, where, 40);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
        Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
        fail(`${where} is not a valid date.`);
    }
    return value;
}

function counters(obj, keys, where, required = false) {
    if (!isPlainObject(obj)) fail(`${where} must be an object.`);
    return Object.fromEntries(keys.map((key) => [key, num(required ? obj[key] : (obj[key] ?? 0), `${where}.${key}`, { integer: true })]));
}

function validateProgress(progress) {
    if (!isPlainObject(progress)) fail('Save is missing its progress section.');
    const lastDifficulty = progress.lastDifficulty ?? 'cadet';
    if (!isDifficulty(lastDifficulty)) fail(`Unknown difficulty "${String(lastDifficulty).slice(0, 20)}" in save progress.`);
    const by = progress.byDifficulty;
    if (!isPlainObject(by)) fail('Save progress must list progress by difficulty.');
    for (const key of Object.keys(by)) {
        if (!isDifficulty(key)) fail(`Unknown difficulty "${key.slice(0, 20)}" in save progress.`);
    }
    const byDifficulty = {};
    for (const id of DIFFICULTY_IDS) {
        const entry = by[id] ?? createProgress();
        const label = difficultyLabel(id);
        if (!isPlainObject(entry)) fail(`${label} progress must be an object.`);
        const unlocked = entry.unlocked;
        if (!Number.isInteger(unlocked) || unlocked < 1 || unlocked > TOTAL_LEVEL_COUNT) {
            fail(`${label} progress: unlocked level must be a whole number from 1 to ${TOTAL_LEVEL_COUNT}.`);
        }
        const bestIn = entry.bestLevelScores ?? {};
        if (!isPlainObject(bestIn)) fail(`${label} progress: best level scores must be an object.`);
        const bestLevelScores = {};
        for (const [level, score] of Object.entries(bestIn)) {
            const n = Number(level);
            if (!Number.isInteger(n) || n < 1 || n > TOTAL_LEVEL_COUNT || String(n) !== level) {
                fail(`${label} progress: "${level.slice(0, 10)}" is not a level number.`);
            }
            bestLevelScores[level] = num(score, `${label} best score for level ${level}`);
        }
        byDifficulty[id] = {
            unlocked,
            highScore: num(entry.highScore ?? 0, `${label} high score`),
            bestLevelScores,
            sector2Unlocked: entry.sector2Unlocked === true
        };
        if (typeof entry.sector2Unlocked !== 'boolean' && entry.sector2Unlocked !== undefined) fail(`${label} progress: Sector II unlock must be true or false.`);
        if (unlocked > LEVEL_COUNT && !byDifficulty[id].sector2Unlocked) fail(`${label} progress: Sector II level progress requires an unlock.`);
    }
    return { lastDifficulty, byDifficulty };
}

function validateLifetime(lifetime) {
    if (lifetime === undefined || lifetime === null) return createTotals();
    if (!isPlainObject(lifetime)) fail('Save lifetime stats must be an object.');
    const totals = createTotals();
    for (const key of TOTALS_COUNTER_FIELDS) totals[key] = num(lifetime[key] ?? 0, `Lifetime ${key}`, { max: 1e12 });
    totals.shotsByWeapon = counters(lifetime.shotsByWeapon ?? {}, WEAPON_TYPES, 'Lifetime shotsByWeapon');
    totals.pickupsCollected = counters(lifetime.pickupsCollected ?? {}, PICKUP_TYPES, 'Lifetime pickupsCollected');
    totals.maxCombo = num(lifetime.maxCombo ?? 0, 'Lifetime maxCombo', { integer: true, max: 1e6 });
    totals.closestCall = num(lifetime.closestCall ?? -1, 'Lifetime closestCall', { min: -1, max: 1e6 });
    totals.accuracy = num(lifetime.accuracy ?? 0, 'Lifetime accuracy', { max: 1 });
    return totals;
}

function tuples(list, where, cap, shape) {
    if (!Array.isArray(list)) fail(`${where} must be a list.`);
    if (list.length > cap) fail(`${where} has more than ${cap} entries.`);
    return list.map((entry, i) => {
        if (!Array.isArray(entry) || entry.length !== shape.length) fail(`${where} entry ${i + 1} is malformed.`);
        return entry.map((value, j) => {
            if (shape[j] === 'type') {
                if (!PICKUP_TYPES.includes(value)) fail(`${where} entry ${i + 1} has an unknown pickup type.`);
                return value;
            }
            const bounds = shape[j] === 'flag' ? { min: 0, max: 1, integer: true } :
                shape[j] === 'size' ? { min: 0, max: 1e4 } : { min: -1e6, max: 1e6 };
            return num(value, `${where} entry ${i + 1}`, bounds);
        });
    });
}

function validateCaptures(captures, where) {
    if (!Array.isArray(captures) || captures.length > 2) fail(`${where} must be a list of at most two captures.`);
    return captures.map((capture, index) => {
        const label = `${where} #${index + 1}`;
        if (!isPlainObject(capture) || !isPlainObject(capture.prize)) fail(`${label} is malformed.`);
        const tier = num(capture.tier, `${label} tier`, { min: 1, max: 2, integer: true });
        if (!Number.isInteger(capture.level) || capture.level < 1 || capture.level > TOTAL_LEVEL_COUNT) fail(`${label} level is invalid.`);
        return { tier, level: capture.level, at: isoDate(capture.at, `${label} date`), prize: { project: str(capture.prize.project, `${label} project`, 100), tokenId: num(capture.prize.tokenId, `${label} token ID`, { integer: true }), label: str(capture.prize.label, `${label} label`, 160), version: str(capture.prize.version, `${label} version`, 40), metadataURI: str(capture.prize.metadataURI, `${label} metadata URI`, 300) } };
    });
}

function validateLevelRecord(record, where = 'Level record') {
    if (!isPlainObject(record)) fail(`${where} must be an object.`);
    if (record.schema !== RECORD_SCHEMA) fail(`${where} uses an unsupported schema (expected ${RECORD_SCHEMA}).`);
    if (!isDifficulty(record.difficulty)) fail(`${where} has an unknown difficulty.`);
    const level = record.level;
    if (!Number.isInteger(level) || level < 1 || level > TOTAL_LEVEL_COUNT) fail(`${where}: level must be 1–${TOTAL_LEVEL_COUNT}.`);
    const score = record.score;
    if (!isPlainObject(score)) fail(`${where} is missing its score.`);
    const ship = record.ship;
    if (!isPlainObject(ship) || !isPlainObject(ship.finalWeapon)) fail(`${where} is missing its ship summary.`);
    if (!WEAPON_TYPES.includes(ship.finalWeapon.type)) fail(`${where} has an unknown weapon.`);
    if (!['overview', 'pov'].includes(ship.view)) fail(`${where} has an unknown view.`);
    const stats = record.stats;
    if (!isPlainObject(stats)) fail(`${where} is missing its stats.`);
    const log = record.battleLog;
    if (!isPlainObject(log)) fail(`${where} is missing its battle log.`);
    if (record.game !== GAME_NAME) fail(`${where} belongs to a different game.`);
    if (record.difficultyLabel !== difficultyLabel(record.difficulty)) fail(`${where} has an incorrect difficulty label.`);
    const startedAt = isoDate(record.startedAt, `${where} startedAt`);
    const completedAt = isoDate(record.completedAt, `${where} completedAt`);
    if (Date.parse(completedAt) < Date.parse(startedAt)) fail(`${where} completion date is before its start date.`);
    const s = `${where} stats`;
    const extendNewCounters = (source, fields) => {
        if (!isPlainObject(source)) return source;
        const result = { ...source };
        for (const field of fields) if (result[field] === undefined) result[field] = 0;
        return result;
    };
    const shotsByWeapon = extendNewCounters(stats.shotsByWeapon, ['nova', 'prism', 'singularity']);
    const pickupsCollected = extendNewCounters(stats.pickupsCollected, ['nova', 'prism', 'singularity']);
    const count = (key) => num(key === 'volleys' ? (stats[key] ?? 0) : stats[key], `${s}.${key}`, {
        max: 1e9, integer: !['damageTaken', 'timeInPov', 'timeInOverview'].includes(key)
    });
    return {
        schema: RECORD_SCHEMA,
        id: str(record.id, `${where} id`),
        game: str(record.game, `${where} game`),
        gameVersion: str(record.gameVersion, `${where} gameVersion`, 20),
        level,
        captures: validateCaptures(record.captures ?? [], `${where} captures`),
        levelName: str(record.levelName, `${where} levelName`, 60),
        difficulty: record.difficulty,
        difficultyLabel: str(record.difficultyLabel, `${where} difficultyLabel`, 20),
        seed: num(record.seed, `${where} seed`, { max: 4294967295, integer: true }),
        startedAt,
        completedAt,
        durationSec: num(record.durationSec, `${where} durationSec`, { max: 1e6 }),
        score: {
            total: num(score.total, `${where} total score`),
            level: num(score.level, `${where} level score`),
            bonus: num(score.bonus, `${where} bonus`)
        },
        ship: {
            livesRemaining: num(ship.livesRemaining, `${where} livesRemaining`, { integer: true, max: 3 }),
            livesLost: num(ship.livesLost, `${where} livesLost`, { integer: true, max: 3 }),
            finalPower: num(ship.finalPower, `${where} finalPower`, { max: 100 }),
            finalWeapon: {
                type: ship.finalWeapon.type,
                tier: num(ship.finalWeapon.tier, `${where} weapon tier`, { min: 1, max: 3, integer: true })
            },
            view: ship.view
        },
        stats: {
            shotsFired: count('shotsFired'),
            volleys: count('volleys'),
            shotsByWeapon: counters(shotsByWeapon, WEAPON_TYPES, `${s}.shotsByWeapon`, true),
            hits: count('hits'),
            accuracy: num(stats.accuracy, `${s}.accuracy`, { max: 1 }),
            asteroidsSpawned: count('asteroidsSpawned'),
            asteroidsDestroyed: count('asteroidsDestroyed'),
            asteroidsMissed: count('asteroidsMissed'),
            shootersDestroyed: count('shootersDestroyed'),
            fragmentsDestroyed: count('fragmentsDestroyed'),
            enemyShotsFired: count('enemyShotsFired'),
            enemyShotsDodged: count('enemyShotsDodged'),
            hitsTaken: count('hitsTaken'),
            collisions: count('collisions'),
            shieldBlocks: count('shieldBlocks'),
            damageTaken: count('damageTaken'),
            pickupsCollected: counters(pickupsCollected, PICKUP_TYPES, `${s}.pickupsCollected`, true),
            pickupsMissed: count('pickupsMissed'),
            maxCombo: count('maxCombo'),
            timeInPov: count('timeInPov'),
            timeInOverview: count('timeInOverview'),
            closestCall: num(stats.closestCall, `${s}.closestCall`, { min: -1, max: 1e6 })
        },
        battleLog: {
            levelLength: num(log.levelLength, `${where} battle log length`, { min: 1, max: 1e6 }),
            worldWidth: num(log.worldWidth, `${where} battle log width`, { min: 800, max: 800 }),
            path: tuples(log.path, `${where} path`, BATTLE_LOG_CAPS.path, ['n', 'n']),
            kills: tuples(log.kills, `${where} kills`, BATTLE_LOG_CAPS.kills, ['n', 'n', 'size', 'flag']),
            hitsTaken: tuples(log.hitsTaken, `${where} hits taken`, BATTLE_LOG_CAPS.hitsTaken, ['n', 'n']),
            pickups: tuples(log.pickups, `${where} pickups`, BATTLE_LOG_CAPS.pickups, ['n', 'n', 'type']),
            misses: tuples(log.misses, `${where} misses`, BATTLE_LOG_CAPS.misses, ['n', 'n'])
        }
    };
}

function assertJsonData(value, depth = 0, ancestors = new Set()) {
    if (depth > 40) fail('Save file is nested too deeply.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (!Array.isArray(value) && !isPlainObject(value)) fail('Save file contains data that cannot be stored.');
    if (ancestors.has(value)) fail('Save file contains a circular reference.');
    ancestors.add(value);
    for (const entry of Object.values(value)) assertJsonData(entry, depth + 1, ancestors);
    ancestors.delete(value);
}

// Validates a parsed save (or a JSON string, or the legacy {unlocked, highScore} shape) and returns
// a normalized copy. Throws an Error with a player-facing message when the save is unusable.
function validateSave(input) {
    let obj = input;
    if (typeof obj === 'string') {
        if (obj.length > MAX_SAVE_CHARS) fail('Save file is too large.');
        try {
            obj = JSON.parse(obj);
        } catch (error) {
            fail('Save file is not valid JSON.');
        }
    }
    if (!isPlainObject(obj)) fail('Save file is empty or not an object.');
    assertJsonData(obj);
    if (isLegacyShape(obj)) return migrateLegacy(obj);
    if (obj.app !== SAVE_APP) fail('This file is not an AsteRoid: Galactic Gauntlet save.');
    if (!Number.isInteger(obj.version)) fail('Save file has no version number.');
    if (obj.version > SAVE_VERSION) fail(`Save version ${obj.version} is newer than this game supports (${SAVE_VERSION}). Update the game first.`);
    if (obj.version < 1) fail(`Save version ${obj.version} is not supported.`);
    let size = 0;
    try {
        size = JSON.stringify(obj).length;
    } catch (error) {
        fail('Save file contains data that cannot be stored.');
    }
    if (size > MAX_SAVE_CHARS) fail('Save file is too large.');

    const winsIn = obj.wins ?? [];
    if (!Array.isArray(winsIn)) fail('Save victory records must be a list.');
    if (winsIn.length > MAX_IMPORT_WINS) fail(`Save has too many victory records (${winsIn.length}).`);
    const wins = winsIn.map((record, i) => validateLevelRecord(record, `Victory record #${i + 1}`)).slice(-MAX_WINS);

    return {
        app: SAVE_APP,
        version: SAVE_VERSION,
        savedAt: obj.savedAt == null ? null : isoDate(obj.savedAt, 'Save date'),
        progress: validateProgress(obj.progress),
        lifetime: validateLifetime(obj.lifetime),
        wins
    };
}

function readJson(storage, key) {
    try {
        const raw = storage && storage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

// Loads the current save, migrating the pre-difficulty progress format into cadet.
// Corrupt or unavailable storage falls back to a fresh save; an unreadable save (for example one
// written by a newer build) is copied to BACKUP_KEY first so it is never silently destroyed.
function loadSave(storage) {
    const current = readJson(storage, STORAGE_KEY);
    if (current) {
        try {
            return validateSave(current);
        } catch (error) {
            try {
                if (storage && !storage.getItem(BACKUP_KEY)) storage.setItem(BACKUP_KEY, storage.getItem(STORAGE_KEY));
            } catch (backupError) {
                // Best effort only.
            }
        }
    }
    const legacy = readJson(storage, LEGACY_STORAGE_KEY);
    if (isLegacyShape(legacy)) return migrateLegacy(legacy);
    return createEmptySave();
}

const maxMap = (a = {}, b = {}) => {
    const out = { ...a };
    for (const [key, value] of Object.entries(b)) out[key] = Math.max(out[key] ?? 0, value);
    return out;
};

// Combines two valid saves so that progress made in another tab (or by an older build that later
// wrote over it) is kept: wins are unioned by id and progress/lifetime counters take the maximum.
function mergeSaves(stored, incoming) {
    const byDifficulty = {};
    for (const id of DIFFICULTY_IDS) {
        const a = stored.progress.byDifficulty[id] || createProgress();
        const b = incoming.progress.byDifficulty[id] || createProgress();
        byDifficulty[id] = {
            unlocked: Math.max(a.unlocked, b.unlocked),
            highScore: Math.max(a.highScore, b.highScore),
            bestLevelScores: maxMap(a.bestLevelScores, b.bestLevelScores),
            sector2Unlocked: Boolean(a.sector2Unlocked || b.sector2Unlocked)
        };
    }
    const lifetime = { ...incoming.lifetime };
    for (const key of TOTALS_COUNTER_FIELDS) lifetime[key] = Math.max(stored.lifetime[key] ?? 0, incoming.lifetime[key] ?? 0);
    lifetime.shotsByWeapon = maxMap(stored.lifetime.shotsByWeapon, incoming.lifetime.shotsByWeapon);
    lifetime.pickupsCollected = maxMap(stored.lifetime.pickupsCollected, incoming.lifetime.pickupsCollected);
    lifetime.maxCombo = Math.max(stored.lifetime.maxCombo ?? 0, incoming.lifetime.maxCombo ?? 0);
    const seen = new Map();
    for (const record of [...stored.wins, ...incoming.wins]) seen.set(record.id, record);
    const wins = [...seen.values()]
        .sort((x, y) => Date.parse(x.completedAt) - Date.parse(y.completedAt))
        .slice(-MAX_WINS);
    return {
        ...incoming,
        progress: { lastDifficulty: incoming.progress.lastDifficulty, byDifficulty },
        lifetime,
        wins
    };
}

// Returns `save` merged with whatever valid save is currently stored (or `save` unchanged).
function mergeStoredSave(storage, save) {
    const stored = readJson(storage, STORAGE_KEY);
    if (!stored) return save;
    try {
        return mergeSaves(validateSave(stored), save);
    } catch (error) {
        return save;
    }
}

function stripBattleLog(record) {
    const log = record.battleLog || {};
    return {
        ...record,
        battleLog: { levelLength: log.levelLength || 0, worldWidth: log.worldWidth || 800, path: [], kills: [], hitsTaken: [], pickups: [], misses: [] }
    };
}

// Writes the save, shrinking it when storage is full: first the oldest wins' battle logs are
// dropped, then the oldest wins themselves. Returns true when something was written.
function persistSave(storage, save) {
    if (!storage) return false;
    const attempt = (data) => {
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (error) {
            return false;
        }
    };
    if (attempt(save)) return true;
    const wins = save.wins;
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
        const cut = Math.ceil(wins.length * fraction);
        const trimmed = wins.map((record, i) => (i < cut ? stripBattleLog(record) : record));
        if (attempt({ ...save, wins: trimmed })) return true;
    }
    const stripped = wins.map(stripBattleLog);
    for (let keep = Math.floor(stripped.length / 2); keep >= 0; keep = keep > 0 ? Math.floor(keep / 2) : -1) {
        if (attempt({ ...save, wins: stripped.slice(stripped.length - keep) })) return true;
        if (keep === 0) break;
    }
    return false;
}

module.exports = {
    SAVE_APP,
    SAVE_VERSION,
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    BACKUP_KEY,
    MAX_WINS,
    mergeSaves,
    mergeStoredSave,
    createEmptySave,
    createProgress,
    migrateLegacy,
    validateSave,
    validateLevelRecord,
    loadSave,
    persistSave
};
