# Stream E: bungee bridge and Silly Zone (branch `agent/activities-bungee-silly`)

Status: **done, ready to merge.** The latest `main` is merged in, and `npm run verify` is green on
the branch. There are no changes to `src/types.ts`, `src/main.ts`, `src/config.ts` or
`package.json`, and no downloaded assets: everything is procedural, so there are no `ASSETS.md` rows.

## What was built

### Bungee bridge (`src/activities/bungee/`)

- **The ride** (`index.ts`): a walk-mode-only `ExternalController`. It has these phases:
  `attach → windup → fall → lower → landed`, plus `winch`.
  - **Attach.** Press E on the jump platform at `anchors.bungee`. The cord's free end travels from
    its hook to your ankles. You walk out onto a springboard, and the safety gate at the tip swings up.
  - **Wind-up.** The board bobs, and the wordless prompt (jump icon + Space/A) shows the bob as a
    ring. Press Space at the top of a bob for a deeper dive. If you don't press, it dives by itself
    after 4 s (power 0.55).
  - **Fall.** You swan-dive towards −X, then hang head-down along the cord. The cord is a spring
    with a dashpot and only ever pulls. You get 2 big boings: the first rebound comes back to about
    2 m below the deck. The stick sweeps you around the fall line, camera-relative, inside a soft
    box that keeps you off the bridge and the canyon walls.
  - **Effects.** Wind loop, whooshes and boings at each bottom, a twang on the cord, a camera shake,
    and a wide FOV. The camera looks side-on from the south-west: high and looking down on the
    plunges, level on the rebounds.
  - **Lower and land.** After the second boing, a smooth curve lowers you onto the landing mat at
    `anchors.bungeeLanding`. On the way down you do a forward roll back upright. Then you cheer and
    the cord flies back up to its hook. You are handed back in walk mode with zero velocity.
  - **Stunt.** `stunt {kind:'bungee', value: depth in m, stars}` goes out through the shared
    `StuntGate`. Stars depend on how deep you dived compared with the deepest possible dive. Typical
    results: auto dive 2★, perfect dive 3★, weak dive 1★. The depth toast appears at landing.
  - **R** cancels at any point. It teleports you safely onto the deck (or back to the shore mat
    during the winch clip-on), releases the controller and clears the camera override.
  - **Winch post** next to the landing mat: E hauls you back up beside the arm and hops you onto the
    deck, so you can jump again without walking out of the canyon.
- **Cord maths** (`cord.ts`, pure). The cord is planned per jump from the real ground under the
  swing box (terrain heights plus a raycast at the plumb line). Rest length and stiffness are chosen
  so the deepest point leaves the head `plannedClearance(power)` above the ground (3–9 m), using the
  **full** launch energy, so damping and drag can only make the drop shallower. That is how the
  cord length adapts to the terrain. On top of that there are a soft cushion below 2.8 m and a hard
  guard: the head can never be below ground + 2 m.
- **Visuals** (`cordMesh.ts`, `model.ts`, `kit.ts`).
  - The cord is one dynamic tube with navy/yellow/cream brightness stripes. The stripe count is fixed
    per jump, so the stripes stretch with the cord and the tube thins as it stretches. It sags into a
    parabola when slack.
  - There is a yellow gantry with a cantilever arm and a spinning pulley, a striped springboard that
    flexes, a hinged gate, and a ringed landing mat with the winch post.
  - All merged by finish with vertex colours, about 11 draws in total.
- **Placement adapts to the world.** On the first playing frame, the deck end is found by
  raycasting west from `anchors.bungee` (bridge colliders can only be queried after the first
  physics step), and the springboard is attached to the end of the world's jump platform. The gantry
  posts sit 0.6 m in from that end, where the world's own gantry posts stand, so the two read as one
  frame.

### Silly Zone (`src/activities/silly/`)

Everything only reacts to a player in walk mode, so it never takes the player from a ride.

- **Giant beach ball** (r 1.5 m, 9 kg). It is a Rapier dynamic body with six bright/dark gores.
  - Walking into it pushes it: the character controller's impulse plus a gentle extra shove.
  - Landing on top bounces you up (12 m/s) with a squash.
  - It rolls off the pad and down the south slope.
  - It pops back home (with confetti) if it lands in the water, gets more than 70 m away, or sits
    more than 22 m away for 12 s with nobody near.
- **Five wobbly tube characters** with friendly faces and flapping arms, on spring-driven segment
  chains. They flail on their own and bend away (with a whack and a squeaky boing) when you run
  through them. They are instanced: 5 draws for all of them.
- **FLOP button.** Step on it and the button squashes, `ctx.player.flop()` fires, confetti
  bursts, and the camera shakes a little. It re-arms when you step off, or every 2.5 s while you stay on it.
- **Four spinning bumper mushrooms** (alternate spins). Touching the side boings you outwards and
  sideways with the spin (about 9 m/s sideways, 6 m/s up). Landing on a cap bounces you up 12.5 m/s.
  Stems have colliders; caps squash.
- **See-saw catapult.** Step into the cup at the low end. A pink jelly counterweight hops from its
  pedestal onto the high end and the plank slams. You fly 7 m towards the zone centre with a 4.2 m
  apex and a front flip (visual only, cleared on landing), then land softly in walk mode. This emits
  `stunt {kind:'launch', stars: 1}`.
- **Floor dressing**, only inside the radius: a dotted mat under the mushroom row, a stud ring
  around the FLOP button, and a chevron mat for the see-saw flight path.

## Integration points

- `src/activities/index.ts`: two registrations (`createBungee`, `createSilly`; create, update and
  dispose lines), plus two re-exports.
- `export const bungeeSpots: {position, tag}[]` (live array, filled on the first playing frame).
  It holds 3 points on the hands-off fall line (deck −8/−15/−22 m), the deepest point, and two
  swing points ±3.2 m to the sides that you reach by steering. Heights are body-centre heights, the
  same point gems pick up from.
- `export const sillySpots: {position, tag}[]` (filled at creation): above each mushroom cap
  (reached by a top bounce), above the ball (reached by a ball bounce), at the see-saw apex, over the
  FLOP button, and between the tube characters.
- No gems are created here. Hand the spots to the gem/mega-gem system.
- Test hooks, active only with `?test=1`:
  - `window.__rgBungee`: `phase()`, `info()`, `last()`.
  - `window.__rgSilly`: `ball()`, `ballHome()`, `flopButton()`, `mushrooms()`, `seesawCup()`,
    `tubes()`, `tubeBend()`, `resetBall()`.

## Tests

- Unit tests:
  - `tests/activities/bungee.test.ts`: the cord never takes the head below ground + 2 m (every
    power and ground height, and also with wild steering over bumpy ground). It gives 2–3 boings with
    the first rebound within 4 m of the deck. A better dive goes deeper and gets more stars. The cord
    only pulls. Also covers pump, tilt and lowering-curve maths.
  - `tests/activities/silly.test.ts`: bumper impulses always point outwards, follow the spin, and
    stay bounded, including a dead-centre hit. Also covers the top bounce, see-saw arc distance and
    apex, and tube springs (bounded, never fold, bend away from the player).
- e2e:
  - `tests/e2e/bungee.spec.ts`:
    - A full jump (E → phases in order → shore → walk mode, never below ground + 2 m, first rebound
      within 6 m of the deck, camera override null, wind off, bungee stunt ≥ 1★).
    - R cancel onto the deck.
    - The winch back up.
    - Screenshots.
  - `tests/e2e/silly.spec.ts`:
    - Pushing the ball moves it.
    - The FLOP button flops.
    - A bumper boings you sideways.
    - The see-saw flings you more than 3 m up and more than 5 m along.
    - Tube characters bend away.
    - Screenshots.
- Screenshots (full / R / G) go to `test-results/bungee/` and `test-results/silly/`. Two per
  attraction always run; `RG_SHOTS=1` adds bottom/lower/landed and tubes/see-saw/mushrooms/flop. I
  checked them: R-only and G-only both read clearly by brightness.

## Requests for other owners (not done here)

- **World (stream G / world-artist)**:
  1. Keep the jump platform's west end open (no railing or flag across it): my springboard and gate
     attach there. If the platform moves, my code follows it automatically (it raycasts to find the
     end).
  2. The `bridge`-tagged gem spots at `x = bungee.x − 6` (−7.5) are 1.9 m east of my fall line
     (≈ −9.4). They can be collected by steering, but `bungeeSpots` is the better source.
  3. A river or water in the canyon is fine. The cord plans against `max(heightAt, waterLevel)` and a
     raycast at the plumb line. Put any river **collider** under the swing box (x −19..−8,
     z −112..−100) so the raycast sees it.
  4. A board and beacon for the Silly Zone and the bungee shore would help players find them.
- **Gems/economy**: place (mega) gems at `bungeeSpots` and `sillySpots`.
- **Audio** (optional): a `'whoop'` voice SFX would suit the bungee bottoms (I use a high-pitched
  `whoosh` for now). That needs a `SfxName` addition in `src/types.ts`.

## Cost

- Bungee: about 11 draws (only near the canyon).
- Silly Zone: about 30 draws when everything is in view: 5 instanced tube draws, mushroom caps one
  draw each, the rest merged by finish.
- The cord rewrites roughly 500 vertices per frame. The tube chains do CPU matrix work for 70
  instances.
- Neither is ever in view together with the other.
