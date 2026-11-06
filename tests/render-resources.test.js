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

test('changing score text reuses a bounded pool and canonical raster sizes', () => {
    const view = fixture('font');
    const ctx = { globalAlpha: 1, drawImage() {} };
    for (let score = 0; score < 5000; score++) view.api.pixelText(ctx, `SCORE ${score}`, 0, 0);
    assert.equal(view.api.getFontResources().textSprites, view.api.CACHE_LIMIT);
    assert.equal(view.allocations, view.api.CACHE_LIMIT + 1, 'only bounded text sprites plus CPU scratch are allocated');
    const allocations = view.api.getFontResources().textAllocations;
    for (let size = 14; size < 14.4; size += 0.001) view.api.pixelText(ctx, 'SAME', 0, 0, { size });
    assert.equal(view.api.getFontResources().textAllocations, allocations);
    view.api.clearFontResources();
    assert.equal(view.api.getFontResources().textPixels, 0);
    view.api.pixelText(ctx, 'RESTORED', 0, 0);
    assert.equal(view.api.getFontResources().textSprites, 1);
});
