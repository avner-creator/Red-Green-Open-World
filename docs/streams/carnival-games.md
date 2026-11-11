# Stream J — carnival games row (`agent/carnival-games`)

Folder: `src/activities/carnival/` (+ `games/`). Registered in `src/activities/index.ts` (one import,
one construct, one update, one dispose line). Tests: `tests/activities/carnival/*.test.ts`,
`tests/e2e/carnival.spec.ts`. Screenshots: `node scripts/shots-carnival.mjs [row|<gameId>…]` after
`npm run build` → `test-results/carnival-games/<name>-{full,R,G}.png` (also prints the idle row's
draw calls and triangles).

## What is there

A raised plank boardwalk with an entrance arch (tent pictogram), strings of bulbs, five striped
booths, a friendly stall-keeper per booth (round, big eyes, straw boater; turns to you, waves
hello, hops and claps when anyone scores) and a prize shelf at the north end where a plush toy
(tinted per booth, kept in `localStorage` `rg.carnival.v1`) pops in for every win.

Each booth: walk up, **E** at the counter → first play per booth per session free, then a
3-gem ticket → 3-2-1 with the game's pictogram and how-to keys (keyboard / gamepad / touch glyphs)
→ round → result card (podium with you and two friends, 1–3 stars, `+gems`, plush if you won) →
**E/Space/A** replay, **R/Y** (or the card's buttons) exit. **R always leaves safely** (back on the
midway, on foot). You play against two other heroes from the catalog (loaded with
`loadCharacter`, streamed in when you come within 30 m, only in the scene during a round). Friends
are cheerful, clumsy (`rivals.ts`: 50 % / 38 % accuracy on a relaxed tempo) and good sports: they
cheer when you win.

| Booth (site x) | Play | Glasses twist (WeakOnly layer only) | Round |
|---|---|---|---|
| Balloon Pop (+12) | aim with the camera (mouse / stick / drag), Space/E throws a beanbag, generous aim assist (0.62 m) | 4 **prize balloons** worth 3× (they reappear elsewhere after a pop) | 30 s, ★★ 8, ★★★ 16 |
| Ring Toss (+6) | aim left/right, hold Space/E to charge (power bar ping-pongs), release; further pegs 1/2/3 points; landing marker while charging | a **gold star on one peg** doubles it; it hops to another peg when ringed | 35 s, 8 / 16 |
| Duck Pond (0) | steer the net over the water, Space/E scoops (up to 2 ducks) | 3 **lucky ducks** carry a star on their back (3 points); luck moves on when caught | 30 s, 8 / 15 |
| Strength Bell (−6) | three towers (yours in the middle); a needle sweeps a dial above your head, Space/E stomps the springy pad (no mallet), the puck flies up past 5 pictogram tiers (snail, chick, cat, rocket, crown) to ring the bell; a ground-pound hero (Q) gets +0.15 power | the **sweet-spot wedge** on the dial; it moves to a random place before every stomp, so the both-eye dial (even ticks, no centre mark) gives nothing away | 3 stomps each, tier points (bell = 6), 9 / 14 |
| Glow Dodge tent (−12) | three lanes; sidestep (A/D, stick) foam lobs and hop (Space) over rollers | the **glowing foam balls** themselves (no shadows, no launch sound, sounds only on outcomes) | 30 s, 10 / 15 |

Friends never aim at weak-eye targets, so nothing they do reveals one. Prize hits pop with a
weak-layer-only puff. The result pays `ctx.profile.earn(stars + 2 if won, 'mission')` when an
economy exists, emits `stunt` (kind `bullseye`, value = score, stars) and a `ui:toast` (gem,
`+N`). Without `ctx.profile` (Stream C not on `main` yet) everything is free and nothing is paid.
A child short of gems gets a toast `have/3` with the gem icon and can keep playing everything that
is free (each booth's first round per session is free).

## Site

No `carnivalRow` anchor exists on `main`, so `layout.ts` uses a **fallback site**: origin
**(21, −42)**, yaw **−π/2** (booths face west, towards the backs of the east-side village houses),
radius **17 m**: the flat (y = 18) strip between the main street houses and Bouncy Park, from
z ≈ −26 (plaza end, entrance arch) to z ≈ −58 (prize shelf). Checked clear of trees (nearest:
oak at (24, −25) just past the arch, pines at (31, −50/−52) behind the booths), roads, gem spots
and other anchors. The row stands on a 0.38 m boardwalk because the meadow grass would otherwise
grow through the booths. If the world adds `anchors.carnivalRow` (position, yaw, radius) the row
uses it automatically (+Z of yaw = the side the booths face).

## Budgets (idle, measured)

10 draw calls in the main scene (booths + boardwalk + arch + shelf frame + all static game
dressing merged into one vertex-colour mesh; one pictogram sign mesh; keepers 2 instanced;
balloons, pegs, ducks, bell pucks, bells instanced; bell needle), plus small weak-layer draws in
the vision pass (prize balloons, peg star, lucky stars, idle demo glow balls; the bell sweet spot
during a round); plush shelf +1 once a plush is won; one merged shadow proxy on layer 7 (the
meshes themselves cast no shadows). **≈ 38k triangles** (measured by `scripts/shots-carnival.mjs`). Nothing updates beyond 48 m from the row (except a running round). Friends add
their character draws only during a round.

## Requests for the shared files (not edited)

- `src/types.ts`: a `StuntKind` `'carnival'` (stars from booth games are emitted as `'bullseye'`
  for now) and a `'carnivalRow'` `AnchorName`.
- `src/world/layout.ts` (world owner): add `carnivalRow: { x: 21, z: -42, radius: 17, yaw: -Math.PI / 2, onLand: true }`
  and keep scatter/grass out of it (the boardwalk then still looks right).
- `IconName`: a `'ticket'` or `'tent'` icon for the E prompt (booths use `'balloon'` / `'star'`).
- Pip (Stream for the buddy) can hook in through `window`-free events later: start/result already
  emit `ui:toast` and `stunt`.

## Tests

- Unit (45): round results/tickets/economy fallbacks, rival tuning (friends average < 8 points in
  30 s), site maths, booth spacing, shelf slots, friend picking, aim maths, balloon/ring/duck/dodge/bell
  rules.
- E2E `tests/e2e/carnival.spec.ts` (`?test=1&quality=low`, `step(dt, n, false)`): E at a booth
  starts a round and R leaves safely; every playable booth plays a full autopilot round to a won
  result (plush +1, stunt + toast, replay → countdown, exit → walk); canvas read-back channel test:
  each booth's weak-eye objects change only the weak channel, strong channel and blue bit-identical,
  for all 4 lens/eye combinations; no console errors. Test hook: `window.__rgCarnival`
  (`info/start/autopilot/replay/exit/boothPoint`).

## Build notes

Balloon Pop, Ring Toss, Duck Pond and the framework were written in the main stream session;
Strength Bell and Glow Dodge by two Opus helpers on `agent/carnival-games-bell` /
`agent/carnival-games-dodge` (merged here). Ball Scramble (optional item 6) was not built.
`npm run verify` adds about one minute of e2e for the carnival spec (5 tests).
