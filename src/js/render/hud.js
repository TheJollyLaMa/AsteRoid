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
    const view = { score: 0, lastTime: null, combo: 0, comboPop: 0, power: 1, lastLevelKey: '', toast: '', toastUntil: 0 };

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
        const ship = game.ship || {};
        const weapon = ship.weapon || { type: 'blaster', tier: 1 };
        const spec = WEAPONS[weapon.type] || WEAPONS.blaster;
        const x = 14;
        const y = VIEW.height - 92;
        panelBox(ctx, x, y, 286, 24, spec.color);
        pixelText(ctx, spec.name.toUpperCase(), x + 10, y + 17, { size: 12, color: spec.color });
        for (let i = 0; i < MAX_TIER; i++) {
            const px = x + 200 + i * 26;
            ctx.fillStyle = i < (weapon.tier || 1) ? spec.color : 'rgba(255,255,255,0.12)';
            ctx.fillRect(px, y + 7, 20, 10);
            if (i < ship.weapon.tier) drawGlow(ctx, px + 10, y + 12, 14, spec.color, 0.3);
        }
    }

    function drawCharge(ctx, game) {
        const ship = game.ship || {};
        const weapon = ship.weapon || {};
        const raw = game.charge ?? ship.charge ?? ship.chargeAmount ?? ship.weaponCharge ?? 0;
        const charge = Math.max(0, Math.min(1, Number(raw) || 0));
        const charging = Boolean(game.charging || ship.charging || charge > 0);
        if (!charging && charge <= 0) return;
        const color = (WEAPONS[weapon.type] || WEAPONS.nova || {}).color || '#b67aff';
        const x = 14; const y = VIEW.height - 126; const w = 286;
        panelBox(ctx, x, y, w, 12, color);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 2, y + 3, w - 4, 6);
        ctx.fillStyle = color; ctx.fillRect(x + 2, y + 3, (w - 4) * charge, 6);
        drawGlow(ctx, x + 2 + (w - 4) * charge, y + 6, 24 + charge * 30, color, 0.3 + charge * 0.6);
        if (charging) pixelText(ctx, `${weapon.type === 'singularity' ? 'EVENT HORIZON' : weapon.type === 'prism' ? 'PRISM CHARGE' : 'NOVA CHARGE'} ${Math.round(charge * 100)}%`, x + 4, y - 3, { size: 9, color: '#ffffff' });
    }

    function drawPlayers(ctx, game) {
        const players = getPlayers(game);
        if (players.length <= 1) return;
        players.forEach(({ player, ship, index, color, score }, i) => {
            const y = 72 + i * 27;
            const x = VIEW.width - 188;
            panelBox(ctx, x, y, 176, 27, color);
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
        if (versusMode(game)) pixelText(ctx, 'VERSUS · INDIVIDUAL SCORE', VIEW.width - 100, 64, { size: 9, color: '#d8e4ef', align: 'right' });
    }

    function drawToast(ctx) {
        if (!view.toast || Date.now() >= view.toastUntil) return;
        const alpha = Math.min(1, (view.toastUntil - Date.now()) / 300);
        panelBox(ctx, VIEW.width / 2 - 150, 66, 300, 30, '#7fd7ff');
        pixelText(ctx, view.toast, VIEW.width / 2, 86, { size: 12, align: 'center', color: '#ffffff', alpha });
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
        const sector = game.level.number >= 11 ? 'SECTOR II · FAR FUTURE  ' : '';
        const label = `${sector}LV ${game.level.number}/${game.level.number > LEVEL_COUNT ? TOTAL_LEVEL_COUNT : LEVEL_COUNT}  ${game.level.name.toUpperCase()}`;
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
        const hue = 150 + 45 * Math.sin(game.time * 4);
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
        drawToast(ctx);
        if (game.state === 'title') {
            view.score = 0;
            return;
        }
        drawScore(ctx, game, dt);
        drawProgress(ctx, game);
        drawLives(ctx, game);
        drawWeapon(ctx, game);
        drawCharge(ctx, game);
        drawPower(ctx, game);
        drawPlayers(ctx, game);
        drawCombo(ctx, game, dt);
        const viewLabel = game.view === 'pov' ? 'POV' : 'MAP';
        const flags = `${opts.muted ? 'M:OFF ' : ''}${opts.crt ? 'CRT ' : ''}[V] ${viewLabel}`;
        pixelText(ctx, flags, VIEW.width - 16, VIEW.height - 14, { size: 11, color: '#9fb4c8', align: 'right' });
        if (game.view === 'pov') drawRadar(ctx, game);
    }

    return { drawHud, view, setToast(message, duration = 2200) { view.toast = String(message); view.toastUntil = Date.now() + duration; } };
}

module.exports = { createHud, rollUp, litSegments, difficultyColor, difficultyName, panelBox, POWER_SEGMENTS, DIFFICULTY_COLORS };
