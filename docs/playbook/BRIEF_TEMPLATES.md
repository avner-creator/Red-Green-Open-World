# Brief templates

Copy, fill the `<…>` parts, delete what doesn't apply. A worker knows only what the brief says, so
state the goal, the evidence, the boundaries and the checks. Keep the scope narrow.

## 1. Feature worker (build something new)

```
Build <feature> for <game>. Read CLAUDE.md and docs/DIRECTIVES.md first, then <spec file>.

Base: git fetch origin <integration branch> && git checkout -B agent/<area>-<task> origin/<integration branch>
Install: <install command>. Push to agent/<area>-<task> at every working state (plain push, no force).
Port for browser tests: <unique port>. Other jobs running beside you: <who, which folders>.
Your folders: <folders>. Never edit: <shared files>. If you need a change there, put the exact diff in your report.

What the player experiences (in order):
1. <how they find it>  2. <how they learn the rule, without reading if needed>
3. <the round>  4. <how it ends>  5. <the reward>  6. <how they leave>

Must use: <activity kit / guide kit / placement kit>. Site on the map: <reserved site>.
Budgets: <draws / triangles / size>. Core rule to respect: <rule and its test>.

Done means the "Done for a feature" checklist in docs/playbook/CHECKLISTS.md passes.
Play a full round with real key presses before you report, and look at your own screenshots.

Report in under 300 words: branch, head SHA, what works, fun score 1–5 with one sentence why,
what you could not do, checks run and their results, any diff wanted outside your folders.
```

## 2. Fix worker (after QA or owner feedback)

```
Fix round for <game>. Read CLAUDE.md, docs/DIRECTIVES.md, then <QA report> findings <IDs>.
Base / install / push / port / folders: <as above>.

In priority order. For each: reproduce it first with a failing test, then fix it.
1. <finding ID>: <what the player saw, in one or two sentences, with the numbers from the report>.
   <What "fixed" looks like. Any constraint.>
2. …

Do not loosen or skip a test to get green. If a failure is a test problem, show why.
Checks before the report: <typecheck, lint, unit, build, named browser specs>.
Report under 300 words: per item fixed / partly / not fixed, with evidence.
```

## 3. Independent QA play-through

```
QA round <n> for <game>. Read CLAUDE.md, docs/DIRECTIVES.md, the previous QA report and the last
section of docs/PROGRESS.md. Work on <commit>. You find and report; you fix nothing in src/.
You are the only job on the machine. Push the report and scripts every ~20 minutes.

Play like <the audience: age, reading level, device>, not like a test: real key/mouse/touch input,
real time wherever the question is about feel or guidance; test shortcuts only to travel.

Part A: re-check every finding of the previous round: fixed / partly / not fixed, with evidence.
Part B: <list of features not yet played>. For each: could the player tell what to do within 10 s,
        did it end properly, fun 1–5 with one sentence why, anything that stalls more than 15 s.
Part C: audits: <core rule spot checks>, camera inside objects, console errors, text the player
        must read, content rules, both input methods.

Write docs/qa/round<n>.md: tables for A and B, then findings ranked Blocker / Major / Minor, each
with repro steps, suspected owner folder and a screenshot path. State plainly what you did not test.
Final report under 300 words: counts by severity, top five problems, untested list.
```

## 4. Merge or glue job

```
Merge job on <game>. Base: <integration branch at SHA>. Push to agent/merge-<name>.
1. Merge <branch>. Known conflict: <file, and what each side adds; keep both / prefer X>.
2. <small glue items, exact diffs if known>.
3. Checks: <typecheck, lint, unit, build, named browser specs>.
Report under 200 words: head SHA, how each conflict was resolved, check results.
```

## 5. Parallel session on another account (a "stream")

Give the owner one ready-to-paste block per stream, with these lines on top:

```
Repo: <owner/repo>   Model: <model>   Effort: <level>

You are Stream <letter> on <game>. Read CLAUDE.md, docs/DIRECTIVES.md and docs/streams/<name>.md.
Branch: agent/<name> off <integration branch>. You own: <folders>. You never edit: <shared files>.
Goal: <one paragraph, in player terms>.
Phases: 1) <…> 2) <…>. After each phase: run <checks>, push, and report using the format below.
Report format: branch, head SHA, what a player can now do, checks, open items, diffs wanted.
```

## 6. Stream spec file (`docs/streams/<name>.md`)

```
# <Feature>
Player story: <five lines, in order>.
Site: <map coordinates / reserved zone>.  Inputs used: <from the shared input map>.
Kit parts used: <…>.  New shared-interface needs: <events, types>.
Budgets: <…>.  Core-rule notes: <what must never happen>.
Tests that must exist: <full round by key presses; collision sweep; rule test; screenshots>.
Out of scope: <…>.
```

## 7. Daily note to the owner

```
Time to play: <yes, link / not yet, because …>
New since last time: <3–6 bullets in the player's words>
Look at first: <2–3 things you most want their eyes on>
Known broken or unproven: <…>
Only you can check: <devices, audio, a real player>
```

## 8. Turning owner feedback into work

For each sentence of feedback write one row, and don't lose any:

| Owner said | What it means for the player | Owner (worker/area) | Closes when |
|---|---|---|---|
| "<quote>" | <observable problem> | <area> | <test or picture that proves it> |
