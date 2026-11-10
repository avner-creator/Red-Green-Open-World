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
- Vite + TS + Three + Rapier scaffold, `npm run verify`, Playwright smoke test,
  `npm run shots:channels` (saves full, R-only and G-only screenshots).
- `src/vision`: compositor + eye settings + calibration screen on a simple test scene.
- `netlify.toml` builds correctly. First deploy.

**M1. Vertical slice** (playable and fun in 5 minutes)
- Terrain + HDRI + lighting/post. The village plaza and Bouncy Park are fully dressed.
- Third-person player: walk, run, jump, flop, respawn. Camera with collision.
- 15 Glow Gems (weak-eye-only) + trampoline + 5-minute timer + end screen + grown-up settings.

**M2. Ride things**: 2–3 drivable cars (arcade handling, bouncy collisions) and a rideable horse.

**M3. Big thrills**: balloon skydive + parachute + landing rings, bungee bridge, launch pads,
Silly Zone.

**M4. Rewards**: chests with both-eye locks, outfits (wearable right away), stunt stars,
the full gem set (about 60), secret paths.

**M5. Polish and ship v1.0**: audio (CC0 SFX + music), loading screen, quality presets, perf
pass, gamepad, credits, accessibility pass, final QA audit. Tag `v1.0`.

## Definition of done (v1.0)
- [ ] Loads at https://red-green-open-world.netlify.app in Chrome, Edge, Firefox and Safari
      (desktop); verify is green.
- [ ] Every weak-eye object is absent from the strong-channel screenshot and present in the
      weak-channel one, for both lens and eye combinations (automated test).
- [ ] HUD, player and world are readable in R-only and G-only screenshots.
- [ ] Start to playing in ≤ 3 clicks; a full 5-minute session ends on the sticker-book screen.
- [ ] Every attraction in GAME_DESIGN.md works. No violence anywhere (QA audit).
- [ ] `ASSETS.md` is complete; credits screen in game.
- [ ] Performance budgets in CLAUDE.md met (or the gap documented).
