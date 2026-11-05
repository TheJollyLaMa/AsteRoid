const LEVEL_COUNT = 10;

const LEVEL_NAMES = [
    'Drydock Drift',
    'Quiet Belt',
    'Pebble Lanes',
    'First Contact',
    'The Narrows',
    'Crossfire Fields',
    'Meteor Rain',
    'Ironheart Swarm',
    'Galactic Gauntlet',
    'The Core'
];

// Difficulty scales with the level number. Levels 1-3 have stationary rocks;
// drift and rocks charging at the ship arrive from level 4 onward.
function getLevel(number) {
    if (!Number.isInteger(number) || number < 1 || number > LEVEL_COUNT) {
        throw new RangeError(`Level must be an integer from 1 to ${LEVEL_COUNT}`);
    }
    const n = number;
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

module.exports = { LEVEL_COUNT, LEVEL_NAMES, getLevel };
