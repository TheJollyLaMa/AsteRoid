# ✦ Decent Voyager: Galactic Gauntlet ✦

A scrolling space shooter for the browser (CommonJS bundled with browserify) that plays
like Galaga: fly a corridor of Mandelblum rocks, blast through gauntlets, dodge return fire and reach the jump gate.
**Sector I** (levels 1–10) is free for everyone with no wallet. **Decent Pilots** (the DecentAgency whitelist) can
unlock **Sector II** (levels 11–20), win Supporter DNFTs, earn on-chain victory stamps and join paid arena rounds.

## Live v1

- Play: https://thejollylama.github.io/DecentVoyager/ (GitHub Pages, from `src/` via `.github/workflows/pages.yml`) · ENS: `voyager.decentagency.eth`.
- Referee: https://decent-voyager-referee.onrender.com (Render Starter, `render.yaml`; signer `0x3197DDde77b859A8177607ca82E88938B31C02f4`)
- Base contracts: see `contracts/deployments/base.json` and `contracts/deployments/base-rewards.json`.
  Supporter DNFT v1.0.0: token 80 on `0xe63E…439B`, corrected DecentMarket escrow listing 19
  (900 × 10 USDC at reserve cutover; 100 held for game rewards). Frozen mint evidence records original listing 10.
- Current mobile/reward ENS snapshot: `bafybeighqehjm3pfqovsdrqghdwxgjxrpzhglzibv5qwp3w622yhpqapdy`
  (frontend from merge `fdac2a6`). The pinned bundle SHA-256 matches Pages:
  `f69025c28cffb4582b3f1bacf7eea220f96e01ac973fbc1c41e4414ef370822a`.
  [ENS contenthash update](https://etherscan.io/tx/0x462dbd26468ac0e8ecf99008fe902b3f8596f24e4e82778691184864ff988dcd)
  is confirmed. Public HTML gateway availability remains unreliable (rate limits,
  Pinata public-gateway HTML restrictions and earlier eth.limo TLS failures);
  Pages is the verified play route.

The canonical project and repository are **Decent Voyager** / `TheJollyLaMa/DecentVoyager`.
Supporter token #80's branding correction is verified on Base: current metadata,
provenance art and active listing19 use DecentVoyager without reminting editions
or changing the v1 source commit. See [correction evidence](contracts/deployments/supporter-branding-correction.json).
The corrected frontend is pinned at
`bafybeib2gcanocvsn672opkxewptwrv37gfxfhtdu2g7nbpkddlwqe6amu` and
`voyager.decentagency.eth` points to it. [Pin/ENS verification](contracts/deployments/branding-frontend.json)
includes the matching bundle hash and browser-tested public IPFS gateway.
Historical transactions and content-addressed original archives cannot be rewritten.
Legacy payroll references, save keys, API identifiers and record schemas remain
readable for compatibility; they are not current project names. New records, saves
and issue links display Decent Voyager.

## Play locally

```sh
npm install
npm run build
python3 -m http.server 8907 --directory src   # then open http://127.0.0.1:8907/
```

## Controls

| Key | Action |
| --- | --- |
| ←/→ or A/D | Steer |
| ↑/↓ or W/S | Throttle forward/back within the flight lane |
| Space (hold) | Fire |
| E | Cycle weapons immediately (upgrades retained while switching) |
| V | Switch between **Overview** (top-down map) and **POV** (chase cam with radar) |
| P / Esc | Pause |
| M | Mute |
| Enter | Launch, continue or retry |
| Q | Menu (from pause, game over or victory) |
| C | Toggle the CRT scanline filter |
| B / Shift | Special: release a charge early, otherwise a brief emergency shield (8 s cooldown) |
| Tab (title) | Switch couch mode: Co-op / Versus |

**Gamepads** (standard mapping) hot-plug automatically: press **A** to join (up to 5 ships). Left stick or D-pad
steers, A/RT fire (hold to charge), B/LT special, X cycles mode on the title, Y/Back toggles the view and Start
launches or pauses.

Touch devices get a movement pad, Fire/charge, weapon, view and pause buttons.
Optional calibrated tilt steering requests sensor permission only on demand.
Fullscreen/landscape is best-effort; portrait controls remain available when a
wallet browser declines it. See [mobile controls](docs/MOBILE-CONTROLS.md).
MetaMask Mobile and other browsers exposing an injected Ethereum provider use
the existing connector; WalletConnect is not bundled.

Steering has no acceleration delay: at 60 Hz a digital input moves 6 world units
on its first simulation tick, reverses on the next tick, and stops on release.
Blaster, Spread and Plasma now fire faster; Rapid retains its fast projectile
role while Plasma pierces. Cycling clears the old cooldown and cannot carry a
charged Nova shot into another weapon. Future weapons remain gated to Sector II.
Phone/gamepad axes are quantized before simulation so signed replay matches the
live flight exactly. The referee rejects old-ruleset flights explicitly after
the cutover; previously issued claim vouchers are unaffected.

On the title screen, ←/→ picks any unlocked level and ↑/↓ picks the difficulty. Progress, high scores, lifetime
stats and win records are saved per difficulty in `localStorage`, and can be backed up to IPFS from the header.

## Difficulties

| | Cadet | Pilot | Ace |
| --- | --- | --- | --- |
| Feel | The original tuning | Faster, denser, meaner | Near impossible |
| Ships | 3 | 3 | 2 |
| Score multiplier | ×1 | ×1.25 | ×1.6 |
| Extras | Stationary rocks until level 4 | Extra gauntlet, rocks move from level 3 | Two extra gauntlets, moving rocks from level 1, solid double walls, armoured rocks, fewer pickups |

## Gameplay

- **10 levels** with rising scroll speed, density, rock movement and enemy fire. Levels 1–3 are fully stationary;
  drifting and charging rocks arrive from level 4.
- **Orange-core rocks shoot back** at the ship with more accurate, faster and more frequent fire in later levels.
- **Gauntlets**: walls (gapped only in levels 1–2), charging rushes and shooter chevrons. Shoot through or lose power.
- **Power bar**: enemy shots and collisions drain it. At zero, the ship is destroyed (3 ships per run, and the weapon drops a tier).
- **Pickups** (fly through them): **S** Spread Cannon, **R** Rapid Laser, **P** Plasma Lance (piercing). Collect the same
  weapon again to upgrade it up to tier 3. The breathing ENS/ETH orb restores power and **◎** grants a temporary shield.
- **Charge weapons**: the **Nova Charger** (and, in Sector II, the **Prism Lance** and **Singularity**) charge while
  fire is held and release a bigger blast. The HUD shows the charge meter.
- **Guarded Supporter pickups (whitelisted Pilot or Ace)**: a heavily guarded pickup appears on level 9 or 10. Destroy
  its guards and fly into it to capture a Supporter DNFT (DecentHead or DecentMarket), refill power and unlock
  **Sector II** for that difficulty. A second pickup on level 19 or 20 holds DecentCalendar, DecentCanopy or DecentPilgrimages.
  Captures become independently claimable only after referee verification and a funded-stock reservation.
- **Solo marathon receipts**: a single uninterrupted level-1-to-20 Pilot or Ace run records every level's stats,
  full-run totals and ordered award references in its level-20 receipt. Starting at a later unlocked level is
  not a marathon. An Ace completion earns Voyager token 80.
- **Perfect Ace / Perfect Pilot**: finish the full solo marathon with zero lives lost and both guarded pickups.
  Perfect Ace earns Busking token 75; Perfect Pilot earns BigNuten token 76 plus 100 BNut
  in one atomic claim. Those two NFTs no longer appear in the random pool. Restoring final lives does not erase
  lives lost. Award references are earned eligibility, not proof of an on-chain transfer.
- **Cadet** is practice only: local stats, confidence and progression, without new victory-stamp or prize claims.
- **Sector II · Far Future** (levels 11–20): a warp transition, new backgrounds, future rocks and wilder weapons.
- **Start screen**: **Solo voyage** or **Multiplayer battle**. Multiplayer opens a form: same screen (free, 2–5 ships,
  ships shrink as the group grows) or an online round with random pairing, invited wallets (0x… or name.eth) or a
  shared round number, in co-op or versus.
- **Stats**: every shot, hit, accuracy, rocks destroyed vs missed, shooters downed, combos, dodges and closest call,
  damage taken, shield blocks, pickups and a bounded battle log are recorded for each cleared level.

## Decent features

- **DecentHead v2 header**: IPFS save/restore of your progress (Pinata or local Kubo, your own credentials), wallet
  connect, and a full About / flight manual (click the Decent Voyager title): rewards, flight school, a multiplayer
  walkthrough, the Supporter DNFT ("Coming soon" until `supporterDnft` is set in the config, then buyable) and links.
- **DBusk radio** docked in the header. It never autoplays.
- **☥ profile menu (right ankh)**: **Victory Vault**, **Rewards waiting** (referee-signed level-pass DNFTs and Supporter
  prizes queued for you; they wait there every time you log in until you claim on Base) and **Flight manual**.
- **Victory Vault + DNFT stamps**: every cleared level becomes a record with a rendered battle card. Pin the card and
  full-stat metadata to IPFS, then request a mint via a prefilled GitHub issue. See [docs/VICTORY-STAMPS.md](docs/VICTORY-STAMPS.md).
- **Decent Pilots whitelist**: `contributor-accounts.json`. Every wallet action (signed flight logs, vouchers,
  vault prizes, arena) is limited to listed pilots. Anyone else plays Sector I with no wallet prompts.
- **Referee server** (`server/`): issues single-use flight tickets (the run seed), replays signed run logs
  deterministically and signs EIP-712 vouchers for stamps and prizes. It also relays the online arena. See [docs/SERVER.md](docs/SERVER.md).
- **Contracts** (`contracts/`, Hardhat): `VoyagerPilots`, `VoyagerArena` ($10 USDC rounds of up to 5, survivors split
  the pot), `VoyagerPrizes` and `VoyagerStamps`, built as a reusable game layer for other dapps. See [docs/CONTRACTS.md](docs/CONTRACTS.md).
  Online arena and claims stay **unavailable** until contracts are deployed and `voyager.refereeUrl` is set in
  `src/decent-head.config.js`.
- **Admin (left ankh)**: always shown; it opens only for the configured admin wallet (or read-only with `?adminPreview=1`). Tabs:
  **Victory Stamps**, **Supporter Prizes**, **Arena Rounds** and **Decent Pilots**, with ENS names and a
  "waiting for you" badge.
- **Payroll bot**: bounty/whitelist workflows and ledgers. See [docs/PAYROLL.md](docs/PAYROLL.md).
- Reuse and licence decisions are recorded in [docs/REUSE.md](docs/REUSE.md). Art credits are in
  [src/assets/game/CREDITS.md](src/assets/game/CREDITS.md).

### Reward rollout boundary

The matching frontend and referee are live on ruleset
`voyager-1.1-handling-rewards`. Render deployment `dep-dbmgkurm8hqs73962pt0`
reports GitHub-backed queues, configured pinning and the new reward address.
All 145 gameplay, 17 referee and 21 contract tests pass. Production Chromium
mobile input moves the actual bundled ship; emulated sensor tests also pass.
Physical MetaMask/iPhone testing and a legitimately earned wallet claim remain
manual acceptance, not completed by synthetic test wins.

The funded reserve is 710 NFTs: Head 100, Market 100, Calendar 100, Canopy 100,
Pilgrimages 100, Voyager 100, Busking 10 and BigNuten 100. Perfect Pilot's matching
budget is 10,000 BNut (Base token `0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736`,
18 decimals). **All 710 NFTs are held in VoyagerRewards.** The 10,000 BNut has been
minted into `VoyagerRewards` at `0xCa55A59BD2c15D0F11Ae5f7e7E96Bb58eb0B7DE5`
on Base: [mint receipt](https://basescan.org/tx/0x19263be090025e5b504e32275e1023bc60e515a0676a2bda8282f045e04bda72).
The public execution records are `contracts/deployments/base-rewards.json` and
`contracts/deployments/base-reserves.json`. Reserve custody and reduced sale
quantities were independently checked at Base block 53644409.
The original NFT claim contract does not transfer ERC-20 tokens; new `VoyagerRewards`
bundles transfer ERC-1155, ERC-20 and/or native ETH atomically, tied to the win-record ID.
Perfect Pilot claims must use that escrow, never an NFT-only voucher plus a promise
of a later BNut transfer. Do not advertise rewards as paid or claimable before custody
funding and the new deployment are verified.

Delisting/relisting escrow stock changes listing IDs. Coordinate all storefronts
and release-evidence consumers; preserve each original price, including Busking's
100 USDC price. Replacement listings are 11/12/13/14/15/16/17/18 for
Head/Market/Busking/BigNuten/Calendar/Pilgrimages/Canopy/Voyager respectively.
Each original release has supplemental `supporter-current-listing.json` evidence;
frozen mint assets remain unchanged. The shared Head buyer also resolves retired
links only to a unique same-token, same-price active replacement.
Deploy the matching frontend/referee ruleset together; old flight tickets are
rejected explicitly rather than replayed under changed seeded prize tables.
Custody is not a guarantee of eligibility, remaining stock or a successful claim.

Reuse: adapt the existing `Game.completeLevel`, `LevelTracker` totals, `buildMetadata`,
referee tier-scoped vouchers and `createQueueWriter` rather than introduce another
receipt pipeline. The new multi-asset escrow adapts the existing pilots, signing and
custody patterns because the deployed NFT-only contract cannot transfer fungible assets.
Calendar evidence comes from its public v0.1.0 `supporter-minted.json`,
token 77; BNut identity follows BigNuten's Base `js/contracts.js` configuration.
The receiving-game marathon and reservation tests verify the integration; a real
production winning-flight queue append and funded claim remain an acceptance gate.

## Code layout

- `src/js/game.js` contains the DOM-free, deterministic simulation (state machine, combat, pickups, progress,
  `step`/`replay`/`getRunLog` for referee verification and snapshots for netplay). `vault.js`, `prizes.js`,
  `multiplayer.js` and `inputlog.js` hold vaults, the prize table, multi-ship rules and run-log encoding.
- `src/js/levels.js` and `src/js/levelLayout.js` hold the level difficulty table and the seeded map generator.
- `src/js/weapons.js`, `asteroid.js`, `spaceship.js`, `bullet.js` and `collision.js` define the entities and rules.
- `src/js/difficulty.js`, `stats.js` and `save.js` define difficulty presets, stat tracking and the save format.
- `src/js/render/` holds the projection, both view renderers, the HUD, effects, screens and the battle-card renderer.
  The flight world stays 800×600 (so referee replays stay deterministic). The view widens to the page's aspect, up to 1600,
  with the lane centred between rails. The HUD is a single see-through strip along the bottom edge.
- `src/js/app.js` wires up input, audio and the animation loop, and exposes `window.asteroidGame`, `asteroid:event`
  and `window.AsteroidRender`.
- `src/js/input/` handles keyboard and gamepads. `window.voyager` exposes `game`, `step`, `draw` and `setNetworkMode`.
- `src/js/shell/`, `src/js/dnft/`, `src/js/admin/`, `src/js/pilots/`, `src/js/arena/` and `src/js/chain/` are ES modules
  for the header, Victory Vault, admin panel, pilot whitelist/flight log, arena lobby and contract ABIs/addresses.
- `src/vendor/` holds unmodified DecentHead 2.0.0 and DBuskRadio copies (see `src/vendor/PROVENANCE.txt`).

## Tests

```sh
npm test               # game, shell, pilots, arena (node:test)
npm run test:contracts # Hardhat contract suite (run `npm --prefix contracts install` once)
npm run test:server    # referee server (run `npm --prefix server install` once)
npm run test:all
```

## License

Code: [Apache-2.0](LICENSE) · Art and docs: [CC BY 4.0](LICENSES/CC-BY-4.0.txt) · Please keep the [NOTICE](NOTICE) and give The Jolly LaMa / A Decent Agency a head nod when you reuse this work.
Support the work with a [Supporter DNFT](https://thejollylama.github.io/DecentMarket/).
