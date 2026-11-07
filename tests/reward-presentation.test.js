const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { supporterDetails } = require('../src/js/supporter-catalog');
const { PRIZES, MARATHON_PRIZE, PERFECT_PRIZES } = require('../src/js/prizes');
const { MANIFEST, supporterImageKey } = require('../src/js/render/assets');
const { createFx, MAX_SCREEN_PARTICLES, MAX_WORLD_PARTICLES } = require('../src/js/render/fx');
const Game = require('../src/js/game');

test('every reward has metadata-derived artwork, release and filtered Canopy links', () => {
    for (const prize of [...PRIZES[1], ...PRIZES[2], MARATHON_PRIZE, ...Object.values(PERFECT_PRIZES)]) {
        const details = supporterDetails(prize.tokenId);
        assert.equal(details.tokenId, prize.tokenId);
        assert.match(details.imageURI, /^ipfs:\/\/Qm/);
        assert.ok(existsSync(new URL(`../src/${details.image}`, `file://${__filename}`)));
        assert.equal(MANIFEST[supporterImageKey(prize.tokenId)], `supporter-${prize.tokenId}.jpg`);
        assert.equal(new URL(details.canopyUrl).searchParams.get('q'), prize.project);
        assert.equal(new URL(details.canopyUrl).searchParams.get('canopy'), 'agency');
        assert.match(details.projectUrl, /\/releases\/tag\/v/);
    }
    assert.equal(supporterDetails(999), null);
    assert.match(supporterDetails(80).metadataURI, /QmYyFwg/);
});

test('only destroying the final guard emits the collectible-unlocked cue', () => {
    const game = new Game({ seed: 42 });
    game.setPilot({ address: '0x0000000000000000000000000000000000000001', isPilot: true });
    game.startCampaign(1, 'pilot');
    game.startLevel(game.sector2Level);
    game.drainEvents();
    for (const guard of game.vault.guards.slice(0, -1)) game.destroyAsteroid(guard, false);
    assert.ok(!game.drainEvents().some(event => event.type === 'vaultUnlocked'));
    const final = game.vault.guards.at(-1);
    game.destroyAsteroid(final, false);
    const event = game.drainEvents().find(event => event.type === 'vaultUnlocked');
    assert.equal(event.prize.tokenId, game.vault.prize.tokenId);
    assert.equal(game.vault.shielded, false);
    game.destroyAsteroid(final, false);
    assert.ok(!game.drainEvents().some(event => event.type === 'vaultUnlocked'));
});

test('extra-life celebration expires and reward FX retain their particle budgets', () => {
    const fx = createFx();
    const game = { ship: { x: 400, y: 120 }, state: 'playing', time: 0 };
    for (let i = 0; i < 50; i++) fx.handle([
        { type: 'pickup', pickupType: 'life', player: 1, x: 400, y: 120 },
        { type: 'vaultUnlocked', x: 400, y: 120 },
        { type: 'supporterCaptured', prize: { tokenId: 70 } }
    ], game);
    assert.equal(fx.state.lifePlayer, 2);
    assert.equal(fx.state.lifeTime, 0);
    assert.ok(fx.worldCount <= MAX_WORLD_PARTICLES);
    assert.ok(fx.screenCount <= MAX_SCREEN_PARTICLES);
    fx.update(2.3, game);
    assert.equal(fx.state.lifeTime, -1);
});
