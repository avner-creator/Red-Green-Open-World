# Glasses weave: Phase 2 hook survey

Phase 2 of the red-green depth pass adds six small, optional, rewarded glasses layers on top of
attractions that already exist. Each part lives in its own folder here and is created by
`./index.ts` from the registry in `./parts.ts`. The contract is in `./types.ts`: `WeavePart` and
`WeaveEnv`. A part decides itself when it is active, and while inactive it attaches nothing and
returns early. Results go through `env.result(tier, hit[, kind])` and gems through `env.pay(n)`.

Line numbers are for branch `agent/glasses-depth` at `da704d6`. `8abd0a6`, which came after it,
changes only docs.

Rules for every part:
- Only additive hooks in other owners' folders. Each proposed diff below is the whole change.
  Nothing is renamed and no existing behaviour changes.
- Nothing may reveal a weak-eye object to the strong eye: no both-eye effect, no HUD marker and
  no positional sound at its position or at the moment it appears.
- Test hook: `window.__rgGlasses.weave.{ids, debug, force, reset, draws}` (`?test=1`).
- Give every new mechanic id a name in `KNOWN_NAMES` (`src/ui/glasses/summaryModel.ts:19`),
  so the grown-up summary shows "Perfect bounce" and not "Bounce". This is a Stream P file.

---

## 1. `bounce`: perfect-bounce ring on the giant trampoline (`timeIt`)

**What exists today**
- `src/activities/trampoline.ts`. Walking onto the mat (`update`, 405–418) calls `begin()`
  (387–403), which starts the shared Flight with owner `'trampoline'` (396). Each landing goes
  through `hooks.onArrive` (335–364). The next apex comes from
  `nextBounceApex(chainApex, sinceJump < 0.25)` (351; maths in `bounceLogic.ts:27–35`):
  - Jump held or pressed within 0.25 s before touchdown: ×1.5, up to 45 m (`constants.ts` `BOUNCE`, 15–36).
  - Otherwise: ×0.62, and the chain stops below 1.5 m.
  - `sinceJump` is reset in `hooks.steer` (324).
  - A ground-pound or super-bounce boosts the first bounce (`ctx.player.skill.bounceBoost`, 390).
  - So the only input that changes a bounce today is holding Jump near landing. The move keys do
    air tricks (`flight.ts:197–199`, `tricks.ts`), or walk on small bounces (`trampoline.ts:325–333`).
- Stunt: `boingFx` (307–320) emits `stunt { kind: 'bigBounce', value: apex, stars }` once per
  15/30/45 m threshold (`ThresholdAwards`, `bounceLogic.ts:52–68`), through the stunt gate (317).
- Public state the part can read without a hook:
  - `getFlight(ctx)` (`flight.ts:321`) gives `.active`, `.owner === 'trampoline'`, `.vy`, `.endY`
    and `.arcTime` (62–68), and `.height` (105).
  - `timeToLand(y, vy, endY)` is in `ballistics.ts:54`.
  - A landing shows as `vy` jumping from < 0 to > 0 in one frame: `setArc` at arrival, 136–150.
    During the dwell `vy` stays positive.
- Both-eye feedback already on the mat: shockwave rings (167–186), the landing blob under the hero
  (188–198, 434–455) and the height mast (200–226).

**Hook:** none. Public Flight state is enough.

**Must not break or duplicate**
- Jump-hold growth, and `tests/e2e/thrills.spec.ts:479` (held bounces reach ~45 m).
- `tests/e2e/skill-bounce.spec.ts:129`: jump presses during a flight are neither double jumps nor
  tricks.
- The `bounceHeight` mission (`economy/missions.ts:26`, fed by `rules.ts:111`).
- Never change an apex, and never call `flight.begin`.

**Recommended design**
- While `flight.owner === 'trampoline'` and the hero is falling with at least 0.6 s to touchdown,
  a weak-eye timing ring (`createTimingRing`, ground-facing, about 0.3 m above the mat) sits round
  the landing blob.
- The ring closes onto its target at a random moment, between 35 % and 75 % of the remaining fall.
  It is not the touchdown, because touchdown is visible to both eyes through the hero and the blob.
- Press Jump or Use once per fall. Hit: `grade` perfect or good (`timingWindow`). Miss: a press
  outside the window. No press means no result.
- Reward: 1 / 2 / 3 gems by tier, and a weak-eye star burst on the layer. Tier follows the window
  width. Three perfects in a row give +3.
- Detach everything when the flight ends or changes owner.
- Weak eye shut: the perfect moment is random and exists only on the layer, so it cannot be
  guessed from the fall.
- Test: `force({ fall: {...}, perfectAt })`, step to the window, inject `jumpPressed`, then expect
  a hit. An early press is a miss. Answer-blind check: with the weak layer hidden, frames for two
  `perfectAt` values match.

---

## 2. `chute`: parachute-open ring and gem-through-hoop in the skydive (`timeIt` / `lineUp`)

**What exists today**
- `src/activities/skydive/index.ts` (ExternalController, 312–467). Phases are `RidePhase`
  (35: `idle | board | ascent | top | freefall | canopy | landed`). The ride state is private
  closure state (107–128). The returned `Skydive.phase` (38–42, 507–510) only goes back to
  `register.ts`, so nothing outside can read it.
- Jump: auto after `SKY.autoJumpSeconds` or Space (361). `jump()` is at 230–250.
- Freefall (368–410): height above ground is a local `const agl` (380).
  `shouldOpenChute(agl, fallT, input.jumpPressed)` (408; `flight.ts:123–126`) opens the chute
  when Space is pressed after `SKY.chuteLockout = 0.6 s` (`flight.ts:23`), or automatically at
  `BALLOON.autoChuteHeight = 40` m (`src/config.ts:40`, top 180 m).
- `openChute()` (252–264) plays `'chute'` (non-positional). The prompt (`prompt.ts`, shown at 405)
  says "press jump", so the open moment is free choice today.
- Landing: `touchdown()` (266–288). It emits `stunt bullseye` (`ringStars`) and `longGlide`.
- Hoops: `rings.ts`. Three both-eye striped hoops at 27/18/9 m on a 16 m circle round
  `anchors.landingRings` (`HOOPS`, 14–24). Each has a weak-eye bonus gem in its centre (215–232).
  `checkHoops()` (`index.ts:290–302`) collects them by segment test (`rings.collect`, 295).
- Fall-line gems: 7 + 1 `'skydive'` gem spots from 170 m above the balloon down to 24 m above
  the rings (`src/world/spots.ts:84–96`). They are collected by the normal gem system
  (`gems.ts:261–275`). `trailDown` steers the hands-off assist between them
  (`skydive/index.ts:57–59`, 371–377).
- The ride costs a ticket (`ctx.economy.payTicket('balloon')`, 477). Pinned by
  `tests/e2e/skydive.spec.ts:21` (auto-jump, auto-chute, soft landing) and `:131` (R respawns).

**Hook needed:** `src/activities/skydive/index.ts`, a read-only view. Per-ctx WeakMap, the same
pattern as `getFlight`.
```diff
@@ after line 45 (const BELLY_PITCH = 1.3;)
+/** Read-only ride view for glasses add-ons (src/activities/glasses/weave/chute). */
+export interface SkydiveView { readonly phase: RidePhase; readonly heightAboveGround: number; readonly fallTime: number }
+const views = new WeakMap<GameContext, SkydiveView>();
+export const getSkydiveView = (ctx: GameContext): SkydiveView | null => views.get(ctx) ?? null;
@@ after line 122 (let fallT = 0;)
+  let agl = 0;
+  views.set(ctx, { get phase() { return ride; }, get heightAboveGround() { return agl; }, get fallTime() { return fallT; } });
@@ line 380
-          const agl = pos.y - surf.y;
+          agl = pos.y - surf.y;
@@ dispose(), line 519
+      views.delete(ctx);
```

**Must not break or duplicate**
- The hoop bonus gems in `rings.ts` (weak-eye gems in both-eye hoops, 9–27 m): the new hoop must
  be strong-eye and high in the freefall.
- The fall-line gems: keep the new hoop at least 8 m from every `'skydive'` spot.
- Auto-chute at 40 m, and the bullseye/longGlide stunts.
- The chute prompt (`prompt.ts`): do not hide or move it.
- `skydive.spec.ts` runs hands-off, so the part must stay passive without input.

**Recommended design**
- **Ring (timeIt).**
  - On entering `freefall`, pick a target height at random, 70–120 m above ground.
  - A weak-eye ground-facing timing ring round the hero closes as `heightAboveGround` nears that
    target.
  - The part sees `freefall → canopy` and reads the last height. Hit: the open was within ±8 m
    (tier 1), ±5 m (tier 2) or ±3 m (tier 3) of the target. Miss: a manual open outside ±8 m.
    An auto-open (≤ 40 m) gives no result.
  - Pay 2/3/5 gems.
  - Weak eye shut: the target height is random and only on the layer, so the open cannot be timed.
- **Hoop gem (lineUp, `env.result(t, hit, 'lineUp')`).**
  - One strong-eye hoop (`createRing`, StrongOnly, radius about 3 m) hangs between two trail gems
    at about 100–130 m.
  - A weak-eye gem slowly orbits through the hoop's plane and is inside the hoop about 40 % of
    the time.
  - Passing through the hoop while the gem is inside: hit, +3 gems. Passing through while it is
    outside: miss. Passing beside the hoop: no result.
  - Each eye alone lacks one half: the strong eye sees no gem, the weak eye sees no hoop.
- Test: `force({ target: 90 })`, teleport into freefall at 95 m, inject `jumpPressed`, then expect
  a hit. For the hoop, `force({ gemInside: true|false })` and fly a scripted segment through it.
  Mirror answer-blind check: with the strong layer hidden, two hoop positions give identical frames.

---

## 3. `hero`: skill-ready ring and combo number over the hero (`onHero`)

**What exists today**
- Skill: `ctx.player.skill` (`PlayerSkillView`, `src/types.ts:344–358`) has `id`, `ready`,
  `cooldown`, `active` and `bounceBoost`. `player:skill { id }` fires when a skill fires
  (`types.ts:187–188`).
- The HUD skill chip (`src/ui/skillButton.ts:16–45`, created in `src/ui/index.ts:21`) shows
  ready / cooldown / active with a ring (`--p`). The touch button shares it
  (`ui/touch/index.ts:14`).
- Combo: `ctx.economy.combo` (`types.ts:779–780`) gives `{ multiplier, streak, timeLeft }`.
  `combo:changed { multiplier, streak }` is emitted by `economy/rules.ts:83–85`.
  `gem:collected` carries `combo` and `gain` (`types.ts:166–167`). The window is
  `ECONOMY.comboWindow = 3` s and the cap ×5 (`src/config.ts:46–47`).
- The HUD combo badge with a shrinking ring is at `src/ui/hudEcon.ts:56–75`, updated at 169 and
  220–233.
- The hero is both-eye (`ctx.player.object`, `ctx.player.position`).

**Hook:** none. Public state and events are enough.

**Must not break or duplicate**
- The HUD chip and badge stay as they are. The weak-eye helpers add to them and never replace them.
- No sound when a "lucky" moment starts: a chime there would give the timing to the strong eye.
  A chime on success is fine.
- Skills are walk-mode only, so the part must be idle in vehicles and rides
  (`ctx.player.mode !== 'walk'`).

**Recommended design**
- Two weak-eye toolkit blocks follow the hero (2 draws):
  - a ground ring at the feet showing the skill cooldown as a progress arc (`createRing`), which
    pops when the skill is ready;
  - a glyph sprite `×N` over the head while the combo is at least ×2 (`createGlyphSprite`).
- Play: at random moments (every 20–40 s), one of them sparkles for a 1.5 s "lucky" window. The
  sparkle is on the layer only.
  - Ring sparkle: firing the skill in the window (`player:skill`) is a hit, +2 gems.
  - Combo sparkle (the number becomes ★): collecting a gem in the window (`gem:collected`) is a
    hit, +2 gems.
  - Firing or collecting within 3 s after a window closed is a miss. Otherwise no result.
- Tier follows the window length: 1.5 / 1.0 / 0.7 s.
- Weak eye shut: the windows are random and drawn only on the layer.
- Test: `force({ spark: 'skill' })`, then emit or inject a skill press for a hit; force a late press
  for a miss. Answer-blind check: two spark states give identical frames with the weak layer hidden.

---

## 4. `boost`: boost-pad timing on the buggy race (`timeIt`)

**What exists today**
- `src/activities/race/index.ts`:
  - Phases (25): `idle | countdown | racing | finishing | podium | result`. They are private
    (`phase`, 165). `Race.phase` (27–31) goes only to `register.ts`.
  - The pads come from `boostPadDistances(track, 5)` (75). The weak-eye glow
    (`createRaceGlow`, 120) is built lazily at the first race.
- `glow.ts`: the racing line (47–83) and five pads (85–114) are weak-eye only. The pads breathe
  (131–132) and `flashPad` pops them (124). `RaceGlow.pads` (11–13) holds the centres and
  directions.
- Pad hits (index.ts 406–430):
  - An along/across box test (`RACE.padHalf`, `race/config.ts:17`) counts once per lap per pad
    (`padLastLap`).
  - A hit does `padsHit++` (417) and `hooks.boost(+5 m/s, 1.1 s)` (418;
    `RACE.pad`, `config.ts:13`).
  - Three in a row give a surge `+9 m/s, 2.4 s` (`BoostChain`, 420–429), `stunt launch` and the
    HUD chain meter (`race/hud.ts:60,139`).
- The car: `ctx.vehicles.all.find(v => v.kind === 'car')` with `VehiclePublic.buggy`
  (`src/core/vehicles/types.ts:10–15`). Its `boost(extra, seconds, kick)` and `boostLeft`
  (39–41) are public.
- Test API `window.__rgRace` (33–60): `state().padsHit` and `pads()`. Documented in
  `docs/streams/buggy-race.md:43–47`, `:60–70` and `:109`.

**Hook needed:** `src/activities/race/index.ts`, a read-only view (per-ctx WeakMap).
```diff
@@ after line 25 (export type RacePhase = ...)
+/** Read-only race view for glasses add-ons (src/activities/glasses/weave/boost). */
+export interface RaceView { readonly phase: RacePhase; readonly pads: RaceGlow['pads']; readonly padsHit: number }
+const views = new WeakMap<GameContext, RaceView>();
+export const getRaceView = (ctx: GameContext): RaceView | null => views.get(ctx) ?? null;
@@ after line 180 (const chain = new BoostChain(...);)
+  views.set(ctx, { get phase() { return phase; }, get pads() { return glow?.pads ?? []; }, get padsHit() { return padsHit; } });
@@ in dispose()
+      views.delete(ctx);
```
The part sees `padsHit` go up and takes the nearest pad as the one hit, so it never repeats the
hit geometry.

**Must not break or duplicate**
- The weak-eye pads and racing line, the 3-in-a-row surge and the HUD chain meter.
- The rubber-banding balance: do not add speed by default.
- `tests/e2e/buggy-race.spec.ts:147` (autopilot race) and `:226` (pads and line weak-only for all
  4 combinations).

**Recommended design**
- While `phase === 'racing'`, the next pad ahead (within 40 m) gets a weak-eye beat ring
  (`createTimingRing`, ground-facing, on the pad, 1 draw). It pulses with a 1.4 s period and is
  bright only in a 0.35 s "hot" window.
- Driving onto the pad while it is hot (`padsHit` increments with the grade perfect or good) is a
  "turbo pad": hit, +1 / 2 / 3 gems by tier (tier = window width), plus a weak-eye flash. Hitting
  it while cold is a miss.
- Optional, with the race owner's OK: a small extra `car.buggy.boost(2, 0.6)` on a hit.
- Weak eye shut: the pads and the beat are both on the layer.
- Test: `__rgRace.autopilot`, `force({ phase: 0 | 0.5 })` so the autopilot arrives hot or cold,
  then expect a hit or a miss. Channel test as in `buggy-race.spec.ts:226`.

---

## 5. `fakes`: the real gem among fakes at a few gem spots (`tellApart`)

**What exists today**
- `src/activities/gems.ts`:
  - Normal spots are `ctx.world.gemSpots` (99). Ids are `gem<i>` for spot index `i`, and
    `mega<j>` after them (118).
  - Everything is drawn on the weak layer (146).
  - Pickup is a segment-vs-sphere test along the hero's movement (`GemField.collect`,
    `gemLogic.ts:76`; `gems.ts:261–275`, pickup radius 1.6 m, `src/config.ts:38`). It pays
    through `ctx.economy.recordPickup` and emits `gem:collected { id, position, value, mega,
    combo, gain }`.
  - Respawn after `ECONOMY.respawnSeconds = 45` s emits `gem:respawned { id }` (204–208, 277).
  - Mega gems are placed from attraction spots on the first playing frame (`initMegas`, 178–200;
    `economy/megaSpots.ts`).
- Spot tags (`src/world/spots.ts:46–128`): `plaza` (ground, 9 of the first 15), `rooftop`,
  `trampoline` (column), `skydive`, `bridge`, `ranch`, `lighthouse`, plus tags from `ground()`.
- Proximity: `gem:near` within 12 m. It drives a directionless HUD glow (`src/ui/hud.ts:90–94`),
  the `gemNear` chime (`src/audio/index.ts:240`) and Pip's sniff (`src/buddy/sniff.ts`). None of
  them gives a position.

**Hook:** none. Public `ctx.world.gemSpots` and the `gem:collected` / `gem:respawned` events
are enough.

**Must not break or duplicate**
- Every gem still collects exactly as today: the fakes never block or replace the real pickup.
- Mega gems: exclude `mega*` ids and their spots.
- `tests/e2e/economy-secrecy.spec.ts` (gem, halo, burst and pop-in are weak-channel only;
  `:125` answer-blind).
- The gem tally in the grown-up summary: `gem:collected` already counts as a hit there, so the
  part reports only its own tell-apart result.

**Recommended design**
- Pick 4 ground spots (`plaza` and other low `ground()` tags; no rooftop, column, sky, bridge or
  mega). Choose them with `env.rng`, at least 25 m apart.
- When the hero comes within 15 m of one whose gem is present, add 2 weak-eye fakes on a 1.6–2.4 m
  circle round the real gem (one InstancedMesh, 1 draw). The fakes have the same size and
  brightness but a subtle difference that gets finer with the tier: the spin goes the other way,
  then 5 facets instead of 6, then no sparkle line.
- Touching a fake (segment test, 1.2 m) before the real gem: the fake poofs on the layer, miss, and
  the round ends with no bonus. The real gem still pays normally.
- `gem:collected` for that spot while the fakes still stand: hit, +2 gems on top. The fakes poof.
- One round per spot per respawn cycle. Inactive (nothing attached) when no chosen spot is within
  15 m.
- Weak eye shut: real gem and fakes are all weak-eye only, so nothing can be told apart.
- Test: `force({ spot: i, answer: 0..2 })`, script walks into a fake or into the real gem, and
  check the hit or miss. Answer-blind check: with the weak layer hidden, two answers give
  identical frames.

---

## 6. `shack`: a dot-picture prize code at the Gear Shack (`popOut`)

**What exists today**
- `src/world/gear-shack.ts`. The model is in the static batch (`buildGearShack`, 179–425). The
  local frame has its origin at `ANCHORS.gearShack` (`src/world/layout.ts:54`: (14, 2),
  yaw `atan2(-14, -4)`), with +Z on the counter side.
  - Body: `SHACK` (24–31), `hx 1.86`, `zBack -1.18`, `zFront 1.12`, height 3.0. One collider box
    (419–420).
  - Back outside (196–205): board seams and a gem roundel at y 1.95.
  - Side walls (207–217): wainscot up to y 1.07 and a roundel at y 1.78.
  - Counter (218–225): wood top at y 1.04, z 0.74. Cans at x −1.3..−1.0, the glasses stand at x
    0.55 (298–304) and the bell at x 1.15 (294–297).
  - Hanging boards (341–383) at y 1.6, z 1.76.
  - The toy rocket leans on the left wall (385–418; `SHACK_ROCKET` x −2.05).
  - **Free space:** the outside of the right side wall (local +X, x ≈ 1.88), below its roundel:
    about 1.6 m wide (z −0.95..0.7) and y 0.25–1.2. The counter top has only small gaps.
- Live parts: `createGearShackLive` (427–494), the spinning gem and pinwheels.
- The kiosk (`src/activities/economy/kiosk.ts:20–31`) is an E prompt 1.2 m in front of the counter
  (radius 2.6). `onUse` emits `shop:open`. The UI (`src/ui/index.ts:192–196`) opens the shop
  (`src/ui/shop.ts`) and **pauses the session**, so weave `update` stops while it is open.
- Prizes:
  - `ctx.profile.earn(n, reason)` and `ctx.profile.unlock(itemId, 'shop' | 'chest' | 'starter')`
    (`src/types.ts:678–679`, 725–734). `unlock` with `'chest'` shows the big unlock moment
    (`src/ui/hudEcon.ts:190–198`).
  - The catalog is `ctx.economy.catalog` / `item(id)` (`types.ts:759–761`).

**Hook:** none.

**Must not break or duplicate**
- The shop prompt: keep every new interactable more than 3.5 m from the kiosk prompt position
  (`kioskPromptPosition`), so E at the counter still opens the shop.
- Pip's Gear Shack visit (`src/buddy/director.ts:371,406`) and the compass entry
  (`src/ui/compass.ts:25`).
- `tests/e2e/shop.spec.ts` and `economy.spec.ts`.
- Phase 1 `dotsigns`: reuse its round logic and button pictures (`../dotsigns/round.ts`,
  `../dotsigns/picto.ts` `shapeButtonCanvas`) and the toolkit's `createDotPicturePair`. Do not
  copy them.
- Nothing goes on the shack's own geometry. The part adds its own board.

**Recommended design**
- A dark grey both-eye board, 1.4 × 0.9 m, `DOT_BOARD_GREY`, sits on the outside of the right side
  wall. It carries a dot-picture pair (weak + strong, 2 draws).
- In front of it on the ground stand three both-eye gift boxes with shape tags (one merged mesh;
  E prompts through `ctx.interactions.add`).
- The hidden shape names the box with the prize. Right box: it pops open, and once per session
  the prize is the cheapest unowned catalog item, given with `profile.unlock(id, 'chest')`. Later
  wins pay 3 / 5 / 8 gems.
- Wrong box: wobble, an 8 s nap, and a new picture. 1 gem until two wins in a row (the Phase 1
  anti-guess rule).
- Active only within 25 m.
- Weak eye shut: each eye alone sees noise; the shape exists only between the two eyes.
- Test: `force({ answer })`, press the right or a wrong box, expect hit or miss and an unlock or
  gems. Answer-blind check in both directions, as in `glasses-botheyes.spec.ts`.

---

## Results from existing glasses twists

These attractions on this branch already have weak-eye-only (W) or strong-eye-only (S) play. None
of them emits `glasses:result` yet: a search outside `src/activities/glasses` and `src/vision`
finds no emit. The table lists, for each, where a hit or a miss is decided, which means where a
single line would go:
`ctx.events.emit('glasses:result', { mechanic, kind, tier, hit })`. **None of these lines has
been added.**

| Attraction | Layer | Hit decided at | Miss decided at | `mechanic` / `kind` / tier |
|---|---|---|---|---|
| Carnival balloon pop: prize balloons | W | `carnival/games/balloonPop.ts:175` `if (s.prize)` (add `shot.data.who === 0`) | none (no clean miss) | `balloonPrize` / `find` / 1 |
| Carnival ring toss: star peg | W | `carnival/games/ringToss.ts:147` `if (bonus)` (145 already checks `who === 0`) | none | `ringStar` / `find` / 1 |
| Carnival strength bell: sweet spot | W | `carnival/games/strengthBell.ts:426`: after `stompPower`, `Math.abs(needleU - sweet) <= PERFECT` (`bellLogic.ts:17`) | same line, else branch | `bellSweet` / `timeIt` / 2 |
| Carnival duck pond: lucky ducks | W | `carnival/games/duckPond.ts:230` `if (d.lucky && who === 0)` | none | `luckyDuck` / `find` / 1 |
| Carnival glow dodge: glowing balls | W | `carnival/games/glowDodge.ts:313` `if (!bonk)` with `who === 0` | `glowDodge.ts:318` `if (who === 0)` (bonk) | `glowDodge` / `follow` / 2 |
| Buggy race: boost pads | W | `race/index.ts:417` `padsHit++` (tier 1); surge at `:422` `if (n >= 3)` (tier 2) | none (a missed pad is silent) | `racePad` / `find` / 1–2 |
| Buggy race: racing line | W | guidance only, no decision | – | – |
| Sky rides contest: bonus hoops | W | `skyrides/contestScene.ts:399` `got.push('bonusHoop')` | none | `skyBonusHoop` / `lineUp` / 2 |
| Sky rides contest: golden clouds | W | `skyrides/contestScene.ts:418` `got.push('golden')` | none | `skyGolden` / `find` / 1 |
| Sky rides dragon: treasure trail | W | `skyrides/dragon.ts:361` `taken[i] = true` | none | `dragonTreasure` / `follow` / 1 |
| Sky rides dragon: golden clouds | W | `skyrides/dragon.ts:308` `popGolden` | none | `dragonGolden` / `find` / 1 |
| Skydive: hoop bonus gems | W | `skydive/index.ts:295` `rings.collect(i)` | none | `skydiveHoopGem` / `lineUp` / 2 |
| Foam lava: shortcut tiles, safe stones | W (solid) | `foamlava/index.ts:311` `case 'land'` with `ev.kind === 'tile'` (tier 2) or `'stone'` (tier 1), first landing per solid per run | none (a splash is not a weak-eye miss) | `foamSecret` / `find` / 1–2 |
| Scoops: secret topping | W | `scoops/index.ts:357` `case 'jarRight'` | `scoops/index.ts:364` `case 'jarWrong'` | `scoopsSecret` / `read` / 1 |
| Bubble ball: bonus rings | W | `bubbleball/index.ts:257` `case 'charge'` with `e.team === 'home'` | optional: `case 'ringPop'` (expired, `soccer.ts:518–522`; no index case yet) | `bubbleRing` / `follow` / 2 |
| Dino sumo: weak water balloons | W | `dinosumo/index.ts:264` `if (e.dino === 0)` with `e.weak` | none | `sumoBalloon` / `find` / 1 |
| Dino sumo: beat ring | W | `dinosumo/index.ts:271` `case 'perfect'` | none (not every swing is an attempt; see `sumo.ts:369`) | `sumoBeat` / `timeIt` / 2 |
| Secret paths | W (solid) | `secrets/index.ts:245` `claimPedestal` | none | `secretPath` / `follow` / 2 |
| Weak-eye arrows | W | guidance only | – | – |
| Two-eye vault doors | W + S | `secrets/index.ts:417` `'correct'` (tier 1); `:424` `'opened'` (tier 3) | `secrets/index.ts:420` `'wrong'` | `vaultDoor` / `lineUp` / 1–3 |
| Chest keys | W | already counted: `chest:key` (`chests/index.ts:418`) feeds the tally | – | (no new line) |
| Chest symbol locks | W key + S answer | `chests/index.ts:302` `'opened'` | `chests/index.ts:305` `'wrong-symbol'` | `chestLock` / `lineUp` / 2 |
| Glow Gems, mega gems | W | already counted: `gem:collected` feeds the tally | – | (no new line) |

Notes:
- `chest:opened` is already a hit in the tally (`chests` row). Adding `chestLock` would count an
  opening twice in the summary, once under each id. Either way is fine, but decide on purpose.
- For rows without a miss, the Auto challenge only gets easier through its 40 s no-hit rule
  (`docs/streams/glasses-depth.md`, compositor section). That is acceptable for "find" twists.
