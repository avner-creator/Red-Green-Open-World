# Stream D — rideable horse (branch `agent/core-horse`)

Two friendly horses idle in the ranch paddock. Walk up, press **E**: the character hops into the
saddle, the horse whinnies and does a friendly rear-up, and off you go. Every one of the six
playable characters sits correctly: seat bones on the saddle, legs around the horse's barrel,
hands forward on the reins.

## What was built

| | |
|---|---|
| Model | CC0 **Quaternius horse** (Ultimate Animated Animal Pack, rigged and animated), `public/assets/models/horse.glb`, 345 KB. Built by `tools/horse/build.mjs`: fighting/hurt clips removed (Attack, Death, HitReact), clips renamed, a **Trot** clip derived from the four-beat Walk (forelegs delayed a quarter cycle → diagonal pairs), non-metal materials, meshopt. `ASSETS.md` row added. |
| Look | Procedural tack: saddle pad (light cloth, dark blue trim), leather seat with pommel, cantle and brass horn, side flaps, girth; bridle (noseband, cheek straps, crown, brow band, brass bit rings); reins from the bit to the rider's hands (drawn only while ridden). Soft contact shadow. |
| Coats | `horse-maple` chestnut (bright in R, dark in G, so it reads on grass through either lens) with a cream mane; `horse-pebble` light grey with a charcoal mane. `setColor()` re-tints the coat (light/dark coat patches follow), the mane flips light/dark to keep contrast. `object.userData.defaultColor` is published. |
| Idle life | Clip variations (Idle, Idle_2, head low, grazing), procedural tail swish and ear flicks, a soft whinny when the player walks up (25 s cooldown). |
| Controller | Kinematic "fast character" (Rapier character controller + capsule; no physics rig). Stick: walk → trot (full stick, 7.5 m/s) → **gallop with Shift (13 m/s)**; S backs up. Turning eases in and widens with speed. **Space jumps ~1.6–1.7 m** (clears the 1.25 m paddock rails). Sure-footed: 52° climb, auto-step, snap to ground, slopes only slow it a little. Heightfield seams can't snag it (lift-retry). Water: wading slows it; deeper and it turns back to the shore by itself (never goes past ~0.35 m in testing); lost in deep water → splash and back to the last safe spot. Blocked → soft speed loss and a little bump, never a crash. Dynamic props get a light nudge (character mass 40). |
| Rider | `player.mode === 'riding'`, the player's position follows the saddle (gem pickup works). The rider leans with the horse (slope, turns, jump arc, rear-up). |
| Controls while riding | E dismount (to a free side: left, right, behind, front), **R** = horse *and* rider back on the last safe spot (stays mounted), **F** neigh, **C** (emote) rear-up + whinny, Space jump, Shift gallop. |
| Camera | Chase camera (distance 4.3 m, height 2.2 m) through the existing vehicle chase. |
| Audio | `ctx.audio.setLoop('gallop', intensity, pitch)`: pitch is matched to the clip cycle so the clops land with the hooves; silent when standing or airborne. `neigh` on mount, F, rear, a reset; `jump`/`land`/`bump`/`splash` as appropriate. |
| Perf | The GLB's 8 skinned meshes are merged into **one** vertex-coloured skinned mesh with a fixed bounding sphere (frustum-culled off screen); tack merged by material. About 7 draws per horse in view, 0 off screen. |

## Every character in the saddle

`src/core/vehicles/rider-pose.ts` layers a riding pose on top of each character's `sit` clip, by
bone name, after the player's animation update: thighs open around the barrel, shins hang, upper
arms down and forearms forward to the reins. Feet in these rigs are IK bones parented to the root,
so they are carried along with the shins. The seat point (between the hip joints, minus seat
padding) is measured every frame, so the vehicle puts it exactly on the saddle for any character.
Rigs: the robot and the four space-suit characters (humanoid names), and the T-rex
(`BackUpLeg/BackLowLeg/BackFoot`; sits back a little, works with the catalog seated pose that lays
his tail down). Screens checked: side, front-quarter and chase views for all six, full/R/G.

## Files

- `src/core/vehicles/horse.ts` — the horse as a `VehicleInternal` (`kind: 'horse'`).
- `src/core/vehicles/horse-model.ts` — model loading (lazy, shared GLTF, per-horse skinned clone),
  merged body, tack, clips, overlay (tail swish, ear flicks, folded forelegs when rearing).
- `src/core/vehicles/horse-math.ts` — pure gait/speed/turn/jump/slope/water/sound maths.
- `src/core/vehicles/bone-pose.ts` — additive bone posing (rotate about world axes, aim a limb,
  carry IK end bones, save/restore so clips never drift).
- `src/core/vehicles/rider-pose.ts` — the riding pose for every character rig.
- `tools/horse/` — offline asset pipeline (own `package.json`, not part of the game build).
- Tests: `tests/core/horse-math.test.ts` (12), `tests/core/bone-pose.test.ts` (3),
  `tests/e2e/horse.spec.ts` (6: paddock, mount + seat, gallop, jump, R, dismount; ~20 s),
  screenshots full/R/G in `test-results/horse/` (`mounted-*`, `gallop-*`).

## Changes outside `src/core/vehicles/` (small, all in core or tests)

- `src/core/index.ts`: one line, `vehicles.lateUpdate(dt)` after `player.update(dt)` (rider pose
  must run after the player's animation mixer).
- `src/core/vehicles/types.ts`: optional `rescueKeepsRider`, `beforePlayer()`, `lateUpdate()` on
  `VehicleInternal` (the buggy ignores them).
- `src/core/vehicles/index.ts`: creates the two horses after the buggy (**`vehicles.all[0]` is
  still the buggy**), R on a horse keeps the rider mounted, the E prompt waits for the model.
- `tests/e2e/vehicle.spec.ts`: counts cars instead of all vehicles (now 3).
- No change to `src/types.ts`, `src/main.ts`, `src/config.ts` or `package.json`.

## Requests for other owners

- **World (`src/world/areas.ts`)**: the ranch fences have no colliders, so horses (and players)
  pass through the rails; the jump still looks right, but solid rails (with the two existing
  gaps as gates) would make jumping them a real thing. Kept the paddock centre clear: the horses
  stand at ranch anchor + (−3.2, −3) and (+3.6, +2.8).
- **Activities (chests)**: the `horseColor` outfit slot exists in `types.ts`; chests only apply
  `carColor`. To support horse coats, call `setColor()` on vehicles with `kind === 'horse'` (and
  reset with `object.userData.defaultColor`).
- **UI**: nothing needed; the E prompt uses the existing `horse` icon. A controls-card row for
  "F neigh / C rear" while riding would be nice.
- **QA**: listen to the gallop loop and neigh in a real browser (tests run muted).

## How to test

```bash
npm run build
```

```bash
RG_PORT=4391 npx playwright test tests/e2e/horse.spec.ts
```

```bash
npx vitest run tests/core/horse-math.test.ts tests/core/bone-pose.test.ts
```

In the game: follow the horse signpost from the plaza to the ranch and press E next to a horse.
