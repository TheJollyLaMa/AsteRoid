const status = document.getElementById('diagnostic-status');
const download = document.getElementById('diagnostic-download');
const resume = document.getElementById('diagnostic-resume');
const alert = document.getElementById('flight-fault');
const api = () => window.voyagerDiagnostics;
function refresh() {
  const report = api()?.report();
  download.disabled = !report;
  const entry = report?.entries.at(-1);
  if (entry && ['frame-error', 'context-lost', 'context-restored', 'performance-pause'].includes(entry.kind)) {
    alert.hidden = false;
    alert.textContent = `${entry.kind}: ${entry.message} Scroll below the game to Flight reports & recovery.`;
  } else if (entry?.kind === 'manual-resume') alert.hidden = true;
  if (entry && !['battle-event', 'manual-resume'].includes(entry.kind)) {
    status.textContent = `${entry.kind}: ${entry.message} Local report saved${report.storageError ? ' in memory only (browser storage unavailable)' : ' in this browser'}. Online rounds continue on the referee.`;
  } else if (entry?.kind === 'manual-resume') status.textContent = 'Recovery requested. If the error returns, download the report before reloading.';
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
