import { node, createDialog, openDialog } from '../dnft/ui.mjs';

const dialog = createDialog('Flight reports', 'flight-diagnostics');
dialog.append(
  node('button', 'Download report', { id: 'diagnostic-download', type: 'button' }),
  node('button', 'Resume battle', { id: 'diagnostic-resume', type: 'button' }),
  node('p', '', { id: 'diagnostic-status', role: 'status', 'aria-live': 'polite' })
);
let opener = null;
window.addEventListener('voyager:open-reports', event => {
  opener = event.detail?.opener || null;
  if (window.voyager?.isNetworkMode?.()) { if (!dialog.open) dialog.showModal(); }
  else openDialog(dialog);
});
dialog.addEventListener('close', () => opener?.focus?.());

const status = document.getElementById('diagnostic-status');
const download = document.getElementById('diagnostic-download');
const resume = document.getElementById('diagnostic-resume');
const alert = document.getElementById('flight-fault');
const api = () => window.voyagerDiagnostics;
const FAULT_LABEL = { 'frame-error': 'Flight error', 'context-lost': 'Graphics restarting', 'performance-pause': 'Performance pause' };
// Older reports stay in the dialog; the banner reflects only the live fault.
function refresh() {
  const report = api()?.report();
  download.disabled = !report;
  const fault = api()?.activeFault?.();
  alert.hidden = !fault;
  if (fault) {
    const details = node('button', 'Flight reports', { type: 'button' });
    details.addEventListener('click', () => window.dispatchEvent(new CustomEvent('voyager:open-reports', { detail: { opener: details } })));
    alert.replaceChildren(`${FAULT_LABEL[fault.kind] || 'Flight notice'}: ${fault.message} `, details);
  }
  const entry = report?.entries.filter(item => !['battle-event', 'graphics-sample'].includes(item.kind)).at(-1);
  if (!entry) return;
  if (entry.kind === 'manual-resume') {
    status.textContent = 'Recovery requested.';
    return;
  }
  const when = entry.session === report.session ? '' : 'Previous visit · ';
  status.textContent = `${when}${entry.kind}: ${entry.message} Local report saved${report.storageError ? ' in memory only (browser storage unavailable)' : ' in this browser'}. Online rounds continue on the referee.`;
}
download.addEventListener('click', () => {
  const report = api()?.report();
  if (!report) { status.textContent = 'Diagnostics are unavailable; reload the page and try again.'; return; }
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'voyager-flight-report.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = 'Report downloaded. Review before sharing.';
});
resume.addEventListener('click', () => {
  try {
    if (!api()) throw new Error('Diagnostics are unavailable. Reload the page.');
    dialog.close();
    api().resume();
  } catch (error) { status.textContent = error.message; }
});
window.addEventListener('voyager:diagnostic', refresh);
window.addEventListener('asteroid:ready', refresh);
refresh();
