import { requirePilot } from './gate.mjs';
const ADDRESS = /^0x[\da-f]{40}$/i;
const BASE = { chainId: 8453, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] };
function contractAddress(book, name) { const values = book?.contracts || book || {}; const value = values[name] || values[name[0].toLowerCase() + name.slice(1)] || values.base?.[name] || values['8453']?.[name]; return typeof value === 'string' ? value : value?.address || null; }
export function normalizeVouchers(value) {
  const payload = value || {};
  const entries = Array.isArray(payload) ? payload : payload.vouchers || [];
  if (entries.length) return {
    stamps: entries.filter(item => item.kind === 'stamp').map(item => ({ ...item, voucher: item.voucher || item })),
    prizes: entries.filter(item => item.kind === 'prize').map(item => ({ ...item, voucher: item.voucher || item })),
  };
  return { stamps: payload.stamps || payload.victoryStamps || [], prizes: payload.prizes || payload.supporterPrizes || [] };
}
export function mountRewards() {
  const root = document.getElementById('pilot-rewards');
  if (!root) return null;
  const status = root.querySelector('[data-reward-status]');
  const list = root.querySelector('[data-reward-list]');
  let pilot = { address: null, isPilot: false };
  const message = text => { status.textContent = text; };
  async function load() {
    if (!pilot.isPilot || !pilot.address) { list.replaceChildren(); message('Voucher claims are available to Decent Pilots after a signed flight log.'); return; }
    const base = window.DECENT_CONFIG?.voyager?.refereeUrl;
    if (!base) { message('Referee vouchers are unavailable until the server is configured.'); return; }
    try {
      const response = await fetch(`${base.replace(/\/$/, '')}/vouchers/${encodeURIComponent(pilot.address)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Voucher service unavailable (${response.status})`);
      const vouchers = normalizeVouchers(await response.json());
      list.replaceChildren();
      const entries = [...vouchers.stamps.map(voucher => ({ kind: 'stamp', voucher })), ...vouchers.prizes.map(voucher => ({ kind: 'prize', voucher }))];
      if (!entries.length) { message('No vouchers are waiting yet. Sign a completed flight log to submit eligible records.'); return; }
      for (const entry of entries) {
        const { kind, voucher } = entry, title = kind === 'stamp' ? `Victory Stamp · level ${voucher.level ?? voucher.voucher?.level ?? '—'}` : `Supporter Prize · token ${voucher.tokenId ?? voucher.voucher?.tokenId ?? '—'}`;
        const row = document.createElement('article'); row.append(document.createElement('h3'));
        row.firstChild.textContent = title;
        const claim = document.createElement('button'); claim.type = 'button'; claim.textContent = 'Claim on-chain';
        claim.addEventListener('click', () => void claimVoucher(kind, voucher));
        row.append(claim); list.append(row);
      }
      message(`${entries.length} voucher${entries.length === 1 ? '' : 's'} waiting for you.`);
    } catch (error) { message(`${error.message}. Your local flight log and GitHub-issue fallback remain available.`); }
  }
  async function claimVoucher(kind, voucher) {
    try {
      requirePilot(pilot, 'Voucher claim');
      const wallet = window.DecentHead?.getWallet?.();
      if (!wallet?.snapshot?.().connected) throw new Error('Connect your Decent Pilot wallet with the header fox.');
      const contractsResponse = await fetch('./js/chain/addresses.json', { cache: 'no-store' });
      if (!contractsResponse.ok) throw new Error('Claim contracts are not configured');
      const book = await contractsResponse.json();
      const contractName = kind === 'stamp' ? 'VoyagerStamps' : 'VoyagerPrizes';
      const target = contractAddress(book, contractName);
      if (!ADDRESS.test(target || '')) throw new Error(`${contractName} address is not configured`);
      const provider = await wallet.ensureChain(BASE), ethers = window.ethers || await (await import('../../vendor/decent-head/2.0.0/js/wallet.js')).loadEthers();
      const signer = await provider.getSigner();
      if ((await signer.getAddress()).toLowerCase() !== pilot.address.toLowerCase()) throw new Error('Connected wallet no longer matches the Decent Pilot address');
      const abi = kind === 'stamp'
        ? ['function mintWithVoucher(bytes32 gameId,(address player,bytes32 recordId,uint16 level,uint8 difficulty,string metadataURI,uint256 deadline) voucher,bytes signature)']
        : ['function claim(bytes32 gameId,(address player,address nftContract,uint256 tokenId,uint8 tier,bytes32 runId,uint256 deadline) voucher,bytes signature)'];
      const contract = new ethers.Contract(target, abi, signer), method = kind === 'stamp' ? 'mintWithVoucher' : 'claim';
      if (typeof contract[method] !== 'function') throw new Error(`${contractName}.${method} is unavailable in this chain ABI`);
      const signature = voucher.signature || voucher.sig;
      if (!signature) throw new Error('Voucher signature is missing');
      const args = voucher.voucher || voucher, gameId = ethers.id('decent-voyager');
      const estimate = await contract[method].estimateGas(gameId, args, signature);
      if (!window.confirm(`Submit ${method} on Base? Estimated gas: ${estimate}. Your wallet will show the final transaction.`)) return;
      const tx = await contract[method](gameId, args, signature, { gasLimit: estimate * 120n / 100n });
      message(`Submitted ${tx.hash}; waiting for confirmation.`); await tx.wait(); message('Voucher claimed on-chain.'); await load();
    } catch (error) { message(error.message); }
  }
  window.addEventListener('voyager:pilot', event => { pilot = event.detail || {}; void load(); });
  window.addEventListener('decenthead:wallet', () => void load());
  window.addEventListener('asteroid:event', event => { if (['victory', 'gameOver', 'supporterCaptured'].includes(event.detail?.type)) void load(); });
  void load();
  return { load, getPilot: () => pilot };
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountRewards, { once: true }); else mountRewards();
}
