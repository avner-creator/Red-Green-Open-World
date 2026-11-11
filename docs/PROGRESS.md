# Progress

## Status
The fun and motivation pass is on `main` (economy, heroes, thrills, wayfinding, first attractions). In progress: the Carnival Island pass (owner playtest 2): Pip the buddy, chest redesign, mini-games, world dressing, red-green depth pass.

## Blocked / needs the user
- Nothing blocking. Useful when you have a moment: listen to the audio, try real glasses + calibration, and open the site in Edge/Firefox/Safari.

## Log
- Step 0: merged `project-setup` into `main`; reviewed and tightened the plan (see DECISIONS.md).
- M0 scaffold on `main` (verify green on stubs).
- Adopted docs/DIRECTIVES.md (orchestrator no longer writes code; 48 h timeboxes; no health wording).
- M0 merged to `main`: dichoptic compositor + calibration, input/player/camera (RobotExpressive), UI (title, HUD, pause, end screen, gate, settings, credits), gems + trampoline + bounce pads, procedural audio. Verify green: 94 unit, 24 e2e incl. channel separation for all 4 lens/eye combinations with the real gems. World is still the flat stub; the island branch is in progress. Audio has not been listened to yet.
- Island merged (village plaza, Bouncy Park, roads, bridge, 63 gem spots, golden-hour lighting and post). Integration fixes: robot can climb steps on real terrain, pointer-lock pause flake, camera no longer ends up inside walls. Verify green: 105 unit, 25 e2e (1.9 min). Channel shots in the lit world: gems visible in R, absent in G.
- Live site confirmed loading (HTTP 200, session starts in headless Chromium against the Netlify URL).
- Both-eye chests + 6 outfits + trampoline walk-on bounce on `main` (31 e2e green). QA round 1: no blockers; majors assigned (tutorial size, world dressing outside plaza/park, camera at ranch/bridge anchors).
- UI polish, buggy, world polish 2 (garage, balloon field, landing field, roads; Medium 414k triangles at spawn), balloon skydive and adaptive CC0 music merged to `main` (166 unit, 42 e2e). Owner playtest feedback turned into the fun and motivation pass (GAME_DESIGN.md); streams A–F briefed for a second account (PARALLEL_WORK.md).
- Fun pass, main-session share on `main` (233 unit, 54 e2e): faster movement, giant trampoline with air tricks, bigger pads, rocket pads + net, wayfinding (beacons, fingerpost, waymarks, how-to boards, HUD compass, controls card), assisted parachute, freefall camera. Open follow-ups: fingerpost arms out of frame at spawn, compass icon overlap, skydive haze, draw calls, accidental flip on the mat.
- On `main` (71 e2e): touch/mobile controls (stream A), six CC0 characters (stream B) wired with skills, emotes and a character-select onboarding, UI/thrills/world fix rounds. Known: whole-frame draw calls over budget (perf task running); locked characters can't be bought until the economy stream lands; touch and audio untested on real devices.
- Batch 1 on `main` (494 unit, 129 e2e): economy (stream C), bungee + Silly Zone (E), secret paths (F), horse (D), Scoops ice-cream (K), car-shake fix (fixed-step handling + interpolation; jerk at 144 Hz 161 → 0.22), `register.ts` auto-discovery. QA round 2: red-green core good; blockers were triangle budget (fixed on `agent/world-budget`) and locked heroes (fixed by the economy merge).

## Batch 2 merged to `integration/m1` (2026-11-12 ~00:45 UTC)
- On `integration/m1` (3b89245): Pip, symbol-lock chests, boot/loading, living island, outer island, bumper arena, carnival games, foam lava, sky rides, buggy race, attraction sites, shared glue (ticket API, move modifiers, ride-release tests). 708/708 unit, 177/178 e2e.
- Not on `main` yet. In flight, all branched from `integration/m1`:
  - `agent/secrets-resite`: move the rooftops secret start and village vault off the new sites; batch secrets' draws.
  - `agent/perf-budget2`: Medium is over budget in every view (275–424 draws, up to 683k triangles); batching and LOD for attractions.
  - `agent/e2e-speed`: e2e suite 12–16 min → target ≤ 8.
- Waiting: Stream P (`agent/glasses-depth`) Phase 1 "ready to merge" from the owner.
- Open minor defects: Pip's bubble overlaps combo/stars badges at 667×375 touch; rocket pads block a child with 0 gems; carnival free play is per attraction, not per booth; site screenshots not yet checked by eye.
- Stream P Phase 1 (`agent/glasses-depth`, six weaker-eye mini-games, toolkit, Auto challenge, grown-up summary) merged cleanly into `integration/m1` (5af46a3): typecheck, lint, 878 unit tests green; full e2e runs with the three fix branches. Follow-up queued for the world owner after `agent/perf-budget2`: beacons, signpost arms and compass entries for the six mini-game sites, and move at least two more within ~55 m of spawn.

## Batch 2 + Stream P Phase 1 on `main` (2026-11-12 ~03:00 UTC)
- `npm run verify` green on 438b801: 882 unit, 229 e2e passed, 3 skipped (31.5 min under load).
- Now on `main`: everything listed under "Batch 2", six weaker-eye mini-games with toolkit / Auto challenge / grown-up summary, secrets re-sited and batched (≤ 12 draws), far-distance culling for attractions, cleared mini-game sites with first wayfinding.
- Still in flight: `agent/world-finish` (rest of mini-game wayfinding, Low render budget, re-measure Medium), `agent/e2e-speed` (suite time). Stream P Phase 2 continues on `agent/glasses-depth`.

## Clarity pass on `main` (2026-11-12 ~05:15 UTC)
- `npm run verify` green on 110570a: 888 unit, 238 e2e passed, 3 skipped (16 min on a quiet machine).
- Added since the previous push: wayfinding for the six weaker-eye mini-games (beacons, pictograms, third plaza post, compass, two stone trails); Medium and Low render budgets met in every perf-report view; e2e starts frozen and runs 3 workers; Pip knows the mini-games; frog hat position fix; closer balloon-top framing; trampoline step rings all round; rocket pads allow a practice launch at 0 gems; new start screen, Fun Pass stamp card (replaces mission cards), HUD explain bubbles, help on H/F1.
- Lesson: full verify under agent load (load average 20–30) gives false failures (timeouts, renderer crashes). Run the promoting verify only when no worker is running e2e.
- Open: rocket first launch is still paid; `stamp:earned` event wanted on the EventBus (stamps are derived from other events); Pip's bubble unverified by eye at desktop sizes; Low spawn sits exactly at 130 draws; weak-eye layer objects have no distance cut-off; QA round 3 not yet run; nobody has checked the new sites/screens by eye beyond the workers' own screenshots.

## QA round 3 on 7cda79b (2026-11-12 ~05:45 UTC)
- No blockers. Red-green rule exact in all four lens/eye combinations at three mini-games and a chest. Report: `docs/qa/round3.md` on `agent/qa3`.
- Majors, assigned: camera inside trees/props (`agent/camera-clear`); Pip does not guide a non-reader and walked toward a gem (`agent/pip-guide`); plaza chest against a fingerpost plus ten minor world/economy/UI items (`agent/qa3-fixes`).
- QA did not check: a full round of each attraction and mini-game, rocket pads at 0 gems, HUD explain bubbles (none appeared on click), frame time, audio, real glasses, gamepad, touch.

## Owner playtest 3 and batch 3 (2026-11-12 ~06:40 UTC)
- Owner feedback: Pip must speak real words in a cute voice (non-readers); bubble soccer and "the wobbly one" (taken as dino sumo) underwhelming; hero walks through the soccer ball; wants more QA.
- In flight: `agent/pip-voice` (spoken lines: pre-rendered clips, Web Speech fallback), `agent/arena-fun` (ball pass-through bug + fun pass on bubble soccer and dino sumo), `agent/integrate-m3` (four red e2e on integration b9cc7ef: secrets key-2 trail after chest moves, glasses-challenge framing after camera collision, buddy-hud bubble trigger, shop deny toast timing; then merge `agent/boot-loads` and Stream P Phase 2 `agent/glasses-depth` cd07540).
- `main` is at 9cd3e3d (game code = 7cda79b). Not yet on `main`: Pip guide, QA3 fixes, camera collision.
- Next: play-through QA of a full round of every attraction and mini-game once batch 3 is green.

## Batch 3 on `main` (2026-11-12 ~10:00 UTC)
- `npm run verify` green on 02a3fc7: 1068 unit, 273 e2e passed, 4 skipped (21 min).
- Now on `main`: Pip speaks real words (145 clips, Kokoro-82M Apache-2.0, owner approved the voice), Pip leads and rescues, camera collision with static-scenery occluders (`userData.cameraIgnore` / `userData.cameraOccluder`), bubble soccer solid ball + dash kick, dino sumo belly charge, QA3 fixes, Stream P Phase 2 (six optional weak-eye layers, result reports from 16 twists).
- Lesson: a 50% failure of the core channel test was streamed Scoops models attaching between two captures of a frozen frame, not a leak. Models must attach on a simulation step. Same pattern still exists in carnival, bubbleball, foamlava, skyrides, race (wanted: loop-gated attach in `src/core/characters/load.ts`).
- Owner playtest on a phone: "overall okay", Pip's text bubbles "kept glitching" (on the previous build; recheck).
- Open: Low is 5 draws over at the Gear Shack; camera squeezed in 1.7 m village gaps and in canopies while driving; dino sumo likely too easy; toys mini-game has no trail; full-round play-through QA of every attraction (in flight as `agent/qa4-*`).

## Owner playtest 4 on 8d371ca (2026-11-12 ~10:45 UTC)
- Feedback: game "pauses randomly"; wardrobe doesn't feel like a wardrobe (wants cool goofy hats, reachable early, start screen looks lame); Pip's "Wowie"/"Good job"/mega-gem lines too repetitive; no storyline or explanation of what to do, where to go, or how each game works (wants Pip to tell it by voice); text bubbles pop up too often and aren't needed when he talks; unclear what gems/tokens/keys do; "floppy people" game unclear (taken as Silly Zone tube people — to confirm); "bank safe" (vault doors) unclear; arches near the beach (gates mini-game) unclear; wants random, wobbly physics (trampoline is just up and down); wants a radio to switch songs; expected warmer-looking characters, more characters open, funky costumes on the start screen; Pip's size: unsure. Voice approved as is.
- In flight: `agent/pip-story` (spoken welcome story, how-to at every attraction, economy explained, varied praise, compact bubbles), `agent/wardrobe` (dressing room anywhere, 30+ goofy items, early free items, start-screen costumes), `agent/pause-wobble` (random pause/hitch hunt, wobbly hero and surprising trampoline), `agent/radio` (stations), `agent/heroes-warm` (warmer heroes, 4+ new, 5 free, new hero select). QA round 4 parts A/B/C on `agent/qa4-a|b|c`.
- Still to assign after QA 4: vault door clarity, Silly Zone purpose, gates mini-game clarity.
- Second account streams started 2026-11-12 ~11:30 UTC (owner pasted the prompts): P Phase 3 `agent/glasses-depth` (six mini-games self-explanatory, gates first), Q `agent/foam-sky` (foam course + sky rides: play, fix, fun pass), R `agent/world-fill` (survey, fill empty space, paths, signposts, map board; owns `src/world/` — no worker in this session edits `src/world/` while R runs; route world requests to R), S `agent/secrets-clear` (vault, chests, secret paths clarity). Merge each when its owner reports verify green.
- Also in flight here since the last entry: `agent/silly-balloon` (Silly Zone becomes a game; balloon is obviously a ride, auto-board), `agent/games-tune` (dino sumo length, soccer camera/scoring, carnival difficulty, honest prizes, Scoops topple). QA 4-B done (half played; `docs/qa/round4-b.md` on `agent/qa4-b`); 4-A and 4-C running.
