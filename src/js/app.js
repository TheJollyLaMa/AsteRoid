const Game = require('./game');
const { createAudio } = require('./audio');
const { createOverviewRenderer } = require('./render/overview');
const { createPovRenderer } = require('./render/pov');
const { createHud } = require('./render/hud');
const { drawOverlay } = require('./render/screens');
const { createFx } = require('./render/fx');
const { drawCrt, getPostResources, clearPostResources } = require('./render/post');
const { setViewWidth } = require('./render/projection');
const { loadAssets, getAssetResources, clearTintResources } = require('./render/assets');
const { renderBattleCard, previewBattleCard } = require('./render/battleCard');
const { sampleRecord } = require('./render/cardMath');
const { setGlowBudget, getShapeResources, clearShapeResources } = require('./render/shapes');
const { getFontResources, clearFontResources } = require('./render/font');
const { createInput } = require('./input');
const { createDiagnostics } = require('./diagnostics');
const { supporterDetails } = require('./supporter-catalog');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
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
const handleGameAction = game.handleAction.bind(game);
game.handleAction = action => {
    if (document.getElementById('supporter-briefing')?.open || document.getElementById('voyager-rewards')?.open) return;
    if (action === 'confirm' && ['title', 'gameOver'].includes(game.state)) {
        const state = game.state;
        const request = new CustomEvent('voyager:launch-request', {
            cancelable: true,
            detail: { launch: () => { if (game.state === state) handleGameAction(action); } }
        });
        if (!window.dispatchEvent(request)) return;
    }
    handleGameAction(action);
};
const diagnostics = createDiagnostics({
    storage,
    snapshot: () => ({
        state: game.state, level: game.level?.number, difficulty: game.difficulty, view: game.view,
        particles: game.particles?.length, rocks: game.asteroids?.length,
        bullets: (game.playerBullets?.length || 0) + (game.enemyBullets?.length || 0),
        width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio || 1,
        ...graphicsResources()
    }),
    notify: () => window.dispatchEvent(new CustomEvent('voyager:diagnostic'))
});
const audio = createAudio({ onError: error => diagnostics.record('audio', error) });
const fx = createFx();
const hud = createHud();
const renderers = { overview: createOverviewRenderer(), pov: createPovRenderer() };
const display = { crt: true };
function graphicsResources() {
    const shape = getShapeResources();
    const text = getFontResources();
    const assets = getAssetResources();
    const post = getPostResources();
    const pixels = shape.shapePixels + text.textPixels + assets.tintPixels + assets.imagePixels + post.postPixels + canvas.width * canvas.height;
    return {
        ...shape, ...text, ...assets, ...post,
        estimatedSurfaceBytes: pixels * 4,
        contextLost: typeof ctx.isContextLost === 'function' && ctx.isContextLost(),
        contextAlpha: ctx.getContextAttributes?.()?.alpha ?? null,
        worldFx: fx.worldCount, screenFx: fx.screenCount
    };
}
function releaseGraphicsResources() {
    clearShapeResources();
    clearFontResources();
    clearTintResources();
    clearPostResources();
}
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
        // CRT texture stays under screen text so the HUD and win screens remain sharp.
        if (display.crt) drawCrt(ctx, game.time || 0);
        fx.drawScreen(ctx, game);
    }
    hud.drawHud(ctx, game, fx, { muted: audio.muted, crt: display.crt });
    drawOverlay(ctx, game, fx);
}

let last = null;
let slowFrames = 0;
let healthyFrames = 0;
let frameFault = false;
let contextLost = false;
let graphicsRecoveryPending = false;
let sampleTime = null;
let frameSamples = 0;
let maxFrameMs = 0;
let maxDrawMs = 0;
let maxStepMs = 0;
// The live fault shown over the canvas. Persisted diagnostics keep the history;
// this clears as soon as the battle recovers.
let activeFault = null;
function setFault(kind, message) {
    activeFault = kind ? { kind, message, at: Date.now() } : null;
    // Diagnostics de-duplicates repeated entries, so refresh the banner directly.
    window.dispatchEvent(new CustomEvent('voyager:diagnostic'));
}
function clearFault() {
    if (!activeFault) return;
    activeFault = null;
    window.dispatchEvent(new CustomEvent('voyager:diagnostic'));
}
function freezeBattle() {
    input.clear();
    if (!networkMode && game.state === 'playing') game.handleAction('pause');
}
function frameError(error) {
    frameFault = true;
    freezeBattle();
    setFault('frame-error', 'The battle hit an error and is paused.');
    diagnostics.record('frame-error', error);
    hud.setToast('Flight error: open Flight reports in the profile menu.', 12000);
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
        setFault('performance-pause', networkMode ? 'Visuals reduced; the online battle continues.' : 'Battle frozen to recover frame rate. Press P to resume.');
        diagnostics.record('performance-pause', networkMode ? 'Online visuals reduced; referee continues.' : 'Local battle paused after a slow frame.', { elapsedMs: Math.round(elapsed * 1000), quality: renderQuality });
        healthyFrames = 0;
        slowFrames = 0;
    }
    if (activeFault?.kind === 'performance-pause' && (networkMode ? Date.now() - activeFault.at > 10000 : game.state !== 'paused')) clearFault();
    healthyFrames = game.state === 'playing' && elapsed > 0 && elapsed < 0.025 ? healthyFrames + 1 : 0;
    if (game.state === 'playing' && healthyFrames >= 600 && renderQuality < 1) {
        renderQuality = Math.min(1, renderQuality + 0.05);
        fitBacking();
        healthyFrames = 0;
    }
    const stepStart = performance.now();
    step(dt);
    const drawStart = performance.now();
    draw();
    maxStepMs = Math.max(maxStepMs, drawStart - stepStart);
    maxDrawMs = Math.max(maxDrawMs, performance.now() - drawStart);
    maxFrameMs = Math.max(maxFrameMs, elapsed * 1000);
    frameSamples++;
    if (sampleTime === null) sampleTime = timestamp;
    if (timestamp - sampleTime >= 15000) {
        if (game.state === 'playing') diagnostics.record('graphics-sample', 'Periodic graphics resource sample.', {
            quality: renderQuality, frameSamples, maxFrameMs: Math.round(maxFrameMs),
            maxDrawMs: Math.round(maxDrawMs), maxStepMs: Math.round(maxStepMs)
        });
        sampleTime = timestamp;
        frameSamples = maxFrameMs = maxDrawMs = maxStepMs = 0;
    }
}
canvas.addEventListener('contextlost', event => {
    event.preventDefault();
    contextLost = true;
    graphicsRecoveryPending = true;
    freezeBattle();
    setFault('context-lost', networkMode ? 'Graphics are restarting; the online battle continues.' : 'Graphics are restarting; the battle is paused.');
    diagnostics.record('context-lost', 'Canvas graphics context lost. Battle paused locally; online referee continues.');
    releaseGraphicsResources();
});
function restartRendering() {
    frameFault = false;
    last = null;
    sampleTime = null;
    frameSamples = maxFrameMs = maxDrawMs = maxStepMs = 0;
    slowFrames = healthyFrames = 0;
    fx.clear();
    input.clear();
    if (typeof ctx.reset === 'function') ctx.reset();
    else canvas.width = canvas.width;
    if (graphicsRecoveryPending) {
        renderQuality = Math.min(renderQuality, 0.65);
        fitBacking();
        graphicsRecoveryPending = false;
    }
}
canvas.addEventListener('contextrestored', () => {
    contextLost = false;
    restartRendering();
    setFault(null);
    hud.setToast(networkMode ? 'Graphics restored.' : 'Graphics restored. Press P to resume.', 8000);
    diagnostics.record('context-restored', 'Graphics restored automatically at reduced quality.');
});
window.addEventListener('error', event => diagnostics.record('window-error', event.error || event.message || 'Resource load failed'));
window.addEventListener('unhandledrejection', event => diagnostics.record('unhandled-rejection', event.reason));
window.voyagerDiagnostics = {
    report: diagnostics.report,
    activeFault: () => activeFault && { ...activeFault },
    resume() {
        if (contextLost) throw new Error('Graphics context has not recovered. Download the report, then reload.');
        restartRendering();
        setFault(null);
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
window.AsteroidRender = { renderBattleCard, previewBattleCard, sampleRecord, loadAssets, supporterDetails };
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
    isNetworkMode: () => Boolean(networkMode),
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
