'use strict';

const { keccak256, toUtf8Bytes, verifyMessage, getAddress } = require('ethers');
const { getFrameCount, replayRun } = require('./game-adapter');

const MAX_FRAME_COUNT = 60 * 60 * 60;
const MAX_RUN_BYTES = 5 * 1024 * 1024;
const DIFFICULTIES = new Set(['cadet', 'pilot', 'ace']);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function runHash(run) {
  return keccak256(toUtf8Bytes(stableJson(run)));
}

function normalizeAddress(value) {
  try { return getAddress(value).toLowerCase(); } catch { return null; }
}

function validateRunShape(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) throw new Error('Run log must be an object.');
  if (typeof run.runId !== 'string' || run.runId.length < 1 || run.runId.length > 200) throw new Error('Run log needs a runId.');
  if (!Number.isSafeInteger(run.seed)) throw new Error('Run seed must be a safe integer.');
  if (!DIFFICULTIES.has(run.difficulty)) throw new Error('Run difficulty is invalid.');
  if (!Number.isSafeInteger(run.startLevel) || run.startLevel < 1 || run.startLevel > 20) throw new Error('Run startLevel is invalid.');
  if (!Number.isSafeInteger(run.players) || run.players < 1 || run.players > 5) throw new Error('Run player count must be between 1 and 5.');
  const frameCount = getFrameCount(run.frames, run.players);
  if (frameCount === 0 || frameCount > MAX_FRAME_COUNT) throw new Error('Run frames are missing or exceed the replay limit.');
  if (Buffer.byteLength(stableJson(run)) > MAX_RUN_BYTES) throw new Error('Run log exceeds the 5 MB limit.');
}

function comparableResult(result) {
  return JSON.stringify({
    records: (result.records || []).map((record) => record.id),
    captures: (result.captures || []).map((capture) => ({
      tier: capture.tier,
      tokenId: capture.prize && String(capture.prize.tokenId ?? capture.tokenId ?? ''),
      project: capture.prize && capture.prize.project || capture.project || ''
    })),
    survivors: Array.isArray(result.survivors)
      ? result.survivors.map((survivor) => normalizeAddress(survivor) || String(survivor)).sort()
      : Number.isInteger(result.survivors) ? result.survivors : []
  });
}

async function verifyRun({ run, address, signature, isPilot, replay = replayRun }) {
  validateRunShape(run);
  const playerAddress = normalizeAddress(address);
  if (!playerAddress) throw new Error('A valid player address is required.');
  let recovered;
  try { recovered = normalizeAddress(verifyMessage(runHash(run), signature)); }
  catch { throw new Error('Run signature is invalid.'); }
  if (!recovered || recovered !== playerAddress) throw new Error('Run signature does not match the player address.');
  if (!await isPilot(playerAddress)) throw new Error('Wallet is not a Decent Pilot.');
  if (run.pilot && run.pilot.address && normalizeAddress(run.pilot.address) !== playerAddress) throw new Error('Run pilot address does not match the signing wallet.');
  const result = await replay({ ...run, pilot: { address: playerAddress, isPilot: true } });
  if (!result || typeof result !== 'object') throw new Error('Replay did not produce a result.');
  const claimed = run.result || run.summary;
  if (claimed && comparableResult(claimed) !== comparableResult(result)) {
    throw new Error('Replay result does not match the submitted run summary.');
  }
  return { player: playerAddress, runHash: runHash(run), result };
}

module.exports = {
  DIFFICULTIES,
  MAX_FRAME_COUNT,
  MAX_RUN_BYTES,
  comparableResult,
  normalizeAddress,
  runHash,
  stableJson,
  validateRunShape,
  verifyRun
};
