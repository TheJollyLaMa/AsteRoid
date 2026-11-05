import { adminConfig, isAdmin, BASE_CHAIN } from './config.mjs';
import { PRODUCT_BATCH_ABI, parseQueue, buildProducts, verifyContract, reconcileReceipt } from './batch.mjs';
import { validAddress, assertJsonSafe, validateClaim, validateRecord } from '../dnft/validation.mjs';
import { gatewayUrl } from '../dnft/pin.mjs';
import { node, button, link, createDialog, openDialog } from '../dnft/ui.mjs';
const RAW = 'https://raw.githubusercontent.com/TheJollyLaMa/AsteRoid/main/';
const JOURNAL = 'asteroid-mint-journal/1';
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
    if (!/^[-\w]{1,39}$/.test(worker.github || '') || !validAddress(worker.walletAddress)) throw new Error('Invalid contributor identity');
    return worker;
  });
}
async function ethersLibrary() { if (window.ethers) return window.ethers; return (await import('../../vendor/decent-head/2.0.0/js/wallet.js')).loadEthers(); }
export function mountAdmin() {
  if (document.getElementById('asteroid-admin')) return;
  const config = adminConfig(), preview = new URLSearchParams(location.search).get('adminPreview') === '1';
  const wallet = () => window.DecentHead?.getWallet?.();
  const authorized = () => !!wallet()?.snapshot?.().connected && isAdmin(wallet().snapshot().address, config.adminWallet);
  const dialog = createDialog('☥ AsteRoid Admin', 'asteroid-admin');
  const status = node('p', preview ? 'READ-ONLY PREVIEW — no wallet prompts, uploads, or minting.' : 'UI gating is not security. Contract roles authorize minting.', { className: 'asteroid-status', role: 'status', 'aria-live': 'polite' });
  const nav = node('nav', '', { role: 'tablist', 'aria-label': 'Admin sections' });
  const victories = node('section', '', { role: 'tabpanel', id: 'asteroid-victory-tab', 'aria-labelledby': 'asteroid-victory-tab-button' });
  const workers = node('section', '', { role: 'tabpanel', id: 'asteroid-worker-tab', 'aria-labelledby': 'asteroid-worker-tab-button' }); workers.hidden = true;
  const tabs = [['Victory Stamps', victories, workers], ['Repo Workers', workers, victories]].map(([label, shown, hidden], index) => {
    const tab = button(label, () => { shown.hidden = false; hidden.hidden = true; tabs.forEach(item => item.setAttribute('aria-selected', String(item === tab))); });
    tab.setAttribute('role', 'tab'); tab.id = `${shown.id}-button`; tab.setAttribute('aria-controls', shown.id); tab.setAttribute('aria-selected', String(index === 0)); nav.append(tab); return tab;
  });
  nav.addEventListener('keydown', event => {
    const index = tabs.indexOf(document.activeElement);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus(); tabs[next].click();
  });
  dialog.append(status, nav, victories, workers);
  let queue = { pending: [], minted: [] }, selected = new Set(), metadata = new Map(), minting = false;
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
  victories.append(node('h3', 'Victory Stamps · Base'), node('p', 'Player-submitted records are not anti-cheat proofs. Review metadata before selecting up to 20 stamps. Amount and maximum supply are one. This browser exports confirmed results; it cannot update GitHub.'), switchButton, mint, check, recoveryHash, recover, button('Reload public queue', () => void refreshQueue()), importBox, button('Import pasted queue', () => { try { queue = parseQueue(JSON.parse(importBox.value)); selected.clear(); metadata.clear(); renderCards(); } catch (error) { status.textContent = error.message; } }), cards, node('h3', 'Confirmed mint export'), exportArea, button('Copy confirmed export', async () => { try { if (!report) throw new Error('No confirmed mint export yet'); await navigator.clipboard.writeText(exportArea.value); status.textContent = 'Copied. Remove these records from pending and append to minted in victory-stamps.json in an owner-reviewed PR.'; } catch (error) { status.textContent = error.message; exportArea.focus(); exportArea.select(); } }));
  function renderCards() {
    cards.replaceChildren();
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
      if (claim.issueNumber) card.append(link(`Review GitHub issue #${claim.issueNumber}`, `https://github.com/TheJollyLaMa/AsteRoid/issues/${claim.issueNumber}`));
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
    workers.replaceChildren(node('h3', 'Repo Workers · read-only payroll'));
    try {
      const [accounts, payroll] = await Promise.all([loadLedger('contributor-accounts.json'), loadLedger('payroll-queue.json')]);
      if (!Array.isArray(payroll.pending)) throw new Error('Payroll queue unavailable / invalid');
      for (const worker of parseWorkers(accounts)) {
        const pending = payroll.pending.filter(entry => entry.contributorGithub?.toLowerCase() === worker.github.toLowerCase());
        const card = node('article'); card.append(node('h3', worker.displayName || worker.github), link(`@${worker.github}`, `https://github.com/${worker.github}`), node('p', `${worker.role || 'Contributor'} · ${worker.walletAddress}`), node('p', `Earned: ${JSON.stringify(worker.totalEarnedByCurrency || {})} · Pending: ${JSON.stringify(worker.pendingBalanceByCurrency || {})}`), node('p', `Issues closed: ${(worker.issuesClosed || []).length}`));
        for (const reference of worker.issuesClosed || []) { const match = /^TheJollyLaMa\/AsteRoid#(\d+)$/.exec(reference); if (match) card.append(link(`Closed issue #${match[1]}`, `https://github.com/TheJollyLaMa/AsteRoid/issues/${match[1]}`)); }
        for (const entry of pending) { card.append(node('p', `Pending ${entry.amount} ${entry.currency} · ${entry.role || 'Contributor'}`)); if (Number.isSafeInteger(entry.issueNumber)) card.append(link(`Issue #${entry.issueNumber}`, `https://github.com/TheJollyLaMa/AsteRoid/issues/${entry.issueNumber}`)); }
        workers.append(card);
      }
      workers.append(node('p', 'Payroll is recorded by the GitHub bot. Settlement is intentionally outside this browser; this view never initiates payouts.'));
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
  async function open() { if (!preview && !authorized()) return; openDialog(dialog); await Promise.all([refreshQueue(), refreshWorkers()]); }
  const observed = new WeakSet();
  function attach(root = document) {
    for (const element of root.querySelectorAll('*')) {
      if (element.localName === 'ankh-menu' && element.getAttribute('side') !== 'right' && element.shadowRoot) {
        const entry = element.shadowRoot.querySelector('.options button');
        if (entry) { entry.hidden = !preview && !authorized(); entry.disabled = !preview && !authorized(); const label = preview ? 'Admin (read-only preview)' : 'Admin · Victory & Workers'; if (entry.textContent !== label) entry.textContent = label; if (!entry.dataset.asteroidAdmin) { entry.dataset.asteroidAdmin = '1'; entry.style.cursor = 'pointer'; entry.addEventListener('click', () => void open()); } }
        const details = element.shadowRoot.querySelector('details'); if (!preview && !authorized() && details) details.open = false;
        // Keep the grid slot so DecentHead's title stays centred; hide and disable it for non-admins.
        const locked = !preview && !authorized(); element.hidden = false; element.style.display = ''; element.style.visibility = locked ? 'hidden' : ''; element.inert = locked; if (locked) element.setAttribute('aria-hidden', 'true'); else element.removeAttribute('aria-hidden');
      }
      if (element.shadowRoot) { if (!observed.has(element.shadowRoot)) { observed.add(element.shadowRoot); new MutationObserver(() => attach()).observe(element.shadowRoot, { childList: true, subtree: true }); } attach(element.shadowRoot); }
    }
  }
  new MutationObserver(() => attach()).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('decenthead:wallet', () => { attach(); if (!preview && !authorized() && dialog.open) dialog.close(); renderCards(); });
  window.addEventListener('decenthead:ready', () => attach());
  attach(); renderCards();
  if (preview) { const previewButton = button('☥ Admin preview (read only)', () => void open()); previewButton.id = 'asteroid-admin-preview'; document.body.append(previewButton); }
  return { dialog, open };
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAdmin, { once: true }); else mountAdmin(); }
