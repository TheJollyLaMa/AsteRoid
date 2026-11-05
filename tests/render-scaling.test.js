const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync(require.resolve('../src/js/app'), 'utf8');

function fixture(width, height, pixelRatio = 1, resizeObserver = true) {
    let rect = { width, height };
    let resize;
    let allocations = 0;
    let logicalWidth;
    let smoothingDuringRender;
    const ctx = {
        imageSmoothingEnabled: true,
        setTransform(...args) { this.transform = args; },
        save() {}, restore() {}, translate() {}
    };
    let backingWidth = 800;
    let backingHeight = 600;
    const canvas = {
        get width() { return backingWidth; },
        set width(value) { backingWidth = value; allocations++; ctx.imageSmoothingEnabled = true; },
        get height() { return backingHeight; },
        set height(value) { backingHeight = value; allocations++; ctx.imageSmoothingEnabled = true; },
        getContext: () => ctx,
        getBoundingClientRect: () => rect,
        addEventListener() {}
    };
    const listeners = {};
    const window = {
        devicePixelRatio: pixelRatio,
        addEventListener(type, callback) { listeners[type] = callback; },
        dispatchEvent() {}
    };
    const noop = () => {};
    const renderer = () => { smoothingDuringRender = ctx.imageSmoothingEnabled; };
    const modules = {
        './game': class { constructor() { this.view = 'overview'; this.time = 0; } },
        './audio': { createAudio: () => ({ setSector2: noop }) },
        './render/overview': { createOverviewRenderer: () => renderer },
        './render/pov': { createPovRenderer: () => renderer },
        './render/hud': { createHud: () => ({ drawHud: noop }) },
        './render/screens': { drawOverlay: noop },
        './render/fx': { createFx: () => ({ shakeOffset: () => ({ x: 0, y: 0 }), drawScreen: noop }) },
        './render/post': { drawCrt: noop },
        './render/projection': {
            setViewWidth(value) {
                logicalWidth = Math.round(Math.max(800, Math.min(1600, value)));
                return logicalWidth;
            }
        },
        './render/assets': { loadAssets: noop },
        './render/battleCard': { renderBattleCard: noop, previewBattleCard: noop },
        './render/cardMath': { sampleRecord: noop },
        './input': { createInput: () => ({}) }
    };
    vm.runInNewContext(source, {
        require(name) { assert.ok(modules[name], name); return modules[name]; },
        document: { getElementById: () => canvas, addEventListener: noop },
        window,
        ResizeObserver: resizeObserver ? class {
            constructor(callback) { resize = callback; }
            observe() {}
        } : undefined,
        requestAnimationFrame: noop,
        CustomEvent: class {}
    });
    return {
        canvas, ctx, window,
        draw: () => window.asteroidDraw(),
        resize(width, height) {
            rect = { width, height };
            (resize || listeners.resize)();
        },
        get allocations() { return allocations; },
        get logicalWidth() { return logicalWidth; },
        get smoothingDuringRender() { return smoothingDuringRender; }
    };
}

for (const ratio of [1, 1.25, 2, 3]) {
    test(`backing store matches device pixels at DPR ${ratio}`, () => {
        const view = fixture(1368, 720, ratio);
        assert.equal(view.canvas.width, Math.round(1368 * ratio));
        assert.equal(view.canvas.height, Math.round(720 * ratio));
        view.draw();
        assert.deepEqual(view.ctx.transform, [view.canvas.width / view.logicalWidth, 0, 0, view.canvas.height / 600, 0, 0]);
        assert.equal(view.smoothingDuringRender, false);
    });
}

test('fractional layout sizes round only the final contained device dimensions', () => {
    const view = fixture(1365.5, 720.25, 1.25);
    const shownWidth = Math.min(1365.5, 720.25 * view.logicalWidth / 600);
    assert.equal(view.canvas.width, Math.round(shownWidth * 1.25));
    assert.equal(view.canvas.height, Math.round(shownWidth * 600 / view.logicalWidth * 1.25));
});

test('portrait and ultrawide decks preserve the contained view aspect', () => {
    const portrait = fixture(390, 700, 3);
    assert.equal(portrait.logicalWidth, 800);
    assert.equal(portrait.canvas.width, 1170);
    assert.equal(portrait.canvas.height, 878);
    const wide = fixture(2400, 600, 1.25);
    assert.equal(wide.logicalWidth, 1600);
    assert.equal(wide.canvas.width, 2000);
    assert.equal(wide.canvas.height, 750);
});

test('resize restores crisp sampling without reallocating unchanged backing stores', () => {
    const view = fixture(800, 600, 1);
    view.resize(1200, 600);
    assert.equal(view.canvas.width, 1200);
    view.draw();
    assert.equal(view.smoothingDuringRender, false);
    const allocations = view.allocations;
    view.resize(1200, 600);
    view.draw();
    assert.equal(view.allocations, allocations);
});

test('device pixel ratio changes resize on draw without layout events', () => {
    const view = fixture(800, 600);
    view.window.devicePixelRatio = 3;
    view.draw();
    assert.equal(view.canvas.width, 2400);
    assert.equal(view.canvas.height, 1800);
    assert.equal(view.smoothingDuringRender, false);
});

test('window resize is a fallback when ResizeObserver is unavailable', () => {
    const view = fixture(800, 600, 1, false);
    view.resize(1000, 600);
    assert.equal(view.canvas.width, 1000);
});

test('unmeasured canvas falls back to the logical size and CSS keeps pixel edges', () => {
    const view = fixture(0, 0);
    assert.equal(view.canvas.width, 800);
    assert.equal(view.canvas.height, 600);
    const css = readFileSync(require.resolve('../src/css/site.css'), 'utf8');
    assert.match(css, /canvas\s*\{[^}]*image-rendering:pixelated/);
});
