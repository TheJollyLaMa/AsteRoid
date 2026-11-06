const { drawGlow, drawAsteroid } = require('./shapes');
const { getImage, supporterImageKey } = require('./assets');
const { pixelText } = require('./font');
const { VIEW } = require('./projection');

const alive = (guard) => guard && guard.alive !== false && guard.hp !== 0 && !guard.destroyed;
const guardList = (game, vault) => (Array.isArray(vault && vault.guards) ? vault.guards : (Array.isArray(game && game.guards) ? game.guards : [])).filter(alive);

function shielded(vault, guards) {
    if (!vault) return false;
    if (vault.shielded === false || vault.invulnerable === false) return false;
    const generator = vault.generator || vault.shieldGenerator;
    return Boolean(vault.shielded || vault.invulnerable || (generator && generator.active !== false) || guards.length);
}

function drawVaultGlyph(ctx, x, y, radius, time, vault, guards = []) {
    const active = shielded(vault, guards);
    const color = active ? '#7dff8c' : '#ffe65c';
    const pulse = 0.72 + Math.sin(time * 5) * 0.22;
    drawGlow(ctx, x, y, radius * 2.8, color, 0.75 * pulse);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * (active ? 0.35 : 0.12));
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, radius * 0.08);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([radius * 0.32, radius * 0.2]);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#100a1e';
    ctx.beginPath();
    ctx.moveTo(0, -radius); ctx.lineTo(radius * 0.82, -radius * 0.3); ctx.lineTo(radius * 0.72, radius * 0.65);
    ctx.lineTo(0, radius); ctx.lineTo(-radius * 0.72, radius * 0.65); ctx.lineTo(-radius * 0.82, -radius * 0.3); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff4c8'; ctx.lineWidth = Math.max(1, radius * 0.045); ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(-radius * 0.2, -radius * 0.22, radius * 0.4, radius * 0.44);
    ctx.restore();
    if (active) {
        pixelText(ctx, 'SHIELDED', x, y - radius * 2.15, { size: 10, align: 'center', color: '#ff8ac4' });
    } else {
        pixelText(ctx, 'SUPPORTER VAULT', x, y - radius * 2.15, { size: 10, align: 'center', color: '#ffe65c' });
    }
}

function drawGenerator(ctx, x, y, scale, time) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    drawGlow(ctx, x, y, 35 * scale, '#6ffaff', 0.9);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-time * 1.8);
    ctx.strokeStyle = '#b7ffff';
    ctx.lineWidth = Math.max(1, 3 * scale);
    ctx.beginPath(); ctx.arc(0, 0, 18 * scale, 0, Math.PI * 1.7); ctx.stroke();
    ctx.fillStyle = '#4effff';
    ctx.fillRect(-5 * scale, -5 * scale, 10 * scale, 10 * scale);
    ctx.restore();
}

function drawGuards(ctx, guards, project, time, sector2 = false, world = []) {
    const rendered = new Set(world.map(rock => rock.id));
    guards.forEach((guard) => {
        if (rendered.has(guard.id)) return;
        const point = project(guard);
        if (!point) return;
        const radius = Math.min(160, (Number(guard.size) || 22) * (point.scale || 1));
        if (point.x + radius < 0 || point.x - radius > VIEW.width || point.y + radius < 0 || point.y - radius > VIEW.height) return;
        drawAsteroid(ctx, { ...guard, shooter: true }, point.x, point.y, radius, 1, time, sector2);
    });
}

function drawVault(ctx, game, scrollY, time, project, onScreen) {
    const vault = game && game.vault;
    if (!vault || vault.active === false || vault.captured) return;
    const guards = guardList(game, vault);
    drawGuards(ctx, guards, (point) => project(point, scrollY), time, Number(game.level && game.level.number) >= 11, game.asteroids || []);
    const point = project(vault, scrollY);
    if (!point || (onScreen && !onScreen(point, 100))) return;
    drawVaultGlyph(ctx, point.x, point.y, Math.max(16, Number(vault.size) || 28), time, vault, guards);
    const generator = vault.generator || vault.shieldGenerator || guards.find((guard) => guard.kind === 'generator');
    if (generator) {
        const genPoint = project({ x: generator.x ?? vault.x, y: generator.y ?? vault.y }, scrollY);
        if (genPoint) drawGenerator(ctx, genPoint.x, genPoint.y, genPoint.scale || 1, time);
    }
}

function drawVaultPov(ctx, game, camera, project, time) {
    const vault = game && game.vault;
    if (!vault || vault.active === false || vault.captured) return;
    const guards = guardList(game, vault);
    drawGuards(ctx, guards, (point) => project(point, camera), time, Number(game.level && game.level.number) >= 11, game.asteroids || []);
    const point = project(vault, camera);
    if (point) {
        const scale = Math.min(20, Math.max(0.35, point.scale));
        const radius = Math.min(160, Math.max(9, (Number(vault.size) || 24) * scale));
        if (point.x + radius * 2 < 0 || point.x - radius * 2 > VIEW.width || point.y + radius * 2 < 0 || point.y - radius * 2 > VIEW.height) return;
        drawVaultGlyph(ctx, point.x, point.y, radius, time, vault, guards);
        const generator = vault.generator || vault.shieldGenerator || guards.find((guard) => guard.kind === 'generator');
        const genPoint = generator && project(generator, camera);
        if (genPoint) drawGenerator(ctx, genPoint.x, genPoint.y, Math.min(8, genPoint.scale), time);
    }
}

function drawSupporterToken(ctx, tokenId, x, y, size) {
    const key = supporterImageKey(tokenId);
    const image = key && getImage(key);
    if (image) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = '#fff4c8';
        ctx.shadowBlur = 20;
        ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
        ctx.restore();
        return true;
    }
    drawGlow(ctx, x, y, size * 0.8, '#ffe65c', 0.8);
    ctx.fillStyle = '#100a1e';
    ctx.strokeStyle = '#fff4c8';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, size * 0.36, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    pixelText(ctx, 'D', x, y + size * 0.12, { size: Math.max(14, size * 0.46), color: '#ffe65c', align: 'center' });
    return false;
}

module.exports = { drawVault, drawVaultPov, drawVaultGlyph, drawSupporterToken, guardList, shielded };
