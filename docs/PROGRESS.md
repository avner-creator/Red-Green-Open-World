# Progress

## Status
M0 and the M1 vertical slice are on `main`. In progress: car, balloon skydive, both-eye chests, world polish, QA.

## Blocked / needs the user
- The live URL answered HTTP 401 from the build container after Netlify was connected (it was 404 before). If the site has password/visitor protection on, the orchestrator can't check deploys; please confirm it loads for you.

## Log
- Step 0: merged `project-setup` into `main`; reviewed and tightened the plan (see DECISIONS.md).
- M0 scaffold on `main` (verify green on stubs).
- Adopted docs/DIRECTIVES.md (orchestrator no longer writes code; 48 h timeboxes; no health wording).
- M0 merged to `main`: dichoptic compositor + calibration, input/player/camera (RobotExpressive), UI (title, HUD, pause, end screen, gate, settings, credits), gems + trampoline + bounce pads, procedural audio. Verify green: 94 unit, 24 e2e incl. channel separation for all 4 lens/eye combinations with the real gems. World is still the flat stub; the island branch is in progress. Audio has not been listened to yet.
- Island merged (village plaza, Bouncy Park, roads, bridge, 63 gem spots, golden-hour lighting and post). Integration fixes: robot can climb steps on real terrain, pointer-lock pause flake, camera no longer ends up inside walls. Verify green: 105 unit, 25 e2e (1.9 min). Channel shots in the lit world: gems visible in R, absent in G.
