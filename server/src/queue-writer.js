'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function createQueueWriter({ repoRoot, token = '', repo = '', ref = 'main', fetchImpl = global.fetch, localFiles = {} }) {
  const files = {
    stamps: localFiles.stamps || 'victory-stamps.json',
    prizes: localFiles.prizes || 'payroll-queue.json'
  };
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28'
  };

  async function readRemote(file) {
    const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(file)}?ref=${encodeURIComponent(ref)}`;
    const response = await fetchImpl(url, { headers });
    if (response.status === 404) return { data: null, sha: null };
    if (!response.ok) throw new Error(`Could not read ${file} from GitHub (${response.status}).`);
    const result = await response.json();
    return { data: JSON.parse(Buffer.from(result.content, 'base64').toString('utf8')), sha: result.sha };
  }

  function allEntries(doc, kind) {
    if (Array.isArray(doc)) return doc;
    const completed = kind === 'stamps' ? doc.minted : doc.settled;
    return [...(Array.isArray(doc.pending) ? doc.pending : []), ...(Array.isArray(completed) ? completed : [])];
  }

  function findEntry(list, item, kind) {
    return list.find((existing) => {
      if (kind === 'stamps') return (existing.recordId || existing.record && existing.record.id) === (item.recordId || item.record && item.record.id);
      const sameToken = String(existing.tokenId ?? (existing.prize && existing.prize.tokenId) ?? '') === String(item.tokenId ?? (item.prize && item.prize.tokenId) ?? '');
      return sameToken && existing.player && item.player && existing.player.toLowerCase() === item.player.toLowerCase();
    }) || null;
  }

  function existingResult(existing, item, file) {
    if (existing && existing.player && item.player && existing.player.toLowerCase() !== item.player.toLowerCase()) {
      throw new Error('Queue identity is already assigned to a different player.');
    }
    if (!existing || existing.runId !== item.runId) throw new Error('Queue identity is already assigned to a different run.');
    if (existing.runHash && item.runHash && existing.runHash !== item.runHash) {
      throw new Error('Queue already contains this runId with a different run hash.');
    }
    return { status: 'already-queued', file, item: existing };
  }

  async function writeRemote(file, data, sha) {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(file)}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ message: 'Queue verified Decent Voyager run', content: Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64'), ...(sha ? { sha } : {}), branch: ref })
    });
    if (!response.ok) throw new Error(`Could not update ${file} on GitHub (${response.status}).`);
  }

  async function appendRemote(kind, item) {
    const file = files[kind];
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: current, sha } = await readRemote(file);
      const doc = current || (kind === 'stamps' ? { pending: [], minted: [] } : { schema: 'asteroid-payroll/1', pending: [], settled: [] });
      const pending = Array.isArray(doc) ? doc : doc.pending;
      if (!Array.isArray(pending)) throw new Error(`${file} does not contain a pending queue array.`);
      const existing = findEntry(allEntries(doc, kind), item, kind);
      if (existing) return existingResult(existing, item, file);
      pending.push(item);
      try {
        await writeRemote(file, doc, sha);
        return { status: 'queued', file };
      } catch (error) {
        if (attempt === 2 || !/\((409|422)\)/.test(error.message)) throw error;
      }
    }
  }

  async function appendLocal(kind, item) {
    const file = path.join(repoRoot, files[kind]);
    let doc;
    try { doc = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      doc = kind === 'stamps' ? { pending: [], minted: [] } : { schema: 'asteroid-payroll/1', pending: [], settled: [] };
    }
    const pending = Array.isArray(doc) ? doc : doc.pending;
    if (!Array.isArray(pending)) throw new Error(`${files[kind]} does not contain a pending queue array.`);
    const existing = findEntry(allEntries(doc, kind), item, kind);
    if (existing) return existingResult(existing, item, files[kind]);
    pending.push(item);
    await fs.writeFile(file, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    return { status: 'queued', file: files[kind] };
  }

  return {
    async append(kind, item) {
      if (!Object.hasOwn(files, kind)) throw new Error(`Unknown queue: ${kind}`);
      if (token) {
        if (!repo) throw new Error('GITHUB_REPO is required when GITHUB_TOKEN is set.');
        return appendRemote(kind, item);
      }
      return appendLocal(kind, item);
    },
    async read(kind) {
      if (!Object.hasOwn(files, kind)) throw new Error(`Unknown queue: ${kind}`);
      let doc;
      if (token) {
        if (!repo) throw new Error('GITHUB_REPO is required when GITHUB_TOKEN is set.');
        ({ data: doc } = await readRemote(files[kind]));
      } else {
        try { doc = JSON.parse(await fs.readFile(path.join(repoRoot, files[kind]), 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return doc || (kind === 'stamps' ? { pending: [], minted: [] } : { schema: 'asteroid-payroll/1', pending: [], settled: [] });
    }
  };
}

module.exports = { createQueueWriter };
