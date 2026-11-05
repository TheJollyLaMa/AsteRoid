const Bullet = require('./bullet');

const MAX_TIER = 3;

// Pattern entries are [angle in radians from straight ahead, lateral offset].
const WEAPONS = {
    blaster: {
        name: 'Blaster',
        color: '#9ff3ff',
        cooldown: [0.26, 0.22, 0.18],
        speed: 540,
        damage: [1, 1, 1],
        size: [3, 3, 3],
        pierce: false,
        pattern: [[[0, 0]], [[-0.05, -6], [0.05, 6]], [[-0.09, -8], [0, 0], [0.09, 8]]]
    },
    spread: {
        name: 'Spread Cannon',
        color: '#5fffd0',
        cooldown: [0.34, 0.3, 0.27],
        speed: 480,
        damage: [1, 1, 1],
        size: [3, 3, 3],
        pierce: false,
        pattern: [
            [[-0.2, 0], [0, 0], [0.2, 0]],
            [[-0.3, 0], [-0.15, 0], [0, 0], [0.15, 0], [0.3, 0]],
            [[-0.42, 0], [-0.28, 0], [-0.14, 0], [0, 0], [0.14, 0], [0.28, 0], [0.42, 0]]
        ]
    },
    rapid: {
        name: 'Rapid Laser',
        color: '#ffe65c',
        cooldown: [0.1, 0.08, 0.065],
        speed: 760,
        damage: [1, 1, 1],
        size: [2, 2, 2],
        pierce: false,
        pattern: [[[0, 0]], [[0, -7], [0, 7]], [[-0.03, -10], [0, 0], [0.03, 10]]]
    },
    plasma: {
        name: 'Plasma Lance',
        color: '#ff6cf5',
        cooldown: [0.55, 0.48, 0.42],
        speed: 400,
        damage: [3, 4, 5],
        size: [7, 9, 11],
        pierce: true,
        pattern: [[[0, 0]], [[0, 0]], [[-0.06, -10], [0.06, 10]]]
    }
};

function createWeapon(type = 'blaster') {
    if (!WEAPONS[type]) throw new Error(`Unknown weapon: ${type}`);
    return { type, tier: 1 };
}

function applyWeaponPickup(weapon, type) {
    if (weapon.type === type) {
        return { type, tier: Math.min(MAX_TIER, weapon.tier + 1) };
    }
    return createWeapon(type);
}

function downgradeWeapon(weapon) {
    if (weapon.tier > 1) return { type: weapon.type, tier: weapon.tier - 1 };
    return createWeapon('blaster');
}

function fireWeapon(weapon, ship, scrollSpeed) {
    const spec = WEAPONS[weapon.type];
    const tierIndex = weapon.tier - 1;
    const bullets = spec.pattern[tierIndex].map(([angle, offset]) => new Bullet({
        x: ship.x + offset,
        y: ship.y + ship.size,
        vx: Math.sin(angle) * spec.speed,
        vy: Math.cos(angle) * spec.speed + scrollSpeed,
        size: spec.size[tierIndex],
        damage: spec.damage[tierIndex],
        pierce: spec.pierce,
        life: 1.4,
        owner: 'player',
        color: spec.color
    }));
    return { bullets, cooldown: spec.cooldown[tierIndex] };
}

module.exports = { WEAPONS, MAX_TIER, createWeapon, applyWeaponPickup, downgradeWeapon, fireWeapon };
