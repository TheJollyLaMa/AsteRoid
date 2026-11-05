import { CID_RE, validIpfs } from './validation.mjs';
export function gatewayUrl(uri, gateway = 'https://ipfs.io/ipfs/') {
  if (!validIpfs(uri)) return '';
  try { const url = new URL(gateway.replace(/\/?$/, '/') + uri.slice(7)); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export async function pinFile(session, blob, name, fetchImpl = globalThis.fetch) {
  if (!session?.options || !['pinata', 'local'].includes(session.provider)) throw new Error('Configure your IPFS session with the header IPFS controls first');
  if (!(blob instanceof Blob) || !blob.size || blob.size > 20 * 1024 * 1024) throw new Error('Upload must be nonempty and at most 20 MB');
  const body = new FormData(); body.append('file', blob, name);
  const local = session.provider === 'local';
  const endpoint = local ? `${session.options.local.apiUrl.replace(/\/$/, '')}/api/v0/add?pin=true` : session.options.pinata.uploadUrl;
  const response = await fetchImpl(endpoint, { method: 'POST', body, ...(local ? {} : { headers: session.headers() }), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`IPFS pin failed (HTTP ${response.status}). Check credentials / local Kubo CORS.`);
  const result = local ? JSON.parse((await response.text()).trim().split('\n').at(-1)) : await response.json();
  const cid = local ? result.Hash : result.IpfsHash;
  if (!CID_RE.test(cid || '')) throw new Error('IPFS provider returned an invalid CID');
  return `ipfs://${cid}`;
}
export function canvasBlob(canvas) {
  if (!canvas?.toBlob) throw new Error('Battle card renderer is unavailable; try again after game assets load');
  return new Promise((resolve, reject) => {
    try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Battle card could not be rendered as PNG')), 'image/png'); } catch (error) { reject(error); }
  });
}
