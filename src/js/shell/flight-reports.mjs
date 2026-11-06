const status = document.getElementById('diagnostic-status');
const download = document.getElementById('diagnostic-download');
const resume = document.getElementById('diagnostic-resume');
const alert = document.getElementById('flight-fault');
const api = () => window.voyagerDiagnostics;
const FAULT_LABEL = { 'frame-error': 'Flight error', 'context-lost': 'Graphics restarting', 'performance-pause': 'Performance pause' };
// The banner reflects only the live fault in this page; older reports stay in
// the status line below the game.
function refresh() {
  const report = api()?.report();
  download.disabled = !report;
  const fault = api()?.activeFault?.();
  alert.hidden = !fault;
  if (fault) alert.textContent = `${FAULT_LABEL[fault.kind] || 'Flight notice'}: ${fault.message} Details: Flight reports & recovery below the game.`;
  const entry = report?.entries.filter(item => !['battle-event', 'graphics-sample'].includes(item.kind)).at(-1);
  if (!entry) return;
  if (entry.kind === 'manual-resume') {
    status.textContent = 'Recovery requested. If the error returns, download the report before reloading.';
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
  status.textContent = 'Report downloaded. Review it before attaching it to a Flight reports issue; nothing was uploaded automatically.';
});
resume.addEventListener('click', () => {
  try {
    if (!api()) throw new Error('Diagnostics are unavailable. Reload the page.');
    api().resume();
  } catch (error) { status.textContent = error.message; }
});
window.addEventListener('voyager:diagnostic', refresh);
window.addEventListener('asteroid:ready', refresh);
refresh();
