const KEY = 'decent-voyager-ens-cache/1';
const TTL = 30 * 24 * 60 * 60 * 1000;
export function createEnsCache({ storage = globalThis.localStorage, lookupName, lookupAvatar = async () => null, now = Date.now } = {}) {
  const inflight = new Map();
  const cached = address => {
    try {
      const entries = JSON.parse(storage?.getItem(KEY) || '{}');
      const item = entries[address.toLowerCase()];
      return item && now() - item.savedAt < TTL ? item : null;
    } catch { return null; }
  };
  const store = (address, value) => {
    try {
      const entries = JSON.parse(storage?.getItem(KEY) || '{}');
      entries[address.toLowerCase()] = { ...value, savedAt: now() };
      storage?.setItem(KEY, JSON.stringify(entries));
    } catch { /* Storage is optional; the current lookup still succeeds. */ }
  };
  async function resolve(address) {
    if (!/^0x[\da-f]{40}$/i.test(address || '')) return { name: null, avatar: null };
    const normalized = address.toLowerCase(), saved = cached(normalized);
    if (saved) return { name: saved.name || null, avatar: saved.avatar || null };
    if (inflight.has(normalized)) return inflight.get(normalized);
    const task = (async () => {
      try {
        if (!lookupName) return { name: null, avatar: null };
        const name = await lookupName(address);
        const avatar = name ? await lookupAvatar(name) : null;
        const value = { name: name || null, avatar: avatar || null };
        store(address, value); return value;
      } catch { return { name: null, avatar: null }; }
      finally { inflight.delete(normalized); }
    })();
    inflight.set(normalized, task); return task;
  }
  return { resolve, clear(address) { try { const entries = JSON.parse(storage?.getItem(KEY) || '{}'); delete entries[address.toLowerCase()]; storage?.setItem(KEY, JSON.stringify(entries)); } catch { } } };
}

export async function mainnetEnsCache() {
  const ethers = window.ethers || await (await import('../../vendor/decent-head/2.0.0/js/wallet.js')).loadEthers();
  const rpc = window.DECENT_CONFIG?.ens?.rpcUrl || 'https://ethereum-rpc.publicnode.com';
  const provider = new ethers.JsonRpcProvider(rpc);
  return createEnsCache({ lookupName: address => provider.lookupAddress(address), lookupAvatar: name => provider.getAvatar(name) });
}
