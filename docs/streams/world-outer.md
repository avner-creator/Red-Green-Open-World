# Stream G — outer island art pass (branch `agent/world-outer`)

Status: **done, ready to merge.** Branched from `main` at `0bd44a5` (still the latest `main` at the
end of the stream). `npm run verify` is green: 339 unit tests and 75 e2e tests.

All code is in `src/world/` (new folder `src/world/outer/`), plus `tests/world/` and a screenshot
script. No changes to `src/types.ts`, `src/main.ts`, `src/config.ts`, `package.json` or other
owners' folders. No downloaded assets: everything is procedural.

## What was built

Each area has its own module in `src/world/outer/`:

- **Ranch** (`ranch.ts`)
  - The barn's sliding doors are open on an iron track, and you can walk in through the doorway.
    Inside: straw floor, stalls, hay bales and lanterns. The walls have board-and-batten detail,
    and there is a horse badge and a loft pulley. The gambrel roof is unchanged, so the gem above
    the ridge still fits.
  - The paddock ground has a trampled middle. A sand riding track runs round the inside of the
    fence, with hoof marks.
  - Two striped show-jumps sit at the ends of the south straight. A five-bar farm gate (1.0 m) on
    the west side leads to the barn. Horses clear 1.6 m; players can hop it.
  - The loop is marked by pennants on the fence and tall corner flags.
  - The west road enters through the north-east corner, which is now open. A ranch arch with
    lanterns stands over the road there. The old fence crossed the road; the beach path now leaves
    through a gap in the north fence.
  - Also: a silo with a ladder, a water-pump windmill (its wheel turns), troughs, a saddle rack, a
    climbable bale stack, a wheelbarrow and lamps.
- **Canyon bridge** (`canyon.ts`). The bridge moved here from `areas.ts` with the same deck, rails
  and platform size.
  - Added: girder plates, kerb boards, X-bracing, rib footings, and flag masts on the abutment
    piers.
  - The jump platform has railings with mesh panels, diagonal struts, striped gantry posts with
    flags and a jump-spot ring. **Its west end stays open** (the bungee springboard attaches there).
  - Sandstone strata are painted on both canyon walls: light and dark bands, so they read by
    brightness.
  - A waterfall cascades down the north wall from a boulder spring on the rim into a plunge pool.
  - A river winds along the canyon floor, past the bungee landing, into the bay. It has sandy and
    pebble banks, reeds, stepping stones where it meets the bay, and marker flags on the landing
    shore.
  - The river has no collider. It stays 5 m or more from the landing centre (unit test).
- **Silly Zone surroundings** (`silly.ts`), outside the anchor radius only:
  - Ground: a yellow rim, a plum/cream checkerboard band and a pink zig-zag edge.
  - A wobbly candy-striped picket fence (left open where roads pass) with pinwheels.
  - An inflatable welcome arch with a googly face and bunting over the end of the south road.
  - Four crooked "every-which-way" signposts and three giant inflatable rubber ducks.
- **Lake and beach** (`lake.ts`)
  - A timber pier with a T-head: rope rail, ladder, lamp and life ring. Three rowing boats are
    moored at it.
  - On the beach: a lifeguard tower with a ramp, four striped umbrellas with text-free towels,
    sun loungers, two sandcastles, an upturned boat and palms.
  - Reeds along the east shore. A bobbing ring of swim buoys sits round the floating platform at
    10 m, and a buoy line runs off the pier.
- **Lighthouse** (`lighthouse.ts`). You can now walk to the top.
  - Stone steps lead up to the plinth by the door. A railed spiral walkway (3 turns, about 14°)
    winds round the tower. Near the top it swings out past the gallery's edge (headroom tested) to
    a landing beside a gap in the gallery rail.
  - The lantern's light beams turn, faint by day and strong at sunset. They fade out when the
    camera is near the lamp.
  - Also: a gravel apron, windows, the keeper's hut with a picket garden, benches, a coin
    telescope, lamps, rocks and pebbles.
  - The weak-eye stepping-stone spiral (stream F) circles at r 4.9: the plinth (r 3.75) and the
    walkway (outer edge ≤ 3.95) stay inside it.
- **Roads** (`layout.ts`, `roads.ts`, `outer/paths.ts`)
  - `west`, `south` and `ridge` now get the core kerb, lamp and verge treatment (`kerb: true`).
    The new `landmarks: false` flag skips the extra landmark trees on those three roads.
  - The `north` (lighthouse) and `beach` paths get lamps, timber edging posts and verge shrubs.
  - Chevrons are painted on all four outer routes.
- **Wayfinding** (`wayfinding.ts`, `pictograms.ts`)
  - Five new icons: horse, bungee, silly face, sailboat and lighthouse.
  - Seven new how-to panels: three for the horse, two for the bungee, two for the Silly Zone.
  - The atlas grows to 2048 × 3072. `ATLAS_H` is exported, and `decals.ts` uses it for the
    texel inset.
  - The ranch, bridge and Silly Zone get how-to boards and beacons; the lake and lighthouse get
    beacons only.
  - All five are on the plaza fingerpost, which now has 11 arms in 4 rows.
  - New junction fingerposts: the north end of the village street, the bridge's far end, the
    ranch approach, and the Silly Zone added to the post at the south road's end.
  - Beacon balloons use a lighter sphere (20×14).
- **Moving parts** (`outer/live.ts`, about 6 draws): animated water (flowing foam streaks) for the
  waterfall, river and pool, the lighthouse beam, the windmill wheel and the buoys.

## Performance (Medium, 960×540, whole frame including shadows)

Each outer area has its own `Batcher` (`OuterAreas.batchers`). Its ground paint and small parts are
culled with the area. Otherwise they would land in island-wide buckets that are drawn from
everywhere.

| View | Draws | Tris (main → this branch) |
|---|---|---|
| spawn | 212 | 534k → 566k |
| ranch (arch) | 171 | 494k → 540k |
| bridge / platform | 145 / 176 | 292k → 393k / 308k → 413k |
| canyon / landing / waterfall | 139 / 138 / 148 | 365k → 425k / 257k → 344k / 209k → 353k |
| silly / silly-side | 159 / 184 | 436k → 491k / 504k → 571k |
| beach / lake | 126 / 145 | 284k → 326k / 307k → 375k |
| lighthouse / top gallery | 138 / 222 | 184k → 248k / 406k → 511k |
| road west | 196 | 498k → 551k |

- Every view stays at or under 223 draws, within the budget of about 230.
- On triangles, this branch adds 30–110k per view. Views that were already near or over 500k on
  `main` end up over it: spawn, ranch, silly-side, road west and the gallery. That baseline is
  terrain and grass, which `agent/world-budget` is reducing.
- If that branch's batcher does its own per-cell culling, `area()` in `outer/index.ts` can return
  the shared kit again (a one-line change).

## Tests

- `tests/world/outer.test.ts` (7 tests):
  - No collider inside any activity anchor's clear radius. The exception is the old paddock fence
    lines at the ranch.
  - Nothing solid on a road, except the bridge and the lighthouse path's end at the plinth.
  - Everything stands on land, except the pier, its boats and the river-mouth stepping stones.
  - Scatter trees stay outside anchor radii.
  - Lighthouse walkway: it climbs monotonically at under 20°, ends at deck height and stays
    outside the tower. It stays inside the stone spiral, keeps 2.2 m headroom between turns and
    swings clear of the gallery underside.
  - The river avoids the bungee landing and drains to the bay.
  - The bungee platform's west end is free.
- Unchanged tests still pass: `spots-colliders.test.ts` (gems and chests ≥ 0.8 m from every
  collider) and `wayfinding.test.ts` (arms within 5°, boards and beacons off roads and anchors).
  The atlas-bounds check now uses `ATLAS_H`.
- Combined check, run in a scratch merge that was not pushed: this branch plus
  `agent/core-horse`, `agent/activities-bungee-silly` and `agent/activities-secrets`. Their e2e
  specs all pass (horse 6, bungee 4, Silly Zone 4, secrets 7).
  - The only conflict was `src/activities/index.ts` between the bungee and secrets branches: both
    sides add lines, keep both.

## Screenshots

Run `npm run build && RG_PORT=4393 node scripts/shots-world-outer.mjs`:

- Views: spawn, the fingerpost from both sides, ranch, barn, bridge, platform, canyon, landing,
  waterfall, silly, silly-side, beach, lake, lighthouse, the lighthouse top and road west.
- Each is saved full, R-only and G-only, at the start and at sunset, to `test-results/world-outer/`.
- Options: `--start` / `--sunset` and view names to limit the run, `--quality=low|medium|high`.
- It prints draws and triangles per view.
- Everything reads by brightness in R-only and G-only.

## Notes for other owners

- **Horse (D)**: the ranch's NE corner is open (the road comes in there), so a gallop from the
  idle spot heads out under the arch. The two show-jumps (0.95 m rails) are at the ends of the
  south straight, and the 1.0 m farm gate is on the west side. Fences and jumps have colliders.
- **Bungee (E)**: the platform's size and position are unchanged and its west end is open. The
  river under the swing box is visual only (no collider); its surface is about 0.12 m above the
  floor. The landing shore keeps 5 m clear round `bungeeLanding`.
- **Silly Zone (E)**: the play disc inside the radius is unchanged; only the surroundings are new.
- **Secrets (F)**: the lighthouse plinth and walkway stay inside r 4.1. The pier is on the west
  side of the bay, away from the lake stone line.
- **UI compass**: the five new icons exist as `IconId`s in `src/world/pictograms.ts` if the UI
  wants the same pictures.
