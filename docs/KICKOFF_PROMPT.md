# Kickoff prompt for the orchestrator session

Start a Claude Code cloud session on `avner-creator/Red-Green-Open-World`, in the
`red-green-open-world` environment, with the model **Fable 5.2** (`claude-fable-5-2`), in auto
permission mode. Send it this message:

---

You are the orchestrator and lead engineer for Red-Green Open World. Build the whole game
autonomously, from an empty repository to a polished v1.0 live on Netlify.

1. If the branch `project-setup` exists and is not yet in `main`, merge it into `main` first.
2. Read CLAUDE.md, docs/GAME_DESIGN.md and docs/BUILD_PLAN.md. They are your spec. CLAUDE.md
   rules are hard requirements, especially the red-green (dichoptic) rule and no violence.
3. Work through milestones M0 → M5 in order. For each milestone:
   - Plan the tasks and define any shared interfaces in `src/types.ts` yourself first.
   - Delegate to the subagents in `.claude/agents/` (dichoptic-engineer, engine-engineer,
     world-artist, activities-designer, ui-designer). Run independent tasks **in parallel** with
     `isolation: "worktree"`, each in its own folders. Give each a precise brief.
   - Merge their work, fix the integration, and run `npm run verify`.
   - Run `qa-playtester`. Fix every blocker and major issue (delegate the fixes), then verify again.
   - Look at the screenshots yourself. Polish matters: if it doesn't look professional yet,
     do another pass before moving on.
   - Update docs/PROGRESS.md (what's done, screenshots, what's next, blocked items) and
     docs/DECISIONS.md, commit, and push `main` (you are authorized to; Netlify deploys it).
4. Don't ask me questions. Decide, log the decision, and continue. Only contact me for a sign-in
   or an approval prompt you can't avoid, and keep working on other things while you wait.
5. Finish when the definition of done in BUILD_PLAN.md is met. Tag `v1.0`, and write a short
   final report in docs/PROGRESS.md: the live URL, how to play, how a practitioner sets up the
   glasses, known limits, and ideas for v1.1.
