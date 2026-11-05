const test = require('node:test');
const assert = require('node:assert/strict');
const { createInput, axis, DEADZONE } = require('../src/js/input');

function eventTarget() {
    const listeners = new Map();
    return {
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type) { listeners.delete(type); },
        emit(type, event = {}) { const fn = listeners.get(type); if (fn) fn(event); }
    };
}

function pad(index, { buttons = [], axes = [] } = {}) {
    return { index, id: `fake-${index}`, connected: true, buttons: Array.from({ length: 16 }, (_, i) => buttons[i] || { pressed: false, value: 0 }), axes };
}

function press(value = true) { return { pressed: value, value: value ? 1 : 0 }; }

test('analog deadzone is 0.2 with rescaled output outside it', () => {
    assert.equal(DEADZONE, 0.2);
    assert.equal(axis(0.19), 0);
    assert.equal(axis(-0.2), 0);
    assert.ok(Math.abs(axis(0.6) - 0.5) < 1e-10);
    assert.equal(axis(-1), -1);
});

test('keyboard defaults to player one and maps movement and held fire', () => {
    const doc = eventTarget();
    const input = createInput({ documentObject: doc, windowObject: eventTarget(), navigatorObject: { getGamepads: () => [] } });
    doc.emit('keydown', { key: 'a' });
    doc.emit('keydown', { key: ' ' });
    assert.deepEqual(input.poll({ state: 'playing' })[0], {
        left: true, right: false, up: false, down: false, fire: true,
        special: false, weaponNext: false, view: false, ax: 0, ay: 0
    });
    doc.emit('keyup', { key: 'a' });
    doc.emit('keyup', { key: ' ' });
    assert.equal(input.poll({ state: 'playing' })[0].fire, false);
});

test('fake Gamepad API supports hotplug, A-to-join, analog, d-pad, and mapped buttons', () => {
    const nav = { pads: [], getGamepads() { return this.pads; } };
    const win = eventTarget();
    const toasts = [];
    const playerCounts = [];
    const actions = [];
    const input = createInput({
        navigatorObject: nav, windowObject: win, documentObject: eventTarget(),
        onToast: (message) => toasts.push(message),
        onPlayersChanged: (count) => playerCounts.push(count),
        onAction: (action) => actions.push(action)
    });
    nav.pads = [pad(0, { axes: [0.6, -0.5], buttons: { 0: press() } })];
    let controls = input.poll({ state: 'title' });
    assert.equal(input.players, 2);
    assert.equal(input.keyboardSlot, 1);
    assert.deepEqual({ ...controls[0], ax: Math.round(controls[0].ax * 1000) / 1000, ay: Math.round(controls[0].ay * 1000) / 1000 }, { left: false, right: false, up: false, down: false, ax: 0.5, ay: 0.375, fire: true, special: false, weaponNext: false, view: false });
    assert.match(toasts[0], /Controller 1 connected/);
    assert.equal(playerCounts.at(-1), 2);

    nav.pads[0].buttons[0] = press(false);
    nav.pads[0].buttons[1] = press();
    nav.pads[0].buttons[2] = press();
    nav.pads[0].buttons[3] = press();
    nav.pads[0].buttons[9] = press();
    input.poll({ state: 'playing' });
    assert.deepEqual(actions, ['pause', 'toggleView']);
    controls = input.getInputs();
    assert.equal(controls[0].special, true);
    assert.equal(controls[0].weaponNext, true);
    assert.equal(controls[0].view, true);

    nav.pads[0].buttons[3] = press(false);
    nav.pads[0].buttons[9] = press(false);
    nav.pads[0].buttons[12] = press();
    nav.pads[0].buttons[15] = press();
    controls = input.poll({ state: 'playing' });
    assert.equal(controls[0].up, true);
    assert.equal(controls[0].right, true);

    nav.pads = [];
    input.poll({ state: 'playing' });
    assert.equal(input.players, 1);
    assert.match(toasts.at(-1), /Controller disconnected/);
});

test('gamepad A does not join outside the title screen and max players is capped', () => {
    const nav = { pads: [], getGamepads() { return this.pads; } };
    const input = createInput({ navigatorObject: nav, windowObject: eventTarget(), documentObject: eventTarget(), maxPlayers: 2 });
    nav.pads = [pad(0, { buttons: { 0: press() } }), pad(1, { buttons: { 0: press() } })];
    input.poll({ state: 'playing' });
    assert.equal(input.players, 1);
    nav.pads[0].buttons[0] = press(false);
    input.poll({ state: 'title' });
    nav.pads[0].buttons[0] = press();
    input.poll({ state: 'title' });
    assert.equal(input.players, 2);
    assert.equal(input.assignments.size, 1);
});

test('keyboard responds immediately and does not release another held alias', () => {
    const doc = eventTarget();
    const input = createInput({ documentObject: doc, windowObject: eventTarget(), navigatorObject: {} });
    doc.emit('keydown', { key: 'a', code: 'KeyA', repeat: false });
    assert.equal(input.poll()[0].left, true);
    doc.emit('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' });
    doc.emit('keyup', { key: 'A', code: 'KeyA' });
    assert.equal(input.poll()[0].left, true);
    doc.emit('keyup', { key: 'ArrowLeft', code: 'ArrowLeft' });
    assert.equal(input.poll()[0].left, false);
    doc.emit('keydown', { key: 'e', code: 'KeyE' });
    assert.equal(input.poll()[0].weaponNext, true);
    doc.emit('keyup', { key: 'E', code: 'KeyE' });
    assert.equal(input.poll()[0].weaponNext, false);
});

test('virtual sources combine with keyboard and bound analog values without taking gamepad slots', () => {
    const doc = eventTarget();
    const input = createInput({ documentObject: doc, windowObject: eventTarget(), navigatorObject: {} });
    doc.emit('keydown', { key: 'a' });
    input.setVirtualState('tilt', { ax: 100, ay: -100 });
    input.setVirtualState('finger', { fire: true });
    let controls = input.poll()[0];
    assert.equal(input.players, 1);
    assert.equal(controls.ax, 1);
    assert.equal(controls.ay, -1);
    assert.equal(controls.left, true);
    assert.equal(controls.fire, true);
    input.setVirtualState('finger', {});
    controls = input.poll()[0];
    assert.equal(controls.fire, false);
    assert.equal(controls.ax, 1);
    input.setVirtualState('tilt', { ax: Infinity, ay: NaN });
    assert.equal(input.poll()[0].ax, 0);
    assert.equal(input.poll()[0].ay, 0);
});

test('sub-frame taps survive exactly one poll while cancelled taps do not fire', () => {
    const input = createInput({ documentObject: eventTarget(), windowObject: eventTarget(), navigatorObject: {} });
    for (const action of ['fire', 'special', 'weaponNext']) {
        input.setVirtualState('touch', { [action]: true });
        input.setVirtualState('touch', {});
        assert.equal(input.poll()[0][action], true);
        assert.equal(input.poll()[0][action], false);
        input.setVirtualState('touch', { [action]: true });
        input.setVirtualState('touch', null);
        assert.equal(input.poll()[0][action], false);
    }
});

test('visibility, blur and typing focus clear all held inputs', () => {
    const doc = eventTarget(), win = eventTarget();
    const input = createInput({ documentObject: doc, windowObject: win, navigatorObject: {}, shouldIgnoreKeyboard: e => e.typing });
    for (const leave of [
        () => { doc.hidden = true; doc.emit('visibilitychange'); },
        () => win.emit('blur'),
        () => doc.emit('focusin', { typing: true })
    ]) {
        doc.emit('keydown', { key: 'd' });
        input.setVirtualState('touch', { fire: true, ax: 1 });
        leave();
        const controls = input.poll()[0];
        assert.equal(controls.right, false);
        assert.equal(controls.fire, false);
        assert.equal(controls.ax, 0);
    }
    input.destroy();
});
