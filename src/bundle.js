(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const Game = require('./game');
const { createAudio } = require('./audio');
const { createOverviewRenderer } = require('./render/overview');
const { createPovRenderer } = require('./render/pov');
const { createHud } = require('./render/hud');
const { drawOverlay } = require('./render/screens');
const { createFx } = require('./render/fx');
const { drawCrt } = require('./render/post');
const { setViewWidth } = require('./render/projection');
const { loadAssets } = require('./render/assets');
const { renderBattleCard, previewBattleCard } = require('./render/battleCard');
const { sampleRecord } = require('./render/cardMath');
const { setGlowBudget } = require('./render/shapes');
const { createInput } = require('./input');
const { createDiagnostics } = require('./diagnostics');

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
const diagnostics = createDiagnostics({
    storage,
    snapshot: () => ({
        state: game.state, level: game.level?.number, difficulty: game.difficulty, view: game.view,
        particles: game.particles?.length, rocks: game.asteroids?.length,
        bullets: (game.playerBullets?.length || 0) + (game.enemyBullets?.length || 0),
        width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio || 1
    }),
    notify: () => window.dispatchEvent(new CustomEvent('voyager:diagnostic'))
});
const audio = createAudio({ onError: error => diagnostics.record('audio', error) });
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

let networkMode = null;
let localMode = 'coop';
function syncPlayers(players = input && input.players) {
    if (typeof game.setPlayers === 'function') game.setPlayers(players, { mode: localMode });
}
const input = createInput({
    onAction: (action) => {
        audio.unlock();
        if (action === 'modeNext') {
            localMode = localMode === 'coop' ? 'versus' : 'coop';
            syncPlayers();
            return;
        }
        if (typeof game.handleAction === 'function') game.handleAction(action);
    },
    onToast: (message) => hud.setToast(message),
    onPlayersChanged: (players) => syncPlayers(players),
    onPlayerLeft: (index) => dispatchGameEvent({ type: 'playerLeft', index }),
    shouldIgnoreKeyboard: (event) => isTypingContext(event) || !isGameFocus()
});

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
    const isGameKey = Boolean(held || action || TITLE_DIFFICULTY_KEYS[event.key] || /^[mMcC]$/.test(event.key) || event.key === 'Tab');
    if (!isGameKey) return;
    audio.unlock();
    if (gameFocus) event.preventDefault();
    if (event.key === 'Tab' && game.state === 'title') {
        event.preventDefault();
        localMode = localMode === 'coop' ? 'versus' : 'coop';
        syncPlayers();
        return;
    }
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

canvas.addEventListener('pointerdown', () => {
    audio.unlock();
    if (document.activeElement !== canvas && typeof canvas.focus === 'function') canvas.focus({ preventScroll: true });
});

window.addEventListener('blur', () => {
    input.clear();
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
function snapshotsFrom(network) {
    if (!network || !Object.prototype.hasOwnProperty.call(network, 'snapshots')) return null;
    const source = network.snapshots;
    if (typeof source === 'function') return source();
    if (Array.isArray(source)) return source.length ? source.shift() : null;
    return source;
}

function step(realDt, controls = null) {
    const inputs = controls ? (Array.isArray(controls) ? controls : [controls]) : input.poll(game);
    if (networkMode) {
        if (typeof networkMode.onInput === 'function') networkMode.onInput(inputs);
        const snapshot = snapshotsFrom(networkMode);
        if (snapshot && typeof game.applySnapshot === 'function') {
            try {
                game.applySnapshot(snapshot.vault === undefined ? { ...snapshot, vault: null } : snapshot);
            } catch (error) {
                window.dispatchEvent(new CustomEvent('voyager:snapshotError', { detail: { message: error.message } }));
            }
        }
    } else if (typeof game.update === 'function') {
        game.update(realDt * fx.timeScale(), inputs);
    } else if (typeof game.step === 'function') {
        game.step(inputs);
    }
    const events = game.drainEvents();
    if (events.length) {
        audio.play(events, game);
        fx.handle(events, game);
        events.forEach(dispatchGameEvent);
        for (const event of events) if (['levelStart', 'shipDestroyed', 'gameOver', 'victory'].includes(event.type)) {
            diagnostics.record('battle-event', event.type);
        }
    }
    fx.update(realDt, game);
}

// Match the contained image to device pixels without changing the logical world.
const LOGICAL = { width: canvas.width, height: canvas.height };
let renderScaleX = 1;
let renderScaleY = 1;
let renderPixelRatio = 0;
let renderQuality = 1;
let renderedTitle = game.state === 'title';
const MAX_BACKING_PIXELS = 3_000_000;
function fitBacking() {
    const rect = canvas.getBoundingClientRect();
    const logicalWidth = setViewWidth(rect.width && rect.height ? LOGICAL.height * rect.width / rect.height : LOGICAL.width);
    const shown = Math.min(rect.width || logicalWidth, (rect.height || LOGICAL.height) * logicalWidth / LOGICAL.height);
    renderPixelRatio = window.devicePixelRatio || 1;
    const pixelRatio = Math.min(renderPixelRatio, 2) * (game.state === 'title' ? 1 : renderQuality);
    const pixelLimit = Math.sqrt(MAX_BACKING_PIXELS / (shown * shown * LOGICAL.height / logicalWidth));
    const scale = Math.min(pixelRatio, pixelLimit);
    const width = Math.max(1, Math.floor(shown * scale));
    const height = Math.max(1, Math.floor(shown * LOGICAL.height / logicalWidth * scale));
    renderScaleX = width / logicalWidth;
    renderScaleY = height / LOGICAL.height;
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
}
if (typeof ResizeObserver === 'function') new ResizeObserver(fitBacking).observe(canvas);
window.addEventListener('resize', fitBacking);
fitBacking();

function draw() {
    if (renderPixelRatio !== (window.devicePixelRatio || 1) || renderedTitle !== (game.state === 'title')) {
        renderedTitle = game.state === 'title';
        fitBacking();
    }
    setGlowBudget(game.state === 'title' ? Infinity : renderQuality < 1 ? 30 : 120);
    try { drawScene(); } finally { setGlowBudget(); }
}
function drawScene() {
    audio.setSector2(Number(game.level && game.level.number) >= 11);
    const shake = fx.shakeOffset();
    ctx.setTransform(renderScaleX, 0, 0, renderScaleY, 0, 0);
    // Resizing resets context state; apply nearest-neighbour sampling every frame.
    ctx.imageSmoothingEnabled = false;
    if (game.state !== 'title') {
        ctx.save();
        try {
            ctx.translate(shake.x, shake.y);
            renderers[game.view](ctx, game, fx);
        } finally { ctx.restore(); }
        fx.drawScreen(ctx, game);
    }
    hud.drawHud(ctx, game, fx, { muted: audio.muted, crt: display.crt });
    drawOverlay(ctx, game, fx);
    if (display.crt && game.state !== 'title') drawCrt(ctx, game.time || 0);
}

let last = null;
let slowFrames = 0;
let healthyFrames = 0;
let frameFault = false;
let contextLost = false;
function freezeBattle() {
    input.clear();
    if (!networkMode && game.state === 'playing') game.handleAction('pause');
}
function frameError(error) {
    frameFault = true;
    freezeBattle();
    diagnostics.record('frame-error', error);
    hud.setToast('Flight error: open Flight reports below to save diagnostics and recover.', 12000);
}
function frame(timestamp) {
    try {
        if (!frameFault && !contextLost) advanceFrame(timestamp);
    } catch (error) { frameError(error); }
    finally { requestAnimationFrame(frame); }
}
function advanceFrame(timestamp) {
    const elapsed = last === null ? 0 : (timestamp - last) / 1000;
    let dt = Math.min(0.05, elapsed);
    last = timestamp;
    slowFrames = elapsed > 0.05 ? slowFrames + 1 : 0;
    if (['playing', 'paused'].includes(game.state) && (elapsed > 0.25 || slowFrames >= 8)) {
        renderQuality = Math.max(0.35, renderQuality * 0.65);
        fitBacking();
        fx.clear();
        game.particles.length = 0;
        input.clear();
        if (!networkMode) {
            freezeBattle();
            dt = 0;
            hud.setToast('Performance pause: battle frozen. Press P / Resume when ready.', 12000);
        } else {
            hud.setToast('Reduced visual load. Online battle continues on the referee.', 12000);
        }
        diagnostics.record('performance-pause', networkMode ? 'Online visuals reduced; referee continues.' : 'Local battle paused after a slow frame.', { elapsedMs: Math.round(elapsed * 1000), quality: renderQuality });
        healthyFrames = 0;
        slowFrames = 0;
    }
    healthyFrames = game.state === 'playing' && elapsed > 0 && elapsed < 0.025 ? healthyFrames + 1 : 0;
    if (game.state === 'playing' && healthyFrames >= 600 && renderQuality < 1) {
        renderQuality = Math.min(1, renderQuality + 0.05);
        fitBacking();
        healthyFrames = 0;
    }
    step(dt);
    draw();
}
canvas.addEventListener('contextlost', event => {
    event.preventDefault();
    contextLost = true;
    freezeBattle();
    diagnostics.record('context-lost', 'Canvas graphics context lost. Battle paused locally; online referee continues.');
});
canvas.addEventListener('contextrestored', () => {
    contextLost = false;
    frameFault = true;
    diagnostics.record('context-restored', 'Graphics restored. Use Resume battle in Flight reports.');
});
window.addEventListener('error', event => diagnostics.record('window-error', event.error || event.message || 'Resource load failed'));
window.addEventListener('unhandledrejection', event => diagnostics.record('unhandled-rejection', event.reason));
window.voyagerDiagnostics = {
    report: diagnostics.report,
    resume() {
        if (contextLost) throw new Error('Graphics context has not recovered. Download the report, then reload.');
        frameFault = false;
        last = null;
        slowFrames = healthyFrames = 0;
        fx.clear();
        input.clear();
        if (typeof ctx.reset === 'function') ctx.reset();
        else canvas.width = canvas.width;
        if (!networkMode && game.state === 'paused') game.handleAction('confirm');
        diagnostics.record('manual-resume', 'Pilot requested recovery.');
    }
};
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) last = null;
    else {
        input.clear();
        if (!networkMode && game.state === 'playing') game.handleAction('pause');
    }
});

// Console handles for debugging, automated play-testing and other page modules.
window.asteroidGame = game;
window.asteroidDraw = draw;
window.asteroidStep = step;
window.AsteroidRender = { renderBattleCard, previewBattleCard, sampleRecord, loadAssets };
function setNetworkMode(options = null) {
    if (!options) {
        networkMode = null;
        return false;
    }
    networkMode = typeof options === 'function' ? { onInput: options } : options;
    return true;
}
window.voyager = {
    game,
    step,
    draw,
    render: window.AsteroidRender,
    input,
    setNetworkMode,
    onInput(fn) {
        if (!networkMode) networkMode = {};
        networkMode.onInput = typeof fn === 'function' ? fn : null;
    }
};
window.addEventListener('voyager:pilot', (event) => {
    const detail = event && event.detail;
    if (detail && typeof game.setPilot === 'function') game.setPilot(detail);
});
window.asteroidReady = true;
window.dispatchEvent(new CustomEvent('asteroid:ready', { detail: { game } }));
requestAnimationFrame(frame);

},{"./audio":3,"./diagnostics":6,"./game":8,"./input":9,"./render/assets":15,"./render/battleCard":17,"./render/cardMath":18,"./render/fx":21,"./render/hud":22,"./render/overview":23,"./render/post":25,"./render/pov":26,"./render/projection":27,"./render/screens":28,"./render/shapes":29}],2:[function(require,module,exports){
const { range } = require('./rng');

const WORLD_WIDTH = 800;
let nextId = 1;

function makeShape(rng) {
    const points = 9 + Math.floor(rng() * 4);
    return Array.from({ length: points }, () => range(rng, 0.72, 1.12));
}

class Asteroid {
    constructor({ x, y, size, vx = 0, vy = 0, hp, shooter = false, rng, fireCooldown, id }) {
        this.id = id === undefined ? nextId++ : id;
        this.x = x;
        this.y = y;
        this.size = size;
        this.vx = vx;
        this.vy = vy;
        this.maxHp = hp || Math.max(1, Math.ceil(size / 14));
        this.hp = this.maxHp;
        this.shooter = shooter;
        this.fireCooldown = fireCooldown === undefined ? range(rng || (() => 0.5), 0.5, 2.5) : fireCooldown;
        this.rotation = range(rng || (() => 0.5), 0, Math.PI * 2);
        this.spin = range(rng || (() => 0.5), -0.8, 0.8);
        this.shape = makeShape(rng || (() => 0.5));
        this.active = false;
        this.phaseRock = false;
        this.phaseActive = false;
        this.phaseClock = 0;
        this.orbiting = false;
        this.fragment = false;
        this.missed = false;
        this.flash = 0;
    }

    update(dt) {
        this.rotation += this.spin * dt;
        if (this.phaseRock) { this.phaseClock += dt; this.phaseActive = this.phaseClock % 1.8 > 1.2; }
        if (this.orbiting && this.active) { this.orbitAngle += this.orbitSpeed * dt; this.x = this.orbitCenterX + Math.cos(this.orbitAngle) * this.orbitRadius; this.y = this.orbitCenterY + Math.sin(this.orbitAngle) * this.orbitRadius; }
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

    breakApart(rng = (() => 0.5)) {
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

},{"./rng":31}],3:[function(require,module,exports){
// Synthesized 8-bit-meets-arcade sound effects (WebAudio only, no files).
// The AudioContext is created lazily on the first key press (autoplay rules).
const { normalizeEvent } = require('./render/events');

const NOTE = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12);

function createAudio({ onError = error => console.error('Voyager audio:', error) } = {}) {
    let context = null;
    let master = null;
    let noiseBuffer = null;
    let muted = false;
    let futureMusic = false;
    let futureNodes = [];
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

    function setSector2(enabled) {
        const active = Boolean(enabled);
        if (active === futureMusic) return;
        if (active) {
            const ctx = ensureContext();
            if (!ctx || !master) return;
            futureMusic = true;
            const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 620;
            const droneGain = ctx.createGain(); droneGain.gain.value = 0.012;
            const first = ctx.createOscillator(); first.type = 'sawtooth'; first.frequency.value = 55;
            const second = ctx.createOscillator(); second.type = 'triangle'; second.frequency.value = 164.81;
            const shimmer = ctx.createOscillator(); shimmer.type = 'sine'; shimmer.frequency.value = 0.17;
            const depth = ctx.createGain(); depth.gain.value = 240;
            shimmer.connect(depth).connect(filter.frequency);
            first.connect(filter); second.connect(filter); filter.connect(droneGain).connect(master);
            first.start(); second.start(); shimmer.start();
            futureNodes = [first, second, shimmer];
        } else {
            futureMusic = false;
            futureNodes.forEach((node) => { try { node.stop(); } catch (error) { /* Already stopped. */ } });
            futureNodes = [];
        }
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
        },
        nova: () => {
            noise({ duration: 0.48, volume: 0.34, from: 5000, to: 70, q: 1.4 });
            tone({ frequency: 190, endFrequency: 28, duration: 0.72, type: 'sine', volume: 0.38 });
            tone({ frequency: 880, endFrequency: 120, duration: 0.42, type: 'sawtooth', volume: 0.12, filter: { from: 2800, to: 100, q: 5 } });
        },
        prism: () => {
            [0, 5, 9, 14].forEach((note, i) => tone({ frequency: NOTE(note + 24), endFrequency: NOTE(note + 36), duration: 0.18, type: i % 2 ? 'triangle' : 'sine', volume: 0.065, delay: i * 0.018 }));
            noise({ duration: 0.12, volume: 0.07, from: 9000, to: 2500, type: 'highpass' });
        },
        singularity: () => {
            tone({ frequency: 880, endFrequency: 24, duration: 0.5, type: 'sine', volume: 0.28, vibrato: 15 });
            tone({ frequency: 360, endFrequency: 32, duration: 0.44, type: 'sawtooth', volume: 0.14, filter: { from: 2400, to: 40, q: 9 } });
            noise({ duration: 0.34, volume: 0.13, from: 800, to: 50, type: 'lowpass', q: 4 });
        }
    };

    const sounds = {
        shot: (e) => {
            if (throttle('shot', 0.035)) (LASERS[e.weapon] || LASERS.blaster)();
        },
        chargeStart: () => {
            tone({ frequency: 140, endFrequency: 980, duration: 1.15, type: 'sawtooth', volume: 0.12, filter: { from: 500, to: 4200, q: 3 }, vibrato: 9 });
            tone({ frequency: 70, endFrequency: 490, duration: 1.15, type: 'sine', volume: 0.08, delay: 0.04, vibrato: 5 });
        },
        chargeRelease: (e) => {
            const charge = Math.max(0, Math.min(1, Number(e.charge) || 0));
            tone({ frequency: 850 + charge * 450, endFrequency: 90, duration: 0.3 + charge * 0.45, type: 'sawtooth', volume: 0.15 + charge * 0.08, filter: { from: 4400, to: 90, q: 5 } });
            if (charge > 0.7) LASERS.nova();
        },
        novaBlast: (e) => { LASERS.nova(); if (Number(e.charge) > 0.75) explosion(54, true); },
        vaultSpawned: () => {
            tone({ frequency: 460, endFrequency: 220, duration: 0.4, type: 'sawtooth', volume: 0.1, vibrato: 6 });
            tone({ frequency: 620, endFrequency: 300, duration: 0.48, type: 'triangle', volume: 0.07, delay: 0.12 });
            noise({ duration: 0.3, volume: 0.08, from: 1100, to: 350, type: 'bandpass', q: 4, delay: 0.1 });
        },
        guardDestroyed: () => { explosion(22, true); arpeggio([12, 19], { step: 0.04, type: 'triangle', volume: 0.045 }); },
        supporterCaptured: () => {
            arpeggio([3, 7, 10, 15, 19, 22, 27, 31], { step: 0.075, type: 'sine', volume: 0.11, length: 0.3 });
            arpeggio([-9, -2, 3, 10, 15], { step: 0.15, type: 'triangle', volume: 0.1, length: 0.42 });
            noise({ duration: 1.15, volume: 0.12, from: 8000, to: 1800, type: 'highpass', delay: 0.35 });
        },
        warpStart: () => {
            noise({ duration: 1.35, volume: 0.28, from: 7000, to: 180, type: 'bandpass', q: 0.8 });
            tone({ frequency: 88, endFrequency: 1400, duration: 1.25, type: 'sawtooth', volume: 0.13, filter: { from: 150, to: 5000, q: 3 }, vibrato: 18 });
        },
        warpEnd: () => arpeggio([0, 7, 12, 19, 24, 31], { step: 0.065, type: 'triangle', volume: 0.09, length: 0.2 }),
        sectorUnlocked: () => arpeggio([0, 7, 12, 19, 24, 31], { step: 0.08, type: 'sine', volume: 0.08, length: 0.24 }),
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
            if (ctx && ctx.state === 'suspended') void ctx.resume().catch(onError);
        },
        toggleMute() {
            muted = !muted;
            if (master) master.gain.value = muted ? 0 : 0.9;
            return muted;
        },
        get muted() {
            return muted;
        },
        setSector2,
        play(events, game = null) {
            if (!ready()) return;
            const future = Number(game && game.level && game.level.number) >= 11;
            for (const raw of events) {
                const event = normalizeEvent(raw);
                const sound = sounds[event.type];
                if (!sound) continue;
                try {
                    sound(event);
                    if (future && ['enemyShot', 'explode', 'shot', 'hit'].includes(event.type) && throttle(`future:${event.type}`, 0.06)) {
                        const base = event.type === 'enemyShot' ? 110 : event.type === 'explode' ? 38 : event.type === 'hit' ? 660 : 1320;
                        tone({ frequency: base, endFrequency: event.type === 'explode' ? 30 : base * 2.4, duration: 0.16, type: 'sawtooth', volume: 0.035, filter: { from: 5000, to: 160, q: 4 }, vibrato: 12 });
                    }
                } catch (error) {
                    onError(error);
                }
            }
        }
    };
}

module.exports = { createAudio };

},{"./render/events":19}],4:[function(require,module,exports){
// World-space projectile. `y` is forward distance along the level.
class Bullet {
    constructor({ x, y, vx = 0, vy = 0, size = 3, damage = 1, pierce = false, life = 1.4, owner = 'player', color = '#fff', radius = 0, maxRadius = 0, age = 0, playerIndex = 0, ownerWeapon = null }) {
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
        this.radius = radius;
        this.maxRadius = maxRadius || radius;
        this.age = age;
        this.playerIndex = playerIndex;
        this.ownerWeapon = ownerWeapon;
        this.hits = pierce ? new Set() : null;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        this.age += dt;
        if (this.maxRadius > 0) this.radius = Math.min(this.maxRadius, this.radius + dt * this.maxRadius * 2.5);
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
    const radius = (obj1.size || 0) + (obj1.radius || 0) + (obj2.size || 0);
    return radius > 0 && dx * dx + dy * dy < radius * radius;
}

module.exports = checkCollision;
},{}],6:[function(require,module,exports){
const RULESET = require('./ruleset');
const KEY = 'voyager.diagnostics.v1';
const LIMIT = 40;

function redact(value) {
    return String(value || '').replace(/https?:\/\/[^\s)]+/g, url => url.split(/[?#]/)[0])
        .replace(/0x[\da-f]{40,}/gi, '[redacted]')
        .replace(/(bearer\s+|(?:token|secret|jwt|apiKey|mac)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
        .slice(0, 1800);
}

function createDiagnostics({ storage, snapshot = () => ({}), notify = () => {}, now = () => Date.now() } = {}) {
    let entries = [];
    let storageError = storage ? null : 'Browser storage unavailable';
    try {
        const saved = storage?.getItem(KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) entries = parsed.slice(-LIMIT).map(item => ({
                at: Number(item.at) || 0, kind: redact(item.kind), message: redact(item.message), stack: redact(item.stack),
                ...Object.fromEntries(['level', 'particles', 'rocks', 'bullets', 'width', 'height', 'dpr', 'elapsedMs', 'quality']
                    .filter(key => Number.isFinite(item[key])).map(key => [key, item[key]])),
                ...Object.fromEntries(['state', 'difficulty', 'view'].filter(key => typeof item[key] === 'string').map(key => [key, redact(item[key])]))
            }));
        }
    } catch (error) { storageError = redact(error.message); }
    const report = () => ({
        schema: 'voyager-diagnostics/1', build: 'flash-recovery-1', ruleset: RULESET,
        browser: typeof navigator === 'undefined' ? 'unavailable' : redact(navigator.userAgent),
        storageError, entries: entries.map(entry => ({ ...entry }))
    });
    function record(kind, error, details = {}) {
        const message = redact(error?.message || error);
        const previous = entries.at(-1);
        const at = now();
        if (previous?.kind === kind && previous.message === message && at - previous.at < 5000) return;
        entries.push({ at, kind: redact(kind), message, stack: redact(error?.stack), ...snapshot(), ...details });
        entries = entries.slice(-LIMIT);
        try { storage?.setItem(KEY, JSON.stringify(entries)); }
        catch (failure) { storageError = redact(failure.message); }
        notify(report());
    }
    return { record, report };
}

module.exports = { createDiagnostics, redact, KEY, LIMIT };

},{"./ruleset":32}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
const checkCollision = require('./collision');
const Spaceship = require('./spaceship');
const Bullet = require('./bullet');
const { createRng, range } = require('./rng');
const { getLevel, LEVEL_COUNT, TOTAL_LEVEL_COUNT } = require('./levels');
const { populateLevel } = require('./levelLayout');
const { WEAPONS, applyWeaponPickup, downgradeWeapon, fireWeapon } = require('./weapons');
const { DIFFICULTY_IDS, isDifficulty, getDifficulty, stepDifficulty } = require('./difficulty');
const { LevelTracker, createTotals, mergeTotals, buildLevelRecord } = require('./stats');
const inputLog = require('./inputlog');
const RULESET = require('./ruleset');
const { scaleForPlayers, createPlayerStats, awardScore, canEndLevel } = require('./multiplayer');
const { chooseVaultLevel, createVault, markGuardDestroyed } = require('./vault');
const { COLLECTION, MARATHON_PRIZE, PERFECT_PRIZES, PILOT_BONUS } = require('./prizes');
const {
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    MAX_WINS,
    loadSave,
    mergeStoredSave,
    persistSave,
    validateSave
} = require('./save');

const ACTIVATION_DISTANCE = 900;
const FIRE_RANGE = { min: 80, max: 700 };
const LEVEL_INTRO_TIME = 2.5;
const LEVEL_COMPLETE_TIME = 3.5;
const RESPAWN_TIME = 1.8;
const FIXED_STEP = 1 / 60;
const WARP_TIME = 2.2;
const MAX_PARTICLES = 256;

const clone = (value) => JSON.parse(JSON.stringify(value));

function defaultSeedSource() {
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
        const value = new Uint32Array(1);
        globalThis.crypto.getRandomValues(value);
        return value[0];
    }
    return Math.floor(Math.random() * 0x100000000) >>> 0;
}

class Game {
    constructor({ storage = null, now = () => Date.now(), seed = null, seedSource = defaultSeedSource, idFn } = {}) {
        this.storage = storage;
        this.now = now;
        if (typeof seedSource !== 'function') throw new TypeError('seedSource must be a function.');
        this.seedSource = seedSource;
        this.initialSeed = Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed >>> 0 : null;
        this.seed = this.initialSeed ?? 0;
        this.initialSeedPending = this.initialSeed !== null;
        this.nextRunSeed = null;
        this.nextRunTicket = null;
        this.runTicket = null;
        this.idCounter = 0;
        this.idFn = idFn || (() => `${this.seed.toString(36)}${(++this.idCounter).toString(36).padStart(4, '0')}`);
        this.accumulator = 0;
        this.simTime = 0;
        this.runElapsed = 0;
        this.runStartedAt = null;
        this.runFrames = [];
        this.runCaptures = [];
        this.runRecords = [];
        this.vaultTiersSpawned = [];
        this.pilot = { address: null, isPilot: false };
        this.playerCount = 1;
        this.mode = 'coop';
        this.playerStats = createPlayerStats(1);
        this.ships = [];
        this.sector2Level = null;
        this.save = loadSave(storage);
        this.selectedDifficulty = this.save.progress.lastDifficulty;
        this.difficulty = this.selectedDifficulty;
        this.selectedLevel = 1;
        this.runStats = createTotals();
        this.tracker = new LevelTracker();
        this.lastRecord = null;
        this.view = 'overview';
        this.state = 'title';
        this.events = [];
        this.particles = [];
        this.cosmeticRng = createRng((this.seed ^ 0x9e3779b9) >>> 0);
        this.time = 0;
        this.score = 0;
        this.levelStartScore = 0;
        this.ship = new Spaceship();
        this.ships = [this.ship];
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
        this.selectedLevel = 1;
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

    setNextRunSeed(seed, ticket) {
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Run seed must be an unsigned 32-bit integer.');
        this.nextRunSeed = seed >>> 0;
        this.nextRunTicket = ticket === undefined ? null : clone(ticket);
    }

    startCampaign(levelNumber = 1, difficulty = this.selectedDifficulty, seed) {
        getLevel(levelNumber, difficulty);
        const difficultyId = getDifficulty(difficulty).id;
        if (levelNumber > LEVEL_COUNT && (difficultyId === 'cadet' || !this.pilot.isPilot || !this.save.progress.byDifficulty[difficultyId].sector2Unlocked)) throw new Error('Sector II is locked for this difficulty or pilot.');
        this.finishAttempt('abandoned');
        this.difficulty = difficultyId;
        this.selectedDifficulty = this.difficulty;
        this.save.progress.lastDifficulty = this.difficulty;
        if (seed !== undefined) {
            if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Run seed must be an unsigned 32-bit integer.');
            this.seed = seed >>> 0;
            this.runTicket = null;
            this.nextRunSeed = null;
            this.nextRunTicket = null;
            this.initialSeedPending = false;
        } else if (this.nextRunSeed !== null) {
            this.seed = this.nextRunSeed;
            this.runTicket = this.nextRunTicket;
            this.nextRunSeed = null;
            this.nextRunTicket = null;
            this.initialSeedPending = false;
        } else if (this.initialSeedPending) {
            this.seed = this.initialSeed;
            this.runTicket = null;
            this.initialSeedPending = false;
        } else {
            const generatedSeed = this.seedSource();
            if (!Number.isInteger(generatedSeed) || generatedSeed < 0 || generatedSeed > 0xffffffff) throw new RangeError('seedSource must return an unsigned 32-bit integer.');
            this.seed = generatedSeed >>> 0;
            this.runTicket = null;
        }
        this.runStartedAt = this.now();
        this.runElapsed = 0;
        this.idCounter = 0;
        this.runId = `${this.seed.toString(16)}-${this.runStartedAt.toString(36)}`;
        this.runStartLevel = levelNumber;
        this.runFrames = [];
        this.runCaptures = [];
        this.runRecords = [];
        this.vaultTiersSpawned = [];
        this.sector2Level = null;
        this.score = 0;
        this.runStats = createTotals();
        this.runStats.campaignsStarted = 1;
        this.save.lifetime.campaignsStarted += 1;
        this.ship = this.createShip();
        this.ships = [this.ship];
        this.playerStats = createPlayerStats(this.playerCount);
        if (this.playerCount > 1) this.setPlayers(this.playerCount, { mode: this.mode });
        if (this.difficulty !== 'cadet' && this.pilot.isPilot) {
            const spawnRng = createRng((this.seed ^ 0xa53c9e17) >>> 0);
            this.sector2Level = levelNumber <= 10 ? chooseVaultLevel(1, spawnRng) : null;
            this.sector2VaultLevel = chooseVaultLevel(2, spawnRng);
        }
        this.cosmeticRng = createRng((this.seed ^ 0x9e3779b9) >>> 0);
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
        this.level = { ...level };
        if (!this.runStartLevel) this.runStartLevel = levelNumber;
        this.rng = createRng((this.seed ^ Math.imul(levelNumber, 0x9e3779b1)) >>> 0);
        this.resetWorld();
        const layout = populateLevel(this.level, createRng(this.level.seed));
        this.asteroids = layout.asteroids;
        this.pickups = layout.pickups;
        this.tracker = new LevelTracker();
        this.tracker.spawned(this.asteroids.length);
        this.levelStartedAt = this.recordNow();
        const { lives, weapon } = this.ship;
        this.ship.reset();
        this.ship.lives = lives;
        this.ship.weapon = weapon;
        this.ship.y = this.ship.offset;
        this.ship.invulnerable = LEVEL_INTRO_TIME;
        for (let i = 1; i < this.ships.length; i++) {
            const current = this.ships[i];
            const savedLives = current.lives; const savedWeapon = current.weapon;
            current.reset(); current.lives = savedLives; current.weapon = savedWeapon;
            current.scale = scaleForPlayers(this.playerCount); current.size = current.baseSize * current.scale;
            current.x = 400 + (i - (this.playerCount - 1) / 2) * Math.min(42, 320 / this.playerCount);
            current.y = current.offset; current.invulnerable = LEVEL_INTRO_TIME;
        }
        this.levelStartScore = this.score;
        this.particles = [];
        this.vault = null;
        if (this.difficulty !== 'cadet' && this.pilot.isPilot) {
            const tier = this.sector2Level === levelNumber ? 1 : this.sector2VaultLevel === levelNumber ? 2 : 0;
            const eligible = tier > 0 && !this.vaultTiersSpawned.includes(tier);
            if (eligible) {
                const vaultRng = createRng((this.seed ^ (tier === 1 ? 0x7f4a7c15 : 0x94d049bb)) >>> 0);
                this.vault = createVault(tier, levelNumber, vaultRng);
                this.vaultTiersSpawned.push(tier);
                this.asteroids = this.asteroids.filter((rock) => Math.hypot(rock.x - this.vault.x, rock.y - this.vault.y) > 260);
                this.asteroids.push(...this.vault.guards);
                this.tracker.spawned(this.vault.guards.length);
                this.vault.spawned = true;
                this.emit('vaultSpawned', { tier, x: this.vault.x, y: this.vault.y });
            }
        }
        this.state = 'playing';
        this.emit('levelStart', { level: levelNumber });
    }

    retryLevel() {
        this.startCampaign(1, this.difficulty);
    }

    setPilot({ address = null, isPilot = false } = {}) {
        this.pilot = { address, isPilot: Boolean(isPilot && address) };
        return { ...this.pilot };
    }

    setPlayers(count, { mode = 'coop' } = {}) {
        if (!['coop', 'versus'].includes(mode)) throw new RangeError(`Unknown multiplayer mode: ${mode}`);
        const scale = scaleForPlayers(count);
        this.playerCount = count;
        this.mode = mode;
        const previous = this.ships || [this.ship];
        const previousCount = previous.length;
        this.ships = Array.from({ length: count }, (_, index) => {
            const ship = index < previous.length ? previous[index] : this.createShip();
            ship.scale = scale;
            ship.size = ship.baseSize * scale;
            ship.x = 400 + (index - (count - 1) / 2) * Math.min(42, 320 / count);
            ship.y = this.scrollY + ship.offset;
            return ship;
        });
        this.ship = this.ships[0];
        this.playerStats = createPlayerStats(count);
        for (let index = previousCount; index < count; index++) this.emit('playerJoined', { index, mode });
        for (let index = count; index < previousCount; index++) this.emit('playerLeft', { index });
        return this.ships;
    }

    getRunLog() {
        return { runId: this.runId || `${this.seed.toString(16)}-unstarted`, ruleset: RULESET, seed: this.seed, difficulty: this.difficulty, startLevel: this.runStartLevel || 1, players: this.playerCount, mode: this.mode, pilot: { ...this.pilot }, ticket: this.runTicket == null ? null : clone(this.runTicket), frames: inputLog.encode(this.runFrames), startedAt: this.runStartedAt == null ? null : new Date(this.runStartedAt).toISOString(), version: 1 };
    }

    serialize() {
        const plain = (value) => JSON.parse(JSON.stringify(value));
        return plain({ version: 1, seed: this.seed, state: this.state, difficulty: this.difficulty, level: this.level, scrollY: this.scrollY, time: this.time, score: this.score, view: this.view, ship: this.ship, ships: this.ships, stateTimer: this.stateTimer, levelTime: this.levelTime, asteroids: this.asteroids, pickups: this.pickups, playerBullets: this.playerBullets.map((b) => ({ ...b, hits: b.hits ? [...b.hits] : null })), enemyBullets: this.enemyBullets, vault: this.vault ?? null, runCaptures: this.runCaptures, playerStats: this.playerStats, mode: this.mode });
    }

    applySnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.version !== 1) throw new TypeError('Invalid game snapshot.');
        const fields = ['seed', 'state', 'difficulty', 'level', 'scrollY', 'time', 'score', 'view', 'stateTimer', 'levelTime', 'asteroids', 'pickups', 'enemyBullets', 'runCaptures', 'playerStats', 'mode'];
        for (const key of fields) {
            if (snapshot[key] !== undefined && snapshot[key] !== null) this[key] = clone(snapshot[key]);
        }
        this.vault = snapshot.vault == null ? null : clone(snapshot.vault);
        this.asteroids = this.asteroids || [];
        this.pickups = this.pickups || [];
        this.enemyBullets = this.enemyBullets || [];
        this.runCaptures = this.runCaptures || [];
        const snapshotShips = Array.isArray(snapshot.ships) ? snapshot.ships : snapshot.ship ? [snapshot.ship] : null;
        if (snapshotShips && snapshotShips.length) this.ships = clone(snapshotShips);
        if (!this.ships || !this.ships.length) this.ships = [this.ship];
        this.ship = this.ships[0];
        this.playerCount = this.ships.length;
        this.playerStats = this.playerStats || createPlayerStats(this.playerCount);
        this.playerBullets = (Array.isArray(snapshot.playerBullets) ? snapshot.playerBullets : []).map((bullet) => Object.assign(new Bullet(bullet), bullet, { hits: bullet.hits ? new Set(bullet.hits) : null }));
        return this;
    }

    static fromSnapshot(snapshot) { return new Game().applySnapshot(snapshot); }

    static replay({ seed = 0, difficulty = 'cadet', startLevel = 1, players = 1, pilot = null, frames = [], runId = null, startedAt = null, mode: replayMode = 'coop' } = {}) {
        const baseTime = startedAt ? Date.parse(startedAt) : Date.UTC(2020, 0, 1);
        if (!Number.isFinite(baseTime)) throw new TypeError('Replay start time is invalid.');
        const game = new Game({ seed, now: () => baseTime });
        if (pilot) game.setPilot(pilot);
        const playerCount = typeof players === 'number' ? players : Array.isArray(players) ? players.length : (players.count || 1);
        const mode = typeof players === 'object' && players.mode ? players.mode : replayMode;
        if (playerCount > 1) game.setPlayers(playerCount, { mode });
        game.startCampaign(startLevel, difficulty, seed);
        if (runId) game.runId = runId;
        const expanded = inputLog.decode(frames);
        for (const inputs of expanded) game.step(inputs);
        return game.summary();
    }

    recordNow() { return this.runStartedAt == null ? this.now() : this.runStartedAt + this.runElapsed * 1000; }

    summary() {
        return { runId: this.runId, seed: this.seed, difficulty: this.difficulty, state: this.state, level: this.level.number, score: this.score, records: clone(this.runRecords), captures: clone(this.runCaptures), survivors: this.ships.filter((ship) => ship.lives > 0).length, ships: this.ships.map((ship) => ({ x: ship.x, y: ship.y, power: ship.power, lives: ship.lives, weapon: { ...ship.weapon } })), playerStats: clone(this.playerStats), runStats: clone(this.runStats) };
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
                break;
            case 'difficultyPrev':
            case 'difficultyNext':
                if (this.state === 'title') this.setDifficulty(stepDifficulty(this.selectedDifficulty, action === 'difficultyPrev' ? -1 : 1));
                break;
            case 'confirm':
                if (this.state === 'title') this.startCampaign(1);
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
        this.selectedLevel = 1;
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
        if (!Number.isFinite(dt) || dt < 0) return;
        this.accumulator += dt;
        const inputs = Array.isArray(input) ? input : [input];
        while (this.accumulator + 1e-3 >= FIXED_STEP) {
            this.accumulator = Math.max(0, this.accumulator - FIXED_STEP);
            this.step(inputs);
        }
    }

    step(inputs = []) {
        if (!['playing', 'dying', 'levelComplete', 'warping'].includes(this.state)) {
            this.time += FIXED_STEP;
            this.updateParticles(FIXED_STEP);
            return this;
        }
        const frame = Array.from({ length: this.playerCount }, (_, index) =>
            inputLog.decodeInput(inputLog.encodeInput(inputs[index] || {})));
        this.runFrames.push(frame.map((input) => ({ ...input })));
        this.time += FIXED_STEP;
        this.simTime += FIXED_STEP;
        if (this.runId) this.runElapsed += FIXED_STEP;
        this._fixedUpdate(FIXED_STEP, frame);
        return this;
    }

    _fixedUpdate(dt, inputs = []) {
        const input = inputs[0] || {};
        this.updateParticles(dt);
        if (this.state === 'warping') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                this.emit('warpEnd', { level: 11 });
                this.startLevel(11);
            }
            return;
        }
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
            for (let index = 0; index < this.ships.length; index++) {
                const current = this.ships[index];
                const controls = inputs[index] || {};
                if (current.lives <= 0) continue;
                if (current.respawnTimer > 0) {
                    current.respawnTimer = Math.max(0, current.respawnTimer - dt);
                    if (current.respawnTimer === 0) { current.power = current.maxPower; current.invulnerable = 2.5; this.emit('respawn', { player: index }); }
                    continue;
                }
                current.update(dt, controls, this.scrollY);
                this.updatePlayerFire(current, controls, index, dt);
            }
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

        if (this.state === 'playing') {
            if (this.playerCount === 1 && this.scrollY >= this.level.length) this.completeLevel();
            else if (this.playerCount > 1) {
                const gatePlayers = this.ships.map((ship, index) => {
                    const reachedGate = ship.lives > 0 && ship.y >= this.level.length;
                    if (this.playerStats[index]) this.playerStats[index].reachedGate = reachedGate;
                    return { alive: ship.lives > 0, reachedGate };
                });
                if (canEndLevel(gatePlayers, this.mode)) this.completeLevel();
            }
        }
    }

    updatePlayerFire(ship, input, playerIndex, dt) {
        if (input.weaponNext && !ship.weaponNextWasDown) {
            ship.weaponTiers = ship.weaponTiers || {};
            ship.weaponTiers[ship.weapon.type] = ship.weapon.tier;
            const types = Object.keys(WEAPONS).filter((type) =>
                this.level.number > LEVEL_COUNT || !['prism', 'singularity'].includes(type));
            const type = types[(types.indexOf(ship.weapon.type) + 1) % types.length];
            ship.weapon = { type, tier: ship.weaponTiers[type] || 1 };
            ship.cooldown = 0;
            ship.charge = 0;
            ship.wasFiring = false;
            ship.suppressChargeUntilRelease = false;
            this.emit('weaponChanged', { player: playerIndex, weapon: { ...ship.weapon } });
        }
        ship.weaponNextWasDown = Boolean(input.weaponNext);
        const charged = ['nova', 'singularity'].includes(ship.weapon.type);
        // B/LT special force-releases an active charge; otherwise it grants a brief shield (8s cooldown).
        const specialPressed = Boolean(input.special && !ship.specialWasDown);
        ship.specialWasDown = Boolean(input.special);
        if (specialPressed && charged && ship.charge > 0) {
            const charge = ship.charge;
            this.emit('chargeRelease', { player: playerIndex, charge, weapon: ship.weapon.type, forced: true });
            this.firePlayerWeapon(ship, playerIndex, charge);
            ship.charge = 0;
            ship.wasFiring = false;
            ship.suppressChargeUntilRelease = Boolean(input.fire);
        } else if (specialPressed && ship.specialCooldown <= 0) {
            ship.shield = Math.max(ship.shield, 2);
            ship.specialCooldown = 8;
            this.emit('specialUsed', { player: playerIndex, type: 'shield', duration: 2 });
        }
        if (ship.specialCooldown > 0) ship.specialCooldown = Math.max(0, ship.specialCooldown - dt);
        const suppressedCharge = Boolean(ship.suppressChargeUntilRelease);
        if (suppressedCharge) {
            if (!input.fire) { ship.suppressChargeUntilRelease = false; ship.wasFiring = false; }
            else ship.wasFiring = true;
        } else if (charged) {
            const maxCharge = 1.2 / (1 + (ship.weapon.tier - 1) * 0.2);
            if (input.fire) {
                if (!ship.wasFiring) this.emit('chargeStart', { player: playerIndex, weapon: ship.weapon.type });
                ship.charge = Math.min(1, ship.charge + dt / maxCharge);
            } else if (ship.wasFiring) {
                this.emit('chargeRelease', { player: playerIndex, charge: ship.charge, weapon: ship.weapon.type });
                this.firePlayerWeapon(ship, playerIndex, ship.charge);
                ship.charge = 0;
            }
            ship.wasFiring = Boolean(input.fire);
        } else if (input.fire && ship.cooldown <= 0) this.firePlayerWeapon(ship, playerIndex);
    }

    firePlayerWeapon(ship = this.ship, playerIndex = 0, charge = 0) {
        const shot = fireWeapon(ship.weapon, ship, this.level.scrollSpeed, charge);
        for (const bullet of shot.bullets) { bullet.playerIndex = playerIndex; bullet.ownerWeapon = ship.weapon.type; }
        this.playerBullets.push(...shot.bullets);
        ship.cooldown = shot.cooldown;
        this.tracker.shot(ship.weapon.type, shot.bullets.length);
        this.playerStats[playerIndex].shotsFired += shot.bullets.length;
        this.emit('shot', { weapon: ship.weapon.type, player: playerIndex, charge });
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
                asteroid.fireCooldown = this.level.fireInterval * range(this.rng, asteroid.vaultGuard ? 3.1 : 0.7, asteroid.vaultGuard ? 4.2 : 1.3);
            }
        }
    }

    fireEnemyBullet(asteroid) {
        const ship = this.ship;
        const aimError = this.level.aimError + (asteroid.vaultGuard ? 0.38 : 0);
        const angle = Math.atan2(ship.x - asteroid.x, ship.y - asteroid.y) + range(this.rng, -1, 1) * aimError;
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
        const buckets = new Map();
        let maxSize = 0;
        this.asteroids.forEach((rock, index) => {
            if (rock.hp <= 0) return;
            maxSize = Math.max(maxSize, rock.size);
            const cell = Math.floor(rock.y / 128);
            if (!buckets.has(cell)) buckets.set(cell, []);
            buckets.get(cell).push(index);
        });
        const candidates = (bullet, radius) => {
            const indices = [];
            const first = Math.floor((bullet.y - radius) / 128);
            const last = Math.floor((bullet.y + radius) / 128);
            for (let cell = first; cell <= last; cell++) {
                if (buckets.has(cell)) indices.push(...buckets.get(cell));
            }
            // Preserve first-hit and piercing order from the deterministic world array.
            return indices.sort((a, b) => a - b);
        };
        for (const bullet of this.playerBullets) {
            if (!bullet.alive) continue;
            if (bullet.ownerWeapon === 'singularity') {
                for (const index of candidates(bullet, 220)) {
                    const rock = this.asteroids[index];
                    if (rock.hp <= 0) continue;
                    const dx = bullet.x - rock.x; const dy = bullet.y - rock.y; const distance = Math.hypot(dx, dy);
                    if (distance > 220 || distance === 0) continue;
                    const pull = (220 - distance) * 0.18; rock.vx += dx / distance * pull * FIXED_STEP; rock.vy += dy / distance * pull * FIXED_STEP;
                }
            }
            for (const index of candidates(bullet, (bullet.size || 0) + (bullet.radius || 0) + maxSize)) {
                const asteroid = this.asteroids[index];
                if (asteroid.hp <= 0 || asteroid.phaseActive || (bullet.hits && bullet.hits.has(asteroid.id))) continue;
                if (!checkCollision(bullet, asteroid)) continue;
                if (bullet.hits) bullet.hits.add(asteroid.id);
                else bullet.life = 0;
                if (!bullet.scored) {
                    bullet.scored = true;
                    this.tracker.hit();
                    const player = this.playerStats[bullet.playerIndex || 0];
                    if (player) player.hits += 1;
                }
                if (asteroid.takeHit(bullet.damage)) {
                    asteroid.lastPlayerIndex = bullet.playerIndex || 0;
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
        if (asteroid.vaultGuard && markGuardDestroyed(this.vault, asteroid)) this.emit('guardDestroyed', { tier: asteroid.vaultTier, kind: asteroid.kind, x: asteroid.x, y: asteroid.y });
        if (awardPoints) {
            const base = asteroid.shooter ? 150 : 50 + asteroid.maxHp * 25;
            const points = Math.round(base * (1 + (this.level.number - 1) * 0.1) * this.scoreMultiplier);
            const scorerIndex = asteroid.lastPlayerIndex || 0;
            const scorer = this.playerStats[scorerIndex];
            if (scorer) { scorer.kills += 1; if (this.mode === 'versus') scorer.score += points; }
            if (this.mode === 'coop') { this.score += points; awardScore(this.playerStats, scorerIndex, points, 'coop'); }
            else if (scorerIndex === 0) this.score = scorer.score;
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
        const ships = this.ships;
        for (let index = 0; index < ships.length; index++) {
            const ship = ships[index];
            if (ship.lives <= 0) continue;
            for (const bullet of this.enemyBullets) {
                if (!bullet.alive || !checkCollision(bullet, ship)) continue;
                bullet.life = 0;
                bullet.struckShip = true;
                this.damageShip(bullet.damage, bullet.x, bullet.y, ship, index);
                if (this.playerCount === 1 && this.state !== 'playing') return;
            }
            for (const asteroid of this.asteroids) {
                if (asteroid.hp <= 0 || asteroid.phaseActive || !checkCollision(asteroid, ship)) continue;
                this.tracker.collision();
                const fragments = this.destroyAsteroid(asteroid, ship.shield > 0);
                this.asteroids.push(...fragments);
                this.damageShip((30 + asteroid.size) * (this.level.ramDamageMultiplier ?? 1), asteroid.x, asteroid.y, ship, index);
                if (this.playerCount === 1 && this.state !== 'playing') return;
            }
            for (const pickup of this.pickups) {
                if (pickup.collected || !checkCollision(pickup, ship)) continue;
                pickup.collected = true;
                this.collectPickup(pickup, ship, index);
            }
            if (this.vault && !this.vault.captured && !this.vault.shielded && checkCollision(this.vault, ship)) this.captureVault(index);
        }
        if (this.playerCount > 1 && this.ships.every((ship) => ship.lives <= 0)) {
            this.state = 'gameOver'; this.finishAttempt('failed'); this.emit('gameOver');
        }
    }

    captureVault(playerIndex = 0) {
        if (!this.vault || this.vault.captured || this.vault.shielded) return false;
        this.vault.captured = true;
        const capture = { tier: this.vault.tier, prize: { ...this.vault.prize }, level: this.level.number, at: new Date(this.recordNow()).toISOString() };
        this.runCaptures.push(capture);
        for (const ship of this.ships) ship.power = ship.maxPower;
        this.emit('supporterCaptured', { ...capture, player: playerIndex });
        if (capture.tier === 1) {
            this.save.progress.byDifficulty[this.difficulty].sector2Unlocked = true;
            this.save.progress.byDifficulty[this.difficulty].unlocked = Math.max(this.save.progress.byDifficulty[this.difficulty].unlocked, 11);
            this.emit('sectorUnlocked', { sector: 2, difficulty: this.difficulty });
            this.saveProgress();
        }
        return true;
    }

    damageShip(amount, x, y, targetShip = this.ship, playerIndex = 0) {
        const ship = targetShip;
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
        if (ship.power <= 0) this.destroyShip(ship, playerIndex);
    }

    destroyShip(ship = this.ship, playerIndex = 0) {
        const shipIndex = this.ships.indexOf(ship);
        if (this.playerCount > 1) {
            ship.lives -= 1; ship.power = 0; ship.respawnTimer = ship.lives > 0 ? RESPAWN_TIME : 0;
            if (this.playerStats[shipIndex]) { this.playerStats[shipIndex].livesLost += 1; this.playerStats[shipIndex].alive = ship.lives > 0; }
            this.emit('playerDied', { index: shipIndex, lives: ship.lives });
            if (this.ships.every((entry) => entry.lives <= 0)) { this.state = 'gameOver'; this.finishAttempt('failed'); this.emit('gameOver'); }
            return;
        }
        ship.lives -= 1;
        this.tracker.lifeLost();
        if (this.playerStats[playerIndex]) this.playerStats[playerIndex].livesLost += 1;
        this.emit('playerDied', { index: playerIndex, lives: ship.lives });
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
        ship.weaponTiers = ship.weaponTiers || {};
        const previousWeapon = ship.weapon.type;
        ship.weapon = downgradeWeapon(ship.weapon);
        delete ship.weaponTiers[previousWeapon];
        ship.weaponTiers[ship.weapon.type] = ship.weapon.tier;
        ship.invulnerable = 2.5;
        ship.x = 400;
        ship.offset = 90;
        ship.y = this.scrollY + ship.offset;
        this.enemyBullets = this.enemyBullets.filter((bullet) => Math.abs(bullet.y - ship.y) > 300);
        this.state = 'playing';
        this.emit('respawn');
    }

    collectPickup(pickup, targetShip = this.ship, playerIndex = 0) {
        const ship = targetShip;
        if (pickup.type === 'power') {
            ship.power = Math.min(ship.maxPower, ship.power + (this.level.powerRestore ?? 40));
        } else if (pickup.type === 'life') {
            ship.lives += 1;
        } else if (pickup.type === 'shield') {
            ship.shield = this.level.shieldTime ?? 7;
        } else {
            ship.weapon = applyWeaponPickup(ship.weapon, pickup.type);
            ship.weaponTiers = ship.weaponTiers || {};
            ship.weaponTiers[ship.weapon.type] = ship.weapon.tier;
        }
        this.tracker.pickup(pickup.type, pickup.x, pickup.y);
        if (this.playerStats[playerIndex]) this.playerStats[playerIndex].pickups = (this.playerStats[playerIndex].pickups || 0) + 1;
        const pickupPoints = Math.round(100 * this.scoreMultiplier);
        if (this.mode === 'versus') {
            if (this.playerStats[playerIndex]) this.playerStats[playerIndex].score += pickupPoints;
            if (playerIndex === 0) this.score = this.playerStats[0].score;
        } else {
            this.score += pickupPoints; awardScore(this.playerStats, playerIndex, pickupPoints, 'coop');
        }
        this.spawnExplosion(pickup.x, pickup.y, '#9effa8', 14);
        this.emit('pickup', { pickupType: pickup.type, x: pickup.x, y: pickup.y, player: playerIndex, lives: ship.lives, weapon: { ...ship.weapon } });
    }

    completeLevel() {
        if (this.state !== 'playing' || this.tracker.finalized) return;
        this.levelBonus = Math.round((Math.round(this.ship.power) * 10 + this.level.number * 250) * this.scoreMultiplier);
        if (this.mode === 'versus') {
            for (const player of this.playerStats) if (player.alive) player.score += this.levelBonus;
            this.score = this.playerStats[0] ? this.playerStats[0].score : 0;
        } else { this.score += this.levelBonus; awardScore(this.playerStats, 0, this.levelBonus, 'coop'); }
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
            completedAt: this.recordNow(),
            durationSec: this.levelTime,
            captures: this.runCaptures.filter((capture) => capture.level === this.level.number),
            idFn: this.idFn
        });
        const marathon = this.playerCount === 1 && this.level.number === TOTAL_LEVEL_COUNT && this.difficulty !== 'cadet' &&
            this.pilot.isPilot && this.runStartLevel === 1 && this.runRecords.length === TOTAL_LEVEL_COUNT - 1 &&
            this.runRecords.every((entry, index) => entry.level === index + 1 && entry.difficulty === this.difficulty);
        if (marathon) {
            const awards = [];
            if (this.difficulty === 'ace') awards.push({
                kind: 'marathon-completion', tier: 2, level: TOTAL_LEVEL_COUNT,
                at: record.completedAt, prize: { ...MARATHON_PRIZE, nftContract: COLLECTION }
            });
            const perfect = this.runStats.livesLost === 0 &&
                [1, 2].every((tier) => this.runCaptures.some((capture) => capture.tier === tier && !capture.kind));
            if (perfect) awards.push({
                kind: `perfect-${this.difficulty}`, tier: 2, level: TOTAL_LEVEL_COUNT,
                at: record.completedAt, prize: { ...PERFECT_PRIZES[this.difficulty], nftContract: COLLECTION },
                ...(this.difficulty === 'pilot' ? { bonus: { ...PILOT_BONUS } } : {})
            });
            this.runCaptures.push(...awards);
            record.marathon = {
                schema: 'voyager-marathon/1', runId: this.runId, seed: this.seed,
                startLevel: 1, finalLevel: TOTAL_LEVEL_COUNT, difficulty: this.difficulty, perfect,
                startedAt: new Date(this.runStartedAt).toISOString(), completedAt: record.completedAt,
                totals: { ...clone(this.runStats), victories: this.runStats.victories + 1 },
                levels: [...this.runRecords, record].map((entry) => ({
                    recordId: entry.id, level: entry.level, startedAt: entry.startedAt,
                    completedAt: entry.completedAt, durationSec: entry.durationSec,
                    score: clone(entry.score), ship: clone(entry.ship), stats: clone(entry.stats)
                })),
                awards: this.runCaptures.map((capture) => ({
                    kind: capture.kind || 'guarded-pickup', level: capture.level, tier: capture.tier,
                    earnedAt: capture.at, chainId: 8453, nftContract: COLLECTION,
                    tokenId: String(capture.prize.tokenId), project: capture.prize.project,
                    metadataURI: capture.prize.metadataURI, quantity: 1,
                    ...(capture.bonus ? { bonus: clone(capture.bonus) } : {}),
                    status: 'earned-awaiting-referee-and-funded-claim'
                }))
            };
            for (const award of awards) this.emit('supporterCaptured', { ...clone(award), player: 0 });
        }
        this.lastRecord = record;
        this.runRecords.push(clone(record));
        this.save.wins.push(record);
        if (this.save.wins.length > MAX_WINS) this.save.wins.splice(0, this.save.wins.length - MAX_WINS);
        this.emit('levelRecord', { record: clone(record) });
        const next = this.level.number + 1;
        if (next > TOTAL_LEVEL_COUNT || (this.level.number === LEVEL_COUNT && !progress.sector2Unlocked)) {
            this.state = 'victory';
            this.runStats.victories += 1;
            this.save.lifetime.victories += 1;
            this.saveProgress();
            this.emit('victory');
            return;
        }
        if (next <= LEVEL_COUNT || progress.sector2Unlocked) progress.unlocked = Math.max(progress.unlocked, next);
        this.saveProgress();
        if (this.level.number === LEVEL_COUNT && progress.sector2Unlocked && this.difficulty !== 'cadet' && this.pilot.isPilot) {
            this.state = 'warping';
            this.stateTimer = WARP_TIME;
            this.emit('warpStart', { from: 10, to: 11 });
        } else {
            this.state = 'levelComplete';
            this.stateTimer = LEVEL_COMPLETE_TIME;
            this.emit('levelComplete', { level: this.level.number });
        }
    }

    advanceLevel() {
        if (this.state !== 'levelComplete') return;
        const ship = this.ship;
        for (const current of this.ships) current.power = current.maxPower;
        this.startLevel(this.level.number + 1);
    }

    saveProgress() {
        const progress = this.save.progress.byDifficulty[this.difficulty];
        progress.highScore = Math.max(progress.highScore, this.score);
        // Keep progress written by other tabs/builds instead of overwriting it.
        this.save = mergeStoredSave(this.storage, this.save);
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
        if (this.state === 'title') this.selectedLevel = 1;
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
        const available = Math.min(count, MAX_PARTICLES - this.particles.length);
        for (let i = 0; i < available; i++) {
            const angle = this.cosmeticRng() * Math.PI * 2;
            const speed = 30 + this.cosmeticRng() * 140;
            const life = 0.4 + this.cosmeticRng() * 0.6;
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
Game.FIXED_STEP = FIXED_STEP;
Game.MAX_PARTICLES = MAX_PARTICLES;
Game.groupPlayers = require('./multiplayer').groupPlayers;

module.exports = Game;

},{"./bullet":4,"./collision":5,"./difficulty":7,"./inputlog":10,"./levelLayout":11,"./levels":12,"./multiplayer":13,"./prizes":14,"./rng":31,"./ruleset":32,"./save":33,"./spaceship":34,"./stats":35,"./vault":36,"./weapons":37}],9:[function(require,module,exports){
const ACTIONS = Object.freeze({
    start: 9,
    view: 3,
    viewAlt: 8,
    weaponNext: 2,
    special: 1,
    specialAlt: 6,
    fire: 0,
    fireAlt: 7
});
const MAX_PLAYERS = 5;
const DEADZONE = 0.2;

function axis(value) {
    const n = Number(value) || 0;
    if (Math.abs(n) <= DEADZONE) return 0;
    return Math.sign(n) * Math.min(1, (Math.abs(n) - DEADZONE) / (1 - DEADZONE));
}

function createInput({
    documentObject = typeof document === 'undefined' ? null : document,
    windowObject = typeof window === 'undefined' ? null : window,
    navigatorObject = typeof navigator === 'undefined' ? null : navigator,
    onAction = () => {},
    onToast = () => {},
    onPlayersChanged = () => {},
    onPlayerLeft = () => {},
    shouldIgnoreKeyboard = () => false,
    maxPlayers = MAX_PLAYERS
} = {}) {
    const keyState = { left: false, right: false, up: false, down: false, fire: false, special: false, weaponNext: false, view: false };
    const heldKeys = new Map();
    const virtualSources = new Map();
    const gamepads = new Map();
    const connected = new Map();
    const previousButtons = new Map();
    const slots = new Map();
    const cap = Math.max(1, Math.min(MAX_PLAYERS, Number(maxPlayers) || MAX_PLAYERS));
    let keyboardSlot = 0;
    let lastInputs = [];

    const keyActions = {
        ArrowLeft: 'left', a: 'left', A: 'left',
        ArrowRight: 'right', d: 'right', D: 'right',
        ArrowUp: 'up', w: 'up', W: 'up',
        ArrowDown: 'down', s: 'down', S: 'down',
        ' ': 'fire',
        b: 'special', B: 'special', Shift: 'special',
        e: 'weaponNext', E: 'weaponNext'
    };

    function updatePlayers() {
        const count = Math.min(cap, Math.max(1, slots.size + 1));
        onPlayersChanged(count, { mode: 'coop' });
    }

    function toast(message) {
        try { onToast(message); } catch (error) { /* UI callbacks must not break input polling. */ }
    }

    function identify(pad, index) {
        return pad && pad.id ? `${index}:${pad.id}` : String(index);
    }

    function connectedPad(pad, index) {
        if (!pad || pad.connected === false) return;
        const id = identify(pad, index);
        if (connected.has(index)) {
            connected.set(index, id);
            gamepads.set(index, pad);
            return;
        }
        connected.set(index, id);
        gamepads.set(index, pad);
        previousButtons.set(index, []);
        toast(`Controller ${connected.size} connected`);
    }

    function disconnectedPad(index, idHint) {
        const pad = gamepads.get(index);
        const id = idHint || identify(pad, index);
        const known = connected.delete(index) || Boolean(pad);
        gamepads.delete(index);
        previousButtons.delete(index);
        const slot = slots.get(index);
        if (slot !== undefined) {
            slots.delete(index);
            keyboardSlot = firstFreeSlot();
            onPlayerLeft(slot);
            updatePlayers();
        }
        if (known) toast(`Controller disconnected`);
    }

    function firstFreeSlot() {
        const used = new Set(slots.values());
        for (let i = 0; i < cap; i++) if (!used.has(i)) return i;
        return cap - 1;
    }

    function buttonPressed(buttons, index) {
        const button = buttons && buttons[index];
        return Boolean(button && (button.pressed || Number(button.value) > 0.5));
    }

    function pollGamepads(game = null) {
        if (navigatorObject && typeof navigatorObject.getGamepads === 'function') {
            let pads = [];
            try { pads = navigatorObject.getGamepads() || []; } catch (error) { pads = []; }
            const seen = new Set();
            Array.from(pads).forEach((pad, index) => {
                if (!pad || pad.connected === false) return;
                const id = identify(pad, index);
                seen.add(index);
                connectedPad(pad, index);
                const buttons = pad.buttons || [];
                const was = previousButtons.get(index) || [];
                const aDown = buttonPressed(buttons, ACTIONS.fire);
                if (aDown && !was[ACTIONS.fire] && !slots.has(index) && game && game.state === 'title' && slots.size + 1 < cap) {
                    const slot = firstFreeSlot();
                    slots.set(index, slot);
                    if (slot === keyboardSlot) keyboardSlot = firstFreeSlot();
                    toast(`Player ${slot + 1} joined`);
                    updatePlayers();
                }
                const joined = slots.has(index);
                const rising = (buttonIndex) => buttonPressed(buttons, buttonIndex) && !was[buttonIndex];
                if (joined && rising(ACTIONS.start)) onAction(game && game.state === 'title' ? 'confirm' : 'pause');
                if (joined && rising(ACTIONS.weaponNext) && game && game.state === 'title') onAction('modeNext');
                if (joined && (rising(ACTIONS.view) || rising(ACTIONS.viewAlt))) onAction('toggleView');
                previousButtons.set(index, buttons.map((button) => Boolean(button && (button.pressed || Number(button.value) > 0.5))));
                gamepads.set(index, pad);
            });
            for (const [index, id] of Array.from(connected.entries())) {
                if (!seen.has(index)) disconnectedPad(index, id);
            }
        }

        const count = Math.max(1, keyboardSlot + 1, ...Array.from(slots.values(), (slot) => slot + 1));
        const inputs = Array.from({ length: Math.min(cap, count) }, () => ({ left: false, right: false, up: false, down: false, fire: false, special: false, weaponNext: false, view: false, ax: 0, ay: 0 }));
        if (inputs[keyboardSlot]) Object.assign(inputs[keyboardSlot], keyState);
        for (const [source, entry] of virtualSources) {
            const controls = inputs[keyboardSlot];
            if (!controls) continue;
            for (const action of Object.keys(keyState)) {
                controls[action] = controls[action] || Boolean(entry.state[action]) || entry.pending.has(action);
            }
            controls.ax = Math.max(-1, Math.min(1, controls.ax + entry.state.ax));
            controls.ay = Math.max(-1, Math.min(1, controls.ay + entry.state.ay));
            entry.pending.clear();
            if (!Object.values(entry.state).some(Boolean)) virtualSources.delete(source);
        }

        for (const [index, slot] of slots) {
            if (!inputs[slot]) continue;
            const pad = gamepads.get(index);
            if (!pad) continue;
            const buttons = pad.buttons || [];
            const axes = pad.axes || [];
            const ax = axis(axes[0]);
            const ay = -axis(axes[1]);
            const left = buttonPressed(buttons, 14);
            const right = buttonPressed(buttons, 15);
            const up = buttonPressed(buttons, 12);
            const down = buttonPressed(buttons, 13);
            Object.assign(inputs[slot], {
                left, right, up, down, ax, ay,
                fire: buttonPressed(buttons, ACTIONS.fire) || buttonPressed(buttons, ACTIONS.fireAlt),
                special: buttonPressed(buttons, ACTIONS.special) || buttonPressed(buttons, ACTIONS.specialAlt),
                weaponNext: buttonPressed(buttons, ACTIONS.weaponNext),
                view: buttonPressed(buttons, ACTIONS.view) || buttonPressed(buttons, ACTIONS.viewAlt)
            });
        }
        lastInputs = inputs;
        return inputs;
    }

    function keydown(event) {
        if (!event || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
        if (shouldIgnoreKeyboard(event)) return;
        const action = keyActions[event.key];
        if (action) {
            heldKeys.set(event.code || String(event.key).toLowerCase(), action);
            keyState[action] = true;
        }
    }
    function keyup(event) {
        const action = event && keyActions[event.key];
        const token = event && (event.code || String(event.key).toLowerCase());
        const heldAction = heldKeys.get(token) || action;
        heldKeys.delete(token);
        if (heldAction) keyState[heldAction] = Array.from(heldKeys.values()).includes(heldAction);
    }
    function setVirtualState(source, state) {
        if (!state) { virtualSources.delete(source); return; }
        const previous = virtualSources.get(source);
        const pending = previous ? previous.pending : new Set();
        const next = { ax: 0, ay: 0 };
        for (const action of Object.keys(keyState)) {
            next[action] = Boolean(state[action]);
            // Preserve a tap shorter than one animation frame, but never latch steering.
            if (['fire', 'special', 'weaponNext'].includes(action) && next[action] && !previous?.state[action]) pending.add(action);
        }
        for (const axis of ['ax', 'ay']) next[axis] = Number.isFinite(state[axis]) ? Math.max(-1, Math.min(1, state[axis])) : 0;
        virtualSources.set(source, { state: next, pending });
    }
    function clear() {
        heldKeys.clear();
        virtualSources.clear();
        Object.keys(keyState).forEach((key) => { keyState[key] = false; });
    }
    const visibilityChanged = () => { if (documentObject.hidden) clear(); };
    const focusChanged = (event) => { if (shouldIgnoreKeyboard(event)) clear(); };

    if (documentObject && documentObject.addEventListener) {
        documentObject.addEventListener('keydown', keydown);
        documentObject.addEventListener('keyup', keyup);
        documentObject.addEventListener('visibilitychange', visibilityChanged);
        documentObject.addEventListener('focusin', focusChanged);
    }
    const handleConnect = (event) => {
        const pad = event && event.gamepad;
        if (pad) connectedPad(pad, pad.index);
    };
    const handleDisconnect = (event) => {
        const pad = event && event.gamepad;
        if (pad) disconnectedPad(pad.index, identify(pad, pad.index));
    };
    if (windowObject && windowObject.addEventListener) {
        windowObject.addEventListener('blur', clear);
        windowObject.addEventListener('gamepadconnected', handleConnect);
        windowObject.addEventListener('gamepaddisconnected', handleDisconnect);
    }

    return {
        poll: pollGamepads,
        getInputs: () => lastInputs,
        setVirtualState,
        clear,
        get players() { return Math.min(cap, Math.max(1, slots.size + 1)); },
        get keyboardSlot() { return keyboardSlot; },
        get assignments() { return new Map(slots); },
        destroy() {
            clear();
            if (documentObject && documentObject.removeEventListener) {
                documentObject.removeEventListener('keydown', keydown);
                documentObject.removeEventListener('keyup', keyup);
                documentObject.removeEventListener('visibilitychange', visibilityChanged);
                documentObject.removeEventListener('focusin', focusChanged);
            }
            if (windowObject && windowObject.removeEventListener) {
                windowObject.removeEventListener('blur', clear);
                windowObject.removeEventListener('gamepadconnected', handleConnect);
                windowObject.removeEventListener('gamepaddisconnected', handleDisconnect);
            }
        }
    };
}

module.exports = { createInput, axis, MAX_PLAYERS, DEADZONE, ACTIONS };

},{}],10:[function(require,module,exports){
const ACTIONS = ['left', 'right', 'up', 'down', 'fire', 'special', 'weaponNext', 'view'];
const MAX_RUN = 65535;

function encodeInput(input = {}) {
    let mask = 0;
    ACTIONS.forEach((action, index) => { if (input[action]) mask |= 1 << index; });
    const clampAxis = (value) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    return { mask, ax: Math.round(clampAxis(input.ax) * 127), ay: Math.round(clampAxis(input.ay) * 127) };
}

function decodeInput(encoded = {}) {
    const input = {};
    ACTIONS.forEach((action, index) => { input[action] = Boolean((encoded.mask || 0) & (1 << index)); });
    if (encoded.ax) input.ax = encoded.ax / 127;
    if (encoded.ay) input.ay = encoded.ay / 127;
    return input;
}

function sameFrame(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function encode(frames = []) {
    const runs = [];
    for (const frame of frames) {
        const encoded = (Array.isArray(frame) ? frame : [frame]).map(encodeInput);
        const last = runs[runs.length - 1];
        if (last && last[0] < MAX_RUN && sameFrame(last[1], encoded)) last[0] += 1;
        else runs.push([1, encoded]);
    }
    return { version: 1, frames: frames.length, players: runs[0] ? runs[0][1].length : 1, runs };
}

function decode(log) {
    if (Array.isArray(log)) return log.map((frame) => (Array.isArray(frame) ? frame : [frame]).map(decodeInput));
    if (!log || log.version !== 1 || !Array.isArray(log.runs)) throw new TypeError('Invalid input log.');
    const frames = [];
    for (const run of log.runs) {
        if (!Array.isArray(run) || !Number.isInteger(run[0]) || run[0] < 1 || !Array.isArray(run[1])) throw new TypeError('Invalid input log run.');
        const inputs = run[1].map(decodeInput);
        for (let i = 0; i < run[0]; i++) frames.push(inputs.map((input) => ({ ...input })));
    }
    if (log.frames !== undefined && frames.length !== log.frames) throw new RangeError('Input log frame count mismatch.');
    return frames;
}

module.exports = { ACTIONS, encode, decode, encodeInput, decodeInput };

},{}],11:[function(require,module,exports){
const Asteroid = require('./asteroid');
const { range, pick } = require('./rng');

const WORLD_WIDTH = Asteroid.WORLD_WIDTH;
const SAFE_START = 520;
const PICKUP_TYPES = ['spread', 'rapid', 'plasma', 'power', 'shield'];
const FUTURE_PICKUPS = ['nova', 'prism', 'singularity'];
const EXTRA_LIFE_LEVELS = [3, 7, 12, 16];

function scatterAsteroid(level, rng, y) {
    const size = range(rng, 14, 26 + level.number * 1.6);
    const moving = rng() < level.movingChance;
    const asteroid = new Asteroid({
        x: range(rng, 40, WORLD_WIDTH - 40),
        y,
        size,
        vx: moving ? range(rng, -1, 1) * level.driftSpeed : 0,
        vy: moving ? -rng() * level.approachSpeed : 0,
        shooter: rng() < level.shooterChance,
        hp: level.scatterHpBonus ? Math.max(1, Math.ceil(size / 14)) + level.scatterHpBonus : undefined,
        rng
    });
    if (level.futureSector) {
        asteroid.phaseRock = level.phaseRocks && rng() < 0.2;
        asteroid.orbiting = level.orbitingGuards && rng() < 0.18;
        asteroid.phaseActive = false;
        asteroid.phaseClock = range(rng, 0, 1.8);
        if (asteroid.orbiting) { asteroid.orbitCenterX = asteroid.x; asteroid.orbitCenterY = asteroid.y; asteroid.orbitAngle = range(rng, 0, Math.PI * 2); asteroid.orbitRadius = range(rng, 24, 70); asteroid.orbitSpeed = range(rng, 1.2, 2.4); }
    }
    return asteroid;
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
        const pickup = { x: range(rng, 120, WORLD_WIDTH - 120), y: y + 480, type: pick(rng, level.futureSector ? PICKUP_TYPES.concat(FUTURE_PICKUPS) : PICKUP_TYPES), size: 14 };
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

    if (EXTRA_LIFE_LEVELS.includes(level.number)) {
        pickups.push({ x: WORLD_WIDTH / 2, y: level.length * 0.6, type: 'life', size: 20 });
    }
    asteroids.sort((a, b) => a.y - b.y);
    pickups.sort((a, b) => a.y - b.y);
    return { asteroids, pickups };
}

module.exports = { populateLevel, PICKUP_TYPES, FUTURE_PICKUPS, EXTRA_LIFE_LEVELS, SAFE_START };

},{"./asteroid":2,"./rng":31}],12:[function(require,module,exports){
const { applyDifficulty } = require('./difficulty');

const LEVEL_COUNT = 10;
const TOTAL_LEVEL_COUNT = 20;

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

module.exports = { LEVEL_COUNT, TOTAL_LEVEL_COUNT, LEVEL_NAMES, getLevel, getBaseLevel };

},{"./difficulty":7}],13:[function(require,module,exports){
const MAX_PLAYERS = 5;
function scaleForPlayers(count) {
    if (!Number.isInteger(count) || count < 1 || count > MAX_PLAYERS) throw new RangeError('Player count must be between 1 and 5.');
    return count <= 2 ? 1 : count === 3 ? 0.8 : 0.7;
}
function groupPlayers(list, max = MAX_PLAYERS) {
    if (!Number.isInteger(max) || max < 1 || max > MAX_PLAYERS) throw new RangeError('Group size must be from 1 to 5.');
    const groups = [];
    for (let i = 0; i < list.length; i += max) groups.push(list.slice(i, i + max));
    return groups;
}
function createPlayerStats(count) {
    return Array.from({ length: count }, (_, index) => ({ index, score: 0, shotsFired: 0, hits: 0, kills: 0, livesLost: 0, alive: true, reachedGate: false }));
}
function awardScore(stats, index, points, mode = 'coop') {
    if (mode === 'versus') stats[index].score += points;
    else stats.forEach((player) => { player.score += points; });
    return stats;
}
function canEndLevel(players, mode) {
    const alive = players.filter((player) => player.alive);
    if (!alive.length) return true;
    return mode === 'coop' ? alive.some((player) => player.reachedGate) : alive.every((player) => player.reachedGate);
}
module.exports = { MAX_PLAYERS, scaleForPlayers, groupPlayers, createPlayerStats, awardScore, canEndLevel };

},{}],14:[function(require,module,exports){
const COLLECTION = '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B';
const ESCROW = '0x31b07b83e99A9bdF379bf40225b8A80d3804C89d';
const PRIZES = {
    1: [
        { project: 'DecentHead', version: '2.0.0', tokenId: 70, label: 'DecentHead v2.0.0 #70', metadataURI: 'ipfs://QmVGmpz63TS9XkTHMxf2sybHv5k9Vdoyr2Spi9QqZ4pzfj' },
        { project: 'DecentMarket', version: '0.3.1', tokenId: 71, label: 'DecentMarket v0.3.1 #71', metadataURI: 'ipfs://QmUR29d2NeRH94ceLDxHqDvDi4eNdSRTNM1wZ6UPDsvWqi' }
    ],
    2: [
        { project: 'DecentCalendar', version: '0.1.0', tokenId: 77, label: 'DecentCalendar v0.1.0 #77', metadataURI: 'ipfs://QmPqCy2g53t4BaffprtfjfM4L5imACB1nWZK63HyN9o3Tj' },
        { project: 'DecentPilgrimages', version: '0.1.1', tokenId: 78, label: 'DecentPilgrimages v0.1.1 #78', metadataURI: 'ipfs://QmNe9SYSyrZYV66X29Wp4hBLbCDpQDjnJsAJLDdAytALEN' },
        { project: 'DecentCanopy', version: '0.1.0', tokenId: 79, label: 'DecentCanopy v0.1.0 #79', metadataURI: 'ipfs://QmQqQtuSeab78F3pdBcMbvSopYZLa51zJ4JxcodQ2ugy9d' }
    ]
};
const MARATHON_PRIZE = {
    project: 'DecentVoyager', version: '1.0.0', tokenId: 80,
    label: 'DecentVoyager v1.0.0 #80',
    metadataURI: 'ipfs://QmacnQSJCxmqjWnMxDqhkLXCJv1zqp1EKoeF7nY782rGpe'
};
const PERFECT_PRIZES = {
    ace: { project: 'DecentBusking', version: '1.0.0', tokenId: 75, label: 'DecentBusking v1.0.0 #75', metadataURI: 'ipfs://QmZroFCEhaKoctVqW682Uzv5i6WWiQtuWvTAYkQBYfH6TD' },
    pilot: { project: 'BigNuten_Vanilla', version: '3.3.0', tokenId: 76, label: 'BigNuten_Vanilla v3.3.0 #76', metadataURI: 'ipfs://QmSrAwCU5p1ga3RzpuDHZxezsNjob76ZSFpRzCuG15yYqU' }
};
const PILOT_BONUS = { chainId: 8453, token: '0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736', symbol: 'BNUT', decimals: 18, amount: '100000000000000000000' };
module.exports = { COLLECTION, ESCROW, PRIZES, MARATHON_PRIZE, PERFECT_PRIZES, PILOT_BONUS };

},{}],15:[function(require,module,exports){
// Image preloader. Renderers ask for images by key and fall back to vector
// drawing while an image is missing, still loading or failed to load.
const BASE_URL = 'assets/game/';

const ROCK_KEYS = ['rock-1', 'rock-2', 'rock-3', 'rock-4', 'rock-5', 'rock-6', 'rock-7', 'rock-8'];
const FUTURE_ROCK_KEYS = ['future-rock-1', 'future-rock-2', 'future-rock-3', 'future-rock-4'];
const BACKDROP_KEYS = ['bg-galaxy', 'bg-royal', 'bg-2a', 'bg-tec', 'bg-zz'];
const SECTOR2_BACKDROP_KEYS = ['bg-sector2-lotus', 'bg-sector2-mars', 'bg-sector2-top'];
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
    'breathe-still': 'breathe-still.png',
    'white-lotus': 'white-lotus-clear.png',
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
    FUTURE_ROCK_KEYS,
    BACKDROP_KEYS,
    SECTOR2_BACKDROP_KEYS,
    BREATHE_FRAMES,
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

},{}],16:[function(require,module,exports){
// Per-level space backdrops: tinted gradient, a big Mandelblum "nebula"
// (screen-blended so its black matte vanishes) and pixel starfield parallax.
const { VIEW, MAX_VIEW_WIDTH } = require('./projection');
const { getImage, backdropKeyFor } = require('./assets');

const SECTOR2_TINTS = [
    ['#05051b', '#15103f'], ['#02141c', '#074b58'], ['#120522', '#3c145f']
];

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
    if (n >= 11) return SECTOR2_TINTS[(n - 11) % SECTOR2_TINTS.length];
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
    const stars = createStarfield(340, MAX_VIEW_WIDTH, VIEW.height, 11);
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
            if (star.x > VIEW.width) continue;
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

module.exports = { LEVEL_TINTS, SECTOR2_TINTS, levelTint, createStarfield, drawNebula, createOverviewBackground };

},{"./assets":15,"./projection":27}],17:[function(require,module,exports){
// Collectible "battle card" renderer: a deterministic image of one cleared level.
const { getImage, loadAssets, makeCanvas, ROCK_KEYS, FUTURE_ROCK_KEYS, backdropKeyFor, rockKeyFor } = require('./assets');
const { pixelText } = require('./font');
const { drawGlow, drawPickup, pixelSprite, SHIP_TOP, SHIP_PALETTE } = require('./shapes');
const { difficultyColor } = require('./hud');
const {
    hashString, createSeededRng, formatUtc, formatDuration, formatPercent,
    cardLayout, mapPoint, killRadius, levelLengthOf, sampleRecord
} = require('./cardMath');

const TITLE = 'DECENT VOYAGER \u00b7 Galactic Gauntlet';
const CARD_ACCENTS = ['#7fd7ff', '#5fffd0', '#9ff3ff', '#d8e4ef', '#ffd25c', '#7dff8c', '#ff8a2c', '#5fd9ff', '#5fffd0', '#fff4c8'];
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
        const img = getImage(num(record.level) >= 11 ? FUTURE_ROCK_KEYS[Math.floor(rng() * FUTURE_ROCK_KEYS.length)] : ROCK_KEYS[Math.floor(rng() * ROCK_KEYS.length)]);
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
    pixelText(ctx, TITLE, header.x, header.y + 30, { size: 24, color: '#7fd7ff' });
    const levelText = `LEVEL ${String(num(record.level, 1)).padStart(2, '0')}`;
    drawGlow(ctx, header.x + 150, header.y + 78, 260, accent, 0.35);
    pixelText(ctx, levelText, header.x, header.y + 96, { size: 60, color: '#fff4c8', outline: accent });
    pixelText(ctx, String(record.levelName || '').toUpperCase(), header.x, header.y + 138, { size: 30, color: accent });
    const captures = Array.isArray(record.captures) ? record.captures.length : (record.supporterCaptured || record.capture ? 1 : 0);
    const sector = num(record.level) >= 11 || record.sector === 2 ? 'SECTOR II · FAR FUTURE' : 'SECTOR I · GALACTIC GAUNTLET';
    const runBadges = `${sector}${captures ? `  ·  SUPPORTER CAPTURES ${captures}` : ''}`;
    pixelText(ctx, runBadges, header.x + header.w, header.y + 148, { size: 13, color: num(record.level) >= 11 ? '#67faff' : captures ? '#ffe65c' : '#9fb4c8', align: 'right' });
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
        ['MAX COMBO', `x${num(s.maxCombo)}`, '#d8e4ef'],
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
    const colors = { blaster: '#9ff3ff', spread: '#5fffd0', rapid: '#ffe65c', plasma: '#d8e4ef' };
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
        img.alt = `Decent Voyager battle card for level ${chosen.level}`;
        img.style.cssText = 'max-width:100vw;max-height:100vh;image-rendering:pixelated';
        tab.document.body.appendChild(img);
    }
    return canvas;
}

module.exports = { renderBattleCard, previewBattleCard, latestRecord };

},{"./assets":15,"./cardMath":18,"./font":20,"./hud":22,"./shapes":29}],18:[function(require,module,exports){
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
        game: 'Decent Voyager: Galactic Gauntlet',
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

},{}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
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
function pixelText(ctx, value, x, y, { size = 14, color = '#e8f6ff', align = 'left', outline = '#05030c', weight = 'bold', alpha = 1, scale = 1, crisp = false } = {}) {
    const str = String(value);
    if (!str) return 0;
    const entry = crisp ? null : rasterize(str, size, color, outline, weight);
    if (!entry) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.font = fontFor(size * scale, weight);
        ctx.textAlign = align;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = color;
        const width = ctx.measureText ? ctx.measureText(str).width : 0;
        ctx.fillText(str, x, y);
        ctx.restore();
        return width;
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

},{"./assets":15}],21:[function(require,module,exports){
// Client-side juice: explosions, debris, shockwaves, thruster trails, shield
// ripples, floating text, fireworks, screen shake, hit-stop and slow-mo.
// Driven purely by drained game events so game.js stays deterministic.
const { drawGlow } = require('./shapes');
const { pixelText } = require('./font');
const { VIEW } = require('./projection');
const { normalizeEvent } = require('./events');
const { getImage } = require('./assets');
const { drawSupporterToken } = require('./vault');

const MAX_WORLD_PARTICLES = 360;
const MAX_SCREEN_PARTICLES = 450;
const ROCK_COLORS = ['#7fffe0', '#ff8ae6', '#b9a8ff', '#ffffff', '#9ff3ff', '#ffe18a'];
const SHOOTER_COLORS = ['#ff5a1c', '#ff8a5c', '#ffd25c', '#ffffff', '#ff3a1c'];
const FIREWORK_COLORS = ['#3fb8ff', '#7fd7ff', '#7dff8c', '#ffe65c', '#d8e4ef', '#ffffff', '#ffb347'];
const PICKUP_COLORS = { spread: '#5fffd0', rapid: '#ffe65c', plasma: '#d8e4ef', power: '#7dff8c', shield: '#6fa8ff' };

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function pickupLabel(kind, weapon) {
    if (kind === 'life') return '+1 LIFE';
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
        kills: 0,
        captureTime: -1,
        captureTokenId: null,
        warpTime: -1,
        warpFrom: null,
        vaultAlarm: 0,
        charging: false,
        charge: 0
    };

    function addWorld(p) {
        if (world.length >= MAX_WORLD_PARTICLES) {
            if (['ring', 'flash', 'text'].includes(p.kind)) {
                const expendable = world.findIndex(item => ['debris', 'spark', 'thrust'].includes(item.kind));
                if (expendable >= 0) world[expendable] = p;
            }
            return;
        }
        world.push(p);
    }

    function addScreen(p) {
        if (screen.length >= MAX_SCREEN_PARTICLES) return;
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
            const eventShip = Array.isArray(game.ships) && game.ships[e.player] ? game.ships[e.player] : ship;
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
                            addWorld({ kind: 'debris', x: ship.x, y: ship.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 + drift, life: 0.6, maxLife: 0.6, size: 3, color: i % 2 ? '#7dff8c' : '#d8e4ef', drag: 2 });
                        }
                    }
                    break;
                }
                case 'asteroidMissed':
                    if (e.x !== undefined) floatText(e.x, e.y + 20, 'MISS', '#8a93a6', 0.8, 11);
                    break;
                case 'vaultSpawned':
                    state.vaultAlarm = 1.8;
                    state.flash = Math.max(state.flash, 0.18);
                    state.flashColor = '#ff4fa6';
                    floatText(e.x || ship.x, e.y || ship.y + 70, 'SUPPORTER VAULT', '#ff8ac4', 2, 15);
                    break;
                case 'guardDestroyed':
                    explosion(e.x || ship.x, e.y || ship.y, Number(e.size) || 24, true, drift);
                    break;
                case 'chargeStart':
                    state.charging = true;
                    state.charge = 0;
                    addWorld({ kind: 'ring', x: eventShip.x, y: eventShip.y, vx: 0, vy: drift, life: 1.2, maxLife: 1.2, radius: 24, grow: 80, color: '#b67aff' });
                    break;
                case 'chargeRelease':
                    state.charging = false;
                    state.charge = Math.max(0, Math.min(1, Number(e.charge) || 0));
                    state.flash = Math.max(state.flash, 0.18 + state.charge * 0.3);
                    state.flashColor = '#d6a1ff';
                    addWorld({ kind: 'ring', x: e.x ?? eventShip.x, y: e.y ?? eventShip.y, vx: 0, vy: drift, life: 0.85, maxLife: 0.85, radius: 18, grow: 220 + state.charge * 180, color: '#d6a1ff' });
                    break;
                case 'novaBlast':
                    addWorld({ kind: 'ring', x: e.x ?? eventShip.x, y: e.y ?? eventShip.y, vx: 0, vy: drift, life: 0.8, maxLife: 0.8, radius: 20, grow: Number(e.radius) || 260, color: '#f3bdff' });
                    addWorld({ kind: 'flash', x: e.x ?? eventShip.x, y: e.y ?? eventShip.y, vx: 0, vy: drift, life: 0.42, maxLife: 0.42, radius: 180, color: '#f3bdff' });
                    state.shake = Math.max(state.shake, 16);
                    break;
                case 'supporterCaptured':
                    state.captureTime = 0;
                    state.captureTokenId = e.prize && e.prize.tokenId !== undefined ? e.prize.tokenId : e.tokenId;
                    state.flash = 0.8;
                    state.flashColor = '#fff4c8';
                    state.celebrateTime = 0;
                    state.celebrateKind = 'supporter';
                    for (let i = 0; i < 10; i++) firework(VIEW.width / 2 + rand(-180, 180), VIEW.height / 2 + rand(-120, 120), FIREWORK_COLORS[i % FIREWORK_COLORS.length], 52);
                    break;
                case 'warpStart':
                    state.warpTime = 0;
                    state.warpFrom = e.from || null;
                    state.flash = Math.max(state.flash, 0.45);
                    state.flashColor = '#67faff';
                    break;
                case 'warpEnd':
                    state.warpTime = state.warpTime < 0 ? 1.7 : state.warpTime;
                    state.flash = Math.max(state.flash, 0.4);
                    state.flashColor = '#bafcff';
                    break;
                case 'sectorUnlocked':
                    floatText(ship.x, ship.y + 72, 'SECTOR II UNLOCKED', '#67faff', 2.4, 17);
                    break;
                case 'shot':
                    addWorld({ kind: 'flash', x: eventShip.x, y: eventShip.y + 16, vx: 0, vy: drift, life: 0.06, maxLife: 0.06, radius: 16, color: '#bff6ff' });
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
                        world.length = 0;
                        ripples.length = 0;
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
        state.vaultAlarm = Math.max(0, state.vaultAlarm - dt);
        if (state.captureTime >= 0) { state.captureTime += dt; if (state.captureTime > 4.2) state.captureTime = -1; }
        if (state.warpTime >= 0) { state.warpTime += dt; if (state.warpTime > 2.5) state.warpTime = -1; }
        if (game && game.ship) {
            const charge = game.charge ?? game.ship.charge ?? game.ship.chargeAmount ?? 0;
            state.charge = Math.max(0, Math.min(1, Number(charge) || 0));
            state.charging = Boolean(game.charging || game.ship.charging || state.charge > 0);
        }
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

        const expiredRockets = [];
        for (const p of screen) {
            p.life -= dt;
            if (p.gravity) p.vy += p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.kind === 'rocket' && p.life <= 0) expiredRockets.push(p);
        }
        for (let i = screen.length - 1; i >= 0; i--) if (screen[i].life <= 0) screen.splice(i, 1);
        for (const p of expiredRockets) firework(p.x, p.y, p.color, game && game.state === 'victory' ? 60 : 44);

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
                    ctx.fillStyle = p.kind === 'thrust' ? (t > 0.6 ? '#fff4c8' : t > 0.3 ? '#ffb347' : '#3fb8ff') : p.color;
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

    function drawScreen(ctx, game = null) {
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
        if (state.warpTime >= 0) {
            const t = Math.min(1, state.warpTime / 2.5);
            const cx = VIEW.width / 2; const cy = VIEW.height / 2;
            const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 10);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(3, 5, 28, ${0.38 + pulse * 0.16})`;
            ctx.fillRect(0, 0, VIEW.width, VIEW.height);
            for (let i = 0; i < 54; i++) {
                const angle = (i / 54) * Math.PI * 2 + t * 1.3;
                const inner = 20 + ((i * 47 + t * 840) % 320);
                const outer = inner + 50 + t * 430;
                ctx.strokeStyle = i % 3 === 0 ? '#fff4c8' : i % 2 ? '#67faff' : '#c16cff';
                ctx.globalAlpha = Math.max(0.1, 0.75 - inner / 850);
                ctx.lineWidth = i % 5 === 0 ? 3 : 1;
                ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
                ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer); ctx.stroke();
            }
            const image = getImage('bg-sector2-lotus');
            if (image) {
                const size = 180 + t * 550 + pulse * 90;
                ctx.globalAlpha = 0.2 + t * 0.38;
                ctx.translate(cx, cy); ctx.rotate(t * 3); ctx.drawImage(image, -size / 2, -size / 2, size, size);
            }
            ctx.restore();
            pixelText(ctx, t < 0.8 ? 'WARPING TO SECTOR II' : 'FAR FUTURE · ARRIVAL', cx, VIEW.height - 70, { size: 20, align: 'center', color: '#bafcff' });
        }
        if (state.captureTime >= 0) {
            const t = state.captureTime;
            const cx = VIEW.width / 2; const cy = VIEW.height / 2;
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 40; i++) {
                const angle = (i / 40) * Math.PI * 2 + t * (i % 2 ? 0.2 : -0.15);
                const inner = 45 + 15 * Math.sin(t * 11 + i);
                const reach = 200 + 260 * Math.min(1, t / 1.6) + 35 * Math.sin(t * 8 + i * 0.5);
                ctx.strokeStyle = i % 4 === 0 ? '#fff4c8' : i % 3 === 0 ? '#d8e4ef' : '#67faff';
                ctx.globalAlpha = Math.max(0, 0.75 - Math.max(0, t - 2.4) * 0.38);
                ctx.lineWidth = i % 5 === 0 ? 4 : 2;
                ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
                ctx.lineTo(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach); ctx.stroke();
            }
            ctx.restore();
            const size = 88 + 14 * Math.sin(t * 7);
            drawSupporterToken(ctx, state.captureTokenId, cx, cy - 20, size);
            ctx.fillStyle = 'rgba(2, 3, 12, 0.72)'; ctx.fillRect(cx - 220, cy + 56, 440, 42);
            pixelText(ctx, `SUPPORTER TOKEN CAPTURED${state.captureTokenId ? ` · #${state.captureTokenId}` : ''}`, cx, cy + 82, { size: 15, align: 'center', color: '#fff4c8' });
            if (game && game.level && game.level.number >= 10) pixelText(ctx, 'SECTOR II UNLOCKED', cx, cy + 124, { size: 12, align: 'center', color: '#67faff' });
        }
        if (state.vaultAlarm > 0) {
            ctx.save(); ctx.globalAlpha = (0.25 + 0.18 * Math.sin(state.time * 18)) * Math.min(1, state.vaultAlarm);
            ctx.fillStyle = '#ff174f'; ctx.fillRect(0, 0, VIEW.width, 8); ctx.fillRect(0, VIEW.height - 8, VIEW.width, 8);
            ctx.restore();
        }
        if (state.flash > 0) {
            ctx.globalAlpha = Math.min(0.2, state.flash);
            ctx.fillStyle = state.flashColor;
            ctx.fillRect(0, 0, VIEW.width, 6);
            ctx.fillRect(0, VIEW.height - 6, VIEW.width, 6);
            ctx.fillRect(0, 6, 6, VIEW.height - 12);
            ctx.fillRect(VIEW.width - 6, 6, 6, VIEW.height - 12);
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
        clear() {
            world.length = 0;
            screen.length = 0;
            ripples.length = 0;
            state.shake = 0;
            state.hitStop = 0;
            state.slowMo = 0;
            state.flash = 0;
        },
        get worldCount() {
            return world.length;
        },
        get screenCount() {
            return screen.length;
        }
    };
}

module.exports = { createFx, MAX_WORLD_PARTICLES, MAX_SCREEN_PARTICLES };

},{"./assets":15,"./events":19,"./font":20,"./projection":27,"./shapes":29,"./vault":30}],22:[function(require,module,exports){
const { VIEW } = require('./projection');
const { WEAPONS, MAX_TIER } = require('../weapons');
const { LEVEL_COUNT, TOTAL_LEVEL_COUNT } = require('../levels');
const { PICKUP_STYLE, SHIP_TOP, SHIP_PALETTE, pixelSprite, drawBreathe, drawGlow } = require('./shapes');
const { pixelText } = require('./font');
const { getPlayers, versusMode } = require('./players');

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

function panelBox(ctx, x, y, w, h, color = 'rgba(127, 215, 255, 0.55)', fill = 0.72) {
    ctx.fillStyle = `rgba(4, 6, 20, ${fill})`;
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
    const view = { score: 0, lastTime: null, combo: 0, comboPop: 0, power: 1, lastLevelKey: '', toast: '', toastUntil: 0 };

    function drawPlayers(ctx, game) {
        const players = getPlayers(game);
        if (players.length <= 1) return;
        players.forEach(({ player, ship, index, color, score }, i) => {
            const y = 14 + i * 29;
            const x = VIEW.width - 188;
            panelBox(ctx, x, y, 176, 27, color, 0.38);
            pixelText(ctx, `P${index + 1}`, x + 8, y + 15, { size: 11, color });
            const power = Math.max(0, Math.min(1, Number(ship.power) / Math.max(1, Number(ship.maxPower) || 100)));
            ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x + 37, y + 8, 74, 7);
            ctx.fillStyle = color; ctx.fillRect(x + 37, y + 8, 74 * power, 7);
            pixelText(ctx, `♥${Math.max(0, Number(ship.lives) || 0)}`, x + 120, y + 15, { size: 10, color: '#ffffff' });
            const playerScore = Number(player && player.score) || score || Number(game.playerStats && game.playerStats[index] && game.playerStats[index].score) || (index === 0 ? game.score : 0);
            const charge = Math.max(0, Math.min(1, Number(ship.charge) || 0));
            if (charge > 0) { ctx.fillStyle = color; ctx.fillRect(x + 37, y + 20, 74 * charge, 2); }
            if (versusMode(game)) pixelText(ctx, String(playerScore), x + 168, y + 15, { size: 11, color: '#ffe65c', align: 'right' });
        });
        if (versusMode(game)) pixelText(ctx, 'VERSUS · INDIVIDUAL SCORE', VIEW.width - 12, 14 + players.length * 29 + 10, { size: 9, color: '#d8e4ef', align: 'right' });
    }

    function drawToast(ctx) {
        if (!view.toast || Date.now() >= view.toastUntil) return;
        const alpha = Math.min(1, (view.toastUntil - Date.now()) / 300);
        panelBox(ctx, VIEW.width / 2 - 150, 14, 300, 26, '#7fd7ff', 0.45);
        pixelText(ctx, view.toast, VIEW.width / 2, 32, { size: 12, align: 'center', color: '#ffffff', alpha });
    }

    // One slim, see-through strip along the bottom edge keeps the play field clear.
    const STRIP_H = 24;

    function drawStrip(ctx, game, dt, opts) {
        const ship = game.ship || {};
        const time = game.time || 0;
        const y0 = VIEW.height - STRIP_H;
        const base = y0 + 16;
        ctx.save();
        const bg = ctx.createLinearGradient(0, y0 - 10, 0, VIEW.height);
        bg.addColorStop(0, 'rgba(4, 8, 22, 0)');
        bg.addColorStop(0.35, 'rgba(4, 8, 22, 0.34)');
        bg.addColorStop(1, 'rgba(4, 8, 22, 0.5)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, y0 - 10, VIEW.width, STRIP_H + 10);
        ctx.fillStyle = 'rgba(86, 237, 255, 0.18)';
        ctx.fillRect(0, y0, VIEW.width, 1);
        ctx.globalAlpha = 0.9;

        // Power (Breathe = re-up) with the drain ghost, then shield.
        let x = 10;
        const fraction = (Number(ship.power) || 0) / Math.max(1, Number(ship.maxPower) || 100);
        view.power += (fraction - view.power) * 0.15;
        drawBreathe(ctx, x + 8, y0 + 12, 7, time, 0.9);
        x += 20;
        const lit = litSegments(fraction);
        const ghost = litSegments(view.power);
        const low = fraction <= 0.3 && Math.floor(time * 5) % 2 === 0;
        const color = low ? '#ffffff' : powerColor(fraction);
        for (let i = 0; i < POWER_SEGMENTS; i++) {
            ctx.fillStyle = i < lit ? color : i < ghost ? 'rgba(255, 90, 60, 0.55)' : 'rgba(255,255,255,0.1)';
            ctx.fillRect(x + i * 7, y0 + 8, 5, 9);
        }
        x += POWER_SEGMENTS * 7 + 4;
        x += pixelText(ctx, String(Math.round(Number(ship.power) || 0)), x, base, { size: 10, color: powerColor(fraction) }) + 10;
        if (ship.shield > 0) {
            ctx.fillStyle = PICKUP_STYLE.shield.color;
            ctx.fillRect(30, y0 + 19, (POWER_SEGMENTS * 7 - 2) * Math.min(1, ship.shield / 7), 2);
            x += pixelText(ctx, `◇${ship.shield.toFixed(1)}`, x, base, { size: 10, color: PICKUP_STYLE.shield.color }) + 10;
        }

        // Weapon, tier pips and the charge meter for Nova-class weapons.
        const weapon = ship.weapon || { type: 'blaster', tier: 1 };
        const spec = WEAPONS[weapon.type] || WEAPONS.blaster;
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x - 6, y0 + 6, 1, 12);
        x += pixelText(ctx, spec.name.toUpperCase(), x, base, { size: 10, color: spec.color }) + 6;
        for (let i = 0; i < MAX_TIER; i++) {
            ctx.fillStyle = i < (weapon.tier || 1) ? spec.color : 'rgba(255,255,255,0.12)';
            ctx.fillRect(x + i * 9, y0 + 9, 7, 7);
        }
        x += MAX_TIER * 9 + 6;
        const charge = Math.max(0, Math.min(1, Number(game.charge ?? ship.charge ?? 0) || 0));
        if (charge > 0 || game.charging || ship.charging) {
            ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y0 + 10, 64, 5);
            ctx.fillStyle = spec.color; ctx.fillRect(x, y0 + 10, 64 * charge, 5);
            drawGlow(ctx, x + 64 * charge, y0 + 12, 10 + charge * 16, spec.color, 0.25 + charge * 0.5);
            x += 70;
            x += pixelText(ctx, `${Math.round(charge * 100)}%`, x, base, { size: 9, color: '#ffffff' }) + 6;
        }

        // Centre: level, progress and difficulty.
        const sector = game.level.number >= 11 ? 'II · ' : '';
        const label = `${sector}LV ${game.level.number}/${game.level.number > LEVEL_COUNT ? TOTAL_LEVEL_COUNT : LEVEL_COUNT} ${game.level.name.toUpperCase()}`;
        const cx = Math.max(x + 150, VIEW.width / 2);
        pixelText(ctx, label, cx - 4, base, { size: 10, align: 'right', color: '#c9d6e3' });
        const pw = 110;
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(cx + 4, y0 + 10, pw, 4);
        ctx.fillStyle = '#7dff8c'; ctx.fillRect(cx + 4, y0 + 10, pw * Math.max(0, Math.min(1, game.levelProgress || 0)), 4);
        if (game.difficulty) pixelText(ctx, difficultyName(game).toUpperCase(), cx + pw + 10, base, { size: 9, color: difficultyColor(game.difficulty) });

        // Right: view flags, lives, combo, score.
        let rx = VIEW.width - 10;
        const flags = `${opts.muted ? 'M:OFF ' : ''}${opts.crt ? 'CRT ' : ''}[V] ${game.view === 'pov' ? 'POV' : 'MAP'}`;
        rx -= pixelText(ctx, flags, rx, base, { size: 9, color: '#9fb4c8', align: 'right' }) + 10;
        const sprite = pixelSprite('lives', SHIP_TOP, SHIP_PALETTE, 1);
        const lives = Math.max(0, Number(ship.lives) || 0);
        for (let i = 0; i < lives; i++) {
            rx -= 15;
            if (sprite) { ctx.imageSmoothingEnabled = false; ctx.drawImage(sprite, rx, y0 + 4, 13, sprite.height * 13 / sprite.width); }
        }
        rx -= 10;
        const combo = Number(game.combo) || 0;
        if (combo > view.combo) view.comboPop = 1;
        view.combo = combo;
        view.comboPop = Math.max(0, view.comboPop - dt * 3);
        if (combo >= 2) {
            const hue = 150 + 45 * Math.sin(time * 4);
            const scale = 1 + view.comboPop * 0.4;
            drawGlow(ctx, rx - 20, y0 + 12, 22 * scale, `hsl(${hue}, 100%, 60%)`, 0.2);
            rx -= pixelText(ctx, `x${combo}`, rx, base, { size: Math.round(12 * scale), color: `hsl(${hue}, 100%, 70%)`, align: 'right' }) + 10;
        }
        view.score = rollUp(view.score, game.score, dt);
        const rolling = Math.round(view.score) !== game.score;
        rx -= pixelText(ctx, String(Math.round(view.score)).padStart(7, '0'), rx, base, { size: 12, color: rolling ? '#ffe65c' : '#e8f6ff', align: 'right' }) + 6;
        pixelText(ctx, 'SCORE', rx, base, { size: 9, color: '#9fb4c8', align: 'right' });
        ctx.restore();
    }

    function drawRadar(ctx, game) {
        const width = 120;
        const height = 150;
        const x = VIEW.width - width - 12;
        const crew = getPlayers(game).length;
        const y = crew > 1 ? 14 + crew * 29 + 18 : 14;
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
        ctx.globalAlpha = 0.75;
        panelBox(ctx, x, y, width, height, 'rgba(127, 215, 255, 0.4)', 0.3);
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
        drawToast(ctx);
        if (game.state === 'title') {
            view.score = 0;
            return;
        }
        drawStrip(ctx, game, dt, opts);
        drawPlayers(ctx, game);
        if (game.view === 'pov') drawRadar(ctx, game);
    }

    return { drawHud, view, setToast(message, duration = 2200) { view.toast = String(message); view.toastUntil = Date.now() + duration; } };
}

module.exports = { createHud, rollUp, litSegments, difficultyColor, difficultyName, panelBox, POWER_SEGMENTS, DIFFICULTY_COLORS };

},{"../levels":12,"../weapons":37,"./font":20,"./players":24,"./projection":27,"./shapes":29}],23:[function(require,module,exports){
const { VIEW, projectOverview } = require('./projection');
const { drawAsteroid, drawPickup, drawShipTop, drawPlayerBullet, drawEnemyBullet, drawGlow } = require('./shapes');
const { createOverviewBackground } = require('./background');
const { getImage } = require('./assets');
const { pixelText } = require('./font');
const { getPlayers, playerScale } = require('./players');
const { drawVault } = require('./vault');

function drawJumpGate(ctx, y, time, sector2 = false) {
    const gate = getImage(sector2 ? 'gate-sector2' : 'gate') || getImage('gate');
    const gateColor = sector2 ? '#67faff' : '#7dff8c';
    if (gate) {
        const size = 220 + 10 * Math.sin(time * 2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.85;
        ctx.drawImage(gate, VIEW.width / 2 - size / 2, y - size / 2, size, size);
        ctx.restore();
    }
    drawGlow(ctx, VIEW.width / 2, y, 140, gateColor, 0.25 + 0.1 * Math.sin(time * 4));
    ctx.save();
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -time * 40;
    ctx.strokeStyle = gateColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW.width, y);
    ctx.stroke();
    ctx.restore();
    pixelText(ctx, '>> JUMP GATE <<', 12, y - 10, { size: 14, color: '#7dff8c' });
}

// On wide screens the 800-wide flight lane sits centred; dim the margins and mark its edges.
function drawLaneRails(ctx, scrollY, time) {
    const left = VIEW.offsetX;
    const right = VIEW.offsetX + 800;
    ctx.save();
    ctx.fillStyle = 'rgba(2, 4, 12, 0.38)';
    ctx.fillRect(0, 0, left, VIEW.height);
    ctx.fillRect(right, 0, VIEW.width - right, VIEW.height);
    ctx.globalCompositeOperation = 'lighter';
    for (const x of [left, right]) {
        const g = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
        g.addColorStop(0, 'rgba(86, 237, 255, 0)');
        g.addColorStop(0.5, 'rgba(86, 237, 255, 0.16)');
        g.addColorStop(1, 'rgba(86, 237, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 10, 0, 20, VIEW.height);
        ctx.fillStyle = 'rgba(125, 255, 140, 0.45)';
        const phase = ((scrollY || 0) + time * 30) % 40;
        for (let y = phase - 40; y < VIEW.height; y += 40) ctx.fillRect(x - 1, y, 2, 14);
    }
    ctx.restore();
}

function createOverviewRenderer() {
    const background = createOverviewBackground();

    return function renderOverview(ctx, game, fx) {
        const { scrollY } = game;
        const time = game.time || 0;
        background(ctx, game);
        if (VIEW.offsetX > 0) drawLaneRails(ctx, scrollY, time);

        const exit = projectOverview({ x: 0, y: game.level.length }, scrollY);
        if (exit.y > -160 && exit.y < VIEW.height + 160) drawJumpGate(ctx, exit.y, time, game.level.number >= 11);

        const onScreen = (p, margin) => p.y > -margin && p.y < VIEW.height + margin;

        for (const pickup of (game.pickups || [])) {
            const p = projectOverview(pickup, scrollY);
            if (onScreen(p, 40)) drawPickup(ctx, pickup, p.x, p.y, pickup.size, time);
        }

        for (const asteroid of (game.asteroids || [])) {
            const p = projectOverview(asteroid, scrollY);
            if (onScreen(p, 80)) drawAsteroid(ctx, asteroid, p.x, p.y, asteroid.size, 1, time, game.level.number >= 11);
        }
        drawVault(ctx, game, scrollY, time, projectOverview, onScreen);

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
            const players = getPlayers(game);
            players.forEach(({ ship, index, color }) => {
                const p = projectOverview(ship, scrollY);
                if (!onScreen(p, 40)) return;
                const size = playerScale(players.length, ship);
                ctx.save(); ctx.translate(p.x, p.y); ctx.scale(size, size);
                const charge = Math.max(0, Math.min(1, Number(ship.charge) || 0));
                if (charge > 0) drawGlow(ctx, 0, 0, 48 + charge * 48, ship.weapon && ship.weapon.type === 'singularity' ? '#b67aff' : '#d6a1ff', 0.45 + charge * 0.45);
                drawGlow(ctx, 0, 0, 34, color, 0.42);
                drawShipTop(ctx, ship, 0, 0, time, fx ? fx.ripples : []);
                ctx.fillStyle = color; ctx.fillRect(-6, 6, 12, 4); ctx.fillRect(-10, 11, 5, 3); ctx.fillRect(5, 11, 5, 3);
                ctx.restore();
            });
        }
    };
}

module.exports = { createOverviewRenderer };

},{"./assets":15,"./background":16,"./font":20,"./players":24,"./projection":27,"./shapes":29,"./vault":30}],24:[function(require,module,exports){
const PLAYER_COLORS = ['#7fd7ff', '#d8e4ef', '#7dff8c', '#ffe65c', '#ff8a5c'];

function getPlayers(game) {
    const candidates = Array.isArray(game && game.players) ? game.players : (Array.isArray(game && game.ships) ? game.ships : []);
    const result = candidates.map((player, index) => ({
        player,
        ship: player && (player.ship || player),
        index: Number.isInteger(player && player.index) ? player.index : index,
        score: Number((player && (player.score ?? (player.stats && player.stats.score))) ?? (game && game.playerStats && game.playerStats[index] && game.playerStats[index].score)) || 0
    })).filter((entry) => entry.ship && Number.isFinite(Number(entry.ship.x)) && Number.isFinite(Number(entry.ship.y)));
    if (game && game.ship && !result.some((entry) => entry.ship === game.ship)) {
        result.unshift({ player: game.ship, ship: game.ship, index: 0, score: Number(game.score) || 0 });
    }
    if (!result.length && game && game.ship) result.push({ player: game.ship, ship: game.ship, index: 0, score: Number(game.score) || 0 });
    return result.slice(0, 5).map((entry, index) => ({ ...entry, color: PLAYER_COLORS[entry.index % PLAYER_COLORS.length] || PLAYER_COLORS[index] }));
}

function playerScale(count, ship) {
    if (Number.isFinite(Number(ship && ship.scale))) return Number(ship.scale);
    if (count <= 2) return 1;
    if (count === 3) return 0.8;
    return 0.7;
}

function versusMode(game) {
    return Boolean(game && (game.mode === 'versus' || game.multiplayerMode === 'versus' || game.multiplayer && game.multiplayer.mode === 'versus'));
}

module.exports = { PLAYER_COLORS, getPlayers, playerScale, versusMode };

},{}],25:[function(require,module,exports){
// Optional CRT post layer: scanlines + vignette, pre-rendered once.
const { VIEW } = require('./projection');
const { makeCanvas } = require('./assets');

let overlay;
let overlayWidth = 0;
function crtOverlay() {
    if (overlay !== undefined && overlayWidth === VIEW.width) return overlay;
    overlayWidth = VIEW.width;
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

},{"./assets":15,"./projection":27}],26:[function(require,module,exports){
const { VIEW, MAX_VIEW_WIDTH, POV, povCamera, projectPov, povFade } = require('./projection');
const { drawAsteroid, drawPickup, drawShipChase, drawPlayerBullet, drawEnemyBullet, drawGlow } = require('./shapes');
const { levelTint, createStarfield, drawNebula } = require('./background');
const { getImage } = require('./assets');
const { getPlayers, playerScale } = require('./players');
const { drawVaultPov } = require('./vault');

const FLOOR_HEIGHT = -40;
const GRID_STEP = 100;

function createPovRenderer() {
    const stars = createStarfield(340, MAX_VIEW_WIDTH * 2, POV.horizon, 23);

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
            const span = MAX_VIEW_WIDTH * 2;
            const x = (((star.x - shift) % span) + span) % span - MAX_VIEW_WIDTH / 2;
            if (x < -2 || x > VIEW.width + 2) continue;
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
        hz.addColorStop(0, 'rgba(63, 184, 255, 0)');
        hz.addColorStop(0.5, 'rgba(63, 184, 255, 0.45)');
        hz.addColorStop(1, 'rgba(63, 184, 255, 0)');
        ctx.fillStyle = hz;
        ctx.fillRect(0, POV.horizon - 18, VIEW.width, 36);

        ctx.save();
        ctx.lineWidth = 1;
        const nearY = camera.y + POV.near + 4;
        const farY = camera.y + POV.far;
        ctx.globalCompositeOperation = 'lighter';
        for (let x = -1600; x <= 2400; x += GRID_STEP) {
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
            const a = projectPov({ x: -1600, y }, camera, FLOOR_HEIGHT);
            const b = projectPov({ x: 2400, y }, camera, FLOOR_HEIGHT);
            ctx.strokeStyle = `rgba(127, 215, 255, ${0.4 * povFade(a.depth)})`;
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
            const img = getImage(game.level.number >= 11 ? 'gate-sector2' : 'gate') || getImage('gate');
            if (img) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha;
                ctx.drawImage(img, gate.x - size / 2, gate.y - size / 2, size, size);
                ctx.restore();
            }
            drawGlow(ctx, gate.x, gate.y, size * 0.6, game.level.number >= 11 ? '#67faff' : '#7dff8c', alpha * 0.45);
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
        (game.asteroids || []).forEach((a) => add('asteroid', a));
        (game.pickups || []).forEach((pk) => add('pickup', pk));
        (game.enemyBullets || []).forEach((b) => add('enemyBullet', b));
        (game.playerBullets || []).forEach((b) => add('playerBullet', b));
        (game.particles || []).forEach((pt) => add('particle', pt));
        items.sort((a, b) => b.p.depth - a.p.depth);
        return items;
    }

    function drawRenderable(ctx, game, camera, item) {
        const { kind, obj, p } = item;
        const alpha = povFade(p.depth);
        const time = game.time || 0;
        if (kind === 'asteroid') {
            const radius = Math.min(180, obj.size * p.scale);
            if (p.x + radius < 0 || p.x - radius > VIEW.width) return;
            drawAsteroid(ctx, obj, p.x, p.y, radius, alpha, time, game.level.number >= 11);
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
        ctx.fillStyle = '#3fb8ff';
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
        drawVaultPov(ctx, game, camera, projectPov, time);
        if (game.state === 'playing' || game.state === 'paused' || game.state === 'levelComplete') {
            const players = getPlayers(game);
            players.forEach(({ ship, index, color }) => {
                const shipPoint = projectPov(ship, camera, 0);
                if (!shipPoint) return;
                const size = playerScale(players.length, ship);
                drawGlow(ctx, shipPoint.x, shipPoint.y, 52 * size, color, 0.35);
                if (index === 0) drawReticle(ctx, camera, ship, time);
                ctx.save(); ctx.translate(shipPoint.x, shipPoint.y); ctx.scale(size, size);
                drawShipChase(ctx, ship, 0, 0, time, fx ? fx.ripples : []);
                ctx.fillStyle = color; ctx.fillRect(-8, 3, 16, 5);
                ctx.restore();
            });
        }
    };
}

module.exports = { createPovRenderer };

},{"./assets":15,"./background":16,"./players":24,"./projection":27,"./shapes":29,"./vault":30}],27:[function(require,module,exports){
// The world is always 800 wide; the view can be wider and centres the world with offsetX.
const WORLD_VIEW_WIDTH = 800;
const MAX_VIEW_WIDTH = 1600;
const VIEW = { width: WORLD_VIEW_WIDTH, height: 600, offsetX: 0 };

function setViewWidth(width) {
    const w = Math.round(Math.max(WORLD_VIEW_WIDTH, Math.min(MAX_VIEW_WIDTH, Number(width) || WORLD_VIEW_WIDTH)));
    VIEW.width = w;
    VIEW.offsetX = (w - WORLD_VIEW_WIDTH) / 2;
    return w;
}

// Overview: top-down map; the level scrolls toward the bottom of the screen.
const OVERVIEW_SHIP_LINE = 560;

function projectOverview(point, scrollY) {
    return {
        x: point.x + VIEW.offsetX,
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

module.exports = { VIEW, setViewWidth, WORLD_VIEW_WIDTH, MAX_VIEW_WIDTH, OVERVIEW_SHIP_LINE, POV, projectOverview, povCamera, projectPov, povFade };

},{}],28:[function(require,module,exports){
// Full-screen overlays: title, intro, pause, level clear celebration,
// victory finale and game over.
const { VIEW } = require('./projection');
const { LEVEL_COUNT, TOTAL_LEVEL_COUNT, getLevel } = require('../levels');
const { getImage, ROCK_KEYS } = require('./assets');
const { pixelText } = require('./font');
const { drawGlow, drawBreathe, pixelSprite, SHIP_TOP, SHIP_PALETTE } = require('./shapes');
const { panelBox, difficultyColor, difficultyName } = require('./hud');

const DIFFICULTY_OPTIONS = [
    { id: 'cadet', label: 'CADET', tagline: 'ORIGINAL TUNING' },
    { id: 'pilot', label: 'PILOT', tagline: 'FASTER + MEANER' },
    { id: 'ace', label: 'ACE', tagline: 'NEAR IMPOSSIBLE' }
];
const RAINBOW = ['#7fd7ff', '#bfeaff', '#e8eef5', '#9ff3ff', '#7dff8c'];

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
    const titleText = (value, x, y, options) => pixelText(ctx, value, x, y, { ...options, crisp: true });
    const time = game.time || 0;
    if (!drawCover(ctx, getImage('bg-galaxy'), 1, 1.08 + 0.03 * Math.sin(time * 0.3))) {
        ctx.fillStyle = '#05030c';
        ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    shade(ctx, 0.55);
    drawFloatingRocks(ctx, time);
    const cx = VIEW.width / 2;

    drawGlow(ctx, cx, 92, 260, '#3fb8ff', 0.18 + 0.06 * Math.sin(time * 2));
    titleText('DECENT VOYAGER', cx, 110, { size: 49, align: 'center', color: '#e8f6ff' });
    titleText('GALACTIC GAUNTLET', cx, 145, { size: 22, align: 'center', color: '#ffe65c' });

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
        titleText(opt.label, x + cardW / 2, y + 24, { size: 22, align: 'center', color: active ? color : '#c9d6e3' });
        titleText(opt.tagline, x + cardW / 2, y + 43, { size: 14, align: 'center', color: '#c9d6e3' });
        for (let s = 0; s <= i; s++) {
            ctx.fillStyle = active ? color : '#3a4250';
            ctx.fillRect(x + 8 + s * 8, y + 6, 5, 5);
        }
    });
    titleText('UP/DOWN  DIFFICULTY', cx, 246, { size: 16, align: 'center', color: '#c9d6e3' });

    const level = getLevel(game.selectedLevel || 1);
    const progress = game.progress || { unlocked: 1, highScore: 0 };
    titleText(`LEVEL ${level.number}: ${level.name.toUpperCase()}`, cx, 284, { size: 24, align: 'center' });
    titleText(`${difficultyName(game, true).toUpperCase()} UNLOCKED ${progress.unlocked}/${progress.sector2Unlocked ? TOTAL_LEVEL_COUNT : LEVEL_COUNT}   HI ${progress.highScore || 0}`, cx, 309, {
        size: 16, align: 'center', color: '#c9d6e3'
    });
    titleText('PRESS ENTER TO LAUNCH', cx, 344, { size: 24, align: 'center', color: '#7dff8c' });
    drawGlow(ctx, cx, 337, 160, '#7dff8c', 0.12);
    titleText(`TAB / X: ${(game.mode || game.multiplayerMode || 'COOP').toUpperCase()}  |  CONTROLLER A: JOIN (UP TO 5 PILOTS)`, cx, 366, { size: 14, align: 'center', color: '#7fd7ff' });

    const ox = VIEW.offsetX || 0;
    panelBox(ctx, ox + 90, 372, 620, 150);
    const controls = [
        ['LEFT/RIGHT A/D', 'STEER'],
        ['UP/DOWN W/S', 'THROTTLE (TITLE: DIFFICULTY)'],
        ['SPACE', 'FIRE (HOLD)'],
        ['V', 'SWITCH MAP / POV VIEW'],
        ['P / ESC', 'PAUSE    Q  MENU'],
        ['M', 'MUTE     C  CRT FILTER']
    ];
    controls.forEach(([key, action], i) => {
        titleText(key, ox + 270, 392 + i * 16, { size: 16, color: '#ffe65c', align: 'right' });
        titleText(action, ox + 290, 392 + i * 16, { size: 16, color: '#e8f6ff' });
    });
    drawBreathe(ctx, ox + 128, 494, 12, time);
    titleText('ENS ETH = POWER RE-UP', ox + 152, 499, { size: 14, color: '#7dff8c' });
    titleText('S/R/P WEAPONS  O SHIELD', ox + 152, 516, { size: 14, color: '#e8f6ff' });
    drawGlow(ctx, ox + 470, 502, 22, '#ff3a1c', 0.7 + 0.3 * Math.sin(time * 7));
    ctx.fillStyle = '#fff1c2';
    ctx.fillRect(ox + 467, 499, 6, 6);
    titleText('ORANGE CORES SHOOT BACK!', ox + 494, 507, { size: 14, color: '#ff8a5c' });
    titleText('WHITE LOTUS: +1 LIFE  |  GAME OVER: RESTART LEVEL 1', cx, 546, { size: 16, align: 'center', color: '#e8f6ff' });
}

function drawIntro(ctx, game) {
    const t = Math.min(1, (game.levelTime || 0) / 0.5);
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    const slide = (1 - easeOutBack(t)) * VIEW.width;
    ctx.fillStyle = 'rgba(2, 3, 12, 0.55)';
    ctx.fillRect(0, cy - 70, VIEW.width, 110);
    ctx.fillStyle = '#3fb8ff';
    ctx.fillRect(0, cy - 72, VIEW.width, 2);
    ctx.fillRect(0, cy + 40, VIEW.width, 2);
    pixelText(ctx, `${game.level.number >= 11 ? 'SECTOR II · FAR FUTURE' : 'LEVEL ' + game.level.number}`, cx - slide, cy - 20, { size: 44, align: 'center', color: '#7fd7ff' });
    pixelText(ctx, game.level.number >= 11 ? `LEVEL ${game.level.number}: ${game.level.name}`.toUpperCase() : game.level.name.toUpperCase(), cx + slide, cy + 14, { size: 20, align: 'center', color: '#ffb347' });
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
        ctx.fillStyle = i % 2 ? 'rgba(255, 230, 92, 0.06)' : 'rgba(63, 184, 255, 0.06)';
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
    pixelText(ctx, `ALL ${game.level.number > LEVEL_COUNT ? TOTAL_LEVEL_COUNT : LEVEL_COUNT} LEVELS CLEARED`, cx, 470, { size: 16, align: 'center', color: '#7dff8c', alpha: pulse });
    pixelText(ctx, game.level.number === TOTAL_LEVEL_COUNT ? 'CLAIM YOUR LEVEL 20 ACHIEVEMENT IN THE VAULT' : 'SECTOR I CLEARED - LEVEL 20 EARNS THE ACHIEVEMENT', cx, 492, { size: 11, align: 'center', color: '#c9d6e3' });
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
        pixelText(ctx, 'ENTER RESTART FROM LEVEL 1    Q MENU', cx, cy + 80, { size: 14, align: 'center', color: '#e8f6ff' });
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

},{"../levels":12,"./assets":15,"./font":20,"./hud":22,"./projection":27,"./shapes":29}],29:[function(require,module,exports){
const { WEAPONS } = require('../weapons');
const { getImage, getTinted, rockKeyFor, futureRockKeyFor, makeCanvas, BREATHE_FRAMES } = require('./assets');
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
    if (bullet.ownerWeapon && WEAPONS[bullet.ownerWeapon]) return bullet.ownerWeapon;
    return COLOR_TO_WEAPON[String(bullet.color || '').toLowerCase()] || 'blaster';
}

// ---------------------------------------------------------------- glow sprites
const glowCache = new Map();
let glowBudget = Infinity;
function setGlowBudget(limit = Infinity) {
    glowBudget = limit;
}
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
    if (glowBudget <= 0) return;
    glowBudget -= 1;
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
    W: '#ffffff', C: '#7fd7ff', H: '#d8e4ef', B: '#13284a', D: '#0a1428',
    M: '#ffe65c', A: '#3fb8ff', P: '#1d4a6a', F: '#ffb347'
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

function drawAsteroid(ctx, asteroid, x, y, radius, alpha = 1, time = 0, sector2 = false) {
    if (!(radius >= 0.5)) return;
    const key = sector2 ? futureRockKeyFor(asteroid.id) : rockKeyFor(asteroid.id);
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
                ctx.globalAlpha = alpha * flash * 0.18;
                ctx.drawImage(white, -s / 2, -s / 2, s, s);
            }
        }
    } else {
        asteroidPath(ctx, asteroid, radius);
        ctx.fillStyle = flash ? '#6d667d' : asteroid.shooter ? '#2b1712' : '#1c1c22';
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
    if (pickup.type === 'life') {
        const lotus = getImage('white-lotus');
        drawGlow(ctx, x, y, radius * 2.3, '#e8f6ff', alpha * 0.5);
        if (lotus) {
            const size = radius * 2.8;
            ctx.save();
            ctx.globalAlpha *= alpha;
            const height = size * lotus.naturalHeight / lotus.naturalWidth;
            ctx.drawImage(lotus, x - size / 2, y - height / 2, size, height);
            ctx.restore();
        }
        pixelText(ctx, '+1 LIFE', x, y + radius * 1.8, { size: 14, color: '#ffffff', align: 'center', alpha, crisp: true });
        return;
    }
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
        drawGlow(ctx, x, y - 8, 9, '#d8e4ef', 0.35);
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
        drawGlow(ctx, -36, 0, 7, '#3fb8ff', 0.5 + 0.5 * Math.sin(time * 6));
        drawGlow(ctx, 36, 0, 7, '#3fb8ff', 0.5 + 0.5 * Math.sin(time * 6 + Math.PI));
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
    if (type === 'singularity') {
        const r = Math.max(4, (bullet.size || 10) * scale * 1.5);
        const pulse = 0.82 + 0.18 * Math.sin(time * 16);
        drawGlow(ctx, x, y, r * 9 * pulse, '#5fd9ff', 0.95);
        drawGlow(ctx, x, y, r * 5, '#251044', 1);
        ctx.fillStyle = '#020106';
        ctx.beginPath(); ctx.arc(x, y, r * 1.45, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#d7a4ff'; ctx.lineWidth = Math.max(2, r * 0.22);
        ctx.beginPath(); ctx.ellipse(x, y, r * 2.2, r * 0.8, time * 2, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, r * 0.08);
        ctx.beginPath(); ctx.ellipse(x, y, r * 2.6, r * 0.95, -time * 1.5, 0, Math.PI * 1.35); ctx.stroke();
    } else if (type === 'prism') {
        const r = Math.max(3, (bullet.size || 6) * scale);
        drawGlow(ctx, x, y, r * 8, '#5ffeff', 1);
        drawGlow(ctx, x, y, r * 4, '#fa74ff', 0.9);
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(uy, ux) + time * 0.15);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(r * 2.4, 0); ctx.lineTo(-r, r); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r, -r); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#65ffff'; ctx.lineWidth = Math.max(1, r * 0.3); ctx.stroke(); ctx.restore();
        for (let i = 0; i < 3; i++) { ctx.strokeStyle = ['#d8e4ef', '#71ffff', '#fff36a'][i]; ctx.globalAlpha *= 0.65; ctx.lineWidth = Math.max(1, r * 0.16); ctx.beginPath(); ctx.moveTo(x - ux * r * (i + 1), y - uy * r * (i + 1)); ctx.lineTo(x - ux * r * (i + 5), y - uy * r * (i + 5) + (i - 1) * r * 1.5); ctx.stroke(); }
    } else if (type === 'nova') {
        const r = Math.max(3, (bullet.radius || bullet.size || 8) * scale);
        drawGlow(ctx, x, y, r * 6, '#d6a1ff', 0.95);
        drawGlow(ctx, x, y, r * 2.4, '#fff5ff', 0.95);
        ctx.strokeStyle = '#d9a0ff'; ctx.lineWidth = Math.max(2, r * 0.18);
        ctx.beginPath(); ctx.arc(x, y, r * (1.1 + 0.1 * Math.sin(time * 10)), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r * 0.52, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'plasma') {
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
    setGlowBudget,
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

},{"../weapons":37,"./assets":15,"./font":20}],30:[function(require,module,exports){
const { drawGlow, drawAsteroid } = require('./shapes');
const { getImage, supporterImageKey } = require('./assets');
const { pixelText } = require('./font');
const { VIEW } = require('./projection');

const alive = (guard) => guard && guard.alive !== false && guard.hp !== 0 && !guard.destroyed;
const guardList = (game, vault) => (Array.isArray(vault && vault.guards) ? vault.guards : (Array.isArray(game && game.guards) ? game.guards : [])).filter(alive);

function shielded(vault, guards) {
    if (!vault) return false;
    if (vault.shielded === false || vault.invulnerable === false) return false;
    const generator = vault.generator || vault.shieldGenerator;
    return Boolean(vault.shielded || vault.invulnerable || (generator && generator.active !== false) || guards.length);
}

function drawVaultGlyph(ctx, x, y, radius, time, vault, guards = []) {
    const active = shielded(vault, guards);
    const color = active ? '#7dff8c' : '#ffe65c';
    const pulse = 0.72 + Math.sin(time * 5) * 0.22;
    drawGlow(ctx, x, y, radius * 2.8, color, 0.75 * pulse);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * (active ? 0.35 : 0.12));
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, radius * 0.08);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([radius * 0.32, radius * 0.2]);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#100a1e';
    ctx.beginPath();
    ctx.moveTo(0, -radius); ctx.lineTo(radius * 0.82, -radius * 0.3); ctx.lineTo(radius * 0.72, radius * 0.65);
    ctx.lineTo(0, radius); ctx.lineTo(-radius * 0.72, radius * 0.65); ctx.lineTo(-radius * 0.82, -radius * 0.3); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff4c8'; ctx.lineWidth = Math.max(1, radius * 0.045); ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(-radius * 0.2, -radius * 0.22, radius * 0.4, radius * 0.44);
    ctx.restore();
    if (active) {
        pixelText(ctx, 'SHIELDED', x, y - radius * 2.15, { size: 10, align: 'center', color: '#ff8ac4' });
    } else {
        pixelText(ctx, 'SUPPORTER VAULT', x, y - radius * 2.15, { size: 10, align: 'center', color: '#ffe65c' });
    }
}

function drawGenerator(ctx, x, y, scale, time) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    drawGlow(ctx, x, y, 35 * scale, '#6ffaff', 0.9);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-time * 1.8);
    ctx.strokeStyle = '#b7ffff';
    ctx.lineWidth = Math.max(1, 3 * scale);
    ctx.beginPath(); ctx.arc(0, 0, 18 * scale, 0, Math.PI * 1.7); ctx.stroke();
    ctx.fillStyle = '#4effff';
    ctx.fillRect(-5 * scale, -5 * scale, 10 * scale, 10 * scale);
    ctx.restore();
}

function drawGuards(ctx, guards, project, time, sector2 = false, world = []) {
    const rendered = new Set(world.map(rock => rock.id));
    guards.forEach((guard) => {
        if (rendered.has(guard.id)) return;
        const point = project(guard);
        if (!point) return;
        const radius = Math.min(160, (Number(guard.size) || 22) * (point.scale || 1));
        if (point.x + radius < 0 || point.x - radius > VIEW.width || point.y + radius < 0 || point.y - radius > VIEW.height) return;
        drawAsteroid(ctx, { ...guard, shooter: true }, point.x, point.y, radius, 1, time, sector2);
    });
}

function drawVault(ctx, game, scrollY, time, project, onScreen) {
    const vault = game && game.vault;
    if (!vault || vault.active === false || vault.captured) return;
    const guards = guardList(game, vault);
    drawGuards(ctx, guards, (point) => project(point, scrollY), time, Number(game.level && game.level.number) >= 11, game.asteroids || []);
    const point = project(vault, scrollY);
    if (!point || (onScreen && !onScreen(point, 100))) return;
    drawVaultGlyph(ctx, point.x, point.y, Math.max(16, Number(vault.size) || 28), time, vault, guards);
    const generator = vault.generator || vault.shieldGenerator || guards.find((guard) => guard.kind === 'generator');
    if (generator) {
        const genPoint = project({ x: generator.x ?? vault.x, y: generator.y ?? vault.y }, scrollY);
        if (genPoint) drawGenerator(ctx, genPoint.x, genPoint.y, genPoint.scale || 1, time);
    }
}

function drawVaultPov(ctx, game, camera, project, time) {
    const vault = game && game.vault;
    if (!vault || vault.active === false || vault.captured) return;
    const guards = guardList(game, vault);
    drawGuards(ctx, guards, (point) => project(point, camera), time, Number(game.level && game.level.number) >= 11, game.asteroids || []);
    const point = project(vault, camera);
    if (point) {
        const scale = Math.min(20, Math.max(0.35, point.scale));
        const radius = Math.min(160, Math.max(9, (Number(vault.size) || 24) * scale));
        if (point.x + radius * 2 < 0 || point.x - radius * 2 > VIEW.width || point.y + radius * 2 < 0 || point.y - radius * 2 > VIEW.height) return;
        drawVaultGlyph(ctx, point.x, point.y, radius, time, vault, guards);
        const generator = vault.generator || vault.shieldGenerator || guards.find((guard) => guard.kind === 'generator');
        const genPoint = generator && project(generator, camera);
        if (genPoint) drawGenerator(ctx, genPoint.x, genPoint.y, Math.min(8, genPoint.scale), time);
    }
}

function drawSupporterToken(ctx, tokenId, x, y, size) {
    const key = supporterImageKey(tokenId);
    const image = key && getImage(key);
    if (image) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = '#fff4c8';
        ctx.shadowBlur = 20;
        ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
        ctx.restore();
        return true;
    }
    drawGlow(ctx, x, y, size * 0.8, '#ffe65c', 0.8);
    ctx.fillStyle = '#100a1e';
    ctx.strokeStyle = '#fff4c8';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, size * 0.36, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    pixelText(ctx, 'D', x, y + size * 0.12, { size: Math.max(14, size * 0.46), color: '#ffe65c', align: 'center' });
    return false;
}

module.exports = { drawVault, drawVaultPov, drawVaultGlyph, drawSupporterToken, guardList, shielded };

},{"./assets":15,"./font":20,"./projection":27,"./shapes":29}],31:[function(require,module,exports){
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

},{}],32:[function(require,module,exports){
module.exports = 'voyager-1.2-lotus-marathon';

},{}],33:[function(require,module,exports){
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
        ...(record.marathon === undefined ? {} : { marathon: validateMarathon(record, where) }),
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

function validateMarathon(record, where) {
    const marathon = record.marathon;
    if (!isPlainObject(marathon) || marathon.schema !== 'voyager-marathon/1' ||
        record.level !== 20 || record.difficulty === 'cadet' || marathon.difficulty !== record.difficulty ||
        marathon.startLevel !== 1 || marathon.finalLevel !== 20 || typeof marathon.perfect !== 'boolean' ||
        !Array.isArray(marathon.levels) || marathon.levels.length !== 20 ||
        !Array.isArray(marathon.awards) || marathon.awards.length > 4) fail(`${where} has an invalid marathon receipt.`);
    const levels = marathon.levels.map((entry, index) => {
        if (!isPlainObject(entry) || entry.level !== index + 1) fail(`${where} marathon levels must be ordered 1–20.`);
        const checked = validateLevelRecord({
            ...record, ...entry, id: entry.recordId, marathon: undefined, captures: [],
            battleLog: { levelLength: 1, worldWidth: 800, path: [], kills: [], hitsTaken: [], pickups: [], misses: [] }
        }, `${where} marathon level ${index + 1}`);
        return { recordId: checked.id, level: checked.level, startedAt: checked.startedAt, completedAt: checked.completedAt,
            durationSec: checked.durationSec, score: checked.score, ship: checked.ship, stats: checked.stats };
    });
    const awards = marathon.awards.map((award) => {
        if (!isPlainObject(award) || !['guarded-pickup', 'marathon-completion', 'perfect-ace', 'perfect-pilot'].includes(award.kind) ||
            award.chainId !== 8453 || !/^0x[0-9a-f]{40}$/i.test(award.nftContract || '') ||
            !/^\d+$/.test(award.tokenId) || award.quantity !== 1) fail(`${where} has an invalid marathon award.`);
        let bonus;
        if (award.bonus !== undefined) {
            const { PILOT_BONUS } = require('./prizes');
            if (award.kind !== 'perfect-pilot' || !isPlainObject(award.bonus) ||
                Object.entries(PILOT_BONUS).some(([key, value]) => award.bonus[key] !== value)) fail(`${where} has an invalid Pilot bonus.`);
            bonus = { ...PILOT_BONUS };
        }
        return { kind: award.kind, level: num(award.level, 'Award level', { min: 1, max: 20, integer: true }),
            tier: num(award.tier, 'Award tier', { min: 1, max: 2, integer: true }),
            earnedAt: isoDate(award.earnedAt, 'Award earned date'), chainId: 8453, nftContract: award.nftContract,
            tokenId: award.tokenId, project: str(award.project, 'Award project', 100),
            metadataURI: str(award.metadataURI, 'Award metadata', 300), quantity: 1,
            ...(bonus ? { bonus } : {}), status: str(award.status, 'Award status', 100) };
    });
    return { schema: marathon.schema, runId: str(marathon.runId, 'Marathon run ID', 200),
        seed: num(marathon.seed, 'Marathon seed', { max: 4294967295, integer: true }),
        startLevel: 1, finalLevel: 20, difficulty: record.difficulty, perfect: marathon.perfect,
        startedAt: isoDate(marathon.startedAt, 'Marathon start'), completedAt: isoDate(marathon.completedAt, 'Marathon end'),
        totals: validateLifetime(marathon.totals), levels, awards };
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
    if (obj.app !== SAVE_APP) fail('This file is not a Decent Voyager: Galactic Gauntlet save.');
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

},{"./difficulty":7,"./levels":12,"./prizes":14,"./stats":35}],34:[function(require,module,exports){
const { createWeapon } = require('./weapons');

const MIN_X = 20;
const MAX_X = 780;
const MIN_OFFSET = 40;
const MAX_OFFSET = 280;

// The ship flies at the scroll position plus a player-controlled forward offset.
class Spaceship {
    constructor() {
        this.baseSize = 12;
        this.size = this.baseSize;
        this.scale = 1;
        this.charge = 0;
        this.wasFiring = false;
        this.specialWasDown = false;
        this.specialCooldown = 0;
        this.suppressChargeUntilRelease = false;
        this.maxPower = 100;
        this.lives = 3;
        this.weapon = createWeapon();
        this.weaponTiers = { blaster: 1 };
        this.reset();
    }

    reset() {
        this.x = 400;
        this.offset = 90;
        this.y = 0;
        this.power = this.maxPower;
        this.cooldown = 0;
        this.charge = 0;
        this.wasFiring = false;
        this.specialWasDown = false;
        this.specialCooldown = 0;
        this.suppressChargeUntilRelease = false;
        this.invulnerable = 0;
        this.shield = 0;
        this.bank = 0;
        this.lateralSpeed = 360;
        this.forwardSpeed = 190;
    }

    update(dt, input, scrollY) {
        let steer = 0;
        steer = Math.max(-1, Math.min(1, (input.ax || 0) + (input.left ? -1 : 0) + (input.right ? 1 : 0)));
        this.x = Math.min(MAX_X, Math.max(MIN_X, this.x + steer * this.lateralSpeed * dt));
        const forward = Math.max(-1, Math.min(1, (input.ay || 0) + (input.up ? 1 : 0) - (input.down ? 1 : 0)));
        this.offset += forward * this.forwardSpeed * dt;
        this.offset = Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, this.offset));
        this.y = scrollY + this.offset;
        this.bank += (steer - this.bank) * Math.min(1, dt * 24);
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.invulnerable = Math.max(0, this.invulnerable - dt);
        this.shield = Math.max(0, this.shield - dt);
    }

    get protectedFromDamage() {
        return this.invulnerable > 0 || this.shield > 0;
    }
}

module.exports = Spaceship;

},{"./weapons":37}],35:[function(require,module,exports){
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
const WEAPON_TYPES = ['blaster', 'spread', 'rapid', 'plasma', 'nova', 'prism', 'singularity'];
const PICKUP_TYPES = ['spread', 'rapid', 'plasma', 'power', 'shield', 'nova', 'prism', 'singularity', 'life'];
const COMBO_WINDOW = 2;
const RECORD_SCHEMA = 'asteroid-level-record/1';
const GAME_NAME = 'Decent Voyager: Galactic Gauntlet';
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
    for (const key of PICKUP_TYPES) totals.pickupsCollected[key] = (totals.pickupsCollected[key] || 0) + (stats.pickupsCollected[key] || 0);
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

function buildLevelRecord({ level, tracker, ship, view, score, startedAt, completedAt, durationSec, captures = [], idFn = randomSuffix, suffix }) {
    suffix = suffix === undefined ? idFn() : suffix;
    const completedIso = new Date(completedAt).toISOString();
    return {
        schema: RECORD_SCHEMA,
        id: `${completedIso}-${level.difficulty}-L${level.number}-${suffix}`,
        game: GAME_NAME,
        gameVersion: GAME_VERSION,
        level: level.number,
        captures: captures.map((capture) => ({ ...capture })),
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

},{}],36:[function(require,module,exports){
const { pick, range } = require('./rng');
const { PRIZES } = require('./prizes');
const Asteroid = require('./asteroid');

function chooseVaultLevel(tier, rng) { return tier === 1 ? pick(rng, [9, 10]) : pick(rng, [19, 20]); }
function createVault(tier, level, rng) {
    const x = range(rng, 300, 500);
    const y = range(rng, 1700, 2400);
    const prize = pick(rng, PRIZES[tier]);
    const guards = Array.from({ length: 8 }, (_, index) => {
        const angle = index * Math.PI / 4;
        const guard = new Asteroid({
            id: `vault-${tier}-${level}-${index}`, x: x + Math.cos(angle) * 80, y: y + Math.sin(angle) * 80,
            size: index === 0 ? 26 : 20, hp: index === 0 ? 8 : 5, shooter: true,
            fireCooldown: range(rng, 0.25, 0.8), rng
        });
        guard.kind = index === 0 ? 'generator' : 'guard';
        guard.vaultGuard = true;
        guard.vaultTier = tier;
        return guard;
    });
    return { tier, level, x, y, size: 36, prize, guards, captured: false, spawned: false, shielded: true };
}
function markGuardDestroyed(vault, guard) {
    if (!vault || !guard.vaultGuard || guard.destroyNotified) return false;
    guard.destroyNotified = true;
    if (vault.guards.every((entry) => entry.hp <= 0)) vault.shielded = false;
    return true;
}
module.exports = { chooseVaultLevel, createVault, markGuardDestroyed };

},{"./asteroid":2,"./prizes":14,"./rng":31}],37:[function(require,module,exports){
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
    prism: { name: 'Prism Splitter', color: '#67faff', cooldown: [0.22, 0.19, 0.16], speed: 740, damage: [3, 3, 4], size: [5, 6, 7], pierce: false, pattern: [[[0, 0]], [[-0.18, 0], [0, 0], [0.18, 0]], [[-0.28, 0], [-0.14, 0], [0, 0], [0.14, 0], [0.28, 0]]] },
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

},{"./bullet":4}]},{},[1]);
