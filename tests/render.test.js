const test = require('node:test');
const assert = require('node:assert/strict');

const { VIEW, OVERVIEW_SHIP_LINE, POV, projectOverview, povCamera, projectPov } = require('../src/js/render/projection');
const { getImage, loadAssets, rockKeyFor, backdropKeyFor, ROCK_KEYS, BACKDROP_KEYS, MANIFEST, makeCanvas, getTinted } = require('../src/js/render/assets');
const { rollUp, litSegments, difficultyColor, difficultyName, POWER_SEGMENTS } = require('../src/js/render/hud');
const { normalizeEvent } = require('../src/js/render/events');
const { SHIP_TOP, SHIP_CHASE, SHIP_PALETTE, bulletWeaponType } = require('../src/js/render/shapes');
const { createFx, MAX_WORLD_PARTICLES, MAX_SCREEN_PARTICLES } = require('../src/js/render/fx');
const card = require('../src/js/render/cardMath');
const { renderBattleCard } = require('../src/js/render/battleCard');

test('overview projection keeps the ship line and scrolls with the world', () => {
    const p = projectOverview({ x: 120, y: 500 }, 500);
    assert.deepEqual([p.x, p.y], [120, OVERVIEW_SHIP_LINE]);
    assert.equal(projectOverview({ x: 0, y: 600 }, 500).y, OVERVIEW_SHIP_LINE - 100);
});

test('POV projection culls points behind the near plane and shrinks with depth', () => {
    const camera = povCamera({ x: 400, y: 1000 });
    assert.equal(projectPov({ x: 400, y: camera.y + POV.near - 1 }, camera), null);
    const near = projectPov({ x: 450, y: camera.y + 100 }, camera);
    const far = projectPov({ x: 450, y: camera.y + 1000 }, camera);
    assert.ok(near.scale > far.scale);
    assert.ok(Math.abs(far.x - VIEW.width / 2) < Math.abs(near.x - VIEW.width / 2));
});

test('assets degrade gracefully without a DOM', async () => {
    assert.equal(getImage('rock-1'), null);
    assert.equal(getImage('does-not-exist'), null);
    assert.equal(makeCanvas(10, 10), null);
    assert.equal(getTinted('rock-1', 'flash'), null);
    const result = await loadAssets();
    assert.equal(result.loaded, 0);
    assert.equal(result.total, Object.keys(MANIFEST).length);
    assert.strictEqual(loadAssets(), loadAssets(), 'load promise is memoised');
});

test('asteroid sprites and backdrops are deterministic and in the manifest', () => {
    for (let id = 0; id < 50; id++) {
        assert.equal(rockKeyFor(id), rockKeyFor(id));
        assert.ok(MANIFEST[rockKeyFor(id)]);
    }
    const used = new Set(Array.from({ length: 200 }, (_, id) => rockKeyFor(id)));
    assert.equal(used.size, ROCK_KEYS.length, 'every Mandelblum rock gets used');
    assert.equal(backdropKeyFor(1), BACKDROP_KEYS[0]);
    assert.equal(backdropKeyFor(1 + BACKDROP_KEYS.length), BACKDROP_KEYS[0]);
    assert.equal(backdropKeyFor(0), BACKDROP_KEYS[0]);
    BACKDROP_KEYS.forEach((key) => assert.ok(MANIFEST[key]));
});

test('HUD helpers: segmented power bar and score roll-up', () => {
    assert.equal(litSegments(0), 0);
    assert.equal(litSegments(0.001), 1, 'any power shows at least one cell');
    assert.equal(litSegments(1), POWER_SEGMENTS);
    assert.equal(litSegments(2), POWER_SEGMENTS);
    let shown = 0;
    for (let i = 0; i < 200 && shown !== 1000; i++) shown = rollUp(shown, 1000, 1 / 60);
    assert.equal(shown, 1000);
    assert.ok(rollUp(0, 1000, 1 / 60) < 1000);
    assert.equal(rollUp(500, 100, 10), 100, 'never overshoots downward');
    assert.equal(difficultyColor('nope'), difficultyColor('also-nope'));
    assert.equal(difficultyName({ difficulty: 'ace' }), 'Ace');
    assert.equal(difficultyName({ selectedDifficultyLabel: 'Pilot' }, true), 'Pilot');
});

test('event normalisation handles legacy and current pickup shapes', () => {
    assert.deepEqual(normalizeEvent({ type: 'power', x: 1 }), { type: 'pickup', pickupType: 'power', x: 1 });
    assert.equal(normalizeEvent({ type: 'pickup', pickupType: 'shield' }).pickupType, 'shield');
    assert.equal(normalizeEvent({ type: 'explode', size: 3 }).type, 'explode');
    assert.equal(normalizeEvent(null).type, 'unknown');
});

test('pixel-art ship maps are rectangular and use known palette keys', () => {
    for (const rows of [SHIP_TOP, SHIP_CHASE]) {
        const width = rows[0].length;
        rows.forEach((row) => {
            assert.equal(row.length, width);
            for (const ch of row) assert.ok(ch === '.' || SHIP_PALETTE[ch], `unknown palette key ${ch}`);
        });
    }
    assert.equal(bulletWeaponType({ color: '#ff6cf5' }), 'plasma');
});

test('fx caps particles and applies hit-stop on level clear', () => {
    const fx = createFx();
    const game = { time: 0, ship: { x: 400, y: 100 } };
    for (let i = 0; i < 80; i++) fx.handle([{ type: 'explode', x: 400, y: 300, size: 40, shooter: true, combo: i }], game);
    fx.handle([{ type: 'levelComplete' }, { type: 'victory' }], game);
    for (let i = 0; i < 30; i++) fx.update(1 / 60, game);
    assert.ok(fx.worldCount <= MAX_WORLD_PARTICLES);
    assert.ok(fx.screenCount <= MAX_SCREEN_PARTICLES);
    const fresh = createFx();
    fresh.handle([{ type: 'levelComplete' }], game);
    assert.equal(fresh.timeScale(), 0, 'hit-stop freezes the simulation');
    for (let i = 0; i < 120; i++) fresh.update(1 / 60, game);
    assert.equal(fresh.timeScale(), 1);
});

test('battle card RNG and formatting are deterministic', () => {
    assert.equal(card.hashString('abc'), card.hashString('abc'));
    assert.notEqual(card.hashString('abc'), card.hashString('abd'));
    const a = card.createSeededRng(card.hashString('record-1'));
    const b = card.createSeededRng(card.hashString('record-1'));
    const seqA = Array.from({ length: 20 }, a);
    assert.deepEqual(seqA, Array.from({ length: 20 }, b));
    seqA.forEach((v) => assert.ok(v >= 0 && v < 1));
    assert.equal(card.formatUtc('2026-11-05T17:45:09.000Z'), '2026-11-05 17:45:09 UTC');
    assert.equal(card.formatUtc('garbage'), 'UNKNOWN DATE');
    assert.equal(card.formatDuration(99), '1:39');
    assert.equal(card.formatPercent(201 / 312), '64.4%');
    assert.equal(card.formatPercent(NaN), '0%');
});

test('battle card map strip places launch at the bottom and gate at the top', () => {
    const { map, design } = card.cardLayout();
    assert.deepEqual(card.cardLayout(600, 600).scale, { x: 0.5, y: 0.5 });
    assert.ok(map.x + map.w <= design.width && map.y + map.h <= design.height);
    assert.deepEqual(card.mapPoint([0, 0], 1000, map), { x: map.x, y: map.y + map.h });
    assert.deepEqual(card.mapPoint({ x: 800, y: 1000 }, 1000, map), { x: map.x + map.w, y: map.y });
    assert.deepEqual(card.mapPoint([-50, 5000], 1000, map), { x: map.x, y: map.y }, 'clamped into the strip');
    assert.ok(card.killRadius(40) > card.killRadius(10));
    assert.equal(card.levelLengthOf({ battleLog: { levelLength: 0, path: [[0, 10], [0, 900]] } }), 900);
    const sample = card.sampleRecord();
    assert.deepEqual(sample, card.sampleRecord(), 'sample record is deterministic');
    assert.equal(sample.battleLog.worldWidth, 800);
});

test('renderBattleCard rejects without a record and without a DOM canvas', async () => {
    await assert.rejects(renderBattleCard(null), TypeError);
    await assert.rejects(renderBattleCard(card.sampleRecord()), /DOM canvas/);
});
