# ☄️ AsteRoid: Galactic Gauntlet ☄️

A 10-level scrolling space shooter for the browser (CommonJS bundled with browserify).
It now plays more like Galaga than classic Asteroids: fly a corridor of rocks, blast a path
through gauntlets, dodge return fire and reach the jump gate at the end of each level.

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
- **Stats**: every shot, hit, accuracy, rocks destroyed vs missed, shooters downed, combos, dodges and closest call,
  damage taken, shield blocks, pickups and a bounded battle log are recorded for each cleared level.

## Decent features

- **DecentHead v2 header**: IPFS save/restore of your progress (Pinata or local Kubo, your own credentials), wallet
  connect, and an About / flight manual with project links (click the AsteRoid title).
- **DBusk radio** in the cockpit strip. It never autoplays.
- **Victory Vault + DNFT stamps**: every cleared level becomes a record with a rendered battle card. Pin the card and
  full-stat metadata to IPFS, then request a mint via a prefilled GitHub issue. See [docs/VICTORY-STAMPS.md](docs/VICTORY-STAMPS.md).
- **Admin (left ankh)**: visible only to the configured admin wallet (or read-only with `?adminPreview=1`). It has
  separate **Victory Stamps** (batch mint on Base) and **Repo Workers** tabs.
- **Payroll bot**: bounty/whitelist workflows and ledgers. See [docs/PAYROLL.md](docs/PAYROLL.md).
- Reuse and licence decisions are recorded in [docs/REUSE.md](docs/REUSE.md). Art credits are in
  [src/assets/game/CREDITS.md](src/assets/game/CREDITS.md).

## Code layout

- `src/js/game.js` contains the DOM-free simulation (state machine, combat, pickups and progress).
- `src/js/levels.js` and `src/js/levelLayout.js` hold the level difficulty table and the seeded map generator.
- `src/js/weapons.js`, `asteroid.js`, `spaceship.js`, `bullet.js` and `collision.js` define the entities and rules.
- `src/js/difficulty.js`, `stats.js` and `save.js` define difficulty presets, stat tracking and the save format.
- `src/js/render/` holds the projection, both view renderers, the HUD, effects, screens and the battle-card renderer.
- `src/js/app.js` wires up input, audio and the animation loop, and exposes `window.asteroidGame`, `asteroid:event`
  and `window.AsteroidRender`.
- `src/js/shell/`, `src/js/dnft/` and `src/js/admin/` are ES modules for the header, Victory Vault and admin panel.
- `src/vendor/` holds unmodified DecentHead 2.0.0 and DBuskRadio copies (see `src/vendor/PROVENANCE.txt`).

## Tests

```sh
npm test
```
