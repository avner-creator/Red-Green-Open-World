# Stream P — red-green depth pass (`agent/glasses-depth`)

Orchestrated stream (orchestrator writes no code; builders are Opus/Sonnet subagents). Brief:
`docs/PARALLEL_WORK.md` "Stream P". Design: `docs/GAME_DESIGN.md` "Red-green depth pass".

**Status: Phase 1 in progress.** This file is updated at every merge into the branch.

## Phase 1 plan (new files only, plus the one-line hooks listed below)

| Part | Folder | Builder branch | State |
|---|---|---|---|
| Shared types (additive) | `src/types.ts`, `src/settings.ts` | on `agent/glasses-depth` (`0adc381`) | done |
| Vision toolkit (rings, reticles, glyph sprites, half-symbols, dot pictures, tiers, faders) | `src/vision/toolkit/` | `agent/glasses-toolkit` | building |
| Per-layer fade, Auto challenge staircase, session tally, debug view | `src/vision/challenge/` + small additive edits in `src/vision/` | `agent/glasses-challenge` | building |
| Mechanics framework (sites, pictogram boards, rewards, far-idle, test API, proof helpers, six stubs) | `src/activities/glasses/` | `agent/glasses-framework` | building |
| "Auto challenge" toggle + grown-up session summary | `src/ui/glasses/` | `agent/glasses-ui` | building |
| Six mechanics (glow-flies, Pip's lost toys, odd one out, line-up targets, half-symbol gates, dot-picture signs) | `src/activities/glasses/<name>/` | three builders after the framework and toolkit land | waiting |
| QA pass and full `npm run verify` | — | — | waiting |

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

`src/settings.ts`: `sanitizeSettings` keeps `autoChallenge` when it is a boolean (two lines).
`src/config.ts` is unchanged: `reset()` goes back to `DEFAULT_SETTINGS`, which has no such key.

**How other attractions join in (Phase 2 and other streams):** emit
`ctx.events.emit('glasses:result', { mechanic: '<id>', kind, tier, hit })` whenever the player
hits or misses something only the weak eye (or both eyes together) could do. That one event
feeds the Auto challenge staircase and the grown-up summary. Read
`ctx.vision.challenge?.()` for the current size scale if the object should shrink with it.

## Edits to existing files (complete list, kept to hooks)

Filled in as each part lands (file, lines, why).

## Decisions

- "Rebase on `origin/main` hourly" is done as a **merge of `origin/main` into the branch**
  (the branch is pushed with plain pushes only; a rebase would need a force push).
- "New files only" is read as: all real code in new files/folders; existing files get only
  additive `src/types.ts` changes and the smallest registration hooks (one import + one call),
  each listed above. Without a hook the code is not in the bundle and cannot be tested end to end.
- The Auto challenge lives in `src/vision/` (it is about what each eye sees and the calibrated
  limits). It is runtime-only: it never calls `settings.set` and never writes storage.
- The grown-up summary is reached from the grown-up settings (already behind the gate), so no
  new entry point was added to kid-facing screens.
- Activities may import the pure data `ROADS` from `src/world/layout` to keep the new sites off
  roads (`WorldApi` has no road query). Sites are found at boot from `heightAt`/`isLand`, every
  anchor in `ctx.world.anchors` (so anchors added by other streams are avoided automatically)
  and a collider probe; no anchor was added or moved.
- Builders run only their own e2e specs while four of them share the 4-CPU machine; the full
  `npm run verify` is run by the orchestrator on the merged branch.

## How to test

Filled in at the end of Phase 1.

## Phase 2 (not started)

Waits for the project owner to say `main` has the economy and the merged attractions.
