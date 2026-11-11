# Booth kit — make a glasses mini-game read as a game

Goal: a non-reading 8-year-old who walks up to any glasses mini-game knows within 5 seconds that
it is a game, how to start it and what to do. The kit gives every mini-game the same pieces:

| Piece | What the child sees | Where it lives |
|---|---|---|
| Marquee | tall candy-striped poles, a big picture board, a dark banner with marquee bulbs and scallops, the **magic-glasses mark** on a mast, pennant strings, a striped counter | `geometry.ts` |
| Picture board | a looping **demo flipbook**: a chunky little hero doing the action (4–6 frames, ~2.5 fps) | your `demo`, `atlas.ts` |
| Lamp row | one lamp per try: off / ✓ bright (hit) / ✗ dim (miss) / chasing (celebration, attract twinkle) | `booth.ts` |
| Start pad | glowing, pulsing disc on the ground; walk-in pads show footprints, press pads show a ring plus a floating **button pictogram for the device in use** (key cap E, gamepad X, tapping hand) | `geometry.ts`, `booth.ts` |
| Prompt | ONE bobbing pictogram at a time (step on the pad, run through an arch, press, look, back to the pad …) | `booth.ts` |
| Round | idle (attract) → 3-2-1-GO → N tries → celebration → prize → cool-down → idle | `round.ts`, `kit.ts` |
| Feedback | ✓ / ✗ pops, confetti, countdown digits, a star burst, prize gems flying to the hero, sounds with a rising pitch on a streak | `fx.ts`, `kit.ts` |

Everything static of a booth **and** the changing quads (demo, lamps, pad, device, prompt) are
ONE mesh with ONE shared material: **one draw call, the same as the old pictogram board.**

## Adopting the kit, step by step (gates is the worked example: `../gates/`)

1. **Registry**: in `../mechanics.ts` add `booth: true` to your entry. The framework then builds
   no pictogram board for your site (your booth replaces it; `env.board()` becomes a no-op).
2. **Constants** (`<game>/constants.ts`): a `BoothSpec` and `RoundRules`.
   ```ts
   export const GATE_RULES: RoundRules = { tries: 3, minHits: 2, prize: GATE_PRIZE, between: 'pad', beat: 0.9 };
   export const GATE_BOOTH: BoothSpec = {
     marquee: { x: -5.0, z: -0.2, yaw: 0.6 },     // front-centre of the marquee, frame-local
     lamps: 3,                                     // = tries
     pad: { x: 0, z: 2, r: 0.95, walkIn: true },  // walk-in: stepping on starts; Use always works
     prompt: { x: 0, y: 2.2, z: 0.55 },            // idle "step on the pad" prompt (default: above the pad)
     playPrompt: 'arch',                           // shown during a try, in front of the booth board
     countdown: { x: 0, y: 2.2, z: 0.7 },          // where 3-2-1-GO pops (default: in front of the board)
     decals: [{ kind: 'chevron', x: -1, z: 0.5, size: 1, yaw: 0.66 }],   // ground arrows / footprints
   };
   ```
   Frame-local metres: +Z towards the approach, +X to the child's right. `y` values in the spec
   are relative to the **site's** y — add your ground height (gates lifts them by the pad's
   ground, see `lift` in `gates/index.ts`). Keep the marquee, pad and decals inside your site
   circle and add the marquee's corners to your `LayoutSpec.footprint` and its lamps to
   `targets` (gates does both) so the layout search keeps them clear and in view.
3. **Demo** (`<game>/demo.ts`): a `BoothDemo` — `frames` (≤ 6), `fps`, `hold`, and
   `draw(c, frame, size, kit)`. Start with `kit.units(c, size)` (then draw in 0..100), use
   `kit.panel(c)` for the background and the kit's helpers: `hero(c, x, feetY, scale, pose, dir)`
   with poses `stand | runA | runB | jump | press | look | cheer`, `arrow`, `gem`, `mark`,
   `sparkle`, `star`, `check`, `cross`, `arch`, `button`, `hand`, `footprints`, plus `line`,
   `disc`, `ring`, `poly`, `roundRect`, and `kit.colors` (INK, WHITE, YEL, GREY, DARK). White,
   yellow and near-black only, so it reads in R-only and G-only. The demo is drawn once at boot:
   it is generic by construction and can never show the current answer.
4. **Create the kit** in `create(env)` after your own meshes exist:
   ```ts
   const kit = env.booth({
     frame: { x: lay.x, z: lay.z, yaw: lay.yaw },   // your layout frame (default: the site)
     ground,                                        // (x, z) → ground height − site.y (default: terrain)
     spec: boothSpec, demo: GATES_DEMO, rules: GATE_RULES,
     hooks: {
       onTry(i, tier) { /* new question: answer, symbols, layer objects visible */ },
       onIdle() { /* hide the question; idle look */ },
       onResult(i, hit) { /* optional */ },
     },
     waitPromptAt: () => ({ x, y, z }),   // optional: where "back to the pad" floats ('pad' rules)
   });
   ```
5. **Forward the lifecycle**: `update(dt) → kit.update(dt)`, `setActive(on) → kit.setActive(on)`,
   `reset() → kit.reset()`, `dispose() → kit.dispose()`.
6. **Report each try once**: `kit.report(hit, at)` — `at` is a frame-local point for the ✓ / ✗ pop
   (e.g. above the arch or button the child chose; default above the pad). The kit lights the
   lamp, pops ✓/✗, plays the sound, throws confetti on a hit, and emits `glasses:result` with the
   round's tier (`env.result`). **Do not** call `env.result` or `env.pay` yourself any more.
7. **Accept answers only while** `kit.phase() === 'play'` (and your own "question open" state).
   Use `kit.tier()` for the round's tier presets (`withChallenge(tier, env.challenge())`).
8. **Remove** your old naps, "1 gem until two in a row" guard and per-hit payments: the prize
   table does the anti-guessing now.
9. **Test hooks** in `force(params)`: `play: true` → `kit.forcePlay(tier)` (straight into try 0),
   `start: true` → `kit.start()`, `pin: t` → `kit.pin(t)` (freezes the booth's animation clocks
   for proofs). Put `kit.debug()` into your `debug()` as `kit`.
10. **Tests**: copy the gates blocks in `tests/e2e/glasses-botheyes.spec.ts` (30 m view with the
    R/G contrast check on `boardRect`, attract, pad → countdown, channels for 4 combos,
    answer-blind both ways, a round through real input with a hit and a miss, lamps, celebration,
    prize in the wallet, cancel by leaving). Unit-test your prize table with `simulate()` like
    `tests/activities/glasses-booth-round.test.ts`.

## Round rules and prizes

- `tries`, `minHits` (no prize below), `prize[tier][hits]`, `between: 'next' | 'pad'`.
- Timings (defaults in `ROUND_DEFAULTS`): countdown 0.75 s per digit + 0.55 s GO, beat 1.0 s after
  each result, celebration 2.0 s, prize flight 1.3 s, cool-down 1.4 s, stall cancel 45 s,
  leave radius 15 m.
- Tier per round: up after `upAt` hits (default all), down below `downBelow` (default `minHits`).
- A miss only lights a dim ✗ lamp; the round moves on after the beat.
- Cancel (leaving > 15 m, respawn, far-idle, session end, stall): no results for tries never
  played; during the celebration / prize flight the prize is paid at once.
- **Bot rule**: a random-guess bot ≤ 6 gems / min at every tier, a child who sees the answer
  ≥ 25 gems / min at tier 1 (`simulate(rules, player)` against the real machine). `PICK3_PRIZE`
  (5 tries, prize from 3) is the template for the pick-one-of-three games: bot 4.1 / min
  (5.4 at a fixed tier 3), perfect 27.5 / min at tier 1. Gates (3 runs, prize from 2): bot 4.9,
  perfect 30 at tier 1, 44.6 climbing the tiers. Re-tune with your own `tryTime`.

## Atlas (`cells.ts`): one 2048² atlas for all six booths, 8 × 8 cells of 256 px

| Cells | Content |
|---|---|
| 0–35 | demo flipbooks: 6 frames per site slot (slot = the site's index in `FIXED_SITES`) |
| 36 | magic-glasses mark · 37 candy stripes · 38 swatches (4 × 4) · 39 pad face (press) |
| 40–43 | the banner strip (1024 × 256) |
| 44 | pad face (walk-in) · 45 lamps (off, hit, miss, chase) · 46 devices (E, X, tap, footprints) · 47 ground chevron |
| 48–55 | 3, 2, 1, GO, ✓, ✗, gem, star burst |
| 56–63 | prompts: arch, press, look, backToPad, stepPad, catch, follow, aim |

A second atlas (not the old 1024² board atlas in `../pictos.ts`) because that one is full and the
booths need ~28 kit cells plus 36 demo frames. The old atlas stays until the last board is gone.
Need a new prompt? Replace one you do not use or ask for a cell; never draw outside your demo slot.

## The draw-call rule

- The booth is **one** mesh. Changing quads are rewritten (UVs, vertex colours, positions) only
  while the site is active (within 40 m), and the flipbook only when its frame changes.
- Countdown digits, ✓/✗ pops, gems and confetti are 2 transient meshes that exist only during a
  round at that site (added at the round's start, removed when idle and the fx are done).
- Your own meshes: keep them merged (gates: arches + sign = 1 draw, halves 2). Budget ≤ 6 during a
  round (`expectDrawBudget`), idle = booth 1 + your idle objects.
- At spawn and the Gear Shack the six games together draw 5 calls (pinned in
  `tests/e2e/glasses-framework.spec.ts`). A booth must not change that.
- Triangles: the gates booth is ~1,090 with its raised pad and chevrons (budget ≤ 1,500).

## Dos and don'ts

- **Nothing answer-dependent before the answer.** Booth, demo, lamps, pad, device pictogram,
  prompts and countdown are both-eye and identical for every answer. Lamps only change after a
  report. The ✓/✗ pop may sit at the chosen object (the child has answered).
- **Prompts** sit at a fixed place per phase, never on top of the play: idle → above the pad (or
  an empty sign right behind it, as gates does), play → **near the play, where the child looks
  from the pad** (see "Where the play prompt goes" below; the booth-board default is only a
  fallback and is often off screen), wait → wherever the child is looking (gates: beyond the arch
  they ran through). Never under the HUD; never over a symbol or a weak-eye object.
- Weak-eye things stay on the weak layer; the kit never draws anything at a weak-eye object's place.
- Use the existing `SfxName`s only (the kit uses tick, start, gem, boing, fanfare, click, star).
- No words in the world (digits and "GO!" are the only glyphs). No health wording anywhere.
- Everything moving carries `userData.cameraIgnore` (the kit sets it on its meshes); solid parts
  have colliders (marquee poles, counter + board).
- Keyboard, gamepad and touch only through `ctx.input.state` and `ctx.interactions` (the kit's pad
  target uses the `flag` icon and is enabled only while idle).

## Fix round (QA): the rules every booth now follows

### The start pad stands out of the grass
- The pad is a **raised candy-striped drum** (`PAD_TOP` 15 cm, solid: the hero steps up), a glowing
  rim, a glowing face and six **glowing bollards** (`PAD_POSTS`, 62 cm) that stand out of tall
  grass; all pulse (`padFace`, `padGlow`, `padPosts` slots). Chevrons and footprints are low raised
  wedges (`DECAL_TOP`), not paint. Still the booth's one mesh.
- On the first update the kit puts the pad and every decal on the **real walkable surface**
  (a physics ray, as `src/activities/secrets` does for its start rings; `booth.settle`), then adds
  the drum's collider. Nothing for the game to do.
- Checked on every site at Low, Medium and High: `glasses-framework.spec.ts` "start pad visible
  from 8 m" (paints the pad dark and counts the changed pixels).

### The celebration happens in view
- When the tries end the kit turns the camera to `celebrateAt` (default: the booth's picture
  board) with `ctx.cameraRig.setOverride({ yawOffset })`, holds it through the celebration and the
  prize flight (≤ 4.2 s), then releases it. It releases **at once** on look input, respawn, a
  vehicle (player not walking), pause / session change, leaving the site, far-idle or reset.
- Confetti and a burst also fire **next to the child** (towards where the camera looks), and the
  prize gems fly from the banner to the child.
- `celebrateAt` may be a function (asked when the tries end): gates turns the camera so the booth
  sits in the left of the view and the pad in the middle, from wherever the child stopped.

### Where the play prompt goes (`view.ts`)
- During a try the ONE prompt floats **near the play's focus, in clear view from the pad camera**:
  `pickPromptSpot(candidates, { pad, look, size, keepClear })` returns the first candidate whose
  billboard lies in `PROMPT_SAFE` (the central area no HUD element covers: wallet, compass, timer,
  Fun Pass chip, radio top; wardrobe and skill buttons right; touch controls bottom corners), off
  the hero (`HERO_BOX`) and off every `keepClear` thing (symbols, the sign …), at 16:9 and 4:3.
  Pass the result as `spec.playPromptAt` (and `playPromptSize`). Pick once from the layout: the
  place never depends on the answer. Gates: candidates beside the sign, between it and the arches.
- `playPrompt: 'button'` shows the Use button of the device in use (key E, gamepad X, a tapping
  hand) and follows the device.
- Set `setup.look` (the play's focus seen from the pad) so `kit.padView()` and the e2e check stand
  the hero on the pad facing the play.
- **e2e**: `glasses-framework.spec.ts` "the play prompt is in clear view from the pad" stands on
  every pad, starts a try (`__rgGlasses.boothPlay`), projects the prompt at 640×360 and 1280×720
  and checks it against every visible HUD element's rectangle (`hudRects`, `checkPromptClear` in
  `tests/e2e/glasses-helpers.ts`) and the safe area. Add your game's id to `PROMPT_ENFORCED` when
  it passes (today: gates; glowflies, toys and dot signs already pass; odd one out and line-up do not).

### Demo legibility (rule of thumb, `DEMO_RULE`)
- The picture board is 2.34 m: at **8 m on a 640×360 screen** that is ~91 px. Where the hero
  appears it must be **≥ 33 of the panel's 100 units tall** (≥ 26 px at 8 m), and a frame shows
  **≤ 9 pictures** (kit drawings). Close-ups, one idea per frame.
- `auditDemo(demo)` (`legibility.ts`) measures it in node (no canvas): hero height per frame,
  pictures per frame, px at 8 m. `tests/activities/glasses-booth-fix.test.ts` enforces it for gates
  and logs the others (today: dot signs 18 px, glow-flies 26 px, line-up 26 px and 14 pictures,
  odd one out 21 px and 11 pictures, toys 17 px).

### Booths face the arrival
- `site.arrival` is the road end of the world's stepping-stone trail (nearest road point; the
  world lays the trail straight from there to the site's edge). Opt in with
  `LayoutSpec.arrival = site.arrival` and `arrivalTargets` (marquee lamps / banner / board, the
  pad): the layout turns to face the arrival and scores clear sightlines from 12 m and 30 m.
  `glasses-framework.spec.ts` logs anything that stands between the arrival and each booth.

### Small additions
- `report(hit, at, tier?)`: a per-try tier. `note(hit, at?, tier?)`: a result with a pop and a sound
  that lights no lamp and does not move the round. `finish()`: end the tries now.
- Timed rounds: `RoundRules.time` (s): one play phase; every report lights the next lamp; ends when
  the time is up, all lamps are lit or `finish()`; prize by hits.
- `setup.extra`: your own static geometry (frame-local, booth-atlas UVs) merged into the booth.
- ✓ / ✗ pops and digits are drawn on top **and write depth**, so a weak-eye object behind a pop is
  hidden for the weak eye too (no cost).

## Checklist for a mini-game moving to the kit

- [ ] `booth: true` in `mechanics.ts`; the old board is gone, `signDraws(id) === 1`
- [ ] `BoothSpec` inside the site circle; marquee corners in the layout footprint, lamps in the targets
- [ ] the default camera from the pad shows the booth's lamps and the whole play; no prompt covers it
- [ ] demo: 4–6 frames, generic, kit style, reads in R-only and G-only
- [ ] `RoundRules` + prize table: bot ≤ 6 / min at every tier, perfect ≥ 25 / min at tier 1 (unit test)
- [ ] `hooks.onTry` / `onIdle`; answers accepted only in `play`; `kit.report(hit, at)` once per try
- [ ] old naps / warm-up guard / per-hit pay removed; no direct `env.result` / `env.pay`
- [ ] lifecycle forwarded (`update`, `setActive`, `reset`, `dispose`)
- [ ] `force({ play, start, pin })` and `debug().kit`
- [ ] e2e: 30 m R/G contrast, attract, countdown, 4-combo channels, answer-blind both ways (pin the
      clocks), a round with a hit and a miss through real input, lamps, celebration, prize paid, cancel
- [ ] screenshots (full, R-only, G-only; 640×360 and 1280×720) looked at; compared with the carnival row
- [ ] `glasses-framework.spec.ts` still green: spawn / Gear Shack draws unchanged
- [ ] play prompt placed with `pickPromptSpot` near the play; your id in `PROMPT_ENFORCED`
- [ ] `auditDemo(yourDemo).problems` is empty (hero ≥ 33 units, ≤ 9 pictures per frame)
- [ ] `celebrateAt` set if the child ends the tries away from the booth; layout opts in to `arrival`
