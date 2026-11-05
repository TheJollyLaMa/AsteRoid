import { createArenaState, ENTRY_USDC } from './state.mjs';
import { createArenaClient } from './client.mjs';
import { requirePilot } from '../pilots/gate.mjs';

const state = createArenaState();
const modeValue = mode => mode === 'versus' ? 1 : 0;
async function addresses() {
  const response = await fetch(window.DECENT_CONFIG?.voyager?.contracts?.addressesUrl || './js/chain/addresses.json', { cache: 'no-store' });
  if (!response.ok) return null;
  const json = await response.json();
  return json.contracts || json;
}
function addressOf(source, name) { const value = source?.[name] || source?.[name[0].toLowerCase() + name.slice(1)] || source?.base?.[name] || source?.['8453']?.[name]; return typeof value === 'string' ? value : value?.address || null; }
export function mountArena() {
  const mount = document.getElementById('arena-lobby');
  if (!mount) return null;
  const status = mount.querySelector('[data-arena-status]');
  const mode = mount.querySelector('[name=arena-mode]');
  const playerCount = mount.querySelector('[name=arena-players]');
  const difficulty = mount.querySelector('[name=arena-difficulty]');
  const roundIdInput = mount.querySelector('[name=arena-round-id]');
  const online = mount.querySelector('[data-arena-online]');
  const couch = mount.querySelector('[data-arena-couch]');
  const setStatus = message => { status.textContent = message; };
  let client;
  const currentPilot = () => window.__voyagerPilot?.isPilot === true;
  const walletButtons = mount.querySelectorAll('[data-arena-claim], [data-arena-refund]');
  const setPilot = detail => { window.__voyagerPilot = detail || {}; for (const control of walletButtons) control.disabled = !detail?.isPilot; };
  setPilot(window.__voyagerPilot);
  window.addEventListener('voyager:pilot', event => setPilot(event.detail));
  couch?.addEventListener('click', () => {
    const game = window.voyager?.game || window.asteroidGame;
    if (!game?.setPlayers) { setStatus('Local couch play is not available in this game build yet.'); return; }
    if (state.get().phase === 'local') state.transition('idle');
    const players = Math.max(2, Math.min(5, Number(playerCount?.value) || 2));
    game.setPlayers(players, { mode: mode.value });
    state.transition('local', { mode: mode.value, network: 'couch', players: Array.from({ length: players }, (_, index) => `local-${index + 1}`), message: 'Free couch mode ready.' });
    setStatus(`Free couch mode: ${players} local pilots share this screen. Gamepads are supported when connected.`);
  });
  online?.addEventListener('click', () => void startOnline());
  mount.querySelector('[data-arena-join]')?.addEventListener('click', () => void startOnline(roundIdInput?.value.trim()));
  mount.querySelector('[data-arena-start]')?.addEventListener('click', () => { try { client?.send({ type: 'start', seed: Date.now() % 2147483647 }); setStatus('Online round started.'); } catch (error) { setStatus(error.message); } });
  async function startOnline(existingRoundId = null) {
    try { requirePilot(window.__voyagerPilot, 'Online arena'); } catch (error) { setStatus(`${error.message} Couch mode is free.`); return; }
    if (!currentPilot()) { setStatus('Online rounds are for Decent Pilots. Ask to join in the DecentAgency Discord; couch mode is free.'); return; }
    const refereeUrl = window.DECENT_CONFIG?.voyager?.refereeUrl;
    if (!refereeUrl) { setStatus('Online arena unavailable: referee server is not configured. Local couch mode remains free.'); return; }
    if (existingRoundId !== null && !/^\d+$/.test(existingRoundId)) { setStatus('Enter a numeric paid round ID.'); return; }
    if (state.get().phase === 'local') state.transition('idle');
    let contracts;
    try { contracts = await addresses(); } catch { contracts = null; }
    const arenaAddress = addressOf(contracts, 'VoyagerArena'), usdcAddress = addressOf(contracts, 'USDC');
    if (!arenaAddress || !usdcAddress) { setStatus('Online arena unavailable: Base arena or USDC contract address is not configured.'); return; }
    const wallet = window.DecentHead?.getWallet?.();
    if (!wallet?.snapshot?.().connected) { setStatus('Connect your wallet using the header fox to join an online round.'); return; }
    try {
      state.transition('connecting', { mode: mode.value, network: 'online' });
      const provider = await wallet.ensureChain(window.DECENT_CONFIG.voyager.chainId ? { ...window.DECENT_CONFIG.chain, chainId: window.DECENT_CONFIG.voyager.chainId } : undefined);
      const ethers = window.ethers || await (await import('../../vendor/decent-head/2.0.0/js/wallet.js')).loadEthers();
      const signer = await provider.getSigner();
      const pilotAddress = await signer.getAddress();
      if (!currentPilot() || pilotAddress.toLowerCase() !== window.__voyagerPilot.address?.toLowerCase()) throw new Error('Decent Pilot wallet changed; reconnect and retry');
      const arena = new ethers.Contract(arenaAddress, ['function createRound(bytes32,uint8,uint256,uint8,uint256) returns (uint256)', 'function join(uint256)', 'event RoundCreated(uint256 indexed roundId,bytes32 indexed gameId,address indexed referee,uint8 mode,uint256 entryFee,uint8 maxPlayers,uint256 joinDeadline)'], signer);
      const usdc = new ethers.Contract(usdcAddress, ['function approve(address,uint256) returns (bool)'], signer);
      const fee = ethers.parseUnits(ENTRY_USDC, 6), deadline = Math.floor(Date.now() / 1000) + 3600;
      const gameId = ethers.id('decent-voyager');
      const approvalGas = await usdc.approve.estimateGas(arenaAddress, fee);
      let roundId = existingRoundId;
      let createGas = null, predictedRoundId = null;
      if (roundId === null) {
        predictedRoundId = await arena.createRound.staticCall(gameId, modeValue(mode.value), fee, 5, deadline);
        createGas = await arena.createRound.estimateGas(gameId, modeValue(mode.value), fee, 5, deadline);
      }
      const details = roundId === null ? `Create a ${mode.value} round and join with $${ENTRY_USDC} USDC? Estimated gas: approval ${approvalGas}; create ${createGas}.` : `Join paid round ${roundId} with $${ENTRY_USDC} USDC? Estimated approval gas: ${approvalGas}.`;
      if (!window.confirm(`${details} Your wallet will request approval, arena, and session-signature actions.`)) { state.transition('idle'); return; }
      const approval = await usdc.approve(arenaAddress, fee); await approval.wait();
      if (roundId === null) {
        const tx = await arena.createRound(gameId, modeValue(mode.value), fee, 5, deadline), receipt = await tx.wait();
        for (const log of receipt.logs || []) { try { const event = arena.interface.parseLog(log); if (event?.name === 'RoundCreated') roundId = String(event.args.roundId ?? event.args[0]); } catch { } }
        if (!roundId && predictedRoundId !== undefined && predictedRoundId !== null) roundId = String(predictedRoundId);
        if (!roundId) throw new Error('Round was created but the referee contract did not expose a RoundCreated event ID. Contact the admin; do not retry create.');
      }
      const joinTx = await arena.join(roundId); await joinTx.wait();
      const timestamp = Math.floor(Date.now() / 1000), nonceBytes = crypto.getRandomValues(new Uint8Array(18));
      const nonce = btoa(String.fromCharCode(...nonceBytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const authMessage = `DecentVoyager arena session\n${pilotAddress.toLowerCase()}\n${timestamp}\n${nonce}`;
      const signature = await signer.signMessage(authMessage);
      let latestSnapshot = null;
      client = createArenaClient({ refereeUrl, onState: message => setStatus(`Arena relay: ${message}`), onMessage: message => {
        if (message.type === 'snapshot') latestSnapshot = message.state || message.snapshot;
        if (message.type === 'started' && state.get().phase === 'lobby') state.transition('playing');
        if (message.type === 'settled' || message.type === 'results' || message.type === 'roundEnd') {
          if (state.get().phase === 'lobby') state.transition('playing');
          state.transition('results', { roundId, message }); setStatus('Round finished. Review results to claim payout or refund on-chain.');
        }
        if (message.type === 'group-full') setStatus('Group full → new group created for the extra players.');
        if (message.type === 'error') setStatus(message.error || 'Arena relay error.');
      } });
      const socket = client.connect();
      socket.addEventListener('open', () => { try { client.send({ type: 'join', address: pilotAddress, mode: mode.value, difficulty: difficulty.value, paidRoundId: roundId, timestamp, nonce, signature }); } catch (error) { setStatus(error.message); } }, { once: true });
      const networkMode = window.voyager?.setNetworkMode;
      if (typeof networkMode === 'function') networkMode({ onInput: inputs => client?.send({ type: 'input', roundId, input: Array.isArray(inputs) ? inputs[0] : inputs }), snapshots: () => latestSnapshot });
      state.transition('lobby', { roundId, players: [pilotAddress], message: 'Paid round joined.' });
      setStatus(`Joined round ${roundId} with $${ENTRY_USDC} USDC. Waiting for pilots. Group cap: 5 ships.`);
    } catch (error) { try { state.transition('error', { message: error.message }); } catch { } const message = /RoundFull|Round full/i.test(error.message) ? 'Group full → create a new paid round for a new group.' : `Online arena unavailable: ${error.message}`; setStatus(message); }
  }
  mount.addEventListener('click', event => {
    if (event.target.matches('[data-arena-reset]')) { try { client?.send({ type: 'leave' }); } catch { } client?.close(); window.voyager?.setNetworkMode?.(null); try { state.transition('idle'); } catch { } setStatus('Arena lobby closed.'); }
    if (event.target.matches('[data-arena-claim]')) void settleAction('claim');
    if (event.target.matches('[data-arena-refund]')) void settleAction('cancelExpiredRound');
  });
  async function settleAction(action) {
    try {
      const contracts = await addresses(), arenaAddress = addressOf(contracts, 'VoyagerArena');
      if (!arenaAddress || !state.get().roundId) throw new Error('Round contract is unavailable');
      requirePilot(window.__voyagerPilot, 'Arena claim or refund');
      const wallet = window.DecentHead?.getWallet?.(), provider = wallet?.browserProvider;
      if (!provider) throw new Error('Connect the round wallet first');
      const ethers = window.ethers || await (await import('../../vendor/decent-head/2.0.0/js/wallet.js')).loadEthers();
      const method = action === 'cancelExpiredRound' ? action : 'claim';
      const contract = new ethers.Contract(arenaAddress, [`function ${method}(uint256)`], await provider.getSigner());
      const tx = await contract[method](state.get().roundId); await tx.wait();
      setStatus(method === 'claim' ? 'Payout or refund claimed on-chain.' : 'Expired round cancelled; refund credited. Use Claim round payout to withdraw USDC.');
    } catch (error) { setStatus(error.message); }
  }
  return { state, startOnline, client: () => client };
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountArena, { once: true }); else mountArena();
}
