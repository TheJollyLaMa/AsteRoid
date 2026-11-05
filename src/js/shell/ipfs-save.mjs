export const CID_KEY = 'asteroid.ipfs.last-cid.v1';
const MAX_SAVE_BYTES = 4 * 1024 * 1024;
export const validCID = cid => typeof cid === 'string' && /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.test(cid) && cid.length <= 128;
export function validateSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Backup must be a game progress JSON object.');
  let serialized;
  try { serialized = JSON.stringify(value); } catch { throw new Error('Backup must be JSON-safe.'); }
  if (new TextEncoder().encode(serialized).length > MAX_SAVE_BYTES) throw new Error('Backup exceeds the 4 MB progress limit.');
  return value;
}
export function createSaveService({ getGame, getSession, storage, redraw = () => {} }) {
  const game = () => {
    const value = getGame();
    if (typeof value?.exportSave !== 'function' || typeof value?.importSave !== 'function') throw new Error('Progress save/restore is unavailable: the game is not ready or its save API is missing.');
    return value;
  };
  const session = () => {
    const value = getSession();
    if (typeof value?.upload !== 'function' || typeof value?.restore !== 'function') throw new Error('IPFS session is unavailable. Reload the page and choose a provider.');
    return value;
  };
  let pending = false;
  const run = async task => {
    if (pending) throw new Error('Another progress operation is already running.');
    pending = true;
    try { return await task(); } finally { pending = false; }
  };
  return {
    available: () => { try { game(); session(); return true; } catch { return false; } },
    lastCID: () => { try { const cid = storage?.getItem(CID_KEY); return validCID(cid) ? cid : ''; } catch { return ''; } },
    save: ({ consent = false } = {}) => run(async () => {
      if (!consent) throw new Error('Confirm that you want to publish your progress to IPFS.');
      const snapshot = validateSnapshot(await game().exportSave());
      const cid = await session().upload(snapshot);
      if (!validCID(cid)) throw new Error('The provider returned an invalid CID.');
      let remembered = true;
      try { if (!storage) remembered = false; else storage.setItem(CID_KEY, cid); } catch { remembered = false; }
      return { cid, remembered };
    }),
    restore: (cid, { consent = false } = {}) => run(async () => {
      if (!consent) throw new Error('Confirm that you want to replace your saved progress.');
      cid = String(cid || '').trim();
      if (!validCID(cid)) throw new Error('Enter a valid IPFS CID, not a gateway URL.');
      const current = game();
      const snapshot = validateSnapshot(await session().restore(cid));
      // The core owns schema/version/origin validation and atomic persistence.
      await current.importSave(snapshot);
      redraw();
      return { cid };
    })
  };
}

export function installProgressPanel(host = window) {
  let storage;
  try { storage = host.localStorage; } catch {}
  const service = createSaveService({ getGame: () => host.asteroidGame, getSession: () => host.DecentHead?.getIpfs(), storage, redraw: () => host.asteroidDraw?.() });
  const doc = host.document;
  const panel = doc.createElement('dialog');
  panel.className = 'progress-dialog';
  panel.setAttribute('aria-labelledby', 'progress-title');
  panel.innerHTML = `<div class="progress-heading"><h2 id="progress-title">IPFS · flight progress</h2><button type="button" data-close aria-label="Close progress panel">×</button></div>
    <p>Choose your provider in the header’s IPFS orbit → Storage provider. Pinata needs your own keys; local Kubo needs a running node with this origin allowed.</p>
    <p class="privacy-note">Uploads are public and unencrypted. A pin request is not permanent storage. Keep your CID and maintain your provider’s retention.</p>
    <p id="progress-provider"></p><p id="progress-ready" role="status"></p>
    <section><h3>Save flight progress</h3><label><input id="save-consent" type="checkbox"> I agree to publish my game progress and retained victory records to IPFS.</label><button id="save-progress" type="button">Save progress to IPFS</button></section>
    <section><h3>Last saved CID</h3><input id="last-cid" readonly aria-label="Last saved CID" placeholder="No save CID remembered in this browser"><div class="progress-actions"><button id="copy-cid" type="button">Copy CID</button><a id="cid-link" target="_blank" rel="noopener noreferrer" hidden>View on gateway ↗</a></div></section>
    <section><h3>Restore by CID</h3><label>Backup CID<input id="restore-cid" autocomplete="off" spellcheck="false" placeholder="bafy… or Qm…" maxlength="128"></label><label><input id="restore-consent" type="checkbox"> I agree to replace my saved progress with this validated backup.</label><button id="restore-progress" type="button">Restore progress</button></section>
    <p id="progress-status" role="status" aria-live="polite"></p>`;
  doc.body.append(panel);
  const $ = id => panel.querySelector(`#${id}`);
  const status = message => { $('progress-status').textContent = message; };
  let busy = false, lastCID = service.lastCID();
  const updateCID = () => {
    $('last-cid').value = lastCID;
    $('copy-cid').disabled = !lastCID;
    $('cid-link').hidden = !lastCID;
    const gateway = host.DecentHead?.getIpfs()?.options?.gateway || 'https://ipfs.io/ipfs/';
    if (lastCID) $('cid-link').href = `${gateway.replace(/\/?$/, '/')}${encodeURIComponent(lastCID)}`;
  };
  const update = () => {
    const available = service.available();
    $('progress-ready').textContent = available ? 'Game ready. Choose explicit save or restore below.' : 'Save/restore unavailable: waiting for the game save API. Try reloading if this persists.';
    $('progress-provider').textContent = `Provider: ${host.DecentHead?.getIpfs()?.provider || 'unavailable'}. Credentials never enter a progress backup.`;
    for (const id of ['save-progress', 'restore-progress']) $(id).disabled = busy || !available;
    updateCID();
  };
  const perform = async task => {
    if (busy) return;
    busy = true; update(); status('Working… closing this panel does not cancel a submitted operation.');
    try { await task(); } catch (error) { status(error.message || 'Progress operation failed.'); }
    finally { busy = false; update(); }
  };
  $('save-progress').onclick = () => perform(async () => {
    const result = await service.save({ consent: $('save-consent').checked });
    lastCID = result.cid; $('save-consent').checked = false;
    status(`Provider accepted the save. CID: ${lastCID}. ${result.remembered ? 'Remembered in this browser.' : 'Browser storage is unavailable: copy the CID now.'} Retention is not guaranteed.`);
  });
  $('restore-progress').onclick = () => perform(async () => {
    await service.restore($('restore-cid').value, { consent: $('restore-consent').checked });
    $('restore-consent').checked = false;
    host.asteroidGame?.state === 'playing' && host.asteroidGame.handleAction('pause');
    host.asteroidDraw?.();
    status('Validated progress restored and persisted by the game. Close this panel and press P to resume if paused.');
  });
  $('copy-cid').onclick = async () => {
    try { await host.navigator.clipboard.writeText(lastCID); status('CID copied. Keep your own copy.'); }
    catch { $('last-cid').focus(); $('last-cid').select(); status('Clipboard unavailable. Copy the selected CID manually.'); }
  };
  panel.querySelector('[data-close]').onclick = () => panel.close();
  panel.addEventListener('click', event => {
    const rect = panel.getBoundingClientRect();
    if (event.target === panel && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) panel.close();
  });
  host.addEventListener('asteroid:ready', update);
  host.addEventListener('decenthead:ipfs', update);
  return {
    version: 1, label: 'AsteRoid flight progress',
    capabilities: { backup: { open: () => {
      update();
      if (host.asteroidGame?.state === 'playing') { host.asteroidGame.handleAction('pause'); host.asteroidDraw?.(); }
      panel.showModal();
    } } },
    getStatus: async () => ({ backup: service.available()
      ? { state: 'idle', detail: 'Save or restore validated game progress. Nothing uploaded until you confirm.' }
      : { state: 'unavailable', detail: 'The game save API is not ready. Reload or wait for startup.' } })
  };
}
