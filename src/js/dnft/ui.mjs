export function node(tag, text = '', attrs = {}) {
  const element = document.createElement(tag); element.textContent = text;
  for (const [key, value] of Object.entries(attrs)) { if (key === 'className') element.className = value; else element.setAttribute(key, value); }
  return element;
}
export function button(text, action) { const element = node('button', text, { type: 'button' }); element.addEventListener('click', action); return element; }
export function link(text, href) { return node('a', text, { href, target: '_blank', rel: 'noopener noreferrer' }); }
export function installStyle() {
  if (document.getElementById('asteroid-stamp-style')) return;
  const style = node('style', `
    .asteroid-panel { color:#eefaff; background:#091320; border:2px solid #68e7cf; border-radius:16px; padding:22px; width:min(900px,calc(100vw - 52px)); max-height:80dvh; overflow:auto; font:15px/1.6 system-ui; box-shadow:0 0 50px #39eec633; }
    .asteroid-panel::backdrop { background:#020712d9; }
    .asteroid-panel h2,.asteroid-panel h3 { color:#88ffee; margin:8px 0 14px; }
    .asteroid-panel button { cursor:pointer; padding:10px 15px; color:#ebffff; background:#183347; border:1px solid #77efd4; border-radius:9px; font:600 14px system-ui; margin:5px; }
    .asteroid-panel button:disabled { opacity:.45; cursor:not-allowed; }
    .asteroid-panel button:focus-visible,.asteroid-panel a:focus-visible { outline:3px solid #fbc770; outline-offset:3px; }
    .asteroid-panel a { color:#8cdbff; overflow-wrap:anywhere; }
    .asteroid-panel article { padding:15px; margin:14px 0; border:1px solid #36586a; border-radius:12px; background:#102132; overflow-wrap:anywhere; }
    .asteroid-panel p { margin:8px 0; }
    .asteroid-panel textarea { box-sizing:border-box; width:100%; min-height:110px; background:#04111c; color:#dcfff9; padding:10px; }
    .asteroid-panel img { width:160px; max-width:100%; border-radius:10px; }
    .asteroid-panel pre { white-space:pre-wrap; overflow-wrap:anywhere; }
    .asteroid-status { color:#ffdb87; white-space:pre-wrap; }
    .asteroid-panel nav { display:flex; flex-wrap:wrap; gap:8px; }
    .asteroid-panel [aria-selected=true] { background:#215c60; }
  `, { id: 'asteroid-stamp-style' }); document.head.append(style);
}
export function createDialog(title, id) {
  installStyle();
  const dialog = node('dialog', '', { id, className: 'asteroid-panel', 'aria-labelledby': `${id}-title` });
  dialog.append(node('h2', title, { id: `${id}-title` }), button('Close', () => dialog.close()));
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('keyup', event => event.stopPropagation());
  document.body.append(dialog); return dialog;
}
export function openDialog(dialog) {
  const game = window.asteroidGame;
  if (game?.state === 'playing') { game.handleAction?.('pause'); window.asteroidDraw?.(); }
  if (!dialog.open) dialog.showModal();
}
