# Voyager branding correction

## Status

The canonical name is **Decent Voyager**, repository
[`TheJollyLaMa/DecentVoyager`](https://github.com/TheJollyLaMa/DecentVoyager).
Game records, sample battle cards, image descriptions, save labels/errors,
documentation, the package lock and current claim links now use that name.
Legacy claim links are accepted and rewritten to the canonical repository.

**Token/IPFS/ENS deployment is not complete.** The host execution gate blocked
the local artwork/pinning command, including after explicit owner approval.
No token URI, escrow listing or ENS mutation was sent by this correction.
Do not infer success from the existence of the preparation scripts.

The independently read ENS registry resolver remains
`0xF29100983E058B709F3D539b0c765937B804AC15`. Its contenthash matches
`ipfs://bafybeighqehjm3pfqovsdrqghdwxgjxrpzhglzibv5qwp3w622yhpqapdy`.
The fetched bundle SHA-256 is
`f69025c28cffb4582b3f1bacf7eea220f96e01ac973fbc1c41e4414ef370822a`.
That is the previous verified mobile/reward build, **not** this branding build.
The public Pinata gateway rejects HTML serving with HTTP 403; fetching the
JavaScript and verifying its hash does not establish a working HTML gateway.

## Existing token, not a replacement mint

Base collection `0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B`, token **80**,
has an admin-settable per-token URI. Its original metadata URI is
`ipfs://QmacnQSJCxmqjWnMxDqhkLXCJv1zqp1EKoeF7nY782rGpe`.
The name says Voyager, but repository properties, external/source links and the
back artwork still name the old repository. Active listing 18 inherited that
old note. Neither error is solved just by GitHub redirects.

The prepared correction keeps token ID, 1,000-edition cap, original release
commit `f7b71fbd7f5a549f0b2be3f6c35b38f3b655b9f8`, original code archive,
10 USDC price, royalties, holders and reward reserves unchanged:

1. Render and pin corrected back artwork, presentation and metadata.
2. Verify pinned bytes independently before any chain write.
3. Use the existing collection `setTokenURI(80, correctedURI)`.
4. Delist the old sale and relist only the still-held sale stock with the
   canonical repository note. No NFT withdrawal or reward-funding transaction
   is necessary.
5. Publish the correction receipt and refreshed release manifest/metadata,
   retaining original URIs and mint transactions as historical evidence.
6. Refresh Market, Canopy and Office evidence/art checksums and purchase links.
7. Deploy the corrected game, pin its complete relative-path static frontend,
   verify bundle and asset hashes, then update and read back the actual ENS
   registry resolver's contenthash. Verify HTML through a working gateway,
   separately from pin persistence and byte-integrity checks.

[`correct-supporter-branding.js`](../contracts/scripts/correct-supporter-branding.js)
is a **prepared, not live-executed** correction script. It requires
`EXECUTE_VOYAGER_BRANDING=yes`, a prepared-artifact directory argument and
`JOLLY_PRIVATE_KEY` supplied privately through the approved deployment
environment. It journals hashes before waiting, validates role/network/stock,
resumes exact calldata and checks the resulting URI/listing/reserve balance.
Do not run original registration/mint/reserve scripts again.

## What must remain compatible

Historical transaction logs, old IPFS objects, the original v1 archive and
record payloads cannot honestly be rewritten. Save keys, record schemas,
browser integration globals/events, payroll deduplication identities and map
IDs retain their legacy identifiers so existing saves and queued rewards work.
The `Asteroid` entity and asteroid counters describe actual game objects, not
the project name.

Scope checked: current Voyager source/tests/release, the related Market release,
Canopy public map and Supporter index/model, and Office storefront/spaceport
evidence. This is not a claim to have searched every ecosystem repository.

Reuse: use the existing DecentMarket Supporter metadata validators, Voyager
collection's `setTokenURI`, and the proven journal-before-wait pattern in
[`fund-reserves.js`](../contracts/scripts/fund-reserves.js), not another mint
contract. The release commit/archive remain incompatible with an attempt to
erase historical naming; the correction records provenance instead.

Validation: 145 game and 17 referee tests pass; the browser bundle rebuilds.
Canopy's focused tests cover canonical-name fallback, repository aliasing,
project discovery and preserving raw on-chain notes. Physical-wallet execution
and corrected-pin/ENS verification remain blocked, not passed.
