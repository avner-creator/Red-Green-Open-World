# Build plan

The orchestrator (main session) plans, assigns work to subagents, reviews and merges results,
runs `npm run verify`, and pushes `main`. Each milestone ends with a **green verify + a Netlify
deploy + a PROGRESS.md entry with screenshots**.

## Agents and ownership (see `.claude/agents/`)

| Agent | Owns | Typical tasks |
|---|---|---|
| orchestrator (main session) | `src/main.ts`, `src/config.ts`, `package.json`, docs, merges | plan, integrate, resolve conflicts, deploy |
| `dichoptic-engineer` | `src/vision/` | compositor, eye settings, calibration, channel tests |
| `engine-engineer` | `src/core/` | loop, input, physics, player, camera, cars, horse, ragdoll |
| `world-artist` | `src/world/`, `public/assets/`, `ASSETS.md` | asset sourcing and optimization, terrain, lighting, post FX, layout |
| `activities-designer` | `src/activities/` | trampoline, bungee, skydive, launch pads, gems, chests, stunts |
| `ui-designer` | `src/ui/` | menus, HUD, timer, end screen, settings, grown-up gate, credits |
| `qa-playtester` | `tests/` (reports only for other code) | e2e runs, screenshots, perf, rules audit |

**Parallel work**: spawn independent agents together with `isolation: "worktree"`. Each agent
only edits its own folders. Shared interfaces live in `src/types.ts`; only the orchestrator
changes them, before handing tasks out. Merge each worktree branch, then run verify.

## Milestones

**Step 0. Plan review** (orchestrator only, short): critique and improve this plan, CLAUDE.md,
GAME_DESIGN.md and the agent briefs. Log changes in DECISIONS.md, push, and start M0.

**M0. Foundation and vision core** (first, because the dichoptic system is the product)
- Orchestrator (before any agent starts): Vite + TS + Three + Rapier scaffold, `src/types.ts`
  (all shared interfaces), `src/main.ts` boot with stub systems, `npm run verify`, Playwright
  smoke test, the `?test=1` `window.__rg` hook, `npm run shots:channels`.
- In parallel: `dichoptic-engineer` (compositor, layers, eye settings, calibration, channel
  tests) · `engine-engineer` (loop, input incl. gamepad, Rapier, player, camera, interactions) ·
  `world-artist` (terrain heightfield + `WorldApi`, sky/HDRI, lighting/post, plaza + Bouncy Park
  blockout) · `ui-designer` (title, HUD, timer, pause, end screen, grown-up gate + settings).
- `netlify.toml` builds correctly. First deploy.

**M1. Vertical slice** (playable and fun in 5 minutes)
- The village plaza and Bouncy Park fully dressed; whole-island terrain and landmarks blocked out.
- Player polish: walk, run, jump, flop, respawn. Camera with collision.
- 15 Glow Gems (weak-eye-only) + trampoline + 5-minute timer + end screen + grown-up settings
  + procedural SFX (audio starts here, not in M5: it is half of the "feel").

**M2. Ride things**: 2–3 drivable cars (arcade handling, bouncy collisions) and a rideable horse
(a kinematic "fast character" with a rigged CC0 model if one can be downloaded, else a
procedural horse with a procedural gait; decide within the first 20 minutes of the task).

**M3. Big thrills**: balloon skydive + parachute + landing rings, bungee bridge, launch pads,
Silly Zone.

**M4. Rewards**: chests with both-eye locks, outfits (wearable right away), stunt stars,
the full gem set (about 60), secret paths.

**M5. Polish and ship v1.0**: music, loading screen, quality presets, perf pass, gamepad check,
credits, accessibility pass, final QA audit. Tag `v1.0`.

## Integration contract (how the pieces fit)
- `src/types.ts` defines `GameContext`, `GameSystem` (`init/update/dispose`), `EventBus` events,
  `InputState`, `WorldApi` (height queries, spawn points, named anchors for attractions),
  `VisionApi` (`add(object, VisionLayer)`), `PlayerApi`, `Interactable`, `GameSettings`,
  `SessionState` and `TestApi`. Systems talk only through these.
- `src/main.ts` (orchestrator) creates systems in a fixed order: settings → renderer → physics →
  world → vision → player/vehicles → activities → UI → loop.
- Attraction positions come from `WorldApi.anchors` (world-artist places them, activities-designer
  builds on them), so the two never edit the same file.
- Render order each frame: main scene through the post stack → layer pass (weak/strong objects,
  depth-tested against the main depth) → dichoptic compositor to the canvas → DOM HUD on top.
  The HUD is DOM/CSS (crisp, cheap, both-eye by design: white/yellow on dark with outlines).

## Definition of done (v1.0)
- [ ] Loads at https://red-green-open-world.netlify.app; verify is green in Chromium (the only
      browser in the build container). Only standard WebGL 2 features are used so Edge, Firefox
      and Safari should work; a manual check on those is listed for the user in PROGRESS.md.
- [ ] Every weak-eye object is absent from the strong-channel screenshot and present in the
      weak-channel one, for both lens and eye combinations (automated test).
- [ ] HUD, player and world are readable in R-only and G-only screenshots.
- [ ] Start to playing in ≤ 3 clicks; a full 5-minute session ends on the sticker-book screen.
- [ ] Every attraction in GAME_DESIGN.md works. No violence anywhere (QA audit).
- [ ] `ASSETS.md` is complete; credits screen in game.
- [ ] Performance budgets in CLAUDE.md met (or the gap documented).
