# ✦ Decent Voyager: Galactic Gauntlet ✦

*(formerly AsteRoid)* A scrolling space shooter for the browser (CommonJS bundled with browserify) that plays
like Galaga: fly a corridor of Mandelblum rocks, blast through gauntlets, dodge return fire and reach the jump gate.
**Sector I** (levels 1–10) is free for everyone with no wallet. **Decent Pilots** (the DecentAgency whitelist) can
unlock **Sector II** (levels 11–20), win Supporter DNFTs, earn on-chain victory stamps and join paid arena rounds.

## Live v1

- Play: https://thejollylama.github.io/DecentVoyager/ (GitHub Pages, from `src/` via `.github/workflows/pages.yml`) · ENS: `voyager.decentagency.eth`.
- Referee: https://decent-voyager-referee.onrender.com (Render Starter, `render.yaml`; signer `0x3197DDde77b859A8177607ca82E88938B31C02f4`)
- Base contracts: see `contracts/deployments/base.json`. Supporter DNFT v1.0.0: token 80 on `0xe63E…439B`, DecentMarket escrow listing 10 (1,000 × 10 USDC).

The repository was renamed from `AsteRoid` to `DecentVoyager`. Frozen v1.0.0 Supporter metadata and source archives retain their original repository identity; GitHub redirects the old repository links. Historical payroll references, save keys and record schemas remain compatible. New issue links and payroll entries use `DecentVoyager`.

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
- **Supporter vaults (Ace + Decent Pilot only)**: once per run a heavily guarded vault appears on level 9 or 10. Destroy
  its guards and fly into it to capture a Supporter DNFT (DecentHead or DecentMarket), refill power and unlock
  **Sector II**. A second vault on level 19 or 20 holds DecentBusking, BigNuten, DecentCanopy or Decent Pilgrimages.
  Captures are queued for payout automatically once the referee verifies the run.
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
