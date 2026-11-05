const { createWeapon } = require('./weapons');

const MIN_X = 20;
const MAX_X = 780;
const MIN_OFFSET = 40;
const MAX_OFFSET = 280;

// The ship flies at the scroll position plus a player-controlled forward offset.
class Spaceship {
    constructor() {
        this.baseSize = 12;
        this.size = this.baseSize;
        this.scale = 1;
        this.charge = 0;
        this.wasFiring = false;
        this.specialWasDown = false;
        this.specialCooldown = 0;
        this.suppressChargeUntilRelease = false;
        this.maxPower = 100;
        this.lives = 3;
        this.weapon = createWeapon();
        this.reset();
    }

    reset() {
        this.x = 400;
        this.offset = 90;
        this.y = 0;
        this.power = this.maxPower;
        this.cooldown = 0;
        this.charge = 0;
        this.wasFiring = false;
        this.specialWasDown = false;
        this.specialCooldown = 0;
        this.suppressChargeUntilRelease = false;
        this.invulnerable = 0;
        this.shield = 0;
        this.bank = 0;
        this.lateralSpeed = 280;
        this.forwardSpeed = 190;
    }

    update(dt, input, scrollY) {
        let steer = 0;
        steer = Math.max(-1, Math.min(1, (input.ax || 0) + (input.left ? -1 : 0) + (input.right ? 1 : 0)));
        this.x = Math.min(MAX_X, Math.max(MIN_X, this.x + steer * this.lateralSpeed * dt));
        const forward = Math.max(-1, Math.min(1, (input.ay || 0) + (input.up ? 1 : 0) - (input.down ? 1 : 0)));
        this.offset += forward * this.forwardSpeed * dt;
        this.offset = Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, this.offset));
        this.y = scrollY + this.offset;
        this.bank += (steer - this.bank) * Math.min(1, dt * 8);
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.invulnerable = Math.max(0, this.invulnerable - dt);
        this.shield = Math.max(0, this.shield - dt);
    }

    get protectedFromDamage() {
        return this.invulnerable > 0 || this.shield > 0;
    }
}

module.exports = Spaceship;
