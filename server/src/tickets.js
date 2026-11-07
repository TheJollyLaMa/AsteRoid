'use strict';

const { createHmac, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { getAddress } = require('ethers');
const { stableJson } = require('./run-verifier');
const RULESET = require('../../src/js/ruleset');
const { gameForRuleset } = require('./replay-rulesets');

const TICKET_TTL_MS = 6 * 60 * 60 * 1000;
const UINT32_MAX = 0xffffffff;

function createTicketService({ secret, now = () => Date.now(), ttlMs = TICKET_TTL_MS } = {}) {
  if (!secret) throw new Error('TICKET_SECRET is required.');
  const key = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret), 'utf8');
  if (key.length < 32) throw new Error('TICKET_SECRET must contain at least 32 bytes.');

  function macFor(ticket) {
    return `0x${createHmac('sha256', key).update(stableJson(ticket), 'utf8').digest('hex')}`;
  }

  function issue(address) {
    const issuedAt = now();
    const ticket = {
      id: randomUUID(),
      ruleset: RULESET,
      address: getAddress(address),
      seed: randomBytes(4).readUInt32BE(0),
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(issuedAt + ttlMs).toISOString()
    };
    return { ticket, mac: macFor(ticket) };
  }

  function verify({ address, run, usedTickets = new Map() }) {
    const claim = run && run.ticket;
    if (!claim || typeof claim !== 'object' || !claim.ticket || typeof claim.mac !== 'string') {
      throw new Error('A server-issued flight ticket is required.');
    }
    const ticket = claim.ticket;
    gameForRuleset(run.ruleset);
    if (ticket.ruleset !== run.ruleset) throw new Error('Flight ticket ruleset does not match the run ruleset.');
    if (!ticket || typeof ticket !== 'object' || typeof ticket.id !== 'string' || ticket.id.length > 100 || !Number.isInteger(ticket.seed) || ticket.seed < 0 || ticket.seed > UINT32_MAX || typeof ticket.issuedAt !== 'string' || typeof ticket.expiresAt !== 'string') {
      throw new Error('Flight ticket is invalid.');
    }
    let ticketAddress;
    try { ticketAddress = getAddress(ticket.address); } catch { throw new Error('Flight ticket address is invalid.'); }
    if (ticketAddress.toLowerCase() !== getAddress(address).toLowerCase()) throw new Error('Flight ticket address does not match the signing wallet.');
    const issuedAt = Date.parse(ticket.issuedAt);
    const expiresAt = Date.parse(ticket.expiresAt);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt - issuedAt !== ttlMs || issuedAt > now() || expiresAt <= now()) {
      throw new Error('Flight ticket has expired or has an invalid lifetime. Request a new ticket.');
    }
    const expected = Buffer.from(macFor(ticket).slice(2), 'hex');
    const suppliedText = claim.mac.startsWith('0x') ? claim.mac.slice(2) : claim.mac;
    if (!/^[\da-f]{64}$/i.test(suppliedText)) throw new Error('Flight ticket MAC is invalid.');
    const supplied = Buffer.from(suppliedText, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('Flight ticket MAC is invalid.');
    if (ticket.seed !== run.seed) throw new Error('Flight ticket seed does not match the run seed.');
    const used = usedTickets.get(ticket.id);
    if (used && (used.runId !== run.runId || used.address !== ticketAddress.toLowerCase())) {
      throw new Error('Flight ticket has already been used for a different run. Request a new ticket.');
    }
    return { ticket, address: ticketAddress.toLowerCase(), expiresAt };
  }

  function consume(verifiedTicket, run, runHash, usedTickets = new Map()) {
    for (const [id, value] of usedTickets) if (now() - value.usedAt >= ttlMs) usedTickets.delete(id);
    const existing = usedTickets.get(verifiedTicket.ticket.id);
    if (existing && (existing.runId !== run.runId || existing.runHash !== runHash || existing.address !== verifiedTicket.address)) {
      throw new Error('Flight ticket has already been used for a different run. Request a new ticket.');
    }
    usedTickets.set(verifiedTicket.ticket.id, {
      runId: run.runId,
      runHash,
      address: verifiedTicket.address,
      usedAt: now()
    });
  }

  return { issue, verify, consume, ttlMs };
}

module.exports = { createTicketService, TICKET_TTL_MS, UINT32_MAX };
