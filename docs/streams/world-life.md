# Stream H — a living island (branch `agent/world-life`)

Friendly, ambient, both-eye life for Carnival Island, in a new folder `src/world/life/`.

## What's in it

| Thing | Where | How it's drawn |
|---|---|---|
| Seagulls circling the lighthouse, the bay and the west beach (glide + flap bursts, banking) | `critters.ts` | shared bird InstancedMesh |
| Little ground birds (4 flocks: plaza, Bouncy Park, ranch, garage) that peck, **scatter up and away** when the player (5.5 m) or a vehicle (9 m) comes near, circle, then **resettle** on the clearest of their landing spots | `critters.ts`, `math.ts` (`stepFlock`) | same bird InstancedMesh |
| Butterflies over flower patches (the plaza flower ring + patches found with the same noise the flower scatter uses) | `critters.ts` | 1 instanced draw |
| Sheep in the paddock and chickens by the barn: graze, amble away from a walking player, and **hop aside with a comic squeak** from anything that would reach them in the next 1.2 s (vehicles: sideways out of the path; a running player: a big leap away, always faster than the chaser). They are never touched (unit-tested at 6–20 m/s, several offsets, and a homing sprint chase) | `critters.ts`, `math.ts` (`stepWaddler`) | 1 draw each species |
| Ducks (a white mum and four yellow ducklings) paddling an oval in the bay; they paddle faster when you come close | `critters.ts` | 1 draw |
| Fish jumping in the bay, with expanding splash rings | `critters.ts` | 1 + 1 draws |
| Fireflies fading in as the session nears sunset (`setTimeOfDay` > 0.55), blinking and drifting in 6 meadows | `critters.ts` | 1 `Points` draw, only at dusk |
| Soft contact shadows under sheep, chickens (and townsfolk on Low) | `critters.ts` | 1 instanced draw |
| Drifting cloud shadows: cloud cards only the sun's shadow camera sees (layer 7), dithered in the shadow pass so PCF turns them into soft ≤ 50 % shade | `clouds.ts` | 1 draw in the shadow pass; none on Low |
| Gusty wind: `U.wind` (new shared uniform) scales the flutter of flags/bunting/awnings and the sway of trees and grass | `clouds.ts`, `materials.ts` | — |
| 6 townsfolk (4 on Low) at the plaza, main street, Bouncy Park (kiosk + bench) and the ranch gate | `townsfolk.ts`, `places.ts` | 1 draw each (+1 shadow), only within 70 m and in view; hats: 1 instanced draw |

Townsfolk are the space-suit hero GLBs (panda, frog, bee) cloned with `SkeletonUtils`, pastel-tinted,
wearing an instanced straw boater with a coloured band. No new downloads: 3 GLBs ≤ 420 KB each,
already in `ASSETS.md` (rows updated). They load when the session starts playing (not during boot).
They look at the player (head turn, then body), **cheer** (hop) on a `stunt` event within 45 m,
**wave** on `player:emote` within 25 m, and when the player stands idle within 6.5 m for 2.2 s, turn
and **point** (arm aimed in world space at the bone level) at the nearest attraction's near edge —
attraction anchors only, never the centre where a gem may float; unit-tested against every gem and
chest spot. They have small static colliders. No dialogue text.

All of it is a both-eye object in the main scene; nothing is weak-eye-only or reveals one. Colours
contrast in brightness in R-only and G-only (white wool/dark faces, yellow ducklings, dark-tipped
wings); see `test-results/life/{plaza,ranch}-{full,R,G}.png`.

## Budget (measured by `tests/e2e/life.spec.ts`, SwiftShader, plaza view with townsfolk)

| Quality | Draw calls (incl. shadow pass) | Triangles | CPU per frame (whole module) |
|---|---|---|---|
| Low | 8 | 26k | ~0.13 ms |
| Medium | 10 | 42k | ~0.21 ms |

Limits asserted: ≤ 25 draws, ≤ 60k triangles on Medium, Low ≤ Medium, < 0.5 ms CPU. Other views:
spawn 5–6 draws, ranch 8–9, park 2–6. Things far from the camera are not drawn (per-species draw
distances) and far flocks/farm animals are not simulated. Low: fewer gulls, butterflies and flocks,
4 townsfolk, no cloud shadows.

## Determinism and tests

- Seeded `Rng` only, dt-driven time; no `Math.random`.
- In `?test=1` the townsfolk load **only on request** (`window.__rgLife.loadTownsfolk()`), so their
  async pop-in can never land between two frames another test compares. In normal play they load on
  `session:phase → playing`. `window.__rgLife` (test mode only) also exposes flock/farm state,
  townsfolk state, CPU stats and `setVisible` for draw-call diffs.
- Unit: `tests/world/life.test.ts` (angles, closest approach, dodge direction, never-touched
  simulations, flock scatter/resettle/separation, layout of every townsperson, flock, duck path and
  point target).
- E2E: `tests/e2e/life.spec.ts` (~25 s): boots `?test=1&quality=low`, birds scatter when the player
  approaches and resettle later, townsfolk load, budget at Low and Medium, idle → point, no errors,
  screenshots full/R/G in `test-results/life/`.

## Touches outside `src/world/life/` (for the integrator)

- `src/world/index.ts`: one import + one line, `installLife(api, ctx, root)` (wraps the world's
  `update` / `setQuality` / `setTimeOfDay`).
- `src/world/materials.ts`: new shared uniform `U.wind` (`uWind` in every patched material); cloth
  flutter and foliage/grass sway are multiplied by it. Default 1 = the old look.
- `ASSETS.md`: frog/panda/bee rows note their reuse for the townsfolk.
- Reads `ctx.player`, `ctx.vehicles`, `ctx.audio` lazily (they're created after the world).
- Imports `characterLoader` (meshopt) and `getCharacter` (catalog data) from `src/core/characters/`.
- No changes needed in `src/types.ts`, `src/main.ts`, `src/config.ts` or `package.json`.

## Known limits / ideas

- Squeak uses the existing `boing` SFX pitched up (no new `SfxName`); a dedicated squeak/baa/cluck
  would need an `SfxName` addition in `src/types.ts` + `src/audio`.
- Cloud shadows only appear where the sun's shadow map reaches (around the camera; none on Low).
- Cheer uses the heroes' `Jump` clip; a dedicated arms-up cheer clip would read even better.
