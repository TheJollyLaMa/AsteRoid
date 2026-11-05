const Game = require('./game');
const { createAudio } = require('./audio');
const { createOverviewRenderer } = require('./render/overview');
const { createPovRenderer } = require('./render/pov');
const { drawHud, drawOverlay } = require('./render/hud');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function safeStorage() {
    try {
        return window.localStorage;
    } catch (error) {
        return null;
    }
}

const game = new Game({ storage: safeStorage() });
const audio = createAudio();
const renderers = { overview: createOverviewRenderer(), pov: createPovRenderer() };

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

const input = { left: false, right: false, up: false, down: false, fire: false };

document.addEventListener('keydown', (event) => {
    audio.unlock();
    const held = HELD_KEYS[event.key];
    if (held || event.key === 'Enter') event.preventDefault();
    if (held) input[held] = true;
    if (event.repeat) return;
    if (event.key === 'm' || event.key === 'M') {
        audio.toggleMute();
        return;
    }
    const action = ACTION_KEYS[event.key];
    if (action) game.handleAction(action);
});

document.addEventListener('keyup', (event) => {
    const held = HELD_KEYS[event.key];
    if (held) input[held] = false;
});

window.addEventListener('blur', () => {
    Object.keys(input).forEach((key) => { input[key] = false; });
    if (game.state === 'playing') game.handleAction('pause');
});

let last = null;
function frame(timestamp) {
    const dt = last === null ? 0 : Math.min(0.05, (timestamp - last) / 1000);
    last = timestamp;
    game.update(dt, input);
    audio.play(game.drainEvents());
    draw();
    requestAnimationFrame(frame);
}

function draw() {
    renderers[game.view](ctx, game);
    drawHud(ctx, game);
    drawOverlay(ctx, game);
}

// Console handles for debugging and automated play-testing.
window.asteroidGame = game;
window.asteroidDraw = draw;
requestAnimationFrame(frame);
