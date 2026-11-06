const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');

function fixture(name, overrides = {}) {
    let allocations = 0;
    const makeCanvas = (width, height) => {
        allocations++;
        const canvas = { width, height };
        const context = {
            canvas, clearRect() {}, fillRect() {}, fillText() {}, putImageData() {},
            createRadialGradient: () => ({ addColorStop() {} }),
            measureText: value => ({ width: value.length * 6 }),
            getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
        };
        canvas.getContext = () => context;
        return canvas;
    };
    const module = { exports: {} };
    const dependencies = {
        './assets': { makeCanvas },
        '../weapons': require('../src/js/weapons'),
        './font': {},
        ...overrides
    };
    vm.runInNewContext(readFileSync(require.resolve(`../src/js/render/${name}`), 'utf8'), {
        module, require: key => { assert.ok(dependencies[key], key); return dependencies[key]; }
    });
    return { api: module.exports, get allocations() { return allocations; } };
}

test('six minutes of unique glow colours cannot retain or allocate unbounded canvases', () => {
    const view = fixture('shapes');
    const ctx = { globalAlpha: 1, globalCompositeOperation: 'source-over', drawImage() {} };
    for (let frame = 0; frame < 60 * 60 * 6; frame++) {
        view.api.drawGlow(ctx, 10, 10, 20, `hsl(${150 + 45 * Math.sin(frame / 60 * 4)}, 100%, 60%)`);
    }
    const resources = view.api.getShapeResources();
    assert.equal(resources.glowSprites, view.api.MAX_GLOW_SPRITES);
    assert.equal(resources.glowAllocations, view.api.MAX_GLOW_SPRITES);
    assert.equal(view.allocations, view.api.MAX_GLOW_SPRITES);
    assert.equal(resources.shapePixels, 64 * 64 * view.api.MAX_GLOW_SPRITES);
    view.api.clearShapeResources();
    assert.equal(view.api.getShapeResources().shapePixels, 0);
    view.api.drawGlow(ctx, 0, 0, 10, '#fff');
    assert.equal(view.api.getShapeResources().glowSprites, 1);
});

test('changing score text reuses a bounded bitmap-glyph cache without allocating canvases', () => {
    const view = fixture('font');
    const rects = [];
    const ctx = { globalAlpha: 1, save() {}, restore() {}, translate() {}, scale() {}, fillRect: (...args) => rects.push(args) };
    for (let score = 0; score < 5000; score++) view.api.pixelText(ctx, `SCORE ${score}`, 0, 0);
    assert.equal(view.api.getFontResources().textSprites, view.api.CACHE_LIMIT);
    assert.equal(view.allocations, 0, 'bitmap text never allocates offscreen canvases');
    assert.ok(rects.length > 0);
    const allocations = view.api.getFontResources().textAllocations;
    for (let size = 14; size < 14.4; size += 0.001) view.api.pixelText(ctx, 'SAME', 0, 0, { size });
    assert.equal(view.api.getFontResources().textAllocations, allocations + 1, 'one layout serves every size');
    view.api.clearFontResources();
    assert.equal(view.api.getFontResources().textPixels, 0);
    view.api.pixelText(ctx, 'RESTORED', 0, 0);
    assert.equal(view.api.getFontResources().textSprites, 1);
});

test('bitmap text snaps glyph pixels to whole device pixels', () => {
    const view = fixture('font');
    const calls = [];
    const ctx = {
        globalAlpha: 1, save() {}, restore() {}, fillRect() {},
        getTransform: () => ({ a: 1.22, b: 0, c: 0, d: 1.22, e: 0, f: 0 }),
        translate: (x, y) => calls.push(['translate', x, y]),
        scale: (x, y) => calls.push(['scale', x, y])
    };
    const width = view.api.pixelText(ctx, 'LV 7', 100.3, 50.7, { size: 13 });
    const [, sx, sy] = calls.find(call => call[0] === 'scale');
    const [, tx, ty] = calls.find(call => call[0] === 'translate');
    for (const value of [sx * 1.22, sy * 1.22, tx * 1.22, ty * 1.22]) assert.ok(Math.abs(value - Math.round(value)) < 1e-9, value);
    assert.ok(Math.abs(width - 23 * sx) < 1e-9);
    assert.equal(view.api.measurePixelText('LV 7', { size: 13 }, ctx), width);
});
