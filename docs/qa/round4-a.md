# QA round 4, part A (main @ 8d371ca)

Driver: `scripts/qa4/driver.mjs` (one long-lived Chromium, SwiftShader, 960×540, dpr 1,
`?test=1&freeze=1&quality=low`). Step scripts: `scripts/qa4/steps/*.js`, POSTed to the driver.
Inputs are real keyboard events (`page.keyboard.down/up`) read by `src/core/input.ts`; time is
stepped with `__rg.step(1/60, n)`. Teleport only to get 6–24 m from an attraction.
Screenshots: `test-results/qa4/a/<item>/` (not committed; rerun the steps).

Conditions: load average 30–51 on 4 CPUs (other QA agents), and the shared memory cgroup
OOM-killed Chromium renderers (ours and other agents') five times. Rounds were cut short; several
items were not reached (see "Not tested").

## Results

| # | Item | Works? | Fun 1–5 | Non-reader can start? | Top defect |
|---|---|---|---|---|---|
| 1 | Trampoline | yes | 5 | yes (3-picture board, walk on = bounce) | how-to board sits across the west approach; walking straight in from the plaza side the hero is stuck on it (`tramp/walk-7.png`) |
| 2 | Rocket pads | yes (free, 0-gem practice, paid 3) | 4 | yes (walk on) | 0 gems: launch is silently a "practice" with no sign why there is no prize |
| 3 | Balloon → skydive → chute → rings | yes, if you let go | 4 | partly | holding W under the canopy glides 150 m out to sea; landing in water respawns at the balloon pad, no rings, no prize (`balloon/fall-24.png`, `fall-52.png`) |
| 4 | Bungee | yes (E, dive, 2 rebounds, mat) | 4 | yes (E prompt) | camera starts jammed between gantry poles, hero head fills a third of the screen (`bungee/r0.png`) |
| 5 | Silly Zone | ball only | n/a | n/a | beach ball is solid (hero stops at 1.8 m = r 1.5 + hero, ball rolls away) from 3 sides. Mushrooms, flop button, see-saw, tubes not played |
| 7 | Horse | yes (E mount, ride, sprint, R dismount, E remount) | 3 | yes (horse + E prompt) | nothing broken seen; jump not confirmed in the trace |
| 12 | High fall | not reached | n/a | n/a | bridge railings stop you walking off the bungee deck (good). R in walk mode just teleports to the last safe spot, which is where you stand, so nothing visible happens |

## Defects

### Major
1. **Skydive: holding W under the canopy flies out to sea** (activities/skydive). Repro: balloon
   E, jump at the top, hold W through freefall and keep holding after the chute opens (a child
   will). The canopy goes from over the rings (124, 22) to (227, −88) and into the sea in ~23 s.
   You land in the water and respawn at the balloon pad: no landing-ring stars, ride wasted. If
   you let go of W the assist circles you onto the rings (3.6 m from centre, 4 stars). Fix: clamp
   or steer the canopy back toward the rings when it leaves a radius around them.
2. **Renderer memory: clicking PLAY after a fresh boot took the renderer to 3.6 GB RSS and it was
   OOM-killed, 3 times out of 3** (core or ui; `scripts/qa4/steps/05-play-mem.js`). The same boot
   with `__rg.start()` instead of the PLAY click stayed at ~380 MB (`06-start-mem.js`). The only
   extra work in the click path is `capturePointer()` (`src/ui/index.ts:45-57`). First seen
   under a shared OOM cgroup and SwiftShader, so not verified on a real GPU: check Chrome's Task
   Manager after PLAY on a laptop. Treat as a blocker if it reproduces there.

### Minor
3. Trampoline: the how-to board stands across the straight line from the plaza, so a child
   walking in from the west gets stuck on it (`tramp/walk-7.png`) (world/activities).
4. Trampoline: at 30–45 m the height-gauge plates and their pole fill the top-left of the screen
   ("45 m" cut off, `tramp2/hold-18.png`, `trick-40.png`) (activities).
5. Balloon: Space pressed while the balloon still eases into the top (≈189.5 m, it looks stopped)
   is ignored; the prompt only appears in the `top` phase, and the auto-jump then fires after 4 s
   (`src/activities/skydive/index.ts:362-372`).
6. Rocket pads at 0 gems: a practice launch with no prize and no picture that says why
   (activities/economy).
7. Bungee start: camera inside the gantry, hero's head huge (`bungee/r0.png`) (core camera /
   activities/bungee).
8. R (respawn) in walk mode on open ground does nothing visible (teleports to `safeSpot` = where
   you are) (`src/core/player.ts:429-441`). A child pressing R to "go back" gets no reaction.
9. Hero pose after the skydive touchdown and after the rocket landing looks twisted: the head
   is turned 90° off the body (`balloon3/landed.png`, `rocket/1-first-f8.png`) (core/characters).

## Good
- Trampoline: walk-on bounce, hold Space grows bounces to ~41 m above the mat, A+W in the air
  scored stars (0 → 13), decays and lets you walk off. Gems and megas pay out along the way.
- Rocket: first launch free (68 → 83 from in-air gems), 0 gems = practice launch, paid = −3.
- Balloon: first ride free, second paid 5; auto-landing on the rings if you let go.
- Bungee: E prompt, cord catches, two big rebounds, lowered onto the mat, +32 gems in one ride.
- Silly Zone beach ball is solid from three sides and rolls away when pushed.
- No console errors on any round. No violent or health/therapy wording seen.

## Not tested (state plainly)
Buggy free drive and race (6), Gear Shack / wardrobe / workshop (8), chests (9), secret paths and
vaults (10), 60 s gem hunt with mega + combo (11), session end → end screen → play again (13),
the rest of the Silly Zone (5), the bungee winch, horse jump, a real high fall with flop. Not
reached because of the renderer crashes and the 2-hour box.
