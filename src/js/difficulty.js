// Difficulty presets. Cadet is the original tuning and must stay unchanged;
// pilot and ace scale the per-level knobs produced by levels.js.
const DIFFICULTY_IDS = ['cadet', 'pilot', 'ace'];

const DIFFICULTIES = {
    cadet: {
        id: 'cadet',
        label: 'Cadet',
        order: 0,
        lives: 3,
        scoreMultiplier: 1,
        scrollSpeed: 1,
        density: 1,
        movingShift: 0,
        movingChance: 1,
        motionSpeed: 1,
        shooterChance: 1,
        fireInterval: 1,
        enemyBulletSpeed: 1,
        aimError: 1,
        bulletDamage: 1,
        extraGauntlets: 0,
        pickups: 1,
        wallGapThrough: 2,
        wallRows: 1,
        wallHp: 1,
        wallShooterFrom: 6,
        wallShooterEvery: 4,
        rushSpeedMultiplier: 1,
        chevronHp: 2,
        scatterHpBonus: 0,
        gauntletPickupEvery: 1,
        ramDamageMultiplier: 1,
        powerRestore: 40,
        shieldTime: 7
    },
    pilot: {
        id: 'pilot',
        label: 'Pilot',
        order: 1,
        lives: 3,
        scoreMultiplier: 1.25,
        scrollSpeed: 1.15,
        density: 1.4,
        movingShift: 1,
        movingChance: 1.2,
        motionSpeed: 1.2,
        shooterChance: 1.45,
        fireInterval: 0.8,
        enemyBulletSpeed: 1.15,
        aimError: 0.65,
        bulletDamage: 1.35,
        extraGauntlets: 1,
        pickups: 0.75,
        wallGapThrough: 1,
        wallRows: 1,
        wallHp: 1,
        wallShooterFrom: 4,
        wallShooterEvery: 3,
        rushSpeedMultiplier: 1.15,
        chevronHp: 2,
        scatterHpBonus: 0,
        gauntletPickupEvery: 1,
        ramDamageMultiplier: 1.25,
        powerRestore: 32,
        shieldTime: 6
    },
    ace: {
        id: 'ace',
        label: 'Ace',
        order: 2,
        lives: 2,
        scoreMultiplier: 1.6,
        scrollSpeed: 1.35,
        density: 2,
        movingShift: 3,
        movingChance: 1.5,
        motionSpeed: 1.5,
        shooterChance: 2.1,
        fireInterval: 0.55,
        enemyBulletSpeed: 1.35,
        aimError: 0.3,
        bulletDamage: 1.9,
        extraGauntlets: 2,
        pickups: 0.45,
        wallGapThrough: 0,
        wallRows: 2,
        wallHp: 2,
        wallShooterFrom: 1,
        wallShooterEvery: 2,
        rushSpeedMultiplier: 1.35,
        chevronHp: 3,
        scatterHpBonus: 1,
        gauntletPickupEvery: 2,
        ramDamageMultiplier: 1.6,
        powerRestore: 25,
        shieldTime: 4.5
    }
};

function isDifficulty(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(DIFFICULTIES, id);
}

function getDifficulty(id = 'cadet') {
    if (!isDifficulty(id)) throw new RangeError(`Unknown difficulty: ${id}`);
    return DIFFICULTIES[id];
}

function difficultyLabel(id) {
    return isDifficulty(id) ? DIFFICULTIES[id].label : String(id);
}

function stepDifficulty(id, delta) {
    const index = Math.max(0, DIFFICULTY_IDS.indexOf(id));
    return DIFFICULTY_IDS[(index + delta + DIFFICULTY_IDS.length) % DIFFICULTY_IDS.length];
}

const round3 = (value) => Math.round(value * 1000) / 1000;

// Applies a preset to the cadet (base) level. Cadet returns the base knobs untouched.
function applyDifficulty(base, id) {
    const d = getDifficulty(id);
    if (d.id === 'cadet') return base;
    const level = {
        ...base,
        difficulty: d.id,
        difficultyLabel: d.label,
        scoreMultiplier: d.scoreMultiplier,
        wallGapThrough: d.wallGapThrough,
        wallRows: d.wallRows,
        wallHp: d.wallHp,
        wallShooterFrom: d.wallShooterFrom,
        wallShooterEvery: d.wallShooterEvery,
        rushSpeedMultiplier: d.rushSpeedMultiplier,
        chevronHp: d.chevronHp,
        scatterHpBonus: d.scatterHpBonus,
        gauntletPickupEvery: d.gauntletPickupEvery,
        ramDamageMultiplier: d.ramDamageMultiplier,
        powerRestore: d.powerRestore,
        shieldTime: d.shieldTime
    };

    const n = base.number;
    // Moving rocks arrive `movingShift` levels earlier than on cadet.
    const m = n + d.movingShift;
    level.scrollSpeed = round3(base.scrollSpeed * d.scrollSpeed);
    level.density = round3(base.density * d.density);
    level.movingChance = m <= 3 ? 0 : round3(Math.min(0.95, (m - 3) * 0.13 * d.movingChance));
    level.driftSpeed = m <= 3 ? 0 : round3((6 + m * 3) * d.motionSpeed);
    level.approachSpeed = m <= 4 ? 0 : round3((m - 4) * 10 * d.motionSpeed);
    level.shooterChance = round3(Math.min(0.8, base.shooterChance * d.shooterChance));
    level.fireInterval = round3(Math.max(0.45, base.fireInterval * d.fireInterval));
    level.enemyBulletSpeed = round3(base.enemyBulletSpeed * d.enemyBulletSpeed);
    level.aimError = round3(Math.max(0.01, base.aimError * d.aimError));
    level.bulletDamage = Math.round(base.bulletDamage * d.bulletDamage);
    level.gauntlets = base.gauntlets + d.extraGauntlets;
    level.pickups = Math.max(1, Math.floor(base.pickups * d.pickups));
    level.seed = base.seed + d.order * 104729;
    return level;
}

module.exports = { DIFFICULTY_IDS, DIFFICULTIES, isDifficulty, getDifficulty, difficultyLabel, stepDifficulty, applyDifficulty };
