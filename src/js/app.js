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

function draw() {
    audio.setSector2(Number(game.level && game.level.number) >= 11);
    const shake = fx.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    renderers[game.view](ctx, game, fx);
    ctx.restore();
    fx.drawScreen(ctx, game);
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
