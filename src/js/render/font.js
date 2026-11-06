// 8-bit text from a built-in 5x7 bitmap font. Each glyph pixel becomes a
// rectangle snapped to whole device pixels, so text stays sharp and readable at
// any canvas scale without offscreen canvases or pixel readback. Strings with
// characters outside the font fall back to the system font.
const FONT_STACK = 'Menlo, Monaco, Consolas, "DejaVu Sans Mono", "Courier New", monospace';
const CELL = 6;
const ASCENT = 7;
const DESCENT = 2;
const CACHE_LIMIT = 256;
const cache = new Map();
let allocations = 0;

const GLYPHS = {
    ' ': '', '!': '00100/00100/00100/00100/00100/00000/00100', '"': '01010/01010/01010', '#': '01010/01010/11111/01010/11111/01010/01010',
    '$': '00100/01111/10100/01110/00101/11110/00100', '%': '11000/11001/00010/00100/01000/10011/00011', '&': '01100/10010/10100/01000/10101/10010/01101',
    "'": '00100/00100/01000', '(': '00010/00100/01000/01000/01000/00100/00010', ')': '01000/00100/00010/00010/00010/00100/01000',
    '*': '00000/00100/10101/01110/10101/00100', '+': '00000/00100/00100/11111/00100/00100', ',': '00000/00000/00000/00000/01100/00100/01000',
    '-': '00000/00000/00000/11111', '.': '00000/00000/00000/00000/00000/01100/01100', '/': '00000/00001/00010/00100/01000/10000',
    0: '01110/10001/10011/10101/11001/10001/01110', 1: '00100/01100/00100/00100/00100/00100/01110', 2: '01110/10001/00001/00010/00100/01000/11111',
    3: '11111/00010/00100/00010/00001/10001/01110', 4: '00010/00110/01010/10010/11111/00010/00010', 5: '11111/10000/11110/00001/00001/10001/01110',
    6: '00110/01000/10000/11110/10001/10001/01110', 7: '11111/00001/00010/00100/01000/01000/01000', 8: '01110/10001/10001/01110/10001/10001/01110',
    9: '01110/10001/10001/01111/00001/00010/01100', ':': '00000/01100/01100/00000/01100/01100', ';': '00000/01100/01100/00000/01100/00100/01000',
    '<': '00010/00100/01000/10000/01000/00100/00010', '=': '00000/00000/11111/00000/11111', '>': '01000/00100/00010/00001/00010/00100/01000',
    '?': '01110/10001/00001/00010/00100/00000/00100', '@': '01110/10001/00001/01101/10101/10101/01110',
    A: '01110/10001/10001/11111/10001/10001/10001', B: '11110/10001/10001/11110/10001/10001/11110', C: '01110/10001/10000/10000/10000/10001/01110',
    D: '11100/10010/10001/10001/10001/10010/11100', E: '11111/10000/10000/11110/10000/10000/11111', F: '11111/10000/10000/11110/10000/10000/10000',
    G: '01110/10001/10000/10111/10001/10001/01111', H: '10001/10001/10001/11111/10001/10001/10001', I: '01110/00100/00100/00100/00100/00100/01110',
    J: '00111/00010/00010/00010/00010/10010/01100', K: '10001/10010/10100/11000/10100/10010/10001', L: '10000/10000/10000/10000/10000/10000/11111',
    M: '10001/11011/10101/10101/10001/10001/10001', N: '10001/10001/11001/10101/10011/10001/10001', O: '01110/10001/10001/10001/10001/10001/01110',
    P: '11110/10001/10001/11110/10000/10000/10000', Q: '01110/10001/10001/10001/10101/10010/01101', R: '11110/10001/10001/11110/10100/10010/10001',
    S: '01111/10000/10000/01110/00001/00001/11110', T: '11111/00100/00100/00100/00100/00100/00100', U: '10001/10001/10001/10001/10001/10001/01110',
    V: '10001/10001/10001/10001/10001/01010/00100', W: '10001/10001/10001/10101/10101/10101/01010', X: '10001/10001/01010/00100/01010/10001/10001',
    Y: '10001/10001/10001/01010/00100/00100/00100', Z: '11111/00001/00010/00100/01000/10000/11111',
    '[': '01110/01000/01000/01000/01000/01000/01110', '\\': '00000/10000/01000/00100/00010/00001', ']': '01110/00010/00010/00010/00010/00010/01110',
    '^': '00100/01010/10001', _: '00000/00000/00000/00000/00000/00000/11111', '`': '01000/00100/00010',
    a: '00000/00000/01110/00001/01111/10001/01111', b: '10000/10000/10110/11001/10001/10001/11110', c: '00000/00000/01110/10000/10000/10001/01110',
    d: '00001/00001/01101/10011/10001/10001/01111', e: '00000/00000/01110/10001/11111/10000/01110', f: '00110/01001/01000/11100/01000/01000/01000',
    g: '00000/00000/01111/10001/10001/10011/01101/00001/01110', h: '10000/10000/10110/11001/10001/10001/10001', i: '00100/00000/01100/00100/00100/00100/01110',
    j: '00010/00000/00110/00010/00010/00010/00010/10010/01100', k: '10000/10000/10010/10100/11000/10100/10010', l: '01100/00100/00100/00100/00100/00100/01110',
    m: '00000/00000/11010/10101/10101/10101/10001', n: '00000/00000/10110/11001/10001/10001/10001', o: '00000/00000/01110/10001/10001/10001/01110',
    p: '00000/00000/11110/10001/10001/10001/11110/10000/10000', q: '00000/00000/01111/10001/10001/10001/01111/00001/00001',
    r: '00000/00000/10110/11001/10000/10000/10000', s: '00000/00000/01111/10000/01110/00001/11110', t: '01000/01000/11100/01000/01000/01001/00110',
    u: '00000/00000/10001/10001/10001/10011/01101', v: '00000/00000/10001/10001/10001/01010/00100', w: '00000/00000/10001/10001/10101/10101/01010',
    x: '00000/00000/10001/01010/00100/01010/10001', y: '00000/00000/10001/10001/10001/10001/01111/00001/01110', z: '00000/00000/11111/00010/00100/01000/11111',
    '{': '00010/00100/00100/01000/00100/00100/00010', '|': '00100/00100/00100/00100/00100/00100/00100', '}': '01000/00100/00100/00010/00100/00100/01000',
    '~': '00000/00000/01000/10101/00010', '·': '00000/00000/00000/01100/01100', '×': '00000/10001/01010/00100/01010/10001',
    '♥': '00000/01010/11111/11111/01110/00100', '◇': '00000/00100/01010/10001/01010/00100'
};
const GLYPH_ROWS = new Map(Object.entries(GLYPHS).map(([ch, rows]) => [ch, rows ? rows.split('/').map((row) => parseInt(row, 2)) : []]));

function fontFor(size, weight = 'bold') {
    return `${weight} ${size}px ${FONT_STACK}`;
}

function runsOf(mask, width, height, offset) {
    const runs = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!mask[y * width + x]) continue;
            const start = x;
            while (x < width && mask[y * width + x]) x++;
            runs.push(start - offset, y - offset, x - start);
        }
    }
    return runs;
}

function pathOf(runs) {
    if (typeof Path2D !== 'function') return null;
    const path = new Path2D();
    for (let i = 0; i < runs.length; i += 3) path.rect(runs[i], runs[i + 1], runs[i + 2], 1);
    return path;
}

// Glyph runs for a whole string, plus a one-pixel outline/drop-shadow mask.
function layout(value) {
    const hit = cache.get(value);
    if (hit) {
        cache.delete(value);
        cache.set(value, hit);
        return hit;
    }
    const chars = [...value];
    if (!chars.every((ch) => GLYPH_ROWS.has(ch))) return null;
    const cols = Math.max(1, chars.length * CELL - 1);
    const width = cols + 2;
    const height = ASCENT + DESCENT + 2;
    const glyphs = new Uint8Array(width * height);
    chars.forEach((ch, index) => {
        GLYPH_ROWS.get(ch).forEach((bits, row) => {
            for (let col = 0; col < 5; col++) if (bits & (16 >> col)) glyphs[(row + 1) * width + 1 + index * CELL + col] = 1;
        });
    });
    const outline = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!glyphs[y * width + x]) continue;
            for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) {
                const nx = x + dx; const ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < width && ny < height) outline[ny * width + nx] = 1;
            }
        }
    }
    const fill = runsOf(glyphs, width, height, 1);
    const edge = runsOf(outline, width, height, 1);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    const entry = { cols, fill, edge, fillPath: pathOf(fill), edgePath: pathOf(edge) };
    allocations++;
    cache.set(value, entry);
    return entry;
}

function axisAligned(ctx) {
    const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
    return m && !m.b && !m.c && m.a > 0 && m.d > 0 ? m : null;
}

// Logical size of one font pixel, rounded to whole device pixels when the
// canvas transform allows it.
function units(ctx, size, scale = 1, matrix = axisAligned(ctx)) {
    const k = (size / 10) * scale;
    if (!matrix) return { x: k, y: k };
    const snap = (factor) => (k * factor >= 0.75 ? Math.max(1, Math.round(k * factor)) / factor : k);
    return { x: snap(matrix.a), y: snap(matrix.d) };
}

function pixelTextMetrics(ctx, { size = 14, scale = 1 } = {}) {
    const unit = units(ctx, size, scale);
    return { unitX: unit.x, unitY: unit.y, advance: CELL * unit.x, ascent: ASCENT * unit.y };
}

function getFontResources() {
    return { textSprites: cache.size, textAllocations: allocations, textPixels: 0 };
}

function clearFontResources() {
    cache.clear();
}

function systemText(ctx, str, x, y, { size, color, align, weight, alpha, scale }) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = fontFor(size * scale, weight);
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    const width = ctx.measureText ? ctx.measureText(str).width : 0;
    ctx.fillText(str, x, y);
    ctx.restore();
    return width;
}

function fillRuns(ctx, path, runs) {
    if (path) { ctx.fill(path); return; }
    for (let i = 0; i < runs.length; i += 3) ctx.fillRect(runs[i], runs[i + 1], runs[i + 2], 1);
}

// Draws pixel text with its baseline at y; returns the drawn width.
function pixelText(ctx, value, x, y, { size = 14, color = '#e8f6ff', align = 'left', outline = '#05030c', weight = 'bold', alpha = 1, scale = 1, crisp = false } = {}) {
    const str = String(value);
    if (!str) return 0;
    const entry = crisp ? null : layout(str);
    if (!entry) return systemText(ctx, str, x, y, { size, color, align, weight, alpha, scale });
    const matrix = axisAligned(ctx);
    const unit = units(ctx, size, scale, matrix);
    const width = entry.cols * unit.x;
    let left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    let top = y - ASCENT * unit.y;
    if (matrix) {
        left = (Math.round(left * matrix.a + matrix.e) - matrix.e) / matrix.a;
        top = (Math.round(top * matrix.d + matrix.f) - matrix.f) / matrix.d;
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(left, top);
    ctx.scale(unit.x, unit.y);
    if (outline) { ctx.fillStyle = outline; fillRuns(ctx, entry.edgePath, entry.edge); }
    ctx.fillStyle = color;
    fillRuns(ctx, entry.fillPath, entry.fill);
    ctx.restore();
    return width;
}

function measurePixelText(value, { size = 14, scale = 1 } = {}, ctx = null) {
    const str = String(value);
    const entry = layout(str);
    const unit = ctx ? units(ctx, size, scale) : { x: (size / 10) * scale };
    if (!entry) return str.length * size * 0.6 * scale;
    return entry.cols * unit.x;
}

module.exports = { FONT_STACK, fontFor, pixelText, measurePixelText, pixelTextMetrics, CACHE_LIMIT, GLYPHS, getFontResources, clearFontResources };
