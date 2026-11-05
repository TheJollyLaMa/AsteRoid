(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const Game = require('./game');
const { createAudio } = require('./audio');
const { createOverviewRenderer } = require('./render/overview');
const { createPovRenderer } = require('./render/pov');
const { createHud } = require('./render/hud');
const { drawOverlay } = require('./render/screens');
const { createFx } = require('./render/fx');
const { drawCrt } = require('./render/post');
const { loadAssets } = require('./render/assets');
const { renderBattleCard, previewBattleCard } = require('./render/battleCard');
const { sampleRecord } = require('./render/cardMath');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const CRT_KEY = 'asteroid.crt';

function safeStorage() {
    try {
        return window.localStorage;
    } catch (error) {
        return null;
    }
}

const storage = safeStorage();
const game = new Game({ storage });
const audio = createAudio();
const fx = createFx();
const hud = createHud();
const renderers = { overview: createOverviewRenderer(), pov: createPovRenderer() };
const display = { crt: true };
try {
    if (storage && storage.getItem(CRT_KEY) === 'off') display.crt = false;
} catch (error) {
    // Storage may be blocked; keep the default.
}
loadAssets();

const HELD_KEYS = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ' ': 'fire'
};

const ACTION_KEYS = {
    Enter: 'confirm',
    v: 'toggleView', V: 'toggleView',
    p: 'pause', P: 'pause', Escape: 'pause',
    q: 'menu', Q: 'menu',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right'
};

const TITLE_DIFFICULTY_KEYS = {
    ArrowUp: 'difficultyPrev', w: 'difficultyPrev', W: 'difficultyPrev',
    ArrowDown: 'difficultyNext', s: 'difficultyNext', S: 'difficultyNext'
};

const input = { left: false, right: false, up: false, down: false, fire: false };

function supportsDifficulty() {
    return typeof game.setDifficulty === 'function' && 'selectedDifficulty' in game;
}

// Typing in forms, dialogs or editable content must never steer the ship. The
// composed path also covers controls inside shadow roots (e.g. the DecentHead header).
function isTypingContext(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    return path.some((node) => {
        if (!node || node.nodeType !== 1) return false;
        if (node.isContentEditable) return true;
        const tag = node.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        return tag === 'DIALOG' && node.hasAttribute('open');
    });
}

function deepActiveElement() {
    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement;
    return active;
}

// The game owns the keyboard when nothing else is focused or focus is in the flight deck.
function isGameFocus() {
    const active = deepActiveElement();
    if (!active || active === document.body || active === document.documentElement || active === canvas) return true;
    const host = document.activeElement;
    return Boolean(host && host.closest && host.closest('#flight-deck'));
}

document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingContext(event)) return;
    const gameFocus = isGameFocus();
    // Space/Enter belong to a focused button or link outside the game area.
    if (!gameFocus && (event.key === ' ' || event.key === 'Enter')) return;
    const held = HELD_KEYS[event.key];
    const action = ACTION_KEYS[event.key];
    const isGameKey = Boolean(held || action || TITLE_DIFFICULTY_KEYS[event.key] || /^[mMcC]$/.test(event.key));
    if (!isGameKey) return;
    audio.unlock();
    if (gameFocus) event.preventDefault();
    if (held) input[held] = true;
    if (event.repeat) return;
    if (event.key === 'm' || event.key === 'M') {
        audio.toggleMute();
        return;
    }
    if (event.key === 'c' || event.key === 'C') {
        display.crt = !display.crt;
        try {
            if (storage) storage.setItem(CRT_KEY, display.crt ? 'on' : 'off');
        } catch (error) {
            // Ignore storage failures.
        }
        return;
    }
    if (game.state === 'title' && TITLE_DIFFICULTY_KEYS[event.key] && supportsDifficulty()) {
        game.handleAction(TITLE_DIFFICULTY_KEYS[event.key]);
        return;
    }
    if (action) game.handleAction(action);
});

document.addEventListener('keyup', (event) => {
    const held = HELD_KEYS[event.key];
    if (held) input[held] = false;
});

canvas.addEventListener('pointerdown', () => {
    audio.unlock();
    if (document.activeElement !== canvas && typeof canvas.focus === 'function') canvas.focus({ preventScroll: true });
});

window.addEventListener('blur', () => {
    Object.keys(input).forEach((key) => { input[key] = false; });
    if (game.state === 'playing') game.handleAction('pause');
});

function dispatchGameEvent(event) {
    try {
        window.dispatchEvent(new CustomEvent('asteroid:event', { detail: event }));
    } catch (error) {
        // A listener failure must not break the frame loop.
    }
}

// Advances the simulation with hit-stop/slow-mo applied, then fans out events.
function step(realDt, controls = input) {
    game.update(realDt * fx.timeScale(), controls);
    const events = game.drainEvents();
    if (events.length) {
        audio.play(events);
        fx.handle(events, game);
        events.forEach(dispatchGameEvent);
    }
    fx.update(realDt, game);
}

function draw() {
    const shake = fx.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    renderers[game.view](ctx, game, fx);
    ctx.restore();
    fx.drawScreen(ctx);
    hud.drawHud(ctx, game, fx, { muted: audio.muted, crt: display.crt });
    drawOverlay(ctx, game, fx);
    if (display.crt) drawCrt(ctx, game.time || 0);
}

let last = null;
function frame(timestamp) {
    const dt = last === null ? 0 : Math.min(0.05, (timestamp - last) / 1000);
    last = timestamp;
    step(dt);
    draw();
    requestAnimationFrame(frame);
}

// Console handles for debugging, automated play-testing and other page modules.
window.asteroidGame = game;
window.asteroidDraw = draw;
window.asteroidStep = step;
window.AsteroidRender = { renderBattleCard, previewBattleCard, sampleRecord, loadAssets };
window.asteroidReady = true;
window.dispatchEvent(new CustomEvent('asteroid:ready', { detail: { game } }));
requestAnimationFrame(frame);

},{"./audio":3,"./game":7,"./render/assets":10,"./render/battleCard":12,"./render/cardMath":13,"./render/fx":16,"./render/hud":17,"./render/overview":18,"./render/post":19,"./render/pov":20,"./render/screens":22}],2:[function(require,module,exports){
const { range } = require('./rng');

const WORLD_WIDTH = 800;
let nextId = 1;

function makeShape(rng) {
    const points = 9 + Math.floor(rng() * 4);
    return Array.from({ length: points }, () => range(rng, 0.72, 1.12));
}

class Asteroid {
    constructor({ x, y, size, vx = 0, vy = 0, hp, shooter = false, rng = Math.random, fireCooldown }) {
        this.id = nextId++;
        this.x = x;
        this.y = y;
        this.size = size;
        this.vx = vx;
        this.vy = vy;
        this.maxHp = hp || Math.max(1, Math.ceil(size / 14));
        this.hp = this.maxHp;
        this.shooter = shooter;
        this.fireCooldown = fireCooldown === undefined ? range(rng, 0.5, 2.5) : fireCooldown;
        this.rotation = range(rng, 0, Math.PI * 2);
        this.spin = range(rng, -0.8, 0.8);
        this.shape = makeShape(rng);
        this.active = false;
        this.fragment = false;
        this.missed = false;
        this.flash = 0;
    }

    update(dt) {
        this.rotation += this.spin * dt;
        this.flash = Math.max(0, this.flash - dt);
        if (!this.active) return;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.x < this.size) {
            this.x = this.size;
            this.vx = Math.abs(this.vx);
        } else if (this.x > WORLD_WIDTH - this.size) {
            this.x = WORLD_WIDTH - this.size;
            this.vx = -Math.abs(this.vx);
        }
    }

    takeHit(damage) {
        this.hp -= damage;
        this.flash = 0.12;
        return this.hp <= 0;
    }

    breakApart(rng = Math.random) {
        if (this.size < 24) return [];
        return [-1, 1].map((side) => {
            const fragment = new Asteroid({
                x: this.x + side * this.size * 0.3,
                y: this.y,
                size: this.size * 0.55,
                vx: side * range(rng, 40, 80) + this.vx,
                vy: this.vy + range(rng, -20, 20),
                hp: 1,
                rng
            });
            fragment.active = true;
            fragment.fragment = true;
            return fragment;
        });
    }
}

Asteroid.WORLD_WIDTH = WORLD_WIDTH;

module.exports = Asteroid;

},{"./rng":24}],3:[function(require,module,exports){
// Synthesized 8-bit-meets-arcade sound effects (WebAudio only, no files).
// The AudioContext is created lazily on the first key press (autoplay rules).
const { normalizeEvent } = require('./render/events');

const NOTE = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12);

function createAudio() {
    let context = null;
    let master = null;
    let noiseBuffer = null;
    let muted = false;
    const lastPlayed = {};

    function ensureContext() {
        if (context || typeof window === 'undefined') return context;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        context = new AudioContext();
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.ratio.value = 6;
        master = context.createGain();
        master.gain.value = muted ? 0 : 0.9;
        master.connect(compressor).connect(context.destination);
        const length = context.sampleRate;
        noiseBuffer = context.createBuffer(1, length, context.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        // Stepped noise gives a crunchier, more 8-bit texture than pure white noise.
        let held = 0;
        for (let i = 0; i < length; i++) {
            if (i % 3 === 0) held = Math.random() * 2 - 1;
            data[i] = held;
        }
        return context;
    }

    function ready() {
        return Boolean(context && master && !muted);
    }

    function throttle(key, seconds) {
        const now = context.currentTime;
        if (lastPlayed[key] !== undefined && now - lastPlayed[key] < seconds) return false;
        lastPlayed[key] = now;
        return true;
    }

    function tone({ frequency, endFrequency = frequency, duration = 0.1, type = 'square', volume = 0.05, delay = 0, attack = 0.002, filter = null, vibrato = 0 }) {
        const start = context.currentTime + delay;
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, start);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(volume, start + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        let node = osc;
        if (filter) {
            const f = context.createBiquadFilter();
            f.type = filter.type || 'lowpass';
            f.frequency.setValueAtTime(filter.from, start);
            if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, start + duration);
            f.Q.value = filter.q || 1;
            node.connect(f);
            node = f;
        }
        if (vibrato) {
            const lfo = context.createOscillator();
            const depth = context.createGain();
            lfo.frequency.value = vibrato;
            depth.gain.value = frequency * 0.08;
            lfo.connect(depth).connect(osc.frequency);
            lfo.start(start);
            lfo.stop(start + duration);
        }
        node.connect(gain).connect(master);
        osc.start(start);
        osc.stop(start + duration + 0.02);
    }

    function noise({ duration = 0.3, volume = 0.2, from = 3000, to = 120, type = 'lowpass', q = 0.8, delay = 0 }) {
        const start = context.currentTime + delay;
        const src = context.createBufferSource();
        src.buffer = noiseBuffer;
        src.loop = true;
        const f = context.createBiquadFilter();
        f.type = type;
        f.Q.value = q;
        f.frequency.setValueAtTime(from, start);
        f.frequency.exponentialRampToValueAtTime(Math.max(30, to), start + duration);
        const gain = context.createGain();
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        src.connect(f).connect(gain).connect(master);
        src.start(start, Math.random() * 0.5);
        src.stop(start + duration + 0.02);
    }

    function explosion(size = 20, heavy = false) {
        const s = Math.max(0.4, Math.min(2.2, size / 22));
        const duration = 0.25 + 0.3 * s + (heavy ? 0.6 : 0);
        noise({ duration, volume: 0.22 + 0.08 * s, from: 2600 + 1400 * s, to: 80, q: 0.7 });
        noise({ duration: 0.06, volume: 0.18, from: 6000, to: 2000, type: 'highpass' });
        tone({ frequency: 150 * (heavy ? 0.7 : 1), endFrequency: 32, duration: duration * 0.8, type: 'sine', volume: 0.32 + 0.1 * s });
        tone({ frequency: 90, endFrequency: 40, duration: duration * 0.5, type: 'square', volume: 0.05, filter: { from: 600, to: 100 } });
    }

    function arpeggio(notes, { step = 0.07, type = 'square', volume = 0.06, length = 0.12, delay = 0 } = {}) {
        notes.forEach((n, i) => {
            if (n === null) return;
            tone({ frequency: NOTE(n), duration: length, type, volume, delay: delay + i * step, attack: 0.004 });
        });
    }

    const LASERS = {
        blaster: () => {
            tone({ frequency: 1500, endFrequency: 260, duration: 0.11, type: 'square', volume: 0.05, filter: { from: 5000, to: 900 } });
            tone({ frequency: 760, endFrequency: 180, duration: 0.09, type: 'sawtooth', volume: 0.025 });
        },
        spread: () => {
            [1, 1.26, 1.5].forEach((m) => tone({ frequency: 900 * m, endFrequency: 300 * m, duration: 0.08, type: 'square', volume: 0.02 }));
            noise({ duration: 0.08, volume: 0.08, from: 5000, to: 1500, type: 'bandpass', q: 1.2 });
        },
        rapid: () => {
            if (!throttle('rapid', 0.045)) return;
            tone({ frequency: 2400, endFrequency: 900, duration: 0.05, type: 'square', volume: 0.022, filter: { from: 6000, to: 2000 } });
        },
        plasma: () => {
            tone({ frequency: 260, endFrequency: 55, duration: 0.38, type: 'sawtooth', volume: 0.07, filter: { from: 3200, to: 200, q: 6 }, vibrato: 28 });
            tone({ frequency: 110, endFrequency: 40, duration: 0.3, type: 'sine', volume: 0.12 });
            tone({ frequency: 1800, endFrequency: 600, duration: 0.12, type: 'triangle', volume: 0.03 });
        }
    };

    const sounds = {
        shot: (e) => (LASERS[e.weapon] || LASERS.blaster)(),
        enemyShot: () => {
            if (!throttle('enemyShot', 0.06)) return;
            tone({ frequency: 640, endFrequency: 150, duration: 0.2, type: 'triangle', volume: 0.05, vibrato: 40 });
            tone({ frequency: 320, endFrequency: 90, duration: 0.18, type: 'square', volume: 0.015 });
        },
        hit: () => {
            if (!throttle('hit', 0.03)) return;
            noise({ duration: 0.05, volume: 0.1, from: 4000, to: 1200, type: 'bandpass', q: 2 });
            tone({ frequency: 520, endFrequency: 260, duration: 0.05, volume: 0.03 });
        },
        explode: (e) => {
            if (!throttle('explode', 0.035)) return;
            explosion(Number(e.size) || 20, false);
            if (e.shooter) tone({ frequency: 1200, endFrequency: 200, duration: 0.25, type: 'sawtooth', volume: 0.03, delay: 0.02 });
        },
        shipHit: () => {
            noise({ duration: 0.35, volume: 0.3, from: 1800, to: 120, q: 3 });
            tone({ frequency: 110, endFrequency: 45, duration: 0.3, type: 'square', volume: 0.1, filter: { from: 900, to: 150 } });
        },
        shieldHit: () => {
            tone({ frequency: 1480, endFrequency: 1320, duration: 0.25, type: 'sine', volume: 0.07 });
            tone({ frequency: 2220, endFrequency: 1980, duration: 0.18, type: 'sine', volume: 0.04 });
            noise({ duration: 0.12, volume: 0.06, from: 7000, to: 3000, type: 'bandpass', q: 6 });
        },
        pickup: (e) => {
            if (e.pickupType === 'power') {
                // Ens Eth breathe: rising shimmering chime.
                arpeggio([3, 7, 10, 15, 19, 22], { step: 0.055, type: 'triangle', volume: 0.07, length: 0.35 });
                arpeggio([15, 19, 22, 27], { step: 0.055, type: 'sine', volume: 0.04, length: 0.5, delay: 0.03 });
            } else if (e.pickupType === 'shield') {
                tone({ frequency: 300, endFrequency: 1200, duration: 0.3, type: 'sine', volume: 0.08, vibrato: 18 });
                arpeggio([7, 14], { step: 0.1, type: 'triangle', volume: 0.05, length: 0.25 });
            } else {
                arpeggio([0, 4, 7, 12], { step: 0.05, type: 'square', volume: 0.05, length: 0.09 });
            }
        },
        asteroidMissed: () => {
            if (!throttle('missed', 0.25)) return;
            tone({ frequency: 180, endFrequency: 120, duration: 0.12, type: 'triangle', volume: 0.025 });
        },
        shipDestroyed: () => {
            explosion(60, true);
            tone({ frequency: 880, endFrequency: 40, duration: 1.2, type: 'sawtooth', volume: 0.06, filter: { from: 3000, to: 120 } });
        },
        respawn: () => arpeggio([-5, 0, 7], { step: 0.08, type: 'triangle', volume: 0.05 }),
        levelStart: () => {
            tone({ frequency: 200, endFrequency: 1600, duration: 0.5, type: 'sawtooth', volume: 0.03, filter: { from: 400, to: 5000, q: 5 } });
            arpeggio([0, 7, 12], { step: 0.1, type: 'square', volume: 0.04, delay: 0.35 });
        },
        levelComplete: () => {
            arpeggio([3, 7, 10, 15, 10, 15, 19, null, 22], { step: 0.085, type: 'square', volume: 0.06, length: 0.14 });
            arpeggio([-9, -5, -2, 3], { step: 0.17, type: 'triangle', volume: 0.07, length: 0.3 });
            noise({ duration: 0.6, volume: 0.05, from: 9000, to: 4000, type: 'highpass', delay: 0.68 });
        },
        victory: () => {
            const melody = [3, 3, 3, 7, null, 10, 7, 10, 15, null, 15, 19, 22, 27];
            arpeggio(melody, { step: 0.12, type: 'square', volume: 0.06, length: 0.16 });
            arpeggio([-9, -9, -2, -2, 3, 3, 10, 10], { step: 0.21, type: 'triangle', volume: 0.08, length: 0.32 });
            for (let i = 0; i < 4; i++) noise({ duration: 0.7, volume: 0.06, from: 9000, to: 3000, type: 'highpass', delay: 0.4 + i * 0.42 });
            tone({ frequency: NOTE(27), duration: 1.2, type: 'sawtooth', volume: 0.04, delay: 1.7, filter: { from: 4000, to: 800 }, vibrato: 6 });
        },
        gameOver: () => {
            arpeggio([3, 2, 1, 0, -2, -5, -9], { step: 0.16, type: 'square', volume: 0.06, length: 0.2 });
            tone({ frequency: 110, endFrequency: 30, duration: 1.4, type: 'sawtooth', volume: 0.06, delay: 1.0, filter: { from: 1200, to: 80 } });
        }
    };

    return {
        unlock() {
            const ctx = ensureContext();
            if (ctx && ctx.state === 'suspended') ctx.resume();
        },
        toggleMute() {
            muted = !muted;
            if (master) master.gain.value = muted ? 0 : 0.9;
            return muted;
        },
        get muted() {
            return muted;
        },
        play(events) {
            if (!ready()) return;
            for (const raw of events) {
                const event = normalizeEvent(raw);
                const sound = sounds[event.type];
                if (!sound) continue;
                try {
                    sound(event);
                } catch (error) {
                    // A failed sound must never break the game loop.
                }
            }
        }
    };
}

module.exports = { createAudio };

},{"./render/events":14}],4:[function(require,module,exports){
// World-space projectile. `y` is forward distance along the level.
class Bullet {
    constructor({ x, y, vx = 0, vy = 0, size = 3, damage = 1, pierce = false, life = 1.4, owner = 'player', color = '#fff' }) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.size = size;
        this.damage = damage;
        this.pierce = pierce;
        this.life = life;
        this.owner = owner;
        this.color = color;
        this.hits = pierce ? new Set() : null;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
    }

    get alive() {
        return this.life > 0;
    }
}

module.exports = Bullet;

},{}],5:[function(require,module,exports){
// collision.js

function checkCollision(obj1, obj2) {
    const dx = obj1.x - obj2.x;
    const dy = obj1.y - obj2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Use the size of both objects for accurate detection
    return distance < obj1.size + obj2.size;
}

module.exports = checkCollision;
},{}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
const checkCollision = require('./collision');
const Spaceship = require('./spaceship');
const Bullet = require('./bullet');
const { createRng, range } = require('./rng');
const { getLevel, LEVEL_COUNT } = require('./levels');
const { populateLevel } = require('./levelLayout');
const { applyWeaponPickup, downgradeWeapon, fireWeapon } = require('./weapons');
const { DIFFICULTY_IDS, isDifficulty, getDifficulty, stepDifficulty } = require('./difficulty');
const { LevelTracker, createTotals, mergeTotals, buildLevelRecord } = require('./stats');
const {
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    MAX_WINS,
    loadSave,
    persistSave,
    validateSave
} = require('./save');

const ACTIVATION_DISTANCE = 900;
const FIRE_RANGE = { min: 80, max: 700 };
const LEVEL_INTRO_TIME = 2.5;
const LEVEL_COMPLETE_TIME = 3.5;
const RESPAWN_TIME = 1.8;

const clone = (value) => JSON.parse(JSON.stringify(value));

class Game {
    constructor({ storage = null, now = () => Date.now() } = {}) {
        this.storage = storage;
        this.now = now;
        this.save = loadSave(storage);
        this.selectedDifficulty = this.save.progress.lastDifficulty;
        this.difficulty = this.selectedDifficulty;
        this.selectedLevel = this.progress.unlocked;
        this.runStats = createTotals();
        this.tracker = new LevelTracker();
        this.lastRecord = null;
        this.view = 'overview';
        this.state = 'title';
        this.events = [];
        this.particles = [];
        this.time = 0;
        this.score = 0;
        this.levelStartScore = 0;
        this.ship = new Spaceship();
        this.level = getLevel(1, this.difficulty);
        this.resetWorld();
    }

    // Progress ({unlocked, highScore, bestLevelScores}) of the difficulty shown on the title
    // screen, or of the difficulty being played.
    get progress() {
        const id = this.state === 'title' ? this.selectedDifficulty : this.difficulty;
        return this.save.progress.byDifficulty[id];
    }

    get difficultyLabel() {
        return getDifficulty(this.difficulty).label;
    }

    get selectedDifficultyLabel() {
        return getDifficulty(this.selectedDifficulty).label;
    }

    get levelStats() {
        return this.tracker.snapshot();
    }

    get combo() {
        return this.tracker.combo;
    }

    get comboTimer() {
        return this.tracker.comboTimer;
    }

    getProgress(difficulty = this.selectedDifficulty) {
        return clone(this.save.progress.byDifficulty[getDifficulty(difficulty).id]);
    }

    getLifetimeStats() {
        return clone(this.save.lifetime);
    }

    getRunStats() {
        return clone(this.runStats);
    }

    getWinRecords() {
        return clone(this.save.wins);
    }

    setDifficulty(id) {
        if (!isDifficulty(id)) throw new RangeError(`Unknown difficulty: ${id}`);
        this.selectedDifficulty = id;
        this.selectedLevel = this.save.progress.byDifficulty[id].unlocked;
    }

    resetWorld() {
        this.scrollY = 0;
        this.asteroids = [];
        this.pickups = [];
        this.playerBullets = [];
        this.enemyBullets = [];
        this.levelTime = 0;
        this.stateTimer = 0;
        this.levelBonus = 0;
    }

    emit(type, data = {}) {
        this.events.push({ ...data, type });
    }

    drainEvents() {
        const events = this.events;
        this.events = [];
        return events;
    }

    startCampaign(levelNumber = 1, difficulty = this.selectedDifficulty) {
        getLevel(levelNumber, difficulty);
        this.finishAttempt('abandoned');
        this.difficulty = getDifficulty(difficulty).id;
        this.selectedDifficulty = this.difficulty;
        this.save.progress.lastDifficulty = this.difficulty;
        this.score = 0;
        this.runStats = createTotals();
        this.runStats.campaignsStarted = 1;
        this.save.lifetime.campaignsStarted += 1;
        this.ship = this.createShip();
        this.startLevel(levelNumber);
        this.saveProgress();
    }

    createShip() {
        const ship = new Spaceship();
        ship.lives = getDifficulty(this.difficulty).lives;
        return ship;
    }

    startLevel(levelNumber) {
        const level = getLevel(levelNumber, this.difficulty);
        this.finishAttempt('abandoned');
        this.level = level;
        this.rng = createRng(this.level.seed);
        this.resetWorld();
        const layout = populateLevel(this.level, this.rng);
        this.asteroids = layout.asteroids;
        this.pickups = layout.pickups;
        this.tracker = new LevelTracker();
        this.tracker.spawned(this.asteroids.length);
        this.levelStartedAt = this.now();
        const { lives, weapon } = this.ship;
        this.ship.reset();
        this.ship.lives = lives;
        this.ship.weapon = weapon;
        this.ship.y = this.ship.offset;
        this.ship.invulnerable = LEVEL_INTRO_TIME;
        this.levelStartScore = this.score;
        this.particles = [];
        this.state = 'playing';
        this.emit('levelStart', { level: levelNumber });
    }

    retryLevel() {
        this.score = this.levelStartScore;
        this.ship = this.createShip();
        this.startLevel(this.level.number);
    }

    handleAction(action) {
        switch (action) {
            case 'toggleView':
                this.view = this.view === 'overview' ? 'pov' : 'overview';
                break;
            case 'pause':
                if (this.state === 'playing') this.state = 'paused';
                else if (this.state === 'paused') this.state = 'playing';
                break;
            case 'left':
            case 'right':
                if (this.state === 'title') {
                    const delta = action === 'left' ? -1 : 1;
                    this.selectedLevel = Math.min(this.progress.unlocked, Math.max(1, this.selectedLevel + delta));
                }
                break;
            case 'difficultyPrev':
            case 'difficultyNext':
                if (this.state === 'title') this.setDifficulty(stepDifficulty(this.selectedDifficulty, action === 'difficultyPrev' ? -1 : 1));
                break;
            case 'confirm':
                if (this.state === 'title') this.startCampaign(this.selectedLevel);
                else if (this.state === 'gameOver') this.retryLevel();
                else if (this.state === 'levelComplete') this.advanceLevel();
                else if (this.state === 'paused') this.state = 'playing';
                else if (this.state === 'victory') this.goToTitle();
                break;
            case 'menu':
                if (['paused', 'gameOver', 'victory'].includes(this.state)) this.goToTitle();
                break;
            default:
                break;
        }
    }

    goToTitle() {
        this.finishAttempt('abandoned');
        this.saveProgress();
        this.state = 'title';
        this.selectedDifficulty = this.difficulty;
        this.selectedLevel = this.progress.unlocked;
    }

    // Folds the current level attempt into run and lifetime totals exactly once.
    finishAttempt(outcome) {
        const tracker = this.tracker;
        if (!tracker || tracker.finalized || this.levelStartedAt == null) return;
        if (outcome === 'abandoned' && this.levelTime <= 0) {
            tracker.finalized = true;
            return;
        }
        tracker.finalized = true;
        const stats = tracker.snapshot();
        const extra = { outcome, livesLost: tracker.livesLost, durationSec: this.levelTime };
        mergeTotals(this.runStats, stats, extra);
        mergeTotals(this.save.lifetime, stats, extra);
    }

    update(dt, input = {}) {
        this.time += dt;
        this.updateParticles(dt);

        if (this.state === 'levelComplete') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) this.advanceLevel();
            return;
        }
        if (this.state !== 'playing' && this.state !== 'dying') return;

        this.levelTime += dt;
        this.scrollY += this.level.scrollSpeed * dt;
        const ship = this.ship;
        this.tracker.tick(dt, ship, this.view);

        if (this.state === 'playing') {
            ship.update(dt, input, this.scrollY);
            if (input.fire && ship.cooldown <= 0) this.firePlayerWeapon();
        } else {
            ship.y = this.scrollY + ship.offset;
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) this.respawnOrEnd();
        }

        this.updateAsteroids(dt);
        this.playerBullets.forEach((bullet) => bullet.update(dt));
        this.enemyBullets.forEach((bullet) => bullet.update(dt));
        this.resolvePlayerHits();
        if (this.state === 'playing') this.resolveShipHits();
        this.trackPassing();
        this.cleanup();

        if (this.state === 'playing' && this.scrollY >= this.level.length) this.completeLevel();
    }

    firePlayerWeapon() {
        const shot = fireWeapon(this.ship.weapon, this.ship, this.level.scrollSpeed);
        this.playerBullets.push(...shot.bullets);
        this.ship.cooldown = shot.cooldown;
        this.tracker.shot(this.ship.weapon.type, shot.bullets.length);
        this.emit('shot', { weapon: this.ship.weapon.type });
    }

    updateAsteroids(dt) {
        const ship = this.ship;
        const shipCanBeTargeted = this.state === 'playing';
        for (const asteroid of this.asteroids) {
            if (!asteroid.active && asteroid.y - ship.y < ACTIVATION_DISTANCE) asteroid.active = true;
            asteroid.update(dt);
            if (!asteroid.shooter || !asteroid.active || !shipCanBeTargeted) continue;
            asteroid.fireCooldown -= dt;
            const ahead = asteroid.y - ship.y;
            if (asteroid.fireCooldown <= 0 && ahead > FIRE_RANGE.min && ahead < FIRE_RANGE.max) {
                this.fireEnemyBullet(asteroid);
                asteroid.fireCooldown = this.level.fireInterval * range(this.rng, 0.7, 1.3);
            }
        }
    }

    fireEnemyBullet(asteroid) {
        const ship = this.ship;
        const angle = Math.atan2(ship.x - asteroid.x, ship.y - asteroid.y) + range(this.rng, -1, 1) * this.level.aimError;
        const speed = this.level.enemyBulletSpeed;
        this.enemyBullets.push(new Bullet({
            x: asteroid.x,
            y: asteroid.y - asteroid.size,
            vx: Math.sin(angle) * speed,
            // Add the scroll speed so the bullet is aimed relative to the moving ship.
            vy: Math.cos(angle) * speed + this.level.scrollSpeed,
            size: 4,
            damage: this.level.bulletDamage,
            life: 6,
            owner: 'enemy',
            color: '#ff5a3c'
        }));
        this.tracker.enemyShot();
        this.emit('enemyShot', { x: asteroid.x, y: asteroid.y });
    }

    resolvePlayerHits() {
        const spawned = [];
        for (const bullet of this.playerBullets) {
            if (!bullet.alive) continue;
            for (const asteroid of this.asteroids) {
                if (asteroid.hp <= 0 || (bullet.hits && bullet.hits.has(asteroid.id))) continue;
                if (!checkCollision(bullet, asteroid)) continue;
                if (bullet.hits) bullet.hits.add(asteroid.id);
                else bullet.life = 0;
                if (!bullet.scored) {
                    bullet.scored = true;
                    this.tracker.hit();
                }
                if (asteroid.takeHit(bullet.damage)) {
                    spawned.push(...this.destroyAsteroid(asteroid, true, true));
                } else {
                    this.emit('hit', { x: asteroid.x, y: asteroid.y });
                }
                if (!bullet.pierce) break;
            }
        }
        this.asteroids.push(...spawned);
    }

    destroyAsteroid(asteroid, awardPoints = true, byPlayerShot = false) {
        asteroid.hp = 0;
        if (awardPoints) {
            const base = asteroid.shooter ? 150 : 50 + asteroid.maxHp * 25;
            this.score += Math.round(base * (1 + (this.level.number - 1) * 0.1) * this.scoreMultiplier);
        }
        this.tracker.destroyed(asteroid, byPlayerShot);
        this.spawnExplosion(asteroid.x, asteroid.y, asteroid.shooter ? '#ff8a5c' : '#d8d2c4', Math.round(asteroid.size));
        this.emit('explode', { x: asteroid.x, y: asteroid.y, size: asteroid.size, shooter: asteroid.shooter, combo: this.combo });
        const fragments = asteroid.breakApart(this.rng);
        this.tracker.spawned(fragments.length);
        return fragments;
    }

    get scoreMultiplier() {
        return this.level.scoreMultiplier ?? 1;
    }

    resolveShipHits() {
        const ship = this.ship;

        for (const bullet of this.enemyBullets) {
            if (!bullet.alive || !checkCollision(bullet, ship)) continue;
            bullet.life = 0;
            bullet.struckShip = true;
            this.damageShip(bullet.damage, bullet.x, bullet.y);
            if (this.state !== 'playing') return;
        }

        for (const asteroid of this.asteroids) {
            if (asteroid.hp <= 0 || !checkCollision(asteroid, ship)) continue;
            this.tracker.collision();
            const fragments = this.destroyAsteroid(asteroid, ship.shield > 0);
            this.asteroids.push(...fragments);
            this.damageShip((30 + asteroid.size) * (this.level.ramDamageMultiplier ?? 1), asteroid.x, asteroid.y);
            if (this.state !== 'playing') return;
        }

        for (const pickup of this.pickups) {
            if (pickup.collected || !checkCollision(pickup, ship)) continue;
            pickup.collected = true;
            this.collectPickup(pickup);
        }
    }

    damageShip(amount, x, y) {
        const ship = this.ship;
        if (ship.shield > 0) {
            this.tracker.shieldBlock();
            this.emit('shieldHit', { x, y });
            return;
        }
        if (ship.invulnerable > 0) return;
        const before = ship.power;
        ship.power = Math.max(0, ship.power - amount);
        ship.invulnerable = 0.6;
        this.tracker.damaged(before - ship.power, x, y);
        this.emit('shipHit', { x, y, power: ship.power });
        if (ship.power <= 0) this.destroyShip();
    }

    destroyShip() {
        const ship = this.ship;
        ship.lives -= 1;
        this.tracker.lifeLost();
        this.state = 'dying';
        this.stateTimer = RESPAWN_TIME;
        this.spawnExplosion(ship.x, ship.y, '#7fd7ff', 40);
        this.emit('shipDestroyed', { x: ship.x, y: ship.y });
    }

    respawnOrEnd() {
        const ship = this.ship;
        if (ship.lives <= 0) {
            this.state = 'gameOver';
            this.finishAttempt('failed');
            this.saveProgress();
            this.emit('gameOver');
            return;
        }
        ship.power = ship.maxPower;
        ship.weapon = downgradeWeapon(ship.weapon);
        ship.invulnerable = 2.5;
        ship.x = 400;
        ship.offset = 90;
        ship.y = this.scrollY + ship.offset;
        this.enemyBullets = this.enemyBullets.filter((bullet) => Math.abs(bullet.y - ship.y) > 300);
        this.state = 'playing';
        this.emit('respawn');
    }

    collectPickup(pickup) {
        const ship = this.ship;
        if (pickup.type === 'power') {
            ship.power = Math.min(ship.maxPower, ship.power + (this.level.powerRestore ?? 40));
        } else if (pickup.type === 'shield') {
            ship.shield = this.level.shieldTime ?? 7;
        } else {
            ship.weapon = applyWeaponPickup(ship.weapon, pickup.type);
        }
        this.tracker.pickup(pickup.type, pickup.x, pickup.y);
        this.score += Math.round(100 * this.scoreMultiplier);
        this.spawnExplosion(pickup.x, pickup.y, '#9effa8', 14);
        this.emit('pickup', { pickupType: pickup.type, x: pickup.x, y: pickup.y, weapon: { ...ship.weapon } });
    }

    completeLevel() {
        if (this.state !== 'playing' || this.tracker.finalized) return;
        this.levelBonus = Math.round((Math.round(this.ship.power) * 10 + this.level.number * 250) * this.scoreMultiplier);
        this.score += this.levelBonus;
        const levelScore = this.score - this.levelStartScore;
        const progress = this.save.progress.byDifficulty[this.difficulty];
        const key = String(this.level.number);
        progress.bestLevelScores[key] = Math.max(progress.bestLevelScores[key] || 0, levelScore);
        this.finishAttempt('cleared');
        const record = buildLevelRecord({
            level: { ...this.level, difficulty: this.difficulty, difficultyLabel: this.difficultyLabel },
            tracker: this.tracker,
            ship: this.ship,
            view: this.view,
            score: { total: this.score, level: levelScore - this.levelBonus, bonus: this.levelBonus },
            startedAt: this.levelStartedAt,
            completedAt: this.now(),
            durationSec: this.levelTime
        });
        this.lastRecord = record;
        this.save.wins.push(record);
        if (this.save.wins.length > MAX_WINS) this.save.wins.splice(0, this.save.wins.length - MAX_WINS);
        this.emit('levelRecord', { record: clone(record) });
        const next = this.level.number + 1;
        if (next > LEVEL_COUNT) {
            this.state = 'victory';
            this.runStats.victories += 1;
            this.save.lifetime.victories += 1;
            this.saveProgress();
            this.emit('victory');
            return;
        }
        progress.unlocked = Math.max(progress.unlocked, next);
        this.saveProgress();
        this.state = 'levelComplete';
        this.stateTimer = LEVEL_COMPLETE_TIME;
        this.emit('levelComplete', { level: this.level.number });
    }

    advanceLevel() {
        if (this.state !== 'levelComplete') return;
        const ship = this.ship;
        ship.power = ship.maxPower;
        this.startLevel(this.level.number + 1);
    }

    saveProgress() {
        const progress = this.save.progress.byDifficulty[this.difficulty];
        progress.highScore = Math.max(progress.highScore, this.score);
        // Progress saving is optional; play continues without it.
        persistSave(this.storage, this.exportSave());
    }

    exportSave() {
        return clone({ ...this.save, savedAt: new Date(this.now()).toISOString() });
    }

    // Validates (throws Error with a player-facing message), replaces the save and persists it.
    importSave(obj) {
        const save = validateSave(obj);
        this.save = save;
        if (this.state === 'title') {
            this.selectedDifficulty = save.progress.lastDifficulty;
            this.difficulty = this.selectedDifficulty;
        }
        const unlocked = this.save.progress.byDifficulty[this.state === 'title' ? this.selectedDifficulty : this.difficulty].unlocked;
        this.selectedLevel = Math.min(Math.max(1, this.selectedLevel), unlocked);
        if (this.state === 'title') this.selectedLevel = unlocked;
        persistSave(this.storage, this.exportSave());
        return this.exportSave();
    }

    // Counts asteroids and pickups that slip behind the ship without being destroyed/collected,
    // and tracks how close each enemy bullet came.
    trackPassing() {
        const ship = this.ship;
        const behindLine = ship.y - ship.size;
        for (const asteroid of this.asteroids) {
            if (asteroid.missed || asteroid.hp <= 0 || asteroid.y + asteroid.size >= behindLine) continue;
            asteroid.missed = true;
            this.tracker.missed(asteroid.x, asteroid.y);
            this.emit('asteroidMissed', { x: asteroid.x, y: asteroid.y });
        }
        for (const pickup of this.pickups) {
            if (pickup.missed || pickup.collected || pickup.y + pickup.size >= behindLine) continue;
            pickup.missed = true;
            this.tracker.pickupMissed();
        }
        if (this.state !== 'playing') return;
        for (const bullet of this.enemyBullets) {
            if (!bullet.alive) continue;
            const gap = Math.hypot(bullet.x - ship.x, bullet.y - ship.y) - bullet.size - ship.size;
            if (bullet.nearest === undefined || gap < bullet.nearest) bullet.nearest = gap;
        }
    }

    cleanup() {
        const behind = this.scrollY - 150;
        const ahead = this.scrollY + this.level.length + 2000;
        this.asteroids = this.asteroids.filter((a) => a.hp > 0 && a.y > behind);
        this.pickups = this.pickups.filter((p) => !p.collected && p.y > behind);
        const inWorld = (b) => b.alive && b.y > behind && b.y < ahead && b.x > -50 && b.x < 850;
        this.playerBullets = this.playerBullets.filter(inWorld);
        this.enemyBullets = this.enemyBullets.filter((bullet) => {
            if (inWorld(bullet)) return true;
            if (!bullet.struckShip) this.tracker.dodged(bullet.nearest);
            return false;
        });
    }

    spawnExplosion(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 30 + Math.random() * 140;
            const life = 0.4 + Math.random() * 0.6;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed + (this.level ? this.level.scrollSpeed : 0),
                life,
                maxLife: life,
                color
            });
        }
    }

    updateParticles(dt) {
        for (const p of this.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
        }
        this.particles = this.particles.filter((p) => p.life > 0);
    }

    get levelProgress() {
        return Math.min(1, this.scrollY / this.level.length);
    }

    get showLevelIntro() {
        return this.state === 'playing' && this.levelTime < LEVEL_INTRO_TIME;
    }
}

Game.STORAGE_KEY = STORAGE_KEY;
Game.LEGACY_STORAGE_KEY = LEGACY_STORAGE_KEY;
Game.DIFFICULTIES = DIFFICULTY_IDS;

module.exports = Game;

},{"./bullet":4,"./collision":5,"./difficulty":6,"./levelLayout":8,"./levels":9,"./rng":24,"./save":25,"./spaceship":26,"./stats":27,"./weapons":28}],8:[function(require,module,exports){
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

},{"./asteroid":2,"./rng":24}],9:[function(require,module,exports){
const { applyDifficulty } = require('./difficulty');

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
// drift and rocks charging at the ship arrive from level 4 onward (on cadet).
// Pilot and ace scale these knobs; see difficulty.js.
function getBaseLevel(number) {
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

function getLevel(number, difficulty = 'cadet') {
    return applyDifficulty(getBaseLevel(number), difficulty);
}

module.exports = { LEVEL_COUNT, LEVEL_NAMES, getLevel, getBaseLevel };

},{"./difficulty":6}],10:[function(require,module,exports){
// Image preloader. Renderers ask for images by key and fall back to vector
// drawing while an image is missing, still loading or failed to load.
const BASE_URL = 'assets/game/';

const ROCK_KEYS = ['rock-1', 'rock-2', 'rock-3', 'rock-4', 'rock-5', 'rock-6', 'rock-7', 'rock-8'];
const BACKDROP_KEYS = ['bg-galaxy', 'bg-royal', 'bg-2a', 'bg-tec', 'bg-zz'];
const BREATHE_FRAMES = 8;

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
    'breathe-still': 'breathe-still.png'
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
    return BACKDROP_KEYS[(n - 1) % BACKDROP_KEYS.length];
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
    BASE_URL,
    MANIFEST,
    ROCK_KEYS,
    BACKDROP_KEYS,
    BREATHE_FRAMES,
    isImageReady,
    getImage,
    loadAssets,
    hashInt,
    rockKeyFor,
    backdropKeyFor,
    makeCanvas,
    getTinted
};

},{}],11:[function(require,module,exports){
// Per-level space backdrops: tinted gradient, a big Mandelblum "nebula"
// (screen-blended so its black matte vanishes) and pixel starfield parallax.
const { VIEW } = require('./projection');
const { getImage, backdropKeyFor } = require('./assets');

const LEVEL_TINTS = [
    ['#04040c', '#0b1430'],
    ['#03060c', '#0a2430'],
    ['#06040e', '#1e0f33'],
    ['#05030a', '#2a0f24'],
    ['#02060a', '#0c2a22'],
    ['#07030a', '#33140f'],
    ['#03030c', '#141a3a'],
    ['#080308', '#3a0f1c'],
    ['#04020c', '#25103d'],
    ['#0a0204', '#3d0b0b']
];

function levelTint(levelNumber) {
    const n = Math.max(1, Math.floor(Number(levelNumber) || 1));
    return LEVEL_TINTS[(n - 1) % LEVEL_TINTS.length];
}

function createStarfield(count, width, height, seed = 7) {
    let s = seed >>> 0;
    const rnd = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const palette = ['#ffffff', '#bfe9ff', '#ffd6f5', '#fff2b0'];
    return Array.from({ length: count }, () => ({
        x: rnd() * width,
        y: rnd() * height,
        depth: 0.15 + rnd() * 0.85,
        twinkle: rnd() * Math.PI * 2,
        color: palette[Math.floor(rnd() * palette.length)]
    }));
}

function drawNebula(ctx, levelNumber, cx, cy, size, alpha, rotation = 0) {
    const img = getImage(backdropKeyFor(levelNumber));
    if (!img) return false;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    const w = size;
    const h = size * (img.naturalHeight / img.naturalWidth);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
}

function createOverviewBackground() {
    const stars = createStarfield(170, VIEW.width, VIEW.height, 11);
    return function drawOverviewBackground(ctx, game) {
        const [top, bottom] = levelTint(game.level && game.level.number);
        const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
        g.addColorStop(0, top);
        g.addColorStop(1, bottom);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, VIEW.width, VIEW.height);
        const scroll = game.scrollY || 0;
        // Slow-drifting giant Mandelblum far behind everything.
        const ny = ((scroll * 0.05) % (VIEW.height * 2.2)) - VIEW.height * 0.6;
        drawNebula(ctx, game.level ? game.level.number : 1, VIEW.width * 0.62, ny, 980, 0.42, (game.time || 0) * 0.01);
        const time = game.time || 0;
        for (const star of stars) {
            const y = (star.y + scroll * star.depth * 0.6) % VIEW.height;
            const tw = 0.55 + 0.45 * Math.sin(time * 3 + star.twinkle);
            ctx.globalAlpha = (0.25 + star.depth * 0.6) * tw;
            ctx.fillStyle = star.color;
            const size = star.depth > 0.8 ? 2 : 1;
            ctx.fillRect(Math.round(star.x), Math.round(y), size, size);
            if (star.depth > 0.92) {
                ctx.globalAlpha *= 0.5;
                ctx.fillRect(Math.round(star.x), Math.round(y) - star.depth * 6, 1, star.depth * 5);
            }
        }
        ctx.globalAlpha = 1;
    };
}

module.exports = { LEVEL_TINTS, levelTint, createStarfield, drawNebula, createOverviewBackground };

},{"./assets":10,"./projection":21}],12:[function(require,module,exports){
// Collectible "battle card" renderer: a deterministic image of one cleared level.
const { getImage, loadAssets, makeCanvas, ROCK_KEYS, backdropKeyFor, rockKeyFor } = require('./assets');
const { pixelText } = require('./font');
const { drawGlow, drawPickup, pixelSprite, SHIP_TOP, SHIP_PALETTE } = require('./shapes');
const { difficultyColor } = require('./hud');
const {
    hashString, createSeededRng, formatUtc, formatDuration, formatPercent,
    cardLayout, mapPoint, killRadius, levelLengthOf, sampleRecord
} = require('./cardMath');

const TITLE = 'AsteRoid \u00b7 Galactic Gauntlet';
const CARD_ACCENTS = ['#7fd7ff', '#5fffd0', '#c78cff', '#ff6cf5', '#ffd25c', '#7dff8c', '#ff8a2c', '#5fd9ff', '#ff5a8a', '#fff4c8'];
const list = (value) => (Array.isArray(value) ? value : []);
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

function drawCover(ctx, img, x, y, w, h, alpha) {
    if (!img) return;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
}

function drawBackdrop(ctx, record, rng, accent) {
    const { width, height } = cardLayout().design;
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#07041a');
    bg.addColorStop(0.55, '#0b0626');
    bg.addColorStop(1, '#020109');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    drawCover(ctx, getImage(backdropKeyFor(record.level)), 0, 0, width, height, 0.42);
    const vignette = ctx.createRadialGradient(width / 2, height / 2, 200, width / 2, height / 2, 860);
    vignette.addColorStop(0, 'rgba(3, 2, 12, 0.15)');
    vignette.addColorStop(1, 'rgba(3, 2, 12, 0.9)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 260; i++) {
        const s = rng() < 0.9 ? 2 : 4;
        ctx.globalAlpha = 0.25 + rng() * 0.7;
        ctx.fillStyle = rng() < 0.15 ? accent : '#dff3ff';
        ctx.fillRect(Math.floor(rng() * width / 2) * 2, Math.floor(rng() * height / 2) * 2, s, s);
    }
    ctx.globalAlpha = 1;
    // Floating Mandelblum rocks in the margins.
    for (let i = 0; i < 5; i++) {
        const img = getImage(ROCK_KEYS[Math.floor(rng() * ROCK_KEYS.length)]);
        if (!img) continue;
        const size = 70 + rng() * 90;
        const x = rng() < 0.5 ? 20 + rng() * 60 : width - 80 - rng() * 60;
        const y = 220 + rng() * 860;
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.translate(x, y);
        ctx.rotate(rng() * Math.PI * 2);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
    }
}

// Stepped 8-bit frame with notched corners.
function drawFrame(ctx, accent) {
    const { frame } = cardLayout();
    const { x, y, w, h } = frame;
    const notch = 18;
    const px = 6;
    const ring = (inset, color, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        const ix = x + inset;
        const iy = y + inset;
        const iw = w - inset * 2;
        const ih = h - inset * 2;
        ctx.fillRect(ix + notch, iy, iw - notch * 2, px);
        ctx.fillRect(ix + notch, iy + ih - px, iw - notch * 2, px);
        ctx.fillRect(ix, iy + notch, px, ih - notch * 2);
        ctx.fillRect(ix + iw - px, iy + notch, px, ih - notch * 2);
        for (let s = 0; s < 3; s++) {
            const o = s * px;
            const d = notch - o - px;
            ctx.fillRect(ix + o, iy + d, px, px);
            ctx.fillRect(ix + d, iy + o, px, px);
            ctx.fillRect(ix + iw - px - o, iy + d, px, px);
            ctx.fillRect(ix + iw - px - d, iy + o, px, px);
            ctx.fillRect(ix + o, iy + ih - px - d, px, px);
            ctx.fillRect(ix + d, iy + ih - px - o, px, px);
            ctx.fillRect(ix + iw - px - o, iy + ih - px - d, px, px);
            ctx.fillRect(ix + iw - px - d, iy + ih - px - o, px, px);
        }
    };
    ring(0, accent, 0.95);
    ring(12, '#7fd7ff', 0.35);
    ctx.globalAlpha = 1;
    // Corner rivets.
    ctx.fillStyle = '#fff4c8';
    [[x + 30, y + 30], [x + w - 36, y + 30], [x + 30, y + h - 36], [x + w - 36, y + h - 36]].forEach(([rx, ry]) => ctx.fillRect(rx, ry, 6, 6));
}

function drawBadge(ctx, text, x, y, color) {
    const w = 24 + text.length * 17;
    ctx.fillStyle = 'rgba(4, 3, 16, 0.85)';
    ctx.fillRect(x - w, y, w, 42);
    ctx.fillStyle = color;
    ctx.fillRect(x - w, y, w, 4);
    ctx.fillRect(x - w, y + 38, w, 4);
    ctx.fillRect(x - w, y, 4, 42);
    ctx.fillRect(x - 4, y, 4, 42);
    drawGlow(ctx, x - w / 2, y + 21, w * 0.7, color, 0.35);
    pixelText(ctx, text, x - w / 2, y + 30, { size: 26, color, align: 'center' });
}

function drawHeader(ctx, record, accent) {
    const { header } = cardLayout();
    const diffId = String(record.difficulty || 'cadet');
    const diffLabel = String(record.difficultyLabel || diffId).toUpperCase();
    pixelText(ctx, TITLE, header.x, header.y + 30, { size: 26, color: '#7fd7ff' });
    const levelText = `LEVEL ${String(num(record.level, 1)).padStart(2, '0')}`;
    drawGlow(ctx, header.x + 150, header.y + 78, 260, accent, 0.35);
    pixelText(ctx, levelText, header.x, header.y + 96, { size: 60, color: '#fff4c8', outline: accent });
    pixelText(ctx, String(record.levelName || '').toUpperCase(), header.x, header.y + 138, { size: 30, color: accent });
    drawBadge(ctx, diffLabel, header.x + header.w, header.y + 2, difficultyColor(diffId));
    pixelText(ctx, 'CLEARED', header.x + header.w, header.y + 92, { size: 22, color: '#9fb4c8', align: 'right' });
    pixelText(ctx, formatUtc(record.completedAt), header.x + header.w, header.y + 124, { size: 24, color: '#e8f6ff', align: 'right' });
    ctx.fillStyle = accent;
    for (let i = 0; i < header.w; i += 12) {
        ctx.globalAlpha = 0.35 + 0.65 * ((i / 12) % 2);
        ctx.fillRect(header.x + i, header.y + 158, 8, 4);
    }
    ctx.globalAlpha = 1;
}

function drawBurst(ctx, x, y, r, color, rng) {
    drawGlow(ctx, x, y, r * 3.2, color, 0.55);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const rays = 6 + Math.floor(rng() * 5);
    const turn = rng() * Math.PI;
    for (let i = 0; i < rays; i++) {
        const a = turn + (i / rays) * Math.PI * 2;
        const inner = r * 0.45;
        const outer = r * (1 + rng() * 0.6);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
        ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
        ctx.stroke();
    }
    ctx.restore();
    // Pixel debris.
    ctx.fillStyle = '#fff4c8';
    const bits = 3 + Math.floor(r / 6);
    for (let i = 0; i < bits; i++) {
        const a = rng() * Math.PI * 2;
        const d = r * (0.6 + rng() * 0.9);
        ctx.fillRect(Math.round(x + Math.cos(a) * d) - 1, Math.round(y + Math.sin(a) * d) - 1, 3, 3);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
}

function drawMap(ctx, record, rng, accent) {
    const { map } = cardLayout();
    const log = record.battleLog || {};
    const levelLength = levelLengthOf(record);
    const worldWidth = num(log.worldWidth, 800) || 800;
    const at = (p) => mapPoint(p, levelLength, map, worldWidth);

    ctx.fillStyle = 'rgba(3, 4, 18, 0.78)';
    ctx.fillRect(map.x, map.y, map.w, map.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(map.x, map.y, map.w, map.h);
    ctx.clip();
    drawCover(ctx, getImage('bg-galaxy'), map.x, map.y, map.w, map.h, 0.16);
    // Neon grid, brighter toward the gate.
    ctx.lineWidth = 1;
    for (let gy = 0; gy <= 22; gy++) {
        const y = map.y + map.h - (gy / 22) * map.h;
        ctx.strokeStyle = `rgba(127, 215, 255, ${0.05 + 0.12 * (gy / 22)})`;
        ctx.beginPath();
        ctx.moveTo(map.x, y);
        ctx.lineTo(map.x + map.w, y);
        ctx.stroke();
    }
    for (let gx = 0; gx <= 10; gx++) {
        const x = map.x + (gx / 10) * map.w;
        ctx.strokeStyle = 'rgba(127, 215, 255, 0.08)';
        ctx.beginPath();
        ctx.moveTo(x, map.y);
        ctx.lineTo(x, map.y + map.h);
        ctx.stroke();
    }
    // Jump gate at the top, launch pad at the bottom.
    const gate = getImage('gate');
    drawGlow(ctx, map.x + map.w / 2, map.y + 40, 200, accent, 0.6);
    if (gate) ctx.drawImage(gate, map.x + map.w / 2 - 70, map.y - 20, 140, 140);
    ctx.fillStyle = accent;
    for (let i = 0; i < 9; i++) ctx.fillRect(map.x + map.w / 2 - 90 + i * 22, map.y + map.h - 10, 12, 4);

    list(log.misses).forEach((m) => {
        const p = at(m);
        ctx.strokeStyle = 'rgba(159, 180, 200, 0.45)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    });

    list(log.kills).forEach((k) => {
        const p = at(k);
        const shooter = Boolean(num(k[3]));
        drawBurst(ctx, p.x, p.y, killRadius(k[2]) * 0.8, shooter ? '#ff8a2c' : '#7fd7ff', rng);
    });

    const path = list(log.path).map(at);
    if (path.length > 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        [[16, accent, 0.12], [8, accent, 0.3], [3, '#ffffff', 0.9]].forEach(([lw, color, alpha]) => {
            ctx.strokeStyle = color;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = lw;
            ctx.beginPath();
            path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.stroke();
        });
        ctx.restore();
        // Pixel waypoints every few samples.
        ctx.fillStyle = '#fff4c8';
        path.forEach((p, i) => {
            if (i % 12 === 0) ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4);
        });
    }

    list(log.pickups).forEach((pk) => {
        const p = at(pk);
        drawPickup(ctx, { type: String(pk[2] || 'power') }, p.x, p.y, 12, 0.6);
    });

    list(log.hitsTaken).forEach((h) => {
        const p = at(h);
        drawGlow(ctx, p.x, p.y, 46, '#ff2a4a', 0.7);
        ctx.strokeStyle = '#ff3c5a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(p.x - 10, p.y - 10);
        ctx.lineTo(p.x + 10, p.y + 10);
        ctx.moveTo(p.x + 10, p.y - 10);
        ctx.lineTo(p.x - 10, p.y + 10);
        ctx.stroke();
    });

    const ship = pixelSprite('ship-top', SHIP_TOP, SHIP_PALETTE, 4);
    const tip = path.length ? path[path.length - 1] : { x: map.x + map.w / 2, y: map.y + 150 };
    drawGlow(ctx, tip.x, tip.y + 30, 70, '#ff8a2c', 0.7);
    if (ship) ctx.drawImage(ship, Math.round(tip.x - ship.width / 2), Math.round(tip.y - ship.height / 2));

    if (path.length < 2 && list(log.kills).length === 0) {
        pixelText(ctx, 'FLIGHT LOG ARCHIVED', map.x + map.w / 2, map.y + map.h / 2, { size: 26, color: '#9fb4c8', align: 'center' });
    }
    ctx.restore();

    // Strip border + labels.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(map.x + 1.5, map.y + 1.5, map.w - 3, map.h - 3);
    pixelText(ctx, 'JUMP GATE', map.x + 10, map.y + 26, { size: 16, color: accent });
    pixelText(ctx, 'LAUNCH', map.x + 10, map.y + map.h - 18, { size: 16, color: accent });
    pixelText(ctx, `${Math.round(levelLength)} LY`, map.x + map.w - 10, map.y + map.h - 18, { size: 16, color: '#9fb4c8', align: 'right' });
}

function statRows(record) {
    const s = record.stats || {};
    const ship = record.ship || {};
    const weapon = ship.finalWeapon || {};
    return [
        ['ACCURACY', formatPercent(s.accuracy), '#7dff8c'],
        ['DESTROYED', `${num(s.asteroidsDestroyed)} / ${num(s.asteroidsSpawned, num(s.asteroidsDestroyed) + num(s.asteroidsMissed))}`, '#7fd7ff'],
        ['MISSED', String(num(s.asteroidsMissed)), '#9fb4c8'],
        ['SHOOTERS', String(num(s.shootersDestroyed)), '#ff8a2c'],
        ['SHOTS', String(num(s.shotsFired)), '#e8f6ff'],
        ['MAX COMBO', `x${num(s.maxCombo)}`, '#ff6cf5'],
        ['DAMAGE', String(num(s.damageTaken)), '#ff3c5a'],
        ['SHIELD BLOCKS', String(num(s.shieldBlocks)), '#5fd9ff'],
        ['TIME', formatDuration(record.durationSec), '#ffe65c'],
        ['WEAPON', `${String(weapon.type || 'blaster').toUpperCase()} T${num(weapon.tier, 1)}`, '#5fffd0']
    ];
}

function drawPanel(ctx, record, rng, accent) {
    const { panel } = cardLayout();
    const score = record.score || {};
    ctx.fillStyle = 'rgba(4, 6, 20, 0.72)';
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    ctx.fillStyle = accent;
    ctx.fillRect(panel.x, panel.y, panel.w, 4);
    ctx.fillRect(panel.x, panel.y + panel.h - 4, panel.w, 4);

    pixelText(ctx, 'SCORE', panel.x + 30, panel.y + 46, { size: 22, color: '#9fb4c8' });
    drawGlow(ctx, panel.x + panel.w / 2, panel.y + 92, 300, '#ffe65c', 0.25);
    pixelText(ctx, String(num(score.total)).padStart(7, '0'), panel.x + 30, panel.y + 110, { size: 58, color: '#ffe65c', outline: '#3a1600' });
    pixelText(ctx, `LEVEL +${num(score.level)}   BONUS +${num(score.bonus)}`, panel.x + 30, panel.y + 146, { size: 18, color: '#e8f6ff' });

    const rows = statRows(record);
    const top = panel.y + 196;
    const rowH = 46;
    rows.forEach(([label, value, color], i) => {
        const y = top + i * rowH;
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(127, 215, 255, 0.06)';
            ctx.fillRect(panel.x + 16, y - 30, panel.w - 32, rowH - 4);
        }
        ctx.fillStyle = color;
        ctx.fillRect(panel.x + 26, y - 18, 8, 8);
        pixelText(ctx, label, panel.x + 46, y, { size: 20, color: '#c8d8ea' });
        pixelText(ctx, value, panel.x + panel.w - 30, y, { size: 22, color, align: 'right' });
    });

    // Weapon mix bar.
    const mixY = top + rows.length * rowH + 4;
    const byWeapon = (record.stats && record.stats.shotsByWeapon) || {};
    const colors = { blaster: '#9ff3ff', spread: '#5fffd0', rapid: '#ffe65c', plasma: '#ff6cf5' };
    const total = Object.keys(colors).reduce((sum, k) => sum + Math.max(0, num(byWeapon[k])), 0);
    pixelText(ctx, 'WEAPON MIX', panel.x + 30, mixY, { size: 18, color: '#9fb4c8' });
    const barX = panel.x + 30;
    const barW = panel.w - 60;
    let cursor = 0;
    const cells = 24;
    const cellW = barW / cells;
    Object.keys(colors).forEach((k) => {
        const n = total ? Math.round((Math.max(0, num(byWeapon[k])) / total) * cells) : 0;
        for (let i = 0; i < n && cursor < cells; i++, cursor++) {
            ctx.fillStyle = colors[k];
            ctx.fillRect(Math.round(barX + cursor * cellW), mixY + 12, Math.ceil(cellW) - 3, 18);
        }
    });
    for (; cursor < cells; cursor++) {
        ctx.fillStyle = 'rgba(127, 215, 255, 0.12)';
        ctx.fillRect(Math.round(barX + cursor * cellW), mixY + 12, Math.ceil(cellW) - 3, 18);
    }

    // Collected pickups row.
    const collected = (record.stats && record.stats.pickupsCollected) || {};
    const rowY = mixY + 74;
    pixelText(ctx, 'PICKUPS', panel.x + 30, rowY, { size: 18, color: '#9fb4c8' });
    ['power', 'shield', 'spread', 'rapid', 'plasma'].forEach((type, i) => {
        const cx = panel.x + 190 + i * 58;
        drawPickup(ctx, { type }, cx, rowY - 6, 14, 0.6, num(collected[type]) > 0 ? 1 : 0.3);
        pixelText(ctx, String(num(collected[type])), cx, rowY + 30, { size: 16, color: '#e8f6ff', align: 'center' });
    });

    // Victory stamp seal: a Mandelblum rock in a rotated pixel ring.
    const sealX = panel.x + panel.w - 96;
    const sealY = panel.y + panel.h - 92;
    const rock = getImage(rockKeyFor(hashString(record.id || 'card')));
    drawGlow(ctx, sealX, sealY, 150, accent, 0.45);
    if (rock) ctx.drawImage(rock, sealX - 52, sealY - 52, 104, 104);
    ctx.save();
    ctx.translate(sealX, sealY);
    ctx.rotate(-0.18 + rng() * 0.1);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 66, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    pixelText(ctx, 'VICTORY', 0, -72, { size: 18, color: '#fff4c8', align: 'center' });
    pixelText(ctx, 'STAMP', 0, 86, { size: 18, color: '#fff4c8', align: 'center' });
    ctx.restore();

    const lives = record.ship || {};
    pixelText(ctx, `LIVES LEFT ${num(lives.livesRemaining)}`, panel.x + 30, panel.y + panel.h - 110, { size: 18, color: '#7dff8c' });
    pixelText(ctx, `POWER ${num(lives.finalPower)}%`, panel.x + 30, panel.y + panel.h - 80, { size: 18, color: '#7dff8c' });
    pixelText(ctx, `VIEW ${String(lives.view || 'overview').toUpperCase()}`, panel.x + 30, panel.y + panel.h - 50, { size: 18, color: '#7fd7ff' });
}

function drawFooter(ctx, record, accent) {
    const { footer } = cardLayout();
    const id = String(record.id || '');
    const shortId = id.length > 54 ? `${id.slice(0, 51)}...` : id;
    const tag = `#${hashString(id).toString(16).padStart(8, '0').toUpperCase()}`;
    pixelText(ctx, tag, footer.x + footer.w, footer.y + 4, { size: 18, color: accent, align: 'right' });
    pixelText(ctx, shortId, footer.x + footer.w, footer.y + 26, { size: 13, color: '#6f8098', align: 'right' });
}

function drawLegend(ctx) {
    const { map } = cardLayout();
    const y = map.y + map.h + 4;
    // Kept inside the frame between the map strip and the footer.
    const items = [['#7fd7ff', 'KILL'], ['#ff8a2c', 'SHOOTER'], ['#ff3c5a', 'HIT TAKEN'], ['#9fb4c8', 'MISSED']];
    items.forEach(([color, label], i) => {
        const x = map.x + i * 135;
        ctx.fillStyle = color;
        ctx.fillRect(x, y + 6, 10, 10);
        pixelText(ctx, label, x + 16, y + 17, { size: 14, color: '#c8d8ea' });
    });
}

// Renders the card for a LevelRecord. Always resolves to a canvas in browsers.
async function renderBattleCard(record, { width = 1200, height = 1200 } = {}) {
    if (!record || typeof record !== 'object') throw new TypeError('renderBattleCard requires a LevelRecord');
    await loadAssets();
    const canvas = makeCanvas(width, height);
    if (!canvas) throw new Error('renderBattleCard requires a DOM canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.scale(width / 1200, height / 1200);
    const rng = createSeededRng(hashString(record.id || `${record.level}-${record.completedAt}`));
    const accent = CARD_ACCENTS[(Math.max(1, Math.floor(num(record.level, 1))) - 1) % CARD_ACCENTS.length];
    drawBackdrop(ctx, record, rng, accent);
    drawFrame(ctx, accent);
    drawHeader(ctx, record, accent);
    drawMap(ctx, record, rng, accent);
    drawLegend(ctx);
    drawPanel(ctx, record, rng, accent);
    drawFooter(ctx, record, accent);
    return canvas;
}

function latestRecord(game) {
    if (!game) return null;
    try {
        const wins = typeof game.getWinRecords === 'function' ? game.getWinRecords() : [];
        if (Array.isArray(wins) && wins.length) {
            const withLog = wins.filter((w) => w && w.battleLog && list(w.battleLog.path).length > 1);
            return (withLog.length ? withLog : wins)[(withLog.length ? withLog : wins).length - 1];
        }
    } catch (error) {
        // Fall through to lastRecord / sample.
    }
    return game.lastRecord || null;
}

// Console/dev helper: opens the latest win's card (or a sample) in a new tab.
async function previewBattleCard(record) {
    const game = typeof window !== 'undefined' ? window.asteroidGame : null;
    const chosen = record || latestRecord(game) || sampleRecord();
    const canvas = await renderBattleCard(chosen);
    const url = canvas.toDataURL('image/png');
    const tab = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    if (tab && tab.document) {
        tab.document.title = `Battle card · Level ${chosen.level}`;
        tab.document.body.style.cssText = 'margin:0;background:#05030c;display:grid;place-items:center;min-height:100vh';
        const img = tab.document.createElement('img');
        img.src = url;
        img.alt = `AsteRoid battle card for level ${chosen.level}`;
        img.style.cssText = 'max-width:100vw;max-height:100vh;image-rendering:pixelated';
        tab.document.body.appendChild(img);
    }
    return canvas;
}

module.exports = { renderBattleCard, previewBattleCard, latestRecord };

},{"./assets":10,"./cardMath":13,"./font":15,"./hud":17,"./shapes":23}],13:[function(require,module,exports){
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
        game: 'AsteRoid: Galactic Gauntlet',
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

},{}],14:[function(require,module,exports){
// Normalises game events for presentation. Older game builds emitted pickups
// as `{ type: 'power' }` (the pickup kind overwrote the event name); newer
// builds emit `{ type: 'pickup', pickupType: 'power' }`.
const PICKUP_TYPES = ['spread', 'rapid', 'plasma', 'power', 'shield'];

function normalizeEvent(event) {
    if (!event || typeof event !== 'object') return { type: 'unknown' };
    if (PICKUP_TYPES.includes(event.type)) return { ...event, type: 'pickup', pickupType: event.type };
    if (event.type === 'pickup') {
        const kind = event.pickupType || event.pickup || event.kind;
        return { ...event, pickupType: PICKUP_TYPES.includes(kind) ? kind : 'power' };
    }
    return event;
}

module.exports = { PICKUP_TYPES, normalizeEvent };

},{}],15:[function(require,module,exports){
// Crisp "8-bit" text: glyphs are rasterised at a low resolution into a cached
// offscreen canvas and scaled up with smoothing disabled, giving chunky
// pixels without shipping a font file. Falls back to plain fillText in
// environments without an offscreen canvas.
const { makeCanvas } = require('./assets');

const FONT_STACK = 'Menlo, Monaco, Consolas, "DejaVu Sans Mono", "Courier New", monospace';
const PIXEL = 2;
const CACHE_LIMIT = 400;
const cache = new Map();

function fontFor(size, weight = 'bold') {
    return `${weight} ${size}px ${FONT_STACK}`;
}

let scratch = null;
function scratchContext() {
    if (scratch) return scratch;
    const canvas = makeCanvas(256, 64);
    if (!canvas) return null;
    scratch = canvas.getContext('2d', { willReadFrequently: true });
    return scratch;
}

function rasterize(value, size, color, outline, weight) {
    const key = `${value}|${size}|${color}|${outline}|${weight}`;
    const hit = cache.get(key);
    if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
    }
    const small = Math.max(5, Math.round(size / PIXEL));
    const sctx = scratchContext();
    if (!sctx) return null;
    sctx.font = fontFor(small, weight);
    const width = Math.ceil(sctx.measureText(value).width) + 4;
    const height = Math.ceil(small * 1.35) + 4;
    if (sctx.canvas.width < width || sctx.canvas.height < height) {
        sctx.canvas.width = Math.max(sctx.canvas.width, width);
        sctx.canvas.height = Math.max(sctx.canvas.height, height);
    }
    sctx.clearRect(0, 0, width, height);
    sctx.font = fontFor(small, weight);
    sctx.textBaseline = 'alphabetic';
    const baseline = Math.round(small * 1.02) + 2;
    if (outline) {
        sctx.fillStyle = outline;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) sctx.fillText(value, 2 + dx, baseline + dy);
    }
    sctx.fillStyle = color;
    sctx.fillText(value, 2, baseline);
    // Threshold alpha so glyph edges stay hard like a bitmap font. The scratch
    // canvas is CPU-backed (willReadFrequently) so this readback stays cheap.
    const data = sctx.getImageData(0, 0, width, height);
    const px = data.data;
    for (let i = 3; i < px.length; i += 4) px[i] = px[i] > 110 ? 255 : 0;
    const canvas = makeCanvas(width, height);
    canvas.getContext('2d').putImageData(data, 0, 0);
    const entry = { canvas, width, height, baseline };
    cache.set(key, entry);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return entry;
}

// Draws pixel text; returns the drawn width in canvas pixels.
function pixelText(ctx, value, x, y, { size = 14, color = '#e8f6ff', align = 'left', outline = '#05030c', weight = 'bold', alpha = 1, scale = 1 } = {}) {
    const str = String(value);
    if (!str) return 0;
    const entry = rasterize(str, size, color, outline, weight);
    if (!entry) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.font = fontFor(size * scale, weight);
        ctx.textAlign = align;
        ctx.fillStyle = color;
        ctx.fillText(str, x, y);
        ctx.restore();
        return ctx.measureText ? ctx.measureText(str).width : 0;
    }
    const k = PIXEL * scale;
    const w = entry.width * k;
    let left = x;
    if (align === 'center') left = x - w / 2;
    else if (align === 'right') left = x - w;
    const top = y - entry.baseline * k;
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * alpha;
    ctx.drawImage(entry.canvas, Math.round(left), Math.round(top), Math.round(w), Math.round(entry.height * k));
    ctx.globalAlpha = prevAlpha;
    ctx.imageSmoothingEnabled = smoothing;
    return w;
}

function measurePixelText(value, { size = 14, weight = 'bold', scale = 1 } = {}) {
    const entry = rasterize(String(value), size, '#fff', null, weight);
    if (!entry) return String(value).length * size * 0.6 * scale;
    return entry.width * PIXEL * scale;
}

module.exports = { FONT_STACK, fontFor, pixelText, measurePixelText };

},{"./assets":10}],16:[function(require,module,exports){
// Client-side juice: explosions, debris, shockwaves, thruster trails, shield
// ripples, floating text, fireworks, screen shake, hit-stop and slow-mo.
// Driven purely by drained game events so game.js stays deterministic.
const { drawGlow } = require('./shapes');
const { pixelText } = require('./font');
const { VIEW } = require('./projection');
const { normalizeEvent } = require('./events');

const MAX_WORLD_PARTICLES = 650;
const MAX_SCREEN_PARTICLES = 700;
const ROCK_COLORS = ['#7fffe0', '#ff8ae6', '#b9a8ff', '#ffffff', '#9ff3ff', '#ffe18a'];
const SHOOTER_COLORS = ['#ff5a1c', '#ff8a5c', '#ffd25c', '#ffffff', '#ff3a1c'];
const FIREWORK_COLORS = ['#ff3c8a', '#7fd7ff', '#7dff8c', '#ffe65c', '#ff6cf5', '#ffffff', '#ffb347'];
const PICKUP_COLORS = { spread: '#5fffd0', rapid: '#ffe65c', plasma: '#ff6cf5', power: '#7dff8c', shield: '#6fa8ff' };

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function pickupLabel(kind, weapon) {
    if (kind === 'power') return '+POWER';
    if (kind === 'shield') return 'SHIELD UP';
    const tier = weapon && weapon.type === kind && weapon.tier ? ` LV${weapon.tier}` : '';
    return `${String(kind || 'BONUS').toUpperCase()}${tier}`;
}

function createFx() {
    const world = [];
    const screen = [];
    const ripples = [];
    const state = {
        shake: 0,
        hitStop: 0,
        slowMo: 0,
        flash: 0,
        flashColor: '#ffffff',
        celebrateTime: -1,
        celebrateKind: null,
        fireworkTimer: 0,
        thrustTimer: 0,
        time: 0,
        latestRecord: null,
        kills: 0
    };

    function addWorld(p) {
        if (world.length >= MAX_WORLD_PARTICLES) world.splice(0, world.length - MAX_WORLD_PARTICLES + 1);
        world.push(p);
    }

    function addScreen(p) {
        if (screen.length >= MAX_SCREEN_PARTICLES) screen.splice(0, screen.length - MAX_SCREEN_PARTICLES + 1);
        screen.push(p);
    }

    function explosion(x, y, size, shooter, drift = 0) {
        const colors = shooter ? SHOOTER_COLORS : ROCK_COLORS;
        const count = Math.min(48, 10 + Math.round(size * 0.9));
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const speed = rand(40, 120 + size * 5);
            const life = rand(0.35, 0.9);
            addWorld({ kind: 'debris', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed + drift, life, maxLife: life, size: Math.random() < 0.3 ? 4 : 2.5, color: pick(colors), drag: 2.2 });
        }
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            const speed = rand(180, 320);
            addWorld({ kind: 'spark', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed + drift, life: 0.25, maxLife: 0.25, color: '#ffffff', drag: 3 });
        }
        addWorld({ kind: 'ring', x, y, vx: 0, vy: drift, life: 0.45, maxLife: 0.45, radius: size * 0.5, grow: size * 4.5, color: shooter ? '#ff8a5c' : '#bfe9ff' });
        addWorld({ kind: 'flash', x, y, vx: 0, vy: drift, life: 0.22, maxLife: 0.22, radius: size * 2.4, color: shooter ? '#ff6a2c' : '#e6f4ff' });
    }

    function floatText(x, y, text, color, life = 0.9, size = 14) {
        addWorld({ kind: 'text', x, y, vx: 0, vy: 40, life, maxLife: life, text, color, size });
    }

    function firework(x, y, color, count = 46) {
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + rand(-0.05, 0.05);
            const speed = rand(80, 240);
            const life = rand(0.9, 1.5);
            addScreen({ kind: 'spark', x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, maxLife: life, color: Math.random() < 0.2 ? '#ffffff' : color, size: Math.random() < 0.3 ? 4 : 3, gravity: 120 });
        }
        addScreen({ kind: 'flash', x, y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, radius: 90, color });
    }

    function launchRocket() {
        const x = rand(90, VIEW.width - 90);
        addScreen({ kind: 'rocket', x, y: VIEW.height + 10, vx: rand(-30, 30), vy: -rand(380, 520), life: rand(0.75, 1.05), maxLife: 1, color: pick(FIREWORK_COLORS), size: 3, gravity: 120 });
    }

    function handle(events, game) {
        const ship = game.ship || { x: 400, y: 0 };
        const drift = game.level && game.level.scrollSpeed ? game.level.scrollSpeed * 0.6 : 0;
        for (const raw of events) {
            const e = normalizeEvent(raw);
            switch (e.type) {
                case 'explode': {
                    const size = Number(e.size) || 20;
                    explosion(e.x, e.y, size, Boolean(e.shooter), drift);
                    state.shake = Math.min(14, state.shake + size / 7);
                    if (size > 28) state.hitStop = Math.max(state.hitStop, 0.035);
                    state.kills += 1;
                    break;
                }
                case 'hit':
                    for (let i = 0; i < 6; i++) {
                        const a = rand(-Math.PI, 0) - Math.PI / 2;
                        addWorld({ kind: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * 160, vy: -Math.sin(a) * 160 + drift, life: 0.18, maxLife: 0.18, color: '#ffffff', drag: 3 });
                    }
                    state.shake = Math.min(14, state.shake + 1);
                    break;
                case 'shipHit':
                    state.shake = Math.min(18, state.shake + 9);
                    state.hitStop = Math.max(state.hitStop, 0.06);
                    state.flash = 0.35;
                    state.flashColor = '#ff2a2a';
                    for (let i = 0; i < 14; i++) {
                        const a = Math.random() * Math.PI * 2;
                        addWorld({ kind: 'debris', x: ship.x, y: ship.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 + drift, life: 0.5, maxLife: 0.5, size: 3, color: pick(['#ff5a3c', '#ffd25c', '#7fd7ff']), drag: 3 });
                    }
                    break;
                case 'shieldHit': {
                    const angle = Math.atan2(-((e.y || ship.y) - ship.y), (e.x || ship.x) - ship.x);
                    ripples.push({ angle, age: 0, life: 0.5 });
                    if (ripples.length > 8) ripples.shift();
                    state.shake = Math.min(14, state.shake + 3);
                    break;
                }
                case 'shipDestroyed':
                    explosion(e.x, e.y, 60, false, drift);
                    explosion(e.x, e.y, 34, true, drift);
                    state.shake = 22;
                    state.hitStop = 0.12;
                    state.flash = 0.6;
                    state.flashColor = '#ffffff';
                    break;
                case 'pickup': {
                    const kind = e.pickupType;
                    const color = PICKUP_COLORS[kind] || '#7dff8c';
                    const px = e.x !== undefined ? e.x : ship.x;
                    const py = e.y !== undefined ? e.y : ship.y;
                    addWorld({ kind: 'ring', x: px, y: py, vx: 0, vy: drift, life: 0.5, maxLife: 0.5, radius: 10, grow: 90, color });
                    addWorld({ kind: 'flash', x: px, y: py, vx: 0, vy: drift, life: 0.3, maxLife: 0.3, radius: 60, color });
                    floatText(ship.x, ship.y + 34, pickupLabel(kind, e.weapon), color, 1.2, 16);
                    if (kind === 'power') {
                        state.flash = 0.25;
                        state.flashColor = '#7dff8c';
                        for (let i = 0; i < 18; i++) {
                            const a = (i / 18) * Math.PI * 2;
                            addWorld({ kind: 'debris', x: ship.x, y: ship.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 + drift, life: 0.6, maxLife: 0.6, size: 3, color: i % 2 ? '#7dff8c' : '#ff6cf5', drag: 2 });
                        }
                    }
                    break;
                }
                case 'asteroidMissed':
                    if (e.x !== undefined) floatText(e.x, e.y + 20, 'MISS', '#8a93a6', 0.8, 11);
                    break;
                case 'shot':
                    addWorld({ kind: 'flash', x: ship.x, y: ship.y + 16, vx: 0, vy: drift, life: 0.06, maxLife: 0.06, radius: 16, color: '#bff6ff' });
                    break;
                case 'levelComplete':
                    state.hitStop = Math.max(state.hitStop, 0.15);
                    state.slowMo = 0.8;
                    state.flash = 0.5;
                    state.flashColor = '#ffffff';
                    state.celebrateTime = 0;
                    state.celebrateKind = 'level';
                    state.fireworkTimer = 0.2;
                    break;
                case 'victory':
                    state.hitStop = Math.max(state.hitStop, 0.2);
                    state.slowMo = 1.2;
                    state.flash = 0.8;
                    state.flashColor = '#ffffff';
                    state.celebrateTime = 0;
                    state.celebrateKind = 'victory';
                    state.fireworkTimer = 0.1;
                    break;
                case 'levelRecord':
                    if (e.record) state.latestRecord = e.record;
                    break;
                case 'levelStart':
                case 'respawn':
                    if (e.type === 'levelStart') {
                        state.celebrateTime = -1;
                        state.celebrateKind = null;
                        screen.length = 0;
                    }
                    break;
                default:
                    break;
            }
        }
    }

    function update(realDt, game) {
        const dt = realDt;
        state.time += dt;
        state.hitStop = Math.max(0, state.hitStop - dt);
        state.slowMo = Math.max(0, state.slowMo - dt);
        state.flash = Math.max(0, state.flash - dt * 1.6);
        state.shake = Math.max(0, state.shake - dt * 30);
        const fxDt = dt * (state.hitStop > 0 ? 0.1 : state.slowMo > 0 ? 0.35 : 1);
        for (const p of world) {
            p.life -= fxDt;
            if (p.drag) {
                const k = Math.max(0, 1 - p.drag * fxDt);
                p.vx *= k;
                p.vy *= k;
            }
            p.x += p.vx * fxDt;
            p.y += p.vy * fxDt;
        }
        for (let i = world.length - 1; i >= 0; i--) if (world[i].life <= 0) world.splice(i, 1);
        for (const r of ripples) r.age += dt;
        while (ripples.length && ripples[0].age > ripples[0].life) ripples.shift();

        for (const p of screen) {
            p.life -= dt;
            if (p.gravity) p.vy += p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.kind === 'rocket' && p.life <= 0) firework(p.x, p.y, p.color, game && game.state === 'victory' ? 60 : 44);
        }
        for (let i = screen.length - 1; i >= 0; i--) if (screen[i].life <= 0) screen.splice(i, 1);

        if (state.celebrateTime >= 0) state.celebrateTime += dt;
        const celebrating = game && (game.state === 'levelComplete' || game.state === 'victory');
        if (celebrating && state.celebrateTime >= 0) {
            state.fireworkTimer -= dt;
            if (state.fireworkTimer <= 0) {
                launchRocket();
                state.fireworkTimer = game.state === 'victory' ? rand(0.18, 0.4) : rand(0.3, 0.6);
            }
        }

        // Engine exhaust trail (world space so it streams away as we fly).
        if (game && game.state === 'playing' && game.ship) {
            state.thrustTimer -= dt;
            if (state.thrustTimer <= 0) {
                state.thrustTimer = 0.02;
                const ship = game.ship;
                for (const side of [-4.5, 4.5]) {
                    addWorld({ kind: 'thrust', x: ship.x + side + rand(-1, 1), y: ship.y - 16, vx: rand(-12, 12) - (ship.bank || 0) * 20, vy: -rand(60, 110), life: 0.32, maxLife: 0.32, size: 3, color: '#ffb347', drag: 1 });
                }
            }
        }
    }

    // Draws world-space effects through a projection: project(point) -> {x, y, scale} | null.
    function drawWorld(ctx, project, { maxScale = 4 } = {}) {
        for (const p of world) {
            const s = project(p);
            if (!s) continue;
            const scale = Math.min(maxScale, s.scale === undefined ? 1 : s.scale);
            const t = Math.max(0, p.life / p.maxLife);
            const fade = s.alpha === undefined ? 1 : s.alpha;
            if (s.x < -80 || s.x > VIEW.width + 80 || s.y < -80 || s.y > VIEW.height + 80) continue;
            switch (p.kind) {
                case 'debris':
                case 'thrust': {
                    const size = Math.max(1, Math.round(p.size * scale * (p.kind === 'thrust' ? 0.5 + t * 0.7 : 1)));
                    ctx.globalAlpha = t * fade;
                    ctx.fillStyle = p.kind === 'thrust' ? (t > 0.6 ? '#fff4c8' : t > 0.3 ? '#ffb347' : '#ff3c8a') : p.color;
                    ctx.fillRect(Math.round(s.x - size / 2), Math.round(s.y - size / 2), size, size);
                    break;
                }
                case 'spark':
                    ctx.globalAlpha = t * fade;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = Math.max(1, 1.5 * scale);
                    ctx.beginPath();
                    ctx.moveTo(s.x, s.y);
                    ctx.lineTo(s.x - p.vx * 0.03 * scale, s.y + p.vy * 0.03 * scale);
                    ctx.stroke();
                    break;
                case 'ring': {
                    const radius = (p.radius + (1 - t) * p.grow) * scale;
                    ctx.globalAlpha = t * fade;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = Math.max(1, 4 * t * scale);
                    ctx.setLineDash([Math.max(2, 6 * scale), Math.max(2, 4 * scale)]);
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, Math.max(0.5, radius), 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    break;
                }
                case 'flash':
                    ctx.globalAlpha = 1;
                    drawGlow(ctx, s.x, s.y, p.radius * scale * (0.6 + 0.4 * t), p.color, t * fade);
                    break;
                case 'text':
                    ctx.globalAlpha = 1;
                    pixelText(ctx, p.text, s.x, s.y, { size: p.size, color: p.color, align: 'center', alpha: Math.min(1, t * 2) * fade });
                    break;
                default:
                    break;
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawScreen(ctx) {
        for (const p of screen) {
            const t = Math.max(0, p.life / p.maxLife);
            if (p.kind === 'flash') {
                drawGlow(ctx, p.x, p.y, p.radius * (1.4 - t * 0.4), p.color, t);
                continue;
            }
            ctx.globalAlpha = p.kind === 'rocket' ? 1 : Math.min(1, t * 1.5);
            ctx.fillStyle = p.kind === 'rocket' ? '#ffffff' : p.color;
            const size = p.size || 3;
            ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
            if (p.kind === 'rocket') {
                ctx.fillStyle = p.color;
                ctx.fillRect(Math.round(p.x - 1), Math.round(p.y + 3), 2, 8);
            }
        }
        ctx.globalAlpha = 1;
        if (state.flash > 0) {
            ctx.globalAlpha = Math.min(0.55, state.flash);
            ctx.fillStyle = state.flashColor;
            ctx.fillRect(0, 0, VIEW.width, VIEW.height);
            ctx.globalAlpha = 1;
        }
    }

    function shakeOffset() {
        if (state.shake <= 0.05) return { x: 0, y: 0 };
        const m = state.shake;
        return { x: Math.round(rand(-m, m)), y: Math.round(rand(-m, m)) };
    }

    function timeScale() {
        if (state.hitStop > 0) return 0;
        if (state.slowMo > 0) return 0.3;
        return 1;
    }

    return {
        state,
        ripples,
        handle,
        update,
        drawWorld,
        drawScreen,
        shakeOffset,
        timeScale,
        firework,
        get worldCount() {
            return world.length;
        },
        get screenCount() {
            return screen.length;
        }
    };
}

module.exports = { createFx, MAX_WORLD_PARTICLES, MAX_SCREEN_PARTICLES };

},{"./events":14,"./font":15,"./projection":21,"./shapes":23}],17:[function(require,module,exports){
const { VIEW } = require('./projection');
const { WEAPONS, MAX_TIER } = require('../weapons');
const { LEVEL_COUNT } = require('../levels');
const { PICKUP_STYLE, SHIP_TOP, SHIP_PALETTE, pixelSprite, drawBreathe, drawGlow } = require('./shapes');
const { pixelText } = require('./font');

const DIFFICULTY_COLORS = { cadet: '#7dff8c', pilot: '#ffd25c', ace: '#ff3c5a' };
const POWER_SEGMENTS = 16;

function difficultyColor(id) {
    return DIFFICULTY_COLORS[id] || '#9fb4c8';
}

function difficultyName(game, selected = false) {
    const id = selected ? game.selectedDifficulty : game.difficulty;
    const label = selected ? game.selectedDifficultyLabel : game.difficultyLabel;
    if (label) return String(label);
    if (id) return String(id).charAt(0).toUpperCase() + String(id).slice(1);
    return '';
}

function powerColor(fraction) {
    if (fraction > 0.6) return '#7dff8c';
    if (fraction > 0.3) return '#ffd25c';
    return '#ff5a3c';
}

// Number of lit segments for a power fraction (0..1), never 0 while alive.
function litSegments(fraction, segments = POWER_SEGMENTS) {
    const f = Math.max(0, Math.min(1, Number(fraction) || 0));
    if (f <= 0) return 0;
    return Math.max(1, Math.round(f * segments));
}

// Eased approach used for the score roll-up counter.
function rollUp(displayed, target, dt) {
    if (!(displayed < target) && !(displayed > target)) return target;
    const diff = target - displayed;
    const step = Math.max(1, Math.abs(diff) * Math.min(1, dt * 8));
    const next = displayed + Math.sign(diff) * step;
    return diff > 0 ? Math.min(target, next) : Math.max(target, next);
}

function panelBox(ctx, x, y, w, h, color = 'rgba(127, 215, 255, 0.55)') {
    ctx.fillStyle = 'rgba(4, 6, 20, 0.72)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    // 8-bit corner brackets.
    const c = 6;
    ctx.fillRect(x, y, c, 2);
    ctx.fillRect(x, y, 2, c);
    ctx.fillRect(x + w - c, y, c, 2);
    ctx.fillRect(x + w - 2, y, 2, c);
    ctx.fillRect(x, y + h - 2, c, 2);
    ctx.fillRect(x, y + h - c, 2, c);
    ctx.fillRect(x + w - c, y + h - 2, c, 2);
    ctx.fillRect(x + w - 2, y + h - c, 2, c);
}

function createHud() {
    const view = { score: 0, lastTime: null, combo: 0, comboPop: 0, power: 1, lastLevelKey: '' };

    function drawPower(ctx, game) {
        const ship = game.ship;
        const time = game.time || 0;
        const x = 14;
        const y = VIEW.height - 64;
        panelBox(ctx, x, y, 286, 52);
        const fraction = ship.power / ship.maxPower;
        view.power += (fraction - view.power) * 0.15;
        drawBreathe(ctx, x + 24, y + 26, 13, time, 1);
        pixelText(ctx, 'POWER', x + 46, y + 16, { size: 12, color: '#9fb4c8' });
        pixelText(ctx, `${Math.round(ship.power)}`, x + 272, y + 16, { size: 12, color: powerColor(fraction), align: 'right' });
        const lit = litSegments(fraction);
        const ghost = litSegments(view.power);
        const low = fraction <= 0.3 && Math.floor(time * 5) % 2 === 0;
        const color = low ? '#ffffff' : powerColor(fraction);
        const segW = 12;
        for (let i = 0; i < POWER_SEGMENTS; i++) {
            const sx = x + 46 + i * (segW + 2);
            const sy = y + 24;
            if (i < lit) {
                ctx.fillStyle = color;
                ctx.fillRect(sx, sy, segW, 16);
                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                ctx.fillRect(sx, sy, segW, 3);
            } else if (i < ghost) {
                ctx.fillStyle = 'rgba(255, 90, 60, 0.6)';
                ctx.fillRect(sx, sy, segW, 16);
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fillRect(sx, sy, segW, 16);
            }
        }
        drawGlow(ctx, x + 46 + lit * 14 - 6, y + 32, 26, color, 0.35);
        if (ship.shield > 0) {
            const sx = x + 46;
            const sw = 222 * Math.min(1, ship.shield / 7);
            ctx.fillStyle = PICKUP_STYLE.shield.color;
            ctx.fillRect(sx, y + 44, sw, 3);
            pixelText(ctx, `SHIELD ${ship.shield.toFixed(1)}`, x + 290, y + 48, { size: 11, color: PICKUP_STYLE.shield.color });
        }
    }

    function drawWeapon(ctx, game) {
        const ship = game.ship;
        const spec = WEAPONS[ship.weapon.type] || WEAPONS.blaster;
        const x = 14;
        const y = VIEW.height - 92;
        panelBox(ctx, x, y, 286, 24, spec.color);
        pixelText(ctx, spec.name.toUpperCase(), x + 10, y + 17, { size: 12, color: spec.color });
        for (let i = 0; i < MAX_TIER; i++) {
            const px = x + 200 + i * 26;
            ctx.fillStyle = i < ship.weapon.tier ? spec.color : 'rgba(255,255,255,0.12)';
            ctx.fillRect(px, y + 7, 20, 10);
            if (i < ship.weapon.tier) drawGlow(ctx, px + 10, y + 12, 14, spec.color, 0.3);
        }
    }

    function drawLives(ctx, game) {
        const sprite = pixelSprite('lives', SHIP_TOP, SHIP_PALETTE, 2);
        const lives = Math.max(0, game.ship.lives);
        for (let i = 0; i < lives; i++) {
            const x = VIEW.width - 36 - i * 30;
            if (sprite) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(sprite, x, 8);
            }
        }
    }

    function drawProgress(ctx, game) {
        const width = 300;
        const x = (VIEW.width - width) / 2;
        const diff = game.difficulty;
        const label = `LV ${game.level.number}/${LEVEL_COUNT}  ${game.level.name.toUpperCase()}`;
        pixelText(ctx, label, VIEW.width / 2, 20, { size: 13, align: 'center' });
        const segments = 30;
        const lit = Math.floor(game.levelProgress * segments);
        for (let i = 0; i < segments; i++) {
            ctx.fillStyle = i < lit ? (i === lit - 1 ? '#ffffff' : '#7dff8c') : 'rgba(255,255,255,0.1)';
            ctx.fillRect(x + i * (width / segments), 28, width / segments - 2, 6);
        }
        ctx.fillStyle = '#7fd7ff';
        const mx = x + game.levelProgress * width;
        ctx.fillRect(mx - 2, 25, 4, 12);
        if (diff) {
            const name = difficultyName(game).toUpperCase();
            const color = difficultyColor(diff);
            pixelText(ctx, name, VIEW.width / 2, 52, { size: 11, align: 'center', color });
        }
    }

    function drawScore(ctx, game, dt) {
        view.score = rollUp(view.score, game.score, dt);
        pixelText(ctx, 'SCORE', 16, 16, { size: 10, color: '#9fb4c8' });
        const rolling = Math.round(view.score) !== game.score;
        pixelText(ctx, String(Math.round(view.score)).padStart(7, '0'), 16, 38, { size: 20, color: rolling ? '#ffe65c' : '#e8f6ff' });
        const progress = game.progress || { highScore: 0 };
        pixelText(ctx, `HI ${String(Math.max(progress.highScore || 0, game.score)).padStart(7, '0')}`, 16, 54, { size: 10, color: '#9fb4c8' });
    }

    function drawCombo(ctx, game, dt) {
        const combo = Number(game.combo) || 0;
        if (combo > view.combo) view.comboPop = 1;
        view.combo = combo;
        view.comboPop = Math.max(0, view.comboPop - dt * 3);
        if (combo < 2) return;
        const x = VIEW.width - 20;
        const y = VIEW.height - 70;
        const scale = 1 + view.comboPop * 0.5;
        const hue = (game.time * 240) % 360;
        drawGlow(ctx, x - 50, y - 8, 60 * scale, `hsl(${hue}, 100%, 60%)`, 0.25);
        pixelText(ctx, `x${combo}`, x, y, { size: Math.round(26 * scale), color: `hsl(${hue}, 100%, 70%)`, align: 'right' });
        pixelText(ctx, 'COMBO', x, y + 16, { size: 11, color: '#ffffff', align: 'right' });
        const timer = Number(game.comboTimer);
        if (Number.isFinite(timer) && timer > 0) {
            ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
            ctx.fillRect(x - 80 * Math.min(1, timer / 2), y + 22, 80 * Math.min(1, timer / 2), 3);
        }
    }

    function drawRadar(ctx, game) {
        const width = 120;
        const height = 150;
        const x = VIEW.width - width - 12;
        const y = 46;
        const rangeAhead = 900;
        const rangeBehind = 100;
        const scaleX = width / 800;
        const scaleY = height / (rangeAhead + rangeBehind);
        const toRadar = (obj) => ({
            x: x + obj.x * scaleX,
            y: y + height - (obj.y - (game.ship.y - rangeBehind)) * scaleY
        });
        const inside = (p) => p.y >= y && p.y <= y + height;

        ctx.save();
        panelBox(ctx, x, y, width, height);
        ctx.strokeStyle = 'rgba(127, 215, 255, 0.12)';
        for (let gy = y + 15; gy < y + height; gy += 15) {
            ctx.beginPath();
            ctx.moveTo(x, gy + 0.5);
            ctx.lineTo(x + width, gy + 0.5);
            ctx.stroke();
        }
        const sweep = y + height - (((game.time || 0) * 90) % height);
        ctx.fillStyle = 'rgba(125, 255, 140, 0.18)';
        ctx.fillRect(x, sweep, width, 3);
        for (const asteroid of game.asteroids) {
            const p = toRadar(asteroid);
            if (!inside(p)) continue;
            ctx.fillStyle = asteroid.shooter ? '#ff8a5c' : '#bdb8ad';
            const s = Math.max(2, Math.round(asteroid.size * scaleX * 1.6));
            ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
        }
        for (const pickup of game.pickups) {
            const p = toRadar(pickup);
            if (!inside(p)) continue;
            ctx.fillStyle = (PICKUP_STYLE[pickup.type] || PICKUP_STYLE.power).color;
            ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        }
        ctx.fillStyle = '#ff5a3c';
        for (const bullet of game.enemyBullets) {
            const p = toRadar(bullet);
            if (inside(p)) ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
        }
        const shipPoint = toRadar(game.ship);
        ctx.fillStyle = '#7fd7ff';
        ctx.beginPath();
        ctx.moveTo(shipPoint.x, shipPoint.y - 5);
        ctx.lineTo(shipPoint.x + 4, shipPoint.y + 3);
        ctx.lineTo(shipPoint.x - 4, shipPoint.y + 3);
        ctx.fill();
        pixelText(ctx, 'RADAR', x + 6, y + 14, { size: 10, color: '#7dff8c' });
        ctx.restore();
    }

    function drawHud(ctx, game, fx, opts = {}) {
        const now = game.time || 0;
        const dt = view.lastTime === null ? 0 : Math.max(0, Math.min(0.1, now - view.lastTime));
        view.lastTime = now;
        if (game.state === 'title') {
            view.score = 0;
            return;
        }
        drawScore(ctx, game, dt);
        drawProgress(ctx, game);
        drawLives(ctx, game);
        drawWeapon(ctx, game);
        drawPower(ctx, game);
        drawCombo(ctx, game, dt);
        const viewLabel = game.view === 'pov' ? 'POV' : 'MAP';
        const flags = `${opts.muted ? 'M:OFF ' : ''}${opts.crt ? 'CRT ' : ''}[V] ${viewLabel}`;
        pixelText(ctx, flags, VIEW.width - 16, VIEW.height - 14, { size: 11, color: '#9fb4c8', align: 'right' });
        if (game.view === 'pov') drawRadar(ctx, game);
    }

    return { drawHud, view };
}

module.exports = { createHud, rollUp, litSegments, difficultyColor, difficultyName, panelBox, POWER_SEGMENTS, DIFFICULTY_COLORS };

},{"../levels":9,"../weapons":28,"./font":15,"./projection":21,"./shapes":23}],18:[function(require,module,exports){
const { VIEW, projectOverview } = require('./projection');
const { drawAsteroid, drawPickup, drawShipTop, drawPlayerBullet, drawEnemyBullet, drawGlow } = require('./shapes');
const { createOverviewBackground } = require('./background');
const { getImage } = require('./assets');
const { pixelText } = require('./font');

function drawJumpGate(ctx, y, time) {
    const gate = getImage('gate');
    if (gate) {
        const size = 220 + 10 * Math.sin(time * 2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.85;
        ctx.drawImage(gate, VIEW.width / 2 - size / 2, y - size / 2, size, size);
        ctx.restore();
    }
    drawGlow(ctx, VIEW.width / 2, y, 140, '#7dff8c', 0.25 + 0.1 * Math.sin(time * 4));
    ctx.save();
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -time * 40;
    ctx.strokeStyle = '#7dff8c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW.width, y);
    ctx.stroke();
    ctx.restore();
    pixelText(ctx, '>> JUMP GATE <<', 12, y - 10, { size: 14, color: '#7dff8c' });
}

function createOverviewRenderer() {
    const background = createOverviewBackground();

    return function renderOverview(ctx, game, fx) {
        const { scrollY } = game;
        const time = game.time || 0;
        background(ctx, game);

        const exit = projectOverview({ x: 0, y: game.level.length }, scrollY);
        if (exit.y > -160 && exit.y < VIEW.height + 160) drawJumpGate(ctx, exit.y, time);

        const onScreen = (p, margin) => p.y > -margin && p.y < VIEW.height + margin;

        for (const pickup of game.pickups) {
            const p = projectOverview(pickup, scrollY);
            if (onScreen(p, 40)) drawPickup(ctx, pickup, p.x, p.y, pickup.size, time);
        }

        for (const asteroid of game.asteroids) {
            const p = projectOverview(asteroid, scrollY);
            if (onScreen(p, 80)) drawAsteroid(ctx, asteroid, p.x, p.y, asteroid.size, 1, time);
        }

        for (const bullet of game.playerBullets) {
            const p = projectOverview(bullet, scrollY);
            if (onScreen(p, 30)) drawPlayerBullet(ctx, bullet, p.x, p.y, bullet.vx, -bullet.vy, 1, 1, time);
        }

        for (const bullet of game.enemyBullets) {
            const p = projectOverview(bullet, scrollY);
            if (onScreen(p, 30)) drawEnemyBullet(ctx, bullet, p.x, p.y, 1, 1, time);
        }

        for (const particle of game.particles) {
            const p = projectOverview(particle, scrollY);
            ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife) * 0.8;
            ctx.fillStyle = particle.color;
            ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2);
        }
        ctx.globalAlpha = 1;

        if (fx) fx.drawWorld(ctx, (pt) => projectOverview(pt, scrollY));

        if (game.state === 'playing' || game.state === 'paused' || game.state === 'levelComplete') {
            const p = projectOverview(game.ship, scrollY);
            drawShipTop(ctx, game.ship, p.x, p.y, time, fx ? fx.ripples : []);
        }
    };
}

module.exports = { createOverviewRenderer };

},{"./assets":10,"./background":11,"./font":15,"./projection":21,"./shapes":23}],19:[function(require,module,exports){
// Optional CRT post layer: scanlines + vignette, pre-rendered once.
const { VIEW } = require('./projection');
const { makeCanvas } = require('./assets');

let overlay;
function crtOverlay() {
    if (overlay !== undefined) return overlay;
    overlay = makeCanvas(VIEW.width, VIEW.height);
    if (!overlay) return overlay;
    const c = overlay.getContext('2d');
    c.fillStyle = 'rgba(0, 0, 0, 0.16)';
    for (let y = 0; y < VIEW.height; y += 3) c.fillRect(0, y, VIEW.width, 1);
    const g = c.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.35, VIEW.width / 2, VIEW.height / 2, VIEW.width * 0.65);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = g;
    c.fillRect(0, 0, VIEW.width, VIEW.height);
    return overlay;
}

function drawCrt(ctx, time = 0) {
    const img = crtOverlay();
    if (!img) return;
    ctx.drawImage(img, 0, 0);
    // Faint rolling refresh bar.
    const y = ((time * 60) % (VIEW.height + 120)) - 60;
    ctx.fillStyle = 'rgba(160, 220, 255, 0.025)';
    ctx.fillRect(0, y, VIEW.width, 50);
}

module.exports = { drawCrt };

},{"./assets":10,"./projection":21}],20:[function(require,module,exports){
const { VIEW, POV, povCamera, projectPov, povFade } = require('./projection');
const { drawAsteroid, drawPickup, drawShipChase, drawPlayerBullet, drawEnemyBullet, drawGlow } = require('./shapes');
const { levelTint, createStarfield, drawNebula } = require('./background');
const { getImage } = require('./assets');

const FLOOR_HEIGHT = -40;
const GRID_STEP = 100;

function createPovRenderer() {
    const stars = createStarfield(170, VIEW.width * 2, POV.horizon, 23);

    function drawBackdrop(ctx, game, camera) {
        const time = game.time || 0;
        const [top, bottom] = levelTint(game.level.number);
        const sky = ctx.createLinearGradient(0, 0, 0, POV.horizon);
        sky.addColorStop(0, top);
        sky.addColorStop(1, bottom);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, VIEW.width, POV.horizon);
        const floor = ctx.createLinearGradient(0, POV.horizon, 0, VIEW.height);
        floor.addColorStop(0, bottom);
        floor.addColorStop(0.25, '#05030c');
        floor.addColorStop(1, '#020106');
        ctx.fillStyle = floor;
        ctx.fillRect(0, POV.horizon, VIEW.width, VIEW.height - POV.horizon);

        const shift = camera.x * 0.15;
        for (const star of stars) {
            const x = (((star.x - shift) % (VIEW.width * 2)) + VIEW.width * 2) % (VIEW.width * 2) - VIEW.width / 2;
            ctx.globalAlpha = 0.35 + 0.55 * star.depth * (0.6 + 0.4 * Math.sin(time * 3 + star.twinkle));
            ctx.fillStyle = star.color;
            const s = star.depth > 0.8 ? 2 : 1;
            ctx.fillRect(Math.round(x), Math.round(star.y), s, s);
        }
        ctx.globalAlpha = 1;

        // Mandelblum moon rising over the horizon, parallaxing with steering.
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, VIEW.width, POV.horizon);
        ctx.clip();
        drawNebula(ctx, game.level.number, VIEW.width / 2 - (camera.x - 400) * 0.35, POV.horizon - 40, 760, 0.6);
        ctx.restore();

        // Horizon glow line.
        const hz = ctx.createLinearGradient(0, POV.horizon - 18, 0, POV.horizon + 18);
        hz.addColorStop(0, 'rgba(255, 60, 138, 0)');
        hz.addColorStop(0.5, 'rgba(255, 60, 138, 0.45)');
        hz.addColorStop(1, 'rgba(255, 60, 138, 0)');
        ctx.fillStyle = hz;
        ctx.fillRect(0, POV.horizon - 18, VIEW.width, 36);

        ctx.save();
        ctx.lineWidth = 1;
        const nearY = camera.y + POV.near + 4;
        const farY = camera.y + POV.far;
        ctx.globalCompositeOperation = 'lighter';
        for (let x = -800; x <= 1600; x += GRID_STEP) {
            const a = projectPov({ x, y: nearY }, camera, FLOOR_HEIGHT);
            const b = projectPov({ x, y: farY }, camera, FLOOR_HEIGHT);
            const edge = x === 0 || x === 800;
            ctx.strokeStyle = edge ? 'rgba(125, 255, 140, 0.7)' : 'rgba(170, 90, 255, 0.3)';
            ctx.lineWidth = edge ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        ctx.lineWidth = 1;
        for (let y = Math.ceil(nearY / GRID_STEP) * GRID_STEP; y < farY; y += GRID_STEP) {
            const a = projectPov({ x: -800, y }, camera, FLOOR_HEIGHT);
            const b = projectPov({ x: 1600, y }, camera, FLOOR_HEIGHT);
            ctx.strokeStyle = `rgba(255, 60, 200, ${0.4 * povFade(a.depth)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        ctx.restore();

        const gate = projectPov({ x: 400, y: game.level.length }, camera, 40);
        if (gate && gate.depth < POV.far * 1.3) {
            const alpha = Math.max(0.25, povFade(gate.depth));
            const size = Math.min(2000, 900 * gate.scale);
            const img = getImage('gate');
            if (img) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha;
                ctx.drawImage(img, gate.x - size / 2, gate.y - size / 2, size, size);
                ctx.restore();
            }
            drawGlow(ctx, gate.x, gate.y, size * 0.6, '#7dff8c', alpha * 0.35);
            const left = projectPov({ x: 0, y: game.level.length }, camera, 160);
            const right = projectPov({ x: 800, y: game.level.length }, camera, FLOOR_HEIGHT);
            if (left && right) {
                ctx.save();
                ctx.strokeStyle = '#7dff8c';
                ctx.lineWidth = Math.max(1, gate.scale * 6);
                ctx.globalAlpha = alpha;
                ctx.setLineDash([Math.max(4, 30 * gate.scale), Math.max(3, 18 * gate.scale)]);
                ctx.lineDashOffset = -time * 60;
                ctx.strokeRect(left.x, left.y, right.x - left.x, right.y - left.y);
                ctx.restore();
            }
        }
    }

    function collectRenderables(game, camera) {
        const items = [];
        const add = (kind, obj, height = 0) => {
            const p = projectPov(obj, camera, height);
            if (p && p.depth < POV.far) items.push({ kind, obj, p });
        };
        game.asteroids.forEach((a) => add('asteroid', a));
        game.pickups.forEach((pk) => add('pickup', pk));
        game.enemyBullets.forEach((b) => add('enemyBullet', b));
        game.playerBullets.forEach((b) => add('playerBullet', b));
        game.particles.forEach((pt) => add('particle', pt));
        items.sort((a, b) => b.p.depth - a.p.depth);
        return items;
    }

    function drawRenderable(ctx, game, camera, item) {
        const { kind, obj, p } = item;
        const alpha = povFade(p.depth);
        const time = game.time || 0;
        if (kind === 'asteroid') {
            const radius = obj.size * p.scale;
            if (radius > 1400 || p.x + radius < 0 || p.x - radius > VIEW.width) return;
            drawAsteroid(ctx, obj, p.x, p.y, radius, alpha, time);
        } else if (kind === 'pickup') {
            drawPickup(ctx, obj, p.x, p.y, Math.min(120, obj.size * p.scale), time, alpha);
        } else if (kind === 'enemyBullet') {
            drawEnemyBullet(ctx, obj, p.x, p.y, Math.min(6, p.scale), alpha, time);
        } else if (kind === 'playerBullet') {
            const ahead = projectPov({ x: obj.x + obj.vx * 0.05, y: obj.y + obj.vy * 0.05 }, camera, 0);
            const dx = ahead ? ahead.x - p.x : 0;
            const dy = ahead ? ahead.y - p.y : -1;
            drawPlayerBullet(ctx, obj, p.x, p.y, dx, dy, Math.min(3, Math.max(0.35, p.scale)), alpha, time);
        } else {
            ctx.globalAlpha = alpha * Math.max(0, obj.life / obj.maxLife);
            ctx.fillStyle = obj.color;
            const s = Math.max(1, Math.min(10, p.scale * 2.5));
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
            ctx.globalAlpha = 1;
        }
    }

    function drawReticle(ctx, camera, ship, time) {
        const p = projectPov({ x: ship.x, y: ship.y + 420 }, camera, 0);
        if (!p) return;
        ctx.save();
        ctx.translate(Math.round(p.x), Math.round(p.y));
        ctx.strokeStyle = 'rgba(127, 215, 255, 0.85)';
        ctx.lineWidth = 2;
        const r = 12 + Math.sin(time * 6) * 1.5;
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(r, -6);
            ctx.lineTo(r + 6, 0);
            ctx.lineTo(r, 6);
            ctx.stroke();
        }
        ctx.fillStyle = '#ff3c8a';
        ctx.fillRect(-1, -1, 3, 3);
        ctx.restore();
    }

    return function renderPov(ctx, game, fx) {
        const camera = povCamera(game.ship);
        const time = game.time || 0;
        drawBackdrop(ctx, game, camera);
        for (const item of collectRenderables(game, camera)) drawRenderable(ctx, game, camera, item);
        if (fx) {
            fx.drawWorld(ctx, (pt) => {
                const p = projectPov(pt, camera, 0);
                if (!p || p.depth > POV.far) return null;
                return { x: p.x, y: p.y, scale: Math.min(1.8, p.scale), alpha: povFade(p.depth) * (p.scale > 1.4 ? 0.7 : 1) };
            });
        }
        if (game.state === 'playing' || game.state === 'paused' || game.state === 'levelComplete') {
            drawReticle(ctx, camera, game.ship, time);
            const shipPoint = projectPov(game.ship, camera, 0);
            if (shipPoint) drawShipChase(ctx, game.ship, shipPoint.x, shipPoint.y, time, fx ? fx.ripples : []);
        }
    };
}

module.exports = { createPovRenderer };

},{"./assets":10,"./background":11,"./projection":21,"./shapes":23}],21:[function(require,module,exports){
const VIEW = { width: 800, height: 600 };

// Overview: top-down map; the level scrolls toward the bottom of the screen.
const OVERVIEW_SHIP_LINE = 560;

function projectOverview(point, scrollY) {
    return {
        x: point.x,
        y: OVERVIEW_SHIP_LINE - (point.y - scrollY),
        scale: 1
    };
}

// POV: chase camera sitting just above and behind the ship, looking down the level.
const POV = {
    focal: 420,
    cameraHeight: 30,
    cameraBack: 50,
    horizon: 250,
    near: 8,
    far: 1700
};

function povCamera(ship) {
    return { x: ship.x, y: ship.y - POV.cameraBack };
}

function projectPov(point, camera, height = 0) {
    const depth = point.y - camera.y;
    if (depth < POV.near) return null;
    const scale = POV.focal / depth;
    return {
        x: VIEW.width / 2 + (point.x - camera.x) * scale,
        y: POV.horizon + (POV.cameraHeight - height) * scale,
        scale,
        depth
    };
}

function povFade(depth) {
    return Math.max(0, Math.min(1, 1.15 - depth / POV.far));
}

module.exports = { VIEW, OVERVIEW_SHIP_LINE, POV, projectOverview, povCamera, projectPov, povFade };

},{}],22:[function(require,module,exports){
// Full-screen overlays: title, intro, pause, level clear celebration,
// victory finale and game over.
const { VIEW } = require('./projection');
const { LEVEL_COUNT, getLevel } = require('../levels');
const { getImage, ROCK_KEYS } = require('./assets');
const { pixelText } = require('./font');
const { drawGlow, drawBreathe, pixelSprite, SHIP_TOP, SHIP_PALETTE } = require('./shapes');
const { panelBox, difficultyColor, difficultyName } = require('./hud');

const DIFFICULTY_OPTIONS = [
    { id: 'cadet', label: 'CADET', tagline: 'ORIGINAL TUNING' },
    { id: 'pilot', label: 'PILOT', tagline: 'FASTER + MEANER' },
    { id: 'ace', label: 'ACE', tagline: 'NEAR IMPOSSIBLE' }
];
const RAINBOW = ['#ff3c8a', '#ffb347', '#ffe65c', '#7dff8c', '#7fd7ff', '#b98aff'];

function drawCover(ctx, img, alpha = 1, zoom = 1, ox = 0, oy = 0) {
    if (!img) return false;
    const scale = Math.max(VIEW.width / img.naturalWidth, VIEW.height / img.naturalHeight) * zoom;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (VIEW.width - w) / 2 + ox, (VIEW.height - h) / 2 + oy, w, h);
    ctx.restore();
    return true;
}

function shade(ctx, alpha) {
    ctx.fillStyle = `rgba(2, 3, 12, ${alpha})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}

function waveText(ctx, value, cx, y, { size = 48, time = 0, amp = 6, colors = RAINBOW, spacing = 0.62, outline = '#05030c' } = {}) {
    const chars = String(value).split('');
    const step = size * spacing;
    const start = cx - (chars.length * step) / 2 + step / 2;
    chars.forEach((ch, i) => {
        if (ch === ' ') return;
        const dy = Math.sin(time * 5 + i * 0.6) * amp;
        const color = colors[(i + Math.floor(time * 6)) % colors.length];
        pixelText(ctx, ch, start + i * step, y + dy, { size, color, align: 'center', outline });
    });
}

function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const x = Math.max(0, Math.min(1, t)) - 1;
    return 1 + c3 * x * x * x + c1 * x * x;
}

function formatTime(seconds) {
    const s = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function drawFloatingRocks(ctx, time) {
    for (let i = 0; i < 6; i++) {
        const img = getImage(ROCK_KEYS[i % ROCK_KEYS.length]);
        if (!img) continue;
        const angle = time * 0.15 + (i / 6) * Math.PI * 2;
        const x = VIEW.width / 2 + Math.cos(angle) * 340;
        const y = 300 + Math.sin(angle) * 120;
        const size = 70 + 30 * Math.sin(angle);
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(angle);
        ctx.translate(x, y);
        ctx.rotate(time * 0.3 + i);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
    }
}

function drawTitle(ctx, game) {
    const time = game.time || 0;
    if (!drawCover(ctx, getImage('bg-galaxy'), 1, 1.08 + 0.03 * Math.sin(time * 0.3))) {
        ctx.fillStyle = '#05030c';
        ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    shade(ctx, 0.55);
    drawFloatingRocks(ctx, time);
    const cx = VIEW.width / 2;

    drawGlow(ctx, cx, 92, 260, '#ff3c8a', 0.18 + 0.06 * Math.sin(time * 2));
    waveText(ctx, 'ASTEROID', cx, 112, { size: 64, time, amp: 5 });
    const shine = (time * 160) % 900 - 50;
    pixelText(ctx, 'GALACTIC  GAUNTLET', cx, 148, { size: 18, align: 'center', color: '#ffb347' });
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(shine, 130, 24, 22);
    ctx.restore();

    // Difficulty cards.
    const selected = game.selectedDifficulty || 'cadet';
    const cardW = 170;
    const gap = 14;
    const left = cx - (cardW * 3 + gap * 2) / 2;
    DIFFICULTY_OPTIONS.forEach((opt, i) => {
        const x = left + i * (cardW + gap);
        const y = 172;
        const active = opt.id === selected;
        const color = difficultyColor(opt.id);
        if (active) drawGlow(ctx, x + cardW / 2, y + 26, 110, color, 0.3 + 0.1 * Math.sin(time * 5));
        panelBox(ctx, x, y, cardW, 52, active ? color : 'rgba(159,180,200,0.35)');
        if (active) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, cardW - 2, 50);
        }
        pixelText(ctx, opt.label, x + cardW / 2, y + 24, { size: 18, align: 'center', color: active ? color : '#6d7a8a' });
        pixelText(ctx, opt.tagline, x + cardW / 2, y + 42, { size: 10, align: 'center', color: active ? '#e8f6ff' : '#55606e' });
        for (let s = 0; s <= i; s++) {
            ctx.fillStyle = active ? color : '#3a4250';
            ctx.fillRect(x + 8 + s * 8, y + 6, 5, 5);
        }
    });
    pixelText(ctx, 'UP/DOWN  DIFFICULTY', cx, 244, { size: 11, align: 'center', color: '#9fb4c8' });

    const level = getLevel(game.selectedLevel || 1);
    const progress = game.progress || { unlocked: 1, highScore: 0 };
    const canLeft = (game.selectedLevel || 1) > 1;
    const canRight = (game.selectedLevel || 1) < progress.unlocked;
    const bob = Math.sin(time * 6) * 3;
    if (canLeft) pixelText(ctx, '<', cx - 270 - bob, 284, { size: 22, color: '#7fd7ff' });
    if (canRight) pixelText(ctx, '>', cx + 256 + bob, 284, { size: 22, color: '#7fd7ff' });
    pixelText(ctx, `LEVEL ${level.number}: ${level.name.toUpperCase()}`, cx, 284, { size: 20, align: 'center' });
    pixelText(ctx, `${difficultyName(game, true).toUpperCase()} UNLOCKED ${progress.unlocked}/${LEVEL_COUNT}   HI ${progress.highScore || 0}`, cx, 306, {
        size: 11, align: 'center', color: '#9fb4c8'
    });
    if (Math.floor(time * 2.5) % 2 === 0) {
        pixelText(ctx, 'PRESS ENTER TO LAUNCH', cx, 344, { size: 20, align: 'center', color: '#7dff8c' });
    }
    drawGlow(ctx, cx, 337, 160, '#7dff8c', 0.12);

    panelBox(ctx, 90, 368, 620, 214);
    const controls = [
        ['LEFT/RIGHT A/D', 'STEER  (TITLE: LEVEL)'],
        ['UP/DOWN W/S', 'THROTTLE (TITLE: DIFFICULTY)'],
        ['SPACE', 'FIRE (HOLD)'],
        ['V', 'SWITCH MAP / POV VIEW'],
        ['P / ESC', 'PAUSE    Q  MENU'],
        ['M', 'MUTE     C  CRT FILTER']
    ];
    controls.forEach(([key, action], i) => {
        pixelText(ctx, key, 270, 392 + i * 20, { size: 12, color: '#ffe65c', align: 'right' });
        pixelText(ctx, action, 290, 392 + i * 20, { size: 12, color: '#c9d6e3' });
    });
    drawBreathe(ctx, 128, 530, 12, time);
    pixelText(ctx, 'ENS ETH = POWER RE-UP', 152, 535, { size: 11, color: '#7dff8c' });
    pixelText(ctx, 'S/R/P WEAPONS  O SHIELD', 152, 553, { size: 11, color: '#c9d6e3' });
    drawGlow(ctx, 470, 538, 22, '#ff3a1c', 0.7 + 0.3 * Math.sin(time * 7));
    ctx.fillStyle = '#fff1c2';
    ctx.fillRect(467, 535, 6, 6);
    pixelText(ctx, 'ORANGE CORES SHOOT BACK!', 494, 543, { size: 11, color: '#ff8a5c' });
}

function drawIntro(ctx, game) {
    const t = Math.min(1, (game.levelTime || 0) / 0.5);
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    const slide = (1 - easeOutBack(t)) * VIEW.width;
    ctx.fillStyle = 'rgba(2, 3, 12, 0.55)';
    ctx.fillRect(0, cy - 70, VIEW.width, 110);
    ctx.fillStyle = '#ff3c8a';
    ctx.fillRect(0, cy - 72, VIEW.width, 2);
    ctx.fillRect(0, cy + 40, VIEW.width, 2);
    pixelText(ctx, `LEVEL ${game.level.number}`, cx - slide, cy - 20, { size: 44, align: 'center', color: '#7fd7ff' });
    pixelText(ctx, game.level.name.toUpperCase(), cx + slide, cy + 14, { size: 20, align: 'center', color: '#ffb347' });
    if (game.difficulty) {
        pixelText(ctx, `${difficultyName(game).toUpperCase()} MODE  GET READY`, cx, cy + 34, { size: 11, align: 'center', color: difficultyColor(game.difficulty) });
    }
}

function latestRecord(game, fx) {
    const fromFx = fx && fx.state.latestRecord;
    if (fromFx && fromFx.level === game.level.number) return fromFx;
    if (game.lastRecord && game.lastRecord.level === game.level.number) return game.lastRecord;
    return fromFx || null;
}

function tallyRows(record, game) {
    const s = (record && record.stats) || {};
    const rows = [
        ['ACCURACY', `${Math.round((s.accuracy || 0) * 100)}%`],
        ['DESTROYED', `${s.asteroidsDestroyed || 0} / MISSED ${s.asteroidsMissed || 0}`],
        ['MAX COMBO', `x${s.maxCombo || 0}`],
        ['DAMAGE TAKEN', `${Math.round(s.damageTaken || 0)}`],
        ['FLIGHT TIME', formatTime(record ? record.durationSec : game.levelTime)],
        ['BONUS', `+${game.levelBonus || 0}`]
    ];
    return record ? rows : rows.slice(-1);
}

function drawLevelClear(ctx, game, fx) {
    const time = game.time || 0;
    const t = fx && fx.state.celebrateTime >= 0 ? fx.state.celebrateTime : 1.5;
    const cx = VIEW.width / 2;
    shade(ctx, Math.min(0.5, t));
    // Diagonal racing stripes behind the banner.
    ctx.save();
    ctx.translate(cx, 150);
    ctx.rotate(-0.06);
    const bannerW = VIEW.width * 1.2 * easeOutBack(Math.min(1, t / 0.45));
    RAINBOW.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(-bannerW / 2, -44 + i * 15, bannerW, 9);
    });
    ctx.restore();
    const pop = easeOutBack(Math.min(1, Math.max(0, (t - 0.15) / 0.4)));
    if (pop > 0) {
        pixelText(ctx, 'STAGE CLEAR!', cx, 140, { size: 48, align: 'center', color: '#ffffff', outline: '#2a0030', scale: Math.max(0.01, pop) });
        pixelText(ctx, `LEVEL ${game.level.number}  ${game.level.name.toUpperCase()}`, cx, 192, { size: 16, align: 'center', color: '#ffe65c', alpha: Math.min(1, pop) });
    }

    const record = latestRecord(game, fx);
    const rows = tallyRows(record, game);
    const boxH = 34 + rows.length * 24;
    panelBox(ctx, cx - 210, 214, 420, boxH, '#7dff8c');
    rows.forEach(([label, value], i) => {
        const appear = t - 0.6 - i * 0.18;
        if (appear < 0) return;
        const y = 244 + i * 24;
        pixelText(ctx, label, cx - 190, y, { size: 13, color: '#9fb4c8' });
        pixelText(ctx, value, cx + 190, y, { size: 13, color: '#e8f6ff', align: 'right', alpha: Math.min(1, appear * 4) });
    });
    const after = 0.6 + rows.length * 0.18 + 0.2;
    if (record && t > after) {
        const pulse = 0.6 + 0.4 * Math.sin(time * 6);
        drawGlow(ctx, cx, 234 + boxH + 26, 150, '#ffe65c', 0.25 * pulse);
        pixelText(ctx, '* VICTORY STAMP READY *', cx, 240 + boxH + 30, { size: 16, align: 'center', color: '#ffe65c', alpha: pulse });
    }
    const next = game.level.number < LEVEL_COUNT ? getLevel(game.level.number + 1).name.toUpperCase() : '';
    if (next) pixelText(ctx, `NEXT: ${next}   ENTER TO JUMP`, cx, VIEW.height - 40, { size: 12, align: 'center', color: '#9fb4c8' });
}

function drawVictory(ctx, game, fx) {
    const time = game.time || 0;
    const t = fx && fx.state.celebrateTime >= 0 ? fx.state.celebrateTime : 3;
    const cx = VIEW.width / 2;
    if (!drawCover(ctx, getImage('mars-domicile'), Math.min(1, t * 0.8), 1.1 - Math.min(0.1, t * 0.01))) {
        ctx.fillStyle = '#12040c';
        ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    sky.addColorStop(0, 'rgba(30, 0, 40, 0.65)');
    sky.addColorStop(0.6, 'rgba(10, 0, 20, 0.35)');
    sky.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // Sunburst rays.
    ctx.save();
    ctx.translate(cx, 120);
    ctx.rotate(time * 0.2);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
        ctx.rotate((Math.PI * 2) / 16);
        ctx.fillStyle = i % 2 ? 'rgba(255, 230, 92, 0.06)' : 'rgba(255, 60, 138, 0.06)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-40, -700);
        ctx.lineTo(40, -700);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    const pop = easeOutBack(Math.min(1, t / 0.6));
    drawGlow(ctx, cx, 110, 320, '#ffe65c', 0.25);
    if (pop > 0.01) waveText(ctx, 'VICTORY!', cx, 120, { size: Math.round(76 * Math.max(0.2, pop)), time, amp: 8 });
    pixelText(ctx, 'THE CORE IS CLEARED', cx, 168, { size: 20, align: 'center', color: '#ffffff', alpha: Math.min(1, t) });
    if (game.difficulty) pixelText(ctx, `${difficultyName(game).toUpperCase()} CAMPAIGN COMPLETE`, cx, 192, { size: 13, align: 'center', color: difficultyColor(game.difficulty) });

    const sprite = pixelSprite('victory-ship', SHIP_TOP, SHIP_PALETTE, 5);
    if (sprite) {
        const sy = 250 + Math.sin(time * 3) * 6;
        drawGlow(ctx, cx, sy, 70, '#7fd7ff', 0.4);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite, cx - sprite.width / 2, sy - sprite.height / 2);
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(cx - 14, sy + sprite.height / 2, 8, 10 + 6 * Math.sin(time * 30));
        ctx.fillRect(cx + 6, sy + sprite.height / 2, 8, 10 + 6 * Math.cos(time * 30));
    }

    const finalScore = Math.round(game.score * Math.min(1, Math.max(0, t - 0.4) / 2));
    pixelText(ctx, 'FINAL SCORE', cx, 326, { size: 12, align: 'center', color: '#9fb4c8' });
    pixelText(ctx, String(finalScore).padStart(7, '0'), cx, 362, { size: 34, align: 'center', color: '#ffe65c' });

    const run = typeof game.getRunStats === 'function' ? safe(() => game.getRunStats()) : null;
    if (run) {
        const stats = [
            ['ACCURACY', `${Math.round((run.accuracy || (run.shotsFired ? run.hits / run.shotsFired : 0)) * 100)}%`],
            ['ROCKS', `${run.asteroidsDestroyed || 0}`],
            ['BEST COMBO', `x${run.maxCombo || 0}`],
            ['LIVES LOST', `${run.livesLost || 0}`]
        ];
        stats.forEach(([label, value], i) => {
            const x = 130 + i * 180;
            panelBox(ctx, x - 75, 384, 150, 50, RAINBOW[i + 1]);
            pixelText(ctx, label, x, 402, { size: 10, align: 'center', color: '#9fb4c8' });
            pixelText(ctx, value, x, 426, { size: 18, align: 'center', color: '#ffffff' });
        });
    }
    const pulse = 0.6 + 0.4 * Math.sin(time * 5);
    pixelText(ctx, `ALL ${LEVEL_COUNT} SECTORS CLEARED`, cx, 470, { size: 16, align: 'center', color: '#7dff8c', alpha: pulse });
    pixelText(ctx, 'CLAIM YOUR VICTORY STAMPS IN THE VAULT', cx, 492, { size: 11, align: 'center', color: '#c9d6e3' });
    pixelText(ctx, 'ENTER  MENU', cx, VIEW.height - 30, { size: 12, align: 'center', color: '#9fb4c8' });
}

function safe(fn) {
    try {
        return fn();
    } catch (error) {
        return null;
    }
}

function drawGameOver(ctx, game) {
    const time = game.time || 0;
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    ctx.fillStyle = 'rgba(40, 0, 6, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < VIEW.height; y += 4) ctx.fillRect(0, y, VIEW.width, 2);
    const glitch = Math.floor(time * 12) % 9 === 0 ? 6 : 1.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    pixelText(ctx, 'GAME OVER', cx - glitch, cy - 30, { size: 56, align: 'center', color: '#00e5ff', outline: null, alpha: 0.6 });
    pixelText(ctx, 'GAME OVER', cx + glitch, cy - 30, { size: 56, align: 'center', color: '#ff0040', outline: null, alpha: 0.6 });
    ctx.restore();
    pixelText(ctx, 'GAME OVER', cx, cy - 30, { size: 56, align: 'center', color: '#ff5a3c' });
    pixelText(ctx, `SCORE ${game.score}`, cx, cy + 14, { size: 20, align: 'center' });
    pixelText(ctx, `LEVEL ${game.level.number}  ${game.level.name.toUpperCase()}`, cx, cy + 40, { size: 12, align: 'center', color: '#ffb347' });
    if (Math.floor(time * 2) % 2 === 0) {
        pixelText(ctx, `ENTER RETRY LEVEL ${game.level.number}    Q MENU`, cx, cy + 80, { size: 14, align: 'center', color: '#e8f6ff' });
    }
}

function drawPaused(ctx) {
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    shade(ctx, 0.55);
    panelBox(ctx, cx - 220, cy - 70, 440, 120);
    pixelText(ctx, 'PAUSED', cx, cy - 14, { size: 40, align: 'center' });
    pixelText(ctx, 'P/ENTER RESUME  Q MENU  V VIEW', cx, cy + 24, { size: 12, align: 'center', color: '#9fb4c8' });
}

function drawOverlay(ctx, game, fx) {
    switch (game.state) {
        case 'title':
            drawTitle(ctx, game);
            break;
        case 'paused':
            drawPaused(ctx);
            break;
        case 'levelComplete':
            drawLevelClear(ctx, game, fx);
            break;
        case 'gameOver':
            drawGameOver(ctx, game);
            break;
        case 'victory':
            drawVictory(ctx, game, fx);
            break;
        case 'playing':
            if (game.showLevelIntro) drawIntro(ctx, game);
            break;
        default:
            break;
    }
}

module.exports = { drawOverlay, drawTitle, drawCover, waveText, formatTime, easeOutBack, DIFFICULTY_OPTIONS };

},{"../levels":9,"./assets":10,"./font":15,"./hud":17,"./projection":21,"./shapes":23}],23:[function(require,module,exports){
const { WEAPONS } = require('../weapons');
const { getImage, getTinted, rockKeyFor, makeCanvas, BREATHE_FRAMES } = require('./assets');
const { pixelText } = require('./font');

const PICKUP_STYLE = {
    spread: { color: WEAPONS.spread.color, label: 'S' },
    rapid: { color: WEAPONS.rapid.color, label: 'R' },
    plasma: { color: WEAPONS.plasma.color, label: 'P' },
    power: { color: '#7dff8c', label: '+' },
    shield: { color: '#6fa8ff', label: 'O' }
};

const COLOR_TO_WEAPON = Object.keys(WEAPONS).reduce((map, type) => {
    map[WEAPONS[type].color.toLowerCase()] = type;
    return map;
}, {});

function bulletWeaponType(bullet) {
    if (bullet.weapon && WEAPONS[bullet.weapon]) return bullet.weapon;
    return COLOR_TO_WEAPON[String(bullet.color || '').toLowerCase()] || 'blaster';
}

// ---------------------------------------------------------------- glow sprites
const glowCache = new Map();
function glowSprite(color) {
    if (glowCache.has(color)) return glowCache.get(color);
    const canvas = makeCanvas(64, 64);
    if (canvas) {
        const c = canvas.getContext('2d');
        const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, color);
        g.addColorStop(0.25, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = 0.9;
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
    }
    glowCache.set(color, canvas);
    return canvas;
}

// Additive soft glow: much cheaper than shadowBlur.
function drawGlow(ctx, x, y, radius, color, alpha = 1) {
    if (!(radius > 0) || !(alpha > 0)) return;
    const sprite = glowSprite(color);
    const prevOp = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = prevAlpha * Math.min(1, alpha);
    if (sprite) {
        ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = prevAlpha;
}

function drawGlowDot(ctx, x, y, radius, color, alpha = 1) {
    drawGlow(ctx, x, y, radius * 3, color, alpha * 0.8);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ---------------------------------------------------------------- pixel art
const SHIP_PALETTE = {
    W: '#ffffff', C: '#7fd7ff', H: '#ff6cf5', B: '#13284a', D: '#0a1428',
    M: '#ffe65c', A: '#ff3c8a', P: '#4a1d8a', F: '#ffb347'
};

const SHIP_TOP = [
    '......W......',
    '.....WCW.....',
    '.....CHC.....',
    '....CBHBC....',
    '....CBHBC....',
    '...CBBBBBC...',
    '..ACBBBBBCA..',
    '.AACBMBMBCAA.',
    'AAPCBBBBBCPAA',
    'APPCBDBDBCPPA',
    'AP.CDDBDDC.PA',
    'A..CCD.DCC..A',
    '....FF.FF....'
];

const SHIP_CHASE = [
    '............W............',
    '...........CHC...........',
    '..........CBHBC..........',
    'A........CBBBBBC........A',
    'AA......CBBMBMBBC......AA',
    'APA...CCBBBBBBBBBCC...APA',
    'APPACCBBBDDBBBDDBBBCCAPPA',
    'APPPPBBBDFFDBDFFDBBBPPPPA',
    '.AAPPBBBDFFDBDFFDBBBPPAA.',
    '...AACCCCDDCCCDDCCCCAA...'
];

const SHIP_PIXEL = 3;
const spriteCache = new Map();

function pixelSprite(name, rows, palette, pixel = SHIP_PIXEL) {
    const cacheKey = `${name}|${pixel}`;
    if (spriteCache.has(cacheKey)) return spriteCache.get(cacheKey);
    const width = rows[0].length;
    const canvas = makeCanvas(width * pixel, rows.length * pixel);
    if (canvas) {
        const c = canvas.getContext('2d');
        rows.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const color = palette[row[x]];
                if (!color) continue;
                c.fillStyle = color;
                c.fillRect(x * pixel, y * pixel, pixel, pixel);
            }
        });
    }
    spriteCache.set(cacheKey, canvas);
    return canvas;
}

// ---------------------------------------------------------------- asteroids
function asteroidPath(ctx, asteroid, radius) {
    ctx.beginPath();
    const points = asteroid.shape ? asteroid.shape.length : 10;
    for (let i = 0; i < points; i++) {
        const factor = asteroid.shape ? asteroid.shape[i] : 1;
        const angle = (i / points) * Math.PI * 2;
        const px = Math.cos(angle) * radius * factor;
        const py = Math.sin(angle) * radius * factor;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

function drawAsteroid(ctx, asteroid, x, y, radius, alpha = 1, time = 0) {
    if (!(radius >= 0.5)) return;
    const key = rockKeyFor(asteroid.id);
    const img = getImage(key);
    const pulse = 0.6 + 0.4 * Math.sin(time * 7 + asteroid.id);
    const flash = asteroid.flash > 0 ? Math.min(1, asteroid.flash / 0.12) : 0;
    if (asteroid.shooter) drawGlow(ctx, x, y, radius * 2.1, '#ff3a1c', alpha * (0.35 + 0.35 * pulse));
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(asteroid.rotation || 0);
    if (img) {
        const s = radius * 2.35;
        const source = asteroid.shooter ? (getTinted(key, 'shooter') || img) : img;
        ctx.drawImage(source, -s / 2, -s / 2, s, s);
        if (flash) {
            const white = getTinted(key, 'flash');
            if (white) {
                ctx.globalAlpha = alpha * flash;
                ctx.drawImage(white, -s / 2, -s / 2, s, s);
            }
        }
    } else {
        asteroidPath(ctx, asteroid, radius);
        ctx.fillStyle = flash ? '#ffffff' : asteroid.shooter ? '#2b1712' : '#1c1c22';
        ctx.fill();
        ctx.lineWidth = Math.max(1, radius / 18);
        ctx.strokeStyle = asteroid.shooter ? '#ff8a5c' : '#d8d2c4';
        ctx.stroke();
    }
    ctx.restore();
    if (asteroid.shooter) {
        // Menacing reactor eye: hot core plus a rotating split ring.
        drawGlow(ctx, x, y, radius * 0.9, '#ff5a1c', alpha * 0.9 * pulse);
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.fillStyle = '#fff1c2';
        const core = Math.max(1.5, radius * 0.14);
        ctx.fillRect(x - core, y - core, core * 2, core * 2);
        ctx.translate(x, y);
        ctx.rotate(-time * 2 + asteroid.id);
        ctx.strokeStyle = `rgba(255, 120, 60, ${0.5 + 0.5 * pulse})`;
        ctx.lineWidth = Math.max(1, radius * 0.07);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.45, 0, Math.PI * 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.45, Math.PI, Math.PI * 1.8);
        ctx.stroke();
        ctx.restore();
    }
}

// ---------------------------------------------------------------- pickups
function drawBreathe(ctx, x, y, radius, time, alpha = 1) {
    const sheet = getImage('breathe-sheet');
    const still = getImage('breathe-still');
    const breath = 1 + 0.12 * Math.sin(time * 3.2);
    const size = radius * 2.6 * breath;
    drawGlow(ctx, x, y, size * 1.1, '#7dff8c', alpha * (0.45 + 0.2 * Math.sin(time * 3.2)));
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (sheet) {
        const cycle = BREATHE_FRAMES * 2 - 2;
        const step = Math.floor(time * 9) % cycle;
        const frame = step < BREATHE_FRAMES ? step : cycle - step;
        const fw = sheet.naturalWidth / BREATHE_FRAMES;
        ctx.drawImage(sheet, frame * fw, 0, fw, sheet.naturalHeight, x - size / 2, y - size / 2, size, size);
    } else if (still) {
        ctx.drawImage(still, x - size / 2, y - size / 2, size, size);
    } else {
        ctx.fillStyle = '#7dff8c';
        ctx.fillRect(x - radius * 0.25, y - radius * 0.8, radius * 0.5, radius * 1.6);
        ctx.fillRect(x - radius * 0.8, y - radius * 0.25, radius * 1.6, radius * 0.5);
    }
    ctx.restore();
}

function drawPickup(ctx, pickup, x, y, radius, time, alpha = 1) {
    if (pickup.type === 'power') {
        drawBreathe(ctx, x, y, radius, time, alpha);
        return;
    }
    const style = PICKUP_STYLE[pickup.type] || PICKUP_STYLE.power;
    drawGlow(ctx, x, y, radius * 2.6, style.color, alpha * 0.55);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.save();
    ctx.rotate(time * 2);
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(8, 6, 24, 0.75)';
    ctx.fill();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = Math.max(1.5, radius / 6);
    ctx.stroke();
    ctx.restore();
    if (pickup.type === 'shield') {
        ctx.strokeStyle = style.color;
        ctx.lineWidth = Math.max(1, radius / 7);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.42, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        pixelText(ctx, style.label, 0, radius * 0.4, { size: Math.max(8, Math.round(radius * 1.1)), color: style.color, align: 'center' });
    }
    ctx.restore();
}

// ---------------------------------------------------------------- ship
function shipFlickerHidden(ship) {
    return ship.invulnerable > 0 && Math.floor(ship.invulnerable * 12) % 2 === 0;
}

function engineFlame(ctx, x, y, length, width, time, seed) {
    const len = length * (0.75 + 0.25 * Math.sin(time * 60 + seed * 3));
    drawGlow(ctx, x, y + len * 0.4, width * 3, '#ff8a2c', 0.7);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(x - width / 2, y, width, len);
    ctx.fillStyle = '#fff4c8';
    ctx.fillRect(x - width / 4, y, width / 2, len * 0.55);
}

// Top-down ship pointing up the screen.
function drawShipTop(ctx, ship, x, y, time = 0, ripples = []) {
    if (!shipFlickerHidden(ship)) {
        const sprite = pixelSprite('top', SHIP_TOP, SHIP_PALETTE);
        const bank = ship.bank || 0;
        ctx.save();
        ctx.translate(x, y);
        engineFlame(ctx, -4.5 + bank * 1.5, 18, 10 + 6 * Math.abs(Math.sin(time * 9)), 4, time, 1);
        engineFlame(ctx, 4.5 + bank * 1.5, 18, 10 + 6 * Math.abs(Math.cos(time * 9)), 4, time, 2);
        ctx.rotate(bank * 0.14);
        ctx.scale(1 - Math.abs(bank) * 0.22, 1);
        if (sprite) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
            if (Math.abs(bank) > 0.15) {
                ctx.fillStyle = `rgba(255,255,255,${Math.abs(bank) * 0.35})`;
                ctx.fillRect((bank > 0 ? 1 : -1) * 12 - 4, 3, 8, 6);
            }
        } else {
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(13, 12);
            ctx.lineTo(-13, 12);
            ctx.closePath();
            ctx.fillStyle = '#10243a';
            ctx.fill();
            ctx.strokeStyle = '#7fd7ff';
            ctx.stroke();
        }
        ctx.restore();
        drawGlow(ctx, x, y - 8, 9, '#ff6cf5', 0.35);
    }
    drawShield(ctx, ship, x, y, 30, time, ripples);
}

// Chase-camera view of the ship from behind.
function drawShipChase(ctx, ship, x, y, time = 0, ripples = []) {
    if (!shipFlickerHidden(ship)) {
        const sprite = pixelSprite('chase', SHIP_CHASE, SHIP_PALETTE);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((ship.bank || 0) * 0.35);
        if (sprite) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
        }
        const flick = 0.8 + 0.2 * Math.sin(time * 50);
        for (const ex of [-7.5, 7.5]) {
            drawGlow(ctx, ex, 7, 18 * flick, '#ff8a2c', 0.9);
            drawGlow(ctx, ex, 7, 7 * flick, '#fff4c8', 0.9);
        }
        drawGlow(ctx, -36, 0, 7, '#ff3c8a', 0.5 + 0.5 * Math.sin(time * 6));
        drawGlow(ctx, 36, 0, 7, '#ff3c8a', 0.5 + 0.5 * Math.sin(time * 6 + Math.PI));
        ctx.restore();
    }
    drawShield(ctx, ship, x, y, 62, time, ripples);
}

// ---------------------------------------------------------------- shield
let hexCanvas;
function hexPattern() {
    if (hexCanvas !== undefined) return hexCanvas;
    hexCanvas = makeCanvas(128, 128);
    if (!hexCanvas) return hexCanvas;
    const c = hexCanvas.getContext('2d');
    c.beginPath();
    c.arc(64, 64, 63, 0, Math.PI * 2);
    c.clip();
    c.strokeStyle = 'rgba(140, 200, 255, 0.9)';
    c.lineWidth = 1.2;
    const r = 9;
    const h = Math.sqrt(3) * r;
    for (let col = -1; col < 11; col++) {
        for (let row = -1; row < 10; row++) {
            const cx = col * r * 1.5;
            const cy = row * h + (col % 2 ? h / 2 : 0);
            c.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i;
                if (i === 0) c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                else c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            }
            c.closePath();
            c.stroke();
        }
    }
    const g = c.createRadialGradient(64, 64, 18, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.15)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    return hexCanvas;
}

function drawShield(ctx, ship, x, y, radius, time = 0, ripples = []) {
    if (!(ship.shield > 0)) return;
    const fading = ship.shield < 1.5 && Math.floor(ship.shield * 10) % 2 === 0;
    const strength = fading ? 0.35 : 1;
    ctx.save();
    ctx.translate(x, y);
    drawGlow(ctx, 0, 0, radius * 1.5, '#3f7bff', 0.35 * strength);
    const hex = hexPattern();
    if (hex) {
        ctx.save();
        ctx.rotate(time * 0.4);
        ctx.globalAlpha = (0.5 + 0.25 * Math.sin(time * 5)) * strength;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(hex, -radius, -radius, radius * 2, radius * 2);
        ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(-0.6);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.2 * strength;
    ctx.fillStyle = '#bfe3ff';
    const sweep = ((time * 0.8) % 1) * radius * 3 - radius * 1.5;
    ctx.fillRect(sweep - 5, -radius * 1.5, 10, radius * 3);
    ctx.restore();
    ctx.globalAlpha = strength;
    ctx.strokeStyle = 'rgba(150, 205, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    for (const ripple of ripples) {
        const t = ripple.age / ripple.life;
        if (t < 0 || t > 1) continue;
        ctx.globalAlpha = (1 - t) * strength;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3 * (1 - t) + 1;
        ctx.beginPath();
        ctx.arc(0, 0, radius + t * 10, ripple.angle - 0.5 - t, ripple.angle + 0.5 + t);
        ctx.stroke();
        drawGlow(ctx, Math.cos(ripple.angle) * radius, Math.sin(ripple.angle) * radius, 18 * (1 - t) + 6, '#9fd0ff', 1 - t);
    }
    ctx.restore();
}

// ---------------------------------------------------------------- bullets
// Screen-space player bullet. (dx, dy) is the on-screen direction of travel.
function drawPlayerBullet(ctx, bullet, x, y, dx, dy, scale = 1, alpha = 1, time = 0) {
    const type = bulletWeaponType(bullet);
    const color = bullet.color || WEAPONS[type].color;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (type === 'plasma') {
        const r = Math.max(2, bullet.size * scale);
        for (let i = 4; i >= 1; i--) {
            drawGlow(ctx, x - ux * r * i * 0.9, y - uy * r * i * 0.9, r * (2.2 - i * 0.3), color, 0.3 * (1 - i / 5));
        }
        drawGlow(ctx, x, y, r * 3, color, 0.9);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, r * 0.2);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.6, time * 12, time * 12 + Math.PI * 1.2);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.5);
    } else if (type === 'rapid') {
        const l = 24 * scale;
        const w = Math.max(1, 2 * scale);
        drawGlow(ctx, x - ux * l * 0.4, y - uy * l * 0.4, l * 0.7, color, 0.5);
        ctx.strokeStyle = color;
        ctx.lineWidth = w * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - ux * l, y - uy * l);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = w;
        ctx.stroke();
    } else if (type === 'spread') {
        const s = Math.max(2, 4.5 * scale);
        drawGlow(ctx, x, y, s * 3, color, 0.6);
        ctx.translate(x, y);
        ctx.rotate(time * 14);
        ctx.fillStyle = color;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-s / 4, -s / 4, s / 2, s / 2);
    } else {
        const l = 14 * scale;
        const w = Math.max(1.5, 3 * scale);
        drawGlow(ctx, x - ux * l * 0.5, y - uy * l * 0.5, l, color, 0.7);
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = w * 1.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - ux * l, y - uy * l);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = w * 0.7;
        ctx.stroke();
    }
    ctx.restore();
}

// Enemy shot: hot orange orb with a rotating spiky star so it reads as danger.
function drawEnemyBullet(ctx, bullet, x, y, scale = 1, alpha = 1, time = 0) {
    const r = Math.max(2.5, (bullet.size || 4) * 1.5 * scale);
    const pulse = 0.75 + 0.25 * Math.sin(time * 18 + x * 0.1);
    drawGlow(ctx, x, y, r * 4 * pulse, '#ff3a1c', 0.85 * alpha);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(time * 6);
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        const rr = i % 2 === 0 ? r * 1.7 : r * 0.7;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd25c';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6);
    ctx.restore();
}

module.exports = {
    PICKUP_STYLE,
    SHIP_TOP,
    SHIP_CHASE,
    SHIP_PALETTE,
    bulletWeaponType,
    glowSprite,
    drawGlow,
    drawGlowDot,
    pixelSprite,
    drawAsteroid,
    drawBreathe,
    drawPickup,
    drawShipTop,
    drawShipChase,
    drawShield,
    drawPlayerBullet,
    drawEnemyBullet
};

},{"../weapons":28,"./assets":10,"./font":15}],24:[function(require,module,exports){
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

},{}],25:[function(require,module,exports){
// Save format, validation, legacy migration and quota-tolerant persistence.
const { LEVEL_COUNT } = require('./levels');
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
const MAX_WINS = 200;
const MAX_IMPORT_WINS = 2000;
const MAX_SAVE_CHARS = 10 * 1024 * 1024;
const MAX_SCORE = 1e10;
const MAX_STRING = 200;

function createProgress() {
    return { unlocked: 1, highScore: 0, bestLevelScores: {} };
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
        if (!Number.isInteger(unlocked) || unlocked < 1 || unlocked > LEVEL_COUNT) {
            fail(`${label} progress: unlocked level must be a whole number from 1 to ${LEVEL_COUNT}.`);
        }
        const bestIn = entry.bestLevelScores ?? {};
        if (!isPlainObject(bestIn)) fail(`${label} progress: best level scores must be an object.`);
        const bestLevelScores = {};
        for (const [level, score] of Object.entries(bestIn)) {
            const n = Number(level);
            if (!Number.isInteger(n) || n < 1 || n > LEVEL_COUNT || String(n) !== level) {
                fail(`${label} progress: "${level.slice(0, 10)}" is not a level number.`);
            }
            bestLevelScores[level] = num(score, `${label} best score for level ${level}`);
        }
        byDifficulty[id] = {
            unlocked,
            highScore: num(entry.highScore ?? 0, `${label} high score`),
            bestLevelScores
        };
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

function validateLevelRecord(record, where = 'Level record') {
    if (!isPlainObject(record)) fail(`${where} must be an object.`);
    if (record.schema !== RECORD_SCHEMA) fail(`${where} uses an unsupported schema (expected ${RECORD_SCHEMA}).`);
    if (!isDifficulty(record.difficulty)) fail(`${where} has an unknown difficulty.`);
    const level = record.level;
    if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT) fail(`${where}: level must be 1–${LEVEL_COUNT}.`);
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
    const count = (key) => num(key === 'volleys' ? (stats[key] ?? 0) : stats[key], `${s}.${key}`, {
        max: 1e9, integer: !['damageTaken', 'timeInPov', 'timeInOverview'].includes(key)
    });
    return {
        schema: RECORD_SCHEMA,
        id: str(record.id, `${where} id`),
        game: str(record.game, `${where} game`),
        gameVersion: str(record.gameVersion, `${where} gameVersion`, 20),
        level,
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
            shotsByWeapon: counters(stats.shotsByWeapon, WEAPON_TYPES, `${s}.shotsByWeapon`, true),
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
            pickupsCollected: counters(stats.pickupsCollected, PICKUP_TYPES, `${s}.pickupsCollected`, true),
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
// Corrupt or unavailable storage falls back to a fresh save.
function loadSave(storage) {
    const current = readJson(storage, STORAGE_KEY);
    if (current) {
        try {
            return validateSave(current);
        } catch (error) {
            // Fall through to legacy/fresh.
        }
    }
    const legacy = readJson(storage, LEGACY_STORAGE_KEY);
    if (isLegacyShape(legacy)) return migrateLegacy(legacy);
    return createEmptySave();
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
    MAX_WINS,
    createEmptySave,
    createProgress,
    migrateLegacy,
    validateSave,
    validateLevelRecord,
    loadSave,
    persistSave
};

},{"./difficulty":6,"./levels":9,"./stats":27}],26:[function(require,module,exports){
const { createWeapon } = require('./weapons');

const MIN_X = 20;
const MAX_X = 780;
const MIN_OFFSET = 40;
const MAX_OFFSET = 280;

// The ship flies at the scroll position plus a player-controlled forward offset.
class Spaceship {
    constructor() {
        this.size = 12;
        this.maxPower = 100;
        this.lives = 3;
        this.weapon = createWeapon();
        this.reset();
    }

    reset() {
        this.x = 400;
        this.offset = 90;
        this.y = 0;
        this.power = this.maxPower;
        this.cooldown = 0;
        this.invulnerable = 0;
        this.shield = 0;
        this.bank = 0;
        this.lateralSpeed = 280;
        this.forwardSpeed = 190;
    }

    update(dt, input, scrollY) {
        let steer = 0;
        if (input.left) steer -= 1;
        if (input.right) steer += 1;
        this.x = Math.min(MAX_X, Math.max(MIN_X, this.x + steer * this.lateralSpeed * dt));
        if (input.up) this.offset += this.forwardSpeed * dt;
        if (input.down) this.offset -= this.forwardSpeed * dt;
        this.offset = Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, this.offset));
        this.y = scrollY + this.offset;
        this.bank += (steer - this.bank) * Math.min(1, dt * 8);
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.invulnerable = Math.max(0, this.invulnerable - dt);
        this.shield = Math.max(0, this.shield - dt);
    }

    get protectedFromDamage() {
        return this.invulnerable > 0 || this.shield > 0;
    }
}

module.exports = Spaceship;

},{"./weapons":28}],27:[function(require,module,exports){
// Per-level stats, combo tracking, battle log sampling and LevelRecord building.
//
// Definitions:
// - shotsFired: player projectiles spawned (a 7-way spread volley counts 7); volleys: trigger pulls.
// - hits: projectiles that struck at least one asteroid (a piercing plasma bolt counts once),
//   so accuracy = hits / shotsFired is always within 0..1.
// - asteroidsSpawned: layout asteroids plus fragments from broken rocks.
// - asteroidsDestroyed: asteroids destroyed by shots or by ramming them.
// - asteroidsMissed: un-destroyed asteroids that passed behind the ship.
// - enemyShotsDodged: enemy bullets that expired or left the world without touching the ship.
// - hitsTaken: hits that cost power; collisions: rocks the ship flew into (shielded or not);
//   shieldBlocks: bullets or rocks absorbed by the shield; damageTaken: power lost.
// - pickupsMissed: pickups that passed behind the ship uncollected.
// - combo: consecutive asteroid kills by the player's shots, each within COMBO_WINDOW seconds of
//   the previous kill, without the ship losing power in between. maxCombo is the level best.
// - closestCall: smallest gap in px between the ship's and a dodged enemy bullet's edges
//   (-1 when no enemy bullet was dodged).
const WEAPON_TYPES = ['blaster', 'spread', 'rapid', 'plasma'];
const PICKUP_TYPES = ['spread', 'rapid', 'plasma', 'power', 'shield'];
const COMBO_WINDOW = 2;
const RECORD_SCHEMA = 'asteroid-level-record/1';
const GAME_NAME = 'AsteRoid: Galactic Gauntlet';
const GAME_VERSION = '2.0.0';
const WORLD_WIDTH = 800;
const BATTLE_LOG_CAPS = { path: 300, kills: 400, hitsTaken: 200, pickups: 100, misses: 400 };
const PATH_INTERVAL = 0.25;

const COUNTER_FIELDS = [
    'shotsFired', 'volleys', 'hits', 'asteroidsSpawned', 'asteroidsDestroyed', 'asteroidsMissed',
    'shootersDestroyed', 'fragmentsDestroyed', 'enemyShotsFired', 'enemyShotsDodged', 'hitsTaken',
    'collisions', 'shieldBlocks', 'damageTaken', 'pickupsMissed', 'timeInPov', 'timeInOverview'
];

// Lifetime / run totals: counters are summed, maxCombo is a max, closestCall a min.
const TOTALS_COUNTER_FIELDS = [
    'levelsPlayed', 'levelsCleared', 'levelsFailed', 'levelsAbandoned', 'campaignsStarted', 'victories',
    'livesLost', 'playTimeSec', ...COUNTER_FIELDS
];

const zeroMap = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));
const round = (value, places = 2) => {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
};
const ratio = (hits, shots) => (shots > 0 ? Math.min(1, hits / shots) : 0);

function createLevelStats() {
    return {
        ...zeroMap(COUNTER_FIELDS),
        shotsByWeapon: zeroMap(WEAPON_TYPES),
        pickupsCollected: zeroMap(PICKUP_TYPES),
        maxCombo: 0,
        closestCall: -1
    };
}

function createTotals() {
    return {
        ...zeroMap(TOTALS_COUNTER_FIELDS),
        shotsByWeapon: zeroMap(WEAPON_TYPES),
        pickupsCollected: zeroMap(PICKUP_TYPES),
        maxCombo: 0,
        closestCall: -1,
        accuracy: 0
    };
}

function minCall(a, b) {
    if (a < 0) return b;
    if (b < 0) return a;
    return Math.min(a, b);
}

// outcome: 'cleared' | 'failed' | 'abandoned'
function mergeTotals(totals, stats, { outcome, livesLost = 0, durationSec = 0 } = {}) {
    for (const key of COUNTER_FIELDS) totals[key] = round((totals[key] || 0) + (stats[key] || 0));
    for (const key of WEAPON_TYPES) totals.shotsByWeapon[key] += stats.shotsByWeapon[key] || 0;
    for (const key of PICKUP_TYPES) totals.pickupsCollected[key] += stats.pickupsCollected[key] || 0;
    totals.maxCombo = Math.max(totals.maxCombo, stats.maxCombo || 0);
    totals.closestCall = minCall(totals.closestCall, stats.closestCall);
    totals.levelsPlayed += 1;
    if (outcome === 'cleared') totals.levelsCleared += 1;
    else if (outcome === 'failed') totals.levelsFailed += 1;
    else if (outcome === 'abandoned') totals.levelsAbandoned += 1;
    totals.livesLost += livesLost;
    totals.playTimeSec = round(totals.playTimeSec + durationSec);
    totals.accuracy = ratio(totals.hits, totals.shotsFired);
    return totals;
}

class LevelTracker {
    constructor() {
        this.stats = createLevelStats();
        this.log = { path: [], kills: [], hitsTaken: [], pickups: [], misses: [] };
        this.pathInterval = PATH_INTERVAL;
        this.pathTimer = PATH_INTERVAL;
        this.combo = 0;
        this.comboTimer = 0;
        this.livesLost = 0;
        this.finalized = false;
    }

    push(list, entry) {
        const log = this.log[list];
        if (log.length < BATTLE_LOG_CAPS[list]) log.push(entry.map((v) => (typeof v === 'number' ? Math.round(v) : v)));
    }

    tick(dt, ship, view) {
        if (view === 'pov') this.stats.timeInPov += dt;
        else this.stats.timeInOverview += dt;
        if (this.comboTimer > 0) {
            this.comboTimer = Math.max(0, this.comboTimer - dt);
            if (this.comboTimer === 0) this.combo = 0;
        }
        this.pathTimer += dt;
        if (this.pathTimer >= this.pathInterval) {
            this.pathTimer = 0;
            this.samplePath(ship);
        }
    }

    samplePath(ship) {
        const path = this.log.path;
        path.push([Math.round(ship.x), Math.round(ship.y)]);
        if (path.length > BATTLE_LOG_CAPS.path) {
            // Halve the resolution so the full flight always fits.
            this.log.path = path.filter((_, i) => i % 2 === 0);
            this.pathInterval *= 2;
        }
    }

    shot(weaponType, count) {
        this.stats.volleys += 1;
        this.stats.shotsFired += count;
        if (weaponType in this.stats.shotsByWeapon) this.stats.shotsByWeapon[weaponType] += count;
    }

    hit() {
        this.stats.hits += 1;
    }

    spawned(count) {
        this.stats.asteroidsSpawned += count;
    }

    destroyed(asteroid, byPlayerShot) {
        const s = this.stats;
        s.asteroidsDestroyed += 1;
        if (asteroid.shooter) s.shootersDestroyed += 1;
        if (asteroid.fragment) s.fragmentsDestroyed += 1;
        this.push('kills', [asteroid.x, asteroid.y, asteroid.size, asteroid.shooter ? 1 : 0]);
        if (byPlayerShot) {
            this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
            this.comboTimer = COMBO_WINDOW;
            s.maxCombo = Math.max(s.maxCombo, this.combo);
        }
    }

    missed(x, y) {
        this.stats.asteroidsMissed += 1;
        this.push('misses', [x, y]);
    }

    enemyShot() {
        this.stats.enemyShotsFired += 1;
    }

    dodged(nearest) {
        this.stats.enemyShotsDodged += 1;
        if (Number.isFinite(nearest)) this.stats.closestCall = minCall(this.stats.closestCall, round(Math.max(0, nearest), 1));
    }

    collision() {
        this.stats.collisions += 1;
    }

    shieldBlock() {
        this.stats.shieldBlocks += 1;
    }

    damaged(amount, x, y) {
        this.stats.hitsTaken += 1;
        this.stats.damageTaken = round(this.stats.damageTaken + amount);
        this.push('hitsTaken', [x, y]);
        this.combo = 0;
        this.comboTimer = 0;
    }

    pickup(type, x, y) {
        if (type in this.stats.pickupsCollected) this.stats.pickupsCollected[type] += 1;
        this.push('pickups', [x, y, type]);
    }

    pickupMissed() {
        this.stats.pickupsMissed += 1;
    }

    lifeLost() {
        this.livesLost += 1;
    }

    snapshot() {
        const s = this.stats;
        return {
            shotsFired: s.shotsFired,
            volleys: s.volleys,
            shotsByWeapon: { ...s.shotsByWeapon },
            hits: s.hits,
            accuracy: ratio(s.hits, s.shotsFired),
            asteroidsSpawned: s.asteroidsSpawned,
            asteroidsDestroyed: s.asteroidsDestroyed,
            asteroidsMissed: s.asteroidsMissed,
            shootersDestroyed: s.shootersDestroyed,
            fragmentsDestroyed: s.fragmentsDestroyed,
            enemyShotsFired: s.enemyShotsFired,
            enemyShotsDodged: s.enemyShotsDodged,
            hitsTaken: s.hitsTaken,
            collisions: s.collisions,
            shieldBlocks: s.shieldBlocks,
            damageTaken: round(s.damageTaken),
            pickupsCollected: { ...s.pickupsCollected },
            pickupsMissed: s.pickupsMissed,
            maxCombo: s.maxCombo,
            timeInPov: round(s.timeInPov),
            timeInOverview: round(s.timeInOverview),
            closestCall: s.closestCall
        };
    }

    battleLog(level, ship) {
        const path = this.log.path.map((point) => point.slice());
        const last = [Math.round(ship.x), Math.round(ship.y)];
        if (path.length < BATTLE_LOG_CAPS.path) path.push(last);
        else path[path.length - 1] = last;
        const copy = (list) => list.map((entry) => entry.slice());
        return {
            levelLength: level.length,
            worldWidth: WORLD_WIDTH,
            path,
            kills: copy(this.log.kills),
            hitsTaken: copy(this.log.hitsTaken),
            pickups: copy(this.log.pickups),
            misses: copy(this.log.misses)
        };
    }
}

function randomSuffix() {
    return Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
}

function buildLevelRecord({ level, tracker, ship, view, score, startedAt, completedAt, durationSec, suffix = randomSuffix() }) {
    const completedIso = new Date(completedAt).toISOString();
    return {
        schema: RECORD_SCHEMA,
        id: `${completedIso}-${level.difficulty}-L${level.number}-${suffix}`,
        game: GAME_NAME,
        gameVersion: GAME_VERSION,
        level: level.number,
        levelName: level.name,
        difficulty: level.difficulty,
        difficultyLabel: level.difficultyLabel,
        seed: level.seed,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: completedIso,
        durationSec: round(durationSec),
        score: { total: score.total, level: score.level, bonus: score.bonus },
        ship: {
            livesRemaining: ship.lives,
            livesLost: tracker.livesLost,
            finalPower: Math.round(ship.power),
            finalWeapon: { type: ship.weapon.type, tier: ship.weapon.tier },
            view
        },
        stats: tracker.snapshot(),
        battleLog: tracker.battleLog(level, ship)
    };
}

module.exports = {
    WEAPON_TYPES,
    PICKUP_TYPES,
    COMBO_WINDOW,
    RECORD_SCHEMA,
    GAME_NAME,
    GAME_VERSION,
    WORLD_WIDTH,
    BATTLE_LOG_CAPS,
    COUNTER_FIELDS,
    TOTALS_COUNTER_FIELDS,
    LevelTracker,
    createLevelStats,
    createTotals,
    mergeTotals,
    buildLevelRecord
};

},{}],28:[function(require,module,exports){
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

},{"./bullet":4}]},{},[1]);
