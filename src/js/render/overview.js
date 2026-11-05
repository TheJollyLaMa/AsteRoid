const { VIEW, projectOverview } = require('./projection');
const { drawAsteroid, drawPickup, drawShipTop, drawPlayerBullet, drawEnemyBullet, drawGlow } = require('./shapes');
const { createOverviewBackground } = require('./background');
const { getImage } = require('./assets');
const { pixelText } = require('./font');

function drawJumpGate(ctx, y, time) {
    const gate = getImage('gate');
    if (gate) {
        const size = 220 + 10 * Math.sin(time * 2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.85;
        ctx.drawImage(gate, VIEW.width / 2 - size / 2, y - size / 2, size, size);
        ctx.restore();
    }
    drawGlow(ctx, VIEW.width / 2, y, 140, '#7dff8c', 0.25 + 0.1 * Math.sin(time * 4));
    ctx.save();
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -time * 40;
    ctx.strokeStyle = '#7dff8c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW.width, y);
    ctx.stroke();
    ctx.restore();
    pixelText(ctx, '>> JUMP GATE <<', 12, y - 10, { size: 14, color: '#7dff8c' });
}

function createOverviewRenderer() {
    const background = createOverviewBackground();

    return function renderOverview(ctx, game, fx) {
        const { scrollY } = game;
        const time = game.time || 0;
        background(ctx, game);

        const exit = projectOverview({ x: 0, y: game.level.length }, scrollY);
        if (exit.y > -160 && exit.y < VIEW.height + 160) drawJumpGate(ctx, exit.y, time);

        const onScreen = (p, margin) => p.y > -margin && p.y < VIEW.height + margin;

        for (const pickup of game.pickups) {
            const p = projectOverview(pickup, scrollY);
            if (onScreen(p, 40)) drawPickup(ctx, pickup, p.x, p.y, pickup.size, time);
        }

        for (const asteroid of game.asteroids) {
            const p = projectOverview(asteroid, scrollY);
            if (onScreen(p, 80)) drawAsteroid(ctx, asteroid, p.x, p.y, asteroid.size, 1, time);
        }

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
            const p = projectOverview(game.ship, scrollY);
            drawShipTop(ctx, game.ship, p.x, p.y, time, fx ? fx.ripples : []);
        }
    };
}

module.exports = { createOverviewRenderer };
