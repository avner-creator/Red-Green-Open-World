# QA round 4, part B (main @ 8d371ca): full rounds played with real keys

Scripts: `scripts/qa4b/*.mjs` (Playwright, SwiftShader, 960×540, deviceScaleFactor 1,
`?test=1&freeze=1&quality=low`, `RG_PORT=4362`). All movement and actions are real key events
(`page.keyboard.down/up` → `src/core/input.ts`), time advanced with `__rg.step(1/60, n)`. Steering
picks W/A/S/D from the camera's forward vector toward a target, so the "child" steers like a
keyboard player (8 directions, ~0.1 s reaction). Teleport is used only to get ~10 m from an
attraction; the last 10 m are walked. Test hooks are used only to read state, to place the
kickabout ball for the 8-direction test, to skip a clock (`setClock`) and to add gems.
Screenshots: `test-results/qa4b/<script>/` (not committed; rerun the scripts). Every screenshot
named below was looked at by eye. The machine was shared with two other QA agents (load 10–15),
so game time ran ~10–25× slower than real time; this limited how much could be played (see the end).

## Summary

| Item | Works? | 8-year-old can start / play? | Round length | Fun 1–5 | Top defect |
|---|---|---|---|---|---|
| Bubble soccer | yes | start yes (bubble+E at booth); play partly | 75 s (first to 3) | 3 | keyboard ball-chaser lost 0–2, could not score in 75 s; near goal frame blocks the view |
| Dino sumo | yes | yes | **6.5 s of play** (won 5–1) | 2 | far too easy and short |
| Carnival row | yes | yes | 30–38 s | 3 | mashing random keys wins 3 stars at every booth; 2nd booth not free |
| Scoops | see below | | | | |
| Foam lava | not played | | | | |
| Sky rides | not played | | | | |
| Living island | not played | | | | |
| Outer island | not played | | | | |
