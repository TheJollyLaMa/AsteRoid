const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const source = readFileSync(require.resolve('../src/js/audio'), 'utf8');

function fixture() {
    let oscillators = 0;
    let resumeFailure = null;
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({
        threshold: param(), ratio: param(), gain: param(), frequency: param(), Q: param(),
        connect() { return this; }, start() {}, stop() {}
    });
    const context = {
        state: 'suspended', currentTime: 0, sampleRate: 16,
        createDynamicsCompressor: node, createGain: node, createBiquadFilter: node,
        createOscillator() { oscillators++; return node(); },
        createBufferSource: node, createBuffer: () => ({ getChannelData: () => new Float32Array(16) }),
        resume: () => resumeFailure ? Promise.reject(resumeFailure) : Promise.resolve()
    };
    const errors = [];
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module, require: () => ({ normalizeEvent: event => event }), console,
        window: { AudioContext: function () { return context; } }
    });
    const audio = module.exports.createAudio({ onError: error => errors.push(error) });
    return { audio, context, errors, get oscillators() { return oscillators; }, failResume(error) { resumeFailure = error; } };
}

test('crowded Sector II batches throttle base shots and additional synth voices', () => {
    const view = fixture();
    view.audio.unlock();
    view.audio.play(Array.from({ length: 100 }, () => ({ type: 'shot', weapon: 'blaster' })), { level: { number: 19 } });
    assert.equal(view.oscillators, 4, 'one two-tone blaster plus one vibrato future tone, not 400 voices');
    view.context.currentTime = 0.1;
    view.audio.play([{ type: 'shot', weapon: 'blaster' }], { level: { number: 19 } });
    assert.equal(view.oscillators, 8, 'audio remains responsive after throttle interval');
});

test('audio resume failures are reported rather than silently rejected', async () => {
    const view = fixture();
    view.failResume(new Error('Audio unavailable'));
    view.audio.unlock();
    await Promise.resolve();
    assert.equal(view.errors[0].message, 'Audio unavailable');
});
