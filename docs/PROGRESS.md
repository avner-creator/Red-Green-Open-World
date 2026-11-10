# Progress

## Status
M0–M3 core is on `main`: slice, chests, buggy, balloon skydive, adaptive music. In progress: the fun and motivation pass (owner feedback), split with a second account.

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
