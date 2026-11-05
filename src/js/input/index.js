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
        b: 'special', B: 'special', Shift: 'special'
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
        if (action) keyState[action] = true;
    }
    function keyup(event) {
        const action = event && keyActions[event.key];
        if (action) keyState[action] = false;
    }
    function clear() {
        Object.keys(keyState).forEach((key) => { keyState[key] = false; });
    }

    if (documentObject && documentObject.addEventListener) {
        documentObject.addEventListener('keydown', keydown);
        documentObject.addEventListener('keyup', keyup);
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
        clear,
        get players() { return Math.min(cap, Math.max(1, slots.size + 1)); },
        get keyboardSlot() { return keyboardSlot; },
        get assignments() { return new Map(slots); },
        destroy() {
            if (documentObject && documentObject.removeEventListener) {
                documentObject.removeEventListener('keydown', keydown);
                documentObject.removeEventListener('keyup', keyup);
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
