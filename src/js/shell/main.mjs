import { installProgressPanel } from './ipfs-save.mjs';
import { mount } from '../../vendor/dbusk-radio/0.2.0/widget.js';

window.DECENT_CONFIG.ipfsAdapter = installProgressPanel();
// Configuration and host controls must exist before DecentHead snapshots them.
await import('../../vendor/decent-head/2.0.0/js/main.js');

const aboutRoot = document.querySelector('decent-header').shadowRoot.querySelector('about-modal').shadowRoot;
const aboutArt = document.createElement('img');
aboutArt.src = new URL('../../assets/brand/mandelblum-gate.png', import.meta.url).href;
aboutArt.alt = 'Mandelblum portal art by TheJollyLaMa';
aboutArt.width = 96; aboutArt.height = 96;
aboutArt.style.cssText = 'display:block;object-fit:contain;margin:20px auto;filter:drop-shadow(0 0 16px #ff58ce45)';
aboutRoot.querySelector('dialog > p').after(aboutArt);

let radio;
const mountRadio = () => {
  radio = mount(document.getElementById('dbusk-radio'), {
    workerUrl: 'https://decentbusking.onrender.com', compact: true, theme: 'auto', volume: 0.08,
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
