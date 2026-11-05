const checkCollision = require('./collision');
const Spaceship = require('./spaceship');
const Bullet = require('./bullet');
const { createRng, range } = require('./rng');
const { getLevel, LEVEL_COUNT } = require('./levels');
const { populateLevel } = require('./levelLayout');
const { applyWeaponPickup, downgradeWeapon, fireWeapon } = require('./weapons');
const { DIFFICULTY_IDS, isDifficulty, getDifficulty, stepDifficulty } = require('./difficulty');
const { LevelTracker, createTotals, mergeTotals, buildLevelRecord } = require('./stats');
const {
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    MAX_WINS,
    loadSave,
    persistSave,
    validateSave
} = require('./save');

const ACTIVATION_DISTANCE = 900;
const FIRE_RANGE = { min: 80, max: 700 };
const LEVEL_INTRO_TIME = 2.5;
const LEVEL_COMPLETE_TIME = 3.5;
const RESPAWN_TIME = 1.8;

const clone = (value) => JSON.parse(JSON.stringify(value));

class Game {
    constructor({ storage = null, now = () => Date.now() } = {}) {
        this.storage = storage;
        this.now = now;
        this.save = loadSave(storage);
        this.selectedDifficulty = this.save.progress.lastDifficulty;
        this.difficulty = this.selectedDifficulty;
        this.selectedLevel = this.progress.unlocked;
        this.runStats = createTotals();
        this.tracker = new LevelTracker();
        this.lastRecord = null;
        this.view = 'overview';
        this.state = 'title';
        this.events = [];
        this.particles = [];
        this.time = 0;
        this.score = 0;
        this.levelStartScore = 0;
        this.ship = new Spaceship();
        this.level = getLevel(1, this.difficulty);
        this.resetWorld();
    }

    // Progress ({unlocked, highScore, bestLevelScores}) of the difficulty shown on the title
    // screen, or of the difficulty being played.
    get progress() {
        const id = this.state === 'title' ? this.selectedDifficulty : this.difficulty;
        return this.save.progress.byDifficulty[id];
    }

    get difficultyLabel() {
        return getDifficulty(this.difficulty).label;
    }

    get selectedDifficultyLabel() {
        return getDifficulty(this.selectedDifficulty).label;
    }

    get levelStats() {
        return this.tracker.snapshot();
    }

    get combo() {
        return this.tracker.combo;
    }

    get comboTimer() {
        return this.tracker.comboTimer;
    }

    getProgress(difficulty = this.selectedDifficulty) {
        return clone(this.save.progress.byDifficulty[getDifficulty(difficulty).id]);
    }

    getLifetimeStats() {
        return clone(this.save.lifetime);
    }

    getRunStats() {
        return clone(this.runStats);
    }

    getWinRecords() {
        return clone(this.save.wins);
    }

    setDifficulty(id) {
        if (!isDifficulty(id)) throw new RangeError(`Unknown difficulty: ${id}`);
        this.selectedDifficulty = id;
        this.selectedLevel = this.save.progress.byDifficulty[id].unlocked;
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
        this.events.push({ ...data, type });
    }

    drainEvents() {
        const events = this.events;
        this.events = [];
        return events;
    }

    startCampaign(levelNumber = 1, difficulty = this.selectedDifficulty) {
        getLevel(levelNumber, difficulty);
        this.finishAttempt('abandoned');
        this.difficulty = getDifficulty(difficulty).id;
        this.selectedDifficulty = this.difficulty;
        this.save.progress.lastDifficulty = this.difficulty;
        this.score = 0;
        this.runStats = createTotals();
        this.runStats.campaignsStarted = 1;
        this.save.lifetime.campaignsStarted += 1;
        this.ship = this.createShip();
        this.startLevel(levelNumber);
        this.saveProgress();
    }

    createShip() {
        const ship = new Spaceship();
        ship.lives = getDifficulty(this.difficulty).lives;
        return ship;
    }

    startLevel(levelNumber) {
        const level = getLevel(levelNumber, this.difficulty);
        this.finishAttempt('abandoned');
        this.level = level;
        this.rng = createRng(this.level.seed);
        this.resetWorld();
        const layout = populateLevel(this.level, this.rng);
        this.asteroids = layout.asteroids;
        this.pickups = layout.pickups;
        this.tracker = new LevelTracker();
        this.tracker.spawned(this.asteroids.length);
        this.levelStartedAt = this.now();
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
        this.ship = this.createShip();
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
            case 'difficultyPrev':
            case 'difficultyNext':
                if (this.state === 'title') this.setDifficulty(stepDifficulty(this.selectedDifficulty, action === 'difficultyPrev' ? -1 : 1));
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
        this.finishAttempt('abandoned');
        this.saveProgress();
        this.state = 'title';
        this.selectedDifficulty = this.difficulty;
        this.selectedLevel = this.progress.unlocked;
    }

    // Folds the current level attempt into run and lifetime totals exactly once.
    finishAttempt(outcome) {
        const tracker = this.tracker;
        if (!tracker || tracker.finalized || this.levelStartedAt == null) return;
        if (outcome === 'abandoned' && this.levelTime <= 0) {
            tracker.finalized = true;
            return;
        }
        tracker.finalized = true;
        const stats = tracker.snapshot();
        const extra = { outcome, livesLost: tracker.livesLost, durationSec: this.levelTime };
        mergeTotals(this.runStats, stats, extra);
        mergeTotals(this.save.lifetime, stats, extra);
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
        this.tracker.tick(dt, ship, this.view);

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
        this.trackPassing();
        this.cleanup();

        if (this.state === 'playing' && this.scrollY >= this.level.length) this.completeLevel();
    }

    firePlayerWeapon() {
        const shot = fireWeapon(this.ship.weapon, this.ship, this.level.scrollSpeed);
        this.playerBullets.push(...shot.bullets);
        this.ship.cooldown = shot.cooldown;
        this.tracker.shot(this.ship.weapon.type, shot.bullets.length);
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
        this.tracker.enemyShot();
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
                if (!bullet.scored) {
                    bullet.scored = true;
                    this.tracker.hit();
                }
                if (asteroid.takeHit(bullet.damage)) {
                    spawned.push(...this.destroyAsteroid(asteroid, true, true));
                } else {
                    this.emit('hit', { x: asteroid.x, y: asteroid.y });
                }
                if (!bullet.pierce) break;
            }
        }
        this.asteroids.push(...spawned);
    }

    destroyAsteroid(asteroid, awardPoints = true, byPlayerShot = false) {
        asteroid.hp = 0;
        if (awardPoints) {
            const base = asteroid.shooter ? 150 : 50 + asteroid.maxHp * 25;
            this.score += Math.round(base * (1 + (this.level.number - 1) * 0.1) * this.scoreMultiplier);
        }
        this.tracker.destroyed(asteroid, byPlayerShot);
        this.spawnExplosion(asteroid.x, asteroid.y, asteroid.shooter ? '#ff8a5c' : '#d8d2c4', Math.round(asteroid.size));
        this.emit('explode', { x: asteroid.x, y: asteroid.y, size: asteroid.size, shooter: asteroid.shooter, combo: this.combo });
        const fragments = asteroid.breakApart(this.rng);
        this.tracker.spawned(fragments.length);
        return fragments;
    }

    get scoreMultiplier() {
        return this.level.scoreMultiplier ?? 1;
    }

    resolveShipHits() {
        const ship = this.ship;

        for (const bullet of this.enemyBullets) {
            if (!bullet.alive || !checkCollision(bullet, ship)) continue;
            bullet.life = 0;
            bullet.struckShip = true;
            this.damageShip(bullet.damage, bullet.x, bullet.y);
            if (this.state !== 'playing') return;
        }

        for (const asteroid of this.asteroids) {
            if (asteroid.hp <= 0 || !checkCollision(asteroid, ship)) continue;
            this.tracker.collision();
            const fragments = this.destroyAsteroid(asteroid, ship.shield > 0);
            this.asteroids.push(...fragments);
            this.damageShip((30 + asteroid.size) * (this.level.ramDamageMultiplier ?? 1), asteroid.x, asteroid.y);
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
            this.tracker.shieldBlock();
            this.emit('shieldHit', { x, y });
            return;
        }
        if (ship.invulnerable > 0) return;
        const before = ship.power;
        ship.power = Math.max(0, ship.power - amount);
        ship.invulnerable = 0.6;
        this.tracker.damaged(before - ship.power, x, y);
        this.emit('shipHit', { x, y, power: ship.power });
        if (ship.power <= 0) this.destroyShip();
    }

    destroyShip() {
        const ship = this.ship;
        ship.lives -= 1;
        this.tracker.lifeLost();
        this.state = 'dying';
        this.stateTimer = RESPAWN_TIME;
        this.spawnExplosion(ship.x, ship.y, '#7fd7ff', 40);
        this.emit('shipDestroyed', { x: ship.x, y: ship.y });
    }

    respawnOrEnd() {
        const ship = this.ship;
        if (ship.lives <= 0) {
            this.state = 'gameOver';
            this.finishAttempt('failed');
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
            ship.power = Math.min(ship.maxPower, ship.power + (this.level.powerRestore ?? 40));
        } else if (pickup.type === 'shield') {
            ship.shield = this.level.shieldTime ?? 7;
        } else {
            ship.weapon = applyWeaponPickup(ship.weapon, pickup.type);
        }
        this.tracker.pickup(pickup.type, pickup.x, pickup.y);
        this.score += Math.round(100 * this.scoreMultiplier);
        this.spawnExplosion(pickup.x, pickup.y, '#9effa8', 14);
        this.emit('pickup', { pickupType: pickup.type, x: pickup.x, y: pickup.y, weapon: { ...ship.weapon } });
    }

    completeLevel() {
        if (this.state !== 'playing' || this.tracker.finalized) return;
        this.levelBonus = Math.round((Math.round(this.ship.power) * 10 + this.level.number * 250) * this.scoreMultiplier);
        this.score += this.levelBonus;
        const levelScore = this.score - this.levelStartScore;
        const progress = this.save.progress.byDifficulty[this.difficulty];
        const key = String(this.level.number);
        progress.bestLevelScores[key] = Math.max(progress.bestLevelScores[key] || 0, levelScore);
        this.finishAttempt('cleared');
        const record = buildLevelRecord({
            level: { ...this.level, difficulty: this.difficulty, difficultyLabel: this.difficultyLabel },
            tracker: this.tracker,
            ship: this.ship,
            view: this.view,
            score: { total: this.score, level: levelScore - this.levelBonus, bonus: this.levelBonus },
            startedAt: this.levelStartedAt,
            completedAt: this.now(),
            durationSec: this.levelTime
        });
        this.lastRecord = record;
        this.save.wins.push(record);
        if (this.save.wins.length > MAX_WINS) this.save.wins.splice(0, this.save.wins.length - MAX_WINS);
        this.emit('levelRecord', { record: clone(record) });
        const next = this.level.number + 1;
        if (next > LEVEL_COUNT) {
            this.state = 'victory';
            this.runStats.victories += 1;
            this.save.lifetime.victories += 1;
            this.saveProgress();
            this.emit('victory');
            return;
        }
        progress.unlocked = Math.max(progress.unlocked, next);
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
        const progress = this.save.progress.byDifficulty[this.difficulty];
        progress.highScore = Math.max(progress.highScore, this.score);
        // Progress saving is optional; play continues without it.
        persistSave(this.storage, this.exportSave());
    }

    exportSave() {
        return clone({ ...this.save, savedAt: new Date(this.now()).toISOString() });
    }

    // Validates (throws Error with a player-facing message), replaces the save and persists it.
    importSave(obj) {
        const save = validateSave(obj);
        this.save = save;
        if (this.state === 'title') {
            this.selectedDifficulty = save.progress.lastDifficulty;
            this.difficulty = this.selectedDifficulty;
        }
        const unlocked = this.save.progress.byDifficulty[this.state === 'title' ? this.selectedDifficulty : this.difficulty].unlocked;
        this.selectedLevel = Math.min(Math.max(1, this.selectedLevel), unlocked);
        if (this.state === 'title') this.selectedLevel = unlocked;
        persistSave(this.storage, this.exportSave());
        return this.exportSave();
    }

    // Counts asteroids and pickups that slip behind the ship without being destroyed/collected,
    // and tracks how close each enemy bullet came.
    trackPassing() {
        const ship = this.ship;
        const behindLine = ship.y - ship.size;
        for (const asteroid of this.asteroids) {
            if (asteroid.missed || asteroid.hp <= 0 || asteroid.y + asteroid.size >= behindLine) continue;
            asteroid.missed = true;
            this.tracker.missed(asteroid.x, asteroid.y);
            this.emit('asteroidMissed', { x: asteroid.x, y: asteroid.y });
        }
        for (const pickup of this.pickups) {
            if (pickup.missed || pickup.collected || pickup.y + pickup.size >= behindLine) continue;
            pickup.missed = true;
            this.tracker.pickupMissed();
        }
        if (this.state !== 'playing') return;
        for (const bullet of this.enemyBullets) {
            if (!bullet.alive) continue;
            const gap = Math.hypot(bullet.x - ship.x, bullet.y - ship.y) - bullet.size - ship.size;
            if (bullet.nearest === undefined || gap < bullet.nearest) bullet.nearest = gap;
        }
    }

    cleanup() {
        const behind = this.scrollY - 150;
        const ahead = this.scrollY + this.level.length + 2000;
        this.asteroids = this.asteroids.filter((a) => a.hp > 0 && a.y > behind);
        this.pickups = this.pickups.filter((p) => !p.collected && p.y > behind);
        const inWorld = (b) => b.alive && b.y > behind && b.y < ahead && b.x > -50 && b.x < 850;
        this.playerBullets = this.playerBullets.filter(inWorld);
        this.enemyBullets = this.enemyBullets.filter((bullet) => {
            if (inWorld(bullet)) return true;
            if (!bullet.struckShip) this.tracker.dodged(bullet.nearest);
            return false;
        });
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
Game.LEGACY_STORAGE_KEY = LEGACY_STORAGE_KEY;
Game.DIFFICULTIES = DIFFICULTY_IDS;

module.exports = Game;
