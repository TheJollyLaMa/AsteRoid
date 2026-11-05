// Crisp "8-bit" text: glyphs are rasterised at a low resolution into a cached
// offscreen canvas and scaled up with smoothing disabled, giving chunky
// pixels without shipping a font file. Falls back to plain fillText in
// environments without an offscreen canvas.
const { makeCanvas } = require('./assets');

const FONT_STACK = 'Menlo, Monaco, Consolas, "DejaVu Sans Mono", "Courier New", monospace';
const PIXEL = 2;
const CACHE_LIMIT = 400;
const cache = new Map();

function fontFor(size, weight = 'bold') {
    return `${weight} ${size}px ${FONT_STACK}`;
}

let scratch = null;
function scratchContext() {
    if (scratch) return scratch;
    const canvas = makeCanvas(256, 64);
    if (!canvas) return null;
    scratch = canvas.getContext('2d', { willReadFrequently: true });
    return scratch;
}

function rasterize(value, size, color, outline, weight) {
    const key = `${value}|${size}|${color}|${outline}|${weight}`;
    const hit = cache.get(key);
    if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
    }
    const small = Math.max(5, Math.round(size / PIXEL));
    const sctx = scratchContext();
    if (!sctx) return null;
    sctx.font = fontFor(small, weight);
    const width = Math.ceil(sctx.measureText(value).width) + 4;
    const height = Math.ceil(small * 1.35) + 4;
    if (sctx.canvas.width < width || sctx.canvas.height < height) {
        sctx.canvas.width = Math.max(sctx.canvas.width, width);
        sctx.canvas.height = Math.max(sctx.canvas.height, height);
    }
    sctx.clearRect(0, 0, width, height);
    sctx.font = fontFor(small, weight);
    sctx.textBaseline = 'alphabetic';
    const baseline = Math.round(small * 1.02) + 2;
    if (outline) {
        sctx.fillStyle = outline;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) sctx.fillText(value, 2 + dx, baseline + dy);
    }
    sctx.fillStyle = color;
    sctx.fillText(value, 2, baseline);
    // Threshold alpha so glyph edges stay hard like a bitmap font. The scratch
    // canvas is CPU-backed (willReadFrequently) so this readback stays cheap.
    const data = sctx.getImageData(0, 0, width, height);
    const px = data.data;
    for (let i = 3; i < px.length; i += 4) px[i] = px[i] > 110 ? 255 : 0;
    const canvas = makeCanvas(width, height);
    canvas.getContext('2d').putImageData(data, 0, 0);
    const entry = { canvas, width, height, baseline };
    cache.set(key, entry);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return entry;
}

// Draws pixel text; returns the drawn width in canvas pixels.
function pixelText(ctx, value, x, y, { size = 14, color = '#e8f6ff', align = 'left', outline = '#05030c', weight = 'bold', alpha = 1, scale = 1 } = {}) {
    const str = String(value);
    if (!str) return 0;
    const entry = rasterize(str, size, color, outline, weight);
    if (!entry) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.font = fontFor(size * scale, weight);
        ctx.textAlign = align;
        ctx.fillStyle = color;
        ctx.fillText(str, x, y);
        ctx.restore();
        return ctx.measureText ? ctx.measureText(str).width : 0;
    }
    const k = PIXEL * scale;
    const w = entry.width * k;
    let left = x;
    if (align === 'center') left = x - w / 2;
    else if (align === 'right') left = x - w;
    const top = y - entry.baseline * k;
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * alpha;
    ctx.drawImage(entry.canvas, Math.round(left), Math.round(top), Math.round(w), Math.round(entry.height * k));
    ctx.globalAlpha = prevAlpha;
    ctx.imageSmoothingEnabled = smoothing;
    return w;
}

function measurePixelText(value, { size = 14, weight = 'bold', scale = 1 } = {}) {
    const entry = rasterize(String(value), size, '#fff', null, weight);
    if (!entry) return String(value).length * size * 0.6 * scale;
    return entry.width * PIXEL * scale;
}

module.exports = { FONT_STACK, fontFor, pixelText, measurePixelText };
