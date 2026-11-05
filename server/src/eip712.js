'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CHAIN_DEFINITIONS_PATH = path.resolve(__dirname, '../../src/js/chain/eip712.json');
const DOMAIN_FALLBACK = { name: 'DecentVoyager', version: '1' };
const FALLBACK_TYPES = {
  Settle: [
    { name: 'roundId', type: 'uint256' },
    { name: 'survivorsHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ],
  PrizeVoucher: [
    { name: 'player', type: 'address' },
    { name: 'nftContract', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'tier', type: 'uint8' },
    { name: 'runId', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' }
  ],
  StampVoucher: [
    { name: 'player', type: 'address' },
    { name: 'recordId', type: 'bytes32' },
    { name: 'level', type: 'uint16' },
    { name: 'difficulty', type: 'uint8' },
    { name: 'metadataURI', type: 'string' },
    { name: 'deadline', type: 'uint256' }
  ]
};

function parseType(name, value) {
  if (Array.isArray(value)) return value.map(({ name: fieldName, type }) => ({ name: fieldName, type }));
  if (typeof value !== 'string') return null;
  const match = value.match(/^([A-Za-z0-9_]+)\((.*)\)$/);
  if (!match || match[1] !== name) throw new Error(`Invalid EIP-712 type string for ${name}.`);
  if (!match[2]) return [];
  return match[2].split(',').map((field) => {
    const parsed = field.trim().match(/^([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)$/);
    if (!parsed) throw new Error(`Invalid EIP-712 field in ${name}.`);
    return { type: parsed[1], name: parsed[2] };
  });
}

function loadChainDefinitions(filePath = CHAIN_DEFINITIONS_PATH) {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return { domain: DOMAIN_FALLBACK, types: FALLBACK_TYPES };
    throw error;
  }
  const domain = parsed.domain || DOMAIN_FALLBACK;
  if (domain.name !== DOMAIN_FALLBACK.name || String(domain.version) !== DOMAIN_FALLBACK.version) {
    throw new Error('Chain EIP-712 domain must be DecentVoyager version 1.');
  }
  const definitions = parsed.types || parsed;
  const types = {};
  for (const [name, expected] of Object.entries(FALLBACK_TYPES)) {
    const fields = parseType(name, definitions[name]);
    if (!fields) {
      types[name] = expected;
      continue;
    }
    if (fields.length !== expected.length || fields.some((field, index) => field.name !== expected[index].name || field.type !== expected[index].type)) {
      throw new Error(`Chain EIP-712 definition mismatch for ${name}`);
    }
    types[name] = fields;
  }
  return { domain, types };
}

const CHAIN_DEFINITIONS = loadChainDefinitions();
module.exports = {
  DOMAIN: CHAIN_DEFINITIONS.domain,
  TYPES: CHAIN_DEFINITIONS.types,
  loadDefinitions: (filePath) => loadChainDefinitions(filePath).types,
  loadChainDefinitions
};
