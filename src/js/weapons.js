const Bullet = require('./bullet');

const MAX_TIER = 3;

// Pattern entries are [angle in radians from straight ahead, lateral offset].
const WEAPONS = {
    blaster: {
        name: 'Blaster',
        color: '#9ff3ff',
        cooldown: [0.14, 0.12, 0.1],
        speed: 700,
        damage: [2, 2, 2],
        size: [3, 3, 3],
        pierce: false,
        pattern: [[[0, 0]], [[-0.05, -6], [0.05, 6]], [[-0.09, -8], [0, 0], [0.09, 8]]]
    },
    spread: {
        name: 'Spread Cannon',
        color: '#5fffd0',
        cooldown: [0.18, 0.15, 0.13],
        speed: 660,
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
    nova: { name: 'Nova Charger', color: '#fff36a', cooldown: [0.8, 0.72, 0.64], speed: 310, damage: [3, 5, 7], size: [10, 14, 18], pierce: false, pattern: [[[0, 0]], [[0, 0]], [[0, 0]]] },
    prism: { name: 'Prism Splitter', color: '#67faff', cooldown: [0.42, 0.36, 0.3], speed: 520, damage: [2, 2, 3], size: [5, 6, 7], pierce: false, pattern: [[[0, 0]], [[-0.18, 0], [0, 0], [0.18, 0]], [[-0.28, 0], [-0.14, 0], [0, 0], [0.14, 0], [0.28, 0]]] },
    singularity: { name: 'Singularity', color: '#1c3f8a', cooldown: [0.9, 0.82, 0.74], speed: 270, damage: [4, 6, 8], size: [12, 16, 20], pierce: false, pattern: [[[0, 0]], [[0, 0]], [[0, 0]]] },
    plasma: {
        name: 'Plasma Lance',
        color: '#d8e4ef',
        cooldown: [0.24, 0.2, 0.17],
        speed: 680,
        damage: [4, 5, 6],
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

function fireWeapon(weapon, ship, scrollSpeed, charge = 0) {
    const spec = WEAPONS[weapon.type];
    const tierIndex = weapon.tier - 1;
    const chargeScale = weapon.type === 'nova' || weapon.type === 'singularity' ? 0.5 + Math.max(0, Math.min(1, charge)) * 1.5 : 1;
    const pattern = spec.pattern[tierIndex];
    const bullets = pattern.map(([angle, offset]) => new Bullet({
        x: ship.x + offset,
        y: ship.y + ship.size,
        vx: Math.sin(angle) * spec.speed,
        vy: Math.cos(angle) * spec.speed + scrollSpeed,
        size: spec.size[tierIndex],
        damage: Math.round(spec.damage[tierIndex] * chargeScale),
        pierce: (weapon.type !== 'nova' && weapon.type !== 'singularity' && spec.pierce) || charge >= 0.85,
        radius: 0,
        maxRadius: weapon.type === 'nova' || weapon.type === 'singularity' ? spec.size[tierIndex] * chargeScale : 0,
        life: 1.4,
        owner: 'player',
        color: spec.color
    }));
    return { bullets, cooldown: spec.cooldown[tierIndex] };
}

module.exports = { WEAPONS, MAX_TIER, createWeapon, applyWeaponPickup, downgradeWeapon, fireWeapon };
