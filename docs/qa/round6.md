# QA round 6 (main @ 590e2ad, batch 5)

Played 2026-11-11 on a quiet machine (this job only). Chromium SwiftShader, `vite preview` on 4390–4397.
960×540 desktop (keyboard), iPhone 13 landscape 750×342 (CDP touch), emulated standard gamepad
(`navigator.getGamepads` override). Screenshots: `test-results/qa6/` and `test-results/qa6b/` (not committed;
re-create with the scripts). I cannot hear audio.

**Time:** real time in SwiftShader runs at 5.2 fps (192 ms/frame at 960×540 Low), so almost everything was
played with `&freeze=1` and `__rg.step(1/60)` = the game at a steady 60 fps, with real key / touch / pad
events between steps. Only the wardrobe check ran in real time, in the real game (no `?test=1`).
`?test=1` was used to teleport to a place, to read state, and to toggle layers for the channel checks.

Scripts (branch `agent/qa6`):
- `scripts/qa6/driver.mjs` + `scripts/qa6/steps/*.js` (interactive driver, copy of qa5). Start:
  `QA_QUERY='&freeze=1&quality=low' RG_PORT=4390 QA_CTL=4490 node scripts/qa6/driver.mjs`, then post
  `00-helpers.js`, `01b-play.js`, `q02-helpers2.js` (adds `H.sep` channel check), then any `q*.js` step.
  Glasses rounds: prepend `globalThis.QA_ID='oddone';` to `q42-play.js` (ids: oddone dotsigns lineup gates glowflies toys).
- `scripts/qa6/first3.mjs [desktop|phone] [secs] [follow]` (Pip follow / ignore runs), `pip-rides-probe.mjs`,
  `wardrobe-real.mjs`, `phone-cam.mjs`, `phone-scoops.mjs`.
- `scripts/qa6b/{dino,bubble,carnival,sky}.mjs` (qa4b copies, unchanged except output paths).
- `eslint.config.js`: `scripts/qa6/**` added to the ignores, like qa5.

Download: whole `dist/` 14.9 MB raw, ~10.8 MB compressed (under the 15 MB budget). Frame time: see above; no
earlier QA figure at the same size to compare against.

## Part A — round 5 findings re-checked

| Round 5 item | Result | Evidence |
|---|---|---|
| B1 Pip leads (child follows) | **fixed** for 3 leads; then Pip stops guiding (see M4) | `first3-desktop-long/log.json`: trampoline 26 s, bounce pads 56 s, rocket pads 71 s, "Now you choose!" 81 s; next lead (dot signs nudge) only at 171 s |
| B1 child ignores Pip | ok | `first3-desktop-ignore`: child pushed W 20 s then stood still; Pip called every 15–45 s ("This way, buddy!", "Over here! Woof!"), 5 rescues, never gave up, no pause |
| M1 phone hero on the Scoops counter | **fixed** (new stuck spots nearby, M3) | `phone-scoops`: off the counter in 0.5 s and 0.75 s from two spots on top |
| M2 Pip hides the hero (buggy, horse, plane, dragon) | **fixed** | `pip-rides/{buggy,horse,plane,dragon}.png`: hero clear in all four |
| M3 race stuck, 3 ways | **partly** | hard-left into scenery: auto-reset after 7 s; steer right off track: reset after 3 s; **reverse (S) into scenery: never resets** (25 s, m1). Idle 20 s: no reset (good). Reset button click: reset. R, R within 2 s: leaves to walk. `drv/rs/*.png` |
| M4 wardrobe tile pictures (real game) | **fixed** | no `?test=1`: 4 pictures after 2 s, 12 after 6 s, all 23 after 20 s. `wardrobe-real/02-wardrobe-20s.png` |
| M5 vault pads crossing | **fixed** | straight walks between all 12 ordered pad pairs never pressed a third pad (`q21` trace); the right order (3,1,2) from 9 m out opens the door. Wobbling on a pad's edge re-presses that pad (harmless after a wrong step) |
| M6 parked buggy / horse, 8 directions | **fixed** | sprinting into them: buggy closest centre 1.31 m (sides) to 2.13 m (ends), horse 0.87–0.90 m; no pass-through, no accidental mount. `drv/pk/hw-0-b.png`, `hw-4-b.png` |
| m1 bubble jumps | **fixed** | 0 jumps over 100 px (desktop 300 s, phone 200 s); a ~30 px pop at each new line remains (16 per 5 min) |
| m2 touch buttons | **fixed** | phone: lightning and wardrobe separate, recorder overlaps `[]`. `first3-phone/t0461.png` |
| m4 chest step prompt | **partly** | prompt is now step-icon + E, but E at the chest presses the nearest symbol tile and counts a wrong try (m2). `drv/ch/04-after-E.png` |
| m3 Esc in the workshop | **fixed** | Esc closes the workshop, phase stays `playing` |
| m6 bench and map board | **partly** | bench now beside the board; board still not readable from spawn, and the plaza chest's lock bubble sits in front of it (m10). `drv/map/00-from-spawn-facing-board.png`, `drv/map/01-in-front.png` |
| m7 Pip quiet during Scoops | **fixed** | 0 Pip lines during a 22 s Scoops game |
| m5 camera in hero at foam countdown | **not fixed** | `drv/foam/w0.png` (m4) |

## Part B — full rounds

Non-reader = could a child who cannot read tell what to do within 10 s. R/G = result screen readable in
R-only and G-only. Glasses rounds were played with weak eye left (weak R) and right (weak G), red lens left.

| Thing | Non-reader | Ended properly | Result R/G | Fun | Notes / stalls > 15 s |
|---|---|---|---|---|---|
| Odd one out | yes: marquee demo, pad, E | yes: 5 tries → celebrate → prize, 13 s | yes | 4 | 5/5 both eyes, 12 / 14 gems. Quick and clear |
| Dot signs | mostly | yes, 14 s | yes | 3 | 5/5 both eyes. From the arrival spot the booth shows its back and the straight walk to the pad sticks behind a pedestal (m6) |
| Line-up | yes (ring + bubble), needs fine aiming | yes (5 bubbles, ~12 s each) | yes | 3 | right eye 5/5, 14 gems; aiming works with look input |
| Gates | sign shows halves; "go back" sign after a run | yes when the child returns to the pad | yes | 3 | 3/3 (10 gems); right eye 2/3 (3 gems). **Stall**: child stays past the arch → waits 34 s, then the round is cancelled, the hit is lost, 0 gems (m3) |
| Glow-flies | yes | yes, ~61 s fixed length | yes | 3 | 2–3 caught, 0–4 gems |
| Toys | yes: paw prints | yes, ~23 s | yes | 4 | toy found, 5 / 7 gems |
| Dino sumo | yes | yes, 100 s, card | yes | 3 | lost 1–2, 2★, +6 |
| Bubble soccer | yes | yes, 60 s, card | yes | 3 | lost 2–3, 1★, +2. Walking from the booth onto the pitch sticks at the edge until you jump (m9) |
| Carnival (5 booths) | yes | yes, 12–38 s each | yes (names "Hopper/Mochi/Bumble" are the only words) | 3 | 4 wins, 1 second |
| Foam course | no: hero frozen off course | **no** | — | 1 | **B1, M1** |
| Plane | yes | yes, 52 s | yes ("+8") | 3 | 3rd, 0★ |
| Dragon | yes | yes, 54 s | yes | 3 | 2nd, +3 |
| Bungee | yes: walk on, E, it dives by itself | yes, 19 s + winch 4.5 s | toasts only | 4 | 2★, +18 gems |
| Balloon skydive | yes: jump pictogram + Space; auto-jump and auto-chute | yes, 28 s | toasts + Fun Pass tip | 4 | +16 gems, landed on the rings |
| 5-min gem hunt → end screen | yes | yes, end screen | yes (`drv/hunt/end-screen.{R,G}.png`) | 3 | bot child got 13 gems; longest gap 112 s |
| Gamepad (emulated) | — | — | — | — | walk 10.6 m in 2 s, A jump 1.38 m, right stick looks, X opens the kiosk, B closes, Start pauses, **Start again does not resume** (B does, m5), RB changes station (auto → trail) |

Channel separation spot checks (same frozen frame, layers toggled): at all six booths in both eye settings,
mid-round and at the celebration: strong-channel and blue delta **0** for the weak layer, weak and blue delta
**0** for the strong layer. One exception to look at: toys celebration (left eye) showed a 1–2 level delta in
G and B once; a second static check was 0/0/0, probably confetti advancing between renders (m12).
`npm run shots:channels`: gem present in R, absent in G; chest lock star only in G (`test-results/channels/gems-*`).

## Findings

### Blocker
- **B1 (activities/foamlava) Foam course: holding W through the 3-2-1 leaves the hero frozen beside the
  course.** Repro: walk to the foam booth, E, hold W (and tap Space) from the countdown on. The hero ends on
  the grass at (−31.3, 18, −13.1), off the start deck, and does not move for 35 s of W + Space; the autopilot
  cannot move him either; the clock runs past 185 s, lap 1/2, no respawn, no end. Only R gets out, and no R
  hint is shown. `drv/foam/w5.png`, `drv/foam/w10.png`, `drv/foam/a149.png`.

### Major
- **M1 (activities/foamlava) Foam course never ends for a child who keeps falling.** Second try (no keys in
  the countdown, then W + Space): the hero runs 5–18 m, falls, goes back to the start, again and again; after
  90 s still lap 1, no time-out, no "try again" card. `drv/foam2/r30.png`.
- **M2 (activities/scoops + core camera) Scoops customer fox: the hero walks into it and sticks, camera
  inside it.** Phone, walking east past the parlour from (16, 0): camera 0.59 m from the hero, view filled
  orange/yellow in 24/24 frames over 6 s of stick in four directions; desktop: stalled 13.5 s at (16.4, 0.1);
  from the counter side the hero stands inside the fox at (20.5, −4.3). `phone-cam/scoops-side-0_-50.png`,
  `drv/s/stuck-16_0.png`, `phone-scoops/after--0.8.png`.
- **M3 (buddy) Phone child walking straight to Pip's rocket-pad lead point sticks at the rail fence for 115 s.**
  `QA_DEST=1 RG_PORT=4391 node scripts/qa6/first3.mjs phone 200 140`: hero at (77.5–80, 0.5) from 85 s to
  200 s, 9 rescues, 3 hop-frees to (81.8, −1.2), each back on the same side of the fence.
  `first3-phone/t0461.png`, `t0643.png`, `log.json`.
- **M4 (buddy) After the third lead Pip stops guiding.** A child who follows Pip stands at the rocket pads
  from 81 s to 171 s hearing tips ("When the sun sets…", "Your hero has a super power!", secret-path how-tos,
  help button) with no lead; after the dot-signs nudge, nothing new from 194 s to the end (idle lines, "Try the
  buggy!" without leading). `first3-desktop-long/log.json`, `t0476.png`.
- **M5 (activities/scoops camera) The hero's head and hat cover the cone being built.** In the Scoops game the
  camera sits behind the hero; the head (plus the explorer hat from a chest) fills the middle of the screen.
  `drv/map/02-scoops-play.png`, `drv/map/01-in-front.png` (taken during Scoops).

### Minor
- m1 (activities/race) Reversing (S) into scenery never auto-resets: car at progress −21, speed 0, for 25 s
  (throttle only counts forward). `drv/rs/2-reverse-stuck.png`.
- m2 (activities/chests) E at the chest presses the nearest symbol tile and counts a wrong try (here the
  triangle). `drv/ch/04-after-E.png`.
- m3 (activities/glasses/gates) After a run, a child who does not walk back to the pad waits 34 s; then the
  round is cancelled, the hit is lost, 0 gems. Only cue: the U-turn sign; Pip is silent.
  `drv/gl6/gates-noreturn-wait.png`.
- m4 (core camera) Camera inside the hero's head at the foam countdown (QA5 m5, not fixed). `drv/foam/w0.png`.
- m5 (core input / ui pause) Gamepad Start pauses, but Start again does not resume (B does). `q80-gamepad.js`.
- m6 (glasses / world) Dot signs: the arrival view shows the booth's back; the straight walk to the pad sticks
  behind an answer pedestal for 11–15 s. `drv/gl/dotsigns-00-arrive.png`, `drv/gl/dotsigns-01-onpad.png`.
- m7 (core camera) Camera behind a tree trunk / under a canopy on the plaza's west lawn (−10, 20), and a pine
  between camera and hero in the toys meadow on the phone. `drv/heads/frog-fall-4s.png`,
  `phone-cam/toys-meadow-0_-50.png`.
- m8 (buddy) "A present for you! A silly duck hat!" said twice (25 s and 29.5 s); "Parachute now!" shown while
  walking on the ground after the trampoline (39.75 s). `first3-desktop-long/log.json`.
- m9 (activities/bubbleball) Walking from the booth onto the pitch sticks at the edge; only a jump gets on.
  `scripts/qa6b/bubble.mjs` log ("stuck walking onto pitch").
- m10 (world / chests) The plaza chest's big strong-eye lock bubble stands in front of the map board, and the
  board is not readable from spawn. `drv/map/01-in-front.png`, `drv/map/00-from-spawn-facing-board.png`.
- m11 (ui) During races and rides the wardrobe button greys out but keeps two "!" badges and the I key on
  top of each other. `drv/rs/05-hud.png`.
- m12 (vision / glasses toys) Toys celebration: one channel check showed a 1–2 level G and B delta when the
  weak layer was hidden (not reproduced on a second static frame). `drv/gl6/toys-celebrate.png`.

Head after landing (Part C): frog, fox and red panda, jump and 12 m fall: head yaw relative to the body is
within ±16° once landed (60–70° only mid-flop, by design); no 90° head after landing. Close shots
`drv/heads/*.png`. Console errors: none in any run (driver, first3 ×3, phone ×2, qa6b ×4, wardrobe-real).
Wording: no violent or medical words found in `src` strings or Pip's lines; nothing a child must read except
carnival rival names and numbers.

## Not tested
Audio (cannot hear). Real-time feel (SwiftShader 5 fps; all play stepped at 60 fps). The full `npm run verify`
e2e suite (ran typecheck, lint and unit tests: 1303 passed; no game code changed). Real phone, real glasses,
calibration and crosstalk sliders, red-lens-right combinations in the mini-games. Silly Zone, buggy free drive,
a full race lap by a child, horse riding, rocket pads, trampoline beyond the first-3 runs, Phase 2 weave
layers, Gear Shack purchases, chests other than the plaza chest, secret paths, NPC pass-through other than the
Scoops fox.
