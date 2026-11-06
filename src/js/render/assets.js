// Image preloader. Renderers ask for images by key and fall back to vector
// drawing while an image is missing, still loading or failed to load.
const BASE_URL = 'assets/game/';

const ROCK_KEYS = ['rock-1', 'rock-2', 'rock-3', 'rock-4', 'rock-5', 'rock-6', 'rock-7', 'rock-8'];
const FUTURE_ROCK_KEYS = ['future-rock-1', 'future-rock-2', 'future-rock-3', 'future-rock-4'];
const BACKDROP_KEYS = ['bg-galaxy', 'bg-royal', 'bg-2a', 'bg-tec', 'bg-zz'];
const SECTOR2_BACKDROP_KEYS = ['bg-sector2-lotus', 'bg-sector2-mars', 'bg-sector2-top'];
const BREATHE_FRAMES = 8;
const MINI_EMBLEM_FRAMES = 12;
const ELEPHANT_FRAMES = 20;
const ELEPHANT_COLUMNS = 5;

const MANIFEST = {
    'rock-1': 'rock-1.png',
    'rock-2': 'rock-2.png',
    'rock-3': 'rock-3.png',
    'rock-4': 'rock-4.png',
    'rock-5': 'rock-5.png',
    'rock-6': 'rock-6.png',
    'rock-7': 'rock-7.png',
    'rock-8': 'rock-8.png',
    gate: 'gate.png',
    'bg-galaxy': 'bg-galaxy.jpg',
    'bg-royal': 'bg-royal.jpg',
    'bg-2a': 'bg-2a.jpg',
    'bg-tec': 'bg-tec.jpg',
    'bg-zz': 'bg-zz.jpg',
    'mars-domicile': 'mars-domicile.jpg',
    'breathe-sheet': 'breathe-sheet.png',
    'breathe-still': 'breathe-still.png',
    'white-lotus': 'white-lotus-clear.png',
    'mini-emblem-sheet': 'mini-emblem-sheet.png',
    'elephant-sheet': 'elephant-sheet.jpg',
    'future-rock-1': 'future-rock-1.png',
    'future-rock-2': 'future-rock-2.png',
    'future-rock-3': 'future-rock-3.png',
    'future-rock-4': 'future-rock-4.png',
    'bg-sector2-lotus': 'bg-sector2-lotus.jpg',
    'bg-sector2-mars': 'bg-sector2-mars.jpg',
    'bg-sector2-top': 'bg-sector2-top.jpg',
    'gate-sector2': 'gate-sector2.png',
    'supporter-70': 'supporter-70.jpg',
    'supporter-71': 'supporter-71.jpg',
    'supporter-75': 'supporter-75.jpg',
    'supporter-76': 'supporter-76.jpg',
    'supporter-78': 'supporter-78.jpg',
    'supporter-79': 'supporter-79.jpg'
};

const images = {};
let loadPromise = null;

function isImageReady(img) {
    return Boolean(img && img.complete !== false && img.naturalWidth > 0);
}

function getImage(key) {
    const img = images[key];
    return isImageReady(img) ? img : null;
}

function loadOne(key, baseUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = baseUrl + MANIFEST[key];
        images[key] = img;
    });
}

// Resolves (never rejects) once every image has loaded or failed; in Node or
// other DOM-less environments it resolves immediately with nothing loaded.
function loadAssets({ baseUrl = BASE_URL } = {}) {
    if (loadPromise) return loadPromise;
    if (typeof Image === 'undefined') {
        loadPromise = Promise.resolve({ loaded: 0, total: Object.keys(MANIFEST).length });
        return loadPromise;
    }
    const keys = Object.keys(MANIFEST);
    loadPromise = Promise.all(keys.map((key) => loadOne(key, baseUrl))).then((results) => ({
        loaded: results.filter(Boolean).length,
        total: keys.length
    }));
    return loadPromise;
}

// Deterministic integer hash so each asteroid keeps the same Mandelblum sprite.
function hashInt(value) {
    let h = (Number(value) | 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
}

function rockKeyFor(id) {
    return ROCK_KEYS[hashInt(id) % ROCK_KEYS.length];
}

function backdropKeyFor(levelNumber) {
    const n = Math.max(1, Math.floor(Number(levelNumber) || 1));
    if (n >= 11) return SECTOR2_BACKDROP_KEYS[(n - 11) % SECTOR2_BACKDROP_KEYS.length];
    return BACKDROP_KEYS[(n - 1) % BACKDROP_KEYS.length];
}

function futureRockKeyFor(id) {
    return FUTURE_ROCK_KEYS[hashInt(id) % FUTURE_ROCK_KEYS.length];
}

function supporterImageKey(tokenId) {
    const id = Number(tokenId);
    return MANIFEST[`supporter-${id}`] ? `supporter-${id}` : null;
}

// Offscreen canvas factory that works in browsers (and returns null in Node).
function makeCanvas(width, height) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = Math.max(1, Math.ceil(height));
    return canvas;
}

// Cached tinted copies: 'flash' = white silhouette, 'shooter' = menacing red/orange.
const tintCache = new Map();
function getAssetResources() {
    return {
        tintSprites: tintCache.size,
        tintPixels: [...tintCache.values()].reduce((total, canvas) => total + (canvas ? canvas.width * canvas.height : 0), 0),
        imagePixels: Object.values(images).reduce((total, image) => total + (isImageReady(image) ? image.naturalWidth * image.naturalHeight : 0), 0)
    };
}
function clearTintResources() {
    for (const canvas of tintCache.values()) if (canvas) { canvas.width = 0; canvas.height = 0; }
    tintCache.clear();
}
function getTinted(key, mode) {
    const cacheKey = `${key}|${mode}`;
    if (tintCache.has(cacheKey)) return tintCache.get(cacheKey);
    const img = getImage(key);
    if (!img) return null;
    const canvas = makeCanvas(img.naturalWidth, img.naturalHeight);
    if (!canvas) return null;
    const c = canvas.getContext('2d');
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    if (mode === 'flash') {
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, canvas.width, canvas.height);
    } else if (mode === 'shooter') {
        c.globalCompositeOperation = 'multiply';
        c.fillStyle = '#ff6a3c';
        c.fillRect(0, 0, canvas.width, canvas.height);
        c.globalCompositeOperation = 'destination-in';
        c.drawImage(img, 0, 0);
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = 'rgba(120, 0, 30, 0.25)';
        c.fillRect(0, 0, canvas.width, canvas.height);
    }
    tintCache.set(cacheKey, canvas);
    return canvas;
}

module.exports = {
    getAssetResources,
    clearTintResources,
    BASE_URL,
    MANIFEST,
    ROCK_KEYS,
    FUTURE_ROCK_KEYS,
    BACKDROP_KEYS,
    SECTOR2_BACKDROP_KEYS,
    BREATHE_FRAMES,
    MINI_EMBLEM_FRAMES,
    ELEPHANT_FRAMES,
    ELEPHANT_COLUMNS,
    isImageReady,
    getImage,
    loadAssets,
    hashInt,
    rockKeyFor,
    backdropKeyFor,
    futureRockKeyFor,
    supporterImageKey,
    makeCanvas,
    getTinted
};
