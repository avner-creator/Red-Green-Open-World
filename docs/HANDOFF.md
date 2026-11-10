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

## State (updated 2026-11-10 ~17:30 UTC)

**On `main` (verified, 31 e2e; live on Netlify and confirmed loading):** M0 + M1 vertical slice
plus both-eye treasure chests (weak-eye key, strong-eye keyhole), 6 outfits and trampoline
walk-on auto-bounce.

## In flight (workers running in the old session; branches pushed as WIP)

| Branch | Owner agent | Task |
|---|---|---|
| `agent/activities-skydive` | (done, verified alone) | Balloon skydive in `src/activities/skydive/`. Conflicts with `main` only in `src/activities/index.ts` (keep both registrations). |
| `agent/integrate-skydive` | integrator | Merging skydive onto `main`, `CameraApi.setOverride` gets `yawOffset`/`orbitRate`, freefall pickup-point fix, combined chest+skydive e2e, e2e speed-up. |
| `agent/core-car` | engine-engineer | One drivable buggy at `anchors.garage`: arcade raycast vehicle, enter/exit with E, chase camera, engine loop, `tests/e2e/vehicle.spec.ts`, publishes `object.userData.defaultColor`. |
| `agent/ui-polish` | ui-designer | QA fixes: small fading tutorial strip, HUD sizes, settings without scrolling, labels "Gem eye / Gem glow / Ghosting guard / Other-eye dimmer", honest end-screen stickers, stable Play button. |
| `agent/world-polish` | world-artist | Dress garage, balloon field, landing field, roads; fog/bloom/shadows; fix gem spots 35 and 44 and the last skydive gem; open views at every anchor; Medium ≤ ~450k triangles. |

If a WIP branch is unfinished, start the same agent type on it (not from scratch): "continue the
task on branch `agent/...`; run verify; report". If a branch is empty or missing, re-brief from the
table.

Parallel streams another account can run right now: see `docs/PARALLEL_WORK.md`.

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
