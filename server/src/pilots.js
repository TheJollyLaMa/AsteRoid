'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { getAddress } = require('ethers');

function createPilotRegistry({ repoRoot, filePath, githubToken, githubRepo, githubRef = 'main', fetchImpl = global.fetch, cacheMs = 30000 }) {
  const localFile = filePath || path.join(repoRoot, 'contributor-accounts.json');
  let cache = null;
  let loadedAt = 0;
  async function load() {
    if (cache && Date.now() - loadedAt < cacheMs) return cache;
    let data;
    if (githubRepo && githubToken) {
      const response = await fetchImpl(`https://api.github.com/repos/${githubRepo}/contents/contributor-accounts.json?ref=${encodeURIComponent(githubRef)}`, {
        headers: { authorization: `Bearer ${githubToken}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }
      });
      if (!response.ok) throw new Error(`Could not load pilot registry from GitHub (${response.status}).`);
      const file = await response.json();
      data = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    } else {
      data = JSON.parse(await fs.readFile(localFile, 'utf8'));
    }
    const contributors = Array.isArray(data) ? data : data.contributors;
    if (!Array.isArray(contributors)) throw new Error('Pilot registry must contain a contributors array.');
    const entries = contributors.filter((entry) => entry && entry.whitelisted !== false && entry.walletAddress)
      .map((entry) => {
        try { return { address: getAddress(entry.walletAddress).toLowerCase(), role: entry.role }; } catch { return null; }
      }).filter(Boolean);
    cache = { pilots: new Set(entries.map((entry) => entry.address)), admins: new Set(entries.filter((entry) => ['owner', 'admin'].includes(entry.role)).map((entry) => entry.address)) };
    loadedAt = Date.now();
    return cache;
  }
  return {
    async isPilot(address) {
      const pilots = await load();
      return pilots.pilots.has(getAddress(address).toLowerCase());
    },
    async isAdmin(address) {
      const entries = await load();
      return entries.admins.has(getAddress(address).toLowerCase());
    },
    async reset() { cache = null; loadedAt = 0; }
  };
}

module.exports = { createPilotRegistry };
