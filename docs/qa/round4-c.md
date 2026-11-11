# QA round 4, part C (main @ 8d371ca)

Focus: Pip's speech bubbles on phones (owner's "the messages kept glitching" report), the first
3 minutes, weaker-eye mini-games, settings, channel readability.

Scripts: `scripts/qa4c/*.mjs` (Playwright, SwiftShader, `?test=1&quality=low&buddyIntro=1`).
Input goes through the real input layer: CDP touch events on the joystick zone (phones), real
key presses (desktop). Frames: `test-results/qa4c/<run>/` (not committed; rerun the scripts).

- `phone.mjs` real-time loop (no `freeze`), iPhone 13 landscape (750×342), CDP screencast.
- `phone-step.mjs` frozen, stepped at 60 Hz, the bubble sampled after **every** simulation frame
  (in-page recorder `recorder.mjs`: show/hide, replace, retype, >30 px jumps, off-screen, HUD
  overlap). Devices: iPhone 13 landscape, Pixel 7 landscape (863×360), "small" 667×375 touch.
  Optional 5th/6th args capture every 2nd frame in a window (used to film the flip-flop).
- `desktop.mjs` 1280×720 keyboard, `ui.mjs` grown-up flow + channel shots, `glasses-probe.mjs`.

Machine load: load average 15–28 on 4 CPUs (other QA agents). The real-time loop ran at
~1.3 fps on the phone viewport, so real-time runs only cover ~10 s of game time; the stepped runs
cover 150–180 s of game time each.

## Section 1 — phone bubbles (owner's bug): REPRODUCED

### Defect P1 (Blocker for phones): the bubble flip-flops between two places, frame to frame
`placeBubble` (`src/ui/buddy/place.ts:39`) is stateless: every frame it re-scores a fixed set
of candidates (above Pip / beside the hero / above the hero / below / sides) and, if none is
free of HUD boxes, grid-scans for the nearest cheapest spot (`place.ts:98`). There is no
hysteresis, no "keep the last spot while it is still acceptable" and no position smoothing,
and it is called every frame from `src/ui/buddy/index.ts:174` (`update`). When Pip or the hero
moves a pixel across a cost boundary (hero box overlap = 1e9, or the HUD-area cost tie), the
bubble jumps 150–430 px to a different candidate and back on the next frames. On phones the
touch buttons cover most candidates, so it happens constantly.

Counts of >30 px same-line jumps in one frame (stepped runs, 60 Hz sampling):

| Device | Game time | Lines shown | Jumps | Worst |
|---|---|---|---|---|
| iPhone 13 landscape 750×342 | 180 s | 16 | 79 | "Follow me!" top-left ⇄ bottom-centre 9× in 2 s |
| Pixel 7 landscape 863×360 | 180 s | 16 | **370** | even "Hi! I am Pip!" flips 160 px 4× in its first 2 s |
| small 667×375 touch | 150 s | 14 | 75 | |
| real-time loop, iPhone 13 | ~10 s | 3 | 8 | "Look around!" 433 px |

Repro (deterministic): `RG_PORT=4363 node scripts/qa4c/phone-step.mjs "iPhone 13 landscape" 180 90 98.3 100.8`
films every 2nd frame from 98.3 s: `C-98.983.png` bubble top-left, `C-99.017.png` bottom-centre,
`C-99.050.png` top-left again; `C-100.483…C-100.650` flips 4 times in 0.2 s.
Pixel: `step-Pixel-7-landscape/J-t135.00.png` vs `J-t135.25.png`.

Wanted (owner: ui/buddy): keep the current placement while its cost stays acceptable (only move
when the hero would be covered or a clearly better spot persists for ~0.3 s), ease the bubble's
position (no teleports while a line is up), and make the scoring ignore container boxes (see P3).

### Defect P2 (Major): the tail points at the wrong thing / at nothing
When the bubble lands on a fallback spot, the tail is clamped to the body (`place.ts:118`), so it
points at the hero or the shop button, not Pip: `step-iPhone-13-landscape/C-98.983.png` (tail
left of the hero; Pip is right of the hero), `step-small/J-t139.10.png` (tail into the hero's
head, Pip at the left), `step-Pixel-7-landscape/J-t135.25.png` (Pip off screen, tail points down
at the ground). A non-reader can't tell who is talking.

### Defect P3 (Minor, cause of P1 on touch): the avoid list matches whole-screen containers
`AVOID` in `src/ui/buddy/index.ts:93` includes `[data-testid^="touch-"]`, which also matches
`touch-hud`, `touch-stick-zone` and `touch-look-zone` (each half the screen or the whole screen).
Every candidate therefore costs > 0 on touch devices, so the grid scan always runs and picks
"nearest free-ish spot", which changes with tiny moves. Exclude containers; list the buttons.

### Defect P4 (Major): lines interrupt each other within 1–1.5 s
"Walk with me!" is replaced by "Look around!" after 1.6 s, and on the small phone "Look around!"
by "Gems are money!" after 1.1 s (`step-small/bubble-log.json`, `replace` events at 3.97 s and
5.3 s); "Jump! Hold to go higher!" is replaced by "Gems are money!" after 3 s on iPhone. Each
`speak()` stops the previous clip (`src/buddy/voice.ts:338`), so the voice is cut mid-word too.
Story steps should finish (clip + short beat) before the next story step or the wallet tip.

### Other phone observations
- HUD explain card (wallet legend) opens over the Pip button and the joystick area and stays while
  the child plays (`step-small/J-t5.90.png`, `step-Pixel-7-landscape/J-t20.50.png`) (ui, Minor).
- Camera ends up inside the hero / terrain on phones: `step-iPhone-13-landscape/J-t6.30.png`
  (screen filled by the hero's green head next to the Gear Shack), `J-t176.55.png` (walking
  backwards down a slope, camera in the grass) (core/camera, Major — already a known area).
- Gear Shack E button floats in the middle of the screen over the hero (`step-small/J-t5.90.png`)
  (ui, Minor).
- Not seen: text retyping/restarting (0 `retype` events), bubbles off the edge (2 frames at
  x = −2 px on iPhone only, `J-t176.55.png`), notch/safe-area overlap (Chromium emulation has no
  notch insets — not verifiable here), keyboard key caps on touch (the bubble's action glyph uses
  `data-device="touch"` pictures: stick, swipe, hand), tiny text (bubble text 13.5 px; readable,
  and the pictograms carry the meaning).
- Portrait (390×844): a wordless rotate-phone overlay covers the game, controls hidden
  (`phone-iPhone-13-landscape/zz-portrait.png`). Works.
- The intro never stalls but nags: a child who never presses Jump hears "Jump! Hold to go higher!"
  every 12 s for 75 s, then "Follow me!" every 12 s for the rest of the run (iPhone/Pixel logs);
  after 6 rescues the hero is still stuck at the island-edge fence (98.5, −40) (buddy, Minor).
