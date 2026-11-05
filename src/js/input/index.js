const ACTIONS = Object.freeze({
    start: 9,
    view: 3,
    viewAlt: 8,
    weaponNext: 2,
    special: 1,
    specialAlt: 6,
    fire: 0,
    fireAlt: 7
});
const MAX_PLAYERS = 5;
const DEADZONE = 0.2;

function axis(value) {
    const n = Number(value) || 0;
    if (Math.abs(n) <= DEADZONE) return 0;
    return Math.sign(n) * Math.min(1, (Math.abs(n) - DEADZONE) / (1 - DEADZONE));
}

function createInput({
    documentObject = typeof document === 'undefined' ? null : document,
    windowObject = typeof window === 'undefined' ? null : window,
    navigatorObject = typeof navigator === 'undefined' ? null : navigator,
    onAction = () => {},
    onToast = () => {},
    onPlayersChanged = () => {},
    onPlayerLeft = () => {},
    shouldIgnoreKeyboard = () => false,
    maxPlayers = MAX_PLAYERS
} = {}) {
    const keyState = { left: false, right: false, up: false, down: false, fire: false, special: false, weaponNext: false, view: false };
    const heldKeys = new Map();
    const virtualSources = new Map();
    const gamepads = new Map();
    const connected = new Map();
    const previousButtons = new Map();
    const slots = new Map();
    const cap = Math.max(1, Math.min(MAX_PLAYERS, Number(maxPlayers) || MAX_PLAYERS));
    let keyboardSlot = 0;
    let lastInputs = [];

    const keyActions = {
        ArrowLeft: 'left', a: 'left', A: 'left',
        ArrowRight: 'right', d: 'right', D: 'right',
        ArrowUp: 'up', w: 'up', W: 'up',
        ArrowDown: 'down', s: 'down', S: 'down',
        ' ': 'fire',
        b: 'special', B: 'special', Shift: 'special',
        e: 'weaponNext', E: 'weaponNext'
    };

    function updatePlayers() {
        const count = Math.min(cap, Math.max(1, slots.size + 1));
        onPlayersChanged(count, { mode: 'coop' });
    }

    function toast(message) {
        try { onToast(message); } catch (error) { /* UI callbacks must not break input polling. */ }
    }

    function identify(pad, index) {
        return pad && pad.id ? `${index}:${pad.id}` : String(index);
    }

    function connectedPad(pad, index) {
        if (!pad || pad.connected === false) return;
        const id = identify(pad, index);
        if (connected.has(index)) {
            connected.set(index, id);
            gamepads.set(index, pad);
            return;
        }
        connected.set(index, id);
        gamepads.set(index, pad);
        previousButtons.set(index, []);
        toast(`Controller ${connected.size} connected`);
    }

    function disconnectedPad(index, idHint) {
        const pad = gamepads.get(index);
        const id = idHint || identify(pad, index);
        const known = connected.delete(index) || Boolean(pad);
        gamepads.delete(index);
        previousButtons.delete(index);
        const slot = slots.get(index);
        if (slot !== undefined) {
            slots.delete(index);
            keyboardSlot = firstFreeSlot();
            onPlayerLeft(slot);
            updatePlayers();
        }
        if (known) toast(`Controller disconnected`);
    }

    function firstFreeSlot() {
        const used = new Set(slots.values());
        for (let i = 0; i < cap; i++) if (!used.has(i)) return i;
        return cap - 1;
    }

    function buttonPressed(buttons, index) {
        const button = buttons && buttons[index];
        return Boolean(button && (button.pressed || Number(button.value) > 0.5));
    }

    function pollGamepads(game = null) {
        if (navigatorObject && typeof navigatorObject.getGamepads === 'function') {
            let pads = [];
            try { pads = navigatorObject.getGamepads() || []; } catch (error) { pads = []; }
            const seen = new Set();
            Array.from(pads).forEach((pad, index) => {
                if (!pad || pad.connected === false) return;
                const id = identify(pad, index);
                seen.add(index);
                connectedPad(pad, index);
                const buttons = pad.buttons || [];
                const was = previousButtons.get(index) || [];
                const aDown = buttonPressed(buttons, ACTIONS.fire);
                if (aDown && !was[ACTIONS.fire] && !slots.has(index) && game && game.state === 'title' && slots.size + 1 < cap) {
                    const slot = firstFreeSlot();
                    slots.set(index, slot);
                    if (slot === keyboardSlot) keyboardSlot = firstFreeSlot();
                    toast(`Player ${slot + 1} joined`);
                    updatePlayers();
                }
                const joined = slots.has(index);
                const rising = (buttonIndex) => buttonPressed(buttons, buttonIndex) && !was[buttonIndex];
                if (joined && rising(ACTIONS.start)) onAction(game && game.state === 'title' ? 'confirm' : 'pause');
                if (joined && rising(ACTIONS.weaponNext) && game && game.state === 'title') onAction('modeNext');
                if (joined && (rising(ACTIONS.view) || rising(ACTIONS.viewAlt))) onAction('toggleView');
                previousButtons.set(index, buttons.map((button) => Boolean(button && (button.pressed || Number(button.value) > 0.5))));
                gamepads.set(index, pad);
            });
            for (const [index, id] of Array.from(connected.entries())) {
                if (!seen.has(index)) disconnectedPad(index, id);
            }
        }

        const count = Math.max(1, keyboardSlot + 1, ...Array.from(slots.values(), (slot) => slot + 1));
        const inputs = Array.from({ length: Math.min(cap, count) }, () => ({ left: false, right: false, up: false, down: false, fire: false, special: false, weaponNext: false, view: false, ax: 0, ay: 0 }));
        if (inputs[keyboardSlot]) Object.assign(inputs[keyboardSlot], keyState);
        for (const [source, entry] of virtualSources) {
            const controls = inputs[keyboardSlot];
            if (!controls) continue;
            for (const action of Object.keys(keyState)) {
                controls[action] = controls[action] || Boolean(entry.state[action]) || entry.pending.has(action);
            }
            controls.ax = Math.max(-1, Math.min(1, controls.ax + entry.state.ax));
            controls.ay = Math.max(-1, Math.min(1, controls.ay + entry.state.ay));
            entry.pending.clear();
            if (!Object.values(entry.state).some(Boolean)) virtualSources.delete(source);
        }

        for (const [index, slot] of slots) {
            if (!inputs[slot]) continue;
            const pad = gamepads.get(index);
            if (!pad) continue;
            const buttons = pad.buttons || [];
            const axes = pad.axes || [];
            const ax = axis(axes[0]);
            const ay = -axis(axes[1]);
            const left = buttonPressed(buttons, 14);
            const right = buttonPressed(buttons, 15);
            const up = buttonPressed(buttons, 12);
            const down = buttonPressed(buttons, 13);
            Object.assign(inputs[slot], {
                left, right, up, down, ax, ay,
                fire: buttonPressed(buttons, ACTIONS.fire) || buttonPressed(buttons, ACTIONS.fireAlt),
                special: buttonPressed(buttons, ACTIONS.special) || buttonPressed(buttons, ACTIONS.specialAlt),
                weaponNext: buttonPressed(buttons, ACTIONS.weaponNext),
                view: buttonPressed(buttons, ACTIONS.view) || buttonPressed(buttons, ACTIONS.viewAlt)
            });
        }
        lastInputs = inputs;
        return inputs;
    }

    function keydown(event) {
        if (!event || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
        if (shouldIgnoreKeyboard(event)) return;
        const action = keyActions[event.key];
        if (action) {
            heldKeys.set(event.code || String(event.key).toLowerCase(), action);
            keyState[action] = true;
        }
    }
    function keyup(event) {
        const action = event && keyActions[event.key];
        const token = event && (event.code || String(event.key).toLowerCase());
        const heldAction = heldKeys.get(token) || action;
        heldKeys.delete(token);
        if (heldAction) keyState[heldAction] = Array.from(heldKeys.values()).includes(heldAction);
    }
    function setVirtualState(source, state) {
        if (!state) { virtualSources.delete(source); return; }
        const previous = virtualSources.get(source);
        const pending = previous ? previous.pending : new Set();
        const next = { ax: 0, ay: 0 };
        for (const action of Object.keys(keyState)) {
            next[action] = Boolean(state[action]);
            // Preserve a tap shorter than one animation frame, but never latch steering.
            if (['fire', 'special', 'weaponNext'].includes(action) && next[action] && !previous?.state[action]) pending.add(action);
        }
        for (const axis of ['ax', 'ay']) next[axis] = Number.isFinite(state[axis]) ? Math.max(-1, Math.min(1, state[axis])) : 0;
        virtualSources.set(source, { state: next, pending });
    }
    function clear() {
        heldKeys.clear();
        virtualSources.clear();
        Object.keys(keyState).forEach((key) => { keyState[key] = false; });
    }
    const visibilityChanged = () => { if (documentObject.hidden) clear(); };
    const focusChanged = (event) => { if (shouldIgnoreKeyboard(event)) clear(); };

    if (documentObject && documentObject.addEventListener) {
        documentObject.addEventListener('keydown', keydown);
        documentObject.addEventListener('keyup', keyup);
        documentObject.addEventListener('visibilitychange', visibilityChanged);
        documentObject.addEventListener('focusin', focusChanged);
    }
    const handleConnect = (event) => {
        const pad = event && event.gamepad;
        if (pad) connectedPad(pad, pad.index);
    };
    const handleDisconnect = (event) => {
        const pad = event && event.gamepad;
        if (pad) disconnectedPad(pad.index, identify(pad, pad.index));
    };
    if (windowObject && windowObject.addEventListener) {
        windowObject.addEventListener('blur', clear);
        windowObject.addEventListener('gamepadconnected', handleConnect);
        windowObject.addEventListener('gamepaddisconnected', handleDisconnect);
    }

    return {
        poll: pollGamepads,
        getInputs: () => lastInputs,
        setVirtualState,
        clear,
        get players() { return Math.min(cap, Math.max(1, slots.size + 1)); },
        get keyboardSlot() { return keyboardSlot; },
        get assignments() { return new Map(slots); },
        destroy() {
            clear();
            if (documentObject && documentObject.removeEventListener) {
                documentObject.removeEventListener('keydown', keydown);
                documentObject.removeEventListener('keyup', keyup);
                documentObject.removeEventListener('visibilitychange', visibilityChanged);
                documentObject.removeEventListener('focusin', focusChanged);
            }
            if (windowObject && windowObject.removeEventListener) {
                windowObject.removeEventListener('blur', clear);
                windowObject.removeEventListener('gamepadconnected', handleConnect);
                windowObject.removeEventListener('gamepaddisconnected', handleDisconnect);
            }
        }
    };
}

module.exports = { createInput, axis, MAX_PLAYERS, DEADZONE, ACTIONS };
