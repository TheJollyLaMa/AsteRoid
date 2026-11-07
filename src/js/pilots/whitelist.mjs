const RAW = 'https://raw.githubusercontent.com/TheJollyLaMa/DecentVoyager/main/contributor-accounts.json';
const LOCAL = new URL('../../../contributor-accounts.json', import.meta.url);
const ADDRESS = /^0x[\da-f]{40}$/i;

export function parsePilots(value) {
  if (!Array.isArray(value?.contributors)) throw new Error('Pilot list requires a contributors array');
  return value.contributors.filter(entry => entry?.whitelisted !== false && ADDRESS.test(entry?.walletAddress || ''));
}

export async function loadPilots(fetchImpl = globalThis.fetch) {
  let lastError;
  for (const url of [RAW, LOCAL.href]) {
    try {
      const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Pilot list unavailable (${response.status})`);
      return parsePilots(await response.json());
    } catch (error) { lastError = error; }
  }
  throw new Error(`Decent Pilots list could not be loaded: ${lastError?.message || 'network unavailable'}`);
}

export function isWhitelisted(address, entries) {
  return !!address && ADDRESS.test(address) && entries.some(entry => entry.walletAddress.toLowerCase() === address.toLowerCase());
}

export function dispatchPilot(address, isPilot) {
  window.dispatchEvent(new CustomEvent('voyager:pilot', { detail: { address: address || null, isPilot: !!isPilot } }));
}

async function contractPilot(address) {
  const response = await fetch('./js/chain/addresses.json', { cache: 'no-store' });
  if (!response.ok) return null;
  const addresses = await response.json();
  const contracts = addresses.contracts || addresses;
  const configured = contracts.VoyagerPilots || contracts.voyagerPilots || contracts.base?.VoyagerPilots || contracts['8453']?.VoyagerPilots;
  const contractAddress = typeof configured === 'string' ? configured : configured?.address;
  if (!ADDRESS.test(contractAddress || '')) return null;
  const ethers = window.ethers || await (await import('../../vendor/decent-head/2.0.0/js/wallet.js')).loadEthers();
  const provider = new ethers.JsonRpcProvider(window.DECENT_CONFIG?.chain?.rpcUrls?.[0] || 'https://mainnet.base.org');
  return new ethers.Contract(contractAddress, ['function isPilot(address) view returns (bool)'], provider).isPilot(address);
}

export function mountPilots({ fetchImpl = globalThis.fetch, readOnChain = contractPilot } = {}) {
  let pilots = [], loading = null, generation = 0, currentAddress = null;
  const note = document.getElementById('pilot-note');
  const load = () => loading ||= loadPilots(fetchImpl).then(entries => { pilots = entries; });
  const update = async state => {
    const address = state?.connected ? state.address : null;
    if (address?.toLowerCase() !== currentAddress?.toLowerCase()) { currentAddress = address; generation++; }
    const request = generation;
    if (!address) { dispatchPilot(null, false); if (note) note.hidden = true; return { address: null, isPilot: false }; }
    try { await load(); } catch (error) {
      if (request === generation) {
        loading = null;
        dispatchPilot(address, false);
        if (note) { note.hidden = false; note.textContent = error.message; }
      }
      throw error;
    }
    let allowed = isWhitelisted(address, pilots);
    if (allowed) {
      try { const chainResult = await readOnChain(address); if (chainResult !== null) allowed = !!chainResult; } catch { /* The local contributor list remains the fallback if the optional registry is unavailable. */ }
    }
    if (request !== generation) throw new Error('Wallet changed during Pilot verification. Please retry.');
    dispatchPilot(address, allowed);
    if (note) { note.hidden = allowed; note.textContent = 'This wallet is not on the Decent Pilots list yet. Ask in the DecentAgency Discord. Cadet has 10 free levels; Pilot and Ace have 20. NFT rewards require an eligible wallet.'; }
    return { address, isPilot: allowed };
  };
  const refreshWallet = () => {
    void update(window.DecentHead?.getWallet?.()?.snapshot?.()).catch(error => {
      console.warn('[Voyager Pilots]', error.message);
    });
  };
  window.addEventListener('decenthead:ready', refreshWallet);
  window.addEventListener('decenthead:wallet', refreshWallet);
  if (window.DecentHead) refreshWallet();
  return { refresh: update, entries: () => pilots };
}

export const pilotController = typeof window !== 'undefined' && typeof document !== 'undefined' ? mountPilots() : null;
