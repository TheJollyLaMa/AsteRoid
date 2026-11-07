// World-space projectile. `y` is forward distance along the level.
class Bullet {
    constructor({ x, y, vx = 0, vy = 0, size = 3, damage = 1, pierce = false, life = 1.4, owner = 'player', color = '#fff', radius = 0, maxRadius = 0, age = 0, playerIndex = 0, ownerWeapon = null }) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.size = size;
        this.damage = damage;
        this.pierce = pierce;
        this.life = life;
        this.owner = owner;
        this.color = color;
        this.radius = radius;
        this.maxRadius = maxRadius || radius;
        this.age = age;
        this.playerIndex = playerIndex;
        this.ownerWeapon = ownerWeapon;
        this.hits = pierce ? new Set() : null;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        this.age += dt;
        if (this.maxRadius > 0) this.radius = Math.min(this.maxRadius, this.radius + dt * this.maxRadius * 2.5);
    }

    get alive() {
        return this.life > 0;
    }
}

module.exports = Bullet;
