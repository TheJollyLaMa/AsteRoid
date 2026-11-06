const RULESET = require('./ruleset');
const KEY = 'voyager.diagnostics.v1';
const LIMIT = 40;
const BUILD = 'readable-hud-3';
const NUMERIC_FIELDS = [
    'level', 'particles', 'rocks', 'bullets', 'width', 'height', 'dpr', 'elapsedMs', 'quality',
    'glowSprites', 'glowAllocations', 'shapePixels', 'textSprites', 'textAllocations', 'textPixels',
    'tintSprites', 'tintPixels', 'imagePixels', 'postPixels', 'estimatedSurfaceBytes',
    'worldFx', 'screenFx', 'frameSamples', 'maxFrameMs', 'maxDrawMs', 'maxStepMs'
];

function redact(value) {
    return String(value || '').replace(/https?:\/\/[^\s)]+/g, url => url.split(/[?#]/)[0])
        .replace(/0x[\da-f]{40,}/gi, '[redacted]')
        .replace(/(bearer\s+|(?:token|secret|jwt|apiKey|mac)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
        .slice(0, 1800);
}

function sessionId(now) {
    const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    return `${now().toString(36)}-${random.slice(0, 8)}`;
}

// Entries persist across reloads for flight reports; `session` lets the page
// tell faults from this visit apart from historical ones.
function createDiagnostics({ storage, snapshot = () => ({}), notify = () => {}, now = () => Date.now(), session = sessionId(now) } = {}) {
    let entries = [];
    let storageError = storage ? null : 'Browser storage unavailable';
    try {
        const saved = storage?.getItem(KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) entries = parsed.slice(-LIMIT).map(item => ({
                at: Number(item.at) || 0, kind: redact(item.kind), message: redact(item.message), stack: redact(item.stack),
                ...Object.fromEntries(NUMERIC_FIELDS
                    .filter(key => Number.isFinite(item[key])).map(key => [key, item[key]])),
                ...Object.fromEntries(['contextLost', 'contextAlpha'].filter(key => typeof item[key] === 'boolean').map(key => [key, item[key]])),
                ...Object.fromEntries(['state', 'difficulty', 'view', 'build', 'session'].filter(key => typeof item[key] === 'string').map(key => [key, redact(item[key])]))
            }));
        }
    } catch (error) { storageError = redact(error.message); }
    const report = () => ({
        schema: 'voyager-diagnostics/1', build: BUILD, ruleset: RULESET, session,
        browser: typeof navigator === 'undefined' ? 'unavailable' : redact(navigator.userAgent),
        storageError, current: snapshot(), entries: entries.map(entry => ({ ...entry }))
    });
    function record(kind, error, details = {}) {
        const message = redact(error?.message || error);
        const previous = entries.at(-1);
        const at = now();
        if (previous?.kind === kind && previous.message === message && at - previous.at < 5000) return;
        entries.push({ at, kind: redact(kind), message, stack: redact(error?.stack), build: BUILD, session, ...snapshot(), ...details });
        entries = entries.slice(-LIMIT);
        try { storage?.setItem(KEY, JSON.stringify(entries)); }
        catch (failure) { storageError = redact(failure.message); }
        notify(report());
    }
    return { record, report };
}

module.exports = { createDiagnostics, redact, KEY, LIMIT, BUILD };
