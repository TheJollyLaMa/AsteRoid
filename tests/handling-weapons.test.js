const test = require('node:test');
const assert = require('node:assert/strict');
const Spaceship = require('../src/js/spaceship');
const Game = require('../src/js/game');
const { WEAPONS } = require('../src/js/weapons');

test('steering responds in first fixed frame, reverses immediately, and stops on release', () => {
    const ship = new Spaceship();
    ship.update(1 / 60, { left: true }, 0);
    assert.equal(ship.x, 394);
    assert.equal(ship.bank, -0.4);
    ship.update(1 / 60, { right: true }, 0);
    assert.equal(ship.x, 400);
    ship.update(1 / 60, {}, 0);
    assert.equal(ship.x, 400);
});

test('switching fires the selected weapon immediately and preserves earned tiers', () => {
    const game = new Game();
    game.startCampaign(1);
    game.ship.weapon = { type: 'blaster', tier: 3 };
    game.ship.cooldown = 1;
    game.updatePlayerFire(game.ship, { weaponNext: true, fire: true }, 0, 1 / 60);
    assert.equal(game.ship.weapon.type, 'spread');
    assert.equal(game.playerBullets.length, 3);
    assert.ok(game.playerBullets.every(bullet => bullet.ownerWeapon === 'spread'));
    game.updatePlayerFire(game.ship, { weaponNext: true }, 0, 1 / 60);
    assert.equal(game.ship.weapon.type, 'spread', 'held cycle does not repeat');
    for (let i = 0; i < 4; i++) {
        game.updatePlayerFire(game.ship, {}, 0, 1 / 60);
        game.updatePlayerFire(game.ship, { weaponNext: true }, 0, 1 / 60);
    }
    assert.deepEqual(game.ship.weapon, { type: 'blaster', tier: 3 });
});

test('non-Rapid weapons maintain useful tier-one damage throughput and projectile speed', () => {
    const dps = type => WEAPONS[type].damage[0] * WEAPONS[type].pattern[0].length / WEAPONS[type].cooldown[0];
    for (const type of ['blaster', 'spread', 'plasma']) {
        assert.ok(dps(type) >= dps('rapid'), `${type} must not fall behind Rapid's raw tier-one throughput`);
        assert.ok(WEAPONS[type].speed >= 660);
    }
    assert.equal(WEAPONS.plasma.pierce, true);
});

test('fractional phone axes simulate exactly the values preserved in signed replay logs', () => {
    const game = new Game({ seed: 12, now: () => 1_800_000_000_000 });
    game.startCampaign(1, 'cadet', 12);
    for (let frame = 0; frame < 60; frame++) game.step([{ ax: 0.123456, ay: -0.314159, fire: true }]);
    assert.deepEqual(Game.replay(game.getRunLog()), game.summary());
});
