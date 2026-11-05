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
