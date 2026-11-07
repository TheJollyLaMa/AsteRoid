# ✦ Decent Voyager: Galactic Gauntlet ✦

A scrolling space shooter for the browser (CommonJS bundled with browserify) that plays
like Galaga: fly a corridor of Mandelblum rocks, blast through gauntlets, dodge return fire and reach the jump gate.
**Cadet** ends at level 10. **Pilot and Ace** automatically continue into **Sector II**
(levels 11–20), with no wallet or Supporter capture required. Local play is free.
**Decent Pilots** (the DecentAgency whitelist) can win Supporter DNFTs, earn
on-chain victory stamps and join paid arena rounds.

### Connect before launch

Enter, Solo voyage, couch launch, mobile launch and gamepad launch share a wallet
reminder before a new voyage or game-over retry. Connect with the popup or choose
to play without a wallet. Local stats still save either way; IPFS backup remains
an explicit action in the enlarged left header orb. The enlarged wallet orb
turns green only when connected, not as proof of reward eligibility.

Pilot **difficulty** and Decent Pilot **wallet eligibility** are separate. A
reward-enabled Pilot/Ace launch waits for the contributor/registry check and a
referee flight ticket. Failed connection, eligibility or ticket checks stay
visible in the popup with retry, practice and back choices; they do not silently
start a reward flight. Without wallet eligibility, Pilot/Ace still have 20 levels
but no Supporter encounters or NFT rewards. With eligibility, one guarded encounter
is scheduled in level 9 or 10 and another in 19 or 20. Missing either token does
not end the voyage early; both captures remain required for Perfect rewards.

Reuse: adapted Voyager's existing `completeLevel`/warp and save-progress paths,
with `getCampaignLevelCount` shared by launch validation, campaign completion,
title and HUD. No external donor is needed for this campaign rule. Existing
`sector2Unlocked` saves remain compatible: clearing level 10 now records access,
independent of wallet eligibility. Tests cover guest, eligible, missed-token and
old-save flights through level 20, plus Cadet's level-10 ending.

Reuse: adapted the bundled DecentHead `WalletSession.connect`/wallet state, the
existing Pilot whitelist and flight-ticket manager, and Voyager's launch routes.
No vendor files or reward rules were changed. The Canopy inventory was consulted
for header prior art; the installed DecentHead APIs are the compatible donor.

### Lotus marathon rules

New voyages and game-over retries start at **level 1**, with a fresh score,
loadout, flight log and seed. Saved best scores, flight history and Sector II
access remain intact; they are not restart checkpoints. Losing one life still
respawns you in the current run. White Lotus pickups in levels **3, 7, 12 and 16**
grant the collecting ship one extra life; the ENS breathing icon still restores
power instead. Extra lives collected and lives lost are tracked independently,
so collecting a life cannot erase a loss for Perfect rewards.

Only completing **level 20** on Pilot/Ace earns a new achievement NFT.
Intermediate battle records remain available locally and in IPFS progress saves.
Guarded Supporter pickups and marathon/Perfect awards are unchanged.
Previously signed vouchers remain claimable; new referee issuance and admin
requests enforce level 20. The ruleset is `voyager-1.4-open-sector`; deploy the
referee before the matching frontend and start a new flight after updating.
The immediately previous `voyager-1.3-mini-emblem` flights are verified using the
exact archived simulation from merge `3fe3375`, not today's campaign rules.
Ticket and run rulesets must match, and the original ticket MAC, signing wallet,
seed, six-hour expiry, replay and funded-stock checks still apply. New tickets
and online arenas use the current ruleset. Unknown older versions remain rejected.
Signed flights already in this browser's outbox retry automatically when an
eligible wallet connects, or with **Retry signed flight logs**. Keep the browser
data until verification succeeds. Signing records evidence; claim the verified
Supporter reward separately on Base. Expired tickets cannot be renewed for an
old run. Archive provenance is in [server/legacy](server/legacy/README.md).

Crowded-level safeguards include ordered spatial collision queries, capped
cosmetic debris/fireworks and a maximum 3-million-pixel / 2x-DPR canvas. A long
stall (over 250ms) or eight consecutive frames over 50ms freezes solo/local play,
clears transient effects and reduces rendering resolution. Resume with P or the
mobile Resume control. Online play reduces visual load but cannot pause the
authoritative referee. Healthy frames gradually restore rendering quality.
Menus and paused/end screens do not accumulate replay-log frames.
Glow passes are budgeted separately from visible ships, bullets and asteroids;
no gameplay hazards are dropped to meet the cosmetic budget. Repeated overload
can reduce resolution to 35% of the capped DPR; ten seconds of healthy play
restore quality in small steps. Title text returns to the normal sharp budget.

Validation: client and referee suites cover level-20-only issuance, deterministic
Lotus placement/collection, fresh-run restart, collision-order equivalence,
particle limits and overload pause/resume. A frame-paced Chromium stress fixture
with five firing ships in levels 9, 19 and 20 (both views) measured recovery-mode
p95 step+draw submission at 2.2–5.3ms versus 5.3–11.1ms in the preceding bundle;
core particles remained at most 256 rather than 2,666 in that paced baseline.
These are synthetic local measurements, not guaranteed frame rates on phones.
Cold audio initialization still produced a single long frame; the overload
pause is deliberately retained rather than claiming all stalls are eliminated.

### Mini emblem, elephant escort and readable 8-bit text

Supporter encounters display the actual metadata-derived NFT artwork and a
hovering project/version/token name, with a slow card spin and bounded glow
passes. Destroying the last guard emits a presentation-only `vaultUnlocked`
event with an original laser/fanfare and expanding rings. Capturing the token
adds a linked project briefing: local play pauses until Continue voyage, while
online play explicitly warns that the referee continues. The briefing includes
metadata, Base token and filtered agency-Canopy links, and distinguishes a
recorded capture from an on-chain transfer. Sign the flight log at victory or
game over, then claim the verified, funded reward. Missing artwork is reported
explicitly. Original capture and White Lotus fanfares use WebAudio synthesis;
no copyrighted game audio is sampled or modified. White Lotus pickups spin,
pulse and glow; collection adds bounded fireworks/rings and a 2.2-second banner.

The ticket-ready status expires after five seconds and clears immediately on
launch. Errors and claim instructions are not timed out. No reward mechanics,
collision shapes or replay inputs change in this presentation update.

Reuse: adapted this app's metadata-derived Supporter image cache,
`drawSupporterToken`, FX budgets, WebAudio synthesis and native-dialog patterns.
The Canopy shared-view query contract provides project-filter links. Artwork
provenance is in [CREDITS](src/assets/game/CREDITS.md); public metadata supplies
the missing Calendar and corrected Voyager images. No Canopy files were edited.

A spinning **Mini emblem** (the Mandelblum Compos token) appears once in levels
**5, 9, 14 and 18**. In range it drifts down toward the ship and weaves side to
side. Collecting it halves the ship's drawn size and hitbox for the next **five
hits**. Shield-blocked and invulnerable hits don't count, every counted hit still
costs power, losing a life ends Mini mode, and it otherwise carries into the next
level. A pink aura with one pip per remaining hit and the footer's MINI pips show
the countdown. `pickupsCollected.mini` and `miniHitsAbsorbed` are recorded with the
other battle stats and pinned to level-20 achievement metadata. Emblem movement
is deterministic; its original ruleset was `voyager-1.3-mini-emblem`. The current
ruleset also includes automatic Pilot/Ace continuation beyond level 10.

Clearing level 10 or 20 opens a framed **elephant escort** transmission playing
the Mandelblum flying-elephant animation on the Victory finale, on the level-10
stage clear, and during the warp into Sector II.

HUD, win-screen and battle-card text uses a built-in 5×7 bitmap font. Each font
pixel snaps to whole device pixels, so the 8-bit lettering stays sharp at fractional
display scales instead of being an upscaled, blurred system font. The CRT
scanline layer now draws under the HUD and overlays. Footer, toast and win-screen
text is size 13 or larger, set on darker plates.

The live warning strip above the canvas shows only a problem active in the
current page session: a frame error, performance pause or graphics restart. It
clears once play resumes. Earlier visits remain in Flight reports, labelled
"Previous visit".

### Flash protection and flight reports

POV asteroid art is capped at a 180px logical radius so near-camera hit
silhouettes cannot cover the screen. Hit whitening is subdued to 18%; full-screen
flash overlays are now dim edge cues. Gameplay collision and replay rules are
unchanged. Sector II's additional synthesized sounds are throttled per event type.

Recovery is idempotent: a second overload cannot toggle a paused battle back on.
Frame exceptions keep the animation scheduler alive but stop the failed scene
until explicit recovery. Canvas context loss pauses local play. When the browser
restores the context, rendering restarts automatically at reduced quality while
the battle stays paused until the pilot presses P or **Resume battle**. Online
referee play continues.

**Flight reports & recovery**, below the game, exports a JSON report and offers
manual resume. The latest 40 entries survive reloads in browser storage when
available (otherwise memory only). Reports include ruleset, recent errors/stacks,
level/view/state, entity counts and canvas size; not wallets, signatures, replay
inputs, saves or pinning-provider configuration. Known wallet/token patterns and
URL queries are redacted; review reports before sharing, since arbitrary error
text cannot be guaranteed secret-free. Nothing uploads automatically. Download
before reloading a broken scene, then attach the reviewed JSON to a GitHub flight
report along with device/browser, view and actions leading to the failure.

#### Long-flight graphics resources

The animated combo originally used a continuously varying HSL colour as a key
in an unbounded glow-canvas cache. This retained new 64x64 surfaces throughout
a flight, regardless of scene entity limits or framebuffer size. The HUD now
uses seven colour steps; the shared glow cache is a 64-entry LRU that repaints
the oldest surface in place when full (at most 1 MiB of RGBA glow pixels).
Text is drawn from a bitmap font as cached vector runs (a 256-entry layout
LRU), so score and combo changes allocate no text canvases. Opaque main-canvas
rendering avoids unnecessary alpha compositing; no CPU-readback hint is applied
to the gameplay canvas. This does not force a GPU backend or assume that a more
powerful machine can compensate for leaking surfaces.

Context loss records the pre-release resource counts, releases glow/ship/shield,
text/scratch, tinted-asteroid and CRT surfaces, then pauses locally. Restoration
redraws automatically at no more than 65% render quality; play resumes only
when the pilot chooses to. No simulation entities, collision rules or replay/reward inputs change.

Reports now include periodic 15-second samples, current cache counts and
cumulative cache allocation totals, FX counts, peak step/draw/frame times for
the sampling window, opaque-context state and estimated RGBA surface bytes.
The byte estimate covers known images/cached canvases/main backing; it excludes
driver allocations, extra texture copies, other tabs and browser UI. It is not
an actual GPU-memory reading or proof that a particular driver caused a reset.
Samples are collected without reading gameplay pixels or allocating a second
graphics context. Each new entry records its own build; older entries without
build provenance remain historical, not evidence from the updated renderer.
Automated browser allocation tests use Chromium's SwiftShader/software backend;
they verify cache growth, rendered behavior and recovery, not M1/Metal driver
stability or hardware utilization. A clean software soak cannot rule out a
device-specific GPU reset. Reports do not infer CPU architecture from Chrome's
Mac user-agent string (which may say Intel even on Apple Silicon).
In a frame-paced comparison with a sustained combo, the prior build allocated
870 glow canvases and 2,645 total canvas contexts in 900 frames (about 15 seconds
at 60 Hz). The repaired build completed 25,200 presented frames (seven minutes
at 60 Hz), cycling levels 7–9 and both views, with one firing pilot initially
and five thereafter: 23 glow canvases and 128 text sprites, 175 total canvas
contexts, no context loss or frame error. Allocation counts stabilized after
warm-up. This establishes bounded application-owned surfaces under that workload;
it does not establish a fixed total memory footprint for the browser/driver.

Reuse: adapted this app's existing `createFx`, `drawAsteroid`, `createAudio`,
frame-loop and About controls. Consulted the Canopy inventory and scoped local
Voyager/BigNuten diagnostic filenames; no compatible report helper found in that
scope, so the small bounded local recorder is new. No external runtime service
or dependency, no reward/replay contract change, and no new public inventory claim.
The long-flight fix adapts these same existing glow/font/asset/CRT caches and
local reports rather than adding a renderer framework or external telemetry.

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

The starter screen uses full-resolution monospace text, larger high-contrast
instructions and a steady launch prompt. Pixel-art ships and battle effects are
unchanged; the optional CRT filter applies during play, not over starter text.
The IPFS gateway startup limitation is tracked in
[issue #10](https://github.com/TheJollyLaMa/DecentVoyager/issues/10); use Pages for
the complete wallet/header experience until that separate fix is verified.

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

- **10 Cadet levels; 20 on Pilot/Ace**, with rising scroll speed, density, rock movement and enemy fire. Levels 1–3 are fully stationary;
  drifting and charging rocks arrive from level 4.
- **Orange-core rocks shoot back** at the ship with more accurate, faster and more frequent fire in later levels.
- **Gauntlets**: walls (gapped only in levels 1–2), charging rushes and shooter chevrons. Shoot through or lose power.
- **Power bar**: enemy shots and collisions drain it. At zero, the ship is destroyed (3 ships per run, and the weapon drops a tier).
- **Pickups** (fly through them): **S** Spread Cannon, **R** Rapid Laser, **P** Plasma Lance (piercing). Collect the same
  weapon again to upgrade it up to tier 3. The breathing ENS/ETH orb restores power and **◎** grants a temporary shield.
- **Charge weapons**: the **Nova Charger** (and, in Sector II, the **Prism Lance** and **Singularity**) charge while
  fire is held and release a bigger blast. The HUD shows the charge meter.
- **Guarded Supporter pickups (whitelisted Pilot or Ace)**: a heavily guarded pickup appears on level 9 or 10. Destroy
  its guards and fly into it to capture a Supporter DNFT (DecentHead or DecentMarket) and refill power.
  **Sector II** follows level 10 automatically on Pilot/Ace, even if the token is missed.
  A second pickup on level 19 or 20 holds DecentCalendar, DecentCanopy or DecentPilgrimages.
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
