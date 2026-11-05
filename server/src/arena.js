'use strict';

const { randomUUID } = require('node:crypto');
const { verifyMessage, getAddress } = require('ethers');
const { createArenaGame } = require('./game-adapter');
const { normalizeAddress } = require('./run-verifier');

const DISCONNECT_GRACE_MS = 10_000;
const MAX_GROUP_SIZE = 5;
const INPUT_KEYS = ['left', 'right', 'up', 'down', 'fire', 'special', 'weaponNext', 'view'];

class LobbyManager {
  constructor({ now = () => Date.now(), graceMs = DISCONNECT_GRACE_MS, maxPlayers = MAX_GROUP_SIZE, finalLevel = 10 } = {}) {
    this.now = now;
    this.graceMs = graceMs;
    this.maxPlayers = maxPlayers;
    this.finalLevel = Number.isSafeInteger(finalLevel) && finalLevel >= 1 && finalLevel <= 20 ? finalLevel : 10;
    this.rooms = new Map();
  }

  join({ address, mode = 'coop', difficulty = 'cadet', paidRoundId = null, socket = null }) {
    const playerAddress = getAddress(address);
    if (!['coop', 'versus'].includes(mode)) throw new Error('Arena mode must be coop or versus.');
    if (!['cadet', 'pilot', 'ace'].includes(difficulty)) throw new Error('Arena difficulty is invalid.');
    const key = playerAddress.toLowerCase();
    for (const room of this.rooms.values()) {
      const existing = room.players.get(key);
      if (existing) {
        if (room.mode !== mode || room.difficulty !== difficulty || String(room.paidRoundId || '') !== String(paidRoundId || '')) {
          throw new Error('Wallet is already bound to a different arena lobby.');
        }
        if (existing.connected && existing.socket !== socket) throw new Error('Wallet already has an active arena connection.');
        existing.socket = socket || existing.socket;
        existing.connected = true;
        existing.disconnectedAt = null;
        return { room, player: existing, reconnected: true };
      }
    }
    let room = [...this.rooms.values()].find((candidate) =>
      !candidate.started && candidate.players.size < this.maxPlayers &&
      candidate.mode === mode && candidate.difficulty === difficulty &&
      String(candidate.paidRoundId || '') === String(paidRoundId || '')
    );
    if (!room) {
      room = {
        id: randomUUID(), mode, difficulty, paidRoundId: paidRoundId == null ? null : String(paidRoundId),
        players: new Map(), started: false, host: key, game: null, frame: 0, settleNonce: 0, finalLevel: this.finalLevel
      };
      this.rooms.set(room.id, room);
    }
    const player = {
      address: playerAddress, key, index: room.players.size, socket, connected: true,
      disconnectedAt: null, alive: true, input: {}
    };
    room.players.set(key, player);
    return { room, player, reconnected: false };
  }

  disconnect(address) {
    const key = normalizeAddress(address);
    if (!key) return false;
    for (const room of this.rooms.values()) {
      const player = room.players.get(key);
      if (player) {
        player.connected = false;
        player.socket = null;
        player.disconnectedAt = this.now();
        return true;
      }
    }
    return false;
  }

  tick(now = this.now()) {
    const expired = [];
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.alive && !player.connected && player.disconnectedAt != null && now - player.disconnectedAt >= this.graceMs) {
          player.alive = false;
          player.input = {};
          expired.push({ room, player });
        }
      }
    }
    return expired;
  }

  getRoom(id) { return this.rooms.get(id) || null; }
  values() { return this.rooms.values(); }
}

function sanitizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be an object.');
  const clean = {};
  for (const key of INPUT_KEYS) if (typeof input[key] === 'boolean') clean[key] = input[key];
  for (const key of ['ax', 'ay']) {
    if (input[key] !== undefined) {
      const value = Number(input[key]);
      if (!Number.isFinite(value) || value < -1 || value > 1) throw new Error(`${key} must be between -1 and 1.`);
      clean[key] = value;
    }
  }
  return clean;
}

function createPaidJoinVerifier({ rpcUrl, arenaAddress, methodName = 'hasJoined', chainId = 84532 }) {
  if (!rpcUrl || !arenaAddress) return async () => false;
  const { Contract, JsonRpcProvider, getAddress } = require('ethers');
  const provider = new JsonRpcProvider(rpcUrl, Number(chainId));
  const abi = [`function ${methodName}(uint256 roundId,address player) view returns (bool)`];
  const arena = new Contract(getAddress(arenaAddress), abi, provider);
  return async (roundId, address) => Boolean(await arena[methodName](BigInt(roundId), getAddress(address)));
}

class ArenaHub {
  constructor({ WebSocketServer, pilotRegistry, vouchers, verifyPaidJoin = async () => false, gameFactory = createArenaGame, now = () => Date.now(), originAllowed = () => true, finalLevel = 10 }) {
    this.WebSocketServer = WebSocketServer;
    this.pilotRegistry = pilotRegistry;
    this.vouchers = vouchers;
    this.verifyPaidJoin = verifyPaidJoin;
    this.gameFactory = gameFactory;
    this.now = now;
    this.originAllowed = originAllowed;
    this.lobby = new LobbyManager({ now, finalLevel });
    this.usedNonces = new Map();
    this.connections = new Map();
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
    this.wss.on('connection', (socket) => this.onConnection(socket));
    this.tickNumber = 0;
  }

  upgrade(request, socket, head) {
    if (!this.originAllowed(request.headers.origin || '')) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(request, socket, head, (ws) => this.wss.emit('connection', ws, request));
  }

  onConnection(socket) {
    socket.send(JSON.stringify({ type: 'hello', protocol: 1, auth: 'Sign the DecentVoyager arena session message before joining.' }));
    socket.on('message', async (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        await this.handleMessage(socket, message);
      } catch (error) {
        this.send(socket, { type: 'error', error: error.message });
      }
    });
    socket.on('close', () => {
      const address = this.connections.get(socket);
      if (address) this.lobby.disconnect(address);
      this.connections.delete(socket);
    });
  }

  send(socket, message) {
    if (socket && socket.readyState === 1) socket.send(JSON.stringify(message));
  }

  async handleMessage(socket, message) {
    if (message.type === 'join') return this.join(socket, message);
    const address = this.connections.get(socket);
    if (!address) throw new Error('Join the arena before sending game commands.');
    const playerKey = normalizeAddress(address);
    const room = [...this.lobby.values()].find((candidate) => candidate.players.has(playerKey));
    if (!room) throw new Error('Arena lobby no longer exists.');
    if (message.type === 'input') {
      const player = room.players.get(playerKey);
      if (!player.alive || !player.connected) throw new Error('This pilot is not active in the round.');
      player.input = sanitizeInput(message.input);
      return;
    }
    if (message.type === 'start') {
      if (room.host !== playerKey) throw new Error('Only the lobby host can start the round.');
      if (room.started) return;
      const players = [...room.players.values()].map((player) => player.address);
      room.game = this.gameFactory({ players: players.length, mode: room.mode, difficulty: room.difficulty, seed: Number(message.seed) || 0, startLevel: 1, pilot: { address, isPilot: true } });
      room.started = true;
      this.broadcast(room, { type: 'started', roomId: room.id, players });
      return;
    }
    if (message.type === 'leave') {
      const player = room.players.get(playerKey);
      player.alive = false;
      player.input = {};
      this.broadcast(room, { type: 'playerLeft', address });
      return;
    }
    throw new Error('Unknown arena message type.');
  }

  async join(socket, message) {
    if (this.connections.has(socket)) throw new Error('This connection has already joined.');
    const address = getAddress(message.address);
    const timestamp = Number(message.timestamp);
    const nonce = String(message.nonce || '');
    const nowSec = Math.floor(this.now() / 1000);
    if (!Number.isSafeInteger(timestamp) || Math.abs(nowSec - timestamp) > 300 || !/^[a-zA-Z0-9_-]{8,100}$/.test(nonce)) {
      throw new Error('Arena authentication timestamp or nonce is invalid.');
    }
    const nonceKey = `${address.toLowerCase()}:${nonce}`;
    if (this.usedNonces.has(nonceKey)) throw new Error('Arena authentication nonce was already used.');
    const authMessage = `DecentVoyager arena session\n${address.toLowerCase()}\n${timestamp}\n${nonce}`;
    let recovered;
    try { recovered = getAddress(verifyMessage(authMessage, message.signature)); }
    catch { throw new Error('Arena wallet signature is invalid.'); }
    if (recovered !== address) throw new Error('Arena wallet signature does not match the player.');
    if (!await this.pilotRegistry.isPilot(address)) throw new Error('Wallet is not a Decent Pilot.');
    const paidRoundId = message.paidRoundId == null ? null : String(message.paidRoundId);
    if (paidRoundId !== null) {
      if (!/^\d+$/.test(paidRoundId) || !await this.verifyPaidJoin(paidRoundId, address)) {
        throw new Error('Paid arena access requires an on-chain join for this wallet and round.');
      }
    }
    this.usedNonces.set(nonceKey, this.now());
    for (const [key, usedAt] of this.usedNonces) if (this.now() - usedAt > 600_000) this.usedNonces.delete(key);
    const joined = this.lobby.join({ address, mode: message.mode || 'coop', difficulty: message.difficulty || 'cadet', paidRoundId, socket });
    this.connections.set(socket, address);
    this.send(socket, { type: 'joined', roomId: joined.room.id, playerIndex: joined.player.index, reconnected: joined.reconnected, maxPlayers: MAX_GROUP_SIZE });
    this.broadcast(joined.room, { type: 'playerJoined', address, playerIndex: joined.player.index });
  }

  broadcast(room, message) {
    for (const player of room.players.values()) if (player.connected) this.send(player.socket, message);
  }

  async tick() {
    this.tickNumber += 1;
    for (const { room, player } of this.lobby.tick()) this.broadcast(room, { type: 'playerLeft', address: player.address, reason: 'disconnect-timeout' });
    for (const room of this.lobby.values()) {
      if (!room.started || !room.game) continue;
      const players = [...room.players.values()].sort((a, b) => a.index - b.index);
      try {
        room.game.step(players.map((player) => player.alive ? player.input : {}));
        if (typeof room.game.drainEvents === 'function') {
          for (const event of room.game.drainEvents()) {
            if (event.type === 'playerDied' && Number.isInteger(event.index) && players[event.index]) players[event.index].alive = Number(event.lives) > 0;
            this.broadcast(room, { type: 'event', event });
          }
        }
        if (this.tickNumber % 2 === 0) this.broadcast(room, { type: 'snapshot', frame: room.frame++, state: room.game.serialize() });
        const ended = ['victory', 'gameOver'].includes(room.game.state) || (room.paidRoundId && room.game.level && room.game.level.number >= room.finalLevel && room.game.state === 'levelComplete');
        if (ended) await this.finish(room, players);
      } catch (error) {
        room.started = false;
        this.broadcast(room, { type: 'error', error: `Authoritative simulation stopped: ${error.message}` });
      }
    }
  }

  async finish(room, players) {
    room.started = false;
    const survivors = players.filter((player) => player.alive).map((player) => player.address);
    const settle = room.paidRoundId ? await this.vouchers.settle({
      roundId: room.paidRoundId,
      survivors,
      nonce: room.settleNonce++,
      deadline: Math.floor(this.now() / 1000) + 3600
    }) : null;
    this.broadcast(room, { type: 'settled', survivors: settle ? settle.survivors : survivors, settle });
  }
}

module.exports = {
  ArenaHub,
  DISCONNECT_GRACE_MS,
  LobbyManager,
  MAX_GROUP_SIZE,
  createPaidJoinVerifier,
  sanitizeInput
};
