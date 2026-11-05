const { range } = require('./rng');

const WORLD_WIDTH = 800;
let nextId = 1;

function makeShape(rng) {
    const points = 9 + Math.floor(rng() * 4);
    return Array.from({ length: points }, () => range(rng, 0.72, 1.12));
}

class Asteroid {
    constructor({ x, y, size, vx = 0, vy = 0, hp, shooter = false, rng = Math.random, fireCooldown }) {
        this.id = nextId++;
        this.x = x;
        this.y = y;
        this.size = size;
        this.vx = vx;
        this.vy = vy;
        this.maxHp = hp || Math.max(1, Math.ceil(size / 14));
        this.hp = this.maxHp;
        this.shooter = shooter;
        this.fireCooldown = fireCooldown === undefined ? range(rng, 0.5, 2.5) : fireCooldown;
        this.rotation = range(rng, 0, Math.PI * 2);
        this.spin = range(rng, -0.8, 0.8);
        this.shape = makeShape(rng);
        this.active = false;
        this.fragment = false;
        this.missed = false;
        this.flash = 0;
    }

    update(dt) {
        this.rotation += this.spin * dt;
        this.flash = Math.max(0, this.flash - dt);
        if (!this.active) return;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.x < this.size) {
            this.x = this.size;
            this.vx = Math.abs(this.vx);
        } else if (this.x > WORLD_WIDTH - this.size) {
            this.x = WORLD_WIDTH - this.size;
            this.vx = -Math.abs(this.vx);
        }
    }

    takeHit(damage) {
        this.hp -= damage;
        this.flash = 0.12;
        return this.hp <= 0;
    }

    breakApart(rng = Math.random) {
        if (this.size < 24) return [];
        return [-1, 1].map((side) => {
            const fragment = new Asteroid({
                x: this.x + side * this.size * 0.3,
                y: this.y,
                size: this.size * 0.55,
                vx: side * range(rng, 40, 80) + this.vx,
                vy: this.vy + range(rng, -20, 20),
                hp: 1,
                rng
            });
            fragment.active = true;
            fragment.fragment = true;
            return fragment;
        });
    }
}

Asteroid.WORLD_WIDTH = WORLD_WIDTH;

module.exports = Asteroid;
