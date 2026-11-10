# Stream A: touch and mobile controls (branch `agent/mobile-touch`)

Status: **done, ready to merge.** `npm run verify` is green (43 e2e tests, including 3 new touch tests).

## What was built

- **Touch input in core** (`src/core/input-touch.ts`, `src/core/input-touch-math.ts`), merged into
  the existing `InputState` inside `createInput` (`src/core/input.ts`). No interface change.
  - Floating left-thumb joystick: the base appears where the thumb lands (kept fully on screen)
    and follows the thumb past the ring, so reversing is instant. Radial dead zone 12%, output
    length ≤ 1, merged with keyboard and gamepad.
  - Right-side drag to look: px → radians scaled by the screen's short side (a swipe feels the
    same on phone and tablet); absurd single jumps are dropped.
  - Buttons: jump (held + edge), use (held + edge), flop (edge), pause (edge), sprint (toggle).
  - Multi-touch safe: the stick and the look drag each own one pointer id; each button counts its
    fingers, so sliding off or a second finger never sticks a button.
  - Touch mode turns on for touch-first devices (touch points + coarse pointer + no mouse) or on
    the first touch; a key, real mouse movement or gamepad use turns it off.
  - No pointer lock in touch mode (`capturePointer` is a no-op).
  - Fingers and stale taps are dropped when a menu opens or the page is hidden.
- **Touch HUD DOM** (`src/ui/touch/`): `index.ts` (controls), `platform.ts` (phone plumbing),
  `css.ts`. Same style as the HUD (white/yellow on dark, thick black and white outlines), readable in
  the R-only and G-only channels. The buttons are 64–108 px (jump) and 52–84 px (others), sized from
  the short side, with every position offset by the `env(safe-area-inset-*)` values.
  - The Use button shows the focused interaction's icon (pulsing yellow), an exit icon in a vehicle,
    and a dim hand when there's nothing to use. In the buggy, the flop button shows a speaker (it
    sounds the horn).
  - First-play hints, with no text: the stick ring pulses and a hand plus an eye swipe on the look
    side, until the player has moved and looked (8 s max).
  - In touch mode, the keyboard tutorial and the key caps in the HUD prompt are hidden.
- **Phone plumbing** (`platform.ts`):
  - Portrait shows a rotate-phone icon overlay (no text) and pauses play.
  - A `visualViewport` resize re-runs main's resize.
  - Fullscreen plus a landscape lock run when a touch player taps Play, Play again, Resume or
    Restart, where the browser allows it. They are skipped in test mode and fail silently on
    iPhone Safari.
  - Audio unlocks on the first touch.
- **Quality on phones**: `applyTouchQualityDefault` (called from `createInput`, which now reads
  `ctx.settings`) lowers the quality once on touch-first devices: phones go to Low (pixel-ratio cap
  1), tablets to Medium. This is remembered in `localStorage` (`rgow.touchDefaults.v1`), so a
  grown-up's later choice sticks. It never runs in test mode.
- **Menus by touch**: no sticky hover on touch screens. `touch-action` is set so the canvas and
  page don't pan or zoom. The settings panes scroll inside the panel on very short screens.
  Checked at 667×375: the title, pause, gate (hold by touch) and both settings tabs all fit.

## Files touched outside the new ones

- `src/core/input.ts`: merges the touch frame, adds a no-op pointer lock in touch mode, and
  registers the controls.
- `src/ui/index.ts`: 3 lines that create and update the touch UI
  (`touch.update(dt, phase() === 'playing' && !calibrating)`).
- `index.html`: adds `viewport-fit=cover` to the viewport meta, which safe areas need.
- CSS in `src/ui/touch/css.ts` also styles the shared UI:
  - `.rg .settings .panes` scrolls.
  - `.rg.touch-on …` tweaks (hide `.tut` and the prompt key caps, safe-area margins on the
    pills/timer, toasts moved below the pause button).
  - `@media (hover:none)` resets `.b:hover`.

The UI reaches core through `touchControls(ctx.input)` (WeakMap, same pattern as
`driveTriggers`).

## Requests for the orchestrator (optional, not needed for it to work)

1. `src/types.ts`: add `'touch'` to `InputState.device` so prompts can choose glyphs. Until then
   the UI uses the `.rg.touch-on` class on `uiRoot`.
2. `src/main.ts`: use the phone-aware cap for medium/high on phones:
   ```ts
   import { isPhoneViewport, touchPixelRatioCap } from './core/input-touch-math';
   // in resize():
   const q = settings.get().quality;
   const cap = testMode ? 1 : touchPixelRatioCap(q, matchMedia('(pointer: coarse)').matches && isPhoneViewport(w, h));
   ```
3. **Skydive merge (`agent/integrate-skydive`)**: its `prompt.show(..., input.device === 'gamepad')`
   draws key caps. In touch mode, hide those caps (e.g. `.rg.touch-on <its prompt> .cap{display:none}`),
   or give the skydive prompt the HUD `.prompt` class. Skydive steering already works, because it
   reads `moveX/moveY/jumpPressed`.

## Tests

- Unit: `tests/core/input-touch-math.test.ts` (20 tests) covers the stick vector, dead zone,
  clamping, the follow base, the on-screen base, the radius, look scaling, the jump filter, device
  class, quality and the pixel-ratio cap.
- E2e: `tests/e2e/touch.spec.ts` uses `hasTouch` and `isMobile`, with real CDP touch events.
  - Phone 667×375: tap Play; drag the stick and the player moves more than 2 m; a second finger
    turns the camera; tap jump fires `player:jump`; sprint toggles; pause and resume by touch; the
    gate hold works by touch; settings fit on screen.
  - Portrait: the overlay appears and the game pauses; back in landscape, a key hides the touch HUD.
  - Tablet 1024×768: HUD; walk to the buggy, tap Use to get in, the stick drives it (speed above
    3 m/s), tap Use to get out.
- Screenshots (full / R / G) in `test-results/touch/`: `phone-hud`, `phone-stick`, `phone-pause`,
  `phone-settings`, `phone-settings-game`, `phone-portrait`, `tablet-title`, `tablet-hud`,
  `tablet-driving`. All controls read clearly in both channels.
- Cost: the e2e suite gets about 50 s longer (the full suite was already about 4 min on this
  container).

## Not verified

These have not been tested on real phones or tablets, only on emulated touch in Chromium. iOS
Safari has no element fullscreen, so play stays in the browser window there.
