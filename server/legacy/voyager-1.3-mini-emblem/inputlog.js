const ACTIONS = ['left', 'right', 'up', 'down', 'fire', 'special', 'weaponNext', 'view'];
const MAX_RUN = 65535;

function encodeInput(input = {}) {
    let mask = 0;
    ACTIONS.forEach((action, index) => { if (input[action]) mask |= 1 << index; });
    const clampAxis = (value) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    return { mask, ax: Math.round(clampAxis(input.ax) * 127), ay: Math.round(clampAxis(input.ay) * 127) };
}

function decodeInput(encoded = {}) {
    const input = {};
    ACTIONS.forEach((action, index) => { input[action] = Boolean((encoded.mask || 0) & (1 << index)); });
    if (encoded.ax) input.ax = encoded.ax / 127;
    if (encoded.ay) input.ay = encoded.ay / 127;
    return input;
}

function sameFrame(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function encode(frames = []) {
    const runs = [];
    for (const frame of frames) {
        const encoded = (Array.isArray(frame) ? frame : [frame]).map(encodeInput);
        const last = runs[runs.length - 1];
        if (last && last[0] < MAX_RUN && sameFrame(last[1], encoded)) last[0] += 1;
        else runs.push([1, encoded]);
    }
    return { version: 1, frames: frames.length, players: runs[0] ? runs[0][1].length : 1, runs };
}

function decode(log) {
    if (Array.isArray(log)) return log.map((frame) => (Array.isArray(frame) ? frame : [frame]).map(decodeInput));
    if (!log || log.version !== 1 || !Array.isArray(log.runs)) throw new TypeError('Invalid input log.');
    const frames = [];
    for (const run of log.runs) {
        if (!Array.isArray(run) || !Number.isInteger(run[0]) || run[0] < 1 || !Array.isArray(run[1])) throw new TypeError('Invalid input log run.');
        const inputs = run[1].map(decodeInput);
        for (let i = 0; i < run[0]; i++) frames.push(inputs.map((input) => ({ ...input })));
    }
    if (log.frames !== undefined && frames.length !== log.frames) throw new RangeError('Input log frame count mismatch.');
    return frames;
}

module.exports = { ACTIONS, encode, decode, encodeInput, decodeInput };
