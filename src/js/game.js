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
