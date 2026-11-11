# Stream P — red-green depth pass (`agent/glasses-depth`)

Orchestrated stream (the orchestrator writes no code; builders are Opus/Sonnet subagents). Brief:
`docs/PARALLEL_WORK.md` "Stream P". Design: `docs/GAME_DESIGN.md` "Red-green depth pass".

**Status: Phase 1 is merged into `integration/m1`. Phase 2 is in progress** (started
2026-11-11 from `origin/integration/m1` at `da704d6`, with the owner's go-ahead; `main` is held
until two batch 2 fixes land). The Phase 1 sections below describe what was merged.

`npm run verify` is green on the final branch: 664 unit tests and 174 e2e tests passed (see "Test results" at the end).

## What Phase 1 adds, in one paragraph

Six new mini-games that can only be played with the weaker eye (or with both eyes together),
a toolkit of weak-eye / strong-eye building blocks for other attractions, an optional grown-up
"Auto challenge" that gently makes weak-eye things harder after wins and easier after misses
without touching the saved calibration, and a grown-up session summary with plain counts.

## The six mini-games (`src/activities/glasses/<id>/`)

Each has a wordless pictogram board, pays gems through the economy (`ctx.profile.earn(n,
'mission')`), reports every hit and miss with the `glasses:result` event, uses at most 6 draw
calls including its board, and is idle when the player is more than 70 m away.

| Mini-game (id, kind) | How it plays | Why the weak eye is needed | Gems by tier |
|---|---|---|---|
| Glow-flies (`glowflies`, follow) | 4–5 weak-eye fireflies drift over a meadow (up to 8.5 m from the centre, 1.0–2.6 m up; the high ones need a jump). Run or jump through one to catch it. A both-eye lantern jar counts catches. A fly lives 9 / 7 / 5.5 s; one that leaves while the hero was within 3 m is a miss. | The flies exist only on the weak layer; nothing both-eye follows them. | 1 / 2 / 3 |
| Pip's lost toys (`toys`, follow) | A weak-eye paw-print trail (ground prints plus a floating paw over each; only the next four glow) leads 25–40 m from Pip's basket to a hidden spot. The both-eye toy pops out only when the last print is reached. Three toys per session; a trail times out after 75 s. | The trail is weak-eye-only and the toy is not in the scene until it is found. | 5 / 7 / 10 |
| Odd one out (`oddone`, tellApart) | Three pedestals with identical buttons and identical dark panels; a weak-eye shape on each, one different. Press the button under the different one. A per-session staircase makes the difference finer after a hit and coarser after a miss (other shape → arrow direction → ring gap side → narrower gap, smaller shape; 8 levels). | The shapes are weak-eye-only; panels, buttons and prompts are identical for every answer. | 2 / 3 / 5 |
| Line-up bubbles (`lineup`, lineUp) | Stand on the pad: a strong-eye soap bubble floats ahead and a weak-eye sparkly hoop sits somewhere 5°–14° from the screen centre. Steer the hoop over the bubble and press Use. One guess per bubble; the hoop jumps to a new place after every press. | The hoop's place is unknown without the weak eye and the bubble is strong-eye-only. A blind press hits 5 % of the time at tier 1 and under 1 % at tier 3 (simulated in unit tests). | 1 / 2 / 4 |
| Half-symbol gates (`gates`, lineUp) | A sign shows one half of a symbol to each eye; run through the arch whose both-eye symbol is the two halves together. Each half alone fits two arches. | Neither half alone identifies the arch (proved in both directions). | 3 / 4 / 6 |
| Dot-picture signs (`dotsigns`, popOut) | A sign shows a red-green dot picture; press the pedestal button with the hidden shape. | Each eye alone sees plain noise; the shape exists only between the two eyes. | 3 / 5 / 8 |

**Guessing does not pay.** In the three "pick one of three" games a miss is followed by a short
nap (odd one out 5 / 8 s, dot signs 5 / 8 / 12 s, gates 3 / 6 / 8 s on the plate) and hits pay
1 gem until two in a row are right. A random-guess bot earns about 4–5 gems per minute; a
player who sees the answer earns 30–75. Line-up: blind play earns about 0.5 gems per minute.

**Known limit.** Glow-flies are caught by running through them, so a child who cannot see them
still catches a few by running laps. In the simulation a player heading for the flies catches
6.6 times as many as one mowing the meadow blind.

**Automated proofs for every mini-game** (`tests/e2e/glasses-follow.spec.ts`,
`glasses-tellapart.spec.ts`, `glasses-botheyes.spec.ts`; helpers in `glasses-helpers.ts`):
1. Channel test, all 4 lens/eye combinations: weak-eye parts change only the weak channel,
   strong-eye parts only the strong channel; the other channel and blue are bit-identical.
2. Answer-blind: with the weak layer hidden, the frames for two different answers are
   bit-identical (for the both-eye games also the mirror with the strong layer hidden).
3. A full round to a hit and one to a miss; the draw budget; idle when far.

## Sites: fixed coordinates

The six sites are a fixed table (`FIXED_SITES` in `src/activities/glasses/sites.ts`); only the
height comes from the terrain. They no longer move when the world changes. Each site is a circle
of radius 6 m. No anchor was added or moved.

| id | x | z | Where | Nearest reserved point | Nearest anchor edge | Nearest road edge |
|---|---|---|---|---|---|---|
| `glowflies` | −68.4 | 19 | open meadow beside the west road, by the ranch fence (69 m from spawn) | foamCourse 57 m | ranch 10 m | west 16 m |
| `oddone` | −36.5 | 3 | meadow between the west road and the foam course (37 m from spawn) | foamCourse 24 m | foamCourse 19 m | west 9 m |
| `lineup` | 71.7 | −89.5 | by the ridge road towards the bridge | carnivalRow 70 m | trampoline 55 m | ridge 10 m |
| `toys` | −50 | 13 | beside the west road (50 m from spawn) | foamCourse 40 m | ranch 23 m | west 9 m |
| `gates` | 48 | 104 | south-east, past the loop road | bubbleArena 48 m | sillyZone 24 m | loop 19 m |
| `dotsigns` | 64 | 8 | east of the park, by the path to the rocket pads | raceStart 35 m | launchPads 11 m | parklink 8 m |

Rules every site meets (`staticProblems` in `sites.ts`, checked by the unit test
`tests/activities/glasses-sites.test.ts` against `ANCHORS` and `ROADS` from
`src/world/layout.ts`, so an anchor or road placed on a site later makes the test fail and name
the site):
- outside every anchor radius and anchor target, plus the site radius and a margin;
- off every road (centreline ≥ half width + 1.5 m + 6 m; 4 m instead of 1.5 m on the race lap
  roads `east`, `loop`, `south`);
- centre ≥ 20 m from every reserved point and the whole circle + 2 m outside every reserved
  footprint (`src/activities/glasses/reserved.ts`): carnivalRow (21, −42), iceCream (24, −2),
  raceStart (29.5, 11.2) with paddock and podium, foamCourse (−25.5, −18.5) with its strip,
  airstrip (−12, 46) with the runway and its approach, dragonRoost (−34, −130),
  bubbleArena (35, 57.5), dinoRing (16, 58.5) with both booths, gearShack (14, 2);
- ≥ 14 m between sites, ≥ 7 m from every gem and chest spot;
- checked once when they were chosen: dry land, gentle slope, no collider, trunk or building.
  If a fixed site is ever blocked at runtime it stays where it is and logs one warning (in test
  mode no console warning: `__rgGlasses.sites()` reports `valid: false` and `problem`, and
  `tests/e2e/glasses-framework.spec.ts` fails naming the site and what blocks it).

Re-sited after the M1 integration merge: `glowflies` (was −40.7, 73.2: a scatter rock and bushes
from `src/world/scatter.ts` now stand on it) and `oddone` (was −47.4, −2.2: scatter oaks and a
bush). Both new rows came from `__rgGlasses.search` on the merged world; the mini-games' own layout
search succeeds there (odd one out: 0 problems; glow-flies: 3, the usual minimum).

What reaches outside a site's circle: glow-flies roam up to 9 m from their centre (no
colliders); line-up bubbles float 8–13 m ahead in the air (no colliders); the paw trail runs
25–40 m from the toys site and keeps every print out of anchors, roads, colliders and the
reserved footprints.

**Asked of the world/UI owners (not done here):** these sites have no beacon, fingerpost arm or
compass entry yet. Only two are within 55 m of spawn, because the space around the plaza is
taken; a child will find the others while walking to the Silly Zone, the bridge, the rocket pads
and the ranch.

## Vision toolkit (`src/vision/toolkit/`, import from `'../../vision/toolkit'`)

Small building blocks for the weak-eye and strong-eye layers. Each factory returns a
`THREE.Object3D` plus a small controller (`setFade`, `update`, `dispose`); the caller registers
the object with `ctx.vision.add(obj, VisionLayer.WeakOnly | StrongOnly)`. Cheat sheet with
examples: `src/vision/toolkit/README.md`.

| Block | Factory | Draw calls |
|---|---|---|
| Ring (dashes, gaps, progress arc, pulse, spin) | `createRing` | 1 |
| Timing ring (a ring closing onto a target ring) | `createTimingRing`, pure `timingWindow(t)` | 1 |
| Reticle | `createReticle` | 1 |
| Number / glyph sprite (digits, × + ! ?, arrows, check, shapes) | `createGlyphSprite` | 1 |
| Half-symbol pair (one half per eye) | `createHalfSymbolPair`, `pickCandidates` | 2 |
| Both-eye full symbol (main scene) | `createFullSymbolMesh` / `createFullSymbolTexture` | 1 |
| Red-green dot picture pair | `createDotPicturePair`, `generateDotPicture`, 8 shapes | 2 |
| Tier presets | `TIERS`, `withChallenge(tier, mods)` | – |
| Fader for any layer object | `createFader(object)` | – |

Dot pictures: the strong pattern `S` is 50 % random dots from the seed only; the weak pattern is
`S XOR shape`. Each eye alone sees plain noise; the shape exists only between the two eyes.
`pickCandidates` returns three symbols such that neither half alone identifies the answer.

## Compositor additions (`src/vision/`)

- Separate per-layer multipliers (`weakMul`, `strongMul`). At the defaults the output is
  bit-identical to before (the existing vision, chest and activity specs pass unchanged).
- `ctx.vision.setLayerFade(layer, fade, seconds?)`: fade a whole layer smoothly.
- **Auto challenge** (`src/vision/challenge/`), only while `settings.autoChallenge === true`:
  three hits in a row → one step harder; a miss → one step easier; 40 s of play without a hit →
  one step easier. Level 0..6; per level the weak layer is 7 % fainter, the other eye's contrast
  5 % lower and toolkit objects 4 % smaller (floors 0.58 / 0.70 / 0.76). Changes glide over
  about 2 s. It resets when a session starts, never calls `settings.set`, never writes storage
  and never changes the crosstalk limit. Effective weak strength ≤ the calibrated value;
  effective contrast stays within `[0.4, calibrated]`. The calibration screen always shows the
  calibrated values. Numbers: `src/vision/challenge/constants.ts`.
- **Session tally**: `ctx.vision.sessionSummary()` → rows by mechanic and tier (hits, misses),
  seconds played, staircase steps. Cleared when a session starts, kept after it ends. Inputs:
  every `glasses:result` event, plus `gem:collected` (`gems`), `chest:key` (`chestKeys`) and
  `chest:opened` (`chests`) as hits.

## Mechanics framework (`src/activities/glasses/`)

- `register.ts`: registration by the per-folder convention (`order = 190`: after every
  attraction that adds colliders, before gear).
- `types.ts`: the `Mechanic` / `MechanicEnv` contract (read its header). Each mini-game lives in
  its own subfolder and exports `create(env)`.
- `sites.ts`, `reserved.ts`: the fixed site table and the reserved places (above).
- `board.ts` + `pictos.ts`: a wordless pictogram board per site (both eyes, one draw call, reads
  in R-only and G-only).
- `rewards.ts`: `pay()` (economy + toast + sound) and `result()` (`glasses:result`).
- Far-idle: a mini-game's layer objects are attached and its `update` runs only while the player
  is within 60 m (off beyond 70 m) and the session is playing.
- `gates/layout.ts` (shared by gates, dot signs and odd one out) and `glowflies/layout.ts`:
  inside the fixed circle, each mini-game turns and shifts its own layout once so the default
  camera has a clear view (no board, trunk or bush in the way).

## Grown-up UI (`src/ui/glasses/`)

- "Auto challenge" toggle in the Glasses tab of the grown-up settings (behind the gate), off by
  default; settings Reset turns it off.
- "Session summary" button next to it → a summary screen: time played, the Auto challenge line,
  and a table by kind of glasses play and mini-game with hits / tries and hit rate for the three
  tiers (Easy, Medium, Tricky) plus totals. Plain counts only; a banned-words test guards the
  wording. Keyboard, gamepad and touch.

## Interface additions (all additive; nothing renamed, removed or reordered)

`src/types.ts`:
- Types after `ChannelAssignment`: `GlassesKind`, `GlassesTier`, `ChallengeModifiers`,
  `GlassesTally`, `GlassesSummary`.
- `GameSettings.autoChallenge?: boolean` (last field; off when undefined).
- `VisionApi` optional members after `setLayerVisible`: `challenge()`, `setChallenge(mods | null)`,
  `setLayerFade(layer, fade, seconds?)`, `sessionSummary()`.
- `GameEvents` after `'player:respawn'`: `'glasses:result': { mechanic, kind, tier, hit }` and
  `'glasses:challenge': { modifiers }`.

`src/types.ts` merged with `main` (economy and the other streams) without a conflict.

**How other attractions join in (Phase 2 and other streams):** emit
`ctx.events.emit('glasses:result', { mechanic: '<id>', kind, tier, hit })` whenever the player
hits or misses something only the weak eye (or both eyes together) could do. That one event
feeds the Auto challenge staircase and the grown-up summary. Use
`withChallenge(tier, ctx.vision.challenge?.())` from the toolkit for sizes that follow the
staircase.

## Edits to existing files (complete list, against `origin/main` `be5b4b2`)

Everything else in Phase 1 is new files (92 of them).

| File | Change |
|---|---|
| `src/types.ts` | +60 lines, the additions listed above |
| `src/settings.ts` | +2 lines: `sanitizeSettings` keeps a boolean `autoChallenge` |
| `src/ui/settingsScreen.ts` | +5 / −1: import `createGlassesSettingsRows`; option `onSummary?()`; build the rows and push their `refresh`; `...autoRows.rows` before the Calibration row |
| `src/ui/index.ts` | +6: import `createGlassesSummary`; create it; `onSummary` handler; `all.push(...)`, `root.append(...)`; `glassesSummary.update(dt)` while shown |
| `src/vision/index.ts` | wire layer fades, the challenge driver and the four new `VisionApi` members; install `window.__rgChallenge` in test mode |
| `src/vision/DichopticPass.ts` | `weakMul` / `strongMul` uniforms, `setRuntime()`, `effective()`, debug view, coverage readback |
| `src/vision/shaders.ts` | the two multipliers in `compositeLayer`; mask debug modes; `maskCopyFragment` |
| `src/vision/math.ts` | TS mirror of the same maths (`RuntimeMultipliers`, `effectiveUniforms()`) |
| `src/vision/constants.ts` | `COMPOSITE.contrastFloor = 0.4` |
| `src/vision/testHooks.ts` | +4 lines: `toolkit` field on `window.__rgVision` |

`src/activities/index.ts` is **not** edited any more: the glasses system registers from
`src/activities/glasses/register.ts`. `src/config.ts`, `src/main.ts` and `package.json` are
untouched.

## Decisions

- "Rebase on `origin/main` hourly" is done as a **merge of `origin/main` into the branch**
  (the branch is pushed with plain pushes only; a rebase would need a force push).
- "New files only" is read as: all real code in new files/folders; existing files get only
  additive `src/types.ts` changes and the smallest hooks, each listed above (approved by the
  main session). The compositor edits are the additions the Auto challenge needs (a
  weak-layer-only multiplier did not exist).
- The Auto challenge lives in `src/vision/` and is runtime-only.
- The grown-up summary is reached from the grown-up settings (already behind the gate), so no
  new entry point was added to kid-facing screens.
- Sites are fixed coordinates (asked for by the main session) and keep clear of the reserved
  places. To find six valid spots on the merged island the slope limit went from 1.4 m to 1.8 m
  across a site.
- Activities import the pure data `ANCHORS`/`ROADS` from `src/world/layout` for the site rules
  (`WorldApi` has no road query).
- Line-up was redesigned after QA from "hold the reticle on a bubble" to "steer the hoop over
  the bubble and press", because a player who never saw the reticle could still pop bubbles by
  parking one at a fixed place on screen. It also no longer looks like a target range.
- The anti-guess rule (nap after a miss, 1 gem until two hits in a row) was added after QA
  showed that random pressing farmed gems at 1 in 3.
- Builders ran only their own e2e specs while several shared the 4-CPU machine; the full
  `npm run verify` was run by the orchestrator on the merged branch.

## QA (independent pass on the merged branch, before the fixes above)

No blockers; the channel rule held in every shot and spec; no network calls, no new assets, no
banned wording in any new file. Majors found and fixed: line-up winnable blind; odd one out
badly framed; paw prints nearly invisible from the child's view. Minors fixed: views blocked by
the board, trees or bushes; the toy's pop-out hidden under a canopy; the line-up board; the
summary's name for odd one out. Numbers: +51 KB gzip of JavaScript (+2.5 %); each mini-game
3–5 draw calls idle, at most 6 in a celebration; far mini-games cost nothing.

## How to test

- Everything: `npm run verify`.
- Only this stream's specs: `npx playwright test tests/e2e/glasses- --trace off` (seven specs:
  `glasses-toolkit`, `glasses-challenge`, `glasses-framework`, `glasses-follow`,
  `glasses-tellapart`, `glasses-botheyes`, `glasses-ui`). Unit tests: `tests/vision/toolkit-*`,
  `tests/vision/challenge-*`, `tests/activities/glasses-*`, `tests/ui/glasses-*`,
  `tests/unit/settings-auto-challenge.test.ts`.
- By hand with `?test=1` in the browser console: `__rgGlasses.sites()` lists the sites,
  `__rgGlasses.goto('oddone')` walks the hero there, `__rgGlasses.debug(id)` shows the current
  answer, `__rg.setLayerVisible(1, false)` hides the weak-eye layer (try to win without it),
  `__rgChallenge.effective()` shows what the Auto challenge is doing,
  `__rgChallenge.setDebugView('weak')` shows the weak layer's mask.
- Grown-up parts: Pause → Grown-ups → gate → Glasses tab → "Auto challenge" and "Session
  summary".
- Screenshots (full, R-only, G-only) are written by the specs to `test-results/glasses/` and
  `test-results/glasses-toolkit/`, `test-results/glasses-ui/`.

## Phase 2 (in progress)

Base: `origin/integration/m1` (`da704d6`), which has the economy, every attraction, the sites and
Phase 1. Pushed to `agent/glasses-depth` with plain pushes.

Goal: weave the toolkit into what exists, each as a small, optional, clearly rewarded layer, with
the smallest diffs in other owners' folders. All Phase 2 code lives in a new folder
`src/activities/glasses/weave/<part>/`; every hook put into another owner's folder is listed in
"Phase 2 edits to other owners' files" below.

| Part (folder) | What it adds | Kind | State |
|---|---|---|---|
| skeleton + hook survey (`weave/`, `weave/README.md`) | part contract, registry, test API; what each part attaches to and the smallest hook it needs | — | building |
| `bounce/` | weak-eye perfect-bounce timing ring on the giant trampoline | timeIt | waiting |
| `chute/` | weak-eye parachute-open ring in the skydive; a weak-eye gem that only counts through a strong-eye hoop | timeIt / lineUp | waiting |
| `hero/` | weak-eye skill-ready ring and combo number over the hero | onHero | waiting |
| `boost/` | weak-eye boost-pad timing on the buggy race | timeIt | waiting |
| `fakes/` | "real gem among fakes" at a few gem spots | tellApart | waiting |
| `shack/` | dot-picture prize code at the Gear Shack | popOut | waiting |
| results from existing twists | one-line `glasses:result` emits where other attractions already decide a weak-eye hit or miss, so the Auto challenge and the summary cover the whole game | — | waiting |

### Phase 2 edits to other owners' files

Filled in as each part lands (file, lines, why).

## Test results

`npm run verify` on the final branch (code at `b010a8b`, which includes `origin/main` `be5b4b2`;
later commits are docs only), 2026-11-11: typecheck and lint clean; **664 unit tests passed**
(65 files); build passed; **174 e2e tests passed, 1 skipped** (the skip comes from `main`), in
14.5 minutes on the shared 4-CPU machine. 45 of the e2e tests are this stream's (seven
`glasses-*` specs, about 4.5 minutes of the suite).

One thing to watch: `tests/e2e/vision.spec.ts` (an existing spec) failed once for a builder
while four test runs shared the machine and passed on both reruns and in every full run; it
looks like a timing flake under load, not a break.
