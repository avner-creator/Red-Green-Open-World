# Glasses results from existing attractions

Stream P, phase 2. Every older glasses twist now reports `glasses:result` with one line at the point
where the outcome is already decided and shown. Branch `agent/glasses-results`. Work list:
`src/activities/glasses/weave/README.md`, "Results from existing glasses twists".

| File (src/activities/…) | Line | mechanic | kind | tier | hit/miss |
|---|---|---|---|---|---|
| carnival/games/balloonPop.ts | 178 | balloonPrize | find | 1 | hit (player's bag only) |
| carnival/games/ringToss.ts | 149 | ringStar | find | 1 | hit |
| carnival/games/strengthBell.ts | 314 | bellSweet | timeIt | 2 | hit (player rings the bell) |
| carnival/games/strengthBell.ts | 325 | bellSweet | timeIt | 2 | miss (player's puck stops short) |
| carnival/games/duckPond.ts | 234 | luckyDuck | find | 1 | hit |
| carnival/games/glowDodge.ts | 314 | glowDodge | follow | 2 | hit (player's ball goes past) |
| carnival/games/glowDodge.ts | 320 | glowDodge | follow | 2 | miss (player bonked) |
| skyrides/contestScene.ts | 404 | skyBonusHoop | lineUp | 2 | hit |
| skyrides/contestScene.ts | 424 | skyGolden | find | 1 | hit |
| skyrides/dragon.ts | 314 | dragonGolden | find | 1 | hit |
| skyrides/dragon.ts | 367 | dragonTreasure | follow | 1 | hit |
| foamlava/index.ts | 312 | foamSecret | find | 2 tile / 1 stone | hit (every landing) |
| scoops/index.ts | 362 | scoopsSecret | read | 1 | hit |
| scoops/index.ts | 370 | scoopsSecret | read | 1 | miss (wrong jar) |
| bubbleball/index.ts | 261 | bubbleRing | follow | 2 | hit (home team) |
| dinosumo/index.ts | 268 | sumoBalloon | find | 1 | hit (player pops a weak balloon) |
| dinosumo/index.ts | 276 | sumoBeat | timeIt | 2 | hit |
| secrets/index.ts | 300 | secretPath | follow | 2 | hit (pedestal) |
| secrets/index.ts | 472 | vaultDoor | lineUp | 1 | hit (right button) |
| secrets/index.ts | 477 | vaultDoor | lineUp | 1 | miss (wrong button) |
| secrets/index.ts | 485 | vaultDoor | lineUp | 3 | hit (door opens; replaces the last step's tier-1 hit) |

Not added: race boost pads and skydive hoop gems (other builders own those folders now); racing
line and weak-eye arrows (guidance only, no outcome); chest keys, chest locks, gems and mega gems
(already counted through `chest:key`, `chest:opened`, `gem:collected`).

Notes:
- Foam lava reports every landing on a hidden solid; a "first landing per solid" filter would be new
  logic (the land event carries no solid id), so a shortcut run can report up to ~14 tile hits.
- Bubble ball's expired ring (`ringPop`) has no handler in `index.ts`, so no miss is reported.
- Names: `src/ui/glasses/summaryModel.ts` `KNOWN_NAMES` (now exported) has all ids above plus the
  weave parts (`bounce`, `chute`, `hero`, `boost`, `fakes`, `shack`).
- Guard: `tests/activities/glasses-results.test.ts`. E2e asserts in carnival, secrets, scoops and
  skyrides specs.
