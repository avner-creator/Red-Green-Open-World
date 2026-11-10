# Stream O — sky rides: stunt plane and friendly dragon (branch `agent/sky-rides`)

Two rides on one shared arcade flight controller, in the new folder `src/activities/skyrides/`,
registered with one line in `src/activities/index.ts`. Strictly non-violent: the "air battle" is a
stunt-and-splash sky contest (hoops, cloud-balloons, water balloons on rafts and a giant rubber
duck); the dragon breathes bubbles and sparkles, never fire.

## What the player gets

**Stunt plane (airstrip).** Walk up to the yellow toy biplane, press E (prompt icon: rocket, the
closest existing `IconName`) → the hero hops into the open cockpit (scarf flutters, prop spins up)
→ 3-2-1 pictogram countdown → all three planes take off together → **90 s sky contest** against two
friends in their own planes:

- striped hoops (yellow/navy, 1 point, re-arm after 6 s, so every lap counts), white cloud-balloons
  with dark outlines (fly through to pop: 1), bullseye rafts on the sea (water balloon on Space:
  3 / 2 / 1 by ring) and a giant inflatable duck (5, big squeaky wobble);
- **weak-eye only**: bonus hoops beside/above the line (3), golden cloud-balloons (3) and the
  **best flight line** (chevrons along the course);
- Q (skill key / gamepad LB / touch skill button) = loop, or a barrel roll when turning or low:
  1 point + a `stunt` star; Shift = boost (thicker smoke trail);
- an aim ring on the water shows where a water balloon will land;
- friends who overtake you puff harmless confetti over you;
- auto landing at 0 s, roll-out, podium (places, scores, 1–3 stars, gem prize 6/4/2);
- can't crash: the ground, roofs and the sea boing you back up (comic squash), walls bounce you
  round, the island edge turns you back, a ceiling keeps you low enough to see.

**Friendly dragon (roost on the ridge by the lighthouse).** E → the hero tosses a treat, the
round mint dragon chomps it, wiggles and gives a happy roar → hop on → launch → a relaxed free
flight round the whole island (~80 s): Space flaps for height (a flap in rhythm, 0.35–1 s after the
last, is bigger and sparkles), glide and swoop with the stick, Q blows a stream of bubbles and
sparkles that pop cloud-balloons, C roars. Hands off, the dragon follows the tour by itself.
**Weak-eye only**: the treasure trail (gems that weave ±9 m off the autopilot line, so you have to
steer for them; 1 gem each) and golden cloud-balloons (2 gems). It glides home and lands gently on
the roost, and you hop off facing it.

Both: steer with the move stick (up = nose up) or by looking (mouse / right stick / touch drag:
"steer where you look"), auto-level when you let go, gentle autopilot after ~1 s hands-off. R
always leaves at once, on foot next to the plane / at the roost. Gem pickup keeps working at speed
(segment tests for our pickups; the island's Glow Gems use `gems.ts`, which already segment-tests
up to 90 m/s; e2e proves a pickup at boost speed). The player is handed back on the ground in walk
mode with no ride velocity, the camera override cleared and the wind/engine loops off.

**Tickets**: first ride of each per session free, then 3 gems (`ctx.profile.spend(3, 'ticket')`);
can't afford → `ui:toast { icon: 'lock', text: '+N' }` (gems still needed) and the ride doesn't
start. Prizes via `ctx.profile.earn(n, 'mission' | 'gem')`. Coded defensively: on `main` today
there is no `ctx.profile`, so both rides are free and prizes are just stars/toasts. Nobody is ever
locked out of everything (trampoline etc. stay free).

**Friends**: the two heroes from `src/core/characters/catalog.ts` that are not the player's own,
loaded lazily with `loadCharacter` on the first contest and seated in their cockpits (sit clip).
Rubber-banded (±25 % speed) so the race is always close; clumsy (miss hoops now and then, never
touch weak-eye items). Measured: a "kid who tries" bot scores 80 vs 44 / 27 in 90 s (28 vs 11 / 7
in the 30 s e2e); fully hands-off scores ~6 and comes third, so steering (and the weak eye) pays.

Events: `stunt` (`bigAir` for loops/rolls and for the contest result with 1–3 stars;
`longGlide` with the treasure count for the dragon tour), and a done signal
`ui:toast { icon: 'check', text: '<place>' | '<treasure>' }`.

## Sites (anchors `airstrip`, `dragonRoost` are not on main yet)

`siteFor()` uses `ctx.world.anchors.airstrip` / `.dragonRoost` when they exist, else:

| site | centre (x, z) | yaw | notes |
|---|---|---|---|
| airstrip | (-12, 46) | 0 (take-off south, +Z) | 40 × 14 m mown runway, beside the south road, between the plaza and the Silly Zone |
| dragonRoost | (-34, -130) | atan2(34, 130) (faces south over the canyon) | flat ridge top (y ≈ 32) west of the bridge, by the lighthouse |

The brief suggested the balloon field for the airstrip, but every open patch there is full of
scatter trees (checked with the physics trunk colliders). The meadow at (-12, 46) is the only
tree-free strip that size near the middle of the island, and it is a short walk from spawn.
**Ask for the main build**: add anchors `airstrip: { x: -12, z: 46, radius: 22, yaw: 0 }` and
`dragonRoost: { x: -34, z: -130, radius: 7, yaw: Math.atan2(34, 130) }` (and keep scatter out of
them), plus beacons/compass icons for both. The contest course (`COURSE_POINTS` in
`contestScene.ts`) loops south over the beach and bay (rafts and duck on the sea), up the east
coast, west over the park and garage and back along the runway. The dragon tour (`TOUR_POINTS` in
`dragon.ts`) circles the whole island.

## Files (`src/activities/skyrides/`)

| file | what |
|---|---|
| `flightModel.ts` | pure arcade flight: `stepFly` (turn/climb/boost, look-steer, auto-level, floor bounce, ceiling, edge turn-round, dragon sink/lift), tricks, Bezier, water-balloon ballistics |
| `pilot.ts` | the ONE shared `ExternalController` (`getSkyPilot(ctx)`): takes the player only from walk mode and never while `getFlight(ctx)` or another ride owns it; seats the rider with the craft's pitch/roll; stick + look → controls; surface probe (terrain, sea, roofs by raycast); wall-ahead ray; camera + loops cleanup |
| `course.ts` | closed Catmull-Rom courses with arc length, `nearest()` progress tracking, `offsetAt()` |
| `contestLogic.ts` | pure rules: points, raft rings, hoop crossing, rubber-band rivals, standings, prizes, stars, ticket price |
| `contestScene.ts` | course items (both-eye) and the weak-eye bonus hoops, golden clouds, best line; splash/confetti FX |
| `rivals.ts` | the two friends' planes and lazily loaded heroes |
| `plane.ts` | the contest ride state machine (board → countdown → takeoff → race → landing → rollout) |
| `dragon.ts` | the dragon ride (feed → mount → launch → tour → return → land → dismount), trail, bubbles |
| `planeModel.ts`, `dragonModel.ts` | procedural models (vertex finishes, inverted-hull outlines, CPU-bent wings/tail/scarf) |
| `sites.ts` | airstrip (runway, windsock, sign) and roost (rocks, nest, treat basket, sign, perch collider) |
| `skyHud.ts` | DOM HUD (clock, racers with crown, 3-2-1, +points pops, Space/Q hints, podium); classes prefixed `sk-` |
| `fx.ts` | instanced particle pools (one draw each) |
| `tickets.ts` | defensive wallet access, first-free tickets, prizes |
| `index.ts` | `createSkyRides(ctx)`; `window.__rgSky` test hook under `?test=1` |

## Red-green

Every glasses-twist object is registered only with `ctx.vision.add(obj, VisionLayer.WeakOnly)`
(brightness-only `MeshBasicMaterial` with grey vertex stripes so shapes read on the layer); their
pop/collect sparkles are on the weak layer too. Bubbles that touch a golden cloud fly on (only
both-eye clouds swallow a bubble), so nothing in the both-eye scene marks where a weak item was.
Sounds play only on collection, never as a position hint. Both-eye objects use brightness
contrast (yellow/navy stripes, white clouds and the toy plane with dark inverted-hull outlines),
checked in the R-only and G-only screenshots. The e2e channel test renders the same frozen frame
with the sky rides' weak objects shown and hidden: the weak channel changes, the strong channel
and blue are bit-identical, for all 4 lens/eye combinations, for the plane contest and the dragon
tour.

## Performance

Idle (nobody riding): airstrip = plane (5 draws: body, outline, blades, blur disc, scarf; shadow
via one proxy on layer 7) + runway (1) + props (1) + windsock (1) + sign (2); roost = dragon (7:
body, outline, head, head outline, eyes ×2 instanced, wings, tail; shadow proxy) + rocks/nest/
basket (1) + sign (2) + post (1). Contest objects, the rival planes, bubbles and the trail exist
only while a ride runs (`visible = false` otherwise) and the contest scene is built lazily on the
first contest. Nothing per-frame runs for an idle ride except the windsock sway, the dragon's
breathing/blinking and the plane's prop/scarf (a few dozen vertices). Measured draw calls and
triangles: see "Measured" below.

## Tests

- `tests/activities/skyrides.test.ts` (unit, 22): flight auto-level, turning/boost, look-steering,
  never-crash (dive + cliff) for plane and dragon, edge turn-round, ceiling, dragon sink/flap,
  loop/roll tricks, low-altitude roll, water-balloon aim prediction, raft rings, course length /
  seam-continuous progress / right-hand offsets, hoop crossing, rubber-banding, deterministic
  clumsy rivals, overtakes, standings and ties, prizes, stars, tickets, Bezier ends.
- `tests/e2e/skyrides.spec.ts` (5, ~27 s at 640×360 Low): a full contest (30 s round via the test
  hook) played by a "kid who tries" bot to a podium in walk mode, with a Glow Gem picked up at
  boost speed; R mid-contest leaves safely; a full dragon tour (feed → … → dismount) with a
  treasure picked up at speed; sky rides refuse to take the player off the balloon ride; the
  4-combo channel test for both rides. Screenshots: `test-results/sky-rides/{plane-contest,
  dragon-tour}-{full,R,G}.png`.

## Not done / follow-ups

- Buddy puppy in the back seat: `src/buddy/` is not on main; when it lands, seat it at
  `PLANE_DIMS.seat + (0, 0.1, -0.9)` and on the dragon behind the rider.
- No new `IconName`/`SfxName` (shared types): the plane prompt uses `rocket`, the dragon `hand`;
  the dragon roar is `horn` at low pitch. A `plane`/`dragon` icon and a `roar`/`pop` SFX would be
  nicer (wanted in `src/types.ts`: `IconName |= 'plane' | 'dragon'`, `SfxName |= 'pop' | 'roar'`).
- Economy `TicketKind` only knows `balloon | rocketPad`; we use `profile.spend` directly. If the
  economy wants the sky rides in its ticket table, add `'plane' | 'dragon'` there and swap
  `RideTickets.pay()` for `ctx.economy.payTicket(kind)`.
- Wayfinding: no beacon/compass entry yet (world/ui owned) — see the anchor ask above.
