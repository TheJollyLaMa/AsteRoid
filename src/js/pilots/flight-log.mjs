import { createRunOutbox } from './run-outbox.mjs';
import { createRunTicketManager } from './ticket.mjs';
const pilot = { address: null, isPilot: false };
let records = [], captures = [], runId = null, promptedRun = null;
const outbox = createRunOutbox();

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function logHash(runLog, ethers = globalThis.ethers) {
  if (!ethers?.keccak256 || !ethers?.toUtf8Bytes) throw new Error('Wallet signing library is unavailable');
  return ethers.keccak256(ethers.toUtf8Bytes(stableJson(runLog)));
}

export function mountFlightLog({ getGame = () => window.voyager?.game || window.asteroidGame, getWallet = () => window.DecentHead?.getWallet?.(), onStatus = () => {}, fetchImpl = globalThis.fetch } = {}) {
  const action = document.getElementById('flight-sign');
  const retryAction = document.getElementById('flight-retry');
  const status = document.getElementById('flight-status');
  const notify = text => { if (status) status.textContent = text; onStatus(text); };
  const tickets = createRunTicketManager({ fetchImpl, getGame, onStatus: notify });
  const refreshOutbox = () => { if (retryAction) retryAction.hidden = !pilot.isPilot || !outbox.read().length; }
  retryAction?.addEventListener('click', async () => { try { if (!pilot.isPilot) throw new Error('Retry is for Decent Pilots.'); const result = await outbox.retry(); notify(result.pending ? `${result.pending} signed run(s) remain queued for retry.` : 'Signed flight-log outbox is clear.'); refreshOutbox(); } catch (error) { notify(error.message); } });
  window.addEventListener('voyager:pilot', event => { pilot.address = event.detail?.address || null; pilot.isPilot = !!event.detail?.isPilot; tickets.setPilot(pilot); if (!pilot.isPilot && action) action.hidden = true; if (pilot.isPilot) { void outbox.retry().finally(refreshOutbox); } else refreshOutbox(); });
  window.setInterval(() => { if (pilot.isPilot && outbox.read().length) void outbox.retry().finally(refreshOutbox); }, 60000);
  refreshOutbox();
  window.addEventListener('asteroid:event', event => {
    const detail = event.detail || {};
    if (detail.type === 'levelStart') {
      const currentId = getGame()?.getRunLog?.()?.runId || null;
      if (currentId && currentId !== runId) { records = []; captures = []; promptedRun = null; if (action) action.hidden = true; tickets.runStarted(currentId); }
      runId = currentId || runId;
    }
    if (detail.type === 'levelRecord' && detail.record && !records.some(record => record.id === detail.record.id)) { records.push(detail.record); }
    if (detail.type === 'supporterCaptured') captures.push(detail);
    if (detail.type === 'victory' || detail.type === 'gameOver') {
      if (detail.type === 'gameOver') void tickets.refresh();
      const game = getGame();
      runId = game?.getRunLog?.()?.runId || runId || `voyager-${Date.now()}`;
      if (pilot.isPilot && promptedRun !== runId && (records.some(record => record.level === 20) || captures.length)) {
        promptedRun = runId;
        const hasTicket = !!game?.getRunLog?.()?.ticket;
        if (!hasTicket) notify('Rewards need a referee flight ticket. No ticket was attached; GitHub fallback: ☥ profile → Victory Vault → Request mint on GitHub.');
        if (action) { action.hidden = !hasTicket; action.disabled = false; action.textContent = 'Sign flight log'; action.onclick = async () => { action.disabled = true; try { await signFlight(); action.hidden = true; } catch (error) { notify(error.message); action.disabled = false; } }; }
      }
    }
  });
  async function signFlight() {
    if (!pilot.isPilot || !pilot.address) throw new Error('Decent Pilot wallet required');
    const session = getWallet(), game = getGame();
    if (!session?.browserProvider || !game?.getRunLog) throw new Error('Wallet or flight log is unavailable');
    const signer = await session.browserProvider.getSigner();
    if ((await signer.getAddress()).toLowerCase() !== pilot.address.toLowerCase()) throw new Error('Wallet changed; reconnect and retry');
    const runLog = game.getRunLog();
    if (!runLog || typeof runLog !== 'object') throw new Error('Run log is unavailable');
    if (!runLog.ticket) throw new Error('Rewards need a referee flight ticket. GitHub fallback: ☥ profile → Victory Vault → Request mint on GitHub.');
    const ethers = window.ethers || await (await import('../../vendor/decent-head/2.0.0/js/wallet.js')).loadEthers();
    const runHash = logHash(runLog, ethers);
    const signature = await signer.signMessage(runHash);
    const result = await outbox.enqueue({ address: pilot.address, run: runLog, runHash, signature });
    notify(result.length ? `Flight log saved locally; referee retry is queued. ${result[0].lastError || ''}` : 'Flight log signed and sent to the referee.');
    refreshOutbox();
    return result;
  }
  return { signFlight, outbox, tickets, records: () => [...records], captures: () => [...captures] };
}
export const flightLog = typeof window !== 'undefined' && typeof document !== 'undefined' ? mountFlightLog() : null;
