# Handoff: how another Claude session (any account) picks this up

Everything needed is in this GitHub repo. No chat history is required. The orchestrator keeps
this file current at every milestone and whenever work is in flight.

## Start here (new orchestrator session)

1. Open a Claude Code cloud session on `avner-creator/Red-Green-Open-World` (model: Fable 5.2 as
   orchestrator, auto permission mode).
2. Send it: **"Read docs/HANDOFF.md and continue the build as orchestrator."**
3. It must read, in this order: `docs/DIRECTIVES.md` (highest priority) → `CLAUDE.md` →
   `docs/HANDOFF.md` (this file) → `docs/PROGRESS.md` → `docs/DECISIONS.md` →
   `docs/BUILD_PLAN.md` → `docs/GAME_DESIGN.md` → `.claude/agents/*.md`.
4. Then: `npm ci`, `npm run verify` on `main` (must be green), look at
   `npm run shots:channels` output in `test-results/channels/`, and continue from
   "Next steps" below.

## Where the work lives

| Branch | Meaning |
|---|---|
| `main` | Always verified (`npm run verify` green). Netlify deploys it to https://red-green-open-world.netlify.app |
| `integration/*` | Merges that are pushed but not yet verified/promoted. Promote with a fast-forward of `main` once verify is green. |
| `agent/<area>-<task>` | A worker's branch, pushed as work in progress. May be unfinished; check the "In flight" table. |

Rules that matter for a newcomer: the orchestrator writes no code (workers on Opus/Sonnet do);
`main` only moves when verify is green; one owner per folder (see BUILD_PLAN.md); shared
interfaces are in `src/types.ts` (integrator only); tests use `?test=1` and `window.__rg`;
parallel agents must each use their own `RG_PORT`.

## State (updated 2026-11-11 ~03:00 UTC)

**On `main` (verified, 71 e2e; live on Netlify):** everything in the previous state plus: six
playable CC0 characters with skills (Q) and emotes (C), character-select onboarding (Play → pick
→ Go; last pick remembered), HUD skill chip, touch/mobile controls, compass de-overlap, correct
gamepad glyphs, trick/confetti/apex fixes, fingerpost readable from spawn, skydive sea/fog detail.

Interface additions since M1 (other streams must keep them): `CameraApi.setOverride` accepts
`yawOffset`/`orbitRate`; `PlayerApi.setTilt`, `setVisualRotation`, `setVisualStretch`,
`setCharacter`, `characterId`, `skill`, `emote()`; `InputState.skillPressed`/`emotePressed`/`skill`;
events `player:character`/`player:skill`/`player:emote`; `Anchor.target`/`targetRadius`;
`TestApi.step(dt, n, render)`. Activities export `setLaunchGate(fn)` (rocket-pad ticket hook) and
`thrillSpots` (mega-gem positions). **Economy plug-in point for character buying:**
`setCharacterAccess({owns, canAfford, buy, wallet})` in `src/ui/characterAccess.ts`.

## In flight

Main session: nothing in flight except a QA audit of `main` (read-only). Glue (skill bounce
boosts, `'touch'` device, phone defaults, saved character at boot) and the hero-object performance
pass are on `main` (75 e2e). Still over budget: triangles (Medium 534k vs 500k, Low 338k vs 280k;
the rest is terrain and grass).

Second account (see `docs/PARALLEL_WORK.md`; merge each when the owner says it is pushed):
`agent/economy` (Stream C, orchestrated), `agent/mobile-touch` (A), `agent/characters` (B);
`agent/activities-secrets` (F), `agent/core-horse` (D), `agent/activities-bungee-silly` (E), `agent/world-outer` (G), `agent/world-life` (H), `agent/boot-loading` (I). A and B are merged; C is nearly done; the rest were started on 2026-11-11.
After `agent/characters` lands, the main session wires characters into the player controller,
skills and a character-select onboarding screen.

If a WIP branch is unfinished, start the same agent type on it (not from scratch): "continue the
task on branch `agent/...`; run verify; report". If a branch is empty or missing, re-brief from the
table.

Parallel streams on a second account: see `docs/PARALLEL_WORK.md`. **Stream C (economy, shop, missions; branch `agent/economy`) is taken by the second account** — the main session must not build items 1–4 of the fun pass, only merge that branch when it is ready. Main session keeps: thrills, wayfinding, speed, controls card, music, character wiring, QA, performance.

## Next steps (in order)

0. Build the "Fun and motivation pass" in GAME_DESIGN.md (owner feedback): economy/wallet/shop, missions, characters, bigger thrills, wayfinding, speed, controls card, music.

1. Merge the in-flight branches one at a time onto an integration branch; `integrator` fixes
   failures; verify; promote. Known follow-ups: vehicles should publish
   `object.userData.defaultColor` (chests reset car paint with it); calibration labels in
   `src/vision/calibration.ts` must match the new UI wording; `src/activities/index.ts` gets a
   one-line registration from both chests and skydive (trivial conflict).
2. `qa-playtester` on the combined build; fix every blocker/major (delegate); look at screenshots
   against the AAA bar in DIRECTIVES.md.
3. M5 polish: loading screen, quality presets check, performance pass, gamepad check, credits and
   `ASSETS.md` complete, listen to the audio in a real browser, final QA, tag `v1.0`, final
   report in PROGRESS.md.
4. Only if time allows (DIRECTIVES cut order): horse, bungee, Silly Zone, secret paths.

## Open items for the project owner

- Try the live build with real red-green glasses on a real monitor (calibration screen).
- Nobody has listened to the audio yet (tests run silent).
- Edge/Firefox/Safari need a manual check (only Chromium exists in the container).
