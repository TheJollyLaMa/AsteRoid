// Small seeded RNG so each level's map is the same every time it is played.
function createRng(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function range(rng, min, max) {
    return min + rng() * (max - min);
}

function pick(rng, items) {
    return items[Math.floor(rng() * items.length)];
}

module.exports = { createRng, range, pick };
