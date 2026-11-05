const test = require('node:test');
const assert = require('node:assert/strict');

const Game = require('../src/js/game');
const {
    SAVE_APP, SAVE_VERSION, STORAGE_KEY, LEGACY_STORAGE_KEY, BACKUP_KEY, createEmptySave, validateSave, persistSave, loadSave
} = require('../src/js/save');

function memoryStorage({ quota = Infinity } = {}) {
    const data = new Map();
    return {
        data,
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => {
            if (String(v).length > quota) {
                const error = new Error('QuotaExceededError');
                error.name = 'QuotaExceededError';
                throw error;
            }
            data.set(k, String(v));
        }
    };
}

function clearLevel(game) {
    game.asteroids = [];
    game.scrollY = game.level.length;
    game.update(0.016, {});
}

function gameWithWins(storage = memoryStorage()) {
    const game = new Game({ storage });
    game.startCampaign(1);
    game.update(0.016, { fire: true });
    clearLevel(game);
    game.handleAction('confirm');
    clearLevel(game);
    return game;
}

test('exportSave has the contract shape and is JSON-safe', () => {
    const game = gameWithWins();
    const save = game.exportSave();
    assert.equal(save.app, SAVE_APP);
    assert.equal(save.version, SAVE_VERSION);
    assert.ok(!Number.isNaN(Date.parse(save.savedAt)));
    assert.equal(save.progress.lastDifficulty, 'cadet');
    assert.deepEqual(Object.keys(save.progress.byDifficulty), ['cadet', 'pilot', 'ace']);
    assert.equal(save.progress.byDifficulty.cadet.unlocked, 3);
    assert.ok(save.progress.byDifficulty.cadet.bestLevelScores['2'] > 0);
    assert.equal(save.wins.length, 2);
    assert.equal(save.lifetime.levelsCleared, 2);
    assert.equal(save.lifetime.shotsFired, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(save)), save);
    save.progress.byDifficulty.cadet.unlocked = 9;
    assert.equal(game.getProgress('cadet').unlocked, 3, 'export is a copy');
});

test('save round-trips through importSave into a fresh game', () => {
    const source = gameWithWins();
    const exported = source.exportSave();
    const storage = memoryStorage();
    const target = new Game({ storage });
    target.importSave(JSON.parse(JSON.stringify(exported)));
    const reexported = target.exportSave();
    assert.deepEqual({ ...reexported, savedAt: null }, { ...exported, savedAt: null });
    assert.equal(target.selectedLevel, 3);
    assert.equal(target.progress.unlocked, 3);
    assert.equal(target.getWinRecords().length, 2);
    const reloaded = new Game({ storage });
    assert.equal(reloaded.progress.unlocked, 3, 'import is persisted');
    assert.equal(reloaded.getWinRecords().length, 2);
    target.importSave(JSON.stringify(exported));
    assert.equal(target.getWinRecords().length, 2, 'accepts a JSON string');
});

test('import selects the saved last difficulty on the title screen', () => {
    const save = createEmptySave();
    save.progress.lastDifficulty = 'pilot';
    save.progress.byDifficulty.pilot.unlocked = 4;
    const game = new Game();
    game.importSave(save);
    assert.equal(game.selectedDifficulty, 'pilot');
    assert.equal(game.selectedLevel, 4);
});

test('import rejects invalid saves with friendly errors and leaves the game untouched', () => {
    const game = gameWithWins();
    const before = game.exportSave();
    const good = () => JSON.parse(JSON.stringify(before));
    const cases = [
        [null, /empty or not an object/],
        ['{not json', /not valid JSON/],
        [[], /empty or not an object/],
        [{ ...good(), app: 'other-game' }, /not an AsteRoid/],
        [{ ...good(), version: 2 }, /newer than this game supports/],
        [{ ...good(), version: '1' }, /no version/],
        [(() => { const s = good(); s.progress.byDifficulty.cadet.unlocked = 21; return s; })(), /Cadet progress: unlocked level must be a whole number from 1 to 20/],
        [(() => { const s = good(); s.progress.byDifficulty.ace.unlocked = 0; return s; })(), /Ace progress/],
        [(() => { const s = good(); s.progress.byDifficulty.pilot.unlocked = 2.5; return s; })(), /Pilot progress/],
        [(() => { const s = good(); s.progress.byDifficulty.nightmare = { unlocked: 1, highScore: 0 }; return s; })(), /Unknown difficulty "nightmare"/],
        [(() => { const s = good(); s.progress.lastDifficulty = 'hard'; return s; })(), /Unknown difficulty "hard"/],
        [(() => { const s = good(); s.progress.byDifficulty.cadet.highScore = -5; return s; })(), /high score must be between/],
        [(() => { const s = good(); s.progress.byDifficulty.cadet.highScore = 'lots'; return s; })(), /high score must be a number/],
        [(() => { const s = good(); s.progress.byDifficulty.cadet.bestLevelScores = { 21: 5 }; return s; })(), /not a level number/],
        [(() => { const s = good(); s.wins = 'nope'; return s; })(), /must be a list/],
        [(() => { const s = good(); s.wins[1].level = 42; return s; })(), /Victory record #2: level must be 1–20/],
        [(() => { const s = good(); s.wins[0].schema = 'asteroid-level-record/9'; return s; })(), /unsupported schema/],
        [(() => { const s = good(); s.wins[0].stats.accuracy = 3; return s; })(), /accuracy must be between 0 and 1/],
        [(() => { const s = good(); s.wins[0].battleLog.path = Array(301).fill([1, 1]); return s; })(), /more than 300/],
        [(() => { const s = good(); s.wins[0].completedAt = 'yesterday'; return s; })(), /not a valid date/],
        [(() => { const s = good(); s.lifetime.shotsFired = -1; return s; })(), /Lifetime shotsFired/],
        [(() => { const s = good(); s.wins = Array(2001).fill(s.wins[0]); return s; })(), /too many victory records/]
    ];
    for (const [input, message] of cases) {
        assert.throws(() => game.importSave(input), (error) => error instanceof Error && message.test(error.message), String(message));
    }
    assert.deepEqual({ ...game.exportSave(), savedAt: null }, { ...before, savedAt: null });
    assert.equal(game.state, 'levelComplete', 'game keeps running');
});

test('import keeps only the newest 200 wins', () => {
    const game = gameWithWins();
    const save = game.exportSave();
    save.wins = Array.from({ length: 250 }, (_, i) => ({ ...save.wins[0], id: `win-${i}` }));
    game.importSave(save);
    const wins = game.getWinRecords();
    assert.equal(wins.length, 200);
    assert.equal(wins[199].id, 'win-249');
});

test('legacy {unlocked, highScore} saves migrate to cadet (storage and import)', () => {
    const storage = memoryStorage();
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ unlocked: 99, highScore: 500 }));
    const save = loadSave(storage);
    assert.equal(save.progress.byDifficulty.cadet.unlocked, 10, 'clamped to 10');
    assert.equal(save.progress.byDifficulty.cadet.highScore, 500);
    const game = new Game();
    game.importSave({ unlocked: 4, highScore: 10 });
    assert.equal(game.getProgress('cadet').unlocked, 4);
});

test('corrupt storage falls back to a fresh save', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{oops');
    const game = new Game({ storage });
    assert.equal(game.progress.unlocked, 1);
    assert.equal(game.selectedDifficulty, 'cadet');
});

test('storage quota errors drop the oldest battle logs first', () => {
    const game = gameWithWins();
    const save = game.exportSave();
    save.wins = Array.from({ length: 8 }, (_, i) => ({
        ...save.wins[0],
        id: `w${i}`,
        battleLog: { ...save.wins[0].battleLog, path: Array.from({ length: 300 }, (_, j) => [j, j]) }
    }));
    const fullSize = JSON.stringify(save).length;
    const storage = memoryStorage({ quota: fullSize - 3000 });
    assert.equal(persistSave(storage, save), true);
    const stored = JSON.parse(storage.getItem(STORAGE_KEY));
    assert.equal(stored.wins.length, 8, 'keeps every win');
    assert.equal(stored.wins[0].battleLog.path.length, 0, 'oldest log stripped');
    assert.equal(stored.wins[7].battleLog.path.length, 300, 'newest log kept');
    assert.doesNotThrow(() => validateSave(stored));

    const tiny = memoryStorage({ quota: 5000 });
    assert.equal(persistSave(tiny, save), true);
    assert.ok(JSON.parse(tiny.getItem(STORAGE_KEY)).wins.length < 8, 'drops oldest wins when needed');
    const none = memoryStorage({ quota: 10 });
    assert.equal(persistSave(none, save), false);
    const gameWithFullStorage = new Game({ storage: none });
    assert.doesNotThrow(() => gameWithFullStorage.startCampaign(1));
});

test('import rejects non-JSON values, missing required record fields and invalid record ranges', () => {
    const game = gameWithWins();
    const good = game.exportSave();
    const mutate = (fn) => { const save = JSON.parse(JSON.stringify(good)); fn(save); return save; };
    for (const save of [
        mutate((s) => { s.extra = Infinity; }),
        mutate((s) => { s.extra = undefined; }),
        mutate((s) => { s.extra = () => 1; }),
        mutate((s) => { s.extra = s; }),
        mutate((s) => { delete s.wins[0].stats.hits; }),
        mutate((s) => { s.wins[0].stats.shotsFired = 1.5; }),
        mutate((s) => { delete s.wins[0].stats.pickupsCollected.shield; }),
        mutate((s) => { s.wins[0].ship.finalPower = 101; }),
        mutate((s) => { s.wins[0].battleLog.kills = [[0, 0, 10, 2]]; }),
        mutate((s) => { s.wins[0].battleLog.worldWidth = 1000; }),
        mutate((s) => { s.wins[0].startedAt = '2026-02-30T12:00:00.000Z'; }),
        mutate((s) => { s.wins[0].difficultyLabel = 'Easy'; })
    ]) assert.throws(() => game.importSave(save), Error);
    assert.deepEqual(game.getWinRecords(), good.wins, 'failed imports are atomic');
});

test('saving merges progress and wins written by another tab instead of overwriting them', () => {
    const storage = memoryStorage();
    const tabA = new Game({ storage });
    const tabB = new Game({ storage });
    tabA.startCampaign(1, 'pilot');
    clearLevel(tabA);
    const pilotWin = tabA.getWinRecords()[0];
    assert.ok(pilotWin);
    tabB.startCampaign(1, 'cadet');
    clearLevel(tabB);
    const stored = validateSave(storage.getItem(STORAGE_KEY));
    assert.ok(stored.wins.some((w) => w.id === pilotWin.id), 'tab B kept tab A\'s win');
    assert.equal(stored.wins.length, 2);
    assert.equal(stored.progress.byDifficulty.pilot.unlocked, 2);
    assert.equal(stored.progress.byDifficulty.cadet.unlocked, 2);
});

test('an unreadable save is backed up before falling back to a fresh save', () => {
    const storage = memoryStorage();
    const future = JSON.stringify({ ...createEmptySave(), version: SAVE_VERSION + 1 });
    storage.setItem(STORAGE_KEY, future);
    const save = loadSave(storage);
    assert.equal(save.wins.length, 0);
    assert.equal(storage.getItem(BACKUP_KEY), future);
});
