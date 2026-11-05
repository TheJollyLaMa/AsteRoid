const { VIEW, projectOverview } = require('./projection');
const { drawAsteroid, drawPickup, drawShipTop, drawGlowDot } = require('./shapes');

function createOverviewRenderer() {
    const stars = Array.from({ length: 140 }, () => ({
        x: Math.random() * VIEW.width,
        y: Math.random() * VIEW.height,
        depth: 0.15 + Math.random() * 0.85
    }));

    return function renderOverview(ctx, game) {
        const { scrollY } = game;
        ctx.fillStyle = '#04040c';
        ctx.fillRect(0, 0, VIEW.width, VIEW.height);

        for (const star of stars) {
            const y = (star.y + scrollY * star.depth * 0.6) % VIEW.height;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + star.depth * 0.6})`;
            ctx.fillRect(star.x, y, star.depth * 2, star.depth * 2);
        }

        const exit = projectOverview({ x: 0, y: game.level.length }, scrollY);
        if (exit.y > -10 && exit.y < VIEW.height + 10) {
            ctx.save();
            ctx.setLineDash([14, 10]);
            ctx.strokeStyle = '#7dff8c';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, exit.y);
            ctx.lineTo(VIEW.width, exit.y);
            ctx.stroke();
            ctx.fillStyle = '#7dff8c';
            ctx.font = 'bold 14px monospace';
            ctx.fillText('JUMP GATE', 12, exit.y - 8);
            ctx.restore();
        }

        const onScreen = (p, margin) => p.y > -margin && p.y < VIEW.height + margin;

        for (const pickup of game.pickups) {
            const p = projectOverview(pickup, scrollY);
            if (onScreen(p, 30)) drawPickup(ctx, pickup, p.x, p.y, pickup.size, game.time);
        }

        for (const asteroid of game.asteroids) {
            const p = projectOverview(asteroid, scrollY);
            if (onScreen(p, 60)) drawAsteroid(ctx, asteroid, p.x, p.y, asteroid.size);
        }

        for (const bullet of game.playerBullets) {
            const p = projectOverview(bullet, scrollY);
            if (!onScreen(p, 20)) continue;
            ctx.save();
            ctx.strokeStyle = bullet.color;
            ctx.shadowColor = bullet.color;
            ctx.shadowBlur = 8;
            ctx.lineWidth = bullet.size;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - bullet.vx * 0.02, p.y + bullet.vy * 0.02);
            ctx.stroke();
            ctx.restore();
        }

        for (const bullet of game.enemyBullets) {
            const p = projectOverview(bullet, scrollY);
            if (onScreen(p, 20)) drawGlowDot(ctx, p.x, p.y, bullet.size, bullet.color);
        }

        for (const particle of game.particles) {
            const p = projectOverview(particle, scrollY);
            ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
            ctx.fillStyle = particle.color;
            ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;

        if (game.state === 'playing' || game.state === 'paused' || game.state === 'levelComplete') {
            const p = projectOverview(game.ship, scrollY);
            drawShipTop(ctx, game.ship, p.x, p.y);
        }
    };
}

module.exports = { createOverviewRenderer };
