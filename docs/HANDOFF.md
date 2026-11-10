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

## State (updated 2026-11-10 ~16:45 UTC)

**On `main` (verified, 105 unit + 25 e2e):** M0 + M1 vertical slice — red-green compositor with
weak-only/strong-only layers and calibration, channel tests for all 4 lens/eye combinations,
robot player + camera, island with dressed plaza and Bouncy Park, 63 weak-eye gems, trampoline
and bounce pads, UI (title, HUD, pause, end screen, grown-up gate + settings, credits),
procedural audio.

**On `integration/m0` (pushed, verify pending):** both-eye treasure chests (weak-eye key,
strong-eye keyhole), 6 outfits, trampoline walk-on auto-bounce.

## In flight (workers running in the old session; branches pushed as WIP)

| Branch | Owner agent | Task | Brief |
|---|---|---|---|
| `agent/core-car` | engine-engineer | One drivable buggy at `anchors.garage` (M2) | arcade raycast vehicle, enter/exit with E, chase camera, engine loop, e2e `tests/e2e/vehicle.spec.ts` |
| `agent/activities-skydive` | general-purpose (opus) | Balloon skydive in `src/activities/skydive/` (M3) | ride to 180 m, freefall, parachute (auto-open 40 m), landing rings, e2e `tests/e2e/skydive.spec.ts` |
| `agent/ui-polish` | ui-designer | QA fixes: small fading tutorial strip, HUD sizes, settings without scrolling, labels "Gem eye / Gem glow / Ghosting guard / Other-eye dimmer", honest end-screen stickers, stable Play button | — |
| `agent/world-polish` | world-artist | Dress garage, balloon field, landing field, roads; fog/bloom/shadows; fix gem spots 35 and 44; open views at every anchor; Medium ≤ ~450k triangles | — |

If a WIP branch is unfinished, start the same agent type on it (not from scratch): "continue the
task on branch `agent/...`; run verify; report". If a branch is empty or missing, re-brief from the
table.

## Next steps (in order)

1. Verify `integration/m0`; promote to `main`.
2. Merge the four in-flight branches one at a time onto an integration branch; `integrator` fixes
   failures; verify; promote. Known follow-ups: vehicles should publish
   `object.userData.defaultColor` (chests reset car paint with it); calibration labels in
   `src/vision/calibration.ts` must match the new UI wording; `src/activities/index.ts` gets a
   one-line registration from both chests and skydive (trivial conflict).
3. `qa-playtester` on the combined build; fix every blocker/major (delegate); look at screenshots
   against the AAA bar in DIRECTIVES.md.
4. M5 polish: loading screen, quality presets check, performance pass, gamepad check, credits and
   `ASSETS.md` complete, listen to the audio in a real browser, final QA, tag `v1.0`, final
   report in PROGRESS.md.
5. Only if time allows (DIRECTIVES cut order): horse, bungee, Silly Zone, secret paths.

## Open items for the project owner

- The live URL returned HTTP 401 from the build container, so deploys have not been confirmed
  from inside the session. Check it loads in a normal browser.
- Nobody has listened to the audio yet (tests run silent).
- Edge/Firefox/Safari need a manual check (only Chromium exists in the container).
