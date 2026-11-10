# Stream L — Bubble Ball arena and Dino Sumo ring (branch `agent/bumper-arena`)

Two new attractions, both fully procedural (no new asset files, so no `ASSETS.md` rows):

- `src/activities/bubbleball/` — **Bubble Ball** plus the small kit both games share (circle
  physics, site resolver, friend pool, round HUD, ticket/prize helper, merged-mesh builder).
- `src/activities/dinosumo/` — **Dino Sumo** (imports the shared kit from `../bubbleball/`).
- Registered in `src/activities/index.ts` (one import + create/update/dispose line each).

## How they play

**Bubble Ball** (booth on the arena's north side, E): the hero and five friends (the other heroes
from the catalog, loaded lazily the first time and shared by both games) each wear a giant
see-through bubble with a team belt (bright yellow = your team, dark navy = rivals). 3-2-1 with
pictograms, then a 60 s, 3-a-side match on a raised inflatable pitch with puffy walls and two
inflatable goals. Stick = roll (camera always looks down the pitch at the goal you attack),
Shift = faster, Space = bubble hop (dash; hitting the ball mid-hop lofts it). Hard bumps flip
bubbles head over heels (players too); everything bounces. Goals: confetti, fanfare, `+1` splash,
a quick kick-off. Rivals ease off when they lead and are slower than the player; in unit tests a
"child who tries" wins 9 of 10 matches.
Glasses twist (depth-pass kinds **find + follow + line it up**): **bonus hoops** pop up in mid-air
(weak-eye only) and drift slowly from side to side. Roll the both-eye ball through one and it
sparkles (weak-eye only): your team's next goal counts **double**. Friends can't see hoops.

**Dino Sumo** (booth on the ring's north side, E): four wobbly inflatable dinosaurs (instanced
suits with big eyes, a cream belly, bright spikes and a lagging five-piece tail; the wearer's head
pokes out of the top) on a round inflatable mat. 45 s round. Bump friends out of the pool-noodle
ring (+2 for the last bumper); they tumble out giggling and waddle back. Space = tail swing (a full
spin that shoves nearby dinos and pops water balloons in reach). Plain balloons splash you (+1,
short slow-down). Glasses twist (kinds **find + time it**): **magic water balloons** are weak-eye
only, only the player's tail can pop them (friends can't see them), they soak everybody else and
score **triple** (+3); and a weak-eye **beat ring** pulses round your dino, shrinking in once every
1.5 s: swing while it hugs the dino (last 0.32 s, drawn brighter) for a **super swing** (+1, a 1.6×
shove, a little more reach). With the weak eye shut the beat is invisible.

Both: first play per session free, then a 3-gem ticket via `ctx.profile.spend` when the economy
is present (coded defensively: without `ctx.profile` everything is free and prizes are skipped).
Prize: Bubble Ball 2/4/6 gems by stars (loss/draw/win) + 1 per double goal (max 3); Dino Sumo
2/4/6 by rank (4th–3rd/2nd/1st) + 1 per magic balloon or super swing (max 3). Result card: stars, `+gems`,
E (gamepad X) = play again, R (gamepad Y) = leave; touch: use = again, flop = leave; auto-leave
after 14 s. R or F during a round always leaves safely, back on foot beside the booth.
Signals: `stunt {kind:'bullseye'}` per home goal / player knock-out / player balloon pop and one
at the end with the result stars; `ui:toast {icon:'check', text:'<home> – <away>'}` (Bubble Ball)
or `{icon:'check', text:'<points>'}` (Dino Sumo) when a round ends (the "done" signal for a future
Fun Pass stamp).

## Sites (no anchors on `main` yet)

`resolveSite()` uses `ctx.world.anchors.bubbleArena` / `.dinoRing` if they exist, otherwise
fixed spots on the open meadow south of the garage (checked clear of roads, props, trees and every
anchor radius with the world colliders; the meadow slopes ~1.7 m, so each game stands on its own
raised inflatable deck with a striped skirt down to the ground):

| Attraction | Centre (x, z) | Yaw | Footprint | Booth (world) |
|---|---|---|---|---|
| Bubble Ball | (35, 57.5) | 0 (pitch long axis = world X) | rect ±11.6 × ±6.6 m | ≈ (28.5, 48.2) |
| Dino Sumo | (16, 58.5) | 0 | circle r 6.0 m | ≈ (16, 49.9) |

Deck tops: highest ground under the footprint + 0.25 m (≈ y 17.7 and 17.5).

## Wanted from the main build (not done here; outside this stream's folders)

1. `src/types.ts`: add `'bubbleArena' | 'dinoRing'` to `AnchorName`; `src/world/layout.ts`: anchors
   `bubbleArena: { x: 35, z: 57.5, radius: 13, yaw: 0, onLand: true }` and
   `dinoRing: { x: 16, z: 58.5, radius: 7, yaw: 0, onLand: true }` (or move them next to Bouncy
   Park as GAME_DESIGN says, with flat `PADS` entries; the games follow the anchors, and with a
   flat pad the deck simply sits 0.25 m above the ground). The booths stand ~9 m north of each
   centre, outside the radius; keep that strip clear too.
2. World dressing outside the footprints: a path from the south road (x≈5) to both booths, a
   fingerpost/beacon pictogram for each (bubble + ball; dino + balloon), maybe bunting.
3. `IconName` additions if the HUD should show these games (e.g. `'bubble'`, `'dino'`); today the
   booths use the generic `'hand'` E-prompt.
4. Pip (when `src/buddy/` lands): a 3-second first-visit demo at each booth.

## Performance (Medium, measured with the set visible vs hidden, all passes)

- Bubble Ball idle: **5 draw calls, 24.4k triangles** (one merged set mesh, sign, ball, shadow proxies).
- Dino Sumo idle: **11 draw calls, 15.6k triangles** (set, sign, plain balloons + strings, weak-eye
  balloons in the layer pass, shadow proxies). Splash particles cost nothing while idle.
- In a round: bubbles = 2 instanced draws + 1 proxy; suits = 2 instanced draws + 1 proxy; friends
  are the catalog GLBs (their own draws, no shadow casting). Nothing updates while idle and far
  away (Dino Sumo's balloons only sway within 60 m; Bubble Ball idles with zero work).

## Known limits

- The whole e2e suite was already over the ~3 min target before this stream (≈5 min on this
  container); this stream adds ≈32 s.
- Leaving mid-round is R / F (touch: flop button); there is no on-screen "leave" chip during play,
  only on the result card.

## Tests

- Unit: `tests/activities/bubbleball.test.ts` (bodies, walls, transforms, stars/prizes, rubber
  band, full matches incl. "a child who tries wins", bonus hoop → double goal, kick-off clock) and
  `tests/activities/dinosumo.test.ts` (ring-out credit and waddle back, weak balloon triple + soak,
  super swing on the beat vs off it, full rounds incl. "a child who tries comes first", friends
  act on their own). Bubble Ball also tests the hoop drift staying inside the walls.
- E2e: `tests/e2e/bumper-arena.spec.ts` (~32 s): full Bubble Ball match from the booth to the
  result card and R back to walking; canvas-readback channel tests for the bonus hoop + ball
  sparkle and for the magic water balloons (weak channel changes, strong channel and blue
  bit-identical, all 4 lens/eye combos); full Dino Sumo round, E replays, then the beat ring and
  balloons in a live round (all 4 combos), R leaves; no errors.
- Screenshots: e2e saves canvas full/R/G to `test-results/bumper-arena/e2e-*`;
  `npm run build && node scripts/shots-bumper.mjs` saves page shots (HUD included) of both idle
  sets, a live round, the weak pieces and the result cards to `test-results/bumper-arena/`.
- Test hooks (`?test=1`): `window.__rgBubbleBall` and `window.__rgDinoSumo` (phase, state, booth,
  start, setClock, ring/charge, balloons, world(), layer(visible)).
