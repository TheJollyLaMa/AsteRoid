const checkCollision = require('./collision');
const Spaceship = require('./spaceship');
const Bullet = require('./bullet');
const { createRng, range } = require('./rng');
const { getLevel, LEVEL_COUNT, TOTAL_LEVEL_COUNT } = require('./levels');
const { populateLevel } = require('./levelLayout');
const { WEAPONS, applyWeaponPickup, downgradeWeapon, fireWeapon } = require('./weapons');
const { DIFFICULTY_IDS, isDifficulty, getDifficulty, stepDifficulty } = require('./difficulty');
const { LevelTracker, createTotals, mergeTotals, buildLevelRecord } = require('./stats');
const inputLog = require('./inputlog');
const RULESET = require('./ruleset');
const { scaleForPlayers, createPlayerStats, awardScore, canEndLevel } = require('./multiplayer');
const { chooseVaultLevel, createVault, markGuardDestroyed } = require('./vault');
const { COLLECTION, MARATHON_PRIZE, PERFECT_PRIZES, PILOT_BONUS } = require('./prizes');
const {
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    MAX_WINS,
    loadSave,
    mergeStoredSave,
    persistSave,
    validateSave
} = require('./save');

const ACTIVATION_DISTANCE = 900;
const FIRE_RANGE = { min: 80, max: 700 };
const LEVEL_INTRO_TIME = 2.5;
const LEVEL_COMPLETE_TIME = 3.5;
const RESPAWN_TIME = 1.8;
const FIXED_STEP = 1 / 60;
const WARP_TIME = 2.2;
const MAX_PARTICLES = 256;

const clone = (value) => JSON.parse(JSON.stringify(value));

function defaultSeedSource() {
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
        const value = new Uint32Array(1);
        globalThis.crypto.getRandomValues(value);
        return value[0];
    }
    return Math.floor(Math.random() * 0x100000000) >>> 0;
}

class Game {
    constructor({ storage = null, now = () => Date.now(), seed = null, seedSource = defaultSeedSource, idFn } = {}) {
        this.storage = storage;
        this.now = now;
        if (typeof seedSource !== 'function') throw new TypeError('seedSource must be a function.');
        this.seedSource = seedSource;
        this.initialSeed = Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed >>> 0 : null;
        this.seed = this.initialSeed ?? 0;
        this.initialSeedPending = this.initialSeed !== null;
        this.nextRunSeed = null;
        this.nextRunTicket = null;
        this.runTicket = null;
        this.idCounter = 0;
        this.idFn = idFn || (() => `${this.seed.toString(36)}${(++this.idCounter).toString(36).padStart(4, '0')}`);
        this.accumulator = 0;
        this.simTime = 0;
        this.runElapsed = 0;
        this.runStartedAt = null;
        this.runFrames = [];
        this.runCaptures = [];
        this.runRecords = [];
        this.vaultTiersSpawned = [];
        this.pilot = { address: null, isPilot: false };
        this.playerCount = 1;
        this.mode = 'coop';
        this.playerStats = createPlayerStats(1);
        this.ships = [];
        this.sector2Level = null;
        this.save = loadSave(storage);
        this.selectedDifficulty = this.save.progress.lastDifficulty;
        this.difficulty = this.selectedDifficulty;
        this.selectedLevel = 1;
        this.runStats = createTotals();
        this.tracker = new LevelTracker();
        this.lastRecord = null;
        this.view = 'overview';
        this.state = 'title';
        this.events = [];
        this.particles = [];
        this.cosmeticRng = createRng((this.seed ^ 0x9e3779b9) >>> 0);
        this.time = 0;
        this.score = 0;
        this.levelStartScore = 0;
        this.ship = new Spaceship();
        this.ships = [this.ship];
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
        this.selectedLevel = 1;
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

    setNextRunSeed(seed, ticket) {
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Run seed must be an unsigned 32-bit integer.');
        this.nextRunSeed = seed >>> 0;
        this.nextRunTicket = ticket === undefined ? null : clone(ticket);
    }

    startCampaign(levelNumber = 1, difficulty = this.selectedDifficulty, seed) {
        getLevel(levelNumber, difficulty);
        const difficultyId = getDifficulty(difficulty).id;
        if (levelNumber > LEVEL_COUNT && (difficultyId === 'cadet' || !this.pilot.isPilot || !this.save.progress.byDifficulty[difficultyId].sector2Unlocked)) throw new Error('Sector II is locked for this difficulty or pilot.');
        this.finishAttempt('abandoned');
        this.difficulty = difficultyId;
        this.selectedDifficulty = this.difficulty;
        this.save.progress.lastDifficulty = this.difficulty;
        if (seed !== undefined) {
            if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Run seed must be an unsigned 32-bit integer.');
            this.seed = seed >>> 0;
            this.runTicket = null;
            this.nextRunSeed = null;
            this.nextRunTicket = null;
            this.initialSeedPending = false;
        } else if (this.nextRunSeed !== null) {
            this.seed = this.nextRunSeed;
            this.runTicket = this.nextRunTicket;
            this.nextRunSeed = null;
            this.nextRunTicket = null;
            this.initialSeedPending = false;
        } else if (this.initialSeedPending) {
            this.seed = this.initialSeed;
            this.runTicket = null;
            this.initialSeedPending = false;
        } else {
            const generatedSeed = this.seedSource();
            if (!Number.isInteger(generatedSeed) || generatedSeed < 0 || generatedSeed > 0xffffffff) throw new RangeError('seedSource must return an unsigned 32-bit integer.');
            this.seed = generatedSeed >>> 0;
            this.runTicket = null;
        }
        this.runStartedAt = this.now();
        this.runElapsed = 0;
        this.idCounter = 0;
        this.runId = `${this.seed.toString(16)}-${this.runStartedAt.toString(36)}`;
        this.runStartLevel = levelNumber;
        this.runFrames = [];
        this.runCaptures = [];
        this.runRecords = [];
        this.vaultTiersSpawned = [];
        this.sector2Level = null;
        this.score = 0;
        this.runStats = createTotals();
        this.runStats.campaignsStarted = 1;
        this.save.lifetime.campaignsStarted += 1;
        this.ship = this.createShip();
        this.ships = [this.ship];
        this.playerStats = createPlayerStats(this.playerCount);
        if (this.playerCount > 1) this.setPlayers(this.playerCount, { mode: this.mode });
        if (this.difficulty !== 'cadet' && this.pilot.isPilot) {
            const spawnRng = createRng((this.seed ^ 0xa53c9e17) >>> 0);
            this.sector2Level = levelNumber <= 10 ? chooseVaultLevel(1, spawnRng) : null;
            this.sector2VaultLevel = chooseVaultLevel(2, spawnRng);
        }
        this.cosmeticRng = createRng((this.seed ^ 0x9e3779b9) >>> 0);
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
        this.level = { ...level };
        if (!this.runStartLevel) this.runStartLevel = levelNumber;
        this.rng = createRng((this.seed ^ Math.imul(levelNumber, 0x9e3779b1)) >>> 0);
        this.resetWorld();
        const layout = populateLevel(this.level, createRng(this.level.seed));
        this.asteroids = layout.asteroids;
        this.pickups = layout.pickups;
        this.tracker = new LevelTracker();
        this.tracker.spawned(this.asteroids.length);
        this.levelStartedAt = this.recordNow();
        const { lives, weapon } = this.ship;
        this.ship.reset();
        this.ship.lives = lives;
        this.ship.weapon = weapon;
        this.ship.y = this.ship.offset;
        this.ship.invulnerable = LEVEL_INTRO_TIME;
        for (let i = 1; i < this.ships.length; i++) {
            const current = this.ships[i];
            const savedLives = current.lives; const savedWeapon = current.weapon;
            current.reset(); current.lives = savedLives; current.weapon = savedWeapon;
            current.scale = scaleForPlayers(this.playerCount); current.size = current.baseSize * current.scale;
            current.x = 400 + (i - (this.playerCount - 1) / 2) * Math.min(42, 320 / this.playerCount);
            current.y = current.offset; current.invulnerable = LEVEL_INTRO_TIME;
        }
        this.levelStartScore = this.score;
        this.particles = [];
        this.vault = null;
        if (this.difficulty !== 'cadet' && this.pilot.isPilot) {
            const tier = this.sector2Level === levelNumber ? 1 : this.sector2VaultLevel === levelNumber ? 2 : 0;
            const eligible = tier > 0 && !this.vaultTiersSpawned.includes(tier);
            if (eligible) {
                const vaultRng = createRng((this.seed ^ (tier === 1 ? 0x7f4a7c15 : 0x94d049bb)) >>> 0);
                this.vault = createVault(tier, levelNumber, vaultRng);
                this.vaultTiersSpawned.push(tier);
                this.asteroids = this.asteroids.filter((rock) => Math.hypot(rock.x - this.vault.x, rock.y - this.vault.y) > 260);
                this.asteroids.push(...this.vault.guards);
                this.tracker.spawned(this.vault.guards.length);
                this.vault.spawned = true;
                this.emit('vaultSpawned', { tier, x: this.vault.x, y: this.vault.y });
            }
        }
        this.state = 'playing';
        this.emit('levelStart', { level: levelNumber });
    }

    retryLevel() {
        this.startCampaign(1, this.difficulty);
    }

    setPilot({ address = null, isPilot = false } = {}) {
        this.pilot = { address, isPilot: Boolean(isPilot && address) };
        return { ...this.pilot };
    }

    setPlayers(count, { mode = 'coop' } = {}) {
        if (!['coop', 'versus'].includes(mode)) throw new RangeError(`Unknown multiplayer mode: ${mode}`);
        const scale = scaleForPlayers(count);
        this.playerCount = count;
        this.mode = mode;
        const previous = this.ships || [this.ship];
        const previousCount = previous.length;
        this.ships = Array.from({ length: count }, (_, index) => {
            const ship = index < previous.length ? previous[index] : this.createShip();
            ship.scale = scale;
            ship.size = ship.baseSize * scale;
            ship.x = 400 + (index - (count - 1) / 2) * Math.min(42, 320 / count);
            ship.y = this.scrollY + ship.offset;
            return ship;
        });
        this.ship = this.ships[0];
        this.playerStats = createPlayerStats(count);
        for (let index = previousCount; index < count; index++) this.emit('playerJoined', { index, mode });
        for (let index = count; index < previousCount; index++) this.emit('playerLeft', { index });
        return this.ships;
    }

    getRunLog() {
        return { runId: this.runId || `${this.seed.toString(16)}-unstarted`, ruleset: RULESET, seed: this.seed, difficulty: this.difficulty, startLevel: this.runStartLevel || 1, players: this.playerCount, mode: this.mode, pilot: { ...this.pilot }, ticket: this.runTicket == null ? null : clone(this.runTicket), frames: inputLog.encode(this.runFrames), startedAt: this.runStartedAt == null ? null : new Date(this.runStartedAt).toISOString(), version: 1 };
    }

    serialize() {
        const plain = (value) => JSON.parse(JSON.stringify(value));
        return plain({ version: 1, seed: this.seed, state: this.state, difficulty: this.difficulty, level: this.level, scrollY: this.scrollY, time: this.time, score: this.score, view: this.view, ship: this.ship, ships: this.ships, stateTimer: this.stateTimer, levelTime: this.levelTime, asteroids: this.asteroids, pickups: this.pickups, playerBullets: this.playerBullets.map((b) => ({ ...b, hits: b.hits ? [...b.hits] : null })), enemyBullets: this.enemyBullets, vault: this.vault ?? null, runCaptures: this.runCaptures, playerStats: this.playerStats, mode: this.mode });
    }

    applySnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.version !== 1) throw new TypeError('Invalid game snapshot.');
        const fields = ['seed', 'state', 'difficulty', 'level', 'scrollY', 'time', 'score', 'view', 'stateTimer', 'levelTime', 'asteroids', 'pickups', 'enemyBullets', 'runCaptures', 'playerStats', 'mode'];
        for (const key of fields) {
            if (snapshot[key] !== undefined && snapshot[key] !== null) this[key] = clone(snapshot[key]);
        }
        this.vault = snapshot.vault == null ? null : clone(snapshot.vault);
        this.asteroids = this.asteroids || [];
        this.pickups = this.pickups || [];
        this.enemyBullets = this.enemyBullets || [];
        this.runCaptures = this.runCaptures || [];
        const snapshotShips = Array.isArray(snapshot.ships) ? snapshot.ships : snapshot.ship ? [snapshot.ship] : null;
        if (snapshotShips && snapshotShips.length) this.ships = clone(snapshotShips);
        if (!this.ships || !this.ships.length) this.ships = [this.ship];
        this.ship = this.ships[0];
        this.playerCount = this.ships.length;
        this.playerStats = this.playerStats || createPlayerStats(this.playerCount);
        this.playerBullets = (Array.isArray(snapshot.playerBullets) ? snapshot.playerBullets : []).map((bullet) => Object.assign(new Bullet(bullet), bullet, { hits: bullet.hits ? new Set(bullet.hits) : null }));
        return this;
    }

    static fromSnapshot(snapshot) { return new Game().applySnapshot(snapshot); }

    static replay({ seed = 0, difficulty = 'cadet', startLevel = 1, players = 1, pilot = null, frames = [], runId = null, startedAt = null, mode: replayMode = 'coop' } = {}) {
        const baseTime = startedAt ? Date.parse(startedAt) : Date.UTC(2020, 0, 1);
        if (!Number.isFinite(baseTime)) throw new TypeError('Replay start time is invalid.');
        const game = new Game({ seed, now: () => baseTime });
        if (pilot) game.setPilot(pilot);
        const playerCount = typeof players === 'number' ? players : Array.isArray(players) ? players.length : (players.count || 1);
        const mode = typeof players === 'object' && players.mode ? players.mode : replayMode;
        if (playerCount > 1) game.setPlayers(playerCount, { mode });
        game.startCampaign(startLevel, difficulty, seed);
        if (runId) game.runId = runId;
        const expanded = inputLog.decode(frames);
        for (const inputs of expanded) game.step(inputs);
        return game.summary();
    }

    recordNow() { return this.runStartedAt == null ? this.now() : this.runStartedAt + this.runElapsed * 1000; }

    summary() {
        return { runId: this.runId, seed: this.seed, difficulty: this.difficulty, state: this.state, level: this.level.number, score: this.score, records: clone(this.runRecords), captures: clone(this.runCaptures), survivors: this.ships.filter((ship) => ship.lives > 0).length, ships: this.ships.map((ship) => ({ x: ship.x, y: ship.y, power: ship.power, lives: ship.lives, weapon: { ...ship.weapon } })), playerStats: clone(this.playerStats), runStats: clone(this.runStats) };
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
                break;
            case 'difficultyPrev':
            case 'difficultyNext':
                if (this.state === 'title') this.setDifficulty(stepDifficulty(this.selectedDifficulty, action === 'difficultyPrev' ? -1 : 1));
                break;
            case 'confirm':
                if (this.state === 'title') this.startCampaign(1);
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
        this.selectedLevel = 1;
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
        if (!Number.isFinite(dt) || dt < 0) return;
        this.accumulator += dt;
        const inputs = Array.isArray(input) ? input : [input];
        while (this.accumulator + 1e-3 >= FIXED_STEP) {
            this.accumulator = Math.max(0, this.accumulator - FIXED_STEP);
            this.step(inputs);
        }
    }

    step(inputs = []) {
        if (!['playing', 'dying', 'levelComplete', 'warping'].includes(this.state)) {
            this.time += FIXED_STEP;
            this.updateParticles(FIXED_STEP);
            return this;
        }
        const frame = Array.from({ length: this.playerCount }, (_, index) =>
            inputLog.decodeInput(inputLog.encodeInput(inputs[index] || {})));
        this.runFrames.push(frame.map((input) => ({ ...input })));
        this.time += FIXED_STEP;
        this.simTime += FIXED_STEP;
        if (this.runId) this.runElapsed += FIXED_STEP;
        this._fixedUpdate(FIXED_STEP, frame);
        return this;
    }

    _fixedUpdate(dt, inputs = []) {
        const input = inputs[0] || {};
        this.updateParticles(dt);
        if (this.state === 'warping') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                this.emit('warpEnd', { level: 11 });
                this.startLevel(11);
            }
            return;
        }
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
            for (let index = 0; index < this.ships.length; index++) {
                const current = this.ships[index];
                const controls = inputs[index] || {};
                if (current.lives <= 0) continue;
                if (current.respawnTimer > 0) {
                    current.respawnTimer = Math.max(0, current.respawnTimer - dt);
                    if (current.respawnTimer === 0) { current.power = current.maxPower; current.invulnerable = 2.5; this.emit('respawn', { player: index }); }
                    continue;
                }
                current.update(dt, controls, this.scrollY);
                this.updatePlayerFire(current, controls, index, dt);
            }
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

        if (this.state === 'playing') {
            if (this.playerCount === 1 && this.scrollY >= this.level.length) this.completeLevel();
            else if (this.playerCount > 1) {
                const gatePlayers = this.ships.map((ship, index) => {
                    const reachedGate = ship.lives > 0 && ship.y >= this.level.length;
                    if (this.playerStats[index]) this.playerStats[index].reachedGate = reachedGate;
                    return { alive: ship.lives > 0, reachedGate };
                });
                if (canEndLevel(gatePlayers, this.mode)) this.completeLevel();
            }
        }
    }

    updatePlayerFire(ship, input, playerIndex, dt) {
        if (input.weaponNext && !ship.weaponNextWasDown) {
            ship.weaponTiers = ship.weaponTiers || {};
            ship.weaponTiers[ship.weapon.type] = ship.weapon.tier;
            const types = Object.keys(WEAPONS).filter((type) =>
                this.level.number > LEVEL_COUNT || !['prism', 'singularity'].includes(type));
            const type = types[(types.indexOf(ship.weapon.type) + 1) % types.length];
            ship.weapon = { type, tier: ship.weaponTiers[type] || 1 };
            ship.cooldown = 0;
            ship.charge = 0;
            ship.wasFiring = false;
            ship.suppressChargeUntilRelease = false;
            this.emit('weaponChanged', { player: playerIndex, weapon: { ...ship.weapon } });
        }
        ship.weaponNextWasDown = Boolean(input.weaponNext);
        const charged = ['nova', 'singularity'].includes(ship.weapon.type);
        // B/LT special force-releases an active charge; otherwise it grants a brief shield (8s cooldown).
        const specialPressed = Boolean(input.special && !ship.specialWasDown);
        ship.specialWasDown = Boolean(input.special);
        if (specialPressed && charged && ship.charge > 0) {
            const charge = ship.charge;
            this.emit('chargeRelease', { player: playerIndex, charge, weapon: ship.weapon.type, forced: true });
            this.firePlayerWeapon(ship, playerIndex, charge);
            ship.charge = 0;
            ship.wasFiring = false;
            ship.suppressChargeUntilRelease = Boolean(input.fire);
        } else if (specialPressed && ship.specialCooldown <= 0) {
            ship.shield = Math.max(ship.shield, 2);
            ship.specialCooldown = 8;
            this.emit('specialUsed', { player: playerIndex, type: 'shield', duration: 2 });
        }
        if (ship.specialCooldown > 0) ship.specialCooldown = Math.max(0, ship.specialCooldown - dt);
        const suppressedCharge = Boolean(ship.suppressChargeUntilRelease);
        if (suppressedCharge) {
            if (!input.fire) { ship.suppressChargeUntilRelease = false; ship.wasFiring = false; }
            else ship.wasFiring = true;
        } else if (charged) {
            const maxCharge = 1.2 / (1 + (ship.weapon.tier - 1) * 0.2);
            if (input.fire) {
                if (!ship.wasFiring) this.emit('chargeStart', { player: playerIndex, weapon: ship.weapon.type });
                ship.charge = Math.min(1, ship.charge + dt / maxCharge);
            } else if (ship.wasFiring) {
                this.emit('chargeRelease', { player: playerIndex, charge: ship.charge, weapon: ship.weapon.type });
                this.firePlayerWeapon(ship, playerIndex, ship.charge);
                ship.charge = 0;
            }
            ship.wasFiring = Boolean(input.fire);
        } else if (input.fire && ship.cooldown <= 0) this.firePlayerWeapon(ship, playerIndex);
    }

    firePlayerWeapon(ship = this.ship, playerIndex = 0, charge = 0) {
        const shot = fireWeapon(ship.weapon, ship, this.level.scrollSpeed, charge);
        for (const bullet of shot.bullets) { bullet.playerIndex = playerIndex; bullet.ownerWeapon = ship.weapon.type; }
        this.playerBullets.push(...shot.bullets);
        ship.cooldown = shot.cooldown;
        this.tracker.shot(ship.weapon.type, shot.bullets.length);
        this.playerStats[playerIndex].shotsFired += shot.bullets.length;
        this.emit('shot', { weapon: ship.weapon.type, player: playerIndex, charge });
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
                asteroid.fireCooldown = this.level.fireInterval * range(this.rng, asteroid.vaultGuard ? 3.1 : 0.7, asteroid.vaultGuard ? 4.2 : 1.3);
            }
        }
    }

    fireEnemyBullet(asteroid) {
        const ship = this.ship;
        const aimError = this.level.aimError + (asteroid.vaultGuard ? 0.38 : 0);
        const angle = Math.atan2(ship.x - asteroid.x, ship.y - asteroid.y) + range(this.rng, -1, 1) * aimError;
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
        const buckets = new Map();
        let maxSize = 0;
        this.asteroids.forEach((rock, index) => {
            if (rock.hp <= 0) return;
            maxSize = Math.max(maxSize, rock.size);
            const cell = Math.floor(rock.y / 128);
            if (!buckets.has(cell)) buckets.set(cell, []);
            buckets.get(cell).push(index);
        });
        const candidates = (bullet, radius) => {
            const indices = [];
            const first = Math.floor((bullet.y - radius) / 128);
            const last = Math.floor((bullet.y + radius) / 128);
            for (let cell = first; cell <= last; cell++) {
                if (buckets.has(cell)) indices.push(...buckets.get(cell));
            }
            // Preserve first-hit and piercing order from the deterministic world array.
            return indices.sort((a, b) => a - b);
        };
        for (const bullet of this.playerBullets) {
            if (!bullet.alive) continue;
            if (bullet.ownerWeapon === 'singularity') {
                for (const index of candidates(bullet, 220)) {
                    const rock = this.asteroids[index];
                    if (rock.hp <= 0) continue;
                    const dx = bullet.x - rock.x; const dy = bullet.y - rock.y; const distance = Math.hypot(dx, dy);
                    if (distance > 220 || distance === 0) continue;
                    const pull = (220 - distance) * 0.18; rock.vx += dx / distance * pull * FIXED_STEP; rock.vy += dy / distance * pull * FIXED_STEP;
                }
            }
            for (const index of candidates(bullet, (bullet.size || 0) + (bullet.radius || 0) + maxSize)) {
                const asteroid = this.asteroids[index];
                if (asteroid.hp <= 0 || asteroid.phaseActive || (bullet.hits && bullet.hits.has(asteroid.id))) continue;
                if (!checkCollision(bullet, asteroid)) continue;
                if (bullet.hits) bullet.hits.add(asteroid.id);
                else bullet.life = 0;
                if (!bullet.scored) {
                    bullet.scored = true;
                    this.tracker.hit();
                    const player = this.playerStats[bullet.playerIndex || 0];
                    if (player) player.hits += 1;
                }
                if (asteroid.takeHit(bullet.damage)) {
                    asteroid.lastPlayerIndex = bullet.playerIndex || 0;
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
        if (asteroid.vaultGuard && markGuardDestroyed(this.vault, asteroid)) this.emit('guardDestroyed', { tier: asteroid.vaultTier, kind: asteroid.kind, x: asteroid.x, y: asteroid.y });
        if (awardPoints) {
            const base = asteroid.shooter ? 150 : 50 + asteroid.maxHp * 25;
            const points = Math.round(base * (1 + (this.level.number - 1) * 0.1) * this.scoreMultiplier);
            const scorerIndex = asteroid.lastPlayerIndex || 0;
            const scorer = this.playerStats[scorerIndex];
            if (scorer) { scorer.kills += 1; if (this.mode === 'versus') scorer.score += points; }
            if (this.mode === 'coop') { this.score += points; awardScore(this.playerStats, scorerIndex, points, 'coop'); }
            else if (scorerIndex === 0) this.score = scorer.score;
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
        const ships = this.ships;
        for (let index = 0; index < ships.length; index++) {
            const ship = ships[index];
            if (ship.lives <= 0) continue;
            for (const bullet of this.enemyBullets) {
                if (!bullet.alive || !checkCollision(bullet, ship)) continue;
                bullet.life = 0;
                bullet.struckShip = true;
                this.damageShip(bullet.damage, bullet.x, bullet.y, ship, index);
                if (this.playerCount === 1 && this.state !== 'playing') return;
            }
            for (const asteroid of this.asteroids) {
                if (asteroid.hp <= 0 || asteroid.phaseActive || !checkCollision(asteroid, ship)) continue;
                this.tracker.collision();
                const fragments = this.destroyAsteroid(asteroid, ship.shield > 0);
                this.asteroids.push(...fragments);
                this.damageShip((30 + asteroid.size) * (this.level.ramDamageMultiplier ?? 1), asteroid.x, asteroid.y, ship, index);
                if (this.playerCount === 1 && this.state !== 'playing') return;
            }
            for (const pickup of this.pickups) {
                if (pickup.collected || !checkCollision(pickup, ship)) continue;
                pickup.collected = true;
                this.collectPickup(pickup, ship, index);
            }
            if (this.vault && !this.vault.captured && !this.vault.shielded && checkCollision(this.vault, ship)) this.captureVault(index);
        }
        if (this.playerCount > 1 && this.ships.every((ship) => ship.lives <= 0)) {
            this.state = 'gameOver'; this.finishAttempt('failed'); this.emit('gameOver');
        }
    }

    captureVault(playerIndex = 0) {
        if (!this.vault || this.vault.captured || this.vault.shielded) return false;
        this.vault.captured = true;
        const capture = { tier: this.vault.tier, prize: { ...this.vault.prize }, level: this.level.number, at: new Date(this.recordNow()).toISOString() };
        this.runCaptures.push(capture);
        for (const ship of this.ships) ship.power = ship.maxPower;
        this.emit('supporterCaptured', { ...capture, player: playerIndex });
        if (capture.tier === 1) {
            this.save.progress.byDifficulty[this.difficulty].sector2Unlocked = true;
            this.save.progress.byDifficulty[this.difficulty].unlocked = Math.max(this.save.progress.byDifficulty[this.difficulty].unlocked, 11);
            this.emit('sectorUnlocked', { sector: 2, difficulty: this.difficulty });
            this.saveProgress();
        }
        return true;
    }

    damageShip(amount, x, y, targetShip = this.ship, playerIndex = 0) {
        const ship = targetShip;
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
        if (ship.power <= 0) this.destroyShip(ship, playerIndex);
    }

    destroyShip(ship = this.ship, playerIndex = 0) {
        const shipIndex = this.ships.indexOf(ship);
        if (this.playerCount > 1) {
            ship.lives -= 1; ship.power = 0; ship.respawnTimer = ship.lives > 0 ? RESPAWN_TIME : 0;
            if (this.playerStats[shipIndex]) { this.playerStats[shipIndex].livesLost += 1; this.playerStats[shipIndex].alive = ship.lives > 0; }
            this.emit('playerDied', { index: shipIndex, lives: ship.lives });
            if (this.ships.every((entry) => entry.lives <= 0)) { this.state = 'gameOver'; this.finishAttempt('failed'); this.emit('gameOver'); }
            return;
        }
        ship.lives -= 1;
        this.tracker.lifeLost();
        if (this.playerStats[playerIndex]) this.playerStats[playerIndex].livesLost += 1;
        this.emit('playerDied', { index: playerIndex, lives: ship.lives });
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
        ship.weaponTiers = ship.weaponTiers || {};
        const previousWeapon = ship.weapon.type;
        ship.weapon = downgradeWeapon(ship.weapon);
        delete ship.weaponTiers[previousWeapon];
        ship.weaponTiers[ship.weapon.type] = ship.weapon.tier;
        ship.invulnerable = 2.5;
        ship.x = 400;
        ship.offset = 90;
        ship.y = this.scrollY + ship.offset;
        this.enemyBullets = this.enemyBullets.filter((bullet) => Math.abs(bullet.y - ship.y) > 300);
        this.state = 'playing';
        this.emit('respawn');
    }

    collectPickup(pickup, targetShip = this.ship, playerIndex = 0) {
        const ship = targetShip;
        if (pickup.type === 'power') {
            ship.power = Math.min(ship.maxPower, ship.power + (this.level.powerRestore ?? 40));
        } else if (pickup.type === 'life') {
            ship.lives += 1;
        } else if (pickup.type === 'shield') {
            ship.shield = this.level.shieldTime ?? 7;
        } else {
            ship.weapon = applyWeaponPickup(ship.weapon, pickup.type);
            ship.weaponTiers = ship.weaponTiers || {};
            ship.weaponTiers[ship.weapon.type] = ship.weapon.tier;
        }
        this.tracker.pickup(pickup.type, pickup.x, pickup.y);
        if (this.playerStats[playerIndex]) this.playerStats[playerIndex].pickups = (this.playerStats[playerIndex].pickups || 0) + 1;
        const pickupPoints = Math.round(100 * this.scoreMultiplier);
        if (this.mode === 'versus') {
            if (this.playerStats[playerIndex]) this.playerStats[playerIndex].score += pickupPoints;
            if (playerIndex === 0) this.score = this.playerStats[0].score;
        } else {
            this.score += pickupPoints; awardScore(this.playerStats, playerIndex, pickupPoints, 'coop');
        }
        this.spawnExplosion(pickup.x, pickup.y, '#9effa8', 14);
        this.emit('pickup', { pickupType: pickup.type, x: pickup.x, y: pickup.y, player: playerIndex, lives: ship.lives, weapon: { ...ship.weapon } });
    }

    completeLevel() {
        if (this.state !== 'playing' || this.tracker.finalized) return;
        this.levelBonus = Math.round((Math.round(this.ship.power) * 10 + this.level.number * 250) * this.scoreMultiplier);
        if (this.mode === 'versus') {
            for (const player of this.playerStats) if (player.alive) player.score += this.levelBonus;
            this.score = this.playerStats[0] ? this.playerStats[0].score : 0;
        } else { this.score += this.levelBonus; awardScore(this.playerStats, 0, this.levelBonus, 'coop'); }
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
            completedAt: this.recordNow(),
            durationSec: this.levelTime,
            captures: this.runCaptures.filter((capture) => capture.level === this.level.number),
            idFn: this.idFn
        });
        const marathon = this.playerCount === 1 && this.level.number === TOTAL_LEVEL_COUNT && this.difficulty !== 'cadet' &&
            this.pilot.isPilot && this.runStartLevel === 1 && this.runRecords.length === TOTAL_LEVEL_COUNT - 1 &&
            this.runRecords.every((entry, index) => entry.level === index + 1 && entry.difficulty === this.difficulty);
        if (marathon) {
            const awards = [];
            if (this.difficulty === 'ace') awards.push({
                kind: 'marathon-completion', tier: 2, level: TOTAL_LEVEL_COUNT,
                at: record.completedAt, prize: { ...MARATHON_PRIZE, nftContract: COLLECTION }
            });
            const perfect = this.runStats.livesLost === 0 &&
                [1, 2].every((tier) => this.runCaptures.some((capture) => capture.tier === tier && !capture.kind));
            if (perfect) awards.push({
                kind: `perfect-${this.difficulty}`, tier: 2, level: TOTAL_LEVEL_COUNT,
                at: record.completedAt, prize: { ...PERFECT_PRIZES[this.difficulty], nftContract: COLLECTION },
                ...(this.difficulty === 'pilot' ? { bonus: { ...PILOT_BONUS } } : {})
            });
            this.runCaptures.push(...awards);
            record.marathon = {
                schema: 'voyager-marathon/1', runId: this.runId, seed: this.seed,
                startLevel: 1, finalLevel: TOTAL_LEVEL_COUNT, difficulty: this.difficulty, perfect,
                startedAt: new Date(this.runStartedAt).toISOString(), completedAt: record.completedAt,
                totals: { ...clone(this.runStats), victories: this.runStats.victories + 1 },
                levels: [...this.runRecords, record].map((entry) => ({
                    recordId: entry.id, level: entry.level, startedAt: entry.startedAt,
                    completedAt: entry.completedAt, durationSec: entry.durationSec,
                    score: clone(entry.score), ship: clone(entry.ship), stats: clone(entry.stats)
                })),
                awards: this.runCaptures.map((capture) => ({
                    kind: capture.kind || 'guarded-pickup', level: capture.level, tier: capture.tier,
                    earnedAt: capture.at, chainId: 8453, nftContract: COLLECTION,
                    tokenId: String(capture.prize.tokenId), project: capture.prize.project,
                    metadataURI: capture.prize.metadataURI, quantity: 1,
                    ...(capture.bonus ? { bonus: clone(capture.bonus) } : {}),
                    status: 'earned-awaiting-referee-and-funded-claim'
                }))
            };
            for (const award of awards) this.emit('supporterCaptured', { ...clone(award), player: 0 });
        }
        this.lastRecord = record;
        this.runRecords.push(clone(record));
        this.save.wins.push(record);
        if (this.save.wins.length > MAX_WINS) this.save.wins.splice(0, this.save.wins.length - MAX_WINS);
        this.emit('levelRecord', { record: clone(record) });
        const next = this.level.number + 1;
        if (next > TOTAL_LEVEL_COUNT || (this.level.number === LEVEL_COUNT && !progress.sector2Unlocked)) {
            this.state = 'victory';
            this.runStats.victories += 1;
            this.save.lifetime.victories += 1;
            this.saveProgress();
            this.emit('victory');
            return;
        }
        if (next <= LEVEL_COUNT || progress.sector2Unlocked) progress.unlocked = Math.max(progress.unlocked, next);
        this.saveProgress();
        if (this.level.number === LEVEL_COUNT && progress.sector2Unlocked && this.difficulty !== 'cadet' && this.pilot.isPilot) {
            this.state = 'warping';
            this.stateTimer = WARP_TIME;
            this.emit('warpStart', { from: 10, to: 11 });
        } else {
            this.state = 'levelComplete';
            this.stateTimer = LEVEL_COMPLETE_TIME;
            this.emit('levelComplete', { level: this.level.number });
        }
    }

    advanceLevel() {
        if (this.state !== 'levelComplete') return;
        const ship = this.ship;
        for (const current of this.ships) current.power = current.maxPower;
        this.startLevel(this.level.number + 1);
    }

    saveProgress() {
        const progress = this.save.progress.byDifficulty[this.difficulty];
        progress.highScore = Math.max(progress.highScore, this.score);
        // Keep progress written by other tabs/builds instead of overwriting it.
        this.save = mergeStoredSave(this.storage, this.save);
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
        if (this.state === 'title') this.selectedLevel = 1;
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
        const available = Math.min(count, MAX_PARTICLES - this.particles.length);
        for (let i = 0; i < available; i++) {
            const angle = this.cosmeticRng() * Math.PI * 2;
            const speed = 30 + this.cosmeticRng() * 140;
            const life = 0.4 + this.cosmeticRng() * 0.6;
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
Game.FIXED_STEP = FIXED_STEP;
Game.MAX_PARTICLES = MAX_PARTICLES;
Game.groupPlayers = require('./multiplayer').groupPlayers;

module.exports = Game;
