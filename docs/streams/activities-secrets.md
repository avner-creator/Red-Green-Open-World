# Stream F — secret paths and weak-eye extras (branch `agent/activities-secrets`)

Status: **done, ready to merge.** Latest `main` is merged in. All new code is in
`src/activities/secrets/`. The only shared file touched is `src/activities/index.ts` (create,
update, dispose, plus one re-export). There are no changes to `src/types.ts`, `src/main.ts`,
`src/config.ts` or `package.json`.

## What was built

1. **Four secret paths of floating stepping stones.** Only the weak eye sees them (WeakOnly
   layer), but they are solid: each stone has a real cylinder collider. Stones pulse gently, chime
   when you land on them (the pitch rises along the path), and the stone you stand on lights up and
   swells for about a second, still weak-eye only. Falling off is a normal fall.
   - **Rooftops**: climbs the back of the flat-roofed house (`flat` lot), crosses its roof, then
     hops over the main street to a pedestal on the blue house's hip-roof peak.
   - **Trampoline**: a spiral on the clear lawn just south of the giant trampoline, up to a
     floating pedestal 12 m high.
   - **Lake**: from the beach below the ranch, out over the bay to the floating platform at
     `anchors.lakePlatform`. The pedestal sits on the deck.
   - **Lighthouse**: a spiral around the tower, past the gallery, to a pedestal floating over the
     lantern (about 19 m up).
   - Each path ends at a **both-eye reward pedestal**: a cream-and-gold disc with a spinning gold
     star. Arriving pops a big confetti burst, emits `stunt {kind:'bigAir', value: height,
     stars: 3}`, plays a fanfare and shakes the camera. It pays out once per session.
2. **Weak-eye arrows**: chevron arrows on the ground (on terrain or roads, never on roofs or
   water), with a bright wave running toward the target. They lead from the nearest road to each
   path start and to each chest key. A key's trail disappears once the key is picked up. Targets
   right next to a road still get a short trail of at least 3 arrows.
3. **Two two-eye vault doors** in rock faces. One is at the cliff foot under the rocket-pad
   plateau, facing the landing rings. The other is in the hill at the north end of the village
   street. Each vault is a rock crag with a cream stone frame, a steel-and-brass door, three
   progress lamps and a chamber inside.
   - **Weak eye**: three big shapes float above the door with 1/2/3 pips and arrows between
     them. They light up one after another to show the order without words.
   - **Strong eye**: four shape buttons (star, moon, ring, triangle) on the door, plus a matching
     floor tile in front of each one.
   - Stand on a tile and press **E**. The prompt sits on the both-eye door, so it reveals nothing.
     A right press lights a lamp and chimes. A wrong press gives a friendly wobble and boing, and
     the sequence starts again. The third right press makes the door shudder and sink into the
     floor.
   - Inside is a both-eye treasure pile (gold heap, coin stacks, gems and a big star). Walking in
     emits `stunt {kind:'bullseye', stars: 3}`, `ui:toast {icon:'chest'}`, confetti and a fanfare,
     once per session.
   - Each session gets a fresh sequence: 3 different shapes out of 4, never in plain left-to-right
     order. In test mode the sequence is deterministic.
4. **`secretRewardSpots`**: a live array, re-exported from `src/activities/index.ts`, with
   `{position, tag}` entries: above each pedestal (`secret-<path>-top`), above each path's middle
   stone (`secret-<path>-mid`), and in each vault (`vault-cliff`, `vault-village`). No gems are
   created here; the gem/economy stream can place mega gems on these spots.

## How nothing leaks to the wrong eye

- Stones, halos, arrows and the sequence sign are only on the WeakOnly layer. Buttons and tiles
  are only on the StrongOnly layer. None of them are in `ctx.scene`.
- **Stone colliders don't move the camera.** Their collision groups are
  `groups(GROUP_VEHICLE, GROUP_AVATAR)`. `PhysicsApi.raycast` skips the vehicle bit, so the camera
  never bumps into an invisible stone, and gameplay probes (chest key placement, landing checks)
  ignore them. Only the player's character controller collides with them; cars and props pass
  through.
- Prompts are on both-eye objects only (the door). Sounds are not positional.
- Pedestals, the vault rock, the door, the lamps and the treasure are both-eye. They read in R
  and G by brightness: cream and gold against dark slate and steel. See the `-R`/`-G` screenshots.

## Tests

- Unit (`tests/activities/secrets.test.ts`, 17 tests), run on the real terrain:
  - Path generation: every hop has an edge gap ≤ 2.2 m and a rise ≤ 1.0 m. Generated hops are
    gentler: about a 0.7 m gap and a 0.75 m rise.
  - The walked hop across the flat roof is checked against the roof bounds.
  - Every stone's underside is above the ground and the water. The first stone is a step from the
    ground.
  - The lighthouse spiral clears the plinth, tower and gallery. The lake path ends at the deck.
  - Door logic: right, wrong, opened and reset, plus button selection by position and the
    door-local transforms. Sequences are distinct and never sorted.
  - The vaults stand on flat land.
  - Arrow trails: spacing, direction, the far and near cases, and the nearest road point.
- E2E (`tests/e2e/secrets.spec.ts`, 7 tests, about 35 s), run with `?test=1&quality=low`:
  - No stone, pedestal or vault wall intersects any world collider, checked with a Rapier shape
    query (`__rgSecrets.overlaps()`).
  - Every stone is above the ground or the water. There are 4 path trails and 6 key trails.
  - Stones are solid: the player stands on the first, middle and last stone of every path, it
    lights, and it chimes.
  - A real walk-and-jump (injected input) reaches the next stone on the spiral.
  - A pedestal pays out once.
  - Vault: the closed door blocks the player. A wrong press resets the sequence, the right order
    opens the door, and the treasure inside fires the stunt and the toast. Restart closes it again.
  - Channel isolation for all 4 lens/eye combinations, by canvas readback with only our own parts
    toggled (`__rgSecrets.setVisible`). Stones and arrows change only the weak channel, the sign
    only the weak channel, and the buttons and tiles only the strong channel. The other channel and
    blue stay bit-identical (max difference 0).
  - Screenshots (full, R-only, G-only) in `test-results/secrets/`: `lake`, `lake-pedestal`,
    `lighthouse`, `trampoline`, `rooftops`, `vault-door`, `vault-open`.

## Requests for the orchestrator (not done here: files I may not edit)

1. **StuntKind**: there is no "secret" kind, so pedestals use `bigAir` (HUD icon: balloon) and the
   vault uses `bullseye` (star). If you want a dedicated toast icon, add `'secret'` to `StuntKind`
   in `src/types.ts` and `secret: 'eye'` to `STUNT_ICON` in `src/ui/glyphs.ts`. Then change the two
   `emit('stunt', …)` calls in `src/activities/secrets/index.ts` to `kind: 'secret'`.
2. **Car wheel rays and stones**: `src/core/vehicles/car-sim.ts` uses
   `rayGroups = groups(0xffff, 0xffff & ~GROUP_AVATAR)`, so its suspension rays can hit a stone
   collider. Every stone is placed off the roads, and the spirals start away from paths, so a car
   only meets one if a kid drives onto the lawn under the first two stones. To make it impossible,
   use `groups(0xffff, 0xffff & ~GROUP_AVATAR & ~GROUP_VEHICLE)` there (cars don't need to ray-hit
   other chassis), or add a dedicated `GROUP_SECRET` bit in `src/core/physics.ts`.
3. **Chest keys** are found by name (`'chest-key'`) among the WeakOnly layer's children, read-only,
   once after the chests place them. A tiny export from `src/activities/chests` (for example
   `chestKeyObjects()`) would be cleaner.
4. Optional for the gem/economy stream: put mega gems on `secretRewardSpots`, so the weak eye has
   a payoff along each path as well as at the end.
