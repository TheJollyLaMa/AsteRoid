import { validateClaim, parseQueue, validAddress } from '../dnft/validation.mjs';
export { parseQueue };
// ABI and batching conventions: DecentBusking js/admin-mint-queue.js @ ab7c1dd.
export const PRODUCT_BATCH_ABI = [
  'function registerAndMintProductsBatch((address recipient,uint256 amount,uint256 maxSupply,string tokenURI,address royaltyReceiver,uint96 royaltyFeeBps)[] products) returns (uint256[] tokenIds)',
  'function hasRole(bytes32 role,address account) view returns (bool)',
  'event TokenRegistered(uint256 indexed tokenId,address indexed creator,uint256 maxSupply,uint8 kind,string uri)',
  'event EditionMinted(uint256 indexed tokenId,address indexed to,uint256 amount,address indexed minter)',
];
export function splitMintBatches(items, size = 20) {
  if (!Array.isArray(items) || !Number.isInteger(size) || size < 1 || size > 20) throw new Error('Batch size must be 1–20');
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}
export function buildProducts(claims, { adminWallet, royaltyFeeBps = 500 }) {
  if (!Array.isArray(claims) || !claims.length || claims.length > 20) throw new Error('Select 1–20 stamps');
  if (!validAddress(adminWallet) || !Number.isInteger(royaltyFeeBps) || royaltyFeeBps < 0 || royaltyFeeBps > 10000) throw new Error('Invalid royalty configuration');
  if (new Set(claims.map(claim => claim.tokenURI)).size !== claims.length || new Set(claims.map(claim => claim.recordId)).size !== claims.length) throw new Error('Duplicate stamps selected');
  return claims.map(input => { const claim = validateClaim(input); return { recipient: claim.claimant, amount: 1, maxSupply: 1, tokenURI: claim.tokenURI, royaltyReceiver: adminWallet, royaltyFeeBps }; });
}
export async function verifyContract(provider, Contract, config) {
  const code = await provider.getCode(config.contractAddress);
  if (!code || code === '0x' || !code.toLowerCase().includes('04491a20')) throw new Error('Unverified/unavailable: deployed batch function could not be verified');
  const contract = new Contract(config.contractAddress, PRODUCT_BATCH_ABI, provider);
  if (!await contract.hasRole(`0x${'0'.repeat(64)}`, config.adminWallet)) throw new Error('Unverified/unavailable: configured admin lacks DEFAULT_ADMIN_ROLE');
  return contract;
}
export function reconcileReceipt(receipt, contract, products, owner) {
  if (Number(receipt?.status) !== 1) throw new Error('Transaction has not successfully confirmed');
  const events = (receipt.logs || []).filter(log => log.address?.toLowerCase() === contract.target.toLowerCase()).flatMap(log => { try { const event = contract.interface.parseLog(log); return event ? [event] : []; } catch { return []; } });
  return products.map(product => {
    const registered = events.filter(event => event.name === 'TokenRegistered' && event.args.uri === product.tokenURI && event.args.creator.toLowerCase() === owner.toLowerCase() && BigInt(event.args.kind) === 0n && BigInt(event.args.maxSupply) === 1n);
    if (registered.length !== 1) throw new Error('Confirmed transaction has ambiguous registration proof; do NOT retry minting');
    const id = BigInt(registered[0].args.tokenId);
    const minted = events.filter(event => event.name === 'EditionMinted' && BigInt(event.args.tokenId) === id && event.args.to.toLowerCase() === product.recipient.toLowerCase() && event.args.minter.toLowerCase() === owner.toLowerCase() && BigInt(event.args.amount) === 1n);
    if (minted.length !== 1) throw new Error('Confirmed transaction lacks matching mint proof; do NOT retry minting');
    return String(id);
  });
}
