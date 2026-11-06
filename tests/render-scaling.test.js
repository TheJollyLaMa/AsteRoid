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
    let crtDraws = 0;
    let nextFrame;
    let renderFailure = null;
    let updateFailure = null;
    let resourceReleases = 0;
    let contextOptions;
    const records = [];
    const updates = [];
    const toasts = [];
    let cleared = 0;
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
        getContext: (_kind, options) => { contextOptions = options; return ctx; },
        getBoundingClientRect: () => rect,
        addEventListener(type, callback) { listeners[`canvas:${type}`] = callback; }
    };
    const listeners = {};
    const window = {
        devicePixelRatio: pixelRatio,
        addEventListener(type, callback) { listeners[type] = callback; },
        dispatchEvent() {}
    };
    const noop = () => {};
    const renderer = () => { if (renderFailure) throw renderFailure; smoothingDuringRender = ctx.imageSmoothingEnabled; };
    const modules = {
        './game': class {
            constructor() { this.view = 'overview'; this.time = 0; this.particles = []; }
            handleAction(action) { if (action === 'pause') this.state = this.state === 'paused' ? 'playing' : 'paused'; if (action === 'confirm' && this.state === 'paused') this.state = 'playing'; }
            update(dt) { if (updateFailure) throw updateFailure; updates.push(dt); }
            drainEvents() { return []; }
        },
        './audio': { createAudio: () => ({ setSector2: noop }) },
        './diagnostics': { createDiagnostics: () => ({ record: (...args) => records.push(args), report: () => ({ entries: records }) }) },
        './render/overview': { createOverviewRenderer: () => renderer },
        './render/pov': { createPovRenderer: () => renderer },
        './render/hud': { createHud: () => ({ drawHud: noop, setToast: message => toasts.push(message) }) },
        './render/screens': { drawOverlay: noop },
        './render/fx': { createFx: () => ({ shakeOffset: () => ({ x: 0, y: 0 }), drawScreen: noop, timeScale: () => 1, update: noop, clear: () => { cleared++; } }) },
        './render/post': { drawCrt: () => { crtDraws++; }, getPostResources: () => ({ postPixels: 0 }), clearPostResources: () => { resourceReleases++; } },
        './render/projection': {
            setViewWidth(value) {
                logicalWidth = Math.round(Math.max(800, Math.min(1600, value)));
                return logicalWidth;
            }
        },
        './render/assets': { loadAssets: noop, getAssetResources: () => ({ tintPixels: 0, imagePixels: 0 }), clearTintResources: noop },
        './render/battleCard': { renderBattleCard: noop, previewBattleCard: noop },
        './render/cardMath': { sampleRecord: noop },
        './render/shapes': { setGlowBudget: noop, getShapeResources: () => ({ shapePixels: 0 }), clearShapeResources: noop },
        './render/font': { getFontResources: () => ({ textPixels: 0 }), clearFontResources: noop },
        './input': { createInput: () => ({ poll: () => [{}], clear: noop }) }
    };
    vm.runInNewContext(source, {
        require(name) { assert.ok(modules[name], name); return modules[name]; },
        document: { getElementById: () => canvas, addEventListener: noop },
        window,
        ResizeObserver: resizeObserver ? class {
            constructor(callback) { resize = callback; }
            observe() {}
        } : undefined,
        requestAnimationFrame: callback => { nextFrame = callback; },
        CustomEvent: class {},
        performance: { now: () => 0 }
    });
    return {
        canvas, ctx, window,
        draw: () => window.asteroidDraw(),
        frame: timestamp => nextFrame(timestamp),
        updates, toasts,
        records, listeners,
        failDraw: error => { renderFailure = error; },
        failUpdate: error => { updateFailure = error; },
        get cleared() { return cleared; },
        get resourceReleases() { return resourceReleases; },
        get contextOptions() { return contextOptions; },
        resize(width, height) {
            rect = { width, height };
            (resize || listeners.resize)();
        },
        get allocations() { return allocations; },
        get logicalWidth() { return logicalWidth; },
        get crtDraws() { return crtDraws; },
        get smoothingDuringRender() { return smoothingDuringRender; }
    };
}

test('title text is not covered by CRT scanlines while gameplay keeps its filter', () => {
    const view = fixture(800, 600);
    view.window.asteroidGame.state = 'title';
    view.draw();
    assert.equal(view.crtDraws, 0);
    view.window.asteroidGame.state = 'playing';
    view.draw();
    assert.equal(view.crtDraws, 1);
});

test('main graphics context is opaque without forcing CPU readback', () => {
    const view = fixture(800, 600);
    assert.equal(view.contextOptions.alpha, false);
    assert.equal(view.contextOptions.willReadFrequently, undefined);
});

for (const ratio of [1, 1.25, 2, 3]) {
    test(`backing store stays within its GPU pixel budget at DPR ${ratio}`, () => {
        const view = fixture(1368, 720, ratio);
        const effective = Math.min(ratio, 2, Math.sqrt(3_000_000 / (1368 * 720)));
        assert.equal(view.canvas.width, Math.floor(1368 * effective));
        assert.equal(view.canvas.height, Math.floor(720 * effective));
        assert.ok(view.canvas.width * view.canvas.height <= 3_000_000);
        view.draw();
        assert.deepEqual(view.ctx.transform, [view.canvas.width / view.logicalWidth, 0, 0, view.canvas.height / 600, 0, 0]);
        assert.equal(view.smoothingDuringRender, false);
    });
}

test('fractional layout sizes round only the final contained device dimensions', () => {
    const view = fixture(1365.5, 720.25, 1.25);
    const shownWidth = Math.min(1365.5, 720.25 * view.logicalWidth / 600);
    assert.equal(view.canvas.width, Math.floor(shownWidth * 1.25));
    assert.equal(view.canvas.height, Math.floor(shownWidth * 600 / view.logicalWidth * 1.25));
});

test('portrait and ultrawide decks preserve the contained view aspect', () => {
    const portrait = fixture(390, 700, 3);
    assert.equal(portrait.logicalWidth, 800);
    assert.equal(portrait.canvas.width, 780);
    assert.equal(portrait.canvas.height, 585);
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
    assert.equal(view.canvas.width, 1600);
    assert.equal(view.canvas.height, 1200);
    assert.equal(view.smoothingDuringRender, false);
});

test('a long stall freezes local battle, clears cosmetic load and allows recovery', () => {
    const view = fixture(1200, 600, 2);
    view.window.asteroidGame.state = 'playing';
    view.window.asteroidGame.particles.push({});
    view.frame(0);
    view.frame(400);
    assert.equal(view.window.asteroidGame.state, 'paused');
    assert.equal(view.updates.at(-1), 0, 'no battle catch-up during overload');
    assert.equal(view.window.asteroidGame.particles.length, 0);
    assert.equal(view.cleared, 1);
    assert.match(view.toasts[0], /Performance pause/);
    assert.ok(view.canvas.width < 2400);
    view.window.asteroidGame.state = 'playing';
    view.frame(416);
    assert.equal(view.window.asteroidGame.state, 'playing');
    assert.equal(view.updates.at(-1), 0.016);
});

test('online overload reduces visuals without pretending to pause the referee', () => {
    const view = fixture(800, 600, 2);
    view.window.asteroidGame.state = 'playing';
    view.window.voyager.setNetworkMode({});
    view.frame(0);
    view.frame(400);
    assert.equal(view.window.asteroidGame.state, 'playing');
    assert.match(view.toasts[0], /Online battle continues/);
});

test('repeated overload stays bounded and quality only recovers during healthy play', () => {
    const view = fixture(800, 600, 2);
    view.window.asteroidGame.state = 'playing';
    view.frame(0);
    for (const time of [400, 800, 1200, 1600]) view.frame(time);
    assert.equal(view.window.asteroidGame.state, 'paused', 'repeated overload must never toggle pause off');
    assert.equal(view.canvas.width, 560);
    for (let frame = 1; frame <= 610; frame++) view.frame(1600 + frame * 16);
    assert.equal(view.canvas.width, 560, 'paused scene does not prematurely restore heavy rendering');
    view.window.asteroidGame.state = 'playing';
    for (let frame = 611; frame <= 1210; frame++) view.frame(1600 + frame * 16);
    assert.ok(view.canvas.width > 560);
    assert.ok(view.canvas.width <= 800, 'quality returns gradually, not as an immediate GPU spike');
});

for (const stage of ['Draw', 'Update']) test(`${stage} error keeps RAF alive but freezes the failed scene until explicit recovery`, () => {
    const view = fixture(800, 600);
    view.window.asteroidGame.state = 'playing';
    view[`fail${stage}`](new Error('test frame failure'));
    view.frame(0);
    assert.equal(view.window.asteroidGame.state, 'paused');
    assert.equal(view.records.at(-1)[0], 'frame-error');
    const count = view.updates.length;
    view.frame(16);
    assert.equal(view.updates.length, count, 'failed scene is not repeatedly stepped');
    view[`fail${stage}`](null);
    view.window.voyagerDiagnostics.resume();
    view.frame(4000);
    assert.equal(view.window.asteroidGame.state, 'playing');
    assert.equal(view.updates.at(-1), 0, 'resuming never catches up stalled time');
});

test('context loss pauses once and restored canvas waits for manual recovery', () => {
    const view = fixture(800, 600);
    view.window.asteroidGame.state = 'playing';
    view.listeners['canvas:contextlost']({ preventDefault() {} });
    assert.equal(view.resourceReleases, 1, 'context loss releases stale offscreen surfaces');
    view.frame(1000);
    assert.equal(view.window.asteroidGame.state, 'paused');
    assert.throws(() => view.window.voyagerDiagnostics.resume(), /not recovered/);
    view.listeners['canvas:contextrestored']();
    view.frame(5000);
    assert.equal(view.window.asteroidGame.state, 'paused');
    view.window.voyagerDiagnostics.resume();
    view.frame(6000);
    assert.equal(view.window.asteroidGame.state, 'playing');
    assert.equal(view.canvas.width, 520, 'graphics recovery starts at reduced resolution');
});

test('active flights record periodic resource samples without frame-by-frame storage writes', () => {
    const view = fixture(800, 600);
    view.window.asteroidGame.state = 'playing';
    for (let frame = 0; frame <= 1000; frame++) view.frame(frame * 16);
    const samples = view.records.filter(entry => entry[0] === 'graphics-sample');
    assert.equal(samples.length, 1);
    assert.ok(samples[0][2].frameSamples > 900);
    assert.equal(samples[0][2].maxFrameMs, 16);
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
