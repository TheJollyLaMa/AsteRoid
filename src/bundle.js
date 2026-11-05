(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const Game = require('./game');
const { createAudio } = require('./audio');
const { createOverviewRenderer } = require('./render/overview');
const { createPovRenderer } = require('./render/pov');
const { drawHud, drawOverlay } = require('./render/hud');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function safeStorage() {
    try {
        return window.localStorage;
    } catch (error) {
        return null;
    }
}

const game = new Game({ storage: safeStorage() });
const audio = createAudio();
const renderers = { overview: createOverviewRenderer(), pov: createPovRenderer() };

const HELD_KEYS = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ' ': 'fire'
};

const ACTION_KEYS = {
    Enter: 'confirm',
    v: 'toggleView', V: 'toggleView',
    p: 'pause', P: 'pause', Escape: 'pause',
    q: 'menu', Q: 'menu',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right'
};

const input = { left: false, right: false, up: false, down: false, fire: false };

document.addEventListener('keydown', (event) => {
    audio.unlock();
    const held = HELD_KEYS[event.key];
    if (held || event.key === 'Enter') event.preventDefault();
    if (held) input[held] = true;
    if (event.repeat) return;
    if (event.key === 'm' || event.key === 'M') {
        audio.toggleMute();
        return;
    }
    const action = ACTION_KEYS[event.key];
    if (action) game.handleAction(action);
});

document.addEventListener('keyup', (event) => {
    const held = HELD_KEYS[event.key];
    if (held) input[held] = false;
});

window.addEventListener('blur', () => {
    Object.keys(input).forEach((key) => { input[key] = false; });
    if (game.state === 'playing') game.handleAction('pause');
});

let last = null;
function frame(timestamp) {
    const dt = last === null ? 0 : Math.min(0.05, (timestamp - last) / 1000);
    last = timestamp;
    game.update(dt, input);
    audio.play(game.drainEvents());
    draw();
    requestAnimationFrame(frame);
}

function draw() {
    renderers[game.view](ctx, game);
    drawHud(ctx, game);
    drawOverlay(ctx, game);
}

// Console handles for debugging and automated play-testing.
window.asteroidGame = game;
window.asteroidDraw = draw;
requestAnimationFrame(frame);

},{"./audio":3,"./game":6,"./render/hud":9,"./render/overview":10,"./render/pov":11}],2:[function(require,module,exports){
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
            return fragment;
        });
    }
}

Asteroid.WORLD_WIDTH = WORLD_WIDTH;

module.exports = Asteroid;

},{"./rng":14}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
// World-space projectile. `y` is forward distance along the level.
class Bullet {
    constructor({ x, y, vx = 0, vy = 0, size = 3, damage = 1, pierce = false, life = 1.4, owner = 'player', color = '#fff' }) {
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
        this.hits = pierce ? new Set() : null;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
    }

    get alive() {
        return this.life > 0;
    }
}

module.exports = Bullet;

},{}],5:[function(require,module,exports){
// collision.js

function checkCollision(obj1, obj2) {
    const dx = obj1.x - obj2.x;
    const dy = obj1.y - obj2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Use the size of both objects for accurate detection
    return distance < obj1.size + obj2.size;
}

module.exports = checkCollision;
},{}],6:[function(require,module,exports){
const checkCollision = require('./collision');
const Spaceship = require('./spaceship');
const Bullet = require('./bullet');
const { createRng, range } = require('./rng');
const { getLevel, LEVEL_COUNT } = require('./levels');
const { populateLevel } = require('./levelLayout');
const { applyWeaponPickup, downgradeWeapon, fireWeapon } = require('./weapons');

const STORAGE_KEY = 'asteroid-galactica-progress';
const ACTIVATION_DISTANCE = 900;
const FIRE_RANGE = { min: 80, max: 700 };
const LEVEL_INTRO_TIME = 2.5;
const LEVEL_COMPLETE_TIME = 3.5;
const RESPAWN_TIME = 1.8;

function loadProgress(storage) {
    try {
        const saved = JSON.parse(storage && storage.getItem(STORAGE_KEY));
        if (saved && Number.isInteger(saved.unlocked)) {
            return {
                unlocked: Math.min(LEVEL_COUNT, Math.max(1, saved.unlocked)),
                highScore: Number(saved.highScore) || 0
            };
        }
    } catch (error) {
        // Corrupt or unavailable storage falls back to a fresh campaign.
    }
    return { unlocked: 1, highScore: 0 };
}

class Game {
    constructor({ storage = null } = {}) {
        this.storage = storage;
        this.progress = loadProgress(storage);
        this.selectedLevel = this.progress.unlocked;
        this.view = 'overview';
        this.state = 'title';
        this.events = [];
        this.particles = [];
        this.time = 0;
        this.score = 0;
        this.levelStartScore = 0;
        this.ship = new Spaceship();
        this.level = getLevel(1);
        this.resetWorld();
    }

    resetWorld() {
        this.scrollY = 0;
        this.asteroids = [];
        this.pickups = [];
        this.playerBullets = [];
        this.enemyBullets = [];
        this.levelTime = 0;
        this.stateTimer = 0;
        this.levelBonus = 0;
    }

    emit(type, data = {}) {
        this.events.push({ type, ...data });
    }

    drainEvents() {
        const events = this.events;
        this.events = [];
        return events;
    }

    startCampaign(levelNumber = 1) {
        this.score = 0;
        this.ship = new Spaceship();
        this.startLevel(levelNumber);
    }

    startLevel(levelNumber) {
        this.level = getLevel(levelNumber);
        this.rng = createRng(this.level.seed);
        this.resetWorld();
        const layout = populateLevel(this.level, this.rng);
        this.asteroids = layout.asteroids;
        this.pickups = layout.pickups;
        const { lives, weapon } = this.ship;
        this.ship.reset();
        this.ship.lives = lives;
        this.ship.weapon = weapon;
        this.ship.y = this.ship.offset;
        this.ship.invulnerable = LEVEL_INTRO_TIME;
        this.levelStartScore = this.score;
        this.particles = [];
        this.state = 'playing';
        this.emit('levelStart', { level: levelNumber });
    }

    retryLevel() {
        this.score = this.levelStartScore;
        this.ship = new Spaceship();
        this.startLevel(this.level.number);
    }

    handleAction(action) {
        switch (action) {
            case 'toggleView':
                this.view = this.view === 'overview' ? 'pov' : 'overview';
                break;
            case 'pause':
                if (this.state === 'playing') this.state = 'paused';
                else if (this.state === 'paused') this.state = 'playing';
                break;
            case 'left':
            case 'right':
                if (this.state === 'title') {
                    const delta = action === 'left' ? -1 : 1;
                    this.selectedLevel = Math.min(this.progress.unlocked, Math.max(1, this.selectedLevel + delta));
                }
                break;
            case 'confirm':
                if (this.state === 'title') this.startCampaign(this.selectedLevel);
                else if (this.state === 'gameOver') this.retryLevel();
                else if (this.state === 'levelComplete') this.advanceLevel();
                else if (this.state === 'paused') this.state = 'playing';
                else if (this.state === 'victory') this.goToTitle();
                break;
            case 'menu':
                if (['paused', 'gameOver', 'victory'].includes(this.state)) this.goToTitle();
                break;
            default:
                break;
        }
    }

    goToTitle() {
        this.selectedLevel = this.progress.unlocked;
        this.state = 'title';
    }

    update(dt, input = {}) {
        this.time += dt;
        this.updateParticles(dt);

        if (this.state === 'levelComplete') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) this.advanceLevel();
            return;
        }
        if (this.state !== 'playing' && this.state !== 'dying') return;

        this.levelTime += dt;
        this.scrollY += this.level.scrollSpeed * dt;
        const ship = this.ship;

        if (this.state === 'playing') {
            ship.update(dt, input, this.scrollY);
            if (input.fire && ship.cooldown <= 0) this.firePlayerWeapon();
        } else {
            ship.y = this.scrollY + ship.offset;
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) this.respawnOrEnd();
        }

        this.updateAsteroids(dt);
        this.playerBullets.forEach((bullet) => bullet.update(dt));
        this.enemyBullets.forEach((bullet) => bullet.update(dt));
        this.resolvePlayerHits();
        if (this.state === 'playing') this.resolveShipHits();
        this.cleanup();

        if (this.state === 'playing' && this.scrollY >= this.level.length) this.completeLevel();
    }

    firePlayerWeapon() {
        const shot = fireWeapon(this.ship.weapon, this.ship, this.level.scrollSpeed);
        this.playerBullets.push(...shot.bullets);
        this.ship.cooldown = shot.cooldown;
        this.emit('shot', { weapon: this.ship.weapon.type });
    }

    updateAsteroids(dt) {
        const ship = this.ship;
        const shipCanBeTargeted = this.state === 'playing';
        for (const asteroid of this.asteroids) {
            if (!asteroid.active && asteroid.y - ship.y < ACTIVATION_DISTANCE) asteroid.active = true;
            asteroid.update(dt);
            if (!asteroid.shooter || !asteroid.active || !shipCanBeTargeted) continue;
            asteroid.fireCooldown -= dt;
            const ahead = asteroid.y - ship.y;
            if (asteroid.fireCooldown <= 0 && ahead > FIRE_RANGE.min && ahead < FIRE_RANGE.max) {
                this.fireEnemyBullet(asteroid);
                asteroid.fireCooldown = this.level.fireInterval * range(this.rng, 0.7, 1.3);
            }
        }
    }

    fireEnemyBullet(asteroid) {
        const ship = this.ship;
        const angle = Math.atan2(ship.x - asteroid.x, ship.y - asteroid.y) + range(this.rng, -1, 1) * this.level.aimError;
        const speed = this.level.enemyBulletSpeed;
        this.enemyBullets.push(new Bullet({
            x: asteroid.x,
            y: asteroid.y - asteroid.size,
            vx: Math.sin(angle) * speed,
            // Add the scroll speed so the bullet is aimed relative to the moving ship.
            vy: Math.cos(angle) * speed + this.level.scrollSpeed,
            size: 4,
            damage: this.level.bulletDamage,
            life: 6,
            owner: 'enemy',
            color: '#ff5a3c'
        }));
        this.emit('enemyShot', { x: asteroid.x, y: asteroid.y });
    }

    resolvePlayerHits() {
        const spawned = [];
        for (const bullet of this.playerBullets) {
            if (!bullet.alive) continue;
            for (const asteroid of this.asteroids) {
                if (asteroid.hp <= 0 || (bullet.hits && bullet.hits.has(asteroid.id))) continue;
                if (!checkCollision(bullet, asteroid)) continue;
                if (bullet.hits) bullet.hits.add(asteroid.id);
                else bullet.life = 0;
                if (asteroid.takeHit(bullet.damage)) {
                    spawned.push(...this.destroyAsteroid(asteroid));
                } else {
                    this.emit('hit', { x: asteroid.x, y: asteroid.y });
                }
                if (!bullet.pierce) break;
            }
        }
        this.asteroids.push(...spawned);
    }

    destroyAsteroid(asteroid, awardPoints = true) {
        asteroid.hp = 0;
        if (awardPoints) {
            const base = asteroid.shooter ? 150 : 50 + asteroid.maxHp * 25;
            this.score += Math.round(base * (1 + (this.level.number - 1) * 0.1));
        }
        this.spawnExplosion(asteroid.x, asteroid.y, asteroid.shooter ? '#ff8a5c' : '#d8d2c4', Math.round(asteroid.size));
        this.emit('explode', { x: asteroid.x, y: asteroid.y, size: asteroid.size });
        return asteroid.breakApart(this.rng);
    }

    resolveShipHits() {
        const ship = this.ship;

        for (const bullet of this.enemyBullets) {
            if (!bullet.alive || !checkCollision(bullet, ship)) continue;
            bullet.life = 0;
            this.damageShip(bullet.damage, bullet.x, bullet.y);
            if (this.state !== 'playing') return;
        }

        for (const asteroid of this.asteroids) {
            if (asteroid.hp <= 0 || !checkCollision(asteroid, ship)) continue;
            const fragments = this.destroyAsteroid(asteroid, ship.shield > 0);
            this.asteroids.push(...fragments);
            this.damageShip(30 + asteroid.size, asteroid.x, asteroid.y);
            if (this.state !== 'playing') return;
        }

        for (const pickup of this.pickups) {
            if (pickup.collected || !checkCollision(pickup, ship)) continue;
            pickup.collected = true;
            this.collectPickup(pickup);
        }
    }

    damageShip(amount, x, y) {
        const ship = this.ship;
        if (ship.shield > 0) {
            this.emit('shieldHit', { x, y });
            return;
        }
        if (ship.invulnerable > 0) return;
        ship.power = Math.max(0, ship.power - amount);
        ship.invulnerable = 0.6;
        this.emit('shipHit', { x, y, power: ship.power });
        if (ship.power <= 0) this.destroyShip();
    }

    destroyShip() {
        const ship = this.ship;
        ship.lives -= 1;
        this.state = 'dying';
        this.stateTimer = RESPAWN_TIME;
        this.spawnExplosion(ship.x, ship.y, '#7fd7ff', 40);
        this.emit('shipDestroyed', { x: ship.x, y: ship.y });
    }

    respawnOrEnd() {
        const ship = this.ship;
        if (ship.lives <= 0) {
            this.state = 'gameOver';
            this.saveProgress();
            this.emit('gameOver');
            return;
        }
        ship.power = ship.maxPower;
        ship.weapon = downgradeWeapon(ship.weapon);
        ship.invulnerable = 2.5;
        ship.x = 400;
        ship.offset = 90;
        ship.y = this.scrollY + ship.offset;
        this.enemyBullets = this.enemyBullets.filter((bullet) => Math.abs(bullet.y - ship.y) > 300);
        this.state = 'playing';
        this.emit('respawn');
    }

    collectPickup(pickup) {
        const ship = this.ship;
        if (pickup.type === 'power') {
            ship.power = Math.min(ship.maxPower, ship.power + 40);
        } else if (pickup.type === 'shield') {
            ship.shield = 7;
        } else {
            ship.weapon = applyWeaponPickup(ship.weapon, pickup.type);
        }
        this.score += 100;
        this.spawnExplosion(pickup.x, pickup.y, '#9effa8', 14);
        this.emit('pickup', { type: pickup.type, weapon: { ...ship.weapon } });
    }

    completeLevel() {
        this.levelBonus = Math.round(this.ship.power) * 10 + this.level.number * 250;
        this.score += this.levelBonus;
        const next = this.level.number + 1;
        if (next > LEVEL_COUNT) {
            this.state = 'victory';
            this.saveProgress();
            this.emit('victory');
            return;
        }
        this.progress.unlocked = Math.max(this.progress.unlocked, next);
        this.saveProgress();
        this.state = 'levelComplete';
        this.stateTimer = LEVEL_COMPLETE_TIME;
        this.emit('levelComplete', { level: this.level.number });
    }

    advanceLevel() {
        if (this.state !== 'levelComplete') return;
        const ship = this.ship;
        ship.power = ship.maxPower;
        this.startLevel(this.level.number + 1);
    }

    saveProgress() {
        this.progress.highScore = Math.max(this.progress.highScore, this.score);
        if (!this.storage) return;
        try {
            this.storage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
        } catch (error) {
            // Progress saving is optional; play continues without it.
        }
    }

    cleanup() {
        const behind = this.scrollY - 150;
        const ahead = this.scrollY + this.level.length + 2000;
        this.asteroids = this.asteroids.filter((a) => a.hp > 0 && a.y > behind);
        this.pickups = this.pickups.filter((p) => !p.collected && p.y > behind);
        const inWorld = (b) => b.alive && b.y > behind && b.y < ahead && b.x > -50 && b.x < 850;
        this.playerBullets = this.playerBullets.filter(inWorld);
        this.enemyBullets = this.enemyBullets.filter(inWorld);
    }

    spawnExplosion(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 30 + Math.random() * 140;
            const life = 0.4 + Math.random() * 0.6;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed + (this.level ? this.level.scrollSpeed : 0),
                life,
                maxLife: life,
                color
            });
        }
    }

    updateParticles(dt) {
        for (const p of this.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
        }
        this.particles = this.particles.filter((p) => p.life > 0);
    }

    get levelProgress() {
        return Math.min(1, this.scrollY / this.level.length);
    }

    get showLevelIntro() {
        return this.state === 'playing' && this.levelTime < LEVEL_INTRO_TIME;
    }
}

Game.STORAGE_KEY = STORAGE_KEY;

module.exports = Game;

},{"./bullet":4,"./collision":5,"./levelLayout":7,"./levels":8,"./rng":14,"./spaceship":15,"./weapons":16}],7:[function(require,module,exports){
const Asteroid = require('./asteroid');
const { range, pick } = require('./rng');

const WORLD_WIDTH = Asteroid.WORLD_WIDTH;
const SAFE_START = 520;
const PICKUP_TYPES = ['spread', 'rapid', 'plasma', 'power', 'shield'];

function scatterAsteroid(level, rng, y) {
    const size = range(rng, 14, 26 + level.number * 1.6);
    const moving = rng() < level.movingChance;
    return new Asteroid({
        x: range(rng, 40, WORLD_WIDTH - 40),
        y,
        size,
        vx: moving ? range(rng, -1, 1) * level.driftSpeed : 0,
        vy: moving ? -rng() * level.approachSpeed : 0,
        shooter: rng() < level.shooterChance,
        rng
    });
}

function addWall(asteroids, level, rng, y) {
    const spacing = 56;
    const count = Math.floor((WORLD_WIDTH - 40) / spacing) + 1;
    const withGap = level.number <= 2;
    const gapStart = 1 + Math.floor(rng() * (count - 3));
    for (let i = 0; i < count; i++) {
        if (withGap && (i === gapStart || i === gapStart + 1)) continue;
        asteroids.push(new Asteroid({
            x: 20 + i * spacing,
            y: y + range(rng, -10, 10),
            size: 20,
            hp: 1,
            shooter: level.number >= 6 && i % 4 === 0,
            rng
        }));
    }
}

function addRush(asteroids, level, rng, y) {
    const count = 6 + level.number;
    const speed = 60 + level.number * 14;
    for (let i = 0; i < count; i++) {
        asteroids.push(new Asteroid({
            x: range(rng, 40, WORLD_WIDTH - 40),
            y: y + range(rng, 0, 320),
            size: range(rng, 14, 24),
            vx: range(rng, -15, 15),
            vy: -speed * range(rng, 0.8, 1.2),
            hp: 1,
            shooter: rng() < level.shooterChance * 0.5,
            rng
        }));
    }
}

function addChevron(asteroids, level, rng, y) {
    const center = range(rng, 220, WORLD_WIDTH - 220);
    for (let i = -3; i <= 3; i++) {
        asteroids.push(new Asteroid({
            x: center + i * 60,
            y: y + Math.abs(i) * 50,
            size: 22,
            hp: 2,
            shooter: true,
            rng
        }));
    }
}

const PATTERNS = { wall: addWall, rush: addRush, chevron: addChevron };

function gauntletPattern(level, index) {
    if (level.number <= 2) return 'wall';
    if (level.movingChance === 0) return ['wall', 'chevron'][index % 2];
    return ['wall', 'rush', 'chevron'][(index + level.number) % 3];
}

function populateLevel(level, rng) {
    const asteroids = [];
    const pickups = [];
    const gauntletYs = [];

    for (let k = 0; k < level.gauntlets; k++) {
        const y = SAFE_START + 300 + ((level.length - SAFE_START - 300) * (k + 1)) / (level.gauntlets + 1);
        const pattern = gauntletPattern(level, k);
        gauntletYs.push(y);
        PATTERNS[pattern](asteroids, level, rng, y);
        pickups.push({ x: range(rng, 120, WORLD_WIDTH - 120), y: y + 480, type: pick(rng, PICKUP_TYPES), size: 14 });
    }

    const scatterCount = Math.round((level.density * level.length) / 1000);
    for (let i = 0; i < scatterCount; i++) {
        const y = range(rng, SAFE_START, level.length - 150);
        if (gauntletYs.some((gy) => y > gy - 160 && y < gy + 420)) continue;
        asteroids.push(scatterAsteroid(level, rng, y));
    }

    const extraPickups = Math.max(0, level.pickups - level.gauntlets);
    for (let i = 0; i < extraPickups; i++) {
        const y = SAFE_START + ((level.length - SAFE_START) * (i + 0.5)) / extraPickups;
        const type = i === 0 ? pick(rng, ['spread', 'rapid', 'plasma']) : pick(rng, PICKUP_TYPES);
        pickups.push({ x: range(rng, 80, WORLD_WIDTH - 80), y, type, size: 14 });
    }

    asteroids.sort((a, b) => a.y - b.y);
    pickups.sort((a, b) => a.y - b.y);
    return { asteroids, pickups };
}

module.exports = { populateLevel, PICKUP_TYPES, SAFE_START };

},{"./asteroid":2,"./rng":14}],8:[function(require,module,exports){
const LEVEL_COUNT = 10;

const LEVEL_NAMES = [
    'Drydock Drift',
    'Quiet Belt',
    'Pebble Lanes',
    'First Contact',
    'The Narrows',
    'Crossfire Fields',
    'Meteor Rain',
    'Ironheart Swarm',
    'Galactic Gauntlet',
    'The Core'
];

// Difficulty scales with the level number. Levels 1-3 have stationary rocks;
// drift and rocks charging at the ship arrive from level 4 onward.
function getLevel(number) {
    if (!Number.isInteger(number) || number < 1 || number > LEVEL_COUNT) {
        throw new RangeError(`Level must be an integer from 1 to ${LEVEL_COUNT}`);
    }
    const n = number;
    return {
        number: n,
        name: LEVEL_NAMES[n - 1],
        length: 2600 + n * 500,
        scrollSpeed: 60 + n * 10,
        density: 5 + n * 2,
        movingChance: n <= 3 ? 0 : Math.min(0.85, (n - 3) * 0.13),
        driftSpeed: n <= 3 ? 0 : 6 + n * 3,
        approachSpeed: n <= 4 ? 0 : (n - 4) * 10,
        shooterChance: 0.1 + n * 0.04,
        fireInterval: 3.4 - n * 0.2,
        enemyBulletSpeed: 110 + n * 16,
        aimError: Math.max(0.04, 0.35 - n * 0.03),
        bulletDamage: 8 + n,
        gauntlets: Math.ceil(n / 2),
        pickups: 4 + Math.floor(n / 2),
        seed: 1000 + n * 7919
    };
}

module.exports = { LEVEL_COUNT, LEVEL_NAMES, getLevel };

},{}],9:[function(require,module,exports){
const { VIEW } = require('./projection');
const { WEAPONS, MAX_TIER } = require('../weapons');
const { LEVEL_COUNT, getLevel } = require('../levels');
const { PICKUP_STYLE } = require('./shapes');

const FONT = 'monospace';

function text(ctx, value, x, y, { size = 14, color = '#e8f6ff', align = 'left', weight = 'bold' } = {}) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
}

function powerColor(fraction) {
    if (fraction > 0.6) return '#7dff8c';
    if (fraction > 0.3) return '#ffd25c';
    return '#ff5a3c';
}

function drawPowerBar(ctx, ship, time) {
    const x = 16;
    const y = VIEW.height - 34;
    const width = 220;
    const fraction = ship.power / ship.maxPower;
    text(ctx, 'POWER', x, y - 6, { size: 12, color: '#9fb4c8' });
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(x, y, width, 14);
    const lowPulse = fraction <= 0.3 && Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = lowPulse ? '#ffffff' : powerColor(fraction);
    ctx.fillRect(x, y, width * fraction, 14);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.strokeRect(x + 0.5, y + 0.5, width, 14);
    if (ship.shield > 0) {
        text(ctx, `SHIELD ${ship.shield.toFixed(1)}s`, x + width + 12, y + 12, { size: 12, color: PICKUP_STYLE.shield.color });
    }
}

function drawWeapon(ctx, ship) {
    const spec = WEAPONS[ship.weapon.type];
    const x = 16;
    const y = VIEW.height - 52;
    text(ctx, spec.name.toUpperCase(), x, y - 6, { size: 13, color: spec.color });
    for (let i = 0; i < MAX_TIER; i++) {
        ctx.fillStyle = i < ship.weapon.tier ? spec.color : 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(x + 150 + i * 14, y - 16, 10, 10);
    }
}

function drawLives(ctx, ship) {
    for (let i = 0; i < ship.lives; i++) {
        const x = VIEW.width - 24 - i * 22;
        ctx.beginPath();
        ctx.moveTo(x, 14);
        ctx.lineTo(x + 7, 30);
        ctx.lineTo(x - 7, 30);
        ctx.closePath();
        ctx.strokeStyle = '#7fd7ff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}

function drawProgress(ctx, game) {
    const width = 260;
    const x = (VIEW.width - width) / 2;
    text(ctx, `LEVEL ${game.level.number}/${LEVEL_COUNT} · ${game.level.name.toUpperCase()}`, VIEW.width / 2, 20, {
        size: 13,
        align: 'center'
    });
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(x, 28, width, 5);
    ctx.fillStyle = '#7dff8c';
    ctx.fillRect(x, 28, width * game.levelProgress, 5);
}

function drawRadar(ctx, game) {
    const width = 120;
    const height = 150;
    const x = VIEW.width - width - 12;
    const y = 42;
    const rangeAhead = 900;
    const rangeBehind = 100;
    const scaleX = width / 800;
    const scaleY = height / (rangeAhead + rangeBehind);
    const toRadar = (obj) => ({
        x: x + obj.x * scaleX,
        y: y + height - (obj.y - (game.ship.y - rangeBehind)) * scaleY
    });
    const inside = (p) => p.y >= y && p.y <= y + height;

    ctx.save();
    ctx.fillStyle = 'rgba(4, 12, 24, 0.75)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = 'rgba(127, 215, 255, 0.5)';
    ctx.strokeRect(x + 0.5, y + 0.5, width, height);
    for (const asteroid of game.asteroids) {
        const p = toRadar(asteroid);
        if (!inside(p)) continue;
        ctx.fillStyle = asteroid.shooter ? '#ff8a5c' : '#bdb8ad';
        const s = Math.max(2, asteroid.size * scaleX * 1.6);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    for (const pickup of game.pickups) {
        const p = toRadar(pickup);
        if (!inside(p)) continue;
        ctx.fillStyle = PICKUP_STYLE[pickup.type].color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.fillStyle = '#ff5a3c';
    for (const bullet of game.enemyBullets) {
        const p = toRadar(bullet);
        if (inside(p)) ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    const shipPoint = toRadar(game.ship);
    ctx.fillStyle = '#7fd7ff';
    ctx.beginPath();
    ctx.moveTo(shipPoint.x, shipPoint.y - 5);
    ctx.lineTo(shipPoint.x + 4, shipPoint.y + 3);
    ctx.lineTo(shipPoint.x - 4, shipPoint.y + 3);
    ctx.fill();
    text(ctx, 'RADAR', x + 4, y + 12, { size: 10, color: '#9fb4c8' });
    ctx.restore();
}

function drawHud(ctx, game) {
    if (game.state === 'title') return;
    const ship = game.ship;
    text(ctx, `SCORE ${game.score}`, 16, 22, { size: 16 });
    text(ctx, `HI ${Math.max(game.progress.highScore, game.score)}`, 16, 40, { size: 11, color: '#9fb4c8' });
    drawProgress(ctx, game);
    drawLives(ctx, ship);
    drawWeapon(ctx, ship);
    drawPowerBar(ctx, ship, game.time);
    const viewLabel = game.view === 'pov' ? 'POV' : 'OVERVIEW';
    text(ctx, `[V] ${viewLabel}`, VIEW.width - 16, VIEW.height - 18, { size: 12, color: '#9fb4c8', align: 'right' });
    if (game.view === 'pov') drawRadar(ctx, game);
}

function panel(ctx, height = 230) {
    ctx.fillStyle = 'rgba(2, 4, 12, 0.78)';
    ctx.fillRect(0, (VIEW.height - height) / 2, VIEW.width, height);
}

function drawTitle(ctx, game) {
    ctx.fillStyle = 'rgba(2, 4, 12, 0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const cx = VIEW.width / 2;
    text(ctx, '☄  AsteRoid  ☄', cx, 130, { size: 52, align: 'center', color: '#7fd7ff' });
    text(ctx, 'GALACTIC GAUNTLET', cx, 166, { size: 18, align: 'center', color: '#ff8a5c' });

    const level = getLevel(game.selectedLevel);
    const canLeft = game.selectedLevel > 1;
    const canRight = game.selectedLevel < game.progress.unlocked;
    text(ctx, `${canLeft ? '◀' : ' '}  LEVEL ${level.number}: ${level.name.toUpperCase()}  ${canRight ? '▶' : ' '}`, cx, 232, {
        size: 20,
        align: 'center'
    });
    text(ctx, `Unlocked ${game.progress.unlocked}/${LEVEL_COUNT} · High score ${game.progress.highScore}`, cx, 258, {
        size: 12,
        align: 'center',
        color: '#9fb4c8'
    });
    const pulse = 0.55 + 0.45 * Math.sin(game.time * 4);
    text(ctx, 'PRESS ENTER TO LAUNCH', cx, 304, { size: 20, align: 'center', color: `rgba(125, 255, 140, ${pulse})` });

    const controls = [
        '←/→ or A/D  steer      ↑/↓ or W/S  throttle',
        'SPACE  fire (hold)     V  switch overview / POV',
        'P  pause    M  mute    Q  menu (paused / game over)',
        '',
        'Fly through pickups:  S spread · R rapid · P plasma',
        '+ power cell · ◎ shield.  Orange-core rocks shoot back!'
    ];
    controls.forEach((line, i) => text(ctx, line, cx, 370 + i * 22, { size: 14, align: 'center', color: '#c9d6e3', weight: 'normal' }));
}

function drawOverlay(ctx, game) {
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    switch (game.state) {
        case 'title':
            drawTitle(ctx, game);
            break;
        case 'paused':
            panel(ctx, 160);
            text(ctx, 'PAUSED', cx, cy - 10, { size: 40, align: 'center' });
            text(ctx, 'P / Enter resume · Q menu · V switch view', cx, cy + 30, { size: 14, align: 'center', color: '#9fb4c8' });
            break;
        case 'levelComplete':
            panel(ctx);
            text(ctx, `LEVEL ${game.level.number} CLEAR`, cx, cy - 30, { size: 40, align: 'center', color: '#7dff8c' });
            text(ctx, `Bonus +${game.levelBonus}`, cx, cy + 10, { size: 18, align: 'center' });
            text(ctx, `Next: ${getLevel(game.level.number + 1).name}  ·  Enter to jump now`, cx, cy + 44, {
                size: 14,
                align: 'center',
                color: '#9fb4c8'
            });
            break;
        case 'gameOver':
            panel(ctx);
            text(ctx, 'GAME OVER', cx, cy - 30, { size: 46, align: 'center', color: '#ff5a3c' });
            text(ctx, `Score ${game.score}`, cx, cy + 10, { size: 18, align: 'center' });
            text(ctx, `Enter retry level ${game.level.number} · Q menu`, cx, cy + 44, { size: 14, align: 'center', color: '#9fb4c8' });
            break;
        case 'victory':
            panel(ctx, 260);
            text(ctx, 'YOU CLEARED THE CORE!', cx, cy - 40, { size: 36, align: 'center', color: '#7dff8c' });
            text(ctx, `Final score ${game.score}`, cx, cy + 4, { size: 20, align: 'center' });
            text(ctx, 'All 10 levels complete · Enter for menu', cx, cy + 40, { size: 14, align: 'center', color: '#9fb4c8' });
            break;
        case 'playing':
            if (game.showLevelIntro) {
                text(ctx, `LEVEL ${game.level.number}`, cx, cy - 40, { size: 44, align: 'center', color: '#7fd7ff' });
                text(ctx, game.level.name.toUpperCase(), cx, cy - 6, { size: 20, align: 'center', color: '#ff8a5c' });
            }
            break;
        default:
            break;
    }
}

module.exports = { drawHud, drawOverlay };

},{"../levels":8,"../weapons":16,"./projection":12,"./shapes":13}],10:[function(require,module,exports){
const { VIEW, projectOverview } = require('./projection');
const { drawAsteroid, drawPickup, drawShipTop, drawGlowDot } = require('./shapes');

function createOverviewRenderer() {
    const stars = Array.from({ length: 140 }, () => ({
        x: Math.random() * VIEW.width,
        y: Math.random() * VIEW.height,
        depth: 0.15 + Math.random() * 0.85
    }));

    return function renderOverview(ctx, game) {
        const { scrollY } = game;
        ctx.fillStyle = '#04040c';
        ctx.fillRect(0, 0, VIEW.width, VIEW.height);

        for (const star of stars) {
            const y = (star.y + scrollY * star.depth * 0.6) % VIEW.height;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + star.depth * 0.6})`;
            ctx.fillRect(star.x, y, star.depth * 2, star.depth * 2);
        }

        const exit = projectOverview({ x: 0, y: game.level.length }, scrollY);
        if (exit.y > -10 && exit.y < VIEW.height + 10) {
            ctx.save();
            ctx.setLineDash([14, 10]);
            ctx.strokeStyle = '#7dff8c';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, exit.y);
            ctx.lineTo(VIEW.width, exit.y);
            ctx.stroke();
            ctx.fillStyle = '#7dff8c';
            ctx.font = 'bold 14px monospace';
            ctx.fillText('JUMP GATE', 12, exit.y - 8);
            ctx.restore();
        }

        const onScreen = (p, margin) => p.y > -margin && p.y < VIEW.height + margin;

        for (const pickup of game.pickups) {
            const p = projectOverview(pickup, scrollY);
            if (onScreen(p, 30)) drawPickup(ctx, pickup, p.x, p.y, pickup.size, game.time);
        }

        for (const asteroid of game.asteroids) {
            const p = projectOverview(asteroid, scrollY);
            if (onScreen(p, 60)) drawAsteroid(ctx, asteroid, p.x, p.y, asteroid.size);
        }

        for (const bullet of game.playerBullets) {
            const p = projectOverview(bullet, scrollY);
            if (!onScreen(p, 20)) continue;
            ctx.save();
            ctx.strokeStyle = bullet.color;
            ctx.shadowColor = bullet.color;
            ctx.shadowBlur = 8;
            ctx.lineWidth = bullet.size;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - bullet.vx * 0.02, p.y + bullet.vy * 0.02);
            ctx.stroke();
            ctx.restore();
        }

        for (const bullet of game.enemyBullets) {
            const p = projectOverview(bullet, scrollY);
            if (onScreen(p, 20)) drawGlowDot(ctx, p.x, p.y, bullet.size, bullet.color);
        }

        for (const particle of game.particles) {
            const p = projectOverview(particle, scrollY);
            ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
            ctx.fillStyle = particle.color;
            ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;

        if (game.state === 'playing' || game.state === 'paused' || game.state === 'levelComplete') {
            const p = projectOverview(game.ship, scrollY);
            drawShipTop(ctx, game.ship, p.x, p.y);
        }
    };
}

module.exports = { createOverviewRenderer };

},{"./projection":12,"./shapes":13}],11:[function(require,module,exports){
const { VIEW, POV, povCamera, projectPov, povFade } = require('./projection');
const { drawAsteroid, drawPickup, drawShipChase, drawGlowDot } = require('./shapes');

const FLOOR_HEIGHT = -40;
const GRID_STEP = 100;

function createPovRenderer() {
    const stars = Array.from({ length: 160 }, () => ({
        x: Math.random() * VIEW.width * 2,
        y: Math.random() * POV.horizon,
        size: Math.random() * 1.6 + 0.4
    }));

    function drawBackdrop(ctx, game, camera) {
        const sky = ctx.createLinearGradient(0, 0, 0, POV.horizon);
        sky.addColorStop(0, '#02020a');
        sky.addColorStop(1, '#1c0f33');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, VIEW.width, POV.horizon);
        ctx.fillStyle = '#05030c';
        ctx.fillRect(0, POV.horizon, VIEW.width, VIEW.height - POV.horizon);

        const shift = camera.x * 0.15;
        for (const star of stars) {
            const x = (((star.x - shift) % (VIEW.width * 2)) + VIEW.width * 2) % (VIEW.width * 2) - VIEW.width / 2;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillRect(x, star.y, star.size, star.size);
        }

        ctx.save();
        ctx.lineWidth = 1;
        const nearY = camera.y + POV.near + 4;
        const farY = camera.y + POV.far;
        for (let x = -800; x <= 1600; x += GRID_STEP) {
            const a = projectPov({ x, y: nearY }, camera, FLOOR_HEIGHT);
            const b = projectPov({ x, y: farY }, camera, FLOOR_HEIGHT);
            const edge = x === 0 || x === 800;
            ctx.strokeStyle = edge ? 'rgba(125, 255, 140, 0.55)' : 'rgba(140, 90, 255, 0.22)';
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        for (let y = Math.ceil(nearY / GRID_STEP) * GRID_STEP; y < farY; y += GRID_STEP) {
            const a = projectPov({ x: -800, y }, camera, FLOOR_HEIGHT);
            const b = projectPov({ x: 1600, y }, camera, FLOOR_HEIGHT);
            ctx.strokeStyle = `rgba(140, 90, 255, ${0.3 * povFade(a.depth)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        ctx.restore();

        const gate = projectPov({ x: 400, y: game.level.length }, camera, 0);
        if (gate && gate.depth < POV.far) {
            const left = projectPov({ x: 0, y: game.level.length }, camera, 120);
            const right = projectPov({ x: 800, y: game.level.length }, camera, FLOOR_HEIGHT);
            ctx.save();
            ctx.strokeStyle = '#7dff8c';
            ctx.shadowColor = '#7dff8c';
            ctx.shadowBlur = 12;
            ctx.lineWidth = Math.max(1, gate.scale * 6);
            ctx.globalAlpha = povFade(gate.depth);
            ctx.strokeRect(left.x, left.y, right.x - left.x, right.y - left.y);
            ctx.restore();
        }
    }

    function collectRenderables(game, camera) {
        const items = [];
        const add = (kind, obj, height = 0) => {
            const p = projectPov(obj, camera, height);
            if (p && p.depth < POV.far) items.push({ kind, obj, p });
        };
        game.asteroids.forEach((a) => add('asteroid', a));
        game.pickups.forEach((pk) => add('pickup', pk));
        game.enemyBullets.forEach((b) => add('enemyBullet', b));
        game.playerBullets.forEach((b) => add('playerBullet', b));
        game.particles.forEach((pt) => add('particle', pt));
        items.sort((a, b) => b.p.depth - a.p.depth);
        return items;
    }

    function drawRenderable(ctx, game, item) {
        const { kind, obj, p } = item;
        const alpha = povFade(p.depth);
        if (kind === 'asteroid') {
            const radius = obj.size * p.scale;
            if (radius > 1400 || p.x + radius < 0 || p.x - radius > VIEW.width) return;
            drawAsteroid(ctx, obj, p.x, p.y, radius, alpha);
        } else if (kind === 'pickup') {
            drawPickup(ctx, obj, p.x, p.y, Math.min(120, obj.size * p.scale), game.time, alpha);
        } else if (kind === 'enemyBullet') {
            drawGlowDot(ctx, p.x, p.y, Math.max(2, Math.min(40, obj.size * p.scale)), obj.color, alpha);
        } else if (kind === 'playerBullet') {
            drawGlowDot(ctx, p.x, p.y, Math.max(1.5, Math.min(obj.pierce ? 22 : 9, obj.size * p.scale)), obj.color, alpha);
        } else {
            ctx.globalAlpha = alpha * Math.max(0, obj.life / obj.maxLife);
            ctx.fillStyle = obj.color;
            const s = Math.max(1, Math.min(10, p.scale * 2.5));
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
            ctx.globalAlpha = 1;
        }
    }

    function drawReticle(ctx, camera, ship) {
        const p = projectPov({ x: ship.x, y: ship.y + 420 }, camera, 0);
        ctx.save();
        ctx.strokeStyle = 'rgba(127, 215, 255, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        [[-20, 0, -8, 0], [8, 0, 20, 0], [0, -20, 0, -8], [0, 8, 0, 20]].forEach(([x1, y1, x2, y2]) => {
            ctx.moveTo(p.x + x1, p.y + y1);
            ctx.lineTo(p.x + x2, p.y + y2);
        });
        ctx.stroke();
        ctx.restore();
    }

    return function renderPov(ctx, game) {
        const camera = povCamera(game.ship);
        drawBackdrop(ctx, game, camera);
        for (const item of collectRenderables(game, camera)) drawRenderable(ctx, game, item);
        if (game.state === 'playing' || game.state === 'paused' || game.state === 'levelComplete') {
            drawReticle(ctx, camera, game.ship);
            const shipPoint = projectPov(game.ship, camera, 0);
            drawShipChase(ctx, game.ship, shipPoint.x, shipPoint.y);
        }
    };
}

module.exports = { createPovRenderer };

},{"./projection":12,"./shapes":13}],12:[function(require,module,exports){
const VIEW = { width: 800, height: 600 };

// Overview: top-down map; the level scrolls toward the bottom of the screen.
const OVERVIEW_SHIP_LINE = 560;

function projectOverview(point, scrollY) {
    return {
        x: point.x,
        y: OVERVIEW_SHIP_LINE - (point.y - scrollY),
        scale: 1
    };
}

// POV: chase camera sitting just above and behind the ship, looking down the level.
const POV = {
    focal: 420,
    cameraHeight: 30,
    cameraBack: 50,
    horizon: 250,
    near: 8,
    far: 1700
};

function povCamera(ship) {
    return { x: ship.x, y: ship.y - POV.cameraBack };
}

function projectPov(point, camera, height = 0) {
    const depth = point.y - camera.y;
    if (depth < POV.near) return null;
    const scale = POV.focal / depth;
    return {
        x: VIEW.width / 2 + (point.x - camera.x) * scale,
        y: POV.horizon + (POV.cameraHeight - height) * scale,
        scale,
        depth
    };
}

function povFade(depth) {
    return Math.max(0, Math.min(1, 1.15 - depth / POV.far));
}

module.exports = { VIEW, OVERVIEW_SHIP_LINE, POV, projectOverview, povCamera, projectPov, povFade };

},{}],13:[function(require,module,exports){
const { WEAPONS } = require('../weapons');

const PICKUP_STYLE = {
    spread: { color: WEAPONS.spread.color, label: 'S' },
    rapid: { color: WEAPONS.rapid.color, label: 'R' },
    plasma: { color: WEAPONS.plasma.color, label: 'P' },
    power: { color: '#7dff8c', label: '+' },
    shield: { color: '#6fa8ff', label: '◎' }
};

function drawAsteroid(ctx, asteroid, x, y, radius, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(asteroid.rotation);
    ctx.beginPath();
    const points = asteroid.shape.length;
    asteroid.shape.forEach((factor, i) => {
        const angle = (i / points) * Math.PI * 2;
        const px = Math.cos(angle) * radius * factor;
        const py = Math.sin(angle) * radius * factor;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = asteroid.flash > 0 ? '#ffffff' : asteroid.shooter ? '#2b1712' : '#1c1c22';
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius / 18);
    ctx.strokeStyle = asteroid.shooter ? '#ff8a5c' : '#d8d2c4';
    ctx.stroke();
    if (asteroid.shooter) {
        const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 140 + asteroid.id);
        ctx.rotate(-asteroid.rotation);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 70, 40, ${pulse})`;
        ctx.shadowColor = '#ff4628';
        ctx.shadowBlur = radius * 0.8;
        ctx.fill();
    }
    ctx.restore();
}

function drawPickup(ctx, pickup, x, y, radius, time, alpha = 1) {
    const style = PICKUP_STYLE[pickup.type];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.shadowColor = style.color;
    ctx.shadowBlur = radius * 1.4;
    ctx.save();
    ctx.rotate(time * 2);
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius, 0);
    ctx.closePath();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = Math.max(1.5, radius / 7);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = style.color;
    ctx.font = `bold ${Math.max(8, Math.round(radius * 0.95))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.label, 0, 1);
    ctx.restore();
}

function shipFlickerHidden(ship) {
    return ship.invulnerable > 0 && Math.floor(ship.invulnerable * 12) % 2 === 0;
}

// Top-down ship pointing up the screen.
function drawShipTop(ctx, ship, x, y) {
    if (shipFlickerHidden(ship)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ship.bank * 0.18);
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(13, 12);
    ctx.lineTo(5, 7);
    ctx.lineTo(-5, 7);
    ctx.lineTo(-13, 12);
    ctx.closePath();
    ctx.fillStyle = '#10243a';
    ctx.fill();
    ctx.strokeStyle = '#7fd7ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, 9);
    ctx.lineTo(0, 16 + Math.random() * 8);
    ctx.lineTo(4, 9);
    ctx.fillStyle = '#ffb347';
    ctx.fill();
    drawShield(ctx, ship, 24);
    ctx.restore();
}

// Chase-camera view of the ship from behind.
function drawShipChase(ctx, ship, x, y) {
    if (shipFlickerHidden(ship)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ship.bank * 0.35);
    ctx.beginPath();
    ctx.moveTo(-46, 8);
    ctx.lineTo(-10, -4);
    ctx.lineTo(0, -16);
    ctx.lineTo(10, -4);
    ctx.lineTo(46, 8);
    ctx.lineTo(12, 10);
    ctx.lineTo(0, 18);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fillStyle = '#10243a';
    ctx.fill();
    ctx.strokeStyle = '#7fd7ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    const flame = 6 + Math.random() * 6;
    [-9, 9].forEach((ex) => {
        ctx.beginPath();
        ctx.arc(ex, 10, 4 + flame / 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 179, 71, 0.85)';
        ctx.fill();
    });
    drawShield(ctx, ship, 56);
    ctx.restore();
}

function drawShield(ctx, ship, radius) {
    if (ship.shield <= 0) return;
    const fading = ship.shield < 1.5 && Math.floor(ship.shield * 10) % 2 === 0;
    if (fading) return;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(111, 168, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#6fa8ff';
    ctx.shadowBlur = 14;
    ctx.stroke();
}

function drawGlowDot(ctx, x, y, radius, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = radius * 3;
    ctx.fill();
    ctx.restore();
}

module.exports = { PICKUP_STYLE, drawAsteroid, drawPickup, drawShipTop, drawShipChase, drawGlowDot };

},{"../weapons":16}],14:[function(require,module,exports){
// Small seeded RNG so each level's map is the same every time it is played.
function createRng(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function range(rng, min, max) {
    return min + rng() * (max - min);
}

function pick(rng, items) {
    return items[Math.floor(rng() * items.length)];
}

module.exports = { createRng, range, pick };

},{}],15:[function(require,module,exports){
const { createWeapon } = require('./weapons');

const MIN_X = 20;
const MAX_X = 780;
const MIN_OFFSET = 40;
const MAX_OFFSET = 280;

// The ship flies at the scroll position plus a player-controlled forward offset.
class Spaceship {
    constructor() {
        this.size = 12;
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
        this.invulnerable = 0;
        this.shield = 0;
        this.bank = 0;
        this.lateralSpeed = 280;
        this.forwardSpeed = 190;
    }

    update(dt, input, scrollY) {
        let steer = 0;
        if (input.left) steer -= 1;
        if (input.right) steer += 1;
        this.x = Math.min(MAX_X, Math.max(MIN_X, this.x + steer * this.lateralSpeed * dt));
        if (input.up) this.offset += this.forwardSpeed * dt;
        if (input.down) this.offset -= this.forwardSpeed * dt;
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

},{"./weapons":16}],16:[function(require,module,exports){
const Bullet = require('./bullet');

const MAX_TIER = 3;

// Pattern entries are [angle in radians from straight ahead, lateral offset].
const WEAPONS = {
    blaster: {
        name: 'Blaster',
        color: '#9ff3ff',
        cooldown: [0.26, 0.22, 0.18],
        speed: 540,
        damage: [1, 1, 1],
        size: [3, 3, 3],
        pierce: false,
        pattern: [[[0, 0]], [[-0.05, -6], [0.05, 6]], [[-0.09, -8], [0, 0], [0.09, 8]]]
    },
    spread: {
        name: 'Spread Cannon',
        color: '#5fffd0',
        cooldown: [0.34, 0.3, 0.27],
        speed: 480,
        damage: [1, 1, 1],
        size: [3, 3, 3],
        pierce: false,
        pattern: [
            [[-0.2, 0], [0, 0], [0.2, 0]],
            [[-0.3, 0], [-0.15, 0], [0, 0], [0.15, 0], [0.3, 0]],
            [[-0.42, 0], [-0.28, 0], [-0.14, 0], [0, 0], [0.14, 0], [0.28, 0], [0.42, 0]]
        ]
    },
    rapid: {
        name: 'Rapid Laser',
        color: '#ffe65c',
        cooldown: [0.1, 0.08, 0.065],
        speed: 760,
        damage: [1, 1, 1],
        size: [2, 2, 2],
        pierce: false,
        pattern: [[[0, 0]], [[0, -7], [0, 7]], [[-0.03, -10], [0, 0], [0.03, 10]]]
    },
    plasma: {
        name: 'Plasma Lance',
        color: '#ff6cf5',
        cooldown: [0.55, 0.48, 0.42],
        speed: 400,
        damage: [3, 4, 5],
        size: [7, 9, 11],
        pierce: true,
        pattern: [[[0, 0]], [[0, 0]], [[-0.06, -10], [0.06, 10]]]
    }
};

function createWeapon(type = 'blaster') {
    if (!WEAPONS[type]) throw new Error(`Unknown weapon: ${type}`);
    return { type, tier: 1 };
}

function applyWeaponPickup(weapon, type) {
    if (weapon.type === type) {
        return { type, tier: Math.min(MAX_TIER, weapon.tier + 1) };
    }
    return createWeapon(type);
}

function downgradeWeapon(weapon) {
    if (weapon.tier > 1) return { type: weapon.type, tier: weapon.tier - 1 };
    return createWeapon('blaster');
}

function fireWeapon(weapon, ship, scrollSpeed) {
    const spec = WEAPONS[weapon.type];
    const tierIndex = weapon.tier - 1;
    const bullets = spec.pattern[tierIndex].map(([angle, offset]) => new Bullet({
        x: ship.x + offset,
        y: ship.y + ship.size,
        vx: Math.sin(angle) * spec.speed,
        vy: Math.cos(angle) * spec.speed + scrollSpeed,
        size: spec.size[tierIndex],
        damage: spec.damage[tierIndex],
        pierce: spec.pierce,
        life: 1.4,
        owner: 'player',
        color: spec.color
    }));
    return { bullets, cooldown: spec.cooldown[tierIndex] };
}

module.exports = { WEAPONS, MAX_TIER, createWeapon, applyWeaponPickup, downgradeWeapon, fireWeapon };

},{"./bullet":4}]},{},[1]);
