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
// Slim header so the flight deck gets the page: smaller orbs, no tall vendor min-height.
if (!header.querySelector('style[data-voyager]')) {
  const slim = document.createElement('style'); slim.dataset.voyager = '';
  slim.textContent = `header{min-height:0!important;padding:6px clamp(10px,2vw,28px) 40px!important;align-items:center!important}
app-title{padding-top:0!important}
@media(max-width:600px){header{padding:6px 6px 8px!important}}`;
  header.append(slim);
}
quiet('wallet-connect', `.identity-note{display:none!important}
.orb[data-state="connected"] #connect{background:radial-gradient(circle at 32% 28%,#baffce55,#124f28 72%);--glow:#7dff8c;box-shadow:0 0 0 3px #7dff8c,0 0 30px #7dff8c77}
#status{max-width:150px;font-size:11px}
@media(max-width:600px){#status{max-width:100px;font-size:10px}}`);
quiet('ipfs-status', '#label{display:none!important}');
await import('./launch-reminder.mjs');

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
quiet('app-title', `p{display:none!important}
.name{display:inline-flex;align-items:center;gap:.28em;white-space:nowrap}
button{font-size:clamp(18px,5.2cqi,34px)}
.voyager-disc{width:.95em;height:.95em;animation:voyager-spin 18s linear infinite}
@keyframes voyager-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.voyager-disc{animation:none}}`);

let radio;
const slimRadio = () => {
  const root = document.getElementById('dbusk-radio')?.shadowRoot;
  if (!root || root.querySelector('style[data-voyager]')) return;
  const style = document.createElement('style'); style.dataset.voyager = '';
  style.textContent = `.radio{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-width:0}.controls{flex-wrap:nowrap;flex:none}
button,select{padding:1px 6px}.now{flex:1;min-width:0;padding:0;font-size:11px;opacity:.8;text-overflow:ellipsis;overflow:hidden}
.status:empty{display:none}.status{flex:1 0 100%;font-size:10px;white-space:normal;overflow-wrap:anywhere;min-width:0}`;
  root.append(style);
};
const mountRadio = () => {
  radio = mount(document.getElementById('dbusk-radio'), {
    workerUrl: 'https://decentbusking.onrender.com', compact: true, theme: 'dark', volume: 0.08,
    stations: [{ id: 'wqxr', label: 'WQXR', url: 'https://stream.wqxr.org/wqxr-web' }]
  });
  slimRadio();
};
mountRadio();
window.addEventListener('pagehide', () => radio?.destroy());
window.addEventListener('pageshow', event => { if (event.persisted) mountRadio(); });

const pause = () => {
  if (!window.voyager?.isNetworkMode?.() && window.asteroidGame?.state === 'playing') {
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
