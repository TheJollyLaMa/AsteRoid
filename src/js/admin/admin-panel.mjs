import { adminConfig, isAdmin, BASE_CHAIN } from './config.mjs';
import { PRODUCT_BATCH_ABI, parseQueue, buildProducts, verifyContract, reconcileReceipt } from './batch.mjs';
import { validAddress, assertJsonSafe, validateClaim, validateRecord } from '../dnft/validation.mjs';
import { gatewayUrl } from '../dnft/pin.mjs';
import { node, button, link, createDialog, openDialog } from '../dnft/ui.mjs';
import { pendingCounts, waitingTotal } from './pending.mjs';
import { mainnetEnsCache } from './ens-cache.mjs';
const RAW = 'https://raw.githubusercontent.com/TheJollyLaMa/DecentVoyager/main/';
const JOURNAL = 'asteroid-mint-journal/1';
const SUPPORTER_NFT = '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B';
const SUPPORTER_PRIZES = {
  '70': { project: 'DecentHead', label: 'DecentHead v2.0.0 #70', tier: 1, metadataURI: 'ipfs://QmVGmpz63TS9XkTHMxf2sybHv5k9Vdoyr2Spi9QqZ4pzfj' },
  '71': { project: 'DecentMarket', label: 'DecentMarket v0.3.1 #71', tier: 1, metadataURI: 'ipfs://QmUR29d2NeRH94ceLDxHqDvDi4eNdSRTNM1wZ6UPDsvWqi' },
  '75': { project: 'DecentBusking', label: 'DecentBusking v1.0.0 #75', tier: 2, metadataURI: 'ipfs://QmZroFCEhaKoctVqW682Uzv5i6WWiQtuWvTAYkQBYfH6TD' },
  '76': { project: 'BigNuten_Vanilla', label: 'BigNuten_Vanilla v3.3.0 #76', tier: 2, metadataURI: 'ipfs://QmSrAwCU5p1ga3RzpuDHZxezsNjob76ZSFpRzCuG15yYqU' },
  '78': { project: 'DecentPilgrimages', label: 'DecentPilgrimages v0.1.1 #78', tier: 2, metadataURI: 'ipfs://QmNe9SYSyrZYV66X29Wp4hBLbCDpQDjnJsAJLDdAytALEN' },
  '79': { project: 'DecentCanopy', label: 'DecentCanopy v0.1.0 #79', tier: 2, metadataURI: 'ipfs://QmQqQtuSeab78F3pdBcMbvSopYZLa51zJ4JxcodQ2ugy9d' },
};
export async function loadLedger(name, fetchImpl = globalThis.fetch) {
  for (const url of [RAW + name, new URL(`../../../${name}`, import.meta.url).href]) {
    try { const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) }); if (response.ok) return await response.json(); } catch { /* Fall back to host copy or an explicit import. */ }
  }
  throw new Error(`${name} unavailable. Publish the root ledger on main, provide a hosted copy, or paste JSON below.`);
}
export function parseWorkers(input) {
  assertJsonSafe(input);
  if (!Array.isArray(input?.contributors)) throw new Error('Contributors ledger requires a contributors array');
  return input.contributors.filter(worker => worker.whitelisted === true).map(worker => {
    if (!/^[-\w]{1,39}$/.test(worker.github || '') || (worker.walletAddress && !validAddress(worker.walletAddress))) throw new Error('Invalid contributor identity');
    return worker;
  });
}
async function ethersLibrary() { if (window.ethers) return window.ethers; return (await import('../../vendor/decent-head/2.0.0/js/wallet.js')).loadEthers(); }
export function mountAdmin() {
  if (document.getElementById('asteroid-admin')) return;
  const config = adminConfig(), preview = new URLSearchParams(location.search).get('adminPreview') === '1';
  const wallet = () => window.DecentHead?.getWallet?.();
  const authorized = () => !!wallet()?.snapshot?.().connected && isAdmin(wallet().snapshot().address, config.adminWallet);
  const dialog = createDialog('☥ Decent Voyager Admin', 'asteroid-admin');
  dialog.classList.add('voyager-admin');
  const status = node('p', preview ? 'READ-ONLY PREVIEW — no wallet prompts, uploads, or transactions.' : 'UI gating is not security. Contract roles authorize on-chain actions.', { className: 'asteroid-status', role: 'status', 'aria-live': 'polite' });
  const nav = node('nav', '', { role: 'tablist', 'aria-label': 'Admin sections' });
  const victories = node('section', '', { role: 'tabpanel', id: 'asteroid-victory-tab', 'aria-labelledby': 'asteroid-victory-tab-button' });
  const prizes = node('section', '', { role: 'tabpanel', id: 'asteroid-prizes-tab', 'aria-labelledby': 'asteroid-prizes-tab-button' }); prizes.hidden = true;
  const arena = node('section', '', { role: 'tabpanel', id: 'asteroid-arena-tab', 'aria-labelledby': 'asteroid-arena-tab-button' }); arena.hidden = true;
  const workers = node('section', '', { role: 'tabpanel', id: 'asteroid-worker-tab', 'aria-labelledby': 'asteroid-worker-tab-button' }); workers.hidden = true;
  const panels = [victories, prizes, arena, workers];
  const tabDefinitions = [['Victory Stamps', victories], ['Supporter Prizes', prizes], ['Arena Rounds', arena], ['Decent Pilots', workers]];
  const tabs = tabDefinitions.map(([label, panel], index) => {
    const tab = button(label, () => { panels.forEach(item => { item.hidden = item !== panel; }); tabs.forEach(item => item.setAttribute('aria-selected', String(item === tab))); });
    tab.setAttribute('role', 'tab'); tab.id = `${panel.id}-button`; tab.setAttribute('aria-controls', panel.id); tab.setAttribute('aria-selected', String(index === 0)); nav.append(tab); return tab;
  });
  nav.addEventListener('keydown', event => {
    const index = tabs.indexOf(document.activeElement);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus(); tabs[next].click();
  });
  dialog.append(status, nav, victories, prizes, arena, workers);
  const prizeCards = node('div');
  const arenaCards = node('div');
  const batchPreview = node('pre', '', { className: 'supporter-batch-preview', 'aria-label': 'Generated supporter release batch' });
  const releaseSelected = button('Simulate & confirm supporter release batch', () => void runSupporterBatch());
  let queue = { pending: [], minted: [] }, selected = new Set(), metadata = new Map(), minting = false;
  let prizeQueue = [], ensCachePromise = null, previewButton = null;
  let journal;
  try { journal = JSON.parse(localStorage.getItem(JOURNAL) || 'null'); } catch { journal = { unresolved: true }; }
  let report = null;
  const exportArea = node('textarea', '', { 'aria-label': 'Minted records export', readonly: '' });
  const cards = node('div');
  const importBox = node('textarea', '', { 'aria-label': 'Paste victory-stamps.json', placeholder: 'Paste { "pending": [...], "minted": [...] }' });
  const mint = button('Estimate & batch mint selected', () => void mintSelected());
  const switchButton = button('Switch wallet to Base', async () => { try { if (preview || !authorized()) throw new Error('Connect the admin wallet with the header fox.'); await wallet().ensureChain(BASE_CHAIN); status.textContent = 'Wallet switched to Base.'; } catch (error) { status.textContent = error.message; } });
  const check = button('Check saved transaction receipt', () => void checkSaved());
  const recoveryHash = node('input', '', { type: 'text', 'aria-label': 'Original or replacement mint transaction hash', placeholder: '0x… transaction hash from wallet history' });
  const recover = button('Recover original/replacement transaction', async () => {
    try {
      if (!journal?.claims || !/^0x[\da-f]{64}$/i.test(recoveryHash.value.trim())) throw new Error('A saved mint attempt and a valid wallet-history transaction hash are required');
      const { contract, provider } = await contractContext();
      const transaction = await provider.getTransaction(recoveryHash.value.trim());
      const products = buildProducts(journal.claims.map(validateClaim), config);
      if (!transaction || !isAdmin(transaction.from, journal.owner) || transaction.to?.toLowerCase() !== journal.contractAddress.toLowerCase() || transaction.value !== 0n || transaction.data.toLowerCase() !== contract.interface.encodeFunctionData('registerAndMintProductsBatch', [products]).toLowerCase()) throw new Error('Transaction does not match the saved owner, contract and exact products');
      journal.txHash = transaction.hash; localStorage.setItem(JOURNAL, JSON.stringify(journal)); await checkSaved();
    } catch (error) { status.textContent = error.message; }
  });
  prizes.append(node('h3', 'Supporter Prizes · Base'), node('p', 'Review queued supporter NFTs. The generated owner batch transfers each token from DecentMarket escrow into VoyagerPrizes, then calls VoyagerPrizes.adminRelease. Simulations and an explicit confirmation are required; preview mode never sends transactions.'), button('Reload supporter queue', () => void refreshPrizes()), releaseSelected, batchPreview, prizeCards);
  arena.append(node('h3', 'Arena Rounds'), node('p', 'Read-only Base rounds appear here when VoyagerArena is deployed. Settlement, claims, and refunds require an explicit wallet action.'), button('Reload arena queue', () => void refreshArena()), arenaCards);
  victories.append(node('h3', 'Victory Stamps · Base'), node('p', 'Player-submitted records are not anti-cheat proofs. Review metadata before selecting up to 20 stamps. Amount and maximum supply are one. This browser exports confirmed results; it cannot update GitHub.'), switchButton, mint, check, recoveryHash, recover, button('Reload public queue', () => void refreshQueue()), importBox, button('Import pasted queue', () => { try { queue = parseQueue(JSON.parse(importBox.value)); selected.clear(); metadata.clear(); renderCards(); } catch (error) { status.textContent = error.message; } }), cards, node('h3', 'Confirmed mint export'), exportArea, button('Copy confirmed export', async () => { try { if (!report) throw new Error('No confirmed mint export yet'); await navigator.clipboard.writeText(exportArea.value); status.textContent = 'Copied. Remove these records from pending and append to minted in victory-stamps.json in an owner-reviewed PR.'; } catch (error) { status.textContent = error.message; exportArea.focus(); exportArea.select(); } }));
  async function refreshPendingBadge() {
    if (!authorized() && !preview) return;
    try {
      const [stamps, payroll] = await Promise.all([loadLedger('victory-stamps.json'), loadLedger('payroll-queue.json')]);
      const rounds = await readArenaRounds();
      const counts = pendingCounts({ stamps, payroll, arena: { pending: (rounds || []).filter(round => round.status === 'Open') } });
      const total = waitingTotal(counts);
      tabs[0].textContent = `Victory Stamps${counts.stamps ? ` · ${counts.stamps}` : ''}`;
      tabs[1].textContent = `Supporter Prizes${counts.prizes ? ` · ${counts.prizes}` : ''}`;
      tabs[2].textContent = `Arena Rounds${counts.arena ? ` · ${counts.arena}` : ''}`;
      tabs[3].textContent = 'Decent Pilots';
      if (previewButton) previewButton.textContent = `☥ Admin preview · ${total} waiting for you`;
      adminLabel = `🛡 Admin · ${total} waiting for you`; attach();
    } catch {
      adminLabel = '🛡 Admin · queues unavailable'; attach();
    }
  }
  async function ensCache() {
    if (!ensCachePromise) ensCachePromise = mainnetEnsCache().catch(() => null);
    return ensCachePromise;
  }
  async function refreshPrizes() {
    prizeCards.replaceChildren(); batchPreview.textContent = ''; prizeQueue = [];
    try {
      const payroll = await loadLedger('payroll-queue.json');
      prizeQueue = (payroll.pending || []).filter(entry => entry.kind === 'supporter-prize' || entry.kind === 'supporterPrize');
      if (!prizeQueue.length) { prizeCards.append(node('p', 'No pending supporter prizes loaded. An unavailable queue is not proof that no requests exist.')); return; }
      for (const [index, original] of prizeQueue.entries()) {
        const entry = { ...(SUPPORTER_PRIZES[String(original.tokenId)] || {}), ...original, nftContract: original.nftContract || original.nft || SUPPORTER_NFT };
        let artwork = entry.image || entry.metadata?.image || '';
        if (!artwork && entry.metadataURI) { try { const response = await fetch(gatewayUrl(entry.metadataURI, config.gateway), { signal: AbortSignal.timeout(10000) }); if (response.ok) artwork = (await response.json()).image || ''; } catch { } }
        const icon = node('img', '', { src: artwork ? gatewayUrl(artwork, config.gateway) : './assets/brand/mandelblum-gate.png', alt: `${entry.project || 'Supporter'} token artwork`, loading: 'lazy' });
        icon.onerror = () => { icon.src = './assets/game/gate.png'; };
        card.append(icon, node('h3', entry.label || `${entry.project || 'Supporter NFT'} · #${entry.tokenId}`), node('p', `Tier ${entry.tier ?? '—'} · token ${entry.tokenId ?? '—'} · recipient ${entry.player || entry.claimant || 'unassigned'}`));
        const metadataURI = entry.metadataURI || entry.tokenURI || entry.uri;
        if (metadataURI) card.append(link('Prize metadata', gatewayUrl(metadataURI, config.gateway)));
        if (artwork) card.append(link('Token artwork', gatewayUrl(artwork, config.gateway)));
        const check = node('input', '', { type: 'checkbox', 'aria-label': `Select ${entry.label || `token ${entry.tokenId}`}` });
        check.checked = selected.has(`prize:${index}`); check.disabled = preview || !authorized(); check.addEventListener('change', () => { if (check.checked) selected.add(`prize:${index}`); else selected.delete(`prize:${index}`); });
        card.prepend(check); prizeCards.append(card);
        const recipient = entry.player || entry.claimant;
        if (recipient && validAddress(recipient)) {
          const info = node('span', recipient); card.append(info);
          void ensCache().then(cache => cache?.resolve(recipient)).then(identity => { if (identity?.name) { info.textContent = `${identity.name} · ${recipient}`; if (identity.avatar) { const avatar = node('img', '', { src: identity.avatar, alt: `${identity.name} avatar`, width: '36', height: '36', className: 'ens-avatar' }); card.prepend(avatar); } } });
        }
      }
    } catch (error) { prizeCards.append(node('p', error.message)); }
  }
  async function readArenaRounds() {
    try {
      const response = await fetch(window.DECENT_CONFIG?.voyager?.contracts?.addressesUrl || './js/chain/addresses.json', { cache: 'no-store' });
      if (!response.ok) return null;
      const book = await response.json(), contracts = book.contracts || book;
      const configured = contracts.VoyagerArena || contracts.voyagerArena || contracts.base?.VoyagerArena || contracts['8453']?.VoyagerArena;
      const arenaAddress = typeof configured === 'string' ? configured : configured?.address;
      if (!validAddress(arenaAddress)) return null;
      const ethers = await ethersLibrary(), provider = new ethers.JsonRpcProvider(config.rpcUrl);
      if ((await provider.getNetwork()).chainId !== 8453n) return null;
      const contract = new ethers.Contract(arenaAddress, ['function nextRoundId() view returns (uint256)', 'function rounds(uint256) view returns (bytes32,address,uint8,uint8,uint256,uint256,uint8,uint256)'], provider);
      const next = Number(await contract.nextRoundId()), first = Math.max(1, next - 50);
      const rows = await Promise.all(Array.from({ length: Math.max(0, next - first) }, (_, index) => first + index).map(async id => {
        const round = await contract.rounds(id), stateCode = Number(round.state ?? round[6]);
        return { id, mode: Number(round.mode ?? round[2]) === 1 ? 'versus' : 'co-op', maxPlayers: Number(round.maxPlayers ?? round[3]), participantCount: Number(round.participantCount ?? round[7]), status: ['Open', 'Settled', 'Cancelled'][stateCode] || 'Unknown', entryFee: String(round.entryFee ?? round[4]) };
      }));
      return rows.reverse();
    } catch { return null; }
  }
  async function refreshArena() {
    arenaCards.replaceChildren();
    const rounds = await readArenaRounds();
    if (!rounds) { arenaCards.append(node('p', 'Arena queue unavailable: VoyagerArena is not deployed/configured on Base.')); return; }
    const pending = rounds.filter(round => round.status === 'Open');
    if (!rounds.length) arenaCards.append(node('p', 'No arena rounds have been created on Base yet.'));
    for (const round of rounds) arenaCards.append(node('article', `Round ${round.id} · ${round.mode} · ${round.status} · ${round.participantCount}/${round.maxPlayers} pilots · ${round.entryFee} USDC units`));
    if (pending.length) arenaCards.prepend(node('p', `${pending.length} open arena round(s) waiting for you.`));
  }
  async function runSupporterBatch() {
    try {
      if (preview || !authorized()) throw new Error('Admin wallet required; preview cannot send transactions.');
      const selectedEntries = prizeQueue.filter((_, index) => selected.has(`prize:${index}`)).map(entry => ({ ...(SUPPORTER_PRIZES[String(entry.tokenId)] || {}), ...entry, nftContract: entry.nftContract || entry.nft || SUPPORTER_NFT }));
      if (!selectedEntries.length) throw new Error('Select at least one supporter prize');
      const response = await fetch(window.DECENT_CONFIG?.voyager?.contracts?.addressesUrl || './js/chain/addresses.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('VoyagerPrizes and escrow addresses are not configured');
      const book = await response.json(), contracts = book.contracts || book;
      const prizeValue = contracts.VoyagerPrizes || contracts.voyagerPrizes || contracts.base?.VoyagerPrizes || contracts['8453']?.VoyagerPrizes;
      const prizeAddress = typeof prizeValue === 'string' ? prizeValue : prizeValue?.address;
      const escrowAddress = contracts.DecentMarketEscrow || contracts.escrow || '0x31b07b83e99A9bdF379bf40225b8A80d3804C89d';
      if (!validAddress(prizeAddress) || !validAddress(escrowAddress)) throw new Error('Supporter release contract addresses are not configured');
      const walletSession = wallet(), provider = walletSession.browserProvider;
      if (!provider || (await provider.getNetwork()).chainId !== 8453n) throw new Error('Connect the admin wallet on Base.');
      const ethers = await ethersLibrary(), signer = await provider.getSigner();
      const escrow = new ethers.Contract(escrowAddress, ['function withdrawNFT(address,uint256,uint256,address)'], signer);
      const prizesContract = new ethers.Contract(prizeAddress, ['function adminRelease(address,address,uint256,uint256)', 'function inventory(address,uint256) view returns (uint256)'], signer);
      const batch = selectedEntries.map(entry => {
        const nft = entry.nftContract || entry.nft || entry.contractAddress || SUPPORTER_NFT;
        const id = String(entry.tokenId ?? entry.id ?? '');
        const to = entry.player || entry.claimant;
        if (!validAddress(nft) || !validAddress(to) || !/^\d+$/.test(id)) throw new Error('Selected prize is missing a valid NFT contract, token ID, or recipient');
        return { label: entry.label || `${entry.project || 'Supporter'} #${id}`, nft, tokenId: id, amount: String(entry.amount || 1), recipient: to, escrowArgs: [nft, id, String(entry.amount || 1), prizeAddress], releaseArgs: [to, nft, id, String(entry.amount || 1)] };
      });
      const estimates = [];
      for (const item of batch) {
        const inventory = await prizesContract.inventory(item.nft, item.tokenId), amount = BigInt(item.amount);
        const needsDeposit = inventory < amount;
        const escrowGas = needsDeposit ? await escrow.withdrawNFT.estimateGas(...item.escrowArgs) : null;
        const releaseGas = needsDeposit ? null : await prizesContract.adminRelease.estimateGas(...item.releaseArgs);
        estimates.push({ label: item.label, inventory: String(inventory), needsDeposit, escrowGas: escrowGas == null ? null : String(escrowGas), releaseGas: releaseGas == null ? null : String(releaseGas) });
        item.needsDeposit = needsDeposit;
      }
      batchPreview.textContent = JSON.stringify({ escrow: escrowAddress, voyagerPrizes: prizeAddress, batch, estimates }, null, 2);
      const depositsOnly = batch.some(item => item.needsDeposit);
      if (!window.confirm(`Simulations ${depositsOnly ? 'passed for escrow deposits' : 'passed for releases'} across ${batch.length} supporter prize(s). ${depositsOnly ? 'Deposit inventory into VoyagerPrizes now; reload and release after confirmation?' : 'Confirm VoyagerPrizes.adminRelease transactions?'}`)) return;
      for (const item of batch) {
        if (item.needsDeposit) { const withdrawn = await escrow.withdrawNFT(...item.escrowArgs); await withdrawn.wait(); }
        else { const released = await prizesContract.adminRelease(...item.releaseArgs); await released.wait(); }
      }
      status.textContent = depositsOnly ? 'Escrow deposits confirmed where needed. Reload after confirmation to simulate and release from VoyagerPrizes.' : `Released ${batch.length} supporter prize(s) to their recipients.`; if (!depositsOnly) selected.clear(); await refreshPrizes();
    } catch (error) { status.textContent = error.message; }
  }
  function renderCards() {
    cards.replaceChildren();
    releaseSelected.disabled = preview || !authorized();
    mint.disabled = preview || !authorized() || minting || !!journal || !selected.size;
    switchButton.disabled = preview || !authorized() || minting;
    check.disabled = preview || !authorized() || !journal?.txHash || minting;
    recover.disabled = preview || !authorized() || !journal?.claims || minting;
    if (journal) cards.append(node('p', `Saved/uncertain mint transaction ${journal.txHash || '(unknown)'}. Minting is locked. Check its receipt; never clear storage or re-mint to resolve uncertainty.`));
    if (!queue.pending.length) cards.append(node('p', 'No pending victory stamps loaded. An unavailable queue is not proof that no requests exist.'));
    for (const claim of queue.pending) {
      const card = node('article');
      const select = node('input', '', { type: 'checkbox', 'aria-label': `Select ${claim.recordId}` }); select.checked = selected.has(claim.recordId); select.disabled = preview || !authorized() || minting || !!journal || !metadata.has(claim.recordId);
      select.addEventListener('change', () => { if (select.checked && selected.size >= 20) { select.checked = false; status.textContent = 'Select at most 20 stamps'; return; } if (select.checked) selected.add(claim.recordId); else selected.delete(claim.recordId); mint.disabled = preview || !authorized() || minting || !!journal || !selected.size; });
      const image = node('img', '', { src: gatewayUrl(claim.image, config.gateway), alt: `Battle card for L${claim.level} ${claim.difficulty}`, loading: 'lazy', referrerpolicy: 'no-referrer' });
      image.addEventListener('error', () => { image.replaceWith(node('p', 'Battle thumbnail unavailable — use the metadata gateway link.')); }, { once: true });
      card.append(select, image, node('h3', `L${claim.level} · ${claim.difficulty} · Score ${claim.score.total}`), node('p', `${claim.completedAt} · Claimant ${claim.claimant}`), link('Metadata on IPFS', gatewayUrl(claim.tokenURI, config.gateway)));
      if (claim.issueNumber) card.append(link(`Review GitHub issue #${claim.issueNumber}`, `https://github.com/TheJollyLaMa/DecentVoyager/issues/${claim.issueNumber}`));
      if (metadata.has(claim.recordId)) { card.append(node('pre', JSON.stringify(metadata.get(claim.recordId).properties.record.stats, null, 2))); }
      else card.append(button('Load & review every stat', async () => {
        try {
          const response = await fetch(gatewayUrl(claim.tokenURI, config.gateway), { signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw new Error(`Metadata unavailable (${response.status})`);
          const value = await response.json(); assertJsonSafe(value);
          const record = validateRecord(value.properties?.record);
          if (value.properties?.schema !== 'asteroid-victory-metadata/1' || value.properties.chain !== 'base' || value.image !== claim.image || value.properties.claimant?.toLowerCase() !== claim.claimant.toLowerCase() || record?.id !== claim.recordId || record.level !== claim.level || record.difficulty !== claim.difficulty || record.completedAt !== claim.completedAt || !['total', 'level', 'bonus'].every(key => record.score?.[key] === claim.score[key]) || !record.stats) throw new Error('Metadata does not match this claim');
          metadata.set(claim.recordId, value); renderCards();
        } catch (error) { status.textContent = error.message; }
      })); cards.append(card);
    }
  }
  async function refreshQueue() {
    try { queue = parseQueue(await loadLedger('victory-stamps.json'));
      if (journal?.confirmed && journal.export?.every(saved => queue.minted.some(entry => entry.recordId === saved.recordId && entry.tokenURI === saved.tokenURI && entry.txHash === saved.txHash && String(entry.tokenId) === saved.tokenId))) { report = journal.export; exportArea.value = JSON.stringify({ minted: report }, null, 2); journal = null; localStorage.removeItem(JOURNAL); }
      selected.clear(); metadata.clear(); renderCards(); status.textContent = preview ? 'Read-only preview. Public queue loaded.' : 'Public queue loaded. Review metadata before selecting stamps.'; }
    catch (error) { status.textContent = error.message; renderCards(); }
  }
  async function refreshWorkers() {
    workers.replaceChildren(node('h3', 'Decent Pilots · contributor allowlist'));
    try {
      const [accounts, payroll] = await Promise.all([loadLedger('contributor-accounts.json'), loadLedger('payroll-queue.json')]);
      if (!Array.isArray(payroll.pending)) throw new Error('Payroll queue unavailable / invalid');
      for (const worker of parseWorkers(accounts)) {
        const pending = payroll.pending.filter(entry => entry.contributorGithub?.toLowerCase() === worker.github.toLowerCase());
        const card = node('article'); card.append(node('h3', worker.displayName || worker.github), link(`@${worker.github}`, `https://github.com/${worker.github}`), node('p', `${worker.role || 'Contributor'} · ${worker.walletAddress || 'No wallet — not eligible for wallet actions'}`), node('p', `Earned: ${JSON.stringify(worker.totalEarnedByCurrency || {})} · Pending: ${JSON.stringify(worker.pendingBalanceByCurrency || {})}`), node('p', `Issues closed: ${(worker.issuesClosed || []).length}`));
        for (const reference of worker.issuesClosed || []) { const match = /^TheJollyLaMa\/(?:DecentVoyager|AsteRoid)#(\d+)$/.exec(reference); if (match) card.append(link(`Closed issue #${match[1]}`, `https://github.com/TheJollyLaMa/DecentVoyager/issues/${match[1]}`)); }
        for (const entry of pending) { card.append(node('p', `Pending ${entry.amount} ${entry.currency} · ${entry.role || 'Contributor'}`)); if (Number.isSafeInteger(entry.issueNumber)) card.append(link(`Issue #${entry.issueNumber}`, `https://github.com/TheJollyLaMa/DecentVoyager/issues/${entry.issueNumber}`)); }
        workers.append(card);
      }
      workers.append(node('p', 'Pilot eligibility requires a wallet address and whitelisted status. Client checks are convenience only; contracts and referee verify eligibility. Payroll settlement is separate and is never initiated here.'));
      await Promise.all(parseWorkers(accounts).filter(worker => validAddress(worker.walletAddress)).map(async worker => { const identity = await (await ensCache())?.resolve(worker.walletAddress); if (!identity?.name) return; const card = [...workers.querySelectorAll('article')].find(item => item.textContent.includes(worker.github)); if (!card) return; const title = card.querySelector('h3'); title.textContent = identity.name; if (identity.avatar) { const image = node('img', '', { src: identity.avatar, alt: `${identity.name} avatar`, width: '36', height: '36', className: 'ens-avatar' }); title.before(image); } }));
    } catch (error) { workers.append(node('p', error.message)); }
  }
  async function contractContext() {
    if (preview || !authorized()) throw new Error('Admin wallet required. Click the header fox; preview cannot mint.');
    const session = wallet(), provider = session.browserProvider;
    if (!provider || (await provider.getNetwork()).chainId !== 8453n) throw new Error('Wallet must be on Base (8453). Use Switch wallet to Base.');
    const ethers = await ethersLibrary(); await verifyContract(provider, ethers.Contract, config);
    const signer = await provider.getSigner();
    if (!isAdmin(await signer.getAddress(), config.adminWallet)) throw new Error('Wallet changed; reconnect the configured admin.');
    return { contract: new ethers.Contract(config.contractAddress, PRODUCT_BATCH_ABI, signer), provider };
  }
  function publishExport(ids, receipt) {
    report = journal.claims.map((claim, index) => ({ ...claim, tokenId: ids[index], txHash: receipt.hash || journal.txHash, chainId: 8453, contractAddress: config.contractAddress, mintedAt: new Date().toISOString() }));
    exportArea.value = JSON.stringify({ minted: report }, null, 2);
    journal = { ...journal, confirmed: true, export: report }; localStorage.setItem(JOURNAL, JSON.stringify(journal));
    const idsSet = new Set(report.map(entry => entry.recordId)); queue.pending = queue.pending.filter(entry => !idsSet.has(entry.recordId)); queue.minted = queue.minted.filter(entry => !idsSet.has(entry.recordId)); queue.minted.push(...report); selected.clear();
    status.textContent = 'Confirmed on Base. Copy the export, remove matching pending entries, and append to minted in an owner-reviewed ledger PR. Minting remains locked until the public queue contains these exact confirmations.';
  }
  async function mintSelected() {
    if (minting || journal) return;
    minting = true; renderCards();
    try {
      const claims = queue.pending.filter(claim => selected.has(claim.recordId));
      if (claims.some(claim => !metadata.has(claim.recordId))) throw new Error('Review metadata for every selected record first');
      const products = buildProducts(claims, config); let { contract } = await contractContext();
      const gas = await contract.registerAndMintProductsBatch.estimateGas(products), gasLimit = gas * 120n / 100n;
      if (gasLimit > 8000000n) throw new Error('Gas too high; select fewer stamps');
      status.textContent = `Estimated gas ${gas}. Limit with 20% margin ${gasLimit}. Contract ${config.contractAddress}`;
      if (!window.confirm(`Mint ${claims.length} one-of-one victory stamps on Base?\nEstimated gas: ${gas}; limit: ${gasLimit}\nContract: ${config.contractAddress}\nRecipients: the listed claimants\nRoyalty: ${config.royaltyFeeBps / 100}% to admin\nWallet will show the final fee.`)) return;
      ({ contract } = await contractContext());
      journal = { claims, products, owner: config.adminWallet, contractAddress: config.contractAddress, startedAt: new Date().toISOString() }; localStorage.setItem(JOURNAL, JSON.stringify(journal));
      let transaction;
      try { transaction = await contract.registerAndMintProductsBatch(products, { gasLimit }); }
      catch (error) { if (error.code === 'ACTION_REJECTED' || error.code === 4001) { journal = null; localStorage.removeItem(JOURNAL); } throw error; }
      journal.txHash = transaction.hash; localStorage.setItem(JOURNAL, JSON.stringify(journal));
      status.textContent = `Broadcast ${transaction.hash}; waiting for confirmation. Do NOT retry.`;
      const receipt = await transaction.wait(); publishExport(reconcileReceipt(receipt, contract, products, config.adminWallet), receipt);
    } catch (error) { status.textContent = `${error.message}${journal ? '\nSaved transaction remains locked. Check receipt; do not re-mint.' : ''}`; }
    finally { minting = false; renderCards(); }
  }
  async function checkSaved() {
    if (!journal?.txHash) return;
    try {
      const { contract, provider } = await contractContext();
      if (journal.contractAddress.toLowerCase() !== config.contractAddress.toLowerCase()) throw new Error('Saved transaction belongs to a different contract. Restore that configuration.');
      const receipt = await provider.getTransactionReceipt(journal.txHash);
      if (!receipt) throw new Error('Transaction still pending or unavailable. Minting remains locked.');
      if (Number(receipt.status) === 0) { journal = null; localStorage.removeItem(JOURNAL); status.textContent = 'Saved transaction reverted; no mint was confirmed. Review before retrying.'; }
      else { const claims = journal.claims.map(validateClaim); const products = buildProducts(claims, config); publishExport(reconcileReceipt(receipt, contract, products, config.adminWallet), receipt); }
    } catch (error) { status.textContent = error.message; }
    renderCards();
  }
  async function open() { if (!preview && !authorized()) return; openDialog(dialog); await Promise.all([refreshQueue(), refreshWorkers(), refreshPrizes(), refreshArena(), refreshPendingBadge()]); }
  const observed = new WeakSet();
  let adminLabel = '🛡 Admin · waiting for you';
  function attach(root = document) {
    for (const element of root.querySelectorAll('*')) {
      if (element.localName === 'ankh-menu' && element.getAttribute('side') !== 'right' && element.shadowRoot) {
        const entry = element.shadowRoot.querySelector('.options button');
        // The admin ankh is always visible; only the configured admin wallet (or ?adminPreview=1) can open the panel.
        const locked = !preview && !authorized();
        if (entry) { entry.hidden = false; entry.disabled = locked; const label = locked ? '🛡 Admin · connect the admin wallet' : preview ? '🛡 Admin (read-only preview)' : adminLabel; if (entry.textContent !== label) entry.textContent = label; entry.title = locked ? 'Admin tools for the Decent Voyager steward wallet.' : ''; entry.style.cursor = locked ? 'not-allowed' : 'pointer'; entry.style.opacity = locked ? '.62' : ''; if (!entry.dataset.asteroidAdmin) { entry.dataset.asteroidAdmin = '1'; entry.addEventListener('click', () => void open()); } }
        element.hidden = false; element.style.display = ''; element.style.visibility = ''; element.inert = false; element.removeAttribute('aria-hidden');
      }
      if (element.shadowRoot) { if (!observed.has(element.shadowRoot)) { observed.add(element.shadowRoot); new MutationObserver(() => attach()).observe(element.shadowRoot, { childList: true, subtree: true }); } attach(element.shadowRoot); }
    }
  }
  new MutationObserver(() => attach()).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('decenthead:wallet', () => { attach(); if (!preview && !authorized() && dialog.open) dialog.close(); renderCards(); if (authorized()) void refreshPendingBadge(); });
  window.addEventListener('decenthead:ready', () => attach());
  attach(); renderCards(); if (authorized()) void refreshPendingBadge();
  if (preview) { previewButton = button('☥ Admin preview · waiting for you', () => void open()); previewButton.id = 'asteroid-admin-preview'; document.body.append(previewButton); void refreshPendingBadge(); }
  return { dialog, open };
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAdmin, { once: true }); else mountAdmin(); }
