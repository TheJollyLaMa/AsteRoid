const { VIEW } = require('./projection');
const { WEAPONS, MAX_TIER } = require('../weapons');
const { LEVEL_COUNT, getLevel } = require('../levels');
const { PICKUP_STYLE } = require('./shapes');

const FONT = 'monospace';

function text(ctx, value, x, y, { size = 14, color = '#e8f6ff', align = 'left', weight = 'bold' } = {}) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
}

function powerColor(fraction) {
    if (fraction > 0.6) return '#7dff8c';
    if (fraction > 0.3) return '#ffd25c';
    return '#ff5a3c';
}

function drawPowerBar(ctx, ship, time) {
    const x = 16;
    const y = VIEW.height - 34;
    const width = 220;
    const fraction = ship.power / ship.maxPower;
    text(ctx, 'POWER', x, y - 6, { size: 12, color: '#9fb4c8' });
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(x, y, width, 14);
    const lowPulse = fraction <= 0.3 && Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = lowPulse ? '#ffffff' : powerColor(fraction);
    ctx.fillRect(x, y, width * fraction, 14);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.strokeRect(x + 0.5, y + 0.5, width, 14);
    if (ship.shield > 0) {
        text(ctx, `SHIELD ${ship.shield.toFixed(1)}s`, x + width + 12, y + 12, { size: 12, color: PICKUP_STYLE.shield.color });
    }
}

function drawWeapon(ctx, ship) {
    const spec = WEAPONS[ship.weapon.type];
    const x = 16;
    const y = VIEW.height - 52;
    text(ctx, spec.name.toUpperCase(), x, y - 6, { size: 13, color: spec.color });
    for (let i = 0; i < MAX_TIER; i++) {
        ctx.fillStyle = i < ship.weapon.tier ? spec.color : 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(x + 150 + i * 14, y - 16, 10, 10);
    }
}

function drawLives(ctx, ship) {
    for (let i = 0; i < ship.lives; i++) {
        const x = VIEW.width - 24 - i * 22;
        ctx.beginPath();
        ctx.moveTo(x, 14);
        ctx.lineTo(x + 7, 30);
        ctx.lineTo(x - 7, 30);
        ctx.closePath();
        ctx.strokeStyle = '#7fd7ff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}

function drawProgress(ctx, game) {
    const width = 260;
    const x = (VIEW.width - width) / 2;
    text(ctx, `LEVEL ${game.level.number}/${LEVEL_COUNT} · ${game.level.name.toUpperCase()}`, VIEW.width / 2, 20, {
        size: 13,
        align: 'center'
    });
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(x, 28, width, 5);
    ctx.fillStyle = '#7dff8c';
    ctx.fillRect(x, 28, width * game.levelProgress, 5);
}

function drawRadar(ctx, game) {
    const width = 120;
    const height = 150;
    const x = VIEW.width - width - 12;
    const y = 42;
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
    ctx.fillStyle = 'rgba(4, 12, 24, 0.75)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = 'rgba(127, 215, 255, 0.5)';
    ctx.strokeRect(x + 0.5, y + 0.5, width, height);
    for (const asteroid of game.asteroids) {
        const p = toRadar(asteroid);
        if (!inside(p)) continue;
        ctx.fillStyle = asteroid.shooter ? '#ff8a5c' : '#bdb8ad';
        const s = Math.max(2, asteroid.size * scaleX * 1.6);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    for (const pickup of game.pickups) {
        const p = toRadar(pickup);
        if (!inside(p)) continue;
        ctx.fillStyle = PICKUP_STYLE[pickup.type].color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.fillStyle = '#ff5a3c';
    for (const bullet of game.enemyBullets) {
        const p = toRadar(bullet);
        if (inside(p)) ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    const shipPoint = toRadar(game.ship);
    ctx.fillStyle = '#7fd7ff';
    ctx.beginPath();
    ctx.moveTo(shipPoint.x, shipPoint.y - 5);
    ctx.lineTo(shipPoint.x + 4, shipPoint.y + 3);
    ctx.lineTo(shipPoint.x - 4, shipPoint.y + 3);
    ctx.fill();
    text(ctx, 'RADAR', x + 4, y + 12, { size: 10, color: '#9fb4c8' });
    ctx.restore();
}

function drawHud(ctx, game) {
    if (game.state === 'title') return;
    const ship = game.ship;
    text(ctx, `SCORE ${game.score}`, 16, 22, { size: 16 });
    text(ctx, `HI ${Math.max(game.progress.highScore, game.score)}`, 16, 40, { size: 11, color: '#9fb4c8' });
    drawProgress(ctx, game);
    drawLives(ctx, ship);
    drawWeapon(ctx, ship);
    drawPowerBar(ctx, ship, game.time);
    const viewLabel = game.view === 'pov' ? 'POV' : 'OVERVIEW';
    text(ctx, `[V] ${viewLabel}`, VIEW.width - 16, VIEW.height - 18, { size: 12, color: '#9fb4c8', align: 'right' });
    if (game.view === 'pov') drawRadar(ctx, game);
}

function panel(ctx, height = 230) {
    ctx.fillStyle = 'rgba(2, 4, 12, 0.78)';
    ctx.fillRect(0, (VIEW.height - height) / 2, VIEW.width, height);
}

function drawTitle(ctx, game) {
    ctx.fillStyle = 'rgba(2, 4, 12, 0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const cx = VIEW.width / 2;
    text(ctx, '☄  AsteRoid  ☄', cx, 130, { size: 52, align: 'center', color: '#7fd7ff' });
    text(ctx, 'GALACTIC GAUNTLET', cx, 166, { size: 18, align: 'center', color: '#ff8a5c' });

    const level = getLevel(game.selectedLevel);
    const canLeft = game.selectedLevel > 1;
    const canRight = game.selectedLevel < game.progress.unlocked;
    text(ctx, `${canLeft ? '◀' : ' '}  LEVEL ${level.number}: ${level.name.toUpperCase()}  ${canRight ? '▶' : ' '}`, cx, 232, {
        size: 20,
        align: 'center'
    });
    text(ctx, `Unlocked ${game.progress.unlocked}/${LEVEL_COUNT} · High score ${game.progress.highScore}`, cx, 258, {
        size: 12,
        align: 'center',
        color: '#9fb4c8'
    });
    const pulse = 0.55 + 0.45 * Math.sin(game.time * 4);
    text(ctx, 'PRESS ENTER TO LAUNCH', cx, 304, { size: 20, align: 'center', color: `rgba(125, 255, 140, ${pulse})` });

    const controls = [
        '←/→ or A/D  steer      ↑/↓ or W/S  throttle',
        'SPACE  fire (hold)     V  switch overview / POV',
        'P  pause    M  mute    Q  menu (paused / game over)',
        '',
        'Fly through pickups:  S spread · R rapid · P plasma',
        '+ power cell · ◎ shield.  Orange-core rocks shoot back!'
    ];
    controls.forEach((line, i) => text(ctx, line, cx, 370 + i * 22, { size: 14, align: 'center', color: '#c9d6e3', weight: 'normal' }));
}

function drawOverlay(ctx, game) {
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    switch (game.state) {
        case 'title':
            drawTitle(ctx, game);
            break;
        case 'paused':
            panel(ctx, 160);
            text(ctx, 'PAUSED', cx, cy - 10, { size: 40, align: 'center' });
            text(ctx, 'P / Enter resume · Q menu · V switch view', cx, cy + 30, { size: 14, align: 'center', color: '#9fb4c8' });
            break;
        case 'levelComplete':
            panel(ctx);
            text(ctx, `LEVEL ${game.level.number} CLEAR`, cx, cy - 30, { size: 40, align: 'center', color: '#7dff8c' });
            text(ctx, `Bonus +${game.levelBonus}`, cx, cy + 10, { size: 18, align: 'center' });
            text(ctx, `Next: ${getLevel(game.level.number + 1).name}  ·  Enter to jump now`, cx, cy + 44, {
                size: 14,
                align: 'center',
                color: '#9fb4c8'
            });
            break;
        case 'gameOver':
            panel(ctx);
            text(ctx, 'GAME OVER', cx, cy - 30, { size: 46, align: 'center', color: '#ff5a3c' });
            text(ctx, `Score ${game.score}`, cx, cy + 10, { size: 18, align: 'center' });
            text(ctx, `Enter retry level ${game.level.number} · Q menu`, cx, cy + 44, { size: 14, align: 'center', color: '#9fb4c8' });
            break;
        case 'victory':
            panel(ctx, 260);
            text(ctx, 'YOU CLEARED THE CORE!', cx, cy - 40, { size: 36, align: 'center', color: '#7dff8c' });
            text(ctx, `Final score ${game.score}`, cx, cy + 4, { size: 20, align: 'center' });
            text(ctx, 'All 10 levels complete · Enter for menu', cx, cy + 40, { size: 14, align: 'center', color: '#9fb4c8' });
            break;
        case 'playing':
            if (game.showLevelIntro) {
                text(ctx, `LEVEL ${game.level.number}`, cx, cy - 40, { size: 44, align: 'center', color: '#7fd7ff' });
                text(ctx, game.level.name.toUpperCase(), cx, cy - 6, { size: 20, align: 'center', color: '#ff8a5c' });
            }
            break;
        default:
            break;
    }
}

module.exports = { drawHud, drawOverlay };
