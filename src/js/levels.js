const { applyDifficulty, getDifficulty } = require('./difficulty');

const LEVEL_COUNT = 10;
const TOTAL_LEVEL_COUNT = 20;

function getCampaignLevelCount(difficulty = 'cadet') {
    return getDifficulty(difficulty).id === 'cadet' ? LEVEL_COUNT : TOTAL_LEVEL_COUNT;
}

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
    'The Core',
    'Faraday Frontier', 'Prism Expanse', 'Singularity Run', 'Phase Garden', 'Orbiting Citadel',
    'The Redshift', 'Event Horizon', 'Nova Crucible', 'Last Light', 'Far Future'
];

// Difficulty scales with the level number. Levels 1-3 have stationary rocks;
// drift and rocks charging at the ship arrive from level 4 onward (on cadet).
// Pilot and ace scale these knobs; see difficulty.js.
function getBaseLevel(number) {
    if (!Number.isInteger(number) || number < 1 || number > TOTAL_LEVEL_COUNT) {
        throw new RangeError(`Level must be an integer from 1 to ${TOTAL_LEVEL_COUNT}`);
    }
    const n = number;
    if (n > LEVEL_COUNT) {
        const rank = n - LEVEL_COUNT;
        return {
            number: n, name: LEVEL_NAMES[n - 1], length: 8200 + rank * 700,
            scrollSpeed: 175 + rank * 11, density: 24 + rank * 3, movingChance: Math.min(0.95, 0.62 + rank * 0.025),
            driftSpeed: 35 + rank * 4, approachSpeed: 70 + rank * 8, shooterChance: Math.min(0.8, 0.45 + rank * 0.025),
            fireInterval: Math.max(0.48, 1.65 - rank * 0.055), enemyBulletSpeed: 280 + rank * 18,
            aimError: Math.max(0.015, 0.12 - rank * 0.006), bulletDamage: 22 + rank * 2,
            gauntlets: 5 + Math.ceil(rank / 2), pickups: Math.max(2, 6 - Math.floor(rank / 3)), seed: 1000 + n * 7919,
            phaseRocks: rank >= 2, orbitingGuards: rank >= 4, futureSector: true
        };
    }
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

function getLevel(number, difficulty = 'cadet') {
    return applyDifficulty(getBaseLevel(number), difficulty);
}

module.exports = { LEVEL_COUNT, TOTAL_LEVEL_COUNT, LEVEL_NAMES, getLevel, getBaseLevel, getCampaignLevelCount };
