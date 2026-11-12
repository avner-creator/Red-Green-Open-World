# QA round 8 (main @ 4fc165d, batch 7)

Played 2026-11-12 on a quiet machine (this job only, apart from my own parallel browsers after Part 0). Chromium
SwiftShader, `vite preview` on 4405–4407, 960×540 keyboard unless noted, 640×360 and 1280×720 for the map board.
Everything after Part 0 was played with `&freeze=1` and `__rg.step(1/60)` (steady 60 fps) with real key events between
steps; `?test=1` teleports only for travel, reading state and toggling layers. I cannot hear audio.
Screenshots: `test-results/qa8/`, `test-results/qa8b/` (not committed; re-create with the scripts).

Scripts on branch `agent/qa8` (`scripts/qa8/**` is in the eslint ignores):
- `scripts/qa8/frametime8.mjs` (Part 0; `QA_ROOT=<folder with dist/>`), results in `scripts/qa8/part0.log`.
- Driver: `QA_QUERY='&freeze=1&quality=low' RG_PORT=4405 QA_CTL=4505 node scripts/qa8/driver.mjs`, then
  `scripts/qa8/run.sh scripts/qa8/steps/00-helpers.js scripts/qa8/steps/01b-play.js scripts/qa8/steps/q02-helpers2.js`
  and any `scripts/qa8/s8/*.js` (round 8 steps) or `steps7/*.js`. `s8/exitv.js` leaves any vehicle first.
- `first3.mjs` now takes `QA_HERO`, `QA_EYE=leftLens,weakEye`, `QA_SIT=<s>` (get into the buggy at s and sit) and obeys
  Pip's use cue in a vehicle; saves an R/G end screen. `sitbuggy.mjs` (sit in the buggy from 20 s). Logs in `scripts/qa8/logs/`.
- `b/sky.mjs`, `b/dino.mjs`, `b/carnival.mjs` (round 4 drivers, still valid) for plane, dragon, sumo, carnival.

Download: `dist/` 14.9 MB raw, 8.7 MB gzip -9 (budget 15 MB). Console errors: 0 in every run (driver, first3 ×6,
sitbuggy ×2, mapboard, sky, dino, carnival).

## Part 0: frame time (round 6/7 method, idle machine, before anything else ran)

960×540, `quality=low`, spawn, PLAY clicked, 20 s warm-up, then frames over 15 s (`frametime.mjs` method) and fps over the
next 5 s (`q01-fps.js` method). 590e2ad (round 6's build) built into a second folder; runs alternated, 20 s rest between.

| Run | Build | ms / frame (15 s) | fps (5 s) | load avg 1 min at start / warm / end |
|---|---|---|---|---|
| 1 | main 4fc165d | 714 | 1.8 | 1.84 / 1.82 / 2.48 |
| 2 | old 590e2ad | 625 | 1.4 | 1.84 / 1.85 / 2.33 |
| 3 | main 4fc165d | 714 | 1.8 | 1.76 / 2.11 / 2.49 |
| 4 | old 590e2ad | 577 | 1.4 | 1.98 / 2.29 / 2.68 |
| 5 | main 4fc165d | 577 | 1.6 | 2.31 / 3.25 / 3.42 |
| 6 | old 590e2ad | 652 | 1.8 | 2.92 / 2.90 / 3.15 |
| **mean** | main **669 ms**, old **618 ms** | | | load ≈ 2–3 is the browser itself (4 CPUs) |

Verdict: **no real regression.** Round 6's own build now measures 577–652 ms, the same as main (difference 8 %, inside the
run-to-run spread of 577–714 ms on either build). Round 6's 192 ms cannot be reproduced on this machine today, so round 7's
"slowdown" was a change in the machine/SwiftShader conditions, not in the code. Close QA7 M5; use `npm run perf:check`
(deterministic) for regressions, not SwiftShader wall time.

## Part A: round 7 findings re-checked

| Round 7 item | Result | Evidence |
|---|---|---|
| M1 parked buggy, hold W 20 s | **partly** | No more 30 s wedge. W from the garage drives 30 m and hits the dot-signs booth at 3.5 s, auto-unsticks after ~2.5 s, hits the balloon sign at 12 s (unstick 2 s), ends at a fence at 18 s; reset button shows. Still pointed at the dot-signs booth (`qa8/drv/m1/w-4.png`, `w-20.png`) |
| M2 child sits in the buggy (follower, gets in at 100 s) | **partly** | Pip: 118 s "Zoom!", 124 s "Try the buggy race!", 144 s "Let's go! It's this way!", 201 s same, 270 s "Hurry! Sunset". So cues at 18/24/44 s parked, then one more hop-out 57 s later, then 68 s of silence. `logs/sit100.txt` |
| M2 variant: child gets in at 20 s (during the story) | **not fixed (new major M2)** | Only "Hurry! Sunset is coming!" at 270 s; 250 s with no line at all. `logs/sit20.txt` |
| M3 dot signs from Pip's lead point | **fixed** | (58.1, 9.2) → pad (61.6, 9.1) straight, stall 0.75 s, prompt shows (`m3/pip-00.png`) |
| M3 from the stepping-stone trail | **fixed (reachable)** | trail start (70.9, 6.0) → pad in one walk, stall 0.25 s. The trail still ends at the back of the booth sign (`m3/trail-01-stones-end.png`) |
| M4 perfect-bounce ring | **fixed** | holding Space (big bounces): ring on 3 of 4 falls ≥1.2 s, taps in the window = hit/perfect (2 hits, 2 perfect each eye). Weak left and weak right: strong and blue delta 0 (`m4/left-ring.png`, `left-sep.G.png`). Window ±55–90 ms (m10 below) |
| M5 frame time | **closed** | Part 0 |
| m1 Scoops camera at E | **fixed** | camera 2.5 m from the head 0.5 s after E, 5 m from 1.5 s; cone tiles readable |
| m2 gates wait, hat in camera | **partly** | top hat: camera not inside the hat any more but so close that head + hat fill half the screen (`gl6/gates-noreturn-wait.png`) |
| m3 Silly camera at "go" | **fixed** | faces the arena, tube people in view; 6/6 in 25 s, 3★ (`silly/01-play.png`). A big yellow star sits over the hero's head at "go" |
| m4 Gear Shack from 12 directions | **partly** | front 5 of 12 directions get the E prompt at once; 90°/240° slide round fine; **120°, 150°, 180°, 210° (back and back-sides) stick 5–6.5 s with no prompt** and the walk window ends stuck. From straight behind the camera sits in the hat-stand prop and the screen is a wooden box (`m4shack/d180.png`) |
| hero with top hat, back to walls | **partly** | shack front: hero dithered behind the display rocket prop, barely visible (`hat/hat-tophat-shack-front.png`); shack back and Scoops front fine (`…-shack-back.png`) |
| m5 horse into foam rim | **fixed** | rides over the rim onto the course and circles it; camera 2.7–5.3 m; no stall > 1.5 s (`horse/foam-25.png`). Once inside the course the horse could not ride back out to the start ring 9 m away (stalled 8 s) |
| m6 map board from spawn | **partly** | 640×360: 8 badges ~15 px, tellable (trampoline, rocket, car, tent, balloon, horse, plane, face) but the board's top row hides under the compass bar (`mapboard-640/00-spawn.png`); 1280×720 clear (`mapboard-1280/00-spawn.png`). Up close the hero still covers the middle bottom badge (`mapboard-640/02-near.png`) |
| m7 soccer walk-on | **fixed** | from the booth straight onto the pitch (stall 0); from Pip's point fine. From north/east/west sides the pitch wall stops you (only the south side is open), fine |
| m8 ignorer calls | **fixed** | 300 s ignorer: 1 rescue + 4 calls to 4 different places (trampoline, bounce pads, rocket pads, last-minute dot signs), never the same twice; idle chatter in between. `logs/ignore.txt` |
| m9 dot signs pedestals | **partly** | per-pedestal E works only when the hero faces the pedestal. Arriving sideways (walked along the row) there is no 2D prompt and E does nothing, yet a 3D "E" bubble floats over the pedestal (`dots8/play.png`). Walking from pedestal 0 to 1 still sticks 4.75–5.25 s on the middle one |
| m10 secret paths | **partly** | rest stones work on straight paths: rooftops 17 stones in 19 jumps, lake 21 in 21, both claimed. Spiral paths (trampoline 16, lighthouse 26 stones): a miss lands on a lower stone of the spiral, which counts as "going back", so the rest stone does not help; my patient hopper never finished either in 120 jumps (reached 14/16 and 20/26). A single jump 14→15 by hand works |
| m11 toys celebration noise | not re-tested (no leak, round 7) | |
| m12 gates scoring, red lens right | **likely fixed** | weak left 2/3, weak right 3/3 (round 7: 2/3 and 1/3); bot-level evidence |
| m13 foam result camera | **fixed** | result card with the course in view |
| m14 dragonRoost lead | **fixed** | roost path from the north junction walks up in 3 legs, no stall (`qa8b/sky/019–021`) |

## Part B: first plays

Understood = a non-reader knows what to do within 10 s. Fun 1–5.

| Thing | Understood | Ended properly | Fun | Notes / stalls > 15 s |
|---|---|---|---|---|
| Balloon + skydive + parachute ring | yes (auto-board, Space icon, parachute pictogram) | yes, landed 35 s after boarding | 4 | weak-eye timing ring closes on its target; Space in the window = hit (+gems). Hoop + orbiting gem shown. Sep 0 on ring and hoop (`sky8/ring.png`, `ring-sep.G.png`) |
| Plane contest | partly (what to hit is unclear) | yes, 47 s + landing | 3 | held keys scored 5 vs rivals 21/10, 3rd, +8 (`qa8b/sky/007-plane-race-t20.png`) |
| Dragon tour | mostly | yes, 54 s | 3 | 2 points vs friend 11, 2nd, +3 |
| Dino sumo | yes | yes, 92 s (75 s clock + intro/result) | 3 | active child 1st with 2 points; passive 0 points. Bunting strings and lanterns hide the hero in the pile (`qa8b/dino/008-active-t15.png`). Long for one round |
| Carnival: balloon pop | yes | yes, 33 s, 1st | 3 | camera behind the hero and two rival heads that hide most of the balloon wall (`qa8b/carnival/006-balloonPop-t12.png`) |
| Carnival: ring toss / duck pond / strength bell / glow dodge | yes | yes: 38 s 1st, 33 s 1st, 12 s 2nd, 33 s 1st | 3–4 | paid replay and 0-gem child work |
| Bungee | yes after the winch | yes, E at deck → landed 17 s, 2★ | 4 | winch lifts in 4.5 s; E must be pressed at the deck prompt (an E pressed while hopping does nothing) |
| Hero weave ring | no (no cue) | — | — | ring sparkle seen twice in 90 s; firing the power (Q) inside the sparkle gives **no hit**: counted "cancelled" both times (M4 below). Sep 0 |
| Vault door to open | yes | **door never visibly opens** | 3 | 1 wrong pad, then 3,1,2: API open+treasure, +5 gems, but the door stays shut in every view, also in real time (M3 below) |
| Wardrobe + pause during foam | — | yes | — | I is ignored in the run (button grey); Esc pauses, Esc resumes, run continues |
| Wardrobe + pause during race | — | yes | — | same; race continues |
| Full race lap as a child | yes | yes, 3 laps 101 s, 2nd, 2★ | 4 | 2 auto-resets after wedges (30 s, 54 s); boost weave ring attached; sep 0 |

## Part C: three 5-minute sessions as a follower

PART_C_TABLE

## Channel spot checks

Same frozen frame with and without each layer: strong-channel and blue delta **0** for the weak layer, weak and blue **0**
for the strong layer at: bounce ring (both weak eyes), gates (red right, both weak eyes), dot signs (red right), Silly,
balloon chute ring and hoop, race, hero ring, vault after opening. End screen readable in R-only and G-only.

## Findings

### Blocker
None.

### Major
- **M1 (activities/foamlava) Foam run started with the hero stuck beside the deck: hero frozen for the whole 85 s.**
  Repro (seen once, second try not reproduced): horse parked at the foam start (after riding into the course), walk onto
  the start ring from 9 m east with W held. The walk stuck 2.1 m from the ring for 8 s, the ring filled anyway, 3-2-1 ran,
  the run started without moving the hero onto the deck; W and Space did nothing for 77 s (mode `external`), ribbon at
  85 s. `qa8/drv/foam-jump/t010.5.png`, step `s8/b01-foam-menus.js`. Suspect: walk-on start while the hero is blocked at
  the ring edge (the parked horse) skips the "put on the deck" step.
- **M2 (buddy) A child who gets in the buggy during Pip's story hears nothing for 250 s.** Get in at 20 s (story lines
  still playing), sit: no vehicle cue ever, first line is "Hurry! Sunset" at 270 s. The vehicle cues seem gated on the
  intro being finished, and the intro waits for the child to follow. `logs/sit20.txt`, `scripts/qa8/sitbuggy.mjs`.
  Related (partly fixed QA7 M2): after the intro the cues stop after the second "hop out" (68–117 s silence).
- **M3 (activities/secrets) Vault door never visibly opens.** Village vault: 3,1,2 → `info().doors` says open and treasure
  (+5 gems), but the door stays up in every view (9 m, 4 m off-axis, in the doorway, and 8 s unfrozen):
  `qa8/drv/v/02-step2.png`, `v/05-side.png`, `v/06-realtime.png`. The payoff moment is missing.
- **M4 (activities/glasses/weave/hero) Hero ring sparkle cannot be won.** Firing the power (Q) while the skill ring
  sparkles ends the sparkle as "cancelled" (the skill stops being ready before `player:skill` is handled), never a hit:
  2 of 2 tries, `hits 0, misses 0, cancelled 2`. Step `s8/b06-hero-ring.js`.

### Minor
- m1 (world/gear-shack + core camera) Walking into the kiosk from behind (120–210°) sticks 5–6.5 s with no prompt; from
  straight behind the camera sits in the hat-stand prop (`m4shack/d180.png`). Shack front with a tall hat: hero hidden by
  the display rocket (`hat/hat-tophat-shack-front.png`).
- m2 (core/vehicles) Parked buggy still aims at the dot-signs booth; unstick works within ~3 s.
- m3 (activities/glasses/dotsigns) Pedestal E needs the hero to face the pedestal; sideways there is no prompt but a 3D
  "E" bubble shows (`dots8/play.png`). Middle pedestal still blocks side-to-side walking (≈5 s).
- m4 (activities/secrets) Spiral secret paths (trampoline, lighthouse): a miss lands on a lower stone, rest stones do not
  help; my hopper never finished either in 120 jumps.
- m5 (core camera / glasses gates) Gates wait with a top hat: head and hat fill half the screen (`gl6/gates-noreturn-wait.png`).
- m6 (world/fill mapboard) 640×360: board's top row under the compass bar; hero covers the middle badge up close.
- m7 (activities/carnival camera) Balloon pop: hero and rival heads hide the balloon wall.
- m8 (activities/dinosumo) 92 s per round; strings/lanterns hide the hero in the pile.
- m9 (activities/glasses/weave/bounce) Perfect-bounce window ±55–90 ms and only on big bounces (Space held); hard for 8-year-olds.
- m10 (ui/hud or activities/silly) A big yellow star covers the view centre at the Silly "go".
- m11 (core/vehicles horse) Horse inside the foam course could not ride back out to the start ring (8 s stall).
- m12 (buddy) Workshop menu left open: Pip silent the whole session (child opened the garage workshop at 10 s, 285 s no line).
- m13 (world/wayfinding) Dot-signs stepping-stone trail still ends at the back of the booth sign.

## Not tested
Audio by ear. Real-time feel (all play stepped; Part 0 only measured). Real phone/touch and gamepad this round. Real
glasses, calibration and crosstalk sliders. `npm run verify` / `shots:channels` (no game code changed; lint only).
Toys celebration noise (m11 r7). Scoops/Gear Shack purchases this round. Plane and dragon as a real child steering (bot held
keys). Hoop gem in the skydive (fell beside it). Combo-number hero sparkle. A clean repro of M1.

## Release readiness

RELEASE
