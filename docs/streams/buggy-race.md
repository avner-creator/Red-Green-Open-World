# Stream N — buggy workshop and race (branch `agent/buggy-race`)

Two new attractions, each in its own folder and registered with one line in
`src/activities/index.ts`, plus small **additive** hooks in `src/core/vehicles/`.

## What was built

### Workshop (`src/activities/workshop/`) — site: `garage` anchor (34, 20)

- A spinning **turntable** (hazard-striped ring, lights, chevrons) on the garage forecourt where the
  buggy parks, and a red **tool cart** with a big wrench sign beside it (E prompt, `paint` icon).
- E at the cart → the buggy is towed onto the turntable (confetti poof if it was elsewhere), the hero
  hops into the seat, the turntable spins slowly and a fixed showroom camera frames it from the road
  side. A row of big picture cards (wordless; price chip with the gem icon; a tick when fitted; the
  key that fires it) plus **Drive** and **Exit** cards. Arrows/stick move, E/Space/A buy or toggle,
  R exits; mouse and touch click the cards.
- Seven upgrades (cheapest first, 4–20 gems): **musical horns** (F plays a do-mi-so-do toot),
  **rubber duck** on the roof (spring wobble from the body's acceleration, squeaks on bumps),
  **spring bumper** (a big coil + pad that squashes on bumps; ×1.8 comic bounce), **bubble pipes**
  (soap bubbles trail from the exhausts: one instanced fresnel mesh), **confetti cannon** (fires on
  every hop, Space), **monster wheels** (wheels ×1.36, body lifted to match, ×1.4 hop, grass as
  fast as road), **rocket boost** (skill key Q / LB / touch skill: +7 m/s for 1.2 s, kick, a bright
  plume; 3.2 s cooldown). Too poor → the card shakes and shows "+N gems needed"; nothing is charged.
- Bought items persist (localStorage `rg.buggyWorkshop.v1`, and `profile.unlock` when the economy
  exists); fitted items are re-applied at boot. Drive turns the buggy to face the road and seats you.

### Race (`src/activities/race/`) — site: start line at (29.5, 11.2) on the east road

- **Lap**: east road → loop road → south road → a grass cut back to the east road that stays off the
  plaza (benches, bins, spawn). ~230 m, 3 laps ≈ 60–75 s. Control points in `track.ts` (`LAP_POINTS`).
- **Start**: E at the striped race **booth** (north of the start line, `car` icon), or stop your
  buggy on the grid for 1.2 s. First race per session is free; then a 3-gem ticket; with too few
  gems it is a **practice run** (no prize) — nobody is locked out.
- Start/finish **gantry** with a chequered banner and three start **lamps** (light one by one by
  brightness, then all flash; a big 3-2-1 and chequered-flag pictogram on the HUD); the car is held
  on the grid (throttle revs the engine). Four striped **inflatable arches** (checkpoints, they
  wobble when passed) and **chevron boards** on the outside of the big corners — no mini-map.
- **Friends**: two other heroes (catalog characters, lazily loaded and cached) in their own buggies
  (same procedural model, navy and white paint). Waypoint AI (`ai.ts`) with rubber-banding against
  the player's recent pace: they settle a few metres *behind* a child who tries, pass a dawdler, and
  have one comic wobble per lap. Kinematic Rapier bodies, so bumping them is a real bouncy push;
  they hop and wiggle with a boing.
- **Glasses twist** (WeakOnly layer only, `glow.ts`): a flowing chevron **racing line** and five
  **boost pads**. A pad gives +5 m/s for 1.1 s; **three pads in a row** (consecutive pads within
  14 s) gives a **rocket surge** (+9 m/s for 2.4 s, `stunt` 'launch' +1 star). The HUD has a 3-dot
  chain meter that fills *after* a hit (it never shows where pads are). Nothing about the line or
  pads is in the main scene (tested).
- **Finish**: podium celebration (you and the friends on their steps by place, confetti, fanfare,
  orbiting camera), then a result card (medal with the place, stars 3/2/1, gem prize 8/5/3 via
  `profile.earn`/session wallet, replay E/A, exit R/Y). `stunt` 'bullseye' with the stars and a
  `ui:toast` (`car`, "1st/2nd/3rd") are the done signal. R/E out of the car mid-race leaves safely
  (friends poof away); the race also ends at 150 s or 25 s after both friends finish.
- **Prop-aware safe line** (`corridor.ts`): at boot (3 frames in) the lap is probed with physics rays
  (down rays for stalls/benches/rocks, along-lap rays for thin posts, 1 m × 0.25 m grid, ±6 m) and a
  smooth safe line is found by dynamic programming (≤ 0.45 m sideways per metre, ≥ 2 m from props).
  The weak-eye line, the pads, the friends' lanes and the arches all use it, so the race keeps
  working when other streams dress the roads. (On today's map it routes around the kiosk on the
  loop road at ~(64, 73) and a lamp/bench pair at ~(66, 60).)

## Hooks added to `src/core/vehicles/` (additive, no behaviour change when unused)

- `types.ts`: `BuggyTuning`, `STOCK_TUNING`, `BuggyHooks` (tuning, `boost(extra, seconds, kick)`,
  `boostLeft`, `hold`, callback slots `onHorn`/`onSkill`/`onHop`/`onBump`, `body`, `seat`, `driven`,
  `forwardSpeed`, `heading()`), `VehiclePublic.buggy?`, `VehiclesPublic.board(id)`.
- `car-sim.ts`: optional 4th arg to `update(dt, controls, env, mods?)` — `SimMods` (extra top speed,
  one-shot kick, hop/bounce multipliers, off-road-as-road). `NO_MODS` default = old behaviour.
- `car-model.ts`: `setWheelScale(s)` (visual wheel size; lifts body, hubs and A-arm mounts).
- `car.ts`: implements `buggy` hooks; F calls `onHorn` (default horn otherwise); the skill key while
  driving calls `onSkill`; `hold` keeps the car still on the grid; `park()` clears hold/boost.
- `index.ts`: `api.board(id)` seats a walking player in a vehicle (the race uses it).

No changes to `src/types.ts`, `src/main.ts`, `src/config.ts` or `package.json`.

## Requests for the main build

- Add `raceStart` to `AnchorName` / `ANCHORS` at **(29.5, 11.2), yaw ≈ π/2 (east), radius 6**, and
  keep props off the lap corridor where possible (the kiosk at ~(64, 73) sits on the loop road; a
  lamp and bench at ~(66–67, 60) are on the road edge). The race does not need it (the lap is data
  in `track.ts`), but the world should keep the grid, gantry (pillars at lateral ±5 m) and booth
  area (~(33, 2.6)) and podium (~(45, 2)) clear.
- When the economy stream (C) is merged: `ctx.profile` is used automatically (wallet, owns/unlock,
  earn 'mission', spend 'shop'/'ticket'). If `src/activities/gear/` lands, the seven upgrades can be
  registered as `ShopItem`s (`category: 'gear'`-like, ids `buggy-<id>`) — the workshop menu would
  keep working as the place to fit them.
- The Fun Pass / Pip (Carnival pass items 1–3) can listen to `stunt` ('bullseye' = race finished,
  value = place) and `ui:toast` (`car` icon) for "race done" stamps.

## Performance

- Idle: workshop 2 draws (turntable, cart); race 4 draws (gantry+booth, arches (instanced), chevrons
  (instanced), lamps (instanced)) + shadow proxies (gantry/booth, arches) on layer 7; ~8k
  triangles together (measured: 8.3k; podium +0.5k). The podium, friends, weak-eye line and pads exist only during a race.
- Each fitted buggy part is 1 draw, no shadow. Bubbles: 1 instanced draw, only while visible.
- Nothing updates when idle and > 140 m away (race) or > 90 m from the camera (parked parts).
- The boot-time corridor probe is ~30k raycasts once (tens of ms on the title screen).

## Tests

- Unit: `tests/activities/race.test.ts` (track, projection, racing line, pads, progress, rubber
  band: a 10 m/s child wins, 6 m/s loses, friends always finish, chain/surge, prizes/tickets) and
  `tests/activities/workshop.test.ts` (catalog, tuning, buy/fit/remove, stick stepping, safe line
  around a stall, friends steering clear of a post).
- E2E: `tests/e2e/buggy-race.spec.ts` — workshop open/too-poor/buy/fit/drive/horn/rocket boost; a
  full race round on autopilot (test-only, follows the safe line) to podium, result and exit; and
  the channel test (racing line + pads change only the weak channel for all 4 lens/eye combos, and
  are absent from the main scene). ~40 s.
- Screenshots (canvas full / R-only / G-only): `test-results/buggy-race/` — `workshop`,
  `race-start`, `race-racing`, `race-podium`.
- Test hooks: `window.__rgWorkshop` (open/select/press/close/give/fitted) and `window.__rgRace`
  (start/setLaps/autopilot/replay/exit/state/pads/gridView/lineInfo).

## Decisions

- Kid-safe economy: no ticket money → practice race, never a locked gate. Session wallet fallback
  (gems collected − spent here) until the profile exists.
- Rubber-banding is relative to the player's own recent pace (with a floor), so the friends stay in
  the race for every skill level but sit just behind a child who keeps driving.
- The safe line is computed from the real physics world instead of hand-placed waypoints, because
  roads are being dressed by other streams in parallel.
- No pointer re-capture after the menus in `?test=1` (headless lock changes paused tests at random);
  in the game the menus re-capture the mouse when they close.
