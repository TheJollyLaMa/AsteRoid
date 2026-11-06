const test = require('node:test');
const assert = require('node:assert/strict');
const { createDiagnostics, LIMIT, KEY, BUILD } = require('../src/js/diagnostics');

test('diagnostics bound and persist sanitized reports without flight payloads', () => {
    const data = new Map();
    const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
    let time = 0;
    const diagnostics = createDiagnostics({ storage, now: () => time += 6000, snapshot: () => ({ level: 9, rocks: 300 }) });
    for (let i = 0; i < LIMIT + 5; i++) diagnostics.record('frame-error', new Error(`failure ${i}: https://rpc.example/path?apiKey=private 0x${'a'.repeat(40)} token=secret`));
    const report = diagnostics.report();
    assert.equal(report.entries.length, LIMIT);
    assert.equal(report.entries[0].level, 9);
    assert.doesNotMatch(JSON.stringify(report), /private|token=secret|0xaaaa/);
    assert.equal(JSON.parse(data.get(KEY)).length, LIMIT);
    const restored = createDiagnostics({ storage }).report();
    assert.equal(restored.entries.length, LIMIT);
    assert.equal(restored.entries[0].level, 9);
});

test('repeated faults deduplicate and blocked storage is explicit', () => {
    const diagnostics = createDiagnostics({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } }, now: () => 10 });
    diagnostics.record('frame-error', 'same failure');
    diagnostics.record('frame-error', 'same failure');
    assert.equal(diagnostics.report().entries.length, 1);
    assert.equal(diagnostics.report().storageError, 'quota');
});

test('graphics resource evidence and build provenance survive reload', () => {
    let saved;
    const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
    const snapshot = () => ({ level: 9, glowSprites: 32, glowAllocations: 32, shapePixels: 131072, estimatedSurfaceBytes: 12000000, contextLost: true });
    const before = createDiagnostics({ storage, snapshot });
    before.record('context-lost', 'Graphics unavailable', { maxDrawMs: 8, quality: 0.65 });
    const after = createDiagnostics({ storage, snapshot }).report();
    assert.equal(after.entries[0].build, BUILD);
    assert.equal(after.entries[0].glowSprites, 32);
    assert.equal(after.entries[0].estimatedSurfaceBytes, 12000000);
    assert.equal(after.entries[0].contextLost, true);
    assert.equal(after.entries[0].maxDrawMs, 8);
    assert.equal(after.current.glowSprites, 32);
});

test('reloaded reports separate earlier visits from the current page session', () => {
    let saved;
    const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
    createDiagnostics({ storage, session: 'visit-1' }).record('context-lost', 'Old graphics loss');
    const current = createDiagnostics({ storage, session: 'visit-2' });
    const report = current.report();
    assert.equal(report.session, 'visit-2');
    assert.equal(report.entries[0].session, 'visit-1');
    assert.notEqual(createDiagnostics().report().session, createDiagnostics().report().session);
    current.record('frame-error', 'New failure');
    assert.deepEqual(current.report().entries.map(entry => entry.session), ['visit-1', 'visit-2']);
});
