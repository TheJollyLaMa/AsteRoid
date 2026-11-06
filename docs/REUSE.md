# Victory stamps and payroll reuse decision

Receiving need: every cleared level should retain all telemetry and a battle PNG, generate a public IPFS mint request, support owner batches on Base, and show repo contributors without initiating payroll transfers. Acceptance: metadata retains every stat and record; validated requests dedupe; one-of-one products target claimants; non-admin/preview cannot mint; Base roles and receipts fail closed; integer payroll totals reconcile; browser dialogs render and pause flight.

Inspected the curated DecentCanopy `data/agency-map.json` leads, actual source/tests, local statuses/worktrees and current Voyager GitHub activity. This is a scoped inspection of Busking, Canopy, DecentHead and DecentMarket, not whole-library coverage. Relevant donor working trees contained unrelated unfinished edits; committed content was read via `git show HEAD:path` where it mattered. No donor files were changed.

- **DecentBusking** `ab7c1dd4a25479d0b8351e42b17b8fac6c7c0221`: `js/admin-mint-queue.js` (`PRODUCT_BATCH_ABI`, `splitMintBatches`, `mintPreparedProductsBatch`), `js/admin-access.mjs`, `js/mint-reconciliation.js`, `js/ipfs-upload.js`, `js/nft-card.js`, `js/components/header-right-ankh-override.js`, `decent.config.js`, `docs/CONTRACTS.md`, `docs/PAYROLL.md`, and generic payroll workflows/scripts/schema. Adapted the batch ABI and functional conventions: at most 20, fixed royalty/recipient tuples, gas margin, exact receipt proofs and a conservative browser transaction journal. The host override traverses the left ankh shadow tree without editing the vendor. Its backend wallet-signature/admin queue and artist/radio flows are incompatible with this backend-free game, so they are not imported. Busking has no root LICENSE or root package license in the inspected commit: no substantive implementation text was copied; narrow ABI interfaces and behavior informed independent host implementations.
- **DecentCanopy** `8248680749a8c06d28afaa4e218e2fbafde2e81a`: `scripts/payroll.js`, `.github/workflows/bounty-bot.yml`, contributor/queue ledgers and `test/payroll.test.js`. Compared generic repo accounting against Busking and chose a smaller independently implemented author-only queue. Canopy's GPL-3 license is incompatible with silently treating copied code as this app's ISC code, so no GPL implementation was copied. The original donor ledgers/history, treasury/router identities and uncommitted edits were not transferred.
- **DecentHead** `8542720`: `js/ipfs.js` (`IPFSSession.headers`, options/provider conventions), `js/wallet.js` (`snapshot`, browserProvider, ensureChain, loadEthers), `js/components/Header/AnkhMenu.js` and `Header.js`. Reuse the shell worker's unchanged Apache-2 vendored runtime/license; adapt file pinning because the vendor's upload is JSON named backup.json. Credentials remain visitor-session-only. No automatic wallet requests or vendor edits.
- **DecentMarket** `2942cf84692bc6752039b68fb425711703fe4927`: `contracts/DecentNFT_v0.3.sol` and `DecentNFT_v0.2.sol`, specifically `registerAndMintProductsBatch`, `registerToken`, `mintProduct` and emitted events. Source is read-only evidence, not transplanted Solidity. See [victory stamps](VICTORY-STAMPS.md) for deployed code/role/function RPC verification and caveats.

Build-new choices: game's metadata flattening, local victory vault, GitHub issue request/queue validator, explicit public-ledger export/import, and the minimal integer payroll accrual/validation scripts. No speculative shared extraction. No public Canopy inventory was changed from local/private findings.

Validation: targeted native node:test cases cover metadata/JSON safety/claim validation/queue dedupe, Base batch tuple/receipt/admin gating, contributor identities and exact decimal payroll behavior. Browser preview covers a synthetic victory record, pause-on-open, disconnected fox instruction, separate worker tab and disabled mint/switch/recovery controls. Real pinning, wallet prompts and transactions are intentionally not exercised. See final task results for the latest full-suite count.

## Decent Voyager v1 (pilots, vaults, arena, contracts)

Receiving needs: a whitelist that gates every wallet action, guarded Supporter DNFT vaults paid from tokens that are already minted, automatic queuing of stamps and prizes, paid co-op and versus rounds of up to 5 players, gamepads, and a reusable contract layer. Acceptance: non-pilots never see wallet prompts; server replay rejects tampered or ungranted seeds; contract tests verify server-signed vouchers and settlements; the online arena stays explicitly unavailable until it is configured.

Scope: DecentCanopy agency-map leads, DecentMarket, DecentBusking, DecentHead, DecentAgencyOffice and DBuskRadio source, and on-chain reads on Base and Ethereum. This is not whole-library coverage.

- **DecentMarket** `2942cf8`: `contracts/` Hardhat + OpenZeppelin 5 layout and the escrow `withdrawNFT`/`listDNFT` interfaces. Reused the toolchain choice (Hardhat, per-subproject install) and read the escrow's 10 Supporter listings (ids 70–79, collection `0xe63E…439B`) on-chain. The Voyager contracts are new code: no donor contract handles referee vouchers or USDC pots.
- **DecentBusking** `ab7c1dd`: `contributor-accounts.json` shape, adapted as the Decent Pilots whitelist (4 collaborators).
- **DecentHead** `8542720` and **DBuskRadio** `6b67e02`: unchanged vendored header and radio (see `src/vendor/PROVENANCE.txt`).
- **Build new**: deterministic replay/run logs, flight tickets, the referee server, the arena relay, gamepad input and EIP-712 voucher flows. No multiplayer, gamepad or voucher donors were found in the scope above.

Incompatibilities: the escrow owner (admin wallet) must transfer prize tokens to `VoyagerPrizes`. `decentagency.eth` is controlled by a different wallet from the admin wallet. Paid rounds carry legal risk as contests of skill.

## Decent Voyager UI polish (About, profile menu, pairing)

Need: a stunning About with no empty dropdowns, a Supporter token card (coming soon or buyable), the vault and rewards moved into the profile menu, and random or invite-only online pairing. Acceptance: shell tests assert no `<details>`, rewards/walkthrough/coming-soon content, removed page elements and invite parsing; server tests cover open rounds and invite-only joins; verified in the browser.

- **DecentBusking** `ab7c1dd`: `js/components/about-override.js` and `header-right-ankh-override.js`. Adapted the pattern only: the custom `about-modal` is defined before the vendored header (whose define is guarded), and profile entries are injected into the right ankh's shadow tree. No vendor edits; no code copied.
- **DecentMarket** escrow `0x31b0…C89d` (`getListing`, `purchaseWithETH`, `purchaseWithToken`): reused for the About's Buy button once `supporterDnft` is configured.
- **Build new**: launch pad, arena form, pairing (`/arena/open`, `/arena/invites/:address`, invite-only rooms) and ENS invite resolution.

## Decent Voyager v1.0.0 release (Supporter DNFT, Pages, ENS)

Need: version-mint and list a Supporter DNFT for v1.0.0, publish the game, and give it an ENS name. Acceptance: the About shows the live listing (price, stock, Buy), DecentMarket's `verifyPublicListing` passes on Base, and Pages serves the game.

- **DecentMarket-supporter-gallery** `scripts/prepare-supporter-release.mjs`, `render-supporter-artwork.mjs` and `js/supporter-mint.mjs` (`transactionFor`, `verifyReceipt`, `validateRelease`/`validateMetadata`, `buildEvidence`): reused the four-transaction protocol and validators unchanged; adapted the artwork/prepare script to Voyager (a level 9 Ace gameplay frame, palette, repository/tag). Result: token 80, original listing 10, recorded in DecentMarket `releases/decentvoyager-v1.0.0` (PR #73). The later branding correction uses the collection's existing `setTokenURI` rather than reminting; original transaction/archive identities remain historical evidence.
- **Build new**: the Actions Pages workflow (the site lives in `src/`), the `supporterDnft.image` option in the About, and a directory pin plus `voyager.decentagency.eth` contenthash set from the DA wallet.
