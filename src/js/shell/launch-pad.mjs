// Start-screen choices layered over the canvas title: solo voyage or the multiplayer battle form.
export function mountLaunchPad({ getGame = () => window.voyager?.game || window.asteroidGame } = {}) {
  const pad = document.getElementById('launch-pad'), arena = document.getElementById('arena-lobby'), canvas = document.getElementById('gameCanvas');
  if (!pad || !arena) return null;
  let arenaOpen = false;
  const refresh = () => {
    const onTitle = getGame()?.state === 'title';
    pad.hidden = !onTitle || arenaOpen;
    arena.hidden = !arenaOpen;
  };
  const closeArena = () => { arenaOpen = false; refresh(); canvas?.focus({ preventScroll: true }); };
  const launch = () => {
    const game = getGame();
    if (!game) return;
    closeArena();
    if (game.state === 'title') { game.handleAction('confirm'); window.asteroidDraw?.(); }
  };
  pad.querySelector('[data-launch-solo]')?.addEventListener('click', () => {
    const game = getGame();
    if (game?.playerCount > 1 && typeof game.setPlayers === 'function') game.setPlayers(1, { mode: 'coop' });
    launch();
  });
  pad.querySelector('[data-launch-multi]')?.addEventListener('click', () => {
    arenaOpen = true; refresh();
    window.dispatchEvent(new CustomEvent('voyager:arena-open'));
    arena.querySelector('input:checked, input, button')?.focus({ preventScroll: true });
  });
  arena.querySelector('[data-arena-back]')?.addEventListener('click', closeArena);
  arena.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeArena(); } event.stopPropagation(); });
  arena.addEventListener('keyup', event => event.stopPropagation());
  window.addEventListener('voyager:arena-launch', event => { if (event.detail?.network === 'couch') launch(); else closeArena(); });
  window.addEventListener('asteroid:event', refresh);
  setInterval(refresh, 250);
  refresh();
  return { refresh, openArena: () => pad.querySelector('[data-launch-multi]')?.click(), closeArena };
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountLaunchPad(), { once: true }); else mountLaunchPad();
}
