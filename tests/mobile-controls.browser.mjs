// Optional browser smoke: uses existing Playwright, never rebuilds the checked-in bundle.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../../BigNuten_Vanilla/node_modules/playwright');
const root = path.resolve(fileURLToPath(new URL('../src/', import.meta.url)));
const inputSource = await readFile(new URL('../src/js/input/index.js', import.meta.url), 'utf8');
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const server = createServer(async (req, res) => {
    try {
        const target = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
        if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        const file = target === root ? path.join(root, 'index.html') : target;
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'networkidle' });
    // The production bundle is deliberately not rebuilt by this worker. Exercise the
    // source bridge directly with the actual DOM/module and existing bundled game.
    await page.addScriptTag({ content: `(() => { const module = { exports: {} }; ${inputSource}
        window.mobileTestInput = module.exports.createInput();
        window.voyager.input = window.mobileTestInput;
    })();` });
    const panel = page.locator('#mobile-controls');
    await panel.waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'portrait must not overflow horizontally');
    for (const box of await panel.locator('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()))) {
        assert.ok(box.width >= 44 && box.height >= 44, 'touch targets must be at least 44px');
    }
    const left = await page.locator('[data-mobile-held=left]').boundingBox();
    const fire = await page.locator('[data-mobile-held=fire]').boundingBox();
    const point = (box, id) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2, id });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(left, 1), point(fire, 2)] });
    let controls = await page.evaluate(() => mobileTestInput.poll()[0]);
    assert.equal(controls.left, true);
    assert.equal(controls.fire, true);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [point(fire, 2)] });
    controls = await page.evaluate(() => mobileTestInput.poll()[0]);
    assert.equal(controls.left, true);
    assert.equal(controls.fire, false);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await page.evaluate(() => mobileTestInput.poll()[0].left), false);
    await page.evaluate(() => {
        const button = document.querySelector('[data-mobile-held=fire]');
        button.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, button: 0, bubbles: true }));
        window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }));
    });
    assert.equal(await page.evaluate(() => mobileTestInput.poll()[0].fire), true, 'sub-frame tap must reach simulation');
    assert.equal(await page.evaluate(() => mobileTestInput.poll()[0].fire), false);
    await page.evaluate(() => {
        window.DeviceOrientationEvent = class extends Event {
            static requestPermission() { return Promise.resolve('granted'); }
        };
    });
    await page.locator('[data-mobile-tilt]').click();
    await page.evaluate(() => {
        const sample = gamma => {
            const event = new Event('deviceorientation');
            Object.assign(event, { beta: 30, gamma });
            window.dispatchEvent(event);
        };
        sample(0); sample(25);
    });
    assert.equal(await page.evaluate(() => mobileTestInput.poll()[0].ax), 1);
    await page.locator('[data-mobile-center]').click();
    assert.equal(await page.evaluate(() => mobileTestInput.poll()[0].ax), 0);
    await page.evaluate(() => {
        const walletButton = document.createElement('button');
        walletButton.textContent = 'Wallet outside game';
        document.body.append(walletButton);
        walletButton.focus();
        const event = new Event('deviceorientation');
        Object.assign(event, { beta: 30, gamma: 25 });
        window.dispatchEvent(event);
    });
    assert.equal(await page.evaluate(() => mobileTestInput.poll()[0].ax), 0, 'motion cannot resume behind wallet UI');
    assert.equal(await page.locator('[data-mobile-tilt]').getAttribute('aria-pressed'), 'false');
    await page.evaluate(() => document.body.lastElementChild.remove());
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.locator('[data-mobile-tilt]').getAttribute('aria-pressed'), 'false');
    await page.evaluate(() => {
        document.querySelector('#flight-deck').requestFullscreen = undefined;
    });
    await page.locator('[data-mobile-screen]').click();
    assert.match(await page.locator('[data-mobile-status]').textContent(), /Fullscreen unavailable/);
    await page.evaluate(() => {
        window.mobileTestActions = [];
        window.voyager.game.handleAction = action => window.mobileTestActions.push(action);
    });
    await page.locator('[data-mobile-command=pause]').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.mobileTestActions), ['pause'], 'keyboard activation must not also trigger global confirm');
    await page.locator('[data-mobile-held=weaponNext]').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => mobileTestInput.poll()[0].weaponNext), true);
    assert.equal(await page.evaluate(() => mobileTestInput.poll()[0].weaponNext), false);
    await page.setViewportSize({ width: 844, height: 390 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'landscape must not overflow horizontally');
    const layout = await page.evaluate(() => ({
        panel: document.querySelector('#mobile-controls').getBoundingClientRect().toJSON(),
        canvas: document.querySelector('#gameCanvas').getBoundingClientRect().toJSON()
    }));
    assert.ok(layout.panel.width >= 200 && layout.canvas.width > 250, 'landscape has a usable side panel and canvas');
    assert.ok(layout.panel.x >= layout.canvas.right - 1, 'landscape controls must not cover the canvas');
    assert.deepEqual(errors, [], 'page must not raise uncaught errors');
    console.log('Mobile browser smoke passed: portrait/landscape, 44px targets, multi-touch, tap/hold, calibrated tilt, blur cleanup and fullscreen fallback.');
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
