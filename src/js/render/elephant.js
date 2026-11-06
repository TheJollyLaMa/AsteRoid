// Framed 8-bit "transmission" viewscreen playing the Mandelblum flying
// elephant. Shared by the Sector I / Sector II win screens and the warp.
const { getImage, ELEPHANT_FRAMES, ELEPHANT_COLUMNS } = require('./assets');
const { pixelText } = require('./font');
const { drawGlow } = require('./shapes');

const ELEPHANT_FPS = 6;
const ELEPHANT_ASPECT = 236 / 360;
const HEADER_H = 20;

function elephantFrame(time) {
    const frame = Math.floor(Math.max(0, time) * ELEPHANT_FPS) % ELEPHANT_FRAMES;
    return { frame, column: frame % ELEPHANT_COLUMNS, row: Math.floor(frame / ELEPHANT_COLUMNS) };
}

// (x, y) is the top-left of the header bar; returns the total drawn height.
function drawElephantVision(ctx, x, y, width, time, { label = 'ELEPHANT ESCORT', color = '#ffe65c', alpha = 1 } = {}) {
    const w = Math.round(width);
    const h = Math.round(w * ELEPHANT_ASPECT);
    const left = Math.round(x);
    const top = Math.round(y);
    const screenTop = top + HEADER_H;
    ctx.save();
    ctx.globalAlpha *= alpha;
    drawGlow(ctx, left + w / 2, screenTop + h / 2, w * 0.8, color, 0.28 + 0.08 * Math.sin(time * 3));

    // Bezel with stepped 8-bit corners.
    ctx.fillStyle = '#05030c';
    ctx.fillRect(left - 6, top - 2, w + 12, HEADER_H + h + 8);
    ctx.fillRect(left - 2, top - 6, w + 4, HEADER_H + h + 16);
    ctx.fillStyle = color;
    ctx.fillRect(left - 4, top - 4, w + 8, 2);
    ctx.fillRect(left - 4, screenTop + h + 2, w + 8, 2);
    ctx.fillRect(left - 4, top - 4, 2, HEADER_H + h + 8);
    ctx.fillRect(left + w + 2, top - 4, 2, HEADER_H + h + 8);

    // Header strip.
    ctx.fillRect(left, top, w, HEADER_H - 2);
    pixelText(ctx, label, left + 8, top + 14, { size: 13, color: '#05030c', outline: null });
    if (Math.floor(time * 2) % 2 === 0) {
        ctx.fillStyle = '#ff3a5c';
        ctx.fillRect(left + w - 34, top + 5, 8, 8);
    }
    pixelText(ctx, 'REC', left + w - 8, top + 14, { size: 10, color: '#05030c', outline: null, align: 'right' });

    const sheet = getImage('elephant-sheet');
    if (sheet) {
        const cell = elephantFrame(time);
        const fw = sheet.naturalWidth / ELEPHANT_COLUMNS;
        const fh = sheet.naturalHeight / Math.ceil(ELEPHANT_FRAMES / ELEPHANT_COLUMNS);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(sheet, cell.column * fw, cell.row * fh, fw, fh, left, screenTop, w, h);
    } else {
        ctx.fillStyle = '#10131f';
        ctx.fillRect(left, screenTop, w, h);
        pixelText(ctx, 'NO SIGNAL', left + w / 2, screenTop + h / 2 + 5, { size: 13, color: '#9fb4c8', align: 'center' });
    }
    // Monitor scanlines stay inside the picture so they never cross text.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let line = screenTop + 1; line < screenTop + h; line += 3) ctx.fillRect(left, line, w, 1);
    const sweep = screenTop + ((time * 40) % h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(left, sweep, w, 6);
    ctx.restore();
    return HEADER_H + h;
}

module.exports = { drawElephantVision, elephantFrame, ELEPHANT_FPS, ELEPHANT_ASPECT };
