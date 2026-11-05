import { installProgressPanel } from './ipfs-save.mjs';
import { mount } from '../../vendor/dbusk-radio/0.2.0/widget.js';

window.DECENT_CONFIG.ipfsAdapter = installProgressPanel();
// Configuration and host controls must exist before DecentHead snapshots them.
await import('../../vendor/decent-head/2.0.0/js/main.js');

// Keep the header orbs clean: the fox itself connects, so drop the helper text and the duplicate MetaMask link.
const header = document.querySelector('decent-header').shadowRoot;
const quiet = (selector, css) => {
  const root = header.querySelector(selector)?.shadowRoot;
  if (!root || root.querySelector('style[data-voyager]')) return;
  const style = document.createElement('style'); style.dataset.voyager = ''; style.textContent = css; root.append(style);
};
quiet('wallet-connect', '#mobile,#status,.identity-note{display:none!important}');
quiet('ipfs-status', '#label{display:none!important}');

// Put the Mandelblum disc between "Decent" and "Voyager" instead of before the whole name.
const centreDisc = () => {
  const root = header.querySelector('app-title')?.shadowRoot, name = root?.querySelector('.name'), disc = root?.querySelector('button > img');
  if (!name || !disc || name.dataset.voyager) return;
  const [first, ...rest] = name.textContent.trim().split(/\s+/);
  if (!rest.length) return;
  name.dataset.voyager = '';
  name.replaceChildren(first, disc, rest.join(' '));
  disc.classList.add('voyager-disc');
};
centreDisc();
quiet('app-title', `.name{display:inline-flex;align-items:center;gap:.28em;white-space:nowrap}
button{font-size:clamp(18px,8.4cqi,52px)}
.voyager-disc{width:.95em;height:.95em;animation:voyager-spin 18s linear infinite}
@keyframes voyager-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.voyager-disc{animation:none}}`);

let radio;
const mountRadio = () => {
  radio = mount(document.getElementById('dbusk-radio'), {
    workerUrl: 'https://decentbusking.onrender.com', compact: true, theme: 'dark', volume: 0.08,
    stations: [{ id: 'wqxr', label: 'WQXR', url: 'https://stream.wqxr.org/wqxr-web' }]
  });
};
mountRadio();
window.addEventListener('pagehide', () => radio?.destroy());
window.addEventListener('pageshow', event => { if (event.persisted) mountRadio(); });

const pause = () => {
  if (window.asteroidGame?.state === 'playing') {
    window.asteroidGame.handleAction('pause');
    window.asteroidDraw?.();
  }
};
// Observe native dialogs across shadow boundaries, including header and admin UI.
const observed = new WeakSet();
const observeDialogs = root => {
  if (observed.has(root)) return;
  observed.add(root);
  const scan = () => {
    for (const dialog of root.querySelectorAll('dialog[open]')) pause();
    for (const element of root.querySelectorAll('*')) if (element.shadowRoot) observeDialogs(element.shadowRoot);
  };
  new MutationObserver(scan).observe(root, { subtree:true, childList:true, attributes:true, attributeFilter:['open'] });
  scan();
};
observeDialogs(document);
window.addEventListener('decenthead:about', pause);

document.addEventListener('keydown', event => {
  const interactive = event.composedPath().some(node => node?.matches?.('input,textarea,select,button,a,[contenteditable="true"],dialog'));
  if (!interactive && window.asteroidGame?.state === 'playing' && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(event.key)) event.preventDefault();
}, { passive:false });
