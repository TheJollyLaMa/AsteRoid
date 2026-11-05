'use strict';

const http = require('node:http');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { verifyMessage, getAddress } = require('ethers');
const { WebSocketServer } = require('ws');
const { ArenaHub, createPaidJoinVerifier } = require('./arena');
const { createPinata } = require('./pinata');
const { createPilotRegistry } = require('./pilots');
const { createQueueWriter } = require('./queue-writer');
const { normalizeAddress, runHash, verifyRun } = require('./run-verifier');
const { makeVoucherService } = require('./vouchers');
const { createTicketService } = require('./tickets');
let prizeDefinitions = {};
try { prizeDefinitions = require('../../src/js/prizes.js'); } catch { /* Core prize data has not landed yet. */ }

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_NFT_ADDRESS = prizeDefinitions.COLLECTION || '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B';
const DEFAULT_ORIGINS = ['http://127.0.0.1:8907', 'http://localhost:8907'];

function parseCsv(value, fallback = []) {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : fallback;
}

function createRateLimiter({ limit = 20, windowMs = 60_000, now = () => Date.now() } = {}) {
  const buckets = new Map();
  return (key) => {
    const current = now();
    let bucket = buckets.get(key);
    if (!bucket || current - bucket.start >= windowMs) bucket = { start: current, count: 0 };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > 10_000) {
      for (const [candidate, entry] of buckets) if (current - entry.start >= windowMs) buckets.delete(candidate);
    }
    return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.start + windowMs };
  };
}

function readJsonBody(request, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Request body exceeds the 5 MB limit.'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 })); }
    });
    request.on('error', reject);
  });
}

function response(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function createService(options = {}) {
  const env = options.env || process.env;
  const now = options.now || (() => Date.now());
  if ((env.NODE_ENV || process.env.NODE_ENV) === 'production' && !env.TICKET_SECRET) {
    throw new Error('TICKET_SECRET is required in production.');
  }
  const ticketService = options.ticketService || createTicketService({
    secret: env.TICKET_SECRET || randomBytes(32).toString('hex'),
    now
  });
  const config = {
    chainId: Number(env.CHAIN_ID || 84532),
    arenaAddress: env.VOYAGER_ARENA_ADDRESS,
    stampsAddress: env.VOYAGER_STAMPS_ADDRESS,
    prizesAddress: env.VOYAGER_PRIZES_ADDRESS,
    nftAddress: env.SUPPORTER_NFT_ADDRESS || DEFAULT_NFT_ADDRESS,
    adminAddresses: parseCsv(env.ADMIN_ADDRESS).map((address) => {
      try { return getAddress(address).toLowerCase(); } catch { return null; }
    }).filter(Boolean),
    origins: parseCsv(env.CORS_ORIGINS, DEFAULT_ORIGINS),
    rateLimit: Number(env.RATE_LIMIT_MAX || 20),
    rateWindowMs: Number(env.RATE_LIMIT_WINDOW_MS || 60_000),
    arenaFinalLevel: Number(env.ARENA_FINAL_LEVEL || 10)
  };
  const pilotRegistry = options.pilotRegistry || createPilotRegistry({
    repoRoot: REPO_ROOT,
    filePath: env.PILOTS_FILE,
    githubToken: env.GITHUB_TOKEN,
    githubRepo: env.GITHUB_REPO,
    githubRef: env.GITHUB_REF || 'main',
    fetchImpl: options.fetchImpl
  });
  const queues = options.queues || createQueueWriter({
    repoRoot: REPO_ROOT,
    token: env.GITHUB_TOKEN,
    repo: env.GITHUB_REPO,
    ref: env.GITHUB_REF || 'main',
    fetchImpl: options.fetchImpl
  });
  const pinata = options.pinata || createPinata({ jwt: env.PINATA_JWT, fetchImpl: options.fetchImpl });
  const vouchers = options.vouchers || makeVoucherService({
    privateKey: env.REFEREE_PRIVATE_KEY,
    chainId: config.chainId,
    arenaAddress: config.arenaAddress,
    stampsAddress: config.stampsAddress,
    prizesAddress: config.prizesAddress,
    nftAddress: config.nftAddress
  });
  const verifyPaidJoin = options.verifyPaidJoin || createPaidJoinVerifier({
    rpcUrl: env.BASE_RPC_URL || env.BASE_SEPOLIA_RPC_URL,
    arenaAddress: config.arenaAddress,
    methodName: env.ARENA_JOINED_METHOD || 'hasJoined',
    chainId: config.chainId
  });
  const rateLimit = options.rateLimit || createRateLimiter({ limit: config.rateLimit, windowMs: config.rateWindowMs });
  const voucherBook = new Map();
  const idempotency = new Map();
  const usedTickets = new Map();
  const inFlight = new Map();
  const originAllowed = (origin) => !origin || config.origins.includes(origin);

  const arena = new ArenaHub({ WebSocketServer, pilotRegistry, vouchers, verifyPaidJoin, originAllowed, finalLevel: config.arenaFinalLevel });
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    if (origin && originAllowed(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-headers', 'content-type,x-admin-address,x-admin-timestamp,x-admin-signature');
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(originAllowed(origin) ? 204 : 403);
      return res.end();
    }
    if (!originAllowed(origin)) return response(res, 403, { error: 'Origin is not allowed.' });
    const ip = req.socket.remoteAddress || 'unknown';
    const rate = rateLimit(ip);
    res.setHeader('x-ratelimit-remaining', String(rate.remaining));
    if (!rate.allowed) return response(res, 429, { error: 'Rate limit exceeded.' });
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return response(res, 200, {
          status: 'ok',
          replayApi: typeof require('./game-adapter').Game.replay === 'function',
          signerConfigured: Boolean(vouchers.address),
          queueMode: env.GITHUB_TOKEN ? (env.GITHUB_REPO ? 'github' : 'misconfigured') : 'local',
          pinning: env.PINATA_JWT ? 'configured' : 'skipped'
        });
      }
      if (req.method === 'POST' && url.pathname === '/tickets') {
        const body = await readJsonBody(req, 16 * 1024);
        const address = normalizeAddress(body.address);
        if (!address) return response(res, 400, { error: 'A valid address is required.' });
        if (!await pilotRegistry.isPilot(address)) return response(res, 401, { error: 'Wallet is not a Decent Pilot.' });
        return response(res, 201, ticketService.issue(address));
      }
      if (req.method === 'POST' && url.pathname === '/runs') {
        const body = await readJsonBody(req);
        const run = body.run || body.runLog;
        const address = normalizeAddress(body.address);
        if (!address || typeof body.signature !== 'string') return response(res, 400, { error: 'address, run, and signature are required.' });
        const hash = runHash(run);
        if (!await pilotRegistry.isPilot(address)) throw Object.assign(new Error('Wallet is not a Decent Pilot.'), { statusCode: 401 });
        let recovered;
        try { recovered = normalizeAddress(verifyMessage(hash, body.signature)); } catch { recovered = null; }
        if (!recovered || recovered !== address) throw new Error('Run signature does not match the player address.');
        const currentTime = now();
        for (const [candidate, entry] of idempotency) if (currentTime - entry.createdAt > 24 * 60 * 60 * 1000) idempotency.delete(candidate);
        const previous = idempotency.get(run && run.runId);
        if (previous) {
          if (previous.player !== address || previous.hash !== hash) return response(res, 409, { error: 'runId was already used for a different signed run.' });
          return response(res, 200, { ...previous.response, idempotent: true });
        }
        if (inFlight.has(run && run.runId)) {
          await inFlight.get(run.runId);
          const completed = idempotency.get(run.runId);
          if (completed && completed.player === address && completed.hash === hash) return response(res, 200, { ...completed.response, idempotent: true });
          return response(res, 409, { error: 'runId is already being processed.' });
        }
        let verifiedTicket;
        try { verifiedTicket = ticketService.verify({ address, run, usedTickets }); }
        catch (error) { error.statusCode = 422; throw error; }
        const task = processRun({ run, address, signature: body.signature, verifiedTicket });
        inFlight.set(run && run.runId, task);
        try {
          const result = await task;
          const payload = { runId: run.runId, runHash: hash, vouchers: result.vouchers, queue: result.queue, pinning: result.pinning };
          idempotency.set(run.runId, { player: address, hash, response: payload, createdAt: now() });
          return response(res, 201, payload);
        } finally { inFlight.delete(run && run.runId); }
      }
      const voucherMatch = req.method === 'GET' && url.pathname.match(/^\/vouchers\/(0x[0-9a-fA-F]{40})$/);
      if (voucherMatch) {
        const checksum = getAddress(voucherMatch[1]);
        const address = checksum.toLowerCase();
        const [stamps, prizes] = await Promise.all([queues.read('stamps'), queues.read('prizes')]);
        const persisted = [
          ...[...(stamps.pending || []), ...(stamps.minted || [])].filter((item) => item.player && item.player.toLowerCase() === address && item.signature).map((item) => ({ kind: 'stamp', recordId: item.recordId || item.record && item.record.id, voucher: item.voucher, signature: item.signature, digest: item.digest })),
          ...[...(prizes.pending || []), ...(prizes.settled || [])].filter((item) => item.player && item.player.toLowerCase() === address && item.signature).map((item) => ({ kind: 'prize', tokenId: item.tokenId, voucher: item.voucher, signature: item.signature, digest: item.digest }))
        ];
        const combined = [...persisted, ...(voucherBook.get(address) || [])];
        const unique = [...new Map(combined.map((item) => [`${item.kind}:${item.digest || item.recordId || item.tokenId}`, item])).values()];
        return response(res, 200, { address: checksum, vouchers: unique });
      }
      if (req.method === 'GET' && url.pathname === '/queue') {
        const authorized = await authorizeAdmin(req, config, pilotRegistry);
        if (!authorized) return response(res, 401, { error: 'A current admin wallet signature is required.' });
        const [stamps, prizes] = await Promise.all([queues.read('stamps'), queues.read('prizes')]);
        return response(res, 200, {
          stamps: stamps.pending || [],
          prizes: prizes.pending || [],
          counts: { stamps: (stamps.pending || []).length, prizes: (prizes.pending || []).length }
        });
      }
      return response(res, 404, { error: 'Not found.' });
    } catch (error) {
      const status = error.statusCode || (error.message.includes('not a Decent Pilot') || error.message.includes('signature') ? 401 : error.message.includes('already used') || error.message.includes('different run hash') || error.message.includes('different player') || error.message.includes('different run') ? 409 : error.message.includes('Replay result') ? 422 : error.message.includes('Core replay API') || error.message.includes('REFEREE_PRIVATE_KEY') ? 503 : 400);
      return response(res, status, { error: error.message });
    }
  });

  async function processRun({ run, address, signature, verifiedTicket }) {
    const verified = await verifyRun({ run, address, signature, isPilot: (player) => pilotRegistry.isPilot(player), replay: options.replay });
    try { ticketService.consume(verifiedTicket, run, verified.runHash, usedTickets); }
    catch (error) { error.statusCode = 422; throw error; }
    const records = (verified.result.records || []).map((value) => value.record || value);
    const captures = verified.result.captures || [];
    const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const voucherEntries = [];
    const queued = [];
    const pinResults = [];
    for (const record of records) {
      if (!record || typeof record.id !== 'string') throw new Error('Replay produced a level record without an id.');
      const card = run.battleCards && run.battleCards[record.id] || (records.length === 1 ? run.battleCard || run.card : null);
      const pinning = await pinata.pinRecord(record, card);
      const voucher = await vouchers.stamp({ player: address, record, metadataURI: pinning.metadataURI, deadline });
      const item = {
        runId: run.runId, runHash: verified.runHash, recordId: record.id, player: getAddress(address), record,
        metadataURI: pinning.metadataURI, pinning: { status: pinning.status, imageURI: pinning.imageURI },
        voucher: voucher.value, signature: voucher.signature, digest: voucher.digest,
        queuedAt: new Date().toISOString(), status: 'pending'
      };
      const queue = await queues.append('stamps', item);
      const storedStamp = queue.item || item;
      voucherEntries.push({ kind: 'stamp', recordId: record.id, voucher: storedStamp.voucher, signature: storedStamp.signature, digest: storedStamp.digest });
      queued.push({ kind: 'stamp', status: queue.status });
      pinResults.push({ recordId: record.id, status: pinning.status, metadataURI: pinning.metadataURI, ...(pinning.reason ? { reason: pinning.reason } : {}) });
    }
    for (const capture of captures) {
      const prizeList = prizeDefinitions.PRIZES && prizeDefinitions.PRIZES[capture.tier] || [];
      const canonicalPrize = prizeList.find((entry) => String(entry.tokenId) === String((capture.prize && capture.prize.tokenId) ?? capture.tokenId ?? ''));
      const prize = capture.prize || canonicalPrize || capture;
      if (!prize || prize.tokenId == null) throw new Error('Replay produced a supporter capture without a token id.');
      const voucher = await vouchers.prize({
        player: address,
        nftContract: prize.nftContract || capture.nftContract || env.SUPPORTER_NFT_ADDRESS || DEFAULT_NFT_ADDRESS,
        tokenId: prize.tokenId,
        tier: capture.tier,
        // Each capture needs its own replay key: VoyagerPrizes consumes the voucher runId on claim.
        runId: `${run.runId}:tier${Number(capture.tier)}`,
        deadline
      });
      const item = {
        kind: 'supporter-prize', runId: run.runId, runHash: verified.runHash, player: getAddress(address), tier: Number(capture.tier),
        project: prize.project || '', tokenId: String(prize.tokenId), label: prize.label || '',
        voucher: voucher.value, signature: voucher.signature, digest: voucher.digest,
        queuedAt: new Date().toISOString(), status: 'pending'
      };
      const queue = await queues.append('prizes', item);
      const storedPrize = queue.item || item;
      voucherEntries.push({ kind: 'prize', tokenId: String(prize.tokenId), voucher: storedPrize.voucher, signature: storedPrize.signature, digest: storedPrize.digest });
      queued.push({ kind: 'prize', status: queue.status });
    }
    const addressKey = address.toLowerCase();
    voucherBook.set(addressKey, [...(voucherBook.get(addressKey) || []), ...voucherEntries]);
    return { vouchers: voucherEntries, queue: queued, pinning: pinResults };
  }

  function authorizeAdmin(req, currentConfig, registry) {
    const address = req.headers['x-admin-address'];
    const timestamp = Number(req.headers['x-admin-timestamp']);
    const signature = req.headers['x-admin-signature'];
    if (!address || !signature || !Number.isSafeInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
    let checksum;
    try { checksum = getAddress(address); } catch { return false; }
    const authText = `DecentVoyager admin queue\n${checksum.toLowerCase()}\n${timestamp}`;
    let recovered;
    try { recovered = getAddress(verifyMessage(authText, signature)); } catch { return false; }
    if (recovered !== checksum) return false;
    if (currentConfig.adminAddresses.length) return currentConfig.adminAddresses.includes(checksum.toLowerCase());
    return typeof registry.isAdmin === 'function' ? registry.isAdmin(checksum) : false;
  }

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/arena') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    arena.upgrade(req, socket, head);
  });
  const timer = setInterval(() => arena.tick().catch(() => {}), 1000 / 60);
  timer.unref();
  server.on('close', () => clearInterval(timer));

  return { server, arena, config, voucherBook, idempotency, usedTickets, ticketService, processRun, authorizeAdmin };
}

if (require.main === module) {
  const service = createService();
  const port = Number(process.env.PORT || 3000);
  service.server.listen(port, '0.0.0.0', () => console.log(`Decent Voyager referee listening on ${port}`));
}

module.exports = { createRateLimiter, createService, parseCsv, readJsonBody };
