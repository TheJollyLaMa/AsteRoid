const { WEAPONS } = require('../weapons');
const { getImage, getTinted, rockKeyFor, futureRockKeyFor, makeCanvas, BREATHE_FRAMES } = require('./assets');
const { pixelText } = require('./font');

const PICKUP_STYLE = {
    spread: { color: WEAPONS.spread.color, label: 'S' },
    rapid: { color: WEAPONS.rapid.color, label: 'R' },
    plasma: { color: WEAPONS.plasma.color, label: 'P' },
    power: { color: '#7dff8c', label: '+' },
    shield: { color: '#6fa8ff', label: 'O' }
};

const COLOR_TO_WEAPON = Object.keys(WEAPONS).reduce((map, type) => {
    map[WEAPONS[type].color.toLowerCase()] = type;
    return map;
}, {});

function bulletWeaponType(bullet) {
    if (bullet.weapon && WEAPONS[bullet.weapon]) return bullet.weapon;
    if (bullet.ownerWeapon && WEAPONS[bullet.ownerWeapon]) return bullet.ownerWeapon;
    return COLOR_TO_WEAPON[String(bullet.color || '').toLowerCase()] || 'blaster';
}

// ---------------------------------------------------------------- glow sprites
const glowCache = new Map();
function glowSprite(color) {
    if (glowCache.has(color)) return glowCache.get(color);
    const canvas = makeCanvas(64, 64);
    if (canvas) {
        const c = canvas.getContext('2d');
        const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, color);
        g.addColorStop(0.25, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = 0.9;
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
    }
    glowCache.set(color, canvas);
    return canvas;
}

// Additive soft glow: much cheaper than shadowBlur.
function drawGlow(ctx, x, y, radius, color, alpha = 1) {
    if (!(radius > 0) || !(alpha > 0)) return;
    const sprite = glowSprite(color);
    const prevOp = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = prevAlpha * Math.min(1, alpha);
    if (sprite) {
        ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = prevAlpha;
}

function drawGlowDot(ctx, x, y, radius, color, alpha = 1) {
    drawGlow(ctx, x, y, radius * 3, color, alpha * 0.8);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ---------------------------------------------------------------- pixel art
const SHIP_PALETTE = {
    W: '#ffffff', C: '#7fd7ff', H: '#d8e4ef', B: '#13284a', D: '#0a1428',
    M: '#ffe65c', A: '#3fb8ff', P: '#1d4a6a', F: '#ffb347'
};

const SHIP_TOP = [
    '......W......',
    '.....WCW.....',
    '.....CHC.....',
    '....CBHBC....',
    '....CBHBC....',
    '...CBBBBBC...',
    '..ACBBBBBCA..',
    '.AACBMBMBCAA.',
    'AAPCBBBBBCPAA',
    'APPCBDBDBCPPA',
    'AP.CDDBDDC.PA',
    'A..CCD.DCC..A',
    '....FF.FF....'
];

const SHIP_CHASE = [
    '............W............',
    '...........CHC...........',
    '..........CBHBC..........',
    'A........CBBBBBC........A',
    'AA......CBBMBMBBC......AA',
    'APA...CCBBBBBBBBBCC...APA',
    'APPACCBBBDDBBBDDBBBCCAPPA',
    'APPPPBBBDFFDBDFFDBBBPPPPA',
    '.AAPPBBBDFFDBDFFDBBBPPAA.',
    '...AACCCCDDCCCDDCCCCAA...'
];

const SHIP_PIXEL = 3;
const spriteCache = new Map();

function pixelSprite(name, rows, palette, pixel = SHIP_PIXEL) {
    const cacheKey = `${name}|${pixel}`;
    if (spriteCache.has(cacheKey)) return spriteCache.get(cacheKey);
    const width = rows[0].length;
    const canvas = makeCanvas(width * pixel, rows.length * pixel);
    if (canvas) {
        const c = canvas.getContext('2d');
        rows.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const color = palette[row[x]];
                if (!color) continue;
                c.fillStyle = color;
                c.fillRect(x * pixel, y * pixel, pixel, pixel);
            }
        });
    }
    spriteCache.set(cacheKey, canvas);
    return canvas;
}

// ---------------------------------------------------------------- asteroids
function asteroidPath(ctx, asteroid, radius) {
    ctx.beginPath();
    const points = asteroid.shape ? asteroid.shape.length : 10;
    for (let i = 0; i < points; i++) {
        const factor = asteroid.shape ? asteroid.shape[i] : 1;
        const angle = (i / points) * Math.PI * 2;
        const px = Math.cos(angle) * radius * factor;
        const py = Math.sin(angle) * radius * factor;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

function drawAsteroid(ctx, asteroid, x, y, radius, alpha = 1, time = 0, sector2 = false) {
    if (!(radius >= 0.5)) return;
    const key = sector2 ? futureRockKeyFor(asteroid.id) : rockKeyFor(asteroid.id);
    const img = getImage(key);
    const pulse = 0.6 + 0.4 * Math.sin(time * 7 + asteroid.id);
    const flash = asteroid.flash > 0 ? Math.min(1, asteroid.flash / 0.12) : 0;
    if (asteroid.shooter) drawGlow(ctx, x, y, radius * 2.1, '#ff3a1c', alpha * (0.35 + 0.35 * pulse));
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(asteroid.rotation || 0);
    if (img) {
        const s = radius * 2.35;
        const source = asteroid.shooter ? (getTinted(key, 'shooter') || img) : img;
        ctx.drawImage(source, -s / 2, -s / 2, s, s);
        if (flash) {
            const white = getTinted(key, 'flash');
            if (white) {
                ctx.globalAlpha = alpha * flash;
                ctx.drawImage(white, -s / 2, -s / 2, s, s);
            }
        }
    } else {
        asteroidPath(ctx, asteroid, radius);
        ctx.fillStyle = flash ? '#ffffff' : asteroid.shooter ? '#2b1712' : '#1c1c22';
        ctx.fill();
        ctx.lineWidth = Math.max(1, radius / 18);
        ctx.strokeStyle = asteroid.shooter ? '#ff8a5c' : '#d8d2c4';
        ctx.stroke();
    }
    ctx.restore();
    if (asteroid.shooter) {
        // Menacing reactor eye: hot core plus a rotating split ring.
        drawGlow(ctx, x, y, radius * 0.9, '#ff5a1c', alpha * 0.9 * pulse);
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.fillStyle = '#fff1c2';
        const core = Math.max(1.5, radius * 0.14);
        ctx.fillRect(x - core, y - core, core * 2, core * 2);
        ctx.translate(x, y);
        ctx.rotate(-time * 2 + asteroid.id);
        ctx.strokeStyle = `rgba(255, 120, 60, ${0.5 + 0.5 * pulse})`;
        ctx.lineWidth = Math.max(1, radius * 0.07);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.45, 0, Math.PI * 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.45, Math.PI, Math.PI * 1.8);
        ctx.stroke();
        ctx.restore();
    }
}

// ---------------------------------------------------------------- pickups
function drawBreathe(ctx, x, y, radius, time, alpha = 1) {
    const sheet = getImage('breathe-sheet');
    const still = getImage('breathe-still');
    const breath = 1 + 0.12 * Math.sin(time * 3.2);
    const size = radius * 2.6 * breath;
    drawGlow(ctx, x, y, size * 1.1, '#7dff8c', alpha * (0.45 + 0.2 * Math.sin(time * 3.2)));
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (sheet) {
        const cycle = BREATHE_FRAMES * 2 - 2;
        const step = Math.floor(time * 9) % cycle;
        const frame = step < BREATHE_FRAMES ? step : cycle - step;
        const fw = sheet.naturalWidth / BREATHE_FRAMES;
        ctx.drawImage(sheet, frame * fw, 0, fw, sheet.naturalHeight, x - size / 2, y - size / 2, size, size);
    } else if (still) {
        ctx.drawImage(still, x - size / 2, y - size / 2, size, size);
    } else {
        ctx.fillStyle = '#7dff8c';
        ctx.fillRect(x - radius * 0.25, y - radius * 0.8, radius * 0.5, radius * 1.6);
        ctx.fillRect(x - radius * 0.8, y - radius * 0.25, radius * 1.6, radius * 0.5);
    }
    ctx.restore();
}

function drawPickup(ctx, pickup, x, y, radius, time, alpha = 1) {
    if (pickup.type === 'power') {
        drawBreathe(ctx, x, y, radius, time, alpha);
        return;
    }
    const style = PICKUP_STYLE[pickup.type] || PICKUP_STYLE.power;
    drawGlow(ctx, x, y, radius * 2.6, style.color, alpha * 0.55);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.save();
    ctx.rotate(time * 2);
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(8, 6, 24, 0.75)';
    ctx.fill();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = Math.max(1.5, radius / 6);
    ctx.stroke();
    ctx.restore();
    if (pickup.type === 'shield') {
        ctx.strokeStyle = style.color;
        ctx.lineWidth = Math.max(1, radius / 7);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.42, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        pixelText(ctx, style.label, 0, radius * 0.4, { size: Math.max(8, Math.round(radius * 1.1)), color: style.color, align: 'center' });
    }
    ctx.restore();
}

// ---------------------------------------------------------------- ship
function shipFlickerHidden(ship) {
    return ship.invulnerable > 0 && Math.floor(ship.invulnerable * 12) % 2 === 0;
}

function engineFlame(ctx, x, y, length, width, time, seed) {
    const len = length * (0.75 + 0.25 * Math.sin(time * 60 + seed * 3));
    drawGlow(ctx, x, y + len * 0.4, width * 3, '#ff8a2c', 0.7);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(x - width / 2, y, width, len);
    ctx.fillStyle = '#fff4c8';
    ctx.fillRect(x - width / 4, y, width / 2, len * 0.55);
}

// Top-down ship pointing up the screen.
function drawShipTop(ctx, ship, x, y, time = 0, ripples = []) {
    if (!shipFlickerHidden(ship)) {
        const sprite = pixelSprite('top', SHIP_TOP, SHIP_PALETTE);
        const bank = ship.bank || 0;
        ctx.save();
        ctx.translate(x, y);
        engineFlame(ctx, -4.5 + bank * 1.5, 18, 10 + 6 * Math.abs(Math.sin(time * 9)), 4, time, 1);
        engineFlame(ctx, 4.5 + bank * 1.5, 18, 10 + 6 * Math.abs(Math.cos(time * 9)), 4, time, 2);
        ctx.rotate(bank * 0.14);
        ctx.scale(1 - Math.abs(bank) * 0.22, 1);
        if (sprite) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
            if (Math.abs(bank) > 0.15) {
                ctx.fillStyle = `rgba(255,255,255,${Math.abs(bank) * 0.35})`;
                ctx.fillRect((bank > 0 ? 1 : -1) * 12 - 4, 3, 8, 6);
            }
        } else {
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(13, 12);
            ctx.lineTo(-13, 12);
            ctx.closePath();
            ctx.fillStyle = '#10243a';
            ctx.fill();
            ctx.strokeStyle = '#7fd7ff';
            ctx.stroke();
        }
        ctx.restore();
        drawGlow(ctx, x, y - 8, 9, '#d8e4ef', 0.35);
    }
    drawShield(ctx, ship, x, y, 30, time, ripples);
}

// Chase-camera view of the ship from behind.
function drawShipChase(ctx, ship, x, y, time = 0, ripples = []) {
    if (!shipFlickerHidden(ship)) {
        const sprite = pixelSprite('chase', SHIP_CHASE, SHIP_PALETTE);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((ship.bank || 0) * 0.35);
        if (sprite) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
        }
        const flick = 0.8 + 0.2 * Math.sin(time * 50);
        for (const ex of [-7.5, 7.5]) {
            drawGlow(ctx, ex, 7, 18 * flick, '#ff8a2c', 0.9);
            drawGlow(ctx, ex, 7, 7 * flick, '#fff4c8', 0.9);
        }
        drawGlow(ctx, -36, 0, 7, '#3fb8ff', 0.5 + 0.5 * Math.sin(time * 6));
        drawGlow(ctx, 36, 0, 7, '#3fb8ff', 0.5 + 0.5 * Math.sin(time * 6 + Math.PI));
        ctx.restore();
    }
    drawShield(ctx, ship, x, y, 62, time, ripples);
}

// ---------------------------------------------------------------- shield
let hexCanvas;
function hexPattern() {
    if (hexCanvas !== undefined) return hexCanvas;
    hexCanvas = makeCanvas(128, 128);
    if (!hexCanvas) return hexCanvas;
    const c = hexCanvas.getContext('2d');
    c.beginPath();
    c.arc(64, 64, 63, 0, Math.PI * 2);
    c.clip();
    c.strokeStyle = 'rgba(140, 200, 255, 0.9)';
    c.lineWidth = 1.2;
    const r = 9;
    const h = Math.sqrt(3) * r;
    for (let col = -1; col < 11; col++) {
        for (let row = -1; row < 10; row++) {
            const cx = col * r * 1.5;
            const cy = row * h + (col % 2 ? h / 2 : 0);
            c.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i;
                if (i === 0) c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                else c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            }
            c.closePath();
            c.stroke();
        }
    }
    const g = c.createRadialGradient(64, 64, 18, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.15)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    return hexCanvas;
}

function drawShield(ctx, ship, x, y, radius, time = 0, ripples = []) {
    if (!(ship.shield > 0)) return;
    const fading = ship.shield < 1.5 && Math.floor(ship.shield * 10) % 2 === 0;
    const strength = fading ? 0.35 : 1;
    ctx.save();
    ctx.translate(x, y);
    drawGlow(ctx, 0, 0, radius * 1.5, '#3f7bff', 0.35 * strength);
    const hex = hexPattern();
    if (hex) {
        ctx.save();
        ctx.rotate(time * 0.4);
        ctx.globalAlpha = (0.5 + 0.25 * Math.sin(time * 5)) * strength;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(hex, -radius, -radius, radius * 2, radius * 2);
        ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(-0.6);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.2 * strength;
    ctx.fillStyle = '#bfe3ff';
    const sweep = ((time * 0.8) % 1) * radius * 3 - radius * 1.5;
    ctx.fillRect(sweep - 5, -radius * 1.5, 10, radius * 3);
    ctx.restore();
    ctx.globalAlpha = strength;
    ctx.strokeStyle = 'rgba(150, 205, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    for (const ripple of ripples) {
        const t = ripple.age / ripple.life;
        if (t < 0 || t > 1) continue;
        ctx.globalAlpha = (1 - t) * strength;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3 * (1 - t) + 1;
        ctx.beginPath();
        ctx.arc(0, 0, radius + t * 10, ripple.angle - 0.5 - t, ripple.angle + 0.5 + t);
        ctx.stroke();
        drawGlow(ctx, Math.cos(ripple.angle) * radius, Math.sin(ripple.angle) * radius, 18 * (1 - t) + 6, '#9fd0ff', 1 - t);
    }
    ctx.restore();
}

// ---------------------------------------------------------------- bullets
// Screen-space player bullet. (dx, dy) is the on-screen direction of travel.
function drawPlayerBullet(ctx, bullet, x, y, dx, dy, scale = 1, alpha = 1, time = 0) {
    const type = bulletWeaponType(bullet);
    const color = bullet.color || WEAPONS[type].color;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (type === 'singularity') {
        const r = Math.max(4, (bullet.size || 10) * scale * 1.5);
        const pulse = 0.82 + 0.18 * Math.sin(time * 16);
        drawGlow(ctx, x, y, r * 9 * pulse, '#5fd9ff', 0.95);
        drawGlow(ctx, x, y, r * 5, '#251044', 1);
        ctx.fillStyle = '#020106';
        ctx.beginPath(); ctx.arc(x, y, r * 1.45, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#d7a4ff'; ctx.lineWidth = Math.max(2, r * 0.22);
        ctx.beginPath(); ctx.ellipse(x, y, r * 2.2, r * 0.8, time * 2, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, r * 0.08);
        ctx.beginPath(); ctx.ellipse(x, y, r * 2.6, r * 0.95, -time * 1.5, 0, Math.PI * 1.35); ctx.stroke();
    } else if (type === 'prism') {
        const r = Math.max(3, (bullet.size || 6) * scale);
        drawGlow(ctx, x, y, r * 8, '#5ffeff', 1);
        drawGlow(ctx, x, y, r * 4, '#fa74ff', 0.9);
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(uy, ux) + time * 0.15);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(r * 2.4, 0); ctx.lineTo(-r, r); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r, -r); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#65ffff'; ctx.lineWidth = Math.max(1, r * 0.3); ctx.stroke(); ctx.restore();
        for (let i = 0; i < 3; i++) { ctx.strokeStyle = ['#d8e4ef', '#71ffff', '#fff36a'][i]; ctx.globalAlpha *= 0.65; ctx.lineWidth = Math.max(1, r * 0.16); ctx.beginPath(); ctx.moveTo(x - ux * r * (i + 1), y - uy * r * (i + 1)); ctx.lineTo(x - ux * r * (i + 5), y - uy * r * (i + 5) + (i - 1) * r * 1.5); ctx.stroke(); }
    } else if (type === 'nova') {
        const r = Math.max(3, (bullet.radius || bullet.size || 8) * scale);
        drawGlow(ctx, x, y, r * 6, '#d6a1ff', 0.95);
        drawGlow(ctx, x, y, r * 2.4, '#fff5ff', 0.95);
        ctx.strokeStyle = '#d9a0ff'; ctx.lineWidth = Math.max(2, r * 0.18);
        ctx.beginPath(); ctx.arc(x, y, r * (1.1 + 0.1 * Math.sin(time * 10)), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r * 0.52, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'plasma') {
        const r = Math.max(2, bullet.size * scale);
        for (let i = 4; i >= 1; i--) {
            drawGlow(ctx, x - ux * r * i * 0.9, y - uy * r * i * 0.9, r * (2.2 - i * 0.3), color, 0.3 * (1 - i / 5));
        }
        drawGlow(ctx, x, y, r * 3, color, 0.9);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, r * 0.2);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.6, time * 12, time * 12 + Math.PI * 1.2);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.5);
    } else if (type === 'rapid') {
        const l = 24 * scale;
        const w = Math.max(1, 2 * scale);
        drawGlow(ctx, x - ux * l * 0.4, y - uy * l * 0.4, l * 0.7, color, 0.5);
        ctx.strokeStyle = color;
        ctx.lineWidth = w * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - ux * l, y - uy * l);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = w;
        ctx.stroke();
    } else if (type === 'spread') {
        const s = Math.max(2, 4.5 * scale);
        drawGlow(ctx, x, y, s * 3, color, 0.6);
        ctx.translate(x, y);
        ctx.rotate(time * 14);
        ctx.fillStyle = color;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-s / 4, -s / 4, s / 2, s / 2);
    } else {
        const l = 14 * scale;
        const w = Math.max(1.5, 3 * scale);
        drawGlow(ctx, x - ux * l * 0.5, y - uy * l * 0.5, l, color, 0.7);
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = w * 1.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - ux * l, y - uy * l);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = w * 0.7;
        ctx.stroke();
    }
    ctx.restore();
}

// Enemy shot: hot orange orb with a rotating spiky star so it reads as danger.
function drawEnemyBullet(ctx, bullet, x, y, scale = 1, alpha = 1, time = 0) {
    const r = Math.max(2.5, (bullet.size || 4) * 1.5 * scale);
    const pulse = 0.75 + 0.25 * Math.sin(time * 18 + x * 0.1);
    drawGlow(ctx, x, y, r * 4 * pulse, '#ff3a1c', 0.85 * alpha);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(time * 6);
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        const rr = i % 2 === 0 ? r * 1.7 : r * 0.7;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd25c';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6);
    ctx.restore();
}

module.exports = {
    PICKUP_STYLE,
    SHIP_TOP,
    SHIP_CHASE,
    SHIP_PALETTE,
    bulletWeaponType,
    glowSprite,
    drawGlow,
    drawGlowDot,
    pixelSprite,
    drawAsteroid,
    drawBreathe,
    drawPickup,
    drawShipTop,
    drawShipChase,
    drawShield,
    drawPlayerBullet,
    drawEnemyBullet
};
