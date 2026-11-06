// Synthesized 8-bit-meets-arcade sound effects (WebAudio only, no files).
// The AudioContext is created lazily on the first key press (autoplay rules).
const { normalizeEvent } = require('./render/events');

const NOTE = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12);

function createAudio({ onError = error => console.error('Voyager audio:', error) } = {}) {
    let context = null;
    let master = null;
    let noiseBuffer = null;
    let muted = false;
    let futureMusic = false;
    let futureNodes = [];
    const lastPlayed = {};

    function ensureContext() {
        if (context || typeof window === 'undefined') return context;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        context = new AudioContext();
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.ratio.value = 6;
        master = context.createGain();
        master.gain.value = muted ? 0 : 0.9;
        master.connect(compressor).connect(context.destination);
        const length = context.sampleRate;
        noiseBuffer = context.createBuffer(1, length, context.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        // Stepped noise gives a crunchier, more 8-bit texture than pure white noise.
        let held = 0;
        for (let i = 0; i < length; i++) {
            if (i % 3 === 0) held = Math.random() * 2 - 1;
            data[i] = held;
        }
        return context;
    }

    function ready() {
        return Boolean(context && master && !muted);
    }

    function setSector2(enabled) {
        const active = Boolean(enabled);
        if (active === futureMusic) return;
        if (active) {
            const ctx = ensureContext();
            if (!ctx || !master) return;
            futureMusic = true;
            const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 620;
            const droneGain = ctx.createGain(); droneGain.gain.value = 0.012;
            const first = ctx.createOscillator(); first.type = 'sawtooth'; first.frequency.value = 55;
            const second = ctx.createOscillator(); second.type = 'triangle'; second.frequency.value = 164.81;
            const shimmer = ctx.createOscillator(); shimmer.type = 'sine'; shimmer.frequency.value = 0.17;
            const depth = ctx.createGain(); depth.gain.value = 240;
            shimmer.connect(depth).connect(filter.frequency);
            first.connect(filter); second.connect(filter); filter.connect(droneGain).connect(master);
            first.start(); second.start(); shimmer.start();
            futureNodes = [first, second, shimmer];
        } else {
            futureMusic = false;
            futureNodes.forEach((node) => { try { node.stop(); } catch (error) { /* Already stopped. */ } });
            futureNodes = [];
        }
    }

    function throttle(key, seconds) {
        const now = context.currentTime;
        if (lastPlayed[key] !== undefined && now - lastPlayed[key] < seconds) return false;
        lastPlayed[key] = now;
        return true;
    }

    function tone({ frequency, endFrequency = frequency, duration = 0.1, type = 'square', volume = 0.05, delay = 0, attack = 0.002, filter = null, vibrato = 0 }) {
        const start = context.currentTime + delay;
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, start);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(volume, start + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        let node = osc;
        if (filter) {
            const f = context.createBiquadFilter();
            f.type = filter.type || 'lowpass';
            f.frequency.setValueAtTime(filter.from, start);
            if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, start + duration);
            f.Q.value = filter.q || 1;
            node.connect(f);
            node = f;
        }
        if (vibrato) {
            const lfo = context.createOscillator();
            const depth = context.createGain();
            lfo.frequency.value = vibrato;
            depth.gain.value = frequency * 0.08;
            lfo.connect(depth).connect(osc.frequency);
            lfo.start(start);
            lfo.stop(start + duration);
        }
        node.connect(gain).connect(master);
        osc.start(start);
        osc.stop(start + duration + 0.02);
    }

    function noise({ duration = 0.3, volume = 0.2, from = 3000, to = 120, type = 'lowpass', q = 0.8, delay = 0 }) {
        const start = context.currentTime + delay;
        const src = context.createBufferSource();
        src.buffer = noiseBuffer;
        src.loop = true;
        const f = context.createBiquadFilter();
        f.type = type;
        f.Q.value = q;
        f.frequency.setValueAtTime(from, start);
        f.frequency.exponentialRampToValueAtTime(Math.max(30, to), start + duration);
        const gain = context.createGain();
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        src.connect(f).connect(gain).connect(master);
        src.start(start, Math.random() * 0.5);
        src.stop(start + duration + 0.02);
    }

    function explosion(size = 20, heavy = false) {
        const s = Math.max(0.4, Math.min(2.2, size / 22));
        const duration = 0.25 + 0.3 * s + (heavy ? 0.6 : 0);
        noise({ duration, volume: 0.22 + 0.08 * s, from: 2600 + 1400 * s, to: 80, q: 0.7 });
        noise({ duration: 0.06, volume: 0.18, from: 6000, to: 2000, type: 'highpass' });
        tone({ frequency: 150 * (heavy ? 0.7 : 1), endFrequency: 32, duration: duration * 0.8, type: 'sine', volume: 0.32 + 0.1 * s });
        tone({ frequency: 90, endFrequency: 40, duration: duration * 0.5, type: 'square', volume: 0.05, filter: { from: 600, to: 100 } });
    }

    function arpeggio(notes, { step = 0.07, type = 'square', volume = 0.06, length = 0.12, delay = 0 } = {}) {
        notes.forEach((n, i) => {
            if (n === null) return;
            tone({ frequency: NOTE(n), duration: length, type, volume, delay: delay + i * step, attack: 0.004 });
        });
    }

    const LASERS = {
        blaster: () => {
            tone({ frequency: 1500, endFrequency: 260, duration: 0.11, type: 'square', volume: 0.05, filter: { from: 5000, to: 900 } });
            tone({ frequency: 760, endFrequency: 180, duration: 0.09, type: 'sawtooth', volume: 0.025 });
        },
        spread: () => {
            [1, 1.26, 1.5].forEach((m) => tone({ frequency: 900 * m, endFrequency: 300 * m, duration: 0.08, type: 'square', volume: 0.02 }));
            noise({ duration: 0.08, volume: 0.08, from: 5000, to: 1500, type: 'bandpass', q: 1.2 });
        },
        rapid: () => {
            if (!throttle('rapid', 0.045)) return;
            tone({ frequency: 2400, endFrequency: 900, duration: 0.05, type: 'square', volume: 0.022, filter: { from: 6000, to: 2000 } });
        },
        plasma: () => {
            tone({ frequency: 260, endFrequency: 55, duration: 0.38, type: 'sawtooth', volume: 0.07, filter: { from: 3200, to: 200, q: 6 }, vibrato: 28 });
            tone({ frequency: 110, endFrequency: 40, duration: 0.3, type: 'sine', volume: 0.12 });
            tone({ frequency: 1800, endFrequency: 600, duration: 0.12, type: 'triangle', volume: 0.03 });
        },
        nova: () => {
            noise({ duration: 0.48, volume: 0.34, from: 5000, to: 70, q: 1.4 });
            tone({ frequency: 190, endFrequency: 28, duration: 0.72, type: 'sine', volume: 0.38 });
            tone({ frequency: 880, endFrequency: 120, duration: 0.42, type: 'sawtooth', volume: 0.12, filter: { from: 2800, to: 100, q: 5 } });
        },
        prism: () => {
            [0, 5, 9, 14].forEach((note, i) => tone({ frequency: NOTE(note + 24), endFrequency: NOTE(note + 36), duration: 0.18, type: i % 2 ? 'triangle' : 'sine', volume: 0.065, delay: i * 0.018 }));
            noise({ duration: 0.12, volume: 0.07, from: 9000, to: 2500, type: 'highpass' });
        },
        singularity: () => {
            tone({ frequency: 880, endFrequency: 24, duration: 0.5, type: 'sine', volume: 0.28, vibrato: 15 });
            tone({ frequency: 360, endFrequency: 32, duration: 0.44, type: 'sawtooth', volume: 0.14, filter: { from: 2400, to: 40, q: 9 } });
            noise({ duration: 0.34, volume: 0.13, from: 800, to: 50, type: 'lowpass', q: 4 });
        }
    };

    const sounds = {
        shot: (e) => {
            if (throttle('shot', 0.035)) (LASERS[e.weapon] || LASERS.blaster)();
        },
        chargeStart: () => {
            tone({ frequency: 140, endFrequency: 980, duration: 1.15, type: 'sawtooth', volume: 0.12, filter: { from: 500, to: 4200, q: 3 }, vibrato: 9 });
            tone({ frequency: 70, endFrequency: 490, duration: 1.15, type: 'sine', volume: 0.08, delay: 0.04, vibrato: 5 });
        },
        chargeRelease: (e) => {
            const charge = Math.max(0, Math.min(1, Number(e.charge) || 0));
            tone({ frequency: 850 + charge * 450, endFrequency: 90, duration: 0.3 + charge * 0.45, type: 'sawtooth', volume: 0.15 + charge * 0.08, filter: { from: 4400, to: 90, q: 5 } });
            if (charge > 0.7) LASERS.nova();
        },
        novaBlast: (e) => { LASERS.nova(); if (Number(e.charge) > 0.75) explosion(54, true); },
        vaultSpawned: () => {
            tone({ frequency: 460, endFrequency: 220, duration: 0.4, type: 'sawtooth', volume: 0.1, vibrato: 6 });
            tone({ frequency: 620, endFrequency: 300, duration: 0.48, type: 'triangle', volume: 0.07, delay: 0.12 });
            noise({ duration: 0.3, volume: 0.08, from: 1100, to: 350, type: 'bandpass', q: 4, delay: 0.1 });
        },
        guardDestroyed: () => { explosion(22, true); arpeggio([12, 19], { step: 0.04, type: 'triangle', volume: 0.045 }); },
        supporterCaptured: () => {
            arpeggio([3, 7, 10, 15, 19, 22, 27, 31], { step: 0.075, type: 'sine', volume: 0.11, length: 0.3 });
            arpeggio([-9, -2, 3, 10, 15], { step: 0.15, type: 'triangle', volume: 0.1, length: 0.42 });
            noise({ duration: 1.15, volume: 0.12, from: 8000, to: 1800, type: 'highpass', delay: 0.35 });
        },
        warpStart: () => {
            noise({ duration: 1.35, volume: 0.28, from: 7000, to: 180, type: 'bandpass', q: 0.8 });
            tone({ frequency: 88, endFrequency: 1400, duration: 1.25, type: 'sawtooth', volume: 0.13, filter: { from: 150, to: 5000, q: 3 }, vibrato: 18 });
        },
        warpEnd: () => arpeggio([0, 7, 12, 19, 24, 31], { step: 0.065, type: 'triangle', volume: 0.09, length: 0.2 }),
        sectorUnlocked: () => arpeggio([0, 7, 12, 19, 24, 31], { step: 0.08, type: 'sine', volume: 0.08, length: 0.24 }),
        enemyShot: () => {
            if (!throttle('enemyShot', 0.06)) return;
            tone({ frequency: 640, endFrequency: 150, duration: 0.2, type: 'triangle', volume: 0.05, vibrato: 40 });
            tone({ frequency: 320, endFrequency: 90, duration: 0.18, type: 'square', volume: 0.015 });
        },
        hit: () => {
            if (!throttle('hit', 0.03)) return;
            noise({ duration: 0.05, volume: 0.1, from: 4000, to: 1200, type: 'bandpass', q: 2 });
            tone({ frequency: 520, endFrequency: 260, duration: 0.05, volume: 0.03 });
        },
        explode: (e) => {
            if (!throttle('explode', 0.035)) return;
            explosion(Number(e.size) || 20, false);
            if (e.shooter) tone({ frequency: 1200, endFrequency: 200, duration: 0.25, type: 'sawtooth', volume: 0.03, delay: 0.02 });
        },
        shipHit: () => {
            noise({ duration: 0.35, volume: 0.3, from: 1800, to: 120, q: 3 });
            tone({ frequency: 110, endFrequency: 45, duration: 0.3, type: 'square', volume: 0.1, filter: { from: 900, to: 150 } });
        },
        shieldHit: () => {
            tone({ frequency: 1480, endFrequency: 1320, duration: 0.25, type: 'sine', volume: 0.07 });
            tone({ frequency: 2220, endFrequency: 1980, duration: 0.18, type: 'sine', volume: 0.04 });
            noise({ duration: 0.12, volume: 0.06, from: 7000, to: 3000, type: 'bandpass', q: 6 });
        },
        pickup: (e) => {
            if (e.pickupType === 'power') {
                // Ens Eth breathe: rising shimmering chime.
                arpeggio([3, 7, 10, 15, 19, 22], { step: 0.055, type: 'triangle', volume: 0.07, length: 0.35 });
                arpeggio([15, 19, 22, 27], { step: 0.055, type: 'sine', volume: 0.04, length: 0.5, delay: 0.03 });
            } else if (e.pickupType === 'mini') {
                // Shrink: a quick falling warble.
                tone({ frequency: 1600, endFrequency: 220, duration: 0.35, type: 'square', volume: 0.05, vibrato: 30 });
                arpeggio([24, 19, 15, 12, 7], { step: 0.045, type: 'triangle', volume: 0.05, length: 0.12 });
            } else if (e.pickupType === 'shield') {
                tone({ frequency: 300, endFrequency: 1200, duration: 0.3, type: 'sine', volume: 0.08, vibrato: 18 });
                arpeggio([7, 14], { step: 0.1, type: 'triangle', volume: 0.05, length: 0.25 });
            } else {
                arpeggio([0, 4, 7, 12], { step: 0.05, type: 'square', volume: 0.05, length: 0.09 });
            }
        },
        miniEnded: () => {
            tone({ frequency: 220, endFrequency: 1200, duration: 0.3, type: 'triangle', volume: 0.06 });
        },
        asteroidMissed: () => {
            if (!throttle('missed', 0.25)) return;
            tone({ frequency: 180, endFrequency: 120, duration: 0.12, type: 'triangle', volume: 0.025 });
        },
        shipDestroyed: () => {
            explosion(60, true);
            tone({ frequency: 880, endFrequency: 40, duration: 1.2, type: 'sawtooth', volume: 0.06, filter: { from: 3000, to: 120 } });
        },
        respawn: () => arpeggio([-5, 0, 7], { step: 0.08, type: 'triangle', volume: 0.05 }),
        levelStart: () => {
            tone({ frequency: 200, endFrequency: 1600, duration: 0.5, type: 'sawtooth', volume: 0.03, filter: { from: 400, to: 5000, q: 5 } });
            arpeggio([0, 7, 12], { step: 0.1, type: 'square', volume: 0.04, delay: 0.35 });
        },
        levelComplete: () => {
            arpeggio([3, 7, 10, 15, 10, 15, 19, null, 22], { step: 0.085, type: 'square', volume: 0.06, length: 0.14 });
            arpeggio([-9, -5, -2, 3], { step: 0.17, type: 'triangle', volume: 0.07, length: 0.3 });
            noise({ duration: 0.6, volume: 0.05, from: 9000, to: 4000, type: 'highpass', delay: 0.68 });
        },
        victory: () => {
            const melody = [3, 3, 3, 7, null, 10, 7, 10, 15, null, 15, 19, 22, 27];
            arpeggio(melody, { step: 0.12, type: 'square', volume: 0.06, length: 0.16 });
            arpeggio([-9, -9, -2, -2, 3, 3, 10, 10], { step: 0.21, type: 'triangle', volume: 0.08, length: 0.32 });
            for (let i = 0; i < 4; i++) noise({ duration: 0.7, volume: 0.06, from: 9000, to: 3000, type: 'highpass', delay: 0.4 + i * 0.42 });
            tone({ frequency: NOTE(27), duration: 1.2, type: 'sawtooth', volume: 0.04, delay: 1.7, filter: { from: 4000, to: 800 }, vibrato: 6 });
        },
        gameOver: () => {
            arpeggio([3, 2, 1, 0, -2, -5, -9], { step: 0.16, type: 'square', volume: 0.06, length: 0.2 });
            tone({ frequency: 110, endFrequency: 30, duration: 1.4, type: 'sawtooth', volume: 0.06, delay: 1.0, filter: { from: 1200, to: 80 } });
        }
    };

    return {
        unlock() {
            const ctx = ensureContext();
            if (ctx && ctx.state === 'suspended') void ctx.resume().catch(onError);
        },
        toggleMute() {
            muted = !muted;
            if (master) master.gain.value = muted ? 0 : 0.9;
            return muted;
        },
        get muted() {
            return muted;
        },
        setSector2,
        play(events, game = null) {
            if (!ready()) return;
            const future = Number(game && game.level && game.level.number) >= 11;
            for (const raw of events) {
                const event = normalizeEvent(raw);
                const sound = sounds[event.type];
                if (!sound) continue;
                try {
                    sound(event);
                    if (future && ['enemyShot', 'explode', 'shot', 'hit'].includes(event.type) && throttle(`future:${event.type}`, 0.06)) {
                        const base = event.type === 'enemyShot' ? 110 : event.type === 'explode' ? 38 : event.type === 'hit' ? 660 : 1320;
                        tone({ frequency: base, endFrequency: event.type === 'explode' ? 30 : base * 2.4, duration: 0.16, type: 'sawtooth', volume: 0.035, filter: { from: 5000, to: 160, q: 4 }, vibrato: 12 });
                    }
                } catch (error) {
                    onError(error);
                }
            }
        }
    };
}

module.exports = { createAudio };
