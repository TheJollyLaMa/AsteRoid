const Asteroid = require('./asteroid');
const { range, pick } = require('./rng');

const WORLD_WIDTH = Asteroid.WORLD_WIDTH;
const SAFE_START = 520;
const PICKUP_TYPES = ['spread', 'rapid', 'plasma', 'power', 'shield'];

function scatterAsteroid(level, rng, y) {
    const size = range(rng, 14, 26 + level.number * 1.6);
    const moving = rng() < level.movingChance;
    return new Asteroid({
        x: range(rng, 40, WORLD_WIDTH - 40),
        y,
        size,
        vx: moving ? range(rng, -1, 1) * level.driftSpeed : 0,
        vy: moving ? -rng() * level.approachSpeed : 0,
        shooter: rng() < level.shooterChance,
        hp: level.scatterHpBonus ? Math.max(1, Math.ceil(size / 14)) + level.scatterHpBonus : undefined,
        rng
    });
}

function addWall(asteroids, level, rng, y) {
    const spacing = 56;
    const count = Math.floor((WORLD_WIDTH - 40) / spacing) + 1;
    const withGap = level.number <= (level.wallGapThrough ?? 2);
    const shooterFrom = level.wallShooterFrom ?? 6;
    const shooterEvery = level.wallShooterEvery ?? 4;
    const rows = level.wallRows ?? 1;
    for (let row = 0; row < rows; row++) {
        const gapStart = 1 + Math.floor(rng() * (count - 3));
        const rowY = y + row * 64;
        const shift = row % 2 ? spacing / 2 : 0;
        for (let i = 0; i < count; i++) {
            if (withGap && (i === gapStart || i === gapStart + 1)) continue;
            asteroids.push(new Asteroid({
                x: Math.min(WORLD_WIDTH - 20, 20 + i * spacing + shift),
                y: rowY + range(rng, -10, 10),
                size: 20,
                hp: level.wallHp ?? 1,
                shooter: level.number >= shooterFrom && (i + row) % shooterEvery === 0,
                rng
            }));
        }
    }
}

function addRush(asteroids, level, rng, y) {
    const count = 6 + level.number;
    const speed = (60 + level.number * 14) * (level.rushSpeedMultiplier ?? 1);
    for (let i = 0; i < count; i++) {
        asteroids.push(new Asteroid({
            x: range(rng, 40, WORLD_WIDTH - 40),
            y: y + range(rng, 0, 320),
            size: range(rng, 14, 24),
            vx: range(rng, -15, 15),
            vy: -speed * range(rng, 0.8, 1.2),
            hp: 1,
            shooter: rng() < level.shooterChance * 0.5,
            rng
        }));
    }
}

function addChevron(asteroids, level, rng, y) {
    const center = range(rng, 220, WORLD_WIDTH - 220);
    for (let i = -3; i <= 3; i++) {
        asteroids.push(new Asteroid({
            x: center + i * 60,
            y: y + Math.abs(i) * 50,
            size: 22,
            hp: level.chevronHp ?? 2,
            shooter: true,
            rng
        }));
    }
}

const PATTERNS = { wall: addWall, rush: addRush, chevron: addChevron };

function gauntletPattern(level, index) {
    if (level.number <= 2) return 'wall';
    if (level.movingChance === 0) return ['wall', 'chevron'][index % 2];
    return ['wall', 'rush', 'chevron'][(index + level.number) % 3];
}

function populateLevel(level, rng) {
    const asteroids = [];
    const pickups = [];
    const gauntletYs = [];

    for (let k = 0; k < level.gauntlets; k++) {
        const y = SAFE_START + 300 + ((level.length - SAFE_START - 300) * (k + 1)) / (level.gauntlets + 1);
        const pattern = gauntletPattern(level, k);
        gauntletYs.push(y);
        PATTERNS[pattern](asteroids, level, rng, y);
        const pickup = { x: range(rng, 120, WORLD_WIDTH - 120), y: y + 480, type: pick(rng, PICKUP_TYPES), size: 14 };
        if (k % (level.gauntletPickupEvery ?? 1) === 0) pickups.push(pickup);
    }

    const scatterCount = Math.round((level.density * level.length) / 1000);
    for (let i = 0; i < scatterCount; i++) {
        const y = range(rng, SAFE_START, level.length - 150);
        if (gauntletYs.some((gy) => y > gy - 160 && y < gy + 420)) continue;
        asteroids.push(scatterAsteroid(level, rng, y));
    }

    const extraPickups = Math.max(0, level.pickups - level.gauntlets);
    for (let i = 0; i < extraPickups; i++) {
        const y = SAFE_START + ((level.length - SAFE_START) * (i + 0.5)) / extraPickups;
        const type = i === 0 ? pick(rng, ['spread', 'rapid', 'plasma']) : pick(rng, PICKUP_TYPES);
        pickups.push({ x: range(rng, 80, WORLD_WIDTH - 80), y, type, size: 14 });
    }

    asteroids.sort((a, b) => a.y - b.y);
    pickups.sort((a, b) => a.y - b.y);
    return { asteroids, pickups };
}

module.exports = { populateLevel, PICKUP_TYPES, SAFE_START };
