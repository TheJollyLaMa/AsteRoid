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

On the title screen, ←/→ picks any unlocked level. Progress and high score are saved in `localStorage`.

## Gameplay

- **10 levels** with rising scroll speed, density, rock movement and enemy fire. Levels 1–3 are fully stationary;
  drifting and charging rocks arrive from level 4.
- **Orange-core rocks shoot back** at the ship with more accurate, faster and more frequent fire in later levels.
- **Gauntlets**: walls (gapped only in levels 1–2), charging rushes and shooter chevrons. Shoot through or lose power.
- **Power bar**: enemy shots and collisions drain it. At zero, the ship is destroyed (3 ships per run, and the weapon drops a tier).
- **Pickups** (fly through them): **S** Spread Cannon, **R** Rapid Laser, **P** Plasma Lance (piercing). Collect the same
  weapon again to upgrade it up to tier 3. **+** restores power and **◎** grants a temporary shield.

## Code layout

- `src/js/game.js` contains the DOM-free simulation (state machine, combat, pickups and progress).
- `src/js/levels.js` and `src/js/levelLayout.js` hold the level difficulty table and the seeded map generator.
- `src/js/weapons.js`, `asteroid.js`, `spaceship.js`, `bullet.js` and `collision.js` define the entities and rules.
- `src/js/render/` holds the shared world projection, both view renderers and the HUD.
- `src/js/app.js` wires up input, audio and the animation loop.

## Tests

```sh
npm test
```
