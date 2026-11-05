export const CLAIM_SCHEMA = 'asteroid-dnft-claim/1';
export const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})$/;
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const validAddress = value => typeof value === 'string' && ADDRESS_RE.test(value) && !/^0x0{40}$/i.test(value);
export const validIpfs = value => typeof value === 'string' && value.startsWith('ipfs://') && CID_RE.test(value.slice(7));
export function assertJsonSafe(value, depth = 0) {
  if (depth > 30) throw new Error('JSON nesting is too deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) throw new Error('Expected plain JSON-safe data');
  for (const item of Object.values(value)) assertJsonSafe(item, depth + 1);
}
const finiteRange = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function validateRecord(record) {
  assertJsonSafe(record);
  if (record?.schema !== 'asteroid-level-record/1' || typeof record.id !== 'string' || !/^[\w:.+-]{1,180}$/.test(record.id) || !Number.isInteger(record.level) || record.level < 1 || record.level > 10 || !['cadet', 'pilot', 'ace'].includes(record.difficulty)) throw new Error('Invalid level record identity');
  if (typeof record.levelName !== 'string' || !record.levelName || typeof record.game !== 'string' || typeof record.gameVersion !== 'string' || !Number.isFinite(Date.parse(record.completedAt)) || !Number.isFinite(Date.parse(record.startedAt)) || !finiteRange(record.durationSec, 0, Number.MAX_SAFE_INTEGER)) throw new Error('Invalid level record details');
  if (!record.ship || typeof record.ship !== 'object' || Array.isArray(record.ship) || !record.stats || typeof record.stats !== 'object' || Array.isArray(record.stats) || !finiteRange(record.stats.accuracy, 0, 1) || !record.score || !['total', 'level', 'bonus'].every(key => finiteRange(record.score[key], 0, Number.MAX_SAFE_INTEGER))) throw new Error('Invalid level record statistics');
  return record;
}
export function validateClaim(input) {
  assertJsonSafe(input);
  if (!input || input.schema !== CLAIM_SCHEMA) throw new Error('Unknown victory claim schema');
  if (typeof input.recordId !== 'string' || !/^[\w:.+-]{1,180}$/.test(input.recordId)) throw new Error('Invalid recordId');
  if (!validIpfs(input.tokenURI) || !validIpfs(input.image)) throw new Error('Metadata and image must be ipfs://CID URIs');
  if (!validAddress(input.claimant)) throw new Error('Invalid claimant wallet address');
  if (!Number.isInteger(input.level) || input.level < 1 || input.level > 10) throw new Error('Level must be 1–10');
  if (!['cadet', 'pilot', 'ace'].includes(input.difficulty)) throw new Error('Unknown difficulty');
  for (const key of ['completedAt', 'requestedAt']) {
    if (typeof input[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(input[key]) || !finiteRange(Date.parse(input[key]), 0, 8640000000000000)) throw new Error(`Invalid ${key}`);
  }
  if (Date.parse(input.requestedAt) < Date.parse(input.completedAt)) throw new Error('Request predates the win');
  if (!input.score || !['total', 'level', 'bonus'].every(key => finiteRange(input.score[key], 0, Number.MAX_SAFE_INTEGER))) throw new Error('Invalid score');
  return Object.fromEntries(['schema', 'recordId', 'tokenURI', 'image', 'claimant', 'level', 'difficulty', 'completedAt', 'score', 'requestedAt'].map(key => [key, JSON.parse(JSON.stringify(input[key]))]));
}
export function parseClaimBody(body) {
  if (typeof body !== 'string' || body.length > 65000) throw new Error('Claim body is missing or too large');
  const fenced = [...body.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(match => match[1]);
  const section = body.match(/### Claim JSON\s*([\s\S]*?)(?=\n### |$)/)?.[1]?.trim();
  const candidates = [...fenced, ...(section ? [section] : []), body.trim()];
  const claims = [];
  for (const text of candidates) {
    try { const value = JSON.parse(text); if (value?.schema === CLAIM_SCHEMA) claims.push(validateClaim(value)); } catch (error) {
      if (text.includes(CLAIM_SCHEMA) && text.trim().startsWith('{')) throw new Error(`Invalid claim JSON: ${error.message}`);
    }
  }
  const unique = [...new Map(claims.map(claim => [JSON.stringify(claim), claim])).values()];
  if (unique.length !== 1) throw new Error('Supply exactly one victory claim JSON object');
  return unique[0];
}
export function parseQueue(input) {
  if (!input || !Array.isArray(input.pending) || !Array.isArray(input.minted)) throw new Error('Queue requires pending and minted arrays');
  if (input.pending.length + input.minted.length > 10000) throw new Error('Queue is too large');
  const seenRecords = new Set(), seenURIs = new Set();
  for (const entry of [...input.pending, ...input.minted]) {
    validateClaim(entry);
    if (seenRecords.has(entry.recordId) || seenURIs.has(entry.tokenURI)) throw new Error('Duplicate record or token URI in queue');
    seenRecords.add(entry.recordId); seenURIs.add(entry.tokenURI);
  }
  assertJsonSafe(input);
  return JSON.parse(JSON.stringify(input));
}
export function appendClaim(queue, claim, issue = {}) {
  const result = parseQueue(queue), valid = validateClaim(claim);
  const existing = [...result.pending, ...result.minted].find(entry => entry.recordId === valid.recordId || entry.tokenURI === valid.tokenURI);
  if (existing) return { queue: result, added: false, existing };
  const entry = { ...valid };
  if (Number.isSafeInteger(issue.number) && issue.number > 0) entry.issueNumber = issue.number;
  if (typeof issue.url === 'string' && /^https:\/\/github\.com\/TheJollyLaMa\/AsteRoid\/issues\/\d+$/.test(issue.url)) entry.issueUrl = issue.url;
  result.pending.push(entry);
  return { queue: result, added: true };
}
