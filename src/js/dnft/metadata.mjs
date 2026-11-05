import { validateRecord, validAddress, validIpfs, validateClaim } from './validation.mjs';
export const METADATA_SCHEMA = 'asteroid-victory-metadata/1';
function attributesOf(value, prefix, output) {
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) attributesOf(item, prefix ? `${prefix}.${key}` : key, output);
  } else output.push({ trait_type: prefix, value: value === null ? 'Unavailable' : value });
}
export function buildMetadata(record, { image, claimant, externalUrl = 'https://thejollylama.github.io/AsteRoid/' } = {}) {
  validateRecord(record);
  if (!validAddress(claimant)) throw new Error('Connect your wallet with the header fox before stamping');
  if (!validIpfs(image)) throw new Error('Pin the battle card before metadata');
  const attributes = [];
  for (const key of ['stats', 'score', 'ship']) attributesOf(record[key], key, attributes);
  for (const key of ['level', 'levelName', 'difficulty', 'difficultyLabel', 'seed', 'startedAt', 'durationSec']) if (record[key] !== undefined) attributesOf(record[key], key, attributes);
  attributes.push({ trait_type: 'completedAt', display_type: 'date', value: Math.floor(Date.parse(record.completedAt) / 1000) });
  const label = record.difficultyLabel || `${record.difficulty[0].toUpperCase()}${record.difficulty.slice(1)}`;
  return {
    name: `AsteRoid Victory · L${record.level} ${record.levelName} · ${label}`,
    description: `Victory stamp for level ${record.level} of AsteRoid: Galactic Gauntlet on ${record.completedAt}. Player-submitted game telemetry; reviewed and batch minted by the administrator on Base.`,
    image, external_url: externalUrl, attributes,
    properties: { record: JSON.parse(JSON.stringify(record)), schema: METADATA_SCHEMA, game: record.game, gameVersion: record.gameVersion, claimant, chain: 'base' },
  };
}
export function buildClaim(record, { tokenURI, image, claimant, requestedAt = new Date().toISOString() }) {
  return validateClaim({ schema: 'asteroid-dnft-claim/1', recordId: record.id, tokenURI, image, claimant, level: record.level, difficulty: record.difficulty, completedAt: record.completedAt, score: record.score, requestedAt });
}
