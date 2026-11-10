# Stream P — red-green depth pass (`agent/glasses-depth`)

Orchestrated stream (the orchestrator writes no code; builders are Opus/Sonnet subagents). Brief:
`docs/PARALLEL_WORK.md` "Stream P". Design: `docs/GAME_DESIGN.md` "Red-green depth pass".

**Status: Phase 1 in progress** — foundation merged, the six mechanics are being built.
This file is updated at every merge into the branch.

## Phase 1 parts

| Part | Where | Builder branch | State |
|---|---|---|---|
| Shared types (additive) | `src/types.ts`, `src/settings.ts` | on `agent/glasses-depth` | merged |
| Vision toolkit | `src/vision/toolkit/` | `agent/glasses-toolkit` | merged |
| Per-layer fade, Auto challenge, session tally, debug view | `src/vision/challenge/`, `src/vision/debugView.ts` | `agent/glasses-challenge` | merged |
| Mechanics framework | `src/activities/glasses/` | `agent/glasses-framework` | merged |
| "Auto challenge" toggle + grown-up session summary | `src/ui/glasses/` | `agent/glasses-ui` | merged |
| Glow-flies, Pip's lost toys | `src/activities/glasses/glowflies/`, `toys/` | `agent/glasses-follow` | building |
| Odd one out pedestals, Line-up targets | `src/activities/glasses/oddone/`, `lineup/` | `agent/glasses-tellapart` | building |
| Half-symbol gates, Dot-picture signs | `src/activities/glasses/gates/`, `dotsigns/` | `agent/glasses-botheyes` | building |
| QA pass and full `npm run verify` | — | — | waiting |

## What was built

### Vision toolkit (`src/vision/toolkit/`, import from `'../../vision/toolkit'`)

Small building blocks for the weak-eye and strong-eye layers. Each factory returns a
`THREE.Object3D` plus a small controller (`setFade`, `update`, `dispose`); the caller registers the
object with `ctx.vision.add(obj, VisionLayer.WeakOnly | StrongOnly)`. API cheat sheet with examples:
`src/vision/toolkit/README.md`.

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
`S XOR shape`. Each eye alone sees plain noise; the shape exists only between the two eyes (unit
tests + a bit-exact e2e proof). `pickCandidates` returns three symbols such that neither half
alone identifies the answer.

### Compositor additions (`src/vision/`)

- Separate per-layer multipliers in the compositor (`weakMul`, `strongMul`). At the defaults the
  output is bit-identical to before (the existing vision, chest and activity specs pass unchanged).
- `ctx.vision.setLayerFade(layer, fade, seconds?)`: fade a whole layer smoothly.
- **Auto challenge** (`src/vision/challenge/`): runs only while `settings.autoChallenge === true`.
  Three hits in a row → one step harder; a miss → one step easier; 40 s of play without a hit →
  one step easier. Level 0..6; per level the weak layer is 7 % fainter, the other eye's contrast
  5 % lower and toolkit objects 4 % smaller (floors 0.58 / 0.70 / 0.76). Changes glide over ~2 s.
  It resets when a session starts, never calls `settings.set`, never writes storage and never
  changes the crosstalk limit. Effective weak strength ≤ the calibrated value; effective contrast
  stays within `[0.4, calibrated]`. The calibration screen always shows the calibrated values.
  Numbers: `src/vision/challenge/constants.ts`.
- **Session tally**: `ctx.vision.sessionSummary()` → rows by mechanic and tier (hits, misses),
  seconds played, staircase steps. Cleared when a session starts, kept after it ends.
  Inputs: every `glasses:result` event, plus `gem:collected` (as `gems`/find), `chest:key`
  (`chestKeys`/find) and `chest:opened` (`chests`/lineUp) as hits.
- Test hooks (`?test=1` only): `window.__rgChallenge` (`effective()`, `staircase()`,
  `layerCoverage(layer)`, `setDebugView('off' | 'weak' | 'strong')`) and
  `window.__rgVision.toolkit` (spawn any toolkit block in front of the camera).

### Mechanics framework (`src/activities/glasses/`)

- `types.ts`: the `Mechanic` / `MechanicEnv` contract (read its header). Each mechanic lives in
  its own subfolder and exports `create(env)`.
- `sites.ts`: six sites found at boot — on land, gentle slope, outside every anchor radius in
  `ctx.world.anchors` (anchors added later by other streams are avoided automatically), off the
  roads, clear of gem and chest spots, free of colliders, board visible from the approach.
  No anchor was added or moved. Sites found in the current world (x, z): glowflies (12, 24),
  oddone (33, −3), lineup (−25, −20) near the plaza; toys (13, 39) by the garage; gates (61, 10)
  by the trampoline; dotsigns (45, 58) by the balloon.
- `board.ts` + `pictos.ts`: a wordless pictogram board per site (both eyes, one draw call, reads
  in R-only and G-only).
- `rewards.ts`: `pay()` uses `ctx.profile.earn(n, 'mission')` when the economy is present and
  always gives a toast and a sound; `result()` emits `glasses:result`.
- Far-idle: a mechanic's layer objects are attached and its `update` runs only while the player
  is within 60 m (off beyond 70 m) and the session is playing.
- Test API (`?test=1`): `window.__rgGlasses` (`sites`, `goto`, `debug`, `force`, `reset`,
  `draws`, `active`, `boardRect`). Proof helpers for specs: `tests/e2e/glasses-helpers.ts`
  (`expectLayerOnlyTouchesOwnChannel`, `expectAnswerBlindWithoutWeakEye`, `expectDrawBudget`).

### Grown-up UI (`src/ui/glasses/`)

- "Auto challenge" toggle in the Glasses tab of the grown-up settings (behind the gate), off by
  default; settings Reset turns it off.
- "Session summary" button next to it → a summary screen: time played, the Auto challenge line,
  and a table by kind of glasses play and mechanic with hits / tries and hit rate for the three
  tiers (Easy, Medium, Tricky) plus totals. Plain counts only; a banned-words test guards the
  wording.

## Interface additions (all additive; nothing renamed, removed or reordered)

`src/types.ts`:
- Types after `ChannelAssignment`: `GlassesKind`, `GlassesTier`, `ChallengeModifiers`,
  `GlassesTally`, `GlassesSummary`.
- `GameSettings.autoChallenge?: boolean` (last field; off when undefined).
- `VisionApi` optional members after `setLayerVisible`: `challenge()`, `setChallenge(mods | null)`,
  `setLayerFade(layer, fade, seconds?)`, `sessionSummary()`.
- `GameEvents` after `'player:respawn'`: `'glasses:result': { mechanic, kind, tier, hit }` and
  `'glasses:challenge': { modifiers }`.

The insert points were chosen away from the places the economy stream edits (`'gem:collected'`,
the end of `GameEvents`, the end of the file), so both should merge without conflicts.

**How other attractions join in (Phase 2 and other streams):** emit
`ctx.events.emit('glasses:result', { mechanic: '<id>', kind, tier, hit })` whenever the player
hits or misses something only the weak eye (or both eyes together) could do. That one event
feeds the Auto challenge staircase and the grown-up summary. Use
`withChallenge(tier, ctx.vision.challenge?.())` from the toolkit for sizes that follow the
staircase.

## Edits to existing files (complete list)

Everything else in Phase 1 is new files.

| File | Change |
|---|---|
| `src/types.ts` | +60 lines, the additions listed above |
| `src/settings.ts` | +2 lines: `sanitizeSettings` keeps a boolean `autoChallenge` |
| `src/activities/index.ts` | +4 lines: import `createGlasses`, create it last, `update`, `dispose` |
| `src/ui/settingsScreen.ts` | import `createGlassesSettingsRows`; option `onSummary?()`; build the rows; `...autoRows.rows` before the Calibration row |
| `src/ui/index.ts` | import `createGlassesSummary`; create it; `onSummary` handler; `all.push(...)` + `root.append(...)` |
| `src/vision/index.ts` | wire layer fades, the challenge driver and the four new `VisionApi` members; install `window.__rgChallenge` in test mode |
| `src/vision/DichopticPass.ts` | `weakMul` / `strongMul` uniforms, `setRuntime()`, `effective()`, debug view, coverage readback |
| `src/vision/shaders.ts` | the two multipliers in `compositeLayer`; mask debug modes; `maskCopyFragment` |
| `src/vision/math.ts` | TS mirror of the same maths (`RuntimeMultipliers`, `effectiveUniforms()`) |
| `src/vision/constants.ts` | `COMPOSITE.contrastFloor = 0.4` |
| `src/vision/testHooks.ts` | +4 lines: `toolkit` field on `window.__rgVision` |

The UI hook lines were placed away from the lines the economy branch changes in the same files.
`src/config.ts`, `src/main.ts` and `package.json` are untouched.

## Decisions

- "Rebase on `origin/main` hourly" is done as a **merge of `origin/main` into the branch**
  (the branch is pushed with plain pushes only; a rebase would need a force push).
- "New files only" is read as: all real code in new files/folders; existing files get only
  additive `src/types.ts` changes and the smallest hooks, each listed above. Without a hook the
  code is not in the bundle and cannot be tested end to end. The compositor edits are the
  additions the Auto challenge needs (a weak-layer-only multiplier did not exist).
- The Auto challenge lives in `src/vision/` (it is about what each eye sees and the calibrated
  limits). It is runtime-only.
- The grown-up summary is reached from the grown-up settings (already behind the gate), so no
  new entry point was added to kid-facing screens.
- Activities import the pure data `ROADS` from `src/world/layout` to keep the new sites off
  roads (`WorldApi` has no road query).
- Site rules relaxed where the real island had no valid spot: gem/chest spots are kept 1 m from
  a site's edge (7 m from its centre) instead of 4 m; a site "by an attraction" may be up to 40 m
  from the anchor's centre (roads ring the balloon field).
- Builders run only their own e2e specs while several share the 4-CPU machine; the full
  `npm run verify` is run by the orchestrator on the merged branch.

## How to test

Filled in at the end of Phase 1.

## Phase 2 (not started)

Waits for the project owner to say `main` has the economy and the merged attractions.
