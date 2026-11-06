# Mobile flight controls

Touch controls appear on coarse-pointer devices and narrow viewports. Hold the
arrows to steer, tap or hold **Fire**, press **Nova** for the special attack, and
use **Next weapon** to cycle owned weapons. Charging and release behavior remains
weapon-specific. Keyboard and gamepads still work; **E** also cycles weapons.
Launch/continue, pause/resume and view controls do not require a keyboard.

**Enable tilt** is optional and only requests motion permission after a tap.
Hold the device comfortably while the first valid reading calibrates neutral.
**Recenter** sets a new neutral position. Rotation also recenters; touch steering
remains available. Motion is stopped when the page loses focus or becomes hidden,
and missing/stale readings return steering to zero. Re-enable explicitly after
returning. Denied permissions, insecure contexts and unavailable sensors leave
touch controls usable.

**Full screen** requests fullscreen only when supported, then tries landscape
locking independently. Neither feature is required: portrait has its own controls
below the canvas and landscape places controls alongside it. iPhone Safari and
wallet in-app browsers can reject fullscreen/orientation locking or omit motion
APIs entirely. Rotate manually when necessary; no device support is assumed.

The existing injected-wallet connection is unchanged. Use any compatible wallet
browser, including MetaMask; there is no MetaMask-only detection, new permission
request, WalletConnect integration or new wallet dependency. Wallet approval
screens can interrupt touch/motion; controls are cleared when the game loses
focus. Real iPhone/MetaMask permission and sensor behavior still needs physical
device testing; desktop emulation cannot verify those browser policies.

## Reuse and validation

Receiving need: immediate multi-touch movement and tap/hold fire without weakening
existing keyboard/gamepad input or wallet handling. Reviewed Canopy's curated
`data/agency-map.json`, Voyager's active dirty worktree, recent commits/open work,
and BigNuten_Vanilla JS/MJS motion/fullscreen candidates. No motion/fullscreen
helper was found within that bounded donor search. Adapted Voyager's existing
`src/js/input/index.js:createInput` and
`src/js/shell/launch-pad.mjs:mountLaunchPad` action interface (base commit
`c6ae584`; input extension is uncommitted in this delivery), rather than adding a
new input engine or wallet stack. Apache-2.0 project code; no outside code copied.

`tests/input.test.js` covers immediate key presses, overlapping aliases, virtual
source isolation, short taps, finite/clamped analog input and interrupted input.
`tests/mobile-controls.test.mjs` covers calibration, screen-relative tilt, denied
or unavailable sensors, stale readings, permission races and fullscreen fallback.

Run the focused checks with
`node --test tests/input.test.js tests/mobile-controls.test.mjs`.
`node tests/mobile-controls.browser.mjs` runs an optional Chromium smoke using the
existing sibling BigNuten_Vanilla Playwright installation; set `PLAYWRIGHT_MODULE`
to another installed Playwright module if needed. It serves the real page and
mobile module, substituting the current input source bridge without rebuilding
`bundle.js`. It checks portrait/landscape fit, touch targets, simultaneous steering
and firing, short taps, simulated tilt, interruption cleanup and fullscreen
fallback. This does not claim that the untouched production bundle contains the
new bridge: the normal application bundle build is required before deployment.
