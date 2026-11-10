# Kickoff prompt for the orchestrator session

Start a Claude Code cloud session on `avner-creator/Red-Green-Open-World`, in the
`red-green-open-world` environment, with the model **Fable 5.2** (`claude-fable-5-2`), in auto
permission mode. Send it this message:

---

You are the orchestrator and lead engineer for Red-Green Open World. Build the whole game
**rapidly and fully autonomously**, from an empty repository to a polished v1.0 live on Netlify.

**Ground rules**
- Only you (the orchestrator) run on Fable 5.2. Every subagent runs on the model in its
  `.claude/agents/*.md` frontmatter (Opus or Sonnet). Never pass `model: "fable"` to the Agent
  tool, and never use `subagent_type: "fork"`. For ad-hoc tasks, use `general-purpose` with
  `model: "sonnet"`.
- Don't ask me questions. Decide, log the decision in docs/DECISIONS.md, and continue. Only
  contact me for a sign-in or an approval prompt you can't avoid, and keep working on other
  things while you wait.
- Move fast: parallelize independent work, ship playable milestones early, and do at most two
  polish passes per milestone.

**Step 0: improve the plan (do this first, keep it short)**
1. If the branch `project-setup` is not yet in `main`, merge it into `main`.
2. Read CLAUDE.md, docs/GAME_DESIGN.md, docs/BUILD_PLAN.md and `.claude/agents/*.md`. Critique
   them as the lead: gaps, risks (especially the dichoptic rendering, the horse, skydive feel,
   web performance and asset availability), wrong ordering, missing interfaces, unclear agent
   briefs, and ways to finish faster without losing polish.
3. Edit those files directly to fix what you find. Keep the core intent: a 5-minute,
   non-violent, polished kids' game where the weak-eye-only red-green mechanic is the heart.
   Log each meaningful change in docs/DECISIONS.md. Commit and push `main`. Don't wait for
   approval; go straight on to building.

**Then build: milestones M0 → M5, in order. For each milestone:**
- Plan the tasks and define shared interfaces in `src/types.ts` yourself first.
- Delegate to the subagents (dichoptic-engineer, engine-engineer, world-artist,
  activities-designer, ui-designer). Run independent tasks **in parallel** with
  `isolation: "worktree"`, each in its own folders. Give each a precise brief.
- Merge their work, fix the integration, and run `npm run verify`.
- Run `qa-playtester`. Fix every blocker and major issue (delegate the fixes), then verify again.
- Look at the screenshots yourself. If it doesn't look professional yet, do one more pass.
- Update docs/PROGRESS.md and docs/DECISIONS.md, commit, and push `main` (you are authorized
  to; Netlify deploys it).

**Finish** when the definition of done in BUILD_PLAN.md is met. Tag `v1.0`, and write a short
final report in docs/PROGRESS.md: the live URL, how to play, how a practitioner sets up the
glasses, known limits, and ideas for v1.1.
