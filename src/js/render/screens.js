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
