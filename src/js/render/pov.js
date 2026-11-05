const { VIEW, POV, povCamera, projectPov, povFade } = require('./projection');
const { drawAsteroid, drawPickup, drawShipChase, drawGlowDot } = require('./shapes');

const FLOOR_HEIGHT = -40;
const GRID_STEP = 100;

function createPovRenderer() {
    const stars = Array.from({ length: 160 }, () => ({
        x: Math.random() * VIEW.width * 2,
        y: Math.random() * POV.horizon,
        size: Math.random() * 1.6 + 0.4
    }));

    function drawBackdrop(ctx, game, camera) {
        const sky = ctx.createLinearGradient(0, 0, 0, POV.horizon);
        sky.addColorStop(0, '#02020a');
        sky.addColorStop(1, '#1c0f33');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, VIEW.width, POV.horizon);
        ctx.fillStyle = '#05030c';
        ctx.fillRect(0, POV.horizon, VIEW.width, VIEW.height - POV.horizon);

        const shift = camera.x * 0.15;
        for (const star of stars) {
            const x = (((star.x - shift) % (VIEW.width * 2)) + VIEW.width * 2) % (VIEW.width * 2) - VIEW.width / 2;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillRect(x, star.y, star.size, star.size);
        }

        ctx.save();
        ctx.lineWidth = 1;
        const nearY = camera.y + POV.near + 4;
        const farY = camera.y + POV.far;
        for (let x = -800; x <= 1600; x += GRID_STEP) {
            const a = projectPov({ x, y: nearY }, camera, FLOOR_HEIGHT);
            const b = projectPov({ x, y: farY }, camera, FLOOR_HEIGHT);
            const edge = x === 0 || x === 800;
            ctx.strokeStyle = edge ? 'rgba(125, 255, 140, 0.55)' : 'rgba(140, 90, 255, 0.22)';
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        for (let y = Math.ceil(nearY / GRID_STEP) * GRID_STEP; y < farY; y += GRID_STEP) {
            const a = projectPov({ x: -800, y }, camera, FLOOR_HEIGHT);
            const b = projectPov({ x: 1600, y }, camera, FLOOR_HEIGHT);
            ctx.strokeStyle = `rgba(140, 90, 255, ${0.3 * povFade(a.depth)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        ctx.restore();

        const gate = projectPov({ x: 400, y: game.level.length }, camera, 0);
        if (gate && gate.depth < POV.far) {
            const left = projectPov({ x: 0, y: game.level.length }, camera, 120);
            const right = projectPov({ x: 800, y: game.level.length }, camera, FLOOR_HEIGHT);
            ctx.save();
            ctx.strokeStyle = '#7dff8c';
            ctx.shadowColor = '#7dff8c';
            ctx.shadowBlur = 12;
            ctx.lineWidth = Math.max(1, gate.scale * 6);
            ctx.globalAlpha = povFade(gate.depth);
            ctx.strokeRect(left.x, left.y, right.x - left.x, right.y - left.y);
            ctx.restore();
        }
    }

    function collectRenderables(game, camera) {
        const items = [];
        const add = (kind, obj, height = 0) => {
            const p = projectPov(obj, camera, height);
            if (p && p.depth < POV.far) items.push({ kind, obj, p });
        };
        game.asteroids.forEach((a) => add('asteroid', a));
        game.pickups.forEach((pk) => add('pickup', pk));
        game.enemyBullets.forEach((b) => add('enemyBullet', b));
        game.playerBullets.forEach((b) => add('playerBullet', b));
        game.particles.forEach((pt) => add('particle', pt));
        items.sort((a, b) => b.p.depth - a.p.depth);
        return items;
    }

    function drawRenderable(ctx, game, item) {
        const { kind, obj, p } = item;
        const alpha = povFade(p.depth);
        if (kind === 'asteroid') {
            const radius = obj.size * p.scale;
            if (radius > 1400 || p.x + radius < 0 || p.x - radius > VIEW.width) return;
            drawAsteroid(ctx, obj, p.x, p.y, radius, alpha);
        } else if (kind === 'pickup') {
            drawPickup(ctx, obj, p.x, p.y, Math.min(120, obj.size * p.scale), game.time, alpha);
        } else if (kind === 'enemyBullet') {
            drawGlowDot(ctx, p.x, p.y, Math.max(2, Math.min(40, obj.size * p.scale)), obj.color, alpha);
        } else if (kind === 'playerBullet') {
            drawGlowDot(ctx, p.x, p.y, Math.max(1.5, Math.min(obj.pierce ? 22 : 9, obj.size * p.scale)), obj.color, alpha);
        } else {
            ctx.globalAlpha = alpha * Math.max(0, obj.life / obj.maxLife);
            ctx.fillStyle = obj.color;
            const s = Math.max(1, Math.min(10, p.scale * 2.5));
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
            ctx.globalAlpha = 1;
        }
    }

    function drawReticle(ctx, camera, ship) {
        const p = projectPov({ x: ship.x, y: ship.y + 420 }, camera, 0);
        ctx.save();
        ctx.strokeStyle = 'rgba(127, 215, 255, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        [[-20, 0, -8, 0], [8, 0, 20, 0], [0, -20, 0, -8], [0, 8, 0, 20]].forEach(([x1, y1, x2, y2]) => {
            ctx.moveTo(p.x + x1, p.y + y1);
            ctx.lineTo(p.x + x2, p.y + y2);
        });
        ctx.stroke();
        ctx.restore();
    }

    return function renderPov(ctx, game) {
        const camera = povCamera(game.ship);
        drawBackdrop(ctx, game, camera);
        for (const item of collectRenderables(game, camera)) drawRenderable(ctx, game, item);
        if (game.state === 'playing' || game.state === 'paused' || game.state === 'levelComplete') {
            drawReticle(ctx, camera, game.ship);
            const shipPoint = projectPov(game.ship, camera, 0);
            drawShipChase(ctx, game.ship, shipPoint.x, shipPoint.y);
        }
    };
}

module.exports = { createPovRenderer };
