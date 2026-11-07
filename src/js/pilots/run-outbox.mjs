export const OUTBOX_KEY = 'decent-voyager-run-outbox/1';

function browserStorage() { try { return globalThis.localStorage; } catch { return null; } }
export function createRunOutbox({ storage = browserStorage(), fetchImpl = globalThis.fetch, baseUrl = () => globalThis.DECENT_CONFIG?.voyager?.refereeUrl || '', onChange = () => {} } = {}) {
  let memory = [], retrying = null;
  const read = () => { try { const value = JSON.parse(storage?.getItem(OUTBOX_KEY) ?? JSON.stringify(memory)); return Array.isArray(value) ? value : []; } catch { return [...memory]; } };
  const write = items => { memory = items; try { storage?.setItem(OUTBOX_KEY, JSON.stringify(items)); } catch { /* Keep the retry queue available in memory for this page session. */ } onChange(); };
  async function submit(item) {
    const url = baseUrl();
    if (!url) throw new Error('Referee server is not configured');
    const response = await fetchImpl(`${url.replace(/\/$/, '')}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(item) });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || `Referee rejected run (${response.status})`);
    }
    return response.json();
  }
  async function enqueue(item) {
    const items = read();
    if (!items.some(entry => entry.runHash === item.runHash && entry.address?.toLowerCase() === item.address?.toLowerCase())) items.push({ ...item, queuedAt: new Date().toISOString() });
    write(items);
    await retry();
    return read();
  }
  function retry() {
    if (retrying) return retrying;
    const request = retryBatch().finally(() => { if (retrying === request) retrying = null; });
    retrying = request;
    return request;
  }
  async function retryBatch() {
    const batch = read();
    const remaining = [];
    for (const item of batch) {
      try { await submit(item); }
      catch (error) { remaining.push({ ...item, lastError: error.message }); }
    }
    const added = read().filter(item => !batch.some(entry => entry.runHash === item.runHash && entry.address?.toLowerCase() === item.address?.toLowerCase()));
    write([...remaining, ...added]);
    return { sent: read().length === 0, pending: read().length };
  }
  return { read, enqueue, retry, submit };
}
