# User directives: highest priority (these override every other doc)

Set by the project owner on 2026-11-10. If anything in CLAUDE.md, BUILD_PLAN.md, GAME_DESIGN.md
or an agent brief conflicts with this file, this file wins.

## 1. Fable 5.2 is the orchestrator only

- The orchestrator (the Fable 5.2 main session) **plans, briefs, reviews, decides and merges.
  It writes no game code, tests, shaders or assets itself.** Every piece of implementation work,
  including the scaffold, `src/types.ts`, `src/main.ts`, integration fixes, merge-conflict
  resolution and bug fixes, is done by workers on **Opus 5.5 or Sonnet 5.5**.
- The orchestrator may: read files and screenshots, run git (fetch, merge, push, tag) and
  `npm run verify`, edit the docs (`docs/*.md`, `CLAUDE.md`, `.claude/agents/*.md`), and
  start, message and monitor workers.
- Workers are **never** on Fable:
  - Subagents (Agent tool): use the named agents in `.claude/agents/` (their frontmatter sets Opus
    or Sonnet), or `general-purpose` with `model: "opus"` or `model: "sonnet"`. Never pass
    `model: "fable"`, never omit `model` on `general-purpose`, and never use
    `subagent_type: "fork"`.
  - Child cloud sessions (if the `create_session` tool is available): always pass
    `model: "claude-opus-5-5"` or `model: "claude-sonnet-5-5"`, the same environment
    (`red-green-open-world`), `permission_mode: "auto"`, the repo, and a complete standalone brief.
    Each pushes to its own branch `agent/<area>-<task>`. Never create a child session without an
    explicit non-Fable model.
- Model choice: **Opus** for the hard or visual work (vision/dichoptic, engine/physics, world art
  and lighting, integration). **Sonnet** for well-specified work (UI, activities from a clear
  brief, QA, tests, asset fetching and compression).

## 2. Maximum speed: target a finished demo within 48 hours

- Maximize parallelism. Run all independent workers at once. **Child cloud sessions are
  preferred for big parallel streams** because each has its own machine (the orchestrator's
  container has only 4 CPUs, so many local builds and browsers contend). Use in-session
  subagents for short tasks, reviews and QA.
- Never leave workers idle waiting on the orchestrator. Brief the next task as soon as one lands.
- Timeboxes (from the start of the build):
  - **H+6**: M0 live on Netlify (scaffold, vision core, calibration, basic world, player).
  - **H+18**: vertical slice live (fully dressed area, gems, trampoline, timer, end screen,
    sound).
  - **H+36**: feature-complete for the chosen scope.
  - **H+48**: polished v1.0 tagged and live.
- If a timebox is at risk, **cut scope instead of slipping**. Log the cut in DECISIONS.md.

## 3. Scope can shrink; quality and red-green cannot

- This is a **demo of a concept**, so it can be smaller, shorter or have fewer activities.
- Non-negotiable:
  1. It must **look and feel like a AAA game**: lighting, materials, post-processing, camera,
     animation, game feel, sound and UI polish. Procedural assets are fine only if the result
     looks AAA. Judge every milestone's screenshots against that bar, and spend polish effort
     on the areas the player actually sees.
  2. The **red-green system must be complete and excellent**: weak-eye-only objects, both-eye
     locks, lens and eye settings, calibration, and strong-eye contrast, with automated channel
     tests for all 4 lens/eye combinations.
- Cut order if needed (cut from the bottom first): Silly Zone → bungee → horse → extra cars →
  secret paths → outfits beyond 3 → lake extras. Keep the following as the core: one compact,
  gorgeous area, player, trampoline, one car, balloon skydive (if it fits the timeline), Glow
  Gems, both-eye chests, the 5-minute loop and grown-up settings.

## 4. Not a health app

This is a concept demo, not a medical or health product. Use no medical or therapy wording in
the game: no claims, no disclaimers, no "patient" language. In-game it's simply a red-green
glasses adventure.

## 5. Netlify

Connected. The site `red-green-open-world` (team Specialty Vision) deploys `main` to
https://red-green-open-world.netlify.app. Every push to `main` deploys. Check the live URL after
each milestone.
