import { requirePilot } from './gate.mjs';
import { node, button, createDialog, openDialog } from '../dnft/ui.mjs';
import { flightLog } from './flight-log.mjs';
import { OUTBOX_KEY } from './run-outbox.mjs';
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
export function mountRewards({
  fetchImpl = globalThis.fetch,
  outbox = flightLog?.outbox,
  getDetails = tokenId => window.AsteroidRender?.supporterDetails?.(tokenId)
} = {}) {
  if (document.getElementById('voyager-rewards')) return null;
  const root = createDialog('✦ Captured rewards', 'voyager-rewards');
  const status = node('p', '', { role: 'status', 'aria-live': 'polite', className: 'asteroid-status' });
  const list = node('section', '', { 'aria-label': 'Rewards ready to claim' });
  const pendingList = node('section', '', { 'aria-label': 'Signed flights awaiting verification' });
  const retry = button('Retry verification', () => void retryVerification());
  retry.hidden = true;
  root.append(node('p', 'This is the redemption desk for past captures, not just your latest run. Capture → finish the run → Sign flight log → referee verification → Claim on Base. Signing is not an NFT transfer. Return with the same wallet to redeem valid vouchers before their expiry. Level-20 achievements are separate from Supporter captures.'),
    node('p', 'Local play pauses while this desk is open; close it and resume with P. Online battles continue on the referee.'),
    button('Refresh rewards', () => void load()), retry, pendingList, status, list);
  let opener = null;
  const announce = count => {
    for (const control of document.querySelectorAll('[data-open-rewards]')) control.textContent = `Captured rewards${count ? ` · ${count}` : ''}`;
    window.dispatchEvent(new CustomEvent('voyager:rewards-count', { detail: { count } }));
  };
  window.addEventListener('voyager:open-rewards', event => {
    opener = event.detail?.opener || null;
    void load();
    if (window.voyager?.isNetworkMode?.()) { if (!root.open) root.showModal(); }
    else openDialog(root);
  });
  for (const control of document.querySelectorAll('[data-open-rewards]')) {
    control.addEventListener('click', () => window.dispatchEvent(new CustomEvent('voyager:open-rewards', { detail: { opener: control } })));
  }
  root.addEventListener('close', () => opener?.focus?.());
  let pilot = { address: null, isPilot: false };
  let generation = 0;
  const message = text => { status.textContent = text; };
  function showPending() {
    pendingList.replaceChildren();
    const pending = pilot.isPilot && pilot.address
      ? (outbox?.read() || []).filter(item => item.address?.toLowerCase() === pilot.address.toLowerCase())
      : [];
    retry.hidden = !pending.length;
    if (pending.length) pendingList.append(node('h3', 'Awaiting referee verification'));
    for (const item of pending) {
      const row = node('article');
      const captures = item.run?.result?.captures || item.run?.summary?.captures || [];
      row.append(node('p', `${captures.length} captured reward(s) in signed flight ${item.run?.runId || 'unknown'}. Not claimable until verification succeeds.`));
      row.append(node('p', item.lastError || 'Signed flight queued for verification.', { className: 'asteroid-status' }));
      pendingList.append(row);
    }
    return pending.length;
  }
  async function retryVerification() {
    retry.disabled = true;
    try {
      requirePilot(pilot, 'Flight retry');
      if (!outbox) throw new Error('Signed flight-log outbox is unavailable.');
      await outbox.retry();
      await load();
    } catch (error) { message(error.message); }
    finally { retry.disabled = false; }
  }
  async function load() {
    const request = ++generation;
    const address = pilot.address;
    const pending = showPending();
    list.replaceChildren();
    if (!pilot.isPilot || !pilot.address) { list.replaceChildren(); announce(0); message('Connect a Decent Pilot wallet with the header fox to see rewards queued for you.'); return; }
    const base = window.DECENT_CONFIG?.voyager?.refereeUrl;
    if (!base) { announce(0); message('The rewards referee is not configured. Verified rewards cannot be loaded; signed logs stay in this browser.'); return; }
    message('Loading verified rewards for this wallet...');
    try {
      const response = await fetchImpl(`${base.replace(/\/$/, '')}/vouchers/${encodeURIComponent(address)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Voucher service unavailable (${response.status})`);
      const vouchers = normalizeVouchers(await response.json());
      if (request !== generation || address !== pilot.address) return;
      list.replaceChildren();
      const entries = [...vouchers.stamps.map(voucher => ({ kind: 'stamp', voucher })), ...vouchers.prizes.map(voucher => ({ kind: 'prize', voucher }))];
      const validCount = entries.filter(entry => Number(entry.voucher.voucher?.deadline ?? entry.voucher.deadline) * 1000 > Date.now()).length;
      announce(validCount);
      if (!entries.length) { message(pending ? 'No claim vouchers yet. The signed flights above still need referee verification; their errors explain what is blocking them.' : 'No verified rewards for this wallet yet. If you captured a token in an unfinished or unsigned run, finish the run and Sign flight log. Signed retries stay in this browser; verified vouchers are retrieved from the referee across visits.'); return; }
      for (const entry of entries) {
        const { kind, voucher } = entry, title = kind === 'stamp' ? `${Number(voucher.level ?? voucher.voucher?.level) === 20 ? 'Achievement NFT' : 'Previously issued level-pass DNFT'} · level ${voucher.level ?? voucher.voucher?.level ?? '—'}` : `Supporter Prize · token ${voucher.tokenId ?? voucher.voucher?.tokenId ?? '—'}`;
        const row = document.createElement('article'); row.append(document.createElement('h3'));
        row.firstChild.textContent = title;
        const args = voucher.voucher || voucher;
        const details = kind === 'prize' ? getDetails(voucher.tokenId ?? args.tokenId) : null;
        if (details) {
          row.firstChild.textContent = details.name;
          const image = node('img', '', { src: details.image, alt: details.name });
          image.addEventListener('error', () => { image.hidden = true; row.append(node('p', 'Reward artwork unavailable; voucher details remain below.')); }, { once: true });
          row.append(image);
        }
        if (voucher.awardKind) row.append(node('p', voucher.awardKind.replaceAll('-', ' ')));
        if (voucher.bonus) row.append(node('p', 'Perfect Pilot bonus: this single atomic claim transfers the BigNuten Supporter DNFT and 100 BNut together. If either transfer fails, neither is paid.'));
        const claim = document.createElement('button'); claim.type = 'button'; claim.textContent = 'Claim on Base';
        const deadline = Number(args.deadline) * 1000;
        const expired = !Number.isFinite(deadline) || deadline <= Date.now();
        row.append(node('p', expired ? 'Voucher expired or missing its deadline. A new flight or support review is needed; it cannot be claimed as-is.' : `Verified voucher · claim before ${new Date(deadline).toLocaleString()}. Your wallet will confirm the Base transaction.`));
        claim.disabled = expired;
        claim.addEventListener('click', async () => {
          claim.disabled = true;
          try { await claimVoucher(kind, voucher); }
          finally { claim.disabled = expired; }
        });
        row.append(claim); list.append(row);
      }
      message(`${validCount} valid reward voucher${validCount === 1 ? '' : 's'}.${entries.length > validCount ? ` ${entries.length - validCount} expired or invalid voucher(s) shown below.` : ''}`);
    } catch (error) { if (request === generation) { announce(0); message(`${error.message}. Your local flight log and GitHub-issue fallback remain available.`); } }
  }
  async function claimVoucher(kind, voucher) {
    try {
      requirePilot(pilot, 'Voucher claim');
      const wallet = window.DecentHead?.getWallet?.();
      if (!wallet?.snapshot?.().connected) throw new Error('Connect your Decent Pilot wallet with the header fox.');
      const contractsResponse = await fetchImpl('./js/chain/addresses.json', { cache: 'no-store' });
      if (!contractsResponse.ok) throw new Error('Claim contracts are not configured');
      const book = await contractsResponse.json();
      const bundle = kind === 'prize' && voucher.protocol === 'reward-bundle/1';
      const contractName = kind === 'stamp' ? 'VoyagerStamps' : bundle ? 'VoyagerRewards' : 'VoyagerPrizes';
      const target = contractAddress(book, contractName);
      if (!ADDRESS.test(target || '')) throw new Error(`${contractName} address is not configured`);
      const provider = await wallet.ensureChain(BASE), ethers = window.ethers || await (await import('../../vendor/decent-head/2.0.0/js/wallet.js')).loadEthers();
      const signer = await provider.getSigner();
      if ((await signer.getAddress()).toLowerCase() !== pilot.address.toLowerCase()) throw new Error('Connected wallet no longer matches the Decent Pilot address');
      const abi = kind === 'stamp'
        ? ['function mintWithVoucher(bytes32 gameId,(address player,bytes32 recordId,uint16 level,uint8 difficulty,string metadataURI,uint256 deadline) voucher,bytes signature)']
        : bundle
          ? ['function claim((bytes32 gameId,address player,address nftContract,uint256 tokenId,uint256 nftAmount,address paymentToken,uint256 tokenAmount,uint256 nativeAmount,bytes32 awardId,bytes32 claimId,bytes32 recordId,uint256 deadline) reward,bytes signature)']
          : ['function claim(bytes32 gameId,(address player,address nftContract,uint256 tokenId,uint8 tier,bytes32 runId,uint256 deadline) voucher,bytes signature)'];
      const contract = new ethers.Contract(target, abi, signer), method = kind === 'stamp' ? 'mintWithVoucher' : 'claim';
      if (typeof contract[method] !== 'function') throw new Error(`${contractName}.${method} is unavailable in this chain ABI`);
      const signature = voucher.signature || voucher.sig;
      if (!signature) throw new Error('Voucher signature is missing');
      const args = voucher.voucher || voucher, gameId = ethers.id('decent-voyager');
      const parameters = bundle ? [args, signature] : [gameId, args, signature];
      const estimate = await contract[method].estimateGas(...parameters);
      if (!window.confirm(`Submit ${method} on Base? Estimated gas: ${estimate}. Your wallet will show the final transaction.`)) return;
      const tx = await contract[method](...parameters, { gasLimit: estimate * 120n / 100n });
      message(`Submitted ${tx.hash}; waiting for confirmation.`); await tx.wait(); message('Claimed! It is in your wallet now.'); await load();
    } catch (error) { message(error.message); }
  }
  window.addEventListener('voyager:pilot', event => { pilot = event.detail || {}; void load(); });
  window.addEventListener('decenthead:wallet', () => void load());
  window.addEventListener('voyager:flight-outbox-changed', () => void load());
  window.addEventListener('storage', event => { if (event.key === OUTBOX_KEY) void load(); });
  window.addEventListener('asteroid:event', event => { if (['victory', 'gameOver', 'supporterCaptured'].includes(event.detail?.type)) void load(); });
  void load();
  return { load, getPilot: () => pilot };
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountRewards, { once: true }); else mountRewards();
}
