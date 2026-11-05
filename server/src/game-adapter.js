'use strict';

const Game = require('../../src/js/game.js');
let inputLog = null;
try { inputLog = require('../../src/js/inputlog.js'); } catch { /* Core RLE helper has not landed; direct frame arrays remain testable. */ }

function getFrameCount(frames, expectedPlayers) {
  if (Array.isArray(frames)) {
    if (frames.some((frame) => !Array.isArray(frame) || frame.length !== expectedPlayers || frame.some((input) => !input || typeof input !== 'object' || Array.isArray(input)))) {
      throw new Error('Each replay frame must contain one input object per player.');
    }
    return frames.length;
  }
  if (!inputLog || !frames || frames.version !== 1 || !Array.isArray(frames.runs)) {
    throw new Error('Run frames must be a core-compatible input log.');
  }
  let count = 0;
  for (const run of frames.runs) {
    if (!Array.isArray(run) || !Number.isSafeInteger(run[0]) || run[0] < 1 || !Array.isArray(run[1]) || run[1].length !== expectedPlayers) {
      throw new Error('Run frames contain an invalid input-log segment.');
    }
    for (const input of run[1]) {
      if (!input || typeof input !== 'object' || !Number.isInteger(input.mask) || input.mask < 0 || input.mask > 255 || (input.ax !== undefined && (!Number.isInteger(input.ax) || input.ax < -127 || input.ax > 127)) || (input.ay !== undefined && (!Number.isInteger(input.ay) || input.ay < -127 || input.ay > 127))) {
        throw new Error('Run frames contain invalid bitmask input.');
      }
    }
    count += run[0];
  }
  if (frames.frames !== undefined && frames.frames !== count) throw new Error('Input log frame count mismatch.');
  if (frames.players !== undefined && frames.players !== expectedPlayers) throw new Error('Input log player count mismatch.');
  return count;
}

function normalizeFrames(frames) {
  if (!Array.isArray(frames) || !inputLog) return frames;
  const encoded = frames.every((frame) => Array.isArray(frame) && frame.every((input) => input && Number.isInteger(input.mask)));
  return encoded ? frames : inputLog.encode(frames);
}

function replayRun(run) {
  if (typeof Game.replay !== 'function') {
    throw new Error('Core replay API is unavailable: Game.replay has not landed yet.');
  }
  const players = typeof run.players === 'object'
    ? { ...run.players, mode: run.players.mode || run.mode || 'coop' }
    : { count: run.players, mode: run.mode || 'coop' };
  return Game.replay({
    seed: run.seed,
    difficulty: run.difficulty,
    startLevel: run.startLevel,
    players,
    pilot: run.pilot,
    runId: run.runId,
    startedAt: run.startedAt,
    frames: normalizeFrames(run.frames)
  });
}

function createArenaGame({ players, mode = 'coop', difficulty, seed, startLevel = 1, pilot = null }) {
  const game = new Game({ seed });
  for (const [method, description] of [
    ['setPilot', 'Game.setPilot'],
    ['setPlayers', 'Game.setPlayers'],
    ['step', 'game.step'],
    ['serialize', 'game.serialize']
  ]) {
    if (typeof game[method] !== 'function') {
      throw new Error(`Core arena API is unavailable: ${description} has not landed yet.`);
    }
  }
  game.setPilot(pilot || { address: null, isPilot: false });
  game.setPlayers(players, { mode });
  if (typeof game.startCampaign === 'function') game.startCampaign(startLevel, difficulty, seed);
  else throw new Error('Core arena API is unavailable: game.startCampaign is missing.');
  return game;
}

module.exports = { Game, createArenaGame, getFrameCount, normalizeFrames, replayRun };
