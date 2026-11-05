# Victory stamps (Base)

Every cleared level becomes a local Victory Vault record (up to 200), independent of wallet connection. Opening the vault pauses active flight; closing leaves it paused. Browser storage is not a backup: keep the game save and copy submitted claims.

## Player flow

1. Clear a level and open **🏆 Victory Vault**.
2. Connect your own wallet using the header fox. The vault never requests accounts automatically.
3. Configure your own DecentHead IPFS session: Pinata JWT/key+secret, or local Kubo with browser CORS configured. No shared credential is shipped or persisted by the vault.
4. **Stamp DNFT** renders a deterministic PNG using `AsteroidRender.renderBattleCard`, then pins the PNG and metadata JSON. Both CIDs and gateway links remain visible. If only the image pins, retry reuses it. A changed wallet requires new metadata.
5. **Request mint on GitHub** opens a prefilled issue form; you must actually submit it. “Requested” means the request was prepared locally, not accepted, minted, or paid. **Copy claim JSON** is the popup/clipboard fallback.
6. The trusted GitHub workflow validates/deduplicates the request into `victory-stamps.json`. The owner reviews it and batches it on Base. Published matching token IDs and transaction hashes update the vault to “minted”. This ledger is owner-published evidence; independently inspect BaseScan.

Metadata is ERC-1155/OpenSea-shaped: name, description, `ipfs://` image, external URL, leaf attributes for **all** stats, score and ship values (including nested weapon/pickup counters), level/name/difficulty, seed/start/duration, and completedAt as Unix seconds (`display_type: date`). `properties.record` preserves the complete JSON-safe LevelRecord, including the bounded battle log, schema, game/version, claimant and Base identity. `null` statistics become an “Unavailable” attribute while the raw record retains null.

IPFS and GitHub expose these records publicly, including wallet address and ship path. Pinning acceptance is not a retention guarantee. Local game telemetry can be forged: this is an owner-reviewed collectible, not a signed anti-cheat attestation or permissionless reward.

## Owner admin flow

The LEFT ankh Admin entry is visible only to the configured connected wallet. **Victory Stamps** and **Repo Workers** are separate tabs. `?adminPreview=1` enables a read-only preview, with mint/recovery/chain-switch controls disabled. UI gating is convenience, never contract authorization.

The queue and contributor/payroll ledgers load from this repository's raw `main` files, then a host-root relative copy. The static site serves `src/` while the canonical ledgers live in the repository root; default hosting therefore needs raw main to be published. A missing ledger explicitly says unavailable. The victory queue also supports JSON paste/import. Root ledgers are not secretly synchronized into the site.

Review the issue and load every metadata stat before selecting 1–20 stamps. Metadata must match claimant, image, record ID, level, difficulty, date and score. The mint path checks Base 8453, deployed batch selector, configured admin's DEFAULT_ADMIN_ROLE, and signer identity; estimates gas with a bounded 20% margin; and asks for explicit confirmation before the wallet transaction. Every product fixes recipient to claimant, amount/maxSupply to 1, and royalties to the configured admin. Only exact matching TokenRegistered and EditionMinted receipt events produce a mint export.

**Copy confirmed export** produces `{ "minted": [...] }`. In an owner-reviewed PR, remove those records from `pending` and append them to `minted` in `victory-stamps.json`; do not duplicate them across sections. Keep transaction hash, token ID, contract and chain fields. The browser cannot write GitHub. A local transaction journal locks uncertain and confirmed batches against accidental re-minting. Confirmed locks release only after the public main ledger contains the matching export. For a pending/uncertain operation, use receipt check or recover its original/replacement hash from wallet history; recovery requires the exact same owner, contract and batch calldata. Never clear storage to retry an uncertain mint. If recovery is unavailable, review wallet history and the chain manually with the owner.

## Configuration and verification

Set public overrides **before modules load**:

```js
window.DECENT_CONFIG = {
  ...window.DECENT_CONFIG,
  asteroid: {
    adminWallet: '0x807061DF657A7697c04045dA7d16D941861cAABc',
    contractAddress: '0x64D5aDc50E5513975EfF7e9ba366B7eE58586fa3',
    royaltyFeeBps: 500,
    gateway: 'https://ipfs.io/ipfs/'
  }
};
```

Defaults are in `src/js/admin/config.mjs`. The default address is the existing DecentBusking DNFT collection, **not** a newly deployed dedicated AsteRoid collection. The owner must approve sharing it or configure another verified compatible collection; no deployment was performed. No private keys belong here. Gateway and contract overrides must be reviewed for privacy/runtime compatibility. The SDK is DecentHead's existing vendored ethers, loaded only when needed.

On 2026-11-05, **read-only** RPC to `https://mainnet.base.org` verified deployed code at the default address (11,525 bytes) containing selector `0x04491a20` for `registerAndMintProductsBatch((address,uint256,uint256,string,address,uint96)[])`. `hasRole(bytes32(0), admin)` returned true; `hasRole(keccak256("MINTER_ROLE"), admin)` returned false. Empty batch `eth_call` from admin returned `EmptyProductBatch()` (`0xa49ae4d8`), while another wallet returned `AccessControlUnauthorizedAccount` for DEFAULT_ADMIN_ROLE. A nonempty one-product **staticCall** from admin returned token ID 200 in simulation; **nothing was minted**. Product batches require DEFAULT_ADMIN_ROLE, not MINTER_ROLE. Runtime checks run again for every real batch; if code/role/RPC is unavailable, minting fails closed with an unverified/unavailable message.

Source inspected: DecentMarket `contracts/DecentNFT_v0.3.sol` and `DecentNFT_v0.2.sol` at `2942cf84692bc6752039b68fb425711703fe4927`. Roles can change. This confirms the batch interface/authorization behavior, not a full contract audit or deployment/source byte-for-byte verification.
