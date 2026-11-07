const { VIEW } = require('./projection');
const { WEAPONS, MAX_TIER } = require('../weapons');
const { getCampaignLevelCount } = require('../levels');
const { PICKUP_STYLE, SHIP_TOP, SHIP_PALETTE, pixelSprite, drawBreathe, drawGlow } = require('./shapes');
const { pixelText, measurePixelText, pixelTextMetrics } = require('./font');
const { getPlayers, versusMode } = require('./players');

const DIFFICULTY_COLORS = { cadet: '#7dff8c', pilot: '#ffd25c', ace: '#ff3c5a' };
const POWER_SEGMENTS = 16;
const FOOTER_STEPS = [
    { size: 13, name: true, flags: true, scoreLabel: true, difficulty: true },
    { size: 13, name: false, flags: true, scoreLabel: true, difficulty: true },
    { size: 13, name: false, flags: false, scoreLabel: false, difficulty: true },
    { size: 11, name: true, flags: true, scoreLabel: true, difficulty: true },
    { size: 11, name: false, flags: false, scoreLabel: false, difficulty: false },
    { size: 10, name: false, flags: false, scoreLabel: false, difficulty: false }
];

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
        const width = Math.min(VIEW.width - 40, Math.max(300, measurePixelText(view.toast, { size: 13 }, ctx) + 32));
        panelBox(ctx, VIEW.width / 2 - width / 2, 14, width, 28, '#7fd7ff', 0.72);
        pixelText(ctx, view.toast, VIEW.width / 2, 28 + pixelTextMetrics(ctx, { size: 13 }).ascent / 2, { size: 13, align: 'center', color: '#ffffff', alpha });
    }

    // One slim, see-through strip along the bottom edge keeps the play field clear.
    const STRIP_H = 24;
    const GAP = 18;

    function footerText(game, step, opts) {
        const sector = game.level.number >= 11 ? 'II · ' : '';
        const total = getCampaignLevelCount(game.difficulty);
        const name = step.name ? ` ${String(game.level.name || '').toUpperCase()}` : '';
        const flags = step.flags ? `${opts.muted ? 'M:OFF ' : ''}${opts.crt ? 'CRT ' : ''}[V] ${game.view === 'pov' ? 'POV' : 'MAP'}` : `${opts.muted ? 'M:OFF ' : ''}${game.view === 'pov' ? 'POV' : 'MAP'}`;
        return { label: `${sector}LV ${game.level.number}/${total}${name}`, flags };
    }

    // Widest layout that fits: larger text first, then optional labels drop away.
    function footerLayout(ctx, game, opts) {
        const ship = game.ship || {};
        const weapon = ship.weapon || { type: 'blaster', tier: 1 };
        const spec = WEAPONS[weapon.type] || WEAPONS.blaster;
        const lives = Math.max(0, Number(ship.lives) || 0);
        const charging = weapon.type === 'nova' || weapon.type === 'singularity';
        const key = [VIEW.width, pixelTextMetrics(ctx, { size: 13 }).unitX, game.level.number, game.level.name, spec.name, lives, charging,
            opts.muted, opts.crt, game.view, game.difficulty, ship.miniHits > 0].join('|');
        if (view.footerKey === key) return view.footer;
        let chosen;
        for (const step of FOOTER_STEPS) {
            const m = (value) => measurePixelText(value, { size: step.size }, ctx);
            const text = footerText(game, step, opts);
            const left = 20 + POWER_SEGMENTS * 7 + 4 + m('100') + 10 + m('◇0.0') + 10 + m(spec.name.toUpperCase()) + 6 + MAX_TIER * 9 + 6
                + (charging ? 70 + m('100%') + 6 : 0) + (ship.miniHits > 0 ? m('MINI') + 6 + 5 * 6 + 6 : 0);
            const centre = m(text.label) + 8 + 96 + (step.difficulty && game.difficulty ? 10 + m(difficultyName(game).toUpperCase()) : 0);
            const right = m(text.flags) + 10 + lives * 15 + 10 + m('x99') + 10 + m('0000000') + (step.scoreLabel ? 6 + m('SCORE') : 0);
            chosen = { ...step, ...text, left, centre, right };
            if (20 + left + centre + right + GAP * 2 <= VIEW.width) break;
        }
        view.footerKey = key;
        view.footer = chosen;
        return chosen;
    }

    function drawStrip(ctx, game, dt, opts) {
        const ship = game.ship || {};
        const time = game.time || 0;
        const layout = footerLayout(ctx, game, opts);
        const size = layout.size;
        const y0 = VIEW.height - STRIP_H;
        const mid = y0 + STRIP_H / 2;
        const base = mid + pixelTextMetrics(ctx, { size }).ascent / 2;
        ctx.save();
        const bg = ctx.createLinearGradient(0, y0 - 10, 0, VIEW.height);
        bg.addColorStop(0, 'rgba(4, 8, 22, 0)');
        bg.addColorStop(0.35, 'rgba(4, 8, 22, 0.55)');
        bg.addColorStop(1, 'rgba(4, 8, 22, 0.78)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, y0 - 10, VIEW.width, STRIP_H + 10);
        ctx.fillStyle = 'rgba(86, 237, 255, 0.24)';
        ctx.fillRect(0, y0, VIEW.width, 1);

        // Power (Breathe = re-up) with the drain ghost, then shield.
        let x = 10;
        const fraction = (Number(ship.power) || 0) / Math.max(1, Number(ship.maxPower) || 100);
        view.power += (fraction - view.power) * 0.15;
        drawBreathe(ctx, x + 8, mid, 7, time, 0.95);
        x += 20;
        const lit = litSegments(fraction);
        const ghost = litSegments(view.power);
        const low = fraction <= 0.3 && Math.floor(time * 5) % 2 === 0;
        const color = low ? '#ffffff' : powerColor(fraction);
        for (let i = 0; i < POWER_SEGMENTS; i++) {
            ctx.fillStyle = i < lit ? color : i < ghost ? 'rgba(255, 90, 60, 0.55)' : 'rgba(255,255,255,0.12)';
            ctx.fillRect(x + i * 7, mid - 5, 5, 10);
        }
        x += POWER_SEGMENTS * 7 + 4;
        x += pixelText(ctx, String(Math.round(Number(ship.power) || 0)), x, base, { size, color: powerColor(fraction) }) + 10;
        if (ship.shield > 0) {
            ctx.fillStyle = PICKUP_STYLE.shield.color;
            ctx.fillRect(30, mid + 7, (POWER_SEGMENTS * 7 - 2) * Math.min(1, ship.shield / 7), 2);
            x += pixelText(ctx, `◇${ship.shield.toFixed(1)}`, x, base, { size, color: PICKUP_STYLE.shield.color }) + 10;
        }

        // Weapon, tier pips and the charge meter for Nova-class weapons.
        const weapon = ship.weapon || { type: 'blaster', tier: 1 };
        const spec = WEAPONS[weapon.type] || WEAPONS.blaster;
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(x - 6, mid - 6, 1, 12);
        x += pixelText(ctx, spec.name.toUpperCase(), x, base, { size, color: spec.color === '#1c3f8a' ? '#8fb2ff' : spec.color }) + 6;
        for (let i = 0; i < MAX_TIER; i++) {
            ctx.fillStyle = i < (weapon.tier || 1) ? spec.color : 'rgba(255,255,255,0.14)';
            ctx.fillRect(x + i * 9, mid - 4, 7, 8);
        }
        x += MAX_TIER * 9 + 6;
        const charge = Math.max(0, Math.min(1, Number(game.charge ?? ship.charge ?? 0) || 0));
        if (charge > 0 || game.charging || ship.charging) {
            ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, mid - 2, 64, 5);
            ctx.fillStyle = spec.color; ctx.fillRect(x, mid - 2, 64 * charge, 5);
            drawGlow(ctx, x + 64 * charge, mid, 10 + charge * 16, spec.color, 0.25 + charge * 0.5);
            x += 70;
            x += pixelText(ctx, `${Math.round(charge * 100)}%`, x, base, { size, color: '#ffffff' }) + 6;
        }
        if (ship.miniHits > 0) {
            x += pixelText(ctx, 'MINI', x, base, { size, color: PICKUP_STYLE.mini.color }) + 6;
            for (let i = 0; i < 5; i++) {
                ctx.fillStyle = i < ship.miniHits ? PICKUP_STYLE.mini.color : 'rgba(255,255,255,0.14)';
                ctx.fillRect(x + i * 6, mid - 3, 4, 6);
            }
        }

        // Centre: level, progress and difficulty, centred in the space between clusters.
        const regionStart = 10 + layout.left + GAP;
        const regionEnd = VIEW.width - 10 - layout.right - GAP;
        const cx = Math.max(regionStart, Math.min(regionEnd - layout.centre, (VIEW.width - layout.centre) / 2));
        const labelWidth = pixelText(ctx, layout.label, cx, base, { size, color: '#dce7f2' });
        const pw = 96;
        const px = cx + labelWidth + 8;
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(px, mid - 2, pw, 4);
        ctx.fillStyle = '#7dff8c'; ctx.fillRect(px, mid - 2, pw * Math.max(0, Math.min(1, game.levelProgress || 0)), 4);
        if (layout.difficulty && game.difficulty) pixelText(ctx, difficultyName(game).toUpperCase(), px + pw + 10, base, { size, color: difficultyColor(game.difficulty) });

        // Right: view flags, lives, combo, score.
        let rx = VIEW.width - 10;
        rx -= pixelText(ctx, layout.flags, rx, base, { size, color: '#a9bccf', align: 'right' }) + 10;
        const sprite = pixelSprite('lives', SHIP_TOP, SHIP_PALETTE, 1);
        const lives = Math.max(0, Number(ship.lives) || 0);
        for (let i = 0; i < lives; i++) {
            rx -= 15;
            if (sprite) { ctx.imageSmoothingEnabled = false; ctx.drawImage(sprite, rx, mid - 8, 13, sprite.height * 13 / sprite.width); }
        }
        rx -= 10;
        const combo = Number(game.combo) || 0;
        if (combo > view.combo) view.comboPop = 1;
        view.combo = combo;
        view.comboPop = Math.max(0, view.comboPop - dt * 3);
        if (combo >= 2) {
            const hue = Math.round((150 + 45 * Math.sin(time * 4)) / 15) * 15;
            const pop = 1 + view.comboPop * 0.4;
            drawGlow(ctx, rx - 20, mid, 22 * pop, `hsl(${hue}, 100%, 60%)`, 0.2);
            rx -= pixelText(ctx, `x${combo}`, rx, base, { size: Math.round(size * pop), color: `hsl(${hue}, 100%, 72%)`, align: 'right' }) + 10;
        }
        view.score = rollUp(view.score, game.score, dt);
        const rolling = Math.round(view.score) !== game.score;
        rx -= pixelText(ctx, String(Math.round(view.score)).padStart(7, '0'), rx, base, { size, color: rolling ? '#ffe65c' : '#ffffff', align: 'right' }) + 6;
        if (layout.scoreLabel) pixelText(ctx, 'SCORE', rx, base, { size, color: '#a9bccf', align: 'right' });
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
