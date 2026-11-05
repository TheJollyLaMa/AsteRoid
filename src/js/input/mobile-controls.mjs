const clamp = value => Math.max(-1, Math.min(1, value));
const wrap = value => ((value + 180) % 360 + 360) % 360 - 180;

export function tiltVector(sample, origin, angle = 0) {
    if (![sample?.beta, sample?.gamma, origin?.beta, origin?.gamma, angle].every(Number.isFinite)) return { ax: 0, ay: 0 };
    const beta = wrap(sample.beta - origin.beta), gamma = wrap(sample.gamma - origin.gamma);
    const radians = angle * Math.PI / 180;
    const deadzone = value => Math.abs(value) < 0.1 ? 0 : clamp((value - Math.sign(value) * 0.1) / 0.9);
    return {
        ax: deadzone((gamma * Math.cos(radians) + beta * Math.sin(radians)) / 25),
        ay: deadzone((-beta * Math.cos(radians) + gamma * Math.sin(radians)) / 25)
    };
}

export function createTiltController({ windowObject: win = window, onVector = () => {}, onStatus = () => {} } = {}) {
    let active = false, origin = null, timer = null, generation = 0;
    const zero = () => onVector({ ax: 0, ay: 0 });
    const clearTimer = () => { if (timer !== null) win.clearTimeout(timer); timer = null; };
    const disable = (message = 'Tilt off. Touch controls remain available.') => {
        generation++;
        active = false;
        origin = null;
        clearTimer();
        win.removeEventListener('deviceorientation', sample);
        zero();
        onStatus(message, false);
    };
    const armTimeout = () => {
        clearTimer();
        timer = win.setTimeout(() => disable('No motion readings. Use touch controls or enable tilt again.'), 2500);
    };
    function sample(event) {
        if (!active || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
        armTimeout();
        if (!origin) {
            origin = { beta: event.beta, gamma: event.gamma };
            zero();
            onStatus('Tilt ready. Hold comfortably; Recenter resets neutral.', true);
            return;
        }
        const angle = win.screen?.orientation?.angle ?? win.orientation ?? 0;
        onVector(tiltVector(event, origin, angle));
    }
    return {
        async enable() {
            if (active) return true;
            const attempt = ++generation;
            if (!win.isSecureContext || !win.DeviceOrientationEvent) {
                disable('Tilt unavailable here. Use touch controls (motion needs HTTPS and browser support).');
                return false;
            }
            try {
                if (typeof win.DeviceOrientationEvent.requestPermission === 'function') {
                    const permission = await win.DeviceOrientationEvent.requestPermission();
                    if (attempt !== generation) return false;
                    if (permission !== 'granted') {
                        disable('Motion permission denied. Touch controls still work.');
                        return false;
                    }
                }
                if (attempt !== generation) return false;
                active = true;
                origin = null;
                win.addEventListener('deviceorientation', sample);
                armTimeout();
                onStatus('Hold comfortably. Waiting for motion to calibrate…', true);
                return true;
            } catch {
                if (attempt === generation) disable('Motion permission unavailable. Use touch controls.');
                return false;
            }
        },
        disable,
        calibrate() {
            if (!active) return;
            origin = null;
            zero();
            onStatus('Hold comfortably. Waiting for motion to recenter…', true);
        },
        get active() { return active; }
    };
}

export async function enterFlightScreen(element, win = window) {
    if (!element?.requestFullscreen) return 'Fullscreen unavailable. Rotate your device if you prefer landscape; portrait still works.';
    try {
        await element.requestFullscreen();
    } catch {
        return 'Fullscreen was not available. Keep playing inline; portrait and landscape both work.';
    }
    try {
        if (typeof win.screen?.orientation?.lock === 'function') await win.screen.orientation.lock('landscape');
        else return 'Fullscreen ready. Rotate manually for landscape.';
    } catch {
        return 'Fullscreen ready; rotation lock unavailable. Rotate manually or keep portrait.';
    }
    return 'Fullscreen ready. Use Exit screen to return.';
}

export function mountMobileControls({
    windowObject: win = window,
    documentObject: doc = document,
    getVoyager = () => win.voyager
} = {}) {
    const deck = doc.getElementById('flight-deck'), canvas = doc.getElementById('gameCanvas');
    if (!deck || !canvas || doc.getElementById('mobile-controls')) return null;
    const panel = doc.createElement('section');
    panel.id = 'mobile-controls';
    panel.className = 'mobile-controls';
    panel.setAttribute('aria-label', 'Touch flight controls');
    panel.innerHTML = `
        <div class="mobile-toolbar">
            <button type="button" data-mobile-command="confirm">Launch / continue</button>
            <button type="button" data-mobile-command="pause">Pause / resume</button>
            <button type="button" data-mobile-command="toggleView">View</button>
            <button type="button" data-mobile-screen>Full screen</button>
        </div>
        <div class="mobile-flight">
            <div class="mobile-dpad" role="group" aria-label="Hold to steer">
                <button type="button" data-mobile-held="up" aria-label="Move forward">▲</button>
                <button type="button" data-mobile-held="left" aria-label="Move left">◀</button>
                <button type="button" data-mobile-held="down" aria-label="Move back">▼</button>
                <button type="button" data-mobile-held="right" aria-label="Move right">▶</button>
            </div>
            <div class="mobile-weapons" role="group" aria-label="Weapons">
                <button type="button" data-mobile-held="fire" class="mobile-fire">Fire<br><small>tap / hold</small></button>
                <button type="button" data-mobile-held="special">Nova</button>
                <button type="button" data-mobile-held="weaponNext">Next weapon</button>
            </div>
        </div>
        <div class="mobile-motion">
            <button type="button" data-mobile-tilt aria-pressed="false">Enable tilt</button>
            <button type="button" data-mobile-center disabled>Recenter</button>
            <span>Touch always works · rotate for a wider view</span>
        </div>
        <p data-mobile-status role="status" aria-live="polite">Hold arrows to steer. Tap or hold Fire; hold charges compatible weapons. Tilt is optional.</p>`;
    deck.append(panel);
    const status = panel.querySelector('[data-mobile-status]');
    const tiltButton = panel.querySelector('[data-mobile-tilt]');
    const centerButton = panel.querySelector('[data-mobile-center]');
    const screenButton = panel.querySelector('[data-mobile-screen]');
    const disposers = [], pointers = new Map(), sources = new Set();
    let mounted = true;
    const listen = (target, type, fn) => {
        target?.addEventListener(type, fn);
        disposers.push(() => target?.removeEventListener(type, fn));
    };
    const setState = (source, state) => {
        sources.add(source);
        getVoyager()?.input?.setVirtualState(source, state);
    };
    const wakeCanvas = () => {
        canvas.focus({ preventScroll: true });
        // Reuse the app's audio-unlock handler within the real user gesture.
        canvas.dispatchEvent(new win.Event('pointerdown'));
    };
    const tilt = createTiltController({
        windowObject: win,
        onVector: vector => setState('mobile:tilt', vector),
        onStatus: (message, enabled) => {
            status.textContent = message;
            tiltButton.setAttribute('aria-pressed', String(enabled));
            tiltButton.textContent = enabled ? 'Disable tilt' : 'Enable tilt';
            centerButton.disabled = !enabled;
        }
    });
    const releasePointer = (event, cancelled = false) => {
        const held = pointers.get(event.pointerId);
        if (!held) return;
        pointers.delete(event.pointerId);
        setState(held.source, cancelled ? null : {});
        held.button.classList.toggle('is-held', Array.from(pointers.values()).some(value => value.button === held.button));
    };
    for (const button of panel.querySelectorAll('[data-mobile-held]')) {
        const action = button.dataset.mobileHeld;
        listen(button, 'pointerdown', event => {
            if (event.button !== 0 || !getVoyager()?.input?.setVirtualState) return;
            event.preventDefault();
            wakeCanvas();
            const source = `mobile:pointer:${event.pointerId}`;
            pointers.set(event.pointerId, { source, button });
            setState(source, { [action]: true });
            button.classList.add('is-held');
            try { button.setPointerCapture(event.pointerId); } catch { /* Window release listeners remain the fallback. */ }
        });
        listen(button, 'lostpointercapture', event => releasePointer(event, true));
        listen(button, 'contextmenu', event => event.preventDefault());
        listen(button, 'click', event => {
            // Keyboard/assistive activation has no pointerdown; queue one input frame.
            if (event.detail !== 0) return;
            wakeCanvas();
            const source = `mobile:activate:${action}`;
            setState(source, { [action]: true });
            if (['fire', 'special', 'weaponNext'].includes(action)) setState(source, {});
            else win.setTimeout(() => { if (mounted) setState(source, null); }, 100);
        });
    }
    listen(win, 'pointerup', event => releasePointer(event));
    listen(win, 'pointercancel', event => releasePointer(event, true));
    for (const type of ['keydown', 'keyup']) {
        listen(panel, type, event => {
            if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
        });
    }
    for (const button of panel.querySelectorAll('[data-mobile-command]')) {
        listen(button, 'click', () => {
            wakeCanvas();
            getVoyager()?.game?.handleAction(button.dataset.mobileCommand);
        });
    }
    listen(tiltButton, 'click', async () => {
        if (tilt.active) { tilt.disable(); return; }
        tiltButton.disabled = true;
        await tilt.enable();
        tiltButton.disabled = false;
    });
    listen(centerButton, 'click', () => tilt.calibrate());
    listen(screenButton, 'click', async () => {
        if (doc.fullscreenElement) {
            try { await doc.exitFullscreen(); } catch { status.textContent = 'Use your browser’s fullscreen exit control.'; }
        } else status.textContent = await enterFlightScreen(deck, win);
    });
    listen(doc, 'fullscreenchange', () => {
        screenButton.textContent = doc.fullscreenElement ? 'Exit screen' : 'Full screen';
    });
    const reset = () => {
        pointers.clear();
        for (const source of sources) getVoyager()?.input?.setVirtualState(source, null);
        sources.clear();
        for (const button of panel.querySelectorAll('.is-held')) button.classList.remove('is-held');
        const wasActive = tilt.active;
        tilt.disable(wasActive ? 'Tilt paused after leaving the game. Enable again when ready.' : 'Touch controls ready. Tilt is optional.');
    };
    listen(win, 'blur', reset);
    listen(win, 'pagehide', reset);
    listen(doc, 'visibilitychange', () => { if (doc.hidden) reset(); });
    listen(doc, 'focusin', event => {
        const path = event.composedPath?.() || [event.target];
        const editing = path.some(node => node?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'DIALOG'].includes(node?.tagName));
        if (editing || (event.target !== doc.body && !deck.contains(event.target))) reset();
    });
    listen(win.screen?.orientation || win, win.screen?.orientation ? 'change' : 'orientationchange', () => {
        for (const event of Array.from(pointers.keys(), pointerId => ({ pointerId }))) releasePointer(event, true);
        tilt.calibrate();
    });
    listen(win, 'voyager:arena-open', reset);
    return {
        tilt,
        reset,
        destroy() {
            mounted = false;
            reset();
            tilt.disable();
            for (const dispose of disposers) dispose();
            panel.remove();
        }
    };
}

if (typeof document !== 'undefined') {
    const mount = () => mountMobileControls();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
}
