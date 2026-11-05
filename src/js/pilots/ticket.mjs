function parseSeed(value) {
  const seed = typeof value === 'string' && /^0x[\da-f]+$/i.test(value) ? Number.parseInt(value, 16) : Number(value);
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed >>> 0 : null;
}

function timestamp(value) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) {
    const number = Number(value);
    return number < 1e12 ? number * 1000 : number;
  }
  return Date.parse(value);
}

function isExpired(ticket, now) {
  const expiresAt = timestamp(ticket.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export function createRunTicketManager({
  fetchImpl = globalThis.fetch,
  baseUrl = () => globalThis.DECENT_CONFIG?.voyager?.refereeUrl || '',
  getGame = () => globalThis.window?.voyager?.game || globalThis.window?.asteroidGame,
  now = () => Date.now(),
  onStatus = () => {},
  pollInterval = 1000,
  setIntervalImpl = globalThis.setInterval,
  clearIntervalImpl = globalThis.clearInterval,
} = {}) {
  let pilot = { address: null, isPilot: false };
  let ticket = null, appliedId = null, inFlight = null, generation = 0, lastRunId = null;
  const report = text => onStatus(text);

  function ready() {
    const game = getGame();
    return !!(pilot.isPilot && pilot.address && baseUrl() && typeof game?.setNextRunSeed === 'function');
  }

  function applyIfTitle() {
    const game = getGame();
    if (!ready() || game?.state !== 'title' || !ticket || isExpired(ticket.ticket, now()) || appliedId === ticket.ticket.id) return false;
    try {
      game.setNextRunSeed(ticket.seed, { ticket: ticket.ticket, mac: ticket.mac });
      appliedId = ticket.ticket.id;
      report('Referee flight ticket ready for your next launch.');
      return true;
    } catch (error) {
      report(`Could not prepare referee flight ticket: ${error.message}`);
      return false;
    }
  }

  async function fetchTicket() {
    const address = pilot.address, url = baseUrl(), token = generation;
    if (!pilot.isPilot || !address) { report('Connect a Decent Pilot wallet to prepare referee flight tickets.'); return null; }
    if (!url) { report('Rewards need a referee flight ticket. The GitHub fallback remains in ☥ profile → Victory Vault → Request mint on GitHub.'); return null; }
    const game = getGame();
    if (typeof game?.setNextRunSeed !== 'function') { report('This game build cannot use referee flight tickets. Rewards need the referee; GitHub fallback remains in ☥ profile → Victory Vault.'); return null; }
    try {
      const response = await fetchImpl(`${url.replace(/\/$/, '')}/tickets`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }),
      });
      if (!response.ok) throw new Error(`Referee ticket request failed (${response.status})`);
      const result = await response.json();
      const value = result?.ticket, seed = parseSeed(value?.seed);
      if (token !== generation || pilot.address?.toLowerCase() !== address.toLowerCase()) return null;
      if (!value || typeof value.id !== 'string' || !value.id || !/^0x[\da-f]{40}$/i.test(value.address || '') || value.address.toLowerCase() !== address.toLowerCase() || seed === null || !result.mac || isExpired(value, now())) {
        throw new Error('Referee returned an invalid or expired flight ticket');
      }
      ticket = { ticket: value, mac: result.mac, seed };
      appliedId = null;
      applyIfTitle();
      return ticket;
    } catch (error) {
      if (token === generation) report(`Rewards need a referee flight ticket (${error.message}). GitHub fallback: ☥ profile → Victory Vault → Request mint on GitHub.`);
      return null;
    }
  }

  function ensureTicket() {
    if (!ready()) return Promise.resolve(null);
    if (ticket && !isExpired(ticket.ticket, now())) { applyIfTitle(); return Promise.resolve(ticket); }
    if (inFlight) return inFlight;
    const request = fetchTicket().finally(() => { if (inFlight === request) inFlight = null; });
    inFlight = request;
    return request;
  }

  function setPilot(state = {}) {
    const address = state.address || null, isPilot = !!state.isPilot;
    const changed = address?.toLowerCase() !== pilot.address?.toLowerCase() || isPilot !== pilot.isPilot;
    if (changed) {
      generation++;
      ticket = null; appliedId = null; inFlight = null; lastRunId = null;
    }
    pilot = { address, isPilot };
    if (isPilot && address) {
      if (!baseUrl()) report('Rewards need a referee flight ticket. The GitHub fallback remains in ☥ profile → Victory Vault → Request mint on GitHub.');
      else if (typeof getGame()?.setNextRunSeed !== 'function') report('This game build cannot use referee flight tickets. Rewards need the referee; GitHub fallback remains in ☥ profile → Victory Vault.');
      else void ensureTicket();
    } else report('');
  }

  function runStarted(runId) {
    if (runId && runId === lastRunId) return;
    lastRunId = runId || `run-${now()}`;
    if (appliedId || ticket) { ticket = null; appliedId = null; }
    if (pilot.isPilot) void ensureTicket();
  }

  const timer = setIntervalImpl(() => {
    if (!pilot.isPilot) return;
    const game = getGame();
    if (game?.state === 'title') { void ensureTicket(); applyIfTitle(); }
  }, pollInterval);
  return {
    ensureTicket,
    setPilot,
    runStarted,
    refresh: () => { if (ticket && isExpired(ticket.ticket, now())) { ticket = null; appliedId = null; } return ensureTicket(); },
    current: () => ticket,
    stop: () => clearIntervalImpl(timer),
  };
}
