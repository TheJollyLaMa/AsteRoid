import test from 'node:test';
import assert from 'node:assert/strict';
import { tiltVector, createTiltController, enterFlightScreen } from '../src/js/input/mobile-controls.mjs';

function fakeWindow(overrides = {}) {
    const listeners = new Map(), timers = new Map();
    let timerId = 0;
    return {
        isSecureContext: true,
        DeviceOrientationEvent: {},
        screen: { orientation: { angle: 0 } },
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type) { listeners.delete(type); },
        emit(type, value) { listeners.get(type)?.(value); },
        setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
        clearTimeout(id) { timers.delete(id); },
        expire() { const callbacks = [...timers.values()]; timers.clear(); for (const fn of callbacks) fn(); },
        ...overrides
    };
}

test('tilt uses calibrated, screen-relative, deadzoned and capped finite axes', () => {
    const origin = { beta: 30, gamma: 5 };
    assert.deepEqual(tiltVector(origin, origin), { ax: 0, ay: 0 });
    assert.deepEqual(tiltVector({ beta: 31, gamma: 6 }, origin), { ax: 0, ay: 0 });
    assert.deepEqual(tiltVector({ beta: 5, gamma: 30 }, origin), { ax: 1, ay: 1 });
    assert.deepEqual(tiltVector({ beta: 55, gamma: 5 }, origin, 90), { ax: 1, ay: 0 });
    assert.deepEqual(tiltVector({ beta: 55, gamma: 5 }, origin, -90), { ax: -1, ay: 0 });
    assert.deepEqual(tiltVector({ beta: Infinity, gamma: 30 }, origin), { ax: 0, ay: 0 });
    assert.deepEqual(tiltVector({ beta: 30, gamma: null }, origin), { ax: 0, ay: 0 });
    assert.equal(tiltVector({ beta: -179, gamma: 0 }, { beta: 179, gamma: 0 }).ay, 0);
});

test('motion is opt-in, asks permission only on enable, calibrates and recenters', async () => {
    let requests = 0;
    const win = fakeWindow({ DeviceOrientationEvent: { async requestPermission() { requests++; return 'granted'; } } });
    const vectors = [], statuses = [];
    const tilt = createTiltController({ windowObject: win, onVector: v => vectors.push(v), onStatus: (text, enabled) => statuses.push({ text, enabled }) });
    assert.equal(requests, 0);
    win.emit('deviceorientation', { beta: 0, gamma: 20 });
    assert.equal(vectors.length, 0);
    assert.equal(await tilt.enable(), true);
    assert.equal(requests, 1);
    win.emit('deviceorientation', { beta: 30, gamma: 10 });
    assert.deepEqual(vectors.at(-1), { ax: 0, ay: 0 });
    win.emit('deviceorientation', { beta: 30, gamma: 35 });
    assert.equal(vectors.at(-1).ax, 1);
    tilt.calibrate();
    assert.deepEqual(vectors.at(-1), { ax: 0, ay: 0 });
    win.emit('deviceorientation', { beta: 20, gamma: 15 });
    assert.deepEqual(vectors.at(-1), { ax: 0, ay: 0 });
    tilt.disable();
    win.emit('deviceorientation', { beta: -50, gamma: -50 });
    assert.deepEqual(vectors.at(-1), { ax: 0, ay: 0 });
    assert.equal(tilt.active, false);
    assert.equal(statuses.at(-1).enabled, false);
});

test('denied, insecure, missing, throwing and silent sensors stay safely at zero', async () => {
    for (const overrides of [
        { isSecureContext: false },
        { DeviceOrientationEvent: undefined },
        { DeviceOrientationEvent: { requestPermission: async () => 'denied' } },
        { DeviceOrientationEvent: { requestPermission: async () => { throw new Error('restricted'); } } }
    ]) {
        const vectors = [];
        const tilt = createTiltController({ windowObject: fakeWindow(overrides), onVector: v => vectors.push(v) });
        assert.equal(await tilt.enable(), false);
        assert.equal(tilt.active, false);
        assert.deepEqual(vectors.at(-1), { ax: 0, ay: 0 });
    }
    const win = fakeWindow(), vectors = [];
    const tilt = createTiltController({ windowObject: win, onVector: v => vectors.push(v) });
    await tilt.enable();
    win.emit('deviceorientation', { beta: null, gamma: null });
    win.expire();
    assert.equal(tilt.active, false);
    assert.deepEqual(vectors.at(-1), { ax: 0, ay: 0 });
});

test('leaving during the permission prompt cannot enable motion later', async () => {
    let grant;
    const win = fakeWindow({ DeviceOrientationEvent: { requestPermission: () => new Promise(resolve => { grant = resolve; }) } });
    const tilt = createTiltController({ windowObject: win });
    const request = tilt.enable();
    tilt.disable();
    grant('granted');
    assert.equal(await request, false);
    assert.equal(tilt.active, false);
});

test('fullscreen and landscape are independent progressive enhancements', async () => {
    assert.match(await enterFlightScreen({}, {}), /unavailable.*portrait/);
    assert.match(await enterFlightScreen({ requestFullscreen: async () => { throw new Error('unsupported'); } }, {}), /inline/);
    let fullscreen = false, locked = false;
    const element = { requestFullscreen: async () => { fullscreen = true; } };
    const win = { screen: { orientation: { lock: async value => { assert.equal(fullscreen, true); assert.equal(value, 'landscape'); locked = true; } } } };
    assert.match(await enterFlightScreen(element, win), /Fullscreen ready/);
    assert.equal(locked, true);
    assert.match(await enterFlightScreen(element, {}), /Rotate manually/);
    assert.match(await enterFlightScreen(element, { screen: { orientation: { lock: async () => { throw new Error('not supported'); } } } }), /rotation lock unavailable/);
});
