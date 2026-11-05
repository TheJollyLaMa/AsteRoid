const { VIEW, POV, povCamera, projectPov, povFade } = require('./projection');
const { drawAsteroid, drawPickup, drawShipChase, drawPlayerBullet, drawEnemyBullet, drawGlow } = require('./shapes');
const { levelTint, createStarfield, drawNebula } = require('./background');
const { getImage } = require('./assets');
const { getPlayers, playerScale } = require('./players');
const { drawVaultPov } = require('./vault');

const FLOOR_HEIGHT = -40;
const GRID_STEP = 100;

function createPovRenderer() {
    const stars = createStarfield(170, VIEW.width * 2, POV.horizon, 23);

    function drawBackdrop(ctx, game, camera) {
        const time = game.time || 0;
        const [top, bottom] = levelTint(game.level.number);
        const sky = ctx.createLinearGradient(0, 0, 0, POV.horizon);
        sky.addColorStop(0, top);
        sky.addColorStop(1, bottom);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, VIEW.width, POV.horizon);
        const floor = ctx.createLinearGradient(0, POV.horizon, 0, VIEW.height);
        floor.addColorStop(0, bottom);
        floor.addColorStop(0.25, '#05030c');
        floor.addColorStop(1, '#020106');
        ctx.fillStyle = floor;
        ctx.fillRect(0, POV.horizon, VIEW.width, VIEW.height - POV.horizon);

        const shift = camera.x * 0.15;
        for (const star of stars) {
            const x = (((star.x - shift) % (VIEW.width * 2)) + VIEW.width * 2) % (VIEW.width * 2) - VIEW.width / 2;
            ctx.globalAlpha = 0.35 + 0.55 * star.depth * (0.6 + 0.4 * Math.sin(time * 3 + star.twinkle));
            ctx.fillStyle = star.color;
            const s = star.depth > 0.8 ? 2 : 1;
            ctx.fillRect(Math.round(x), Math.round(star.y), s, s);
        }
        ctx.globalAlpha = 1;

        // Mandelblum moon rising over the horizon, parallaxing with steering.
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, VIEW.width, POV.horizon);
        ctx.clip();
        drawNebula(ctx, game.level.number, VIEW.width / 2 - (camera.x - 400) * 0.35, POV.horizon - 40, 760, 0.6);
        ctx.restore();

        // Horizon glow line.
        const hz = ctx.createLinearGradient(0, POV.horizon - 18, 0, POV.horizon + 18);
        hz.addColorStop(0, 'rgba(63, 184, 255, 0)');
        hz.addColorStop(0.5, 'rgba(63, 184, 255, 0.45)');
        hz.addColorStop(1, 'rgba(63, 184, 255, 0)');
        ctx.fillStyle = hz;
        ctx.fillRect(0, POV.horizon - 18, VIEW.width, 36);

        ctx.save();
        ctx.lineWidth = 1;
        const nearY = camera.y + POV.near + 4;
        const farY = camera.y + POV.far;
        ctx.globalCompositeOperation = 'lighter';
        for (let x = -800; x <= 1600; x += GRID_STEP) {
            const a = projectPov({ x, y: nearY }, camera, FLOOR_HEIGHT);
            const b = projectPov({ x, y: farY }, camera, FLOOR_HEIGHT);
            const edge = x === 0 || x === 800;
            ctx.strokeStyle = edge ? 'rgba(125, 255, 140, 0.7)' : 'rgba(170, 90, 255, 0.3)';
            ctx.lineWidth = edge ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        ctx.lineWidth = 1;
        for (let y = Math.ceil(nearY / GRID_STEP) * GRID_STEP; y < farY; y += GRID_STEP) {
            const a = projectPov({ x: -800, y }, camera, FLOOR_HEIGHT);
            const b = projectPov({ x: 1600, y }, camera, FLOOR_HEIGHT);
            ctx.strokeStyle = `rgba(127, 215, 255, ${0.4 * povFade(a.depth)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        ctx.restore();

        const gate = projectPov({ x: 400, y: game.level.length }, camera, 40);
        if (gate && gate.depth < POV.far * 1.3) {
            const alpha = Math.max(0.25, povFade(gate.depth));
            const size = Math.min(2000, 900 * gate.scale);
            const img = getImage(game.level.number >= 11 ? 'gate-sector2' : 'gate') || getImage('gate');
            if (img) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha;
                ctx.drawImage(img, gate.x - size / 2, gate.y - size / 2, size, size);
                ctx.restore();
            }
            drawGlow(ctx, gate.x, gate.y, size * 0.6, game.level.number >= 11 ? '#67faff' : '#7dff8c', alpha * 0.45);
            const left = projectPov({ x: 0, y: game.level.length }, camera, 160);
            const right = projectPov({ x: 800, y: game.level.length }, camera, FLOOR_HEIGHT);
            if (left && right) {
                ctx.save();
                ctx.strokeStyle = '#7dff8c';
                ctx.lineWidth = Math.max(1, gate.scale * 6);
                ctx.globalAlpha = alpha;
                ctx.setLineDash([Math.max(4, 30 * gate.scale), Math.max(3, 18 * gate.scale)]);
                ctx.lineDashOffset = -time * 60;
                ctx.strokeRect(left.x, left.y, right.x - left.x, right.y - left.y);
                ctx.restore();
            }
        }
    }

    function collectRenderables(game, camera) {
        const items = [];
        const add = (kind, obj, height = 0) => {
            const p = projectPov(obj, camera, height);
            if (p && p.depth < POV.far) items.push({ kind, obj, p });
        };
        (game.asteroids || []).forEach((a) => add('asteroid', a));
        (game.pickups || []).forEach((pk) => add('pickup', pk));
        (game.enemyBullets || []).forEach((b) => add('enemyBullet', b));
        (game.playerBullets || []).forEach((b) => add('playerBullet', b));
        (game.particles || []).forEach((pt) => add('particle', pt));
        items.sort((a, b) => b.p.depth - a.p.depth);
        return items;
    }

    function drawRenderable(ctx, game, camera, item) {
        const { kind, obj, p } = item;
        const alpha = povFade(p.depth);
        const time = game.time || 0;
        if (kind === 'asteroid') {
            const radius = obj.size * p.scale;
            if (radius > 1400 || p.x + radius < 0 || p.x - radius > VIEW.width) return;
            drawAsteroid(ctx, obj, p.x, p.y, radius, alpha, time, game.level.number >= 11);
        } else if (kind === 'pickup') {
            drawPickup(ctx, obj, p.x, p.y, Math.min(120, obj.size * p.scale), time, alpha);
        } else if (kind === 'enemyBullet') {
            drawEnemyBullet(ctx, obj, p.x, p.y, Math.min(6, p.scale), alpha, time);
        } else if (kind === 'playerBullet') {
            const ahead = projectPov({ x: obj.x + obj.vx * 0.05, y: obj.y + obj.vy * 0.05 }, camera, 0);
            const dx = ahead ? ahead.x - p.x : 0;
            const dy = ahead ? ahead.y - p.y : -1;
            drawPlayerBullet(ctx, obj, p.x, p.y, dx, dy, Math.min(3, Math.max(0.35, p.scale)), alpha, time);
        } else {
            ctx.globalAlpha = alpha * Math.max(0, obj.life / obj.maxLife);
            ctx.fillStyle = obj.color;
            const s = Math.max(1, Math.min(10, p.scale * 2.5));
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
            ctx.globalAlpha = 1;
        }
    }

    function drawReticle(ctx, camera, ship, time) {
        const p = projectPov({ x: ship.x, y: ship.y + 420 }, camera, 0);
        if (!p) return;
        ctx.save();
        ctx.translate(Math.round(p.x), Math.round(p.y));
        ctx.strokeStyle = 'rgba(127, 215, 255, 0.85)';
        ctx.lineWidth = 2;
        const r = 12 + Math.sin(time * 6) * 1.5;
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(r, -6);
            ctx.lineTo(r + 6, 0);
            ctx.lineTo(r, 6);
            ctx.stroke();
        }
        ctx.fillStyle = '#3fb8ff';
        ctx.fillRect(-1, -1, 3, 3);
        ctx.restore();
    }

    return function renderPov(ctx, game, fx) {
        const camera = povCamera(game.ship);
        const time = game.time || 0;
        drawBackdrop(ctx, game, camera);
        for (const item of collectRenderables(game, camera)) drawRenderable(ctx, game, camera, item);
        if (fx) {
            fx.drawWorld(ctx, (pt) => {
                const p = projectPov(pt, camera, 0);
                if (!p || p.depth > POV.far) return null;
                return { x: p.x, y: p.y, scale: Math.min(1.8, p.scale), alpha: povFade(p.depth) * (p.scale > 1.4 ? 0.7 : 1) };
            });
        }
        drawVaultPov(ctx, game, camera, projectPov, time);
        if (game.state === 'playing' || game.state === 'paused' || game.state === 'levelComplete') {
            const players = getPlayers(game);
            players.forEach(({ ship, index, color }) => {
                const shipPoint = projectPov(ship, camera, 0);
                if (!shipPoint) return;
                const size = playerScale(players.length, ship);
                drawGlow(ctx, shipPoint.x, shipPoint.y, 52 * size, color, 0.35);
                if (index === 0) drawReticle(ctx, camera, ship, time);
                ctx.save(); ctx.translate(shipPoint.x, shipPoint.y); ctx.scale(size, size);
                drawShipChase(ctx, ship, 0, 0, time, fx ? fx.ripples : []);
                ctx.fillStyle = color; ctx.fillRect(-8, 3, 16, 5);
                ctx.restore();
            });
        }
    };
}

module.exports = { createPovRenderer };
