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
    audio.setSector2(Number(game.level && game.level.number) >= 11);
    const shake = fx.shakeOffset();
    ctx.setTransform(renderScaleX, 0, 0, renderScaleY, 0, 0);
    // Resizing resets context state; apply nearest-neighbour sampling every frame.
    ctx.imageSmoothingEnabled = false;
    if (game.state !== 'title') {
        ctx.save();
        ctx.translate(shake.x, shake.y);
        renderers[game.view](ctx, game, fx);
        ctx.restore();
        fx.drawScreen(ctx, game);
    }
    hud.drawHud(ctx, game, fx, { muted: audio.muted, crt: display.crt });
    drawOverlay(ctx, game, fx);
    if (display.crt && game.state !== 'title') drawCrt(ctx, game.time || 0);
    setGlowBudget();
}

let last = null;
let slowFrames = 0;
let healthyFrames = 0;
function frame(timestamp) {
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
            game.handleAction('pause');
            dt = 0;
            hud.setToast('Performance pause: battle frozen. Press P / Resume when ready.', 12000);
        } else {
            hud.setToast('Reduced visual load. Online battle continues on the referee.', 12000);
        }
        slowFrames = 0;
    }
    healthyFrames = elapsed > 0 && elapsed < 0.025 ? healthyFrames + 1 : 0;
    if (game.state === 'playing' && healthyFrames >= 600 && renderQuality < 1) {
        renderQuality = Math.min(1, renderQuality + 0.05);
        fitBacking();
        healthyFrames = 0;
    }
    step(dt);
    draw();
    requestAnimationFrame(frame);
}
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
