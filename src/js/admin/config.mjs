export const DEFAULT_ADMIN = '0x807061DF657A7697c04045dA7d16D941861cAABc';
export const VERIFIED_CONTRACT = '0x64D5aDc50E5513975EfF7e9ba366B7eE58586fa3';
export function adminConfig(config = globalThis.window?.DECENT_CONFIG?.asteroid || {}) {
  return { adminWallet: config.adminWallet || DEFAULT_ADMIN, contractAddress: config.contractAddress || VERIFIED_CONTRACT, royaltyFeeBps: config.royaltyFeeBps ?? 500, gateway: config.gateway || 'https://ipfs.io/ipfs/', rpcUrl: config.rpcUrl || 'https://mainnet.base.org' };
}
export function isAdmin(address, expected = adminConfig().adminWallet) { return typeof address === 'string' && /^0x[\da-f]{40}$/i.test(address) && address.toLowerCase() === expected.toLowerCase(); }
export const BASE_CHAIN = { chainId: 8453, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] };
