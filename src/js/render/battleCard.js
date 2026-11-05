// Collectible "battle card" renderer: a deterministic image of one cleared level.
const { getImage, loadAssets, makeCanvas, ROCK_KEYS, backdropKeyFor, rockKeyFor } = require('./assets');
const { pixelText } = require('./font');
const { drawGlow, drawPickup, pixelSprite, SHIP_TOP, SHIP_PALETTE } = require('./shapes');
const { difficultyColor } = require('./hud');
const {
    hashString, createSeededRng, formatUtc, formatDuration, formatPercent,
    cardLayout, mapPoint, killRadius, levelLengthOf, sampleRecord
} = require('./cardMath');

const TITLE = 'AsteRoid \u00b7 Galactic Gauntlet';
const CARD_ACCENTS = ['#7fd7ff', '#5fffd0', '#c78cff', '#ff6cf5', '#ffd25c', '#7dff8c', '#ff8a2c', '#5fd9ff', '#ff5a8a', '#fff4c8'];
const list = (value) => (Array.isArray(value) ? value : []);
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

function drawCover(ctx, img, x, y, w, h, alpha) {
    if (!img) return;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
}

function drawBackdrop(ctx, record, rng, accent) {
    const { width, height } = cardLayout().design;
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#07041a');
    bg.addColorStop(0.55, '#0b0626');
    bg.addColorStop(1, '#020109');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    drawCover(ctx, getImage(backdropKeyFor(record.level)), 0, 0, width, height, 0.42);
    const vignette = ctx.createRadialGradient(width / 2, height / 2, 200, width / 2, height / 2, 860);
    vignette.addColorStop(0, 'rgba(3, 2, 12, 0.15)');
    vignette.addColorStop(1, 'rgba(3, 2, 12, 0.9)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 260; i++) {
        const s = rng() < 0.9 ? 2 : 4;
        ctx.globalAlpha = 0.25 + rng() * 0.7;
        ctx.fillStyle = rng() < 0.15 ? accent : '#dff3ff';
        ctx.fillRect(Math.floor(rng() * width / 2) * 2, Math.floor(rng() * height / 2) * 2, s, s);
    }
    ctx.globalAlpha = 1;
    // Floating Mandelblum rocks in the margins.
    for (let i = 0; i < 5; i++) {
        const img = getImage(ROCK_KEYS[Math.floor(rng() * ROCK_KEYS.length)]);
        if (!img) continue;
        const size = 70 + rng() * 90;
        const x = rng() < 0.5 ? 20 + rng() * 60 : width - 80 - rng() * 60;
        const y = 220 + rng() * 860;
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.translate(x, y);
        ctx.rotate(rng() * Math.PI * 2);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
    }
}

// Stepped 8-bit frame with notched corners.
function drawFrame(ctx, accent) {
    const { frame } = cardLayout();
    const { x, y, w, h } = frame;
    const notch = 18;
    const px = 6;
    const ring = (inset, color, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        const ix = x + inset;
        const iy = y + inset;
        const iw = w - inset * 2;
        const ih = h - inset * 2;
        ctx.fillRect(ix + notch, iy, iw - notch * 2, px);
        ctx.fillRect(ix + notch, iy + ih - px, iw - notch * 2, px);
        ctx.fillRect(ix, iy + notch, px, ih - notch * 2);
        ctx.fillRect(ix + iw - px, iy + notch, px, ih - notch * 2);
        for (let s = 0; s < 3; s++) {
            const o = s * px;
            const d = notch - o - px;
            ctx.fillRect(ix + o, iy + d, px, px);
            ctx.fillRect(ix + d, iy + o, px, px);
            ctx.fillRect(ix + iw - px - o, iy + d, px, px);
            ctx.fillRect(ix + iw - px - d, iy + o, px, px);
            ctx.fillRect(ix + o, iy + ih - px - d, px, px);
            ctx.fillRect(ix + d, iy + ih - px - o, px, px);
            ctx.fillRect(ix + iw - px - o, iy + ih - px - d, px, px);
            ctx.fillRect(ix + iw - px - d, iy + ih - px - o, px, px);
        }
    };
    ring(0, accent, 0.95);
    ring(12, '#7fd7ff', 0.35);
    ctx.globalAlpha = 1;
    // Corner rivets.
    ctx.fillStyle = '#fff4c8';
    [[x + 30, y + 30], [x + w - 36, y + 30], [x + 30, y + h - 36], [x + w - 36, y + h - 36]].forEach(([rx, ry]) => ctx.fillRect(rx, ry, 6, 6));
}

function drawBadge(ctx, text, x, y, color) {
    const w = 24 + text.length * 17;
    ctx.fillStyle = 'rgba(4, 3, 16, 0.85)';
    ctx.fillRect(x - w, y, w, 42);
    ctx.fillStyle = color;
    ctx.fillRect(x - w, y, w, 4);
    ctx.fillRect(x - w, y + 38, w, 4);
    ctx.fillRect(x - w, y, 4, 42);
    ctx.fillRect(x - 4, y, 4, 42);
    drawGlow(ctx, x - w / 2, y + 21, w * 0.7, color, 0.35);
    pixelText(ctx, text, x - w / 2, y + 30, { size: 26, color, align: 'center' });
}

function drawHeader(ctx, record, accent) {
    const { header } = cardLayout();
    const diffId = String(record.difficulty || 'cadet');
    const diffLabel = String(record.difficultyLabel || diffId).toUpperCase();
    pixelText(ctx, TITLE, header.x, header.y + 30, { size: 26, color: '#7fd7ff' });
    const levelText = `LEVEL ${String(num(record.level, 1)).padStart(2, '0')}`;
    drawGlow(ctx, header.x + 150, header.y + 78, 260, accent, 0.35);
    pixelText(ctx, levelText, header.x, header.y + 96, { size: 60, color: '#fff4c8', outline: accent });
    pixelText(ctx, String(record.levelName || '').toUpperCase(), header.x, header.y + 138, { size: 30, color: accent });
    drawBadge(ctx, diffLabel, header.x + header.w, header.y + 2, difficultyColor(diffId));
    pixelText(ctx, 'CLEARED', header.x + header.w, header.y + 92, { size: 22, color: '#9fb4c8', align: 'right' });
    pixelText(ctx, formatUtc(record.completedAt), header.x + header.w, header.y + 124, { size: 24, color: '#e8f6ff', align: 'right' });
    ctx.fillStyle = accent;
    for (let i = 0; i < header.w; i += 12) {
        ctx.globalAlpha = 0.35 + 0.65 * ((i / 12) % 2);
        ctx.fillRect(header.x + i, header.y + 158, 8, 4);
    }
    ctx.globalAlpha = 1;
}

function drawBurst(ctx, x, y, r, color, rng) {
    drawGlow(ctx, x, y, r * 3.2, color, 0.55);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const rays = 6 + Math.floor(rng() * 5);
    const turn = rng() * Math.PI;
    for (let i = 0; i < rays; i++) {
        const a = turn + (i / rays) * Math.PI * 2;
        const inner = r * 0.45;
        const outer = r * (1 + rng() * 0.6);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
        ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
        ctx.stroke();
    }
    ctx.restore();
    // Pixel debris.
    ctx.fillStyle = '#fff4c8';
    const bits = 3 + Math.floor(r / 6);
    for (let i = 0; i < bits; i++) {
        const a = rng() * Math.PI * 2;
        const d = r * (0.6 + rng() * 0.9);
        ctx.fillRect(Math.round(x + Math.cos(a) * d) - 1, Math.round(y + Math.sin(a) * d) - 1, 3, 3);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
}

function drawMap(ctx, record, rng, accent) {
    const { map } = cardLayout();
    const log = record.battleLog || {};
    const levelLength = levelLengthOf(record);
    const worldWidth = num(log.worldWidth, 800) || 800;
    const at = (p) => mapPoint(p, levelLength, map, worldWidth);

    ctx.fillStyle = 'rgba(3, 4, 18, 0.78)';
    ctx.fillRect(map.x, map.y, map.w, map.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(map.x, map.y, map.w, map.h);
    ctx.clip();
    drawCover(ctx, getImage('bg-galaxy'), map.x, map.y, map.w, map.h, 0.16);
    // Neon grid, brighter toward the gate.
    ctx.lineWidth = 1;
    for (let gy = 0; gy <= 22; gy++) {
        const y = map.y + map.h - (gy / 22) * map.h;
        ctx.strokeStyle = `rgba(127, 215, 255, ${0.05 + 0.12 * (gy / 22)})`;
        ctx.beginPath();
        ctx.moveTo(map.x, y);
        ctx.lineTo(map.x + map.w, y);
        ctx.stroke();
    }
    for (let gx = 0; gx <= 10; gx++) {
        const x = map.x + (gx / 10) * map.w;
        ctx.strokeStyle = 'rgba(127, 215, 255, 0.08)';
        ctx.beginPath();
        ctx.moveTo(x, map.y);
        ctx.lineTo(x, map.y + map.h);
        ctx.stroke();
    }
    // Jump gate at the top, launch pad at the bottom.
    const gate = getImage('gate');
    drawGlow(ctx, map.x + map.w / 2, map.y + 40, 200, accent, 0.6);
    if (gate) ctx.drawImage(gate, map.x + map.w / 2 - 70, map.y - 20, 140, 140);
    ctx.fillStyle = accent;
    for (let i = 0; i < 9; i++) ctx.fillRect(map.x + map.w / 2 - 90 + i * 22, map.y + map.h - 10, 12, 4);

    list(log.misses).forEach((m) => {
        const p = at(m);
        ctx.strokeStyle = 'rgba(159, 180, 200, 0.45)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    });

    list(log.kills).forEach((k) => {
        const p = at(k);
        const shooter = Boolean(num(k[3]));
        drawBurst(ctx, p.x, p.y, killRadius(k[2]) * 0.8, shooter ? '#ff8a2c' : '#7fd7ff', rng);
    });

    const path = list(log.path).map(at);
    if (path.length > 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        [[16, accent, 0.12], [8, accent, 0.3], [3, '#ffffff', 0.9]].forEach(([lw, color, alpha]) => {
            ctx.strokeStyle = color;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = lw;
            ctx.beginPath();
            path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.stroke();
        });
        ctx.restore();
        // Pixel waypoints every few samples.
        ctx.fillStyle = '#fff4c8';
        path.forEach((p, i) => {
            if (i % 12 === 0) ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4);
        });
    }

    list(log.pickups).forEach((pk) => {
        const p = at(pk);
        drawPickup(ctx, { type: String(pk[2] || 'power') }, p.x, p.y, 12, 0.6);
    });

    list(log.hitsTaken).forEach((h) => {
        const p = at(h);
        drawGlow(ctx, p.x, p.y, 46, '#ff2a4a', 0.7);
        ctx.strokeStyle = '#ff3c5a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(p.x - 10, p.y - 10);
        ctx.lineTo(p.x + 10, p.y + 10);
        ctx.moveTo(p.x + 10, p.y - 10);
        ctx.lineTo(p.x - 10, p.y + 10);
        ctx.stroke();
    });

    const ship = pixelSprite('ship-top', SHIP_TOP, SHIP_PALETTE, 4);
    const tip = path.length ? path[path.length - 1] : { x: map.x + map.w / 2, y: map.y + 150 };
    drawGlow(ctx, tip.x, tip.y + 30, 70, '#ff8a2c', 0.7);
    if (ship) ctx.drawImage(ship, Math.round(tip.x - ship.width / 2), Math.round(tip.y - ship.height / 2));

    if (path.length < 2 && list(log.kills).length === 0) {
        pixelText(ctx, 'FLIGHT LOG ARCHIVED', map.x + map.w / 2, map.y + map.h / 2, { size: 26, color: '#9fb4c8', align: 'center' });
    }
    ctx.restore();

    // Strip border + labels.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(map.x + 1.5, map.y + 1.5, map.w - 3, map.h - 3);
    pixelText(ctx, 'JUMP GATE', map.x + 10, map.y + 26, { size: 16, color: accent });
    pixelText(ctx, 'LAUNCH', map.x + 10, map.y + map.h - 18, { size: 16, color: accent });
    pixelText(ctx, `${Math.round(levelLength)} LY`, map.x + map.w - 10, map.y + map.h - 18, { size: 16, color: '#9fb4c8', align: 'right' });
}

function statRows(record) {
    const s = record.stats || {};
    const ship = record.ship || {};
    const weapon = ship.finalWeapon || {};
    return [
        ['ACCURACY', formatPercent(s.accuracy), '#7dff8c'],
        ['DESTROYED', `${num(s.asteroidsDestroyed)} / ${num(s.asteroidsSpawned, num(s.asteroidsDestroyed) + num(s.asteroidsMissed))}`, '#7fd7ff'],
        ['MISSED', String(num(s.asteroidsMissed)), '#9fb4c8'],
        ['SHOOTERS', String(num(s.shootersDestroyed)), '#ff8a2c'],
        ['SHOTS', String(num(s.shotsFired)), '#e8f6ff'],
        ['MAX COMBO', `x${num(s.maxCombo)}`, '#ff6cf5'],
        ['DAMAGE', String(num(s.damageTaken)), '#ff3c5a'],
        ['SHIELD BLOCKS', String(num(s.shieldBlocks)), '#5fd9ff'],
        ['TIME', formatDuration(record.durationSec), '#ffe65c'],
        ['WEAPON', `${String(weapon.type || 'blaster').toUpperCase()} T${num(weapon.tier, 1)}`, '#5fffd0']
    ];
}

function drawPanel(ctx, record, rng, accent) {
    const { panel } = cardLayout();
    const score = record.score || {};
    ctx.fillStyle = 'rgba(4, 6, 20, 0.72)';
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    ctx.fillStyle = accent;
    ctx.fillRect(panel.x, panel.y, panel.w, 4);
    ctx.fillRect(panel.x, panel.y + panel.h - 4, panel.w, 4);

    pixelText(ctx, 'SCORE', panel.x + 30, panel.y + 46, { size: 22, color: '#9fb4c8' });
    drawGlow(ctx, panel.x + panel.w / 2, panel.y + 92, 300, '#ffe65c', 0.25);
    pixelText(ctx, String(num(score.total)).padStart(7, '0'), panel.x + 30, panel.y + 110, { size: 58, color: '#ffe65c', outline: '#3a1600' });
    pixelText(ctx, `LEVEL +${num(score.level)}   BONUS +${num(score.bonus)}`, panel.x + 30, panel.y + 146, { size: 18, color: '#e8f6ff' });

    const rows = statRows(record);
    const top = panel.y + 196;
    const rowH = 46;
    rows.forEach(([label, value, color], i) => {
        const y = top + i * rowH;
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(127, 215, 255, 0.06)';
            ctx.fillRect(panel.x + 16, y - 30, panel.w - 32, rowH - 4);
        }
        ctx.fillStyle = color;
        ctx.fillRect(panel.x + 26, y - 18, 8, 8);
        pixelText(ctx, label, panel.x + 46, y, { size: 20, color: '#c8d8ea' });
        pixelText(ctx, value, panel.x + panel.w - 30, y, { size: 22, color, align: 'right' });
    });

    // Weapon mix bar.
    const mixY = top + rows.length * rowH + 4;
    const byWeapon = (record.stats && record.stats.shotsByWeapon) || {};
    const colors = { blaster: '#9ff3ff', spread: '#5fffd0', rapid: '#ffe65c', plasma: '#ff6cf5' };
    const total = Object.keys(colors).reduce((sum, k) => sum + Math.max(0, num(byWeapon[k])), 0);
    pixelText(ctx, 'WEAPON MIX', panel.x + 30, mixY, { size: 18, color: '#9fb4c8' });
    const barX = panel.x + 30;
    const barW = panel.w - 60;
    let cursor = 0;
    const cells = 24;
    const cellW = barW / cells;
    Object.keys(colors).forEach((k) => {
        const n = total ? Math.round((Math.max(0, num(byWeapon[k])) / total) * cells) : 0;
        for (let i = 0; i < n && cursor < cells; i++, cursor++) {
            ctx.fillStyle = colors[k];
            ctx.fillRect(Math.round(barX + cursor * cellW), mixY + 12, Math.ceil(cellW) - 3, 18);
        }
    });
    for (; cursor < cells; cursor++) {
        ctx.fillStyle = 'rgba(127, 215, 255, 0.12)';
        ctx.fillRect(Math.round(barX + cursor * cellW), mixY + 12, Math.ceil(cellW) - 3, 18);
    }

    // Collected pickups row.
    const collected = (record.stats && record.stats.pickupsCollected) || {};
    const rowY = mixY + 74;
    pixelText(ctx, 'PICKUPS', panel.x + 30, rowY, { size: 18, color: '#9fb4c8' });
    ['power', 'shield', 'spread', 'rapid', 'plasma'].forEach((type, i) => {
        const cx = panel.x + 190 + i * 58;
        drawPickup(ctx, { type }, cx, rowY - 6, 14, 0.6, num(collected[type]) > 0 ? 1 : 0.3);
        pixelText(ctx, String(num(collected[type])), cx, rowY + 30, { size: 16, color: '#e8f6ff', align: 'center' });
    });

    // Victory stamp seal: a Mandelblum rock in a rotated pixel ring.
    const sealX = panel.x + panel.w - 96;
    const sealY = panel.y + panel.h - 92;
    const rock = getImage(rockKeyFor(hashString(record.id || 'card')));
    drawGlow(ctx, sealX, sealY, 150, accent, 0.45);
    if (rock) ctx.drawImage(rock, sealX - 52, sealY - 52, 104, 104);
    ctx.save();
    ctx.translate(sealX, sealY);
    ctx.rotate(-0.18 + rng() * 0.1);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 66, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    pixelText(ctx, 'VICTORY', 0, -72, { size: 18, color: '#fff4c8', align: 'center' });
    pixelText(ctx, 'STAMP', 0, 86, { size: 18, color: '#fff4c8', align: 'center' });
    ctx.restore();

    const lives = record.ship || {};
    pixelText(ctx, `LIVES LEFT ${num(lives.livesRemaining)}`, panel.x + 30, panel.y + panel.h - 110, { size: 18, color: '#7dff8c' });
    pixelText(ctx, `POWER ${num(lives.finalPower)}%`, panel.x + 30, panel.y + panel.h - 80, { size: 18, color: '#7dff8c' });
    pixelText(ctx, `VIEW ${String(lives.view || 'overview').toUpperCase()}`, panel.x + 30, panel.y + panel.h - 50, { size: 18, color: '#7fd7ff' });
}

function drawFooter(ctx, record, accent) {
    const { footer } = cardLayout();
    const id = String(record.id || '');
    const shortId = id.length > 54 ? `${id.slice(0, 51)}...` : id;
    const tag = `#${hashString(id).toString(16).padStart(8, '0').toUpperCase()}`;
    pixelText(ctx, tag, footer.x + footer.w, footer.y + 4, { size: 18, color: accent, align: 'right' });
    pixelText(ctx, shortId, footer.x + footer.w, footer.y + 26, { size: 13, color: '#6f8098', align: 'right' });
}

function drawLegend(ctx) {
    const { map } = cardLayout();
    const y = map.y + map.h + 4;
    // Kept inside the frame between the map strip and the footer.
    const items = [['#7fd7ff', 'KILL'], ['#ff8a2c', 'SHOOTER'], ['#ff3c5a', 'HIT TAKEN'], ['#9fb4c8', 'MISSED']];
    items.forEach(([color, label], i) => {
        const x = map.x + i * 135;
        ctx.fillStyle = color;
        ctx.fillRect(x, y + 6, 10, 10);
        pixelText(ctx, label, x + 16, y + 17, { size: 14, color: '#c8d8ea' });
    });
}

// Renders the card for a LevelRecord. Always resolves to a canvas in browsers.
async function renderBattleCard(record, { width = 1200, height = 1200 } = {}) {
    if (!record || typeof record !== 'object') throw new TypeError('renderBattleCard requires a LevelRecord');
    await loadAssets();
    const canvas = makeCanvas(width, height);
    if (!canvas) throw new Error('renderBattleCard requires a DOM canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.scale(width / 1200, height / 1200);
    const rng = createSeededRng(hashString(record.id || `${record.level}-${record.completedAt}`));
    const accent = CARD_ACCENTS[(Math.max(1, Math.floor(num(record.level, 1))) - 1) % CARD_ACCENTS.length];
    drawBackdrop(ctx, record, rng, accent);
    drawFrame(ctx, accent);
    drawHeader(ctx, record, accent);
    drawMap(ctx, record, rng, accent);
    drawLegend(ctx);
    drawPanel(ctx, record, rng, accent);
    drawFooter(ctx, record, accent);
    return canvas;
}

function latestRecord(game) {
    if (!game) return null;
    try {
        const wins = typeof game.getWinRecords === 'function' ? game.getWinRecords() : [];
        if (Array.isArray(wins) && wins.length) {
            const withLog = wins.filter((w) => w && w.battleLog && list(w.battleLog.path).length > 1);
            return (withLog.length ? withLog : wins)[(withLog.length ? withLog : wins).length - 1];
        }
    } catch (error) {
        // Fall through to lastRecord / sample.
    }
    return game.lastRecord || null;
}

// Console/dev helper: opens the latest win's card (or a sample) in a new tab.
async function previewBattleCard(record) {
    const game = typeof window !== 'undefined' ? window.asteroidGame : null;
    const chosen = record || latestRecord(game) || sampleRecord();
    const canvas = await renderBattleCard(chosen);
    const url = canvas.toDataURL('image/png');
    const tab = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    if (tab && tab.document) {
        tab.document.title = `Battle card · Level ${chosen.level}`;
        tab.document.body.style.cssText = 'margin:0;background:#05030c;display:grid;place-items:center;min-height:100vh';
        const img = tab.document.createElement('img');
        img.src = url;
        img.alt = `AsteRoid battle card for level ${chosen.level}`;
        img.style.cssText = 'max-width:100vw;max-height:100vh;image-rendering:pixelated';
        tab.document.body.appendChild(img);
    }
    return canvas;
}

module.exports = { renderBattleCard, previewBattleCard, latestRecord };
