// Tiny synthesized sound effects; created lazily after the first key press.
function createAudio() {
    let context = null;
    let muted = false;

    function ensureContext() {
        if (context || typeof window === 'undefined') return context;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) context = new AudioContext();
        return context;
    }

    function tone({ frequency, endFrequency = frequency, duration = 0.1, type = 'square', volume = 0.05 }) {
        if (muted || !context) return;
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    const sounds = {
        shot: (e) => tone(e.weapon === 'plasma'
            ? { frequency: 220, endFrequency: 90, duration: 0.18, type: 'sawtooth', volume: 0.05 }
            : { frequency: 880, endFrequency: 440, duration: 0.06, volume: 0.025 }),
        enemyShot: () => tone({ frequency: 300, endFrequency: 180, duration: 0.12, type: 'triangle', volume: 0.03 }),
        hit: () => tone({ frequency: 500, endFrequency: 300, duration: 0.05, volume: 0.03 }),
        explode: () => tone({ frequency: 160, endFrequency: 40, duration: 0.3, type: 'sawtooth', volume: 0.06 }),
        shipHit: () => tone({ frequency: 120, endFrequency: 60, duration: 0.25, type: 'square', volume: 0.08 }),
        shieldHit: () => tone({ frequency: 1200, endFrequency: 900, duration: 0.08, type: 'sine', volume: 0.04 }),
        pickup: () => tone({ frequency: 520, endFrequency: 1560, duration: 0.22, type: 'sine', volume: 0.06 }),
        shipDestroyed: () => tone({ frequency: 200, endFrequency: 30, duration: 0.9, type: 'sawtooth', volume: 0.1 }),
        levelComplete: () => tone({ frequency: 440, endFrequency: 1760, duration: 0.6, type: 'triangle', volume: 0.07 })
    };

    return {
        unlock() {
            const ctx = ensureContext();
            if (ctx && ctx.state === 'suspended') ctx.resume();
        },
        toggleMute() {
            muted = !muted;
            return muted;
        },
        play(events) {
            for (const event of events) {
                if (sounds[event.type]) sounds[event.type](event);
            }
        }
    };
}

module.exports = { createAudio };
