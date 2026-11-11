# Foam lava + sky rides: play-through, fixes and fun pass (branch `agent/foam-sky`)

Owner of `src/activities/foamlava/` and `src/activities/skyrides/`. Played with real key events
(`scripts/foamsky/foamkid.mjs`, `skykid.mjs`: Playwright, `?test=1&freeze=1&quality=low`, time
stepped with `__rg.step`, a screenshot every 1–2 s of game time, every one looked at). Walk-into
probes from 8 directions (`probe8` in `scripts/foamsky/lib.mjs`). Render cost during the rides:
`scripts/foamsky/perf-rides.mjs`.

## What the play-through found (before) and what was fixed

| Ride | Bug (before) | Fix | Test that failed first |
|---|---|---|---|
| Foam | Booth, arch pillars, blowers, bubble machine, rope posts, flag poles and pit rim walk-through | `PROPS` + `RIM_WALLS` in `layout.ts`: Rapier colliders and solid in the run sim | `foamlavaBugs.test.ts` (sim, 8 dirs), e2e raycast 8 dirs |
| Foam | Mid-run you could run/jump off a float over the rim onto the hill (12 m out) | `confine()` keeps a run between the rim lines | `foamlavaBugs.test.ts` |
| Foam | Blower walkway: a kid holding forward fell in 18 times in a row (could not finish) | Puffs knock you back along the walkway with a comic flip; a jump dodges them; jump button pulses | `foamlavaBugs.test.ts` |
| Foam | Hero passes through the friend | `sim.bumpFriend`: solid, comic boing + friend wobble | `foamlavaBugs.test.ts` |
| Foam | 1 m-deep gap between start and finish decks traps you (needed a jump) | Middle deck | `foamlavaBugs.test.ts` |
| Foam | Float 3 → bin step 0.38 m when the float tips: slips | Bins 0.1 m lower, bin 0 closer | `foamlava.test.ts` (bot, 2 laps, 0 falls) |
| Foam | Friend model attached inside a promise callback | Attached on the next pose/idle | `foamlavaBugs.test.ts` |
| Plane | Parked plane walk-through | Two static boxes while parked, removed while flying | e2e raycast 8 dirs |
| Plane | Smoke puffs up to 3 m wide hid your own plane | `TRAIL` small puffs, shrink away within 4–10 m of the camera | `skyridesBugs.test.ts` |
| Plane | Friends' models attached inside a promise callback | Attached on the next pose | `skyridesBugs.test.ts` |
| Dragon | Flap-mashing climbed to 100 m: 0 treasure, 0 clouds, nothing to do | `leashControls`: ≤ 10 m above / 18 m beside the route | `skyridesBugs.test.ts`, e2e |
| Dragon | Practice ride (no gems) still paid gems for treasure | `RideTickets.payPrize` pays nothing in practice | `skyridesBugs.test.ts`, e2e |
| All | Result card ≠ wallet change (plane +6 vs wallet +12) | `PrizeTally`: card shows every wallet gain of the round, updates live | `prizeTally.test.ts`, foam + sky e2e |
| Plane, dragon | No `stamp:earned`, no dragon result card | Emitted at the podium; dragon podium | sky e2e |
| Plane, dragon | Pip left on the runway / roost | `pip-seat` objects; seat published on `player.object.userData.pipSeat` (buddy diff below) | `skyridesBugs.test.ts` |

## Fun pass

- **Walk-in start (all three):** a ring on the ground (dark + white rim); stand on it and it fills
  with three rising ticks, then the ride's 3-2-1 starts. E / gamepad X / touch use still starts at
  once. After a ride you must step off once before it arms again.
- **Foam lava:** two laps; a big bubble ("bubble express") floats you from the finish deck back to
  the start. Each run two floats become turntables (which ones change every run). Blower puffs are
  a foam battle: knock-back + flip + spray, jump to dodge (the device's jump pictogram sits at the
  bottom and pulses at "jump now" moments). The friend is solid and rubber-banded (hurries when you
  lead, dawdles when you trail). Lap counter, medals 42/58/80 s. Practice runs show a crossed-out gem.
- **Plane:** 66 s contest (round ≈ 80 s), small trail, practice chip, podium = wallet.
- **Dragon:** a pink friend dragon races you round the island for cloud-balloons (18, bigger);
  one button: Space flaps, bubbles blow by themselves at a cloud ahead (both-eye clouds only, so
  they never point at a golden one). Weak-eye treasure (1) and golden clouds (3) add points. 60 s
  flight (round ≈ 65 s), podium, prize by place.

## Measured (kid scripts, Low, real keys)

| Ride | Round | Result |
|---|---|---|
| Foam lava | 51 s run (+3 s countdown, card) | 3 falls, silver, beat the friend; card +4 = wallet +4 |
| Plane | 78 s board→podium | 56 vs 33 / 26, 3 stars; card +17 = wallet +17 |
| Dragon (steering kid) | 56 s feed→dismount | 12 vs 8, 1st; card +7 = wallet +7 |
| Dragon (hands off) | 51 s | 9 vs 10, 2nd |

Render cost during the rides (main pass, `perf-rides.mjs`): Low foam run 80/168k, at the blowers
120/279k, plane race 71/138k, dragon tour 124/276k; Medium 124/253k, 203/480k, 99/168k, 180/390k.
`perf-report.mjs` views: Low foam 89/198k, airstrip 92/152k, lighthouse 71/114k, spawn 130/249k
(unchanged); Medium 136/325k, 164/342k, 105/172k, 197/426k.

## Pip's spoken how-to (one true sentence each)

- **Foam lava:** "Stand on the ring, then hop over the wobbly floats, swing on the rope, slide down,
  jump over the foam puffs and race your friend for two laps!"
- **Stunt plane:** "Stand on the ring by the plane, fly through the striped hoops, pop the clouds,
  press jump to drop water balloons on the targets and beat your two friends!"
- **Dragon:** "Give the dragon a treat, tap jump to flap, and pop more cloud balloons than the pink
  dragon on the way round the island!"

## Wanted diffs (other owners)

1. **Pip in the back seat** (`src/buddy/index.ts`, `updateRide`, before `ride = classifyRide(...)`):
   ```ts
   const seat = p.mode === 'external' ? (p.object.userData.pipSeat as THREE.Object3D | undefined) : undefined;
   if (seat) {
     seat.updateWorldMatrix(true, false);
     pos.setFromMatrixPosition(seat.matrixWorld);
     const e = seat.matrixWorld.elements;
     yaw = Math.atan2(e[8], e[10]);
     inp.pose = 'sit';
     inp.wind = 0.6;
     inp.speed = 0;
     inp.hop = 0;
     inp.goggles = true;
     vel = { x: 0, z: 0 };
     attached = true;
     ride = 'vehicle';
     return true;
   }
   ```
   (The sky rides set and clear `player.object.userData.pipSeat` in `SkyPilot.take/finish`.)
2. **Stamps on completion** (`src/ui/funPassLogic.ts`): add `'airstrip', 'dragonRoost'` to
   `EXPLICIT_STAMPS` (both now emit `stamp:earned` at the podium; today the ticket also derives it).
3. **Pip's how-to lines** (`src/buddy/script.ts`): replace the three `howTo` texts with the
   sentences above (new voice clips needed).
