# QA round 7 (main @ c53ed15, batch 6)

Played 2026-11-12/13 on a quiet machine (this job only). Chromium SwiftShader, `vite preview` on 4396–4399.
960×540 desktop (keyboard), iPhone 13 landscape 750×342 (CDP touch), 640×360 and 1280×720 for the map board,
emulated standard gamepad. Screenshots: `test-results/qa7/` and `test-results/qa7b/` (not committed;
re-create with the scripts). I cannot hear audio.

**Time:** everything was played with `&freeze=1` and `__rg.step(1/60)` (the game at a steady 60 fps) with real
key / touch / pad events between steps. `?test=1` was used to teleport (travel only), read state and toggle layers.

Scripts (branch `agent/qa7`, `scripts/qa7/**` is in the eslint ignores like qa6):
- `scripts/qa7/driver.mjs` + `steps/` (qa6 copies) + `steps7/*.js` (new). Start:
  `QA_QUERY='&freeze=1&quality=low' RG_PORT=4396 QA_CTL=4496 node scripts/qa7/driver.mjs`, post `steps/00-helpers.js`,
  `steps/01b-play.js`, `steps/q02-helpers2.js`, then any `steps7/*.js` with `curl --data-binary @file 127.0.0.1:4496/run`.
- Phone: `phone-scoops7.mjs`, `phone-dests.mjs` (`QA_ONLY=a,b`), `phone-rotate.mjs`, shared `phonelib.mjs` (steered touch stick).
- `first3.mjs desktop 315 315` (follower, `QA_E=1`) / `first3.mjs desktop 300 0` (ignorer); now logs a per-second
  `ticks` array (lead state, mode, place) in `log.json`.
- `mapboard.mjs`, `frametime.mjs`, `b/bubble.mjs` (qa6b copy).

Download: `dist/` 14.9 MB raw, 8.7 MB gzip -9 (budget 15 MB). Frame time: see M5.

## Part A — round 6 findings re-checked

| Round 6 item | Result | Evidence |
|---|---|---|
| B1 foam: W held through 3-2-1 | **fixed** | walk onto ring, E, W held + Space: 2 laps, silver, 52 s, back to walk. `qa7/drv/foam-jump/countdown.png`, `result.png` |
| M1 foam: child who keeps failing | **fixed** | W only: finishes 50 s. W+D (veers, circles the start deck): ribbon at 85 s, +1 gem, back to walk. `foam-veer/result.png` |
| M2 Scoops customers trap hero/camera | **fixed** (phone and desktop) | phone, steered stick through both customers from 4 sides: no stall; min camera 1.5–6 m on 6/8; walking into the parlour front the hero overlaps a faded customer (camera 0.83 m, `phone-scoops7/cust1--90.png`). Desktop walks east/NE/SE past the parlour stop only at real walls (`drv/scw/*.png`) |
| M2 counter on phone | **fixed** | on the counter top 3 spots: off within 0–2.75 s |
| M3 lead destinations reachable on phone | **fixed for 21/22** | straight stick walk along the last leg of Pip's route: 21 reached. `dragonRoost` (−32.9, −125.6) sits on a cliff top: reachable from the east, from the north stuck 7.5 s at the cliff foot (`phone-dests/dragonRoost.png`). But see M3 below (dot signs pad behind the booth from Pip's point) |
| M4 Pip guides the whole session (follower) | **partly** | leads at 16/39/53 s, "Now you choose" 68 s, invites dot signs 72 s and buggy 98 s; longest on-foot gap without lead or activity 37 s. Then the child sits in the parked buggy from 105 s to the end with no lead or invite (M2). `first3-desktop-follow/log.json` |
| M4 ignorer | ok, but one-note | 11 calls + 8 rescues over 300 s, never gives up; every one is for the trampoline (m8). `first3-desktop-ignore/log.json` |
| M5 Scoops game view, biggest hats | **fixed** | sombrero, cone, top hat: side-on camera, cone fully visible (`drv/hat/hat-sombrero-3.png`, `hat-cone-3.png`). New: the first 2 s after E the camera passes through the hero's head (m1) |
| m1 race reverse stuck | **fixed** | S into scenery: reset after 7.5 s; hard left 5.5 s; right 6 s; idle 20 s no reset; button resets; R R leaves |
| m2 chest E | **fixed** | 3 chests: E ×3 at the chest adds 0 wrong tries; step on the right symbol opens |
| m3 gates return cue | **fixed** | child never walks back: next run starts by itself after 9 s; 3/3, 10 gems. Camera in the hero's hat while waiting (m2) |
| m4 foam countdown camera | **fixed** | 6.7 m from the hero (`foam-jump/countdown.png`) |
| m5 gamepad Start | **fixed** | Start pauses, Start again resumes; walk, A jump, X shop, B close, RB radio ok |
| m6 dot signs arrival / pad | **not fixed** | see M3 |
| m8 one-shot lines | **fixed** | duck-hat line once (19 s); no "Parachute now!" on the ground |
| m9 soccer pitch entry | **not fixed** | walking from the booth at the pitch stops at the wall; only a jump gets on (`qa7b/bubble/001-at-booth.png`). E at the booth still starts the match |
| m10 map board from spawn | **partly** | visible from spawn at both sizes, lock bubble no longer in front. 640×360: icons ~6 px, a child cannot tell them apart; 1280×720: wheel, balloon, castle readable. Walking up, the hero stands in front of the map centre (`mapboard-640/02-near.png`, `mapboard-1280/02-near.png`) |
| m11 wardrobe button in rides | **fixed** | grey, no badges (`drv/b/drive-0010.png`) |
| m12 toys celebration blip | **partly** | red lens right / weak left: weak-layer toggle 1-level G and B delta, strong-layer toggle also 1-level with 0 pixels > 2: frame noise in the celebration, not a leak. Other 3 toys checks 0 |
| Camera with the hero's back to walls | ok | Gear Shack, Scoops, carnival booths, dot-signs booth: hero stays in view (`drv/camwall/*.png`); carnival bell booth puts the camera inside the booth roof but the hero is visible |

## Part B — never played by QA before

Understood = a non-reader knows what to do within 10 s. Fun 1–5.

| Thing | Understood | Ended properly | Fun | Notes / stalls > 15 s |
|---|---|---|---|---|
| Silly Zone "Boop them all" | mostly | yes: 6/6 in 22 s, 3★, +5, card | 4 | walk-on pad starts it. The play view at "go" faces the rail, the tube people are behind the camera (m3) |
| Buggy free drive 60 s | yes | — | 2 | **W from the parked buggy wedges into the race booth 15 m ahead for 30 s**; A/D do nothing, only S frees it (M1) |
| Horse ride | yes | yes (E off) | 4 | 163 m in 40 s, sprint, jump ok. Stuck 10 s on the foam-course rim with the camera in the hero's head (m5) |
| Rocket pads | yes | yes, 7 s | 4 | walk on → launch → lands on the target pad. Sep 0 |
| Bungee | yes | yes, 19 s + winch 4.5 s | 4 | 2★, +18 gems |
| Gear Shack: buy and wear | yes from the front | yes | 3 | pizza hat for 4, worn at once. From the north side the hero sticks 8.75 s at the kiosk corner with no prompt (m4) |
| 3 chests (plaza, ranch, north hill) | yes | yes | 4 | key → carry → step on symbol: explorer hat, hero cape, flame paint. Sep 0 at each |
| 2 secret paths (rooftops, trampoline) | yes (stones visible to weak eye) | **no** for my bot | 2 | crude stone-hopper: rooftops 16/17 stones, trampoline 4/16 in 60 tries; any miss drops to the street and restarts (m10) |
| Vault, first sight → open | yes: windows + pads + rule board | yes | 4 | 1 wrong step then 3,1,2 opens; +10 gems (`drv/v/00-door.png`) |
| Weave: fakes | yes | yes | 3 | real gem among fakes, hit, +2 |
| Weave: Gear Shack dot picture | yes | yes | 3 | right box, prize item given |
| Weave: perfect bounce | — | — | — | **ring never appears** (M4) |
| Weave: race boost | yes | race not finished (60 s) | — | ring attached, 12 pads passed, sep 0 |
| Weave: hero ring | — | — | — | opened 44 times in the run; not played on purpose |
| Weave: parachute ring | — | — | — | not tested |

Glasses mini-games, **red lens on the RIGHT** (leftLens green), real keys, stepped:

| Game | weak left (weak G) | weak right (weak R) | Notes |
|---|---|---|---|
| Odd one out | 5/5, 12 gems | 5/5, 14 gems | 13 s each |
| Dot signs | not validly played | not validly played | driver bug: walked via the approach point behind the pad, stuck at the booth corner (M3); then 0/5 in 8 s, not reproduced in a clean run (default lens 4/5, a13) |
| Line-up | 5/5, 14 gems | 5/5, 16 gems | weak-right play frame had the bubble off screen (sep px 0) |
| Gates | 2/3, 3 gems | 1/3, 0 gems | bot ran through the answer arch every run (m12) |
| Glow-flies | 4/4, 7 gems | 5/5, 11 gems | one earlier weak-right round ended after 10 s with 1 hit (not reproduced) |
| Toys | found, 5 gems | found, 7 gems | 25 s |

Channel separation (same frozen frame, layers toggled): every check at every place played above (chests ×3,
silly, horse, rocket, secret path starts, weave fakes/shack/boost, all glasses rounds in both red-right settings):
strong-channel and blue delta **0** for the weak layer, weak and blue **0** for the strong layer, except the
1-level toys-celebration noise (m12 r6 row).

## Part C — misuse

- Hold W through countdowns: foam ok (B1 fixed). Silly: W walks you off the start ring before it fills; the round
  simply does not start (fine).
- Walk away mid-round: odd one out → round cancelled to idle within 1 s (no stall).
- Wardrobe (I) and pause (Esc) mid-round: silly and odd one out reopen fine and resume; during Scoops I is ignored,
  Esc pauses, resume ok. Not tried during foam and race.
- Spam E ×20 at the Scoops counter: one game, stays at the cone step, no double charge.
- Reverse: race ok (m1). Free drive: S is the only way out of M1.
- Phone rotate/resize mid-game: portrait shows a wordless rotate pictogram; back to landscape shows the pause
  menu (Resume big and yellow). Canvas follows 568×320 and 844×390 (`phone-rotate/*.png`).
- Console errors: 0 (driver 1, first3 ×2, phone ×4, mapboard, bubble). Driver 2 (silly, buggy, horse, bungee,
  rocket, shop, vault, paths, weave) was closed without dumping its error list; none printed.
- Repetition: no Pip line more than 3 times in either 5-minute run; "This way…" variants rotate.
- Reading: pause menu words sit under icons; carnival rival names. Nothing must be read to play.
- Camera inside things: Scoops entry (m1), gates wait (m2), horse at foam rim (m5), foam result camera inside the
  start-arch pillar (m13).

## Findings

### Blocker
None.

### Major
- **M1 (core/vehicles + world/garage placement) Free drive: holding W from the parked buggy wedges it into the race
  booth.** Repro: walk to the garage buggy (34, 20), E, hold W. After 2 s the buggy is nose-in at (33.7, 5.1) and
  stays there for 30 s of W, W+D, W+A; only S frees it. No auto-reset in free drive, Pip silent. `qa7/drv/b/drive-0010.png`,
  `drive-0050.png`, step `steps/20-buggy.js`.
- **M2 (buddy) A child who sits in the buggy gets no lead for the rest of the session.** Follower run: Pip invites
  "Try the buggy!" at 98 s, the child gets in at 105 s and does not drive; 105–300 s Pip says only 4 tips (timer, power,
  help button, Pip button) and "Hurry! Sunset"; no "drive" cue, no "hop out, follow me". `first3-desktop-follow/log.json`.
- **M3 (activities/glasses/dotsigns + buddy lead point) Dot signs: from Pip's lead point the pad is behind the booth.**
  Repro: stand at Pip's dot-signs point (62.5, 8), walk straight at the glowing pad (66.0, 6.3): the hero sticks at
  the booth corner (63.0, 6.1) for 11–21 s (`drv/dots7/50-pedestal-E.png`, `01-stall.png`). From the booth arrival spot
  a straight walk works. Walking between answer pedestals the middle one blocks and E answers it (m9).
- **M4 (activities/glasses/weave/bounce) The perfect-bounce ring never appears in play.** Repro: walk onto the
  trampoline, hold Space 2 s, let go. On every descent `weave.debug('bounce').falls` goes up by one per frame,
  `skipped` 0, `ring` false, `fall` null, so no ring is ever attached (18 m falls, 1.3 s). Step `steps7/b24-bounce-probe.js`.
- **M5 (perf) Real-time frame time looks worse than round 6.** Same method as round 6 (`steps/q01-fps.js`, 960×540 Low,
  spawn): 3.6 and 1.4 fps (278 / 714 ms) vs 5.2 fps (192 ms) in round 6; `frametime.mjs` after 20 s warm-up: 682 ms at
  960×540, 395 ms at 640×360. Machine idle. Needs `npm run perf:check` to confirm or clear.

### Minor
- m1 (activities/scoops camera) For ~2 s after E at the counter the camera flies out through the hero's head (head fills
  the screen while the cone tiles are already live). `drv/hat/cam-null-2.png`.
- m2 (core camera) Gates, waiting after a run: camera in the hero's hat. `drv/gl6/gates-noreturn-wait.png`.
- m3 (activities/silly) At "go" the camera faces the rail; the lit tube people are behind it. `drv/silly/01-play.png`.
- m4 (world/gear-shack) Approaching the kiosk from the north, the hero sticks 8.75 s at its side with no prompt; at the
  shack front the camera can hide the hero completely. `drv/shop/01-open.png`, `drv/weave/shack-0.png`.
- m5 (core camera / horse) Horse into the foam-course rim: stuck 10 s, camera inside the hero's head.
  `drv/horse/ride-035.png`.
- m6 (world/fill mapboard) Map board icons unreadable at 640×360; up close the hero covers the centre.
- m7 (activities/bubbleball) Walking onto the pitch stops at the wall; only a jump gets on (r6 m9).
- m8 (buddy) Ignorer hears 11 calls, all to the trampoline; Pip never offers anything nearer.
- m9 (activities/glasses/dotsigns) Between pedestals the middle one blocks and E answers it: a wrong answer the child
  did not mean (a13 round 9).
- m10 (activities/secrets) Secret paths: 17–26 stones of 0.8 m radius, 2 m apart, 0.7 m up each; any miss drops to the
  street and the path restarts. Hard for 8-year-olds; consider a mid checkpoint.
- m11 (vision / glasses toys) Toys celebration 1-level G/B noise when layers toggle (not a leak).
- m12 (activities/glasses/gates) With red lens right the bot's runs straight through the answer arch scored wrong
  3 of 6 times (low confidence; round 6 had 2/3 on the right eye too). `drv/gl6/gates-gR-*-through-*.png`.
- m13 (activities/foamlava camera) Foam result card: camera inside the start-arch pillar. `drv/foam-jump/result.png`.
- m14 (buddy) dragonRoost lead point is on a cliff top; reachable only from the east.

## Not tested
Audio (cannot hear). Real-time feel (all play stepped). Full `npm run verify` and `npm run shots:channels` (ran lint
only; no game code changed). Real phone, real glasses, calibration and crosstalk sliders. A valid dot-signs round with
the red lens on the right. Parachute weave ring, hero ring play, balloon skydive, plane, dragon, dino sumo, carnival this
round. Wardrobe/pause during foam and race. Gear Shack tile pictures in real time (frozen stepping does not build them).
Phone camera in tree spots (r6 m7). Gamepad in activities. Secret paths with a human-quality hopper. Vault door look after
opening.
