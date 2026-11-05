import { VictoryVault } from './vault.mjs';
import { buildMetadata, buildClaim } from './metadata.mjs';
import { pinFile, canvasBlob, gatewayUrl } from './pin.mjs';
import { validAddress, parseQueue } from './validation.mjs';
import { node, button, link, createDialog, openDialog } from './ui.mjs';
export function issueUrl(claim) {
  const json = JSON.stringify(claim, null, 2);
  const params = new URLSearchParams({ template: 'victory-stamp.yml', labels: 'victory-stamp', title: `Victory stamp: L${claim.level} ${claim.difficulty} · ${claim.recordId}`, claim: json, body: `### Claim JSON\n\n\`\`\`json\n${json}\n\`\`\`` });
  return `https://github.com/TheJollyLaMa/AsteRoid/issues/new?${params}`;
}
function walletAddress() { const state = window.DecentHead?.getWallet?.()?.snapshot?.(); return state?.connected && validAddress(state.address) ? state.address : null; }
export function mountClaims() {
  if (document.getElementById('asteroid-victory-vault')) return;
  const vault = new VictoryVault(), busy = new Set();
  const dialog = createDialog('🏆 Victory Vault', 'asteroid-victory-vault');
  const intro = node('p', 'Every cleared level earns a local victory record. Stamp its battle card and all stats to your IPFS, then request an administrator mint on Base. A request is NOT an on-chain NFT. Game stays paused after closing.');
  const status = node('p', '', { role: 'status', 'aria-live': 'polite', className: 'asteroid-status' });
  const list = node('section', '', { 'aria-label': 'Cleared levels' }); dialog.append(intro, status, list);
  const toggle = button('🏆 Victory Vault (0)', () => { sync(); render(); openDialog(dialog); }); toggle.className = 'asteroid-vault-button'; document.body.append(toggle);
  function sync() { vault.merge(window.asteroidGame?.getWinRecords?.() || []); toggle.textContent = `🏆 Victory Vault (${vault.entries.length})`; }
  async function action(entry, task) {
    if (busy.has(entry.record.id)) return;
    busy.add(entry.record.id); render();
    try { await task(); } catch (error) { status.textContent = error.message; }
    finally { busy.delete(entry.record.id); render(); }
  }
  function render() {
    const retainFocus = dialog.contains(document.activeElement);
    list.replaceChildren(); toggle.textContent = `🏆 Victory Vault (${vault.entries.length})`;
    if (vault.error) status.textContent = vault.error;
    if (!vault.entries.length) list.append(node('p', 'No victories yet. Clear a level to collect your first battle stamp.'));
    for (const entry of [...vault.entries].reverse()) {
      const record = entry.record, card = node('article');
      card.append(node('h3', `L${record.level} ${record.levelName} · ${record.difficultyLabel || record.difficulty}`), node('p', `${new Date(record.completedAt).toLocaleString()} · Score ${record.score.total} · Accuracy ${(record.stats.accuracy * 100).toFixed(1)}%`), node('p', `Status: ${entry.status}`));
      const gateway = window.DecentHead?.getIpfs?.()?.options?.gateway;
      for (const [label, uri] of [['Battle PNG', entry.image], ['Metadata', entry.tokenURI]]) if (uri) { card.append(node('p', `${label} CID: ${uri.slice(7)}`), link(`Open ${label}`, gatewayUrl(uri, gateway))); }
      if (entry.txHash && /^0x[\da-f]{64}$/i.test(entry.txHash)) card.append(link('Mint transaction on BaseScan', `https://basescan.org/tx/${entry.txHash}`));
      if (entry.status !== 'minted') {
        const stamp = button(entry.tokenURI ? 'Re-stamp for connected wallet' : 'Stamp DNFT', () => action(entry, async () => {
          const claimant = walletAddress(); if (!claimant) throw new Error('Click the fox in the header to connect your wallet. No accounts are requested automatically.');
          const session = window.DecentHead?.getIpfs?.();
          if (!entry.image) {
            if (!window.AsteroidRender?.renderBattleCard) throw new Error('Battle card renderer is not available yet. Your win is saved; retry after loading the game.');
            status.textContent = 'Rendering and pinning battle PNG…';
            const image = await pinFile(session, await canvasBlob(await window.AsteroidRender.renderBattleCard(record)), `asteroid-L${record.level}.png`);
            vault.update(record.id, { image, status: 'PNG pinned; metadata not pinned' });
          }
          status.textContent = 'Pinning metadata with every win stat…';
          const metadata = buildMetadata(record, { image: entry.image, claimant, externalUrl: location.origin + location.pathname });
          const tokenURI = await pinFile(session, new Blob([JSON.stringify(metadata)], { type: 'application/json' }), `asteroid-L${record.level}-metadata.json`);
          vault.update(record.id, { tokenURI, claimant, status: 'pinned', claim: null });
          status.textContent = 'Pinned. Request mint to submit to the administrator; no mint transaction has been sent.';
        })); stamp.disabled = busy.has(record.id) || entry.status === 'requested'; card.append(stamp);
        if (entry.tokenURI) {
          const request = button('Request mint on GitHub', () => {
            try {
              const claimant = walletAddress(); if (!claimant) throw new Error('Connect your wallet with the header fox before requesting a mint.');
              if (claimant.toLowerCase() !== entry.claimant?.toLowerCase()) throw new Error('Wallet changed. Re-stamp the metadata for this wallet first.');
              const claim = entry.claim || buildClaim(record, { tokenURI: entry.tokenURI, image: entry.image, claimant });
              const tab = window.open(issueUrl(claim), '_blank');
              if (tab) tab.opener = null;
              vault.update(record.id, { claim, status: 'requested' });
              status.replaceChildren(node('span', 'Claim prepared. Submit the opened GitHub form to actually join the queue. If blocked, '), link('open issue form', issueUrl(claim)), node('span', '. Requested is not minted.'));
              render();
            } catch (error) { status.textContent = error.message; }
          }); request.disabled = busy.has(record.id); card.append(request);
          card.append(button('Copy claim JSON', () => action(entry, async () => {
            const claimant = walletAddress(); if (!claimant || claimant.toLowerCase() !== entry.claimant?.toLowerCase()) throw new Error('Connect the wallet used to stamp this record with the header fox.');
            const claim = entry.claim || buildClaim(record, { tokenURI: entry.tokenURI, image: entry.image, claimant });
            vault.update(record.id, { claim });
            if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(JSON.stringify(claim, null, 2)); status.textContent = 'Claim JSON copied. Submit it in a victory-stamp GitHub issue.'; }
            else { const text = node('textarea', JSON.stringify(claim, null, 2), { 'aria-label': 'Claim JSON' }); status.replaceChildren(text); text.focus(); text.select(); }
          })));
        }
      }
      list.append(card);
    }
    if (retainFocus && document.activeElement === document.body) dialog.querySelector('button')?.focus();
  }
  async function reconcile() {
    try {
      const response = await fetch('https://raw.githubusercontent.com/TheJollyLaMa/AsteRoid/main/victory-stamps.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) return;
      for (const minted of parseQueue(await response.json()).minted) {
        const entry = vault.entries.find(item => item.record.id === minted.recordId && item.tokenURI === minted.tokenURI && item.claimant?.toLowerCase() === minted.claimant.toLowerCase());
        if (entry && /^0x[\da-f]{64}$/i.test(minted.txHash || '') && /^\d+$/.test(String(minted.tokenId))) vault.update(entry.record.id, { status: 'minted', txHash: minted.txHash, tokenId: String(minted.tokenId) });
      }
      render();
    } catch { /* An unavailable public ledger must not erase local claim state. */ }
  }
  window.addEventListener('asteroid:event', event => { if (event.detail?.type === 'levelRecord' && event.detail.record) { vault.merge([event.detail.record]); render(); } });
  window.addEventListener('asteroid:ready', () => { sync(); render(); });
  window.addEventListener('asteroid:save-imported', () => { sync(); render(); });
  window.addEventListener('decenthead:wallet', render);
  dialog.addEventListener('close', () => toggle.focus());
  sync(); render(); void reconcile();
  return { vault, dialog, refresh: sync };
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountClaims, { once: true }); else mountClaims();
}
