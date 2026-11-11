# QA round 4, part B (main @ 8d371ca): full rounds played with real keys

Scripts: `scripts/qa4b/*.mjs` (Playwright, SwiftShader, 960×540, deviceScaleFactor 1,
`?test=1&freeze=1&quality=low`, `RG_PORT=4362`). Movement and actions are real key events
(`page.keyboard.down/up` → `src/core/input.ts`); time advances with `__rg.step(1/60, n)`. The
"child" picks W/A/S/D from the camera's forward vector toward a target every 0.1 s. Teleport
is used only to get ~10 m from an attraction; the last 10 m are walked. Hooks are used only to
read state, to place the kickabout ball, to skip a clock and to add gems.
Screenshots: `test-results/qa4b/<script>/` (not committed; rerun). Every screenshot named below
was looked at. The machine was shared with two other QA agents (load 10–15): game time ran
10–25× slower than real time, so items 5–8 were not played (scripts are written: `foam.mjs`,
`sky.mjs`, `life.mjs`, `outer.mjs`, untested).
No console errors and no `__rg.errors` in any run.

## Summary

| Item | Works? | Non-reader can start / play? | Round | Fun | Top defect |
|---|---|---|---|---|---|
| Bubble soccer | yes | start yes, play partly | 75 s / first to 3 | 3 | keyboard ball-chaser lost 0–2 and never scored; goal frame hides play |
| Dino sumo | yes | yes | **6.5 s of play** | 2 | far too easy and short (won 5–1 in 6.5 s) |
| Carnival row (5 booths) | yes | yes | 12–38 s | 3 | random key mashing wins 3 stars at 4 of 5 booths |
| Scoops | yes (1 cone) | partly | ~20 s | 3 | piling 5 scoops fast never topples; hint panels overlap |
| Foam lava, sky rides, living island, outer island | NOT TESTED | | | | |

## Bubble soccer (`bubble.mjs`)
- **Kickabout, ball solid from all 8 directions** (walk and sprint): closest hero–ball centre
  distance 1.09–1.34 m (ball r 0.72 + hero ≈0.35–0.42): no pass-through. Ball moved 1.8–9.2 m per
  push. Dribbled into the +X goal in 1.3 s (`006-kickabout-goal.png`).
- Booth prompt (bubble icon + E) reads well (`001-at-booth.png`). Walking from the booth straight at
  the pitch is blocked by the puffy wall; only a jump gets you in (`002-on-pitch.png`). Fine if
  intended, but there is no gap/ramp.
- **Active match (keyboard chaser, Shift + Space dash when lined up)**: lost 0–2 at the 75 s
  whistle (`010…037-active-t*.png`); my scripted player won 1–0 in an earlier partial run. A
  scripted "child who tries" does not reliably score.
- **Passive match**: rivals scored once in 30 s (then clock skipped). Losing is gentle: smiley face,
  1 star, +2 gems (`038-active-result.png`). Paid ticket 12 → 9. Fun Pass stamp counted (0→1/24).
- **R mid-match**: back on foot beside the booth at once (31.2, 42.1).
- Fun 3: bubbles, bumps and the hoop look great, but play is hard to read: the camera sits behind
  your own goal and the crossbar/net covers a quarter of the screen (`018-active-t30.png`,
  `031-active-t69.png`); in the second match it started low and side-on with a bubble filling the
  foreground (`042-passive-t0.png`). Change for most fun: a camera that follows the hero/ball
  above the pitch (never behind the net) plus stronger auto-aim on the dash kick.

## Dino sumo (`dino.mjs`)
- Booth prompt (dino icon + E) clear (`001-at-booth.png`). Bunting line crosses the camera there.
- **Active**: first ring-out 1 s after GO; won **5–1 in 6.5 s of play** (11.7 s incl. countdown),
  3 stars, wallet 0 → 15 in one round (card says +9) (`005-active-t6.png`, `007-active-result.png`).
- **Passive**: rivals finish 5–2–2–0 in 17.6 s; the idle hero was knocked out and stayed outside
  the ring (`014-passive-t12.png`); +2 gems, no harm.
- **R mid-round**: back on foot at (12.9, 51.3). Belly charge (Space) works; balloons visible.
- Bumps read as bouncy and comic (spray, rolling, waddling back). Nothing violent.
- Fun 2: looks lovely but a round is over before a child understands it. Change: rivals that dodge
  and charge back (or first to 5 *with* a 45 s clock and rivals worth more), so a round lasts 30–45 s.

## Carnival row (`carnival.mjs`)
Walked through the arch and to each stand (no stuck spots). Mashing child = alternate A/D, some
W/S, Space every 0.5 s (hold for ring toss).

| Booth | Score me / friends | Stars | Round |
|---|---|---|---|
| Balloon Pop | 47 / 7 / 6 | 3 | 33 s |
| Ring Toss | 34 / 4 / 4 | 3 | 38 s |
| Duck Pond | 34 / 8 / 3 | 3 | 33 s |
| Strength Bell | 8 / 10 / 7 | 1 (2nd) | 12.5 s |
| Glow Dodge | 15 / 7 / 4 | 3 | 33 s |

- Only Balloon Pop was free; Ring Toss, Duck Pond, Bell and Dodge each took 3 gems on their
  **first** play (11→8, 13→10, 15→12, 13→10). Docs say first play per booth is free.
- 0-gem child: E starts a practice round with no warning; winning 3 stars then shows **+0**
  (`064-paid-balloonPop-result.png`). Reads as "you won but got nothing".
- Wallet rose by more than the card shows (+5 on the card, +11 in the wallet on the first win).
- The two friends stand shoulder to shoulder with the hero and cover ~half the screen
  (`008-balloonPop-t20.png`, `018-ringToss-t16.png`); at Glow Dodge the stall-keeper stands
  in the lane and clips through the bee rival (`047-glowDodge-t16.png`).
- Strength Bell shows floating "15 m" / "20 m" text labels on the tower (`039-strengthBell-t8.png`).
- Fun 3: lively and readable, but too easy to feel earned. Change: make friends score close to
  a mashing child (or aim assist smaller) so 3 stars needs aiming.

## Scoops (`scoops.mjs`)
- Walking straight from the plaza to the counter, the hero sticks on the bench in front of the
  Gear Shack at (14.8, −1.3), where the shack's E prompt shows (`001-counter.png`). Approaching
  from Bouncy Park you face a blank dark back wall with no entrance cue (first run).
- Cone built start to finish with A/D, Space and E: rainbow cone, 5 scoops, caramel, duck +
  sprinkles + marshmallows, eat → +1 gem, effects burps/rainbow/tiny for 30 s with chips
  (`008-cone2-built.png`, `015-effects2-4s.png`).
- Five scoops added 0.1 s apart: lean ≤ 0.11, nothing toppled (debris 0). The promised topple never
  happened.
- The key-hint panel (A/D, Space, E, R) overlaps the WASD controls card and the Pip button
  (`008-cone2-built.png`, `016-zero-gem.png`).
- 0-gem child: shows "gem +3" but still opens the cone row (`016-zero-gem.png`); unclear.
- Not tested: worms/popcorn/pickle effects, recipe match with a friend, secret jar.

## Defects (ranked)
### Blocker
None found.
### Major
1. Dino sumo is over in ~6.5 s of play and a scripted child wins 5–1 (activities/dinosumo,
   `sumo.ts` SUMO.target 5, AI). Repro: `node scripts/qa4b/dino.mjs`, see `[active]` log.
2. Bubble soccer camera puts the near goal frame over the play; a keyboard ball-chaser could not
   score in 75 s (activities/bubbleball camera + dash assist). Repro `bubble.mjs`, shots t30/t69.
3. Carnival: random mashing gets 3 stars at 4 of 5 booths (activities/carnival rivals/aim assist).
### Minor
4. Carnival first play free only at the first booth played (activities/carnival tickets; known).
5. Practice round at 0 gems: 3 stars then "+0", no cue it was practice (carnival; Scoops similar).
6. Wallet gain larger than the result card's +N (dino +15 vs +9, carnival +11 vs +5): unexplained to a child (economy/stamps).
7. Carnival friends and keeper fill/clip the camera view (carnival camera/rivals placement).
8. Strength Bell shows "15 m"/"20 m" text (carnival).
9. Scoops topple never triggers when piling fast (scoops wobble).
10. Scoops key-hint panel overlaps the controls card and Pip button (scoops ui / ui).
11. Bench + Gear Shack on the straight plaza→Scoops line; blank back wall (world).
12. Bubble pitch has no way in except jumping the wall (bubbleball).
13. Bunting lines cross the camera at the dino booth and Scoops terrace (world/camera occluders).
14. HUD explain bubbles pop up during a match (`009-active-t3.png`, `042-passive-t0.png`) (ui).

## Not verified
Foam lava, sky rides (plane, dragon, Pip back seat), living island, outer-island perimeter: not
played. Carnival paid replay with gems (my "paid" round was the 0-gem practice round). Bubble
soccer bonus hoop scoring, dino water balloons/beat ring by eye. Audio, touch, gamepad.
