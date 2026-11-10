# Stream M: Foam Lava course (branch `agent/foam-lava`, folder `src/activities/foamlava/`)

Status: **done, ready to merge.** Latest `main` is merged in and `npm run verify` is green on the
branch (see "Tests" for the numbers).

## What it is

A timed backyard obstacle run across a sea of churning pink-white foam "lava", raced against a
friend. It is wordless: pictograms and numbers only.

- **Start:** walk up to the striped booth between the two decks. E (or gamepad X, or the touch use
  button) starts a run. A price chip over the prompt shows ✓0 for the first run each session and
  💎3 after that. A front camera shows the hero under the start/finish arch with the friend waving,
  then a big **3-2-1-GO** with tick/start sounds. At GO the camera swings in behind the hero.
- **The run (a U shape, about 47 m long):**
  - **Lane A, going out:** four pool floats that tip if you stand off-centre (soapy grip, slip off
    the low side), four upside-down wheelie bins as a staircase, checkpoint 1, four balance blocks
    that wobble, and a wobbly plank bridge (six planks that sag and roll under your feet) up to
    tower A (checkpoint 2).
  - **The crossing:** a rope swing between the towers. Walk into the rope and you grab it
    automatically. It drops you on tower B at the far end. Jump early and you let go with the
    rope's speed. Big kids can also jump the gap.
  - **Lane B, coming back:** a slip-and-slide chute (belly-down slide, steer left and right) to
    checkpoint 3. Then a narrow walkway past three foam blowers. Each blower swells and wobbles
    for 0.7 s, then a foam puff blows across the walkway and knocks you into the foam if you are
    in it. After that, two big bounce bubbles fling you onto the finish deck, beside a bubble
    machine that goes into overdrive when you finish.
- **Falling in:** a foamy splash (ripple rings in the foam shader, spray, camera shake, splash
  and flop sounds), a flop pose while you sink in up to your chin, then a respawn at the last
  checkpoint with a **bubble beard** on your face for 10 s. The clock keeps running; nothing
  else is lost.
- **Leaving the finish deck:** there are no steps at the back; you hop down.
- **Friend:** another hero from `src/core/characters/catalog.ts` (never the one you play,
  rotating each run), loaded lazily with `loadCharacter`. It follows a scripted, slightly clumsy
  run: it slips into the foam at the third float, pops back out, and waits for the blowers. It
  finishes in about 32 s, so it loses to an 8-year-old who keeps going.
- **HUD (DOM, both-eye):** a stopwatch, three medal targets that grey out once the time passes
  them, and a race track with your dot, your friend's dot (in its card colour) and a chequered
  flag.
- **Result card:** a big medal (gold, silver or bronze, or a ribbon if you finish slower), 1-3
  stars, your time and the friend's time with a star beside the winner, the gem prize, and two
  buttons: ↻ replay (Space/E, gamepad A or X, tap) and exit (R or gamepad B/Y, tap). Walking
  away or 14 s of no input also leaves. Confetti (`ThrillConfetti`, a brightness-safe palette),
  a fanfare and a front camera on the hero's bow play behind it.
- **R always leaves safely,** at any moment of a run: you are put back on foot in front of the
  booth.
- **Outside a run** the course is solid (Rapier colliders on every part), so kids can walk it
  freely. Wading in the foam kicks up little foam sprays.

### Medals and prizes (`scoring.ts`)

| | time | stars | gems |
|---|---|---|---|
| gold | ≤ 22 s | 3 | 5 |
| silver | ≤ 30 s | 2 | 3 |
| bronze | ≤ 42 s | 1 | 2 |
| ribbon | slower | 1 | 1 |

Beating the friend adds +1 gem. The tidy test bot does the main route in ~17 s and the secret
shortcut in ~15 s. Kids take about 1.5-2.5× that.

### Glasses twist (weak-eye only): three kinds of glasses play

Following the "Red-green depth pass" (at least two kinds per attraction), the course uses three:

- **Find, secret shortcut tiles:** 14 tiles beside the blower walkway, running straight to the finish
  deck. They skip the blower timing and the bubbles, which saves about 3 s. A kid knocked off
  the walkway by a puff flies over them, so the tiles never make a cannon hit harmless by accident.
- **Find, safe stepping stones** (5): beside the floats, under the plank bridge, and in the
  rope-swing gap. A both-eye climb-out step there leads back up to tower B.
- **Follow, gold-pace sparkle:** a small glowing ball runs the course at exactly gold-medal
  pace. It replays the bot's clean run, recorded once and slowed so it finishes at 22 s. Keep up
  with it and you get gold.
- **Time it, blower countdown rings:** a ring on each foam blower's mouth shrinks to nothing
  just as the puff comes, then appears big again right after: "go now". The strong eye only gets
  the blower swelling in the last 0.7 s.
- All of these are drawn only on `VisionLayer.WeakOnly`, with `createLayerMaterial` and, for the
  sparkle's halo, `createGlowMaterial`: one instanced mesh of slab + raised frame for the tiles,
  one for the stones, one for the rings, and the sparkle. The tiles and stones each have a **real
  collider**: in the run sim, and as a Rapier static collider for free walking. Nothing in the main scene, the HUD
  or any sound points at them. Without them the foam is just foam.
- Channel check: in the R-only and G-only screenshots the tiles are solid black on bright foam
  for the weak eye and completely absent for the strong eye.

## Site and footprint

No `foamCourse` anchor exists on `main` yet, so the code falls back to `DEFAULT_SITE` in
`src/activities/foamlava/index.ts`: **course origin (middle of the start/finish line) at world
(−25.5, heightAt ≈ 18.0, −18.5), yaw π, mirrored sideways.** The course runs north (−Z) along
the flat backyard strip between the village's west houses and the hill, which lies between the
plaza and the lake (bay). The entrance is from the lane between the town hall and the bakery
(walk west from the plaza).

- **Mirrored:** the outbound lane A (floats, bins, bridge) runs on the east side by the house
  backyards, and lane B (chute, blowers, finish) on the west side. The mirror exists only in the
  course→world transform; the sim and data are unchanged. It keeps the run camera at the start
  line clear of a scatter oak behind the entrance.

- Course frame: x sideways (lane A = +x = west), z forward (north), y above the ground at the
  origin (y = 18.08).
- Footprint (course frame): x −7 … +7, z −6 … +45, including the booth, steps, blowers, rope
  frame and arch. In world terms that is **x −32.5 … −18.5, z −63.5 … −12.5**.
- With an anchor present, the code uses `anchor.position` as the course origin, `anchor.yaw` as
  the direction the course runs from the entrance into the pit, and no mirror (lane A on the
  anchor's +x side).

### Wanted from the integrator (world and types; not edited here)

The strip is not quite flat, and scatter stands in or next to the footprint: an oak at
(−29.6, −13.9) behind the finish deck, a rock at (−30.2, −29.4) in the foam by a blower, and a
pine at (−30.2, −64.4) just north of tower B. The terrain on the west edge also rises up to
+0.6 m, just under the foam. Adding the anchor plus a clear, flat pad fixes all of this. The
simplest choice is to keep the default site's position:

```diff
// src/types.ts
 export type AnchorName =
   | 'spawn' | 'garage' | 'ranch' | 'trampoline' | 'bouncePads' | 'bungee' | 'bungeeLanding'
-  | 'balloon' | 'landingRings' | 'lakePlatform' | 'lighthouse' | 'sillyZone' | 'launchPads';
+  | 'balloon' | 'landingRings' | 'lakePlatform' | 'lighthouse' | 'sillyZone' | 'launchPads'
+  | 'foamCourse';

// src/world/layout.ts, ANCHORS
+  // Foam Lava course: position = middle of the start/finish line, yaw = direction the course runs.
+  foamCourse: { x: -25.5, z: -18.5, radius: 5, yaw: Math.PI, onLand: true },

// src/world/layout.ts, PADS (flat at village height, keeps scatter out of the whole course)
+  { id: 'foamCourse', shape: 'rect', x: -25.5, z: -40, hx: 7.5, hz: 24.5, y: VILLAGE_Y, falloff: 6 },
```

With the anchor (no mirror), lane A sits on the west side. Once the pad has cleared the trees,
that is fine. If the anchor ends up somewhere else, any flat, clear 15 × 52 m rectangle works.
The course is fully data-driven from the anchor.

## Integration points

- **Registration:** one line, `createFoamLava(ctx)` in `src/activities/index.ts`, updated every
  frame. The update gates itself: it does nothing when more than 70 m away and not racing, and
  pauses while the session isn't `playing`.
- **Economy (Stream C):** duck-typed `ctx.profile` (`spend(3, 'ticket')`,
  `earn(n, 'mission')`). The first run each session is free. After that a run costs a 3-gem
  ticket. A child who can't afford one still gets a **practice run** (same race, no gem prize),
  so nobody is locked out. Without the economy there is no ticket and no prize line.
- **Done signals:** `stunt` `{ kind: 'bullseye', value: stars, stars }` (HUD stars, the session
  stars and the cheer sound); `ui:toast` `{ icon: 'check', text: '<time>' }`; and a DOM event
  `window` `rg:attraction-done` with
  `{ id: 'foamLava', medal, time, stars, beatFriend }` for the Fun Pass stamp. A typed
  `attraction:done` entry in `GameEvents` would be nicer; it's a one-line change in
  `src/types.ts`.
- **Player API used:** `setExternalController` (the whole run), `setAnimation`, `setTilt` (belly
  slide, rope lean), `setVisualStretch` (squash and stretch), `attach('face', …)` (bubble beard),
  `teleport` (leaving, done a frame after the ride lets go so no velocity spike), and
  `cameraRig.setOverride` with `yawOffset` and `orbitRate`. No interface changes.
- **Controls:** everything goes through `ctx.input.state` (camera-relative move, jump, use,
  respawn, flop), so keyboard, gamepad and touch all work. The result buttons are also
  clickable and tappable.

## Code map

| File | What |
|---|---|
| `layout.ts` | Course data in the course frame: solids (decks, floats, bins, blocks, planks, chute, bubbles, weak tiles/stones), checkpoints, rope, blowers, route |
| `sim.ts` | Pure, deterministic run sim: arcade platformer on the solids, tipping/rolling/wobble springs, rope pendulum, chute slide, blower rhythm and pushes, splash/respawn, checkpoints in order, finish, progress |
| `autopilot.ts` | Waypoint bot that plays through `SimInput`: unit tests, the e2e round, medal calibration |
| `scoring.ts` | Medals, stars, prizes, ticket price, the friend's scripted timeline |
| `build.ts` | Meshes: one merged vertex-finished static mesh, instanced floats, wobblers, bubbles, blowers, puffs, spray, machine bubbles and flags; rope; sign; shadow proxy (layer 7); weak layer |
| `foamMaterial.ts` | Foam shader (MeshStandardMaterial patch): layered value-noise billows, three sizes of cell bubbles, soft highlights, swell, up to 4 splash ripples |
| `friend.ts` | Lazy-loaded friend hero following the ghost poses |
| `ui.ts` | DOM: race HUD, countdown, price chip, result card (`data-testid` hooks) |
| `index.ts` | Site, colliders, booth interaction, tickets and prizes, the `ExternalController`, events, sounds, beard, confetti, `window.__rgFoam` test API (`?test=1` only) |

## Performance

All geometry is procedural (no new assets, so no `ASSETS.md` rows). Measured at Medium in the
test build:

- **Main-pass draws while idle:** about 11 (static, sign, foam, floats, wobblers, bubbles,
  blowers, machine bubbles, flags, rope). Puffs and spray are hidden unless active. The vision
  layer adds the weak meshes (tiles, stones, rings, plus the sparkle during a race), and the
  shadow pass adds 1 proxy. The detailed meshes do not cast
  shadows.
- **Triangles:** about 28k in total.
- Instanced meshes get their bounds from real poses at build time, so culling is correct. Nothing
  updates beyond 70 m. The friend only exists, and only draws, during a race.

## Tests

- **Unit** (`tests/activities/foamlava.test.ts`, 11 tests): the bot finishes the main route with
  no falls, in order, using the swing, the slide and a bounce, faster than gold; the shortcut is
  ≥ 2 s faster; walking off splashes and respawns with a beard; standing on a float edge tips you
  off; the finish counts only after checkpoint 3; jump apex; medals, stars and prizes; the friend
  is beatable (between silver and bronze), never stands in a puff, and ends on the finish deck;
  progress is monotonic.
- **E2E** (`tests/e2e/foamlava.spec.ts`, 4 tests, ~20 s): E at the booth → countdown → the bot
  plays a full round through the real controller → result card (medal, beat the friend) → R
  leaves on foot at the booth; a foam fall gives splash → beard → checkpoint respawn while the
  clock keeps running, and a mid-run frame (sparkle and rings up) changes only the weak channel;
  the weak tiles and stones change only the weak channel and never the strong channel or blue,
  for all 4 lens/eye combinations, with a positive control that hides only this course's layer
  objects; no errors.
- **Screenshots** (full, R-only, G-only): `test-results/foam-lava/` (`result*`, `beard*`,
  `tiles*`, `result-ui.png`).

## Decisions

- The hero is driven by a custom course sim inside an `ExternalController`, not by the walk
  controller. Tipping floats, rolling planks, the rope, the chute, puffs and splashes all need
  exact, deterministic control, and the sim is unit-testable and lets the e2e play a real round.
- Small gaps (< ~0.8 m) and steps up to 0.38 m can be walked, using coyote time from the last
  ground height, so 8-year-olds only have to jump for the fun parts (bubbles, the gap, early
  rope release). The challenge comes from the wobble, the rhythm and the timing instead.
- The blowers run on the run clock during a race, so every run (and the friend's script) is
  deterministic. Outside a race they run on the world clock.
- Practice runs instead of a hard lock when a child can't pay the 3-gem ticket.
- The tiles sit just above the foam, so the layer pass's depth test against the foam keeps their
  lower edge hidden and they read as floating "magic tiles".

## Known limits

- Until the world adds the anchor and pad above, an oak canopy hangs over the back of the finish
  deck (there are no finish steps; you hop down), and a rock pokes through the foam by a blower.
- The friend's GLB loads on the first run. On a very slow connection it can appear a moment
  after the countdown starts (the race itself never waits for it).
