import { requirePilot } from './gate.mjs';
import { node, createDialog, openDialog } from '../dnft/ui.mjs';
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
  if (document.getElementById('voyager-rewards')) return null;
  const root = createDialog('✦ Rewards waiting', 'voyager-rewards');
  const status = node('p', '', { role: 'status', 'aria-live': 'polite', className: 'asteroid-status' });
  const list = node('section', '', { 'aria-label': 'Rewards ready to claim' });
  root.append(node('p', 'Level-pass DNFTs and Supporter Vault prizes you earn as a Decent Pilot are signed by the referee and queued for minting. They wait here every time you log in. Claim each one on Base whenever you like.'), status, list);
  let opener = null;
  const announce = count => window.dispatchEvent(new CustomEvent('voyager:rewards-count', { detail: { count } }));
  window.addEventListener('voyager:open-rewards', event => { opener = event.detail?.opener || null; void load(); openDialog(root); });
  root.addEventListener('close', () => opener?.focus?.());
  let pilot = { address: null, isPilot: false };
  const message = text => { status.textContent = text; };
  async function load() {
    if (!pilot.isPilot || !pilot.address) { list.replaceChildren(); announce(0); message('Connect a Decent Pilot wallet with the header fox to see rewards queued for you.'); return; }
    const base = window.DECENT_CONFIG?.voyager?.refereeUrl;
    if (!base) { announce(0); message('The rewards referee is not online yet. Your wins are safe in the Victory Vault.'); return; }
    try {
      const response = await fetch(`${base.replace(/\/$/, '')}/vouchers/${encodeURIComponent(pilot.address)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Voucher service unavailable (${response.status})`);
      const vouchers = normalizeVouchers(await response.json());
      list.replaceChildren();
      const entries = [...vouchers.stamps.map(voucher => ({ kind: 'stamp', voucher })), ...vouchers.prizes.map(voucher => ({ kind: 'prize', voucher }))];
      announce(entries.length);
      if (!entries.length) { message('Nothing waiting yet. Clear a level, then sign your flight log at the end of the run.'); return; }
      for (const entry of entries) {
        const { kind, voucher } = entry, title = kind === 'stamp' ? `Level-pass DNFT · level ${voucher.level ?? voucher.voucher?.level ?? '—'}` : `Supporter Prize · token ${voucher.tokenId ?? voucher.voucher?.tokenId ?? '—'}`;
        const row = document.createElement('article'); row.append(document.createElement('h3'));
        row.firstChild.textContent = title;
        const claim = document.createElement('button'); claim.type = 'button'; claim.textContent = 'Claim on Base';
        claim.addEventListener('click', () => void claimVoucher(kind, voucher));
        row.append(claim); list.append(row);
      }
      message(`${entries.length} reward${entries.length === 1 ? '' : 's'} waiting for you.`);
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
      message(`Submitted ${tx.hash}; waiting for confirmation.`); await tx.wait(); message('Claimed! It is in your wallet now.'); await load();
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
