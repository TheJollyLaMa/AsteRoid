export function mountCaptureBriefing({
  getGame = () => window.asteroidGame,
  getDetails = tokenId => window.AsteroidRender.supporterDetails(tokenId),
  isOnline = () => window.voyager?.isNetworkMode?.()
} = {}) {
  const dialog = document.getElementById('supporter-briefing');
  const title = dialog.querySelector('[data-capture-name]');
  const image = dialog.querySelector('[data-capture-image]');
  const imageStatus = dialog.querySelector('[data-capture-image-status]');
  const description = dialog.querySelector('[data-capture-description]');
  const next = dialog.querySelector('[data-capture-next]');
  const resume = dialog.querySelector('[data-capture-resume]');
  const queue = [], seen = new Set();
  let pausedByUs = false;
  const show = () => {
    const capture = queue.shift();
    if (!capture) return;
    const details = getDetails(capture.prize?.tokenId ?? capture.tokenId);
    title.textContent = details?.name || `Supporter DNFT #${capture.prize?.tokenId ?? capture.tokenId}`;
    description.textContent = details?.description || 'A Supporter capture was recorded. Artwork and project details are unavailable for this token.';
    image.hidden = true;
    imageStatus.textContent = 'Loading the metadata-derived artwork...';
    image.onload = () => { image.hidden = false; imageStatus.textContent = ''; };
    image.onerror = () => { image.hidden = true; imageStatus.textContent = 'Artwork unavailable. Open NFT metadata below to view its source.'; };
    if (details) { image.alt = details.name; image.src = new URL(details.image, document.baseURI).href; }
    else { image.removeAttribute('src'); imageStatus.textContent = 'Artwork unavailable for this token.'; }
    for (const [key, property] of [['project', 'projectUrl'], ['canopy', 'canopyUrl'], ['metadata', 'metadataUrl'], ['token', 'tokenUrl']]) {
      const link = dialog.querySelector(`[data-capture-link="${key}"]`);
      link.hidden = !details;
      if (details) link.href = details[property];
      else link.removeAttribute('href');
    }
    const online = isOnline();
    const game = getGame();
    if (!dialog.open) {
      pausedByUs = !online && game?.state === 'playing';
      if (pausedByUs) game.handleAction('pause');
      dialog.showModal();
    }
    next.textContent = `${capture.tier === 1 ? 'Sector II unlocked for this difficulty and team power refilled. ' : capture.tier === 2 ? 'Team power refilled. ' : ''}This is a recorded capture, not a confirmed NFT transfer. At victory or game over, choose Sign flight log. The referee verifies the run; then claim the funded reward from the rewards panel. If you leave now, the current unsent run may be lost.`;
    dialog.querySelector('[data-capture-pause-note]').textContent = online
      ? 'Online battle continues on the referee. Close this briefing promptly to keep flying.'
      : 'Your local battle is paused while you inspect the reward.';
    resume.textContent = queue.length ? 'View next reward' : online ? 'Back to online battle' : 'Continue voyage';
    window.asteroidDraw?.();
  };
  const continueFlight = () => {
    if (queue.length) { show(); return; }
    dialog.close();
    const game = getGame();
    if (pausedByUs && game?.state === 'paused' && !isOnline()) game.handleAction('pause');
    pausedByUs = false;
    document.getElementById('gameCanvas')?.focus({ preventScroll: true });
    window.asteroidDraw?.();
  };
  resume.addEventListener('click', continueFlight);
  dialog.querySelector('[data-capture-dismiss]').addEventListener('click', continueFlight);
  dialog.addEventListener('cancel', event => { event.preventDefault(); continueFlight(); });
  window.addEventListener('asteroid:event', event => {
    if (event.detail?.type !== 'supporterCaptured') return;
    const capture = event.detail;
    const key = `${getGame()?.runId}:${capture.prize?.tokenId ?? capture.tokenId}:${capture.tier}`;
    if (seen.has(key)) return;
    if (seen.size >= 40) seen.delete(seen.values().next().value);
    seen.add(key);
    queue.push(capture);
    if (!dialog.open) show();
    else resume.textContent = 'View next reward';
  });
  return { continueFlight };
}

if (typeof document !== 'undefined') mountCaptureBriefing();
