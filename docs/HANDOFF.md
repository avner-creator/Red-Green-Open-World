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

## State (updated 2026-11-11 ~15:00 UTC)

**On `main` (verified, 494 unit + 129 e2e; live on Netlify):** red-green compositor + calibration;
six heroes with skills and a select screen (frog is the default); economy (persistent wallet and
profile, mega gems, combos, respawning gems, Gear Shack shop, wardrobe, tickets, missions);
trampoline with tricks, bounce pads, rocket pads; buggy (fixed-step handling drawn interpolated),
horse; balloon skydive; bungee; Silly Zone; secret paths and two-eye vault doors; Scoops
ice-cream shop; both-eye chests; wayfinding; touch controls; adaptive music.
Attractions register through `src/activities/<folder>/register.ts` (see CLAUDE.md).

## In flight (main session)

| Branch | Owner agent | Task |
|---|---|---|
| `agent/integrate-m2` | integrator | Batch 2, merged one at a time on top of `main`: `agent/world-budget`, `agent/chest-symbols-clean` (NOT `agent/chest-symbols`), `agent/buddy-pip` (Pip the talking puppy), `agent/boot-loading` (I), `agent/world-life` (H), `agent/world-outer` (G), then attractions `agent/bumper-arena` (L), `agent/carnival-games` (J), `agent/foam-lava` (M), `agent/sky-rides` (O), `agent/buggy-race` (N); shared glue (stunt kinds, icons, sounds, `PlayerApi.addMoveModifier`, tickets via `payTicket`), ride-release e2e, vision-content coverage, e2e time. Checkpoint pushes after each merge. |
| `agent/world-sites` | world-artist | Anchors, cleared ground, beacons, signposts and paths for the new attractions (carnivalRow, iceCream, bubbleArena, dinoRing, raceStart, foamCourse, airstrip, dragonRoost). Merge after batch 2. |

Second account: `agent/glasses-depth` (Stream P, orchestrated; Phase 1 in progress, Phase 2 may
start now that `main` has the economy). All other streams (A–O) are pushed.

Known defects to assign after batch 2: frog's hat drifts in skydive freefall; secrets and Silly
Zone need draw-call batching; e2e suite takes 10–19 min under load; start screen, Fun Pass stamp
card, cuter hero idles, trampoline entrance, hero framing at the balloon top (Carnival Island pass).

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
