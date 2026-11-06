# Decent Voyager contracts

The Hardhat project is isolated in `contracts/`; it compiles Solidity 0.8.26 (compatible with the requested ^0.8.24) using OpenZeppelin Contracts ^5.1 and Cancun EVM output. The code targets Base and Base Sepolia and never needs an on-chain player list in the browser.

## Architecture

- **VoyagerPilots** is the shared permission and game registry. `PILOT_MANAGER_ROLE` controls `setPilots(address[] accounts, bool enabled)` (maximum five addresses per transaction); `GAME_MANAGER_ROLE` controls `registerGame(bytes32 gameId, address referee)`. `isPilot(address)` is the entry gate. The default admin grants/revokes roles and pauses the registry.
- **VoyagerArena** is reusable for any registered game. `createRound(gameId, mode, entryFee, maxPlayers, joinDeadline)` snapshots the current referee; `mode` is 0 (co-op) or 1 (versus), and `maxPlayers` is 1–5. `join(roundId)` transfers the pilot's USDC entry fee. `settle(roundId, survivors, nonce, deadline, signature)` validates the round referee's typed signature. Winners receive equal pull credits; integer remainder and the configurable (default 0, maximum 10%) fee accrue to `treasuryAccrued`. An empty survivor list gives every joined player their full fee back. `claim(roundId)` withdraws a winner/refund credit. `cancelExpiredRound(roundId)` credits full refunds after the join deadline plus seven days. Treasury withdrawal is separately gated by `TREASURY_ROLE`.
- **VoyagerPrizes** holds ERC-1155 awards transferred in by an owner. `claim(gameId, voucher, signature)` verifies a referee voucher and sends one edition to the named player. A run ID and `(player, tokenId)` can each be used only once. `adminRelease(to, nftContract, tokenId, amount)` is restricted to `PRIZE_MANAGER_ROLE`.
- **VoyagerRewards** is the multi-asset successor for new claims. A signed `RewardBundle`
  can contain one ERC-1155 token/quantity, one ERC-20 token/amount, native ETH, or a
  combination. `claim(bundle, signature)` transfers the full bundle to its signed
  recipient or reverts everything. The signature binds the game, assets and amounts,
  award/claim IDs, level receipt record ID and deadline. Registered pilots only;
  claims, awards per player/game and NFT types per player are replay-protected.
  Recovery of custody requires `REWARD_MANAGER_ROLE` and a paused contract.
  Managers can still invalidate outstanding rewards through custody recovery;
  pause, reconcile unexpired vouchers and communicate before recovering funds.
- **VoyagerStamps** issues ERC-1155 achievement DNFTs with ERC-2981 royalties. New referee vouchers and owner-reviewed requests are restricted to Pilot/Ace level 20 completion; intermediate level records stay in flight history. Previously signed level-pass vouchers and already minted tokens remain valid (the deployed contract is unchanged). `mintWithVoucher(gameId, voucher, signature)` is player-paid and caller-bound. `mintBatch(to, recordIds, levels, difficulties, metadataURIs)` is a `MINTER_ROLE` admin path limited to five records per transaction. Record IDs mint only once; each token keeps its own metadata URI.
- **MockUSDC** (six decimals) and **MockERC1155** are test/local-demo fixtures only.

All voucher domains are `{ name: "DecentVoyager", version: "1", chainId, verifyingContract }`; EIP-712 type strings are exported in `src/js/chain/eip712.json`. For settlement, `survivorsHash` is `keccak256(abi.encodePacked(sortedAddresses))`, where addresses are sorted ascending by numeric address. `VoyagerArena.settlementHash()` and `settlementDigest()` expose the canonical encoding/digest for integrations. The record ID for stamps is `keccak256(utf8(LevelRecord.id))`.

## Multi-asset reserve rollout

`scripts/deploy-rewards.js` is an explicit Base-only deploy/funding operation, guarded
by `EXECUTE_REWARDS_FUNDING=yes`. It verifies the creator signer, BNut minter role,
18 decimals and supply headroom; deploys `VoyagerRewards` against the existing
pilot registry; then mints exactly 10,000 BNut directly to its custody. Transaction
hashes are persisted before waiting, so a failed confirmation step resumes the
same transactions instead of deploying/minting again. The recorded deployment
calldata must match the compiled source and expected constructor.

The public execution record is `deployments/base-rewards.json`. The original
`deployments/base.json` and NFT-only claim address remain intact for old vouchers.
The new deployment does not by itself activate the new game rules or fund DNFTs.
The 710-NFT reserve was funded through the coordinated escrow listing cutover
recorded in `deployments/base-reserves.json`; original sale listings were
delisted before each withdrawal and reduced quantities relisted at unchanged prices.
Native ETH is supported but no native-ETH reward budget has been approved or funded.
Only standard non-rebasing, non-fee-on-transfer ERC-20 assets such as BNut are
supported by the exact-amount reservation model.

Base deployment: `0xCa55A59BD2c15D0F11Ae5f7e7E96Bb58eb0B7DE5`;
deployment transaction `0x2447a90468b84f9407db37d8b6fe1400c72a318eeb4b246572121dadd3265b00`.
Exactly 10,000 BNut was minted directly to its custody in transaction
`0x19263be090025e5b504e32275e1023bc60e515a0676a2bda8282f045e04bda72`.
All 710 approved NFT units are also in custody, independently verified at Base
block 53644409. No ETH reward budget was transferred.

## Plugging in another dapp/game

1. Deploy or reuse `VoyagerPilots`, grant its `GAME_MANAGER_ROLE` to the integration's authorized game administrator, and call `registerGame(itsGameId, itsRefereeAddress)`. A `gameId` is a nonzero `bytes32`; use a stable app-specific value such as `ethers.id("your-game-name")`.
2. Add its pilot accounts through `PILOT_MANAGER_ROLE` (bounded batches of five), and grant role holders only the minimum required role.
3. Give the game its own isolated `gameId` and referee key. Any caller may create a round for a registered game; arena creation snapshots that game's referee so later registry changes do not alter an active round's signer.
4. Approve USDC before `join`. The referee signs `Settle` for the *VoyagerArena* address; prize and stamp vouchers must instead use their respective verifying contract addresses. Pass the corresponding `gameId` to voucher claims.
5. A dapp may use the registry and prize/stamp contracts without using Arena; only paid-round entry/settlement is in Arena. Integrators must preserve the exported ABI, chain ID, verifying address, exact type strings, survivor ordering, and metadata/run identifiers.

## Build and local demonstration

```sh
cd contracts
npm install
npx hardhat compile
npx hardhat test
npx hardhat run scripts/local-e2e.js
```

The local demo deploys fixtures only and demonstrates registration, pilot setup, a three-player round, a referee-signed two-survivor settlement and payout, prize funding/claim, and stamp voucher mint. `scripts/deploy.js` deploys the suite for the selected Hardhat network, writes `contracts/deployments/<network>.json`, exports contract ABIs to `src/js/chain/abi/`, and updates `src/js/chain/addresses.json`. Hardhat uses a local six-decimal mock USDC; Base and Base Sepolia use the configured Circle addresses. Only run deployment commands on a network when an owner has explicitly approved it and supplied secrets locally. The Base deployment records above document the approved live executions.

## Original suite deployment checklist

- Keep `DEPLOYER_PRIVATE_KEY`, `BASE_RPC_URL`, and `BASE_SEPOLIA_RPC_URL` in the operator's secret store or local ignored `contracts/.env`. Deploy to Base Sepolia first; verify the constructor parameters and grant operational roles from the intended owner/multisig. No keys belong in this repository.
- Register the Decent Voyager `gameId` and referee address using `VoyagerPilots.registerGame`; grant `PILOT_MANAGER_ROLE` and `GAME_MANAGER_ROLE` only to the appropriate administrators. Set the intended treasury and, only if approved, a nonzero protocol fee.
- The Base Supporter collection is `0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B`; its sale holder is DecentMarket escrow `0x31b07b83e99A9bdF379bf40225b8A80d3804C89d`. New awards use the separately recorded `VoyagerRewards` custodian, not the original NFT-only `VoyagerPrizes`. Funded token IDs **70, 71, 75, 76, 77, 78, 79 and 80** total 710 units. Replacement sale listing IDs are **11–18** in that order; original mint evidence remains historical.
- Verify each deployment on BaseScan (or Base Sepolia Basescan) using the recorded constructor arguments and matching Solidity 0.8.26, optimizer 200, IR, and Cancun settings. For example, after deploying and storing constructor values locally:
  ```sh
  npx hardhat verify --network base "$VOYAGER_PILOTS" "$ADMIN"
  npx hardhat verify --network base "$VOYAGER_ARENA" "$ADMIN" "$VOYAGER_PILOTS" "$USDC" "$TREASURY"
  npx hardhat verify --network base "$VOYAGER_PRIZES" "$ADMIN" "$VOYAGER_PILOTS"
  npx hardhat verify --network base "$VOYAGER_STAMPS" "$ADMIN" "$ROYALTY_RECEIVER" 500 "$VOYAGER_PILOTS"
  ```
  Replace `base` with `baseSepolia` as appropriate. The Hardhat config reads BaseScan API credentials from `BASESCAN_API_KEY` only when supplied locally; these commands are documentation only and were not run.

## Donor reuse and limitations

Patterns were adapted from DecentMarket's public committed source at commit `2942cf84692bc6752039b68fb425711703fe4927`: [`contracts/DecentEscrow_v001.sol`](https://github.com/TheJollyLaMa/DecentMarket/blob/2942cf84692bc6752039b68fb425711703fe4927/contracts/DecentEscrow_v001.sol) for `SafeERC20`, `ERC1155Holder`, pause/reentrancy protections and escrowed ERC-1155 transfers; [`contracts/DecentNFT_v0.3.sol`](https://github.com/TheJollyLaMa/DecentMarket/blob/2942cf84692bc6752039b68fb425711703fe4927/contracts/DecentNFT_v0.3.sol) for role-gated batch minting patterns; and [`hardhat.config.js`](https://github.com/TheJollyLaMa/DecentMarket/blob/2942cf84692bc6752039b68fb425711703fe4927/hardhat.config.js) for optimizer/Cancun configuration and Hardhat project conventions. The escrow implementation itself is not copied or integrated; these contracts implement distinct game/voucher state machines.

Contracts cannot verify the truth of a referee's game result. The referee is trusted to sign valid settlement and voucher results, its key must be secured/rotated carefully, and a compromised signer can award payouts/prizes/stamps incorrectly. Pilot gating depends on registry administration. ERC-1155 inventory can be depleted or misfunded; monitor balances and emitted events. Paid contests may be regulated as gambling, prize competitions, or financial promotions depending on jurisdiction; obtain legal advice and geo/eligibility controls before enabling paid rounds. This is engineering documentation, not legal advice.
