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
