const { WEAPONS } = require('../weapons');

const PICKUP_STYLE = {
    spread: { color: WEAPONS.spread.color, label: 'S' },
    rapid: { color: WEAPONS.rapid.color, label: 'R' },
    plasma: { color: WEAPONS.plasma.color, label: 'P' },
    power: { color: '#7dff8c', label: '+' },
    shield: { color: '#6fa8ff', label: '◎' }
};

function drawAsteroid(ctx, asteroid, x, y, radius, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(asteroid.rotation);
    ctx.beginPath();
    const points = asteroid.shape.length;
    asteroid.shape.forEach((factor, i) => {
        const angle = (i / points) * Math.PI * 2;
        const px = Math.cos(angle) * radius * factor;
        const py = Math.sin(angle) * radius * factor;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = asteroid.flash > 0 ? '#ffffff' : asteroid.shooter ? '#2b1712' : '#1c1c22';
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius / 18);
    ctx.strokeStyle = asteroid.shooter ? '#ff8a5c' : '#d8d2c4';
    ctx.stroke();
    if (asteroid.shooter) {
        const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 140 + asteroid.id);
        ctx.rotate(-asteroid.rotation);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 70, 40, ${pulse})`;
        ctx.shadowColor = '#ff4628';
        ctx.shadowBlur = radius * 0.8;
        ctx.fill();
    }
    ctx.restore();
}

function drawPickup(ctx, pickup, x, y, radius, time, alpha = 1) {
    const style = PICKUP_STYLE[pickup.type];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.shadowColor = style.color;
    ctx.shadowBlur = radius * 1.4;
    ctx.save();
    ctx.rotate(time * 2);
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius, 0);
    ctx.closePath();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = Math.max(1.5, radius / 7);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = style.color;
    ctx.font = `bold ${Math.max(8, Math.round(radius * 0.95))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.label, 0, 1);
    ctx.restore();
}

function shipFlickerHidden(ship) {
    return ship.invulnerable > 0 && Math.floor(ship.invulnerable * 12) % 2 === 0;
}

// Top-down ship pointing up the screen.
function drawShipTop(ctx, ship, x, y) {
    if (shipFlickerHidden(ship)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ship.bank * 0.18);
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(13, 12);
    ctx.lineTo(5, 7);
    ctx.lineTo(-5, 7);
    ctx.lineTo(-13, 12);
    ctx.closePath();
    ctx.fillStyle = '#10243a';
    ctx.fill();
    ctx.strokeStyle = '#7fd7ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, 9);
    ctx.lineTo(0, 16 + Math.random() * 8);
    ctx.lineTo(4, 9);
    ctx.fillStyle = '#ffb347';
    ctx.fill();
    drawShield(ctx, ship, 24);
    ctx.restore();
}

// Chase-camera view of the ship from behind.
function drawShipChase(ctx, ship, x, y) {
    if (shipFlickerHidden(ship)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ship.bank * 0.35);
    ctx.beginPath();
    ctx.moveTo(-46, 8);
    ctx.lineTo(-10, -4);
    ctx.lineTo(0, -16);
    ctx.lineTo(10, -4);
    ctx.lineTo(46, 8);
    ctx.lineTo(12, 10);
    ctx.lineTo(0, 18);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fillStyle = '#10243a';
    ctx.fill();
    ctx.strokeStyle = '#7fd7ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    const flame = 6 + Math.random() * 6;
    [-9, 9].forEach((ex) => {
        ctx.beginPath();
        ctx.arc(ex, 10, 4 + flame / 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 179, 71, 0.85)';
        ctx.fill();
    });
    drawShield(ctx, ship, 56);
    ctx.restore();
}

function drawShield(ctx, ship, radius) {
    if (ship.shield <= 0) return;
    const fading = ship.shield < 1.5 && Math.floor(ship.shield * 10) % 2 === 0;
    if (fading) return;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(111, 168, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#6fa8ff';
    ctx.shadowBlur = 14;
    ctx.stroke();
}

function drawGlowDot(ctx, x, y, radius, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = radius * 3;
    ctx.fill();
    ctx.restore();
}

module.exports = { PICKUP_STYLE, drawAsteroid, drawPickup, drawShipTop, drawShipChase, drawGlowDot };
