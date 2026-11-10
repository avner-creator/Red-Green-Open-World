# Decisions

- Engine: Three.js + TypeScript + Vite (not Unreal/Godot). The game must run on Netlify in the browser, and agents can build and test web code entirely in the cloud container (headless WebGL 2 works there). Unreal's binary assets and size make autonomous agent work impractical.
- Art: polished stylized-realistic from consistent CC0 assets instead of photoreal. It is achievable without custom art, and through red/green lenses shape and lighting matter more than hue.
- Weak-eye rendering: a compositor that changes only the weak-eye color channel under a mask. The strong eye literally receives the same pixels as if the object weren't there.

## Step 0 plan review (orchestrator)
- Procedural-first world (code-built geometry + one HDRI + a few CC0 models) instead of a big downloaded asset set. Reason: asset hosts are the biggest schedule risk; one consistent look; tiny download.
- Player is the CC0 RobotExpressive robot (Quaternius, via three.js examples on jsDelivr). Reason: the only verified-reachable, CC0, fully animated, kid-friendly character.
- "Ragdoll flop" is an animated comic tumble, not a physics ragdoll. Reason: cheaper, never glitches into something that looks like injury.
- Horse is a kinematic "fast character", rigged CC0 model if downloadable in 20 min, else procedural. Reason: the horse was the top engine risk; this caps it.
- Dichoptic compositor works on display-referred sRGB values as the very last pass; layer objects are depth-tested against the world; strong-eye-only is the mirrored pipeline; no bloom/particles outside the layer for weak-eye objects. Reason: closes leaks the original rule left open.
- Crosstalk slider limits the weak-channel delta rather than compensating in the strong channel. Reason: the strong channel must never change.
- Channel-separation tests run in Playwright with a `?test=1` `window.__rg` hook (frozen frame, with/without layer). Reason: needs real WebGL; Vitest can't do it.
- HUD/menus are DOM/CSS. Reason: crisp, fast to build, trivially both-eye readable, and never passes through the compositor.
- Audio is procedural WebAudio and starts in M1, not M5. Reason: no licensing, no download, and feel needs sound early.
- Gamepad support is in the input layer from M0. Reason: retrofitting input is costly.
- Balloon rises to 180 m in ~10 s (was 300 m). Reason: a 5-minute session can't spend a minute on a ride; parachute auto-opens at 40 m so nobody crashes.
- M0 runs four agents in parallel after the orchestrator writes the scaffold and `src/types.ts`. Reason: speed; interfaces first prevents merge pain.
- Vite output goes to `dist/build/` and only that path is cached immutable. Reason: `public/assets/*` files aren't hashed, so the original immutable header would have served stale assets.
- Initial download budget tightened to 15 MB (hard cap 40 MB). Reason: procedural-first makes it easy, and practices often have slow Wi-Fi.
- Cross-browser DoD: automated on Chromium only; Edge/Firefox/Safari are a manual check for the user. Reason: only Chromium exists in the build container.
- Touch/mobile controls are out of scope for v1.0. Reason: red-green therapy use is on a monitor with keyboard/gamepad.

## Directives adopted mid-M0 (docs/DIRECTIVES.md, commit d161c4a, pushed to `main` from another session)
- From this point the orchestrator writes no code; the M0 scaffold it had already written stays, and all further scaffold/glue changes go to the `integrator` agent. Reason: DIRECTIVES §1.
- Removed the "eye care professional" line from the running UI and calibration briefs. Reason: DIRECTIVES §4 (no health wording at all).
- World-artist told to spend polish on the compact core (plaza, Bouncy Park, garage, balloon field, roads) and keep bridge/ranch/lighthouse/lake/silly zone as tidy blockouts. Reason: DIRECTIVES §3 (AAA look over breadth; cut order).
- M0 workers stay as in-session worktree subagents (already running); child cloud sessions will be used for the big M2+ streams. Reason: restarting would lose work.
- Player feel tuning lives in `src/core/tuning.ts`; flop is procedural and the model's "Death"/"Punch" clips are never used. Reason: non-violence and one place to tune feel.
- `CameraApi.yaw` is the camera's look direction; forward is (sin yaw, cos yaw), the same convention as `player.yaw`. Reason: one convention for every system.
- The player's safe respawn spot is saved only where `world.isLand()` is true, so the world must return false for water and outside the island.
- Vision channel tests compare WebGL canvas readbacks, not page screenshots. Reason: page screenshots include DOM animation (title fade, tutorial key caps), which caused false strong-channel differences; the canvas is the compositor's real output.
- `TestApi.step(dt, n, render = true)`: `render=false` steps the simulation without drawing. Reason: e2e speed on the software renderer.
- The calibration "weak strength" slider also scales StrongOnly objects. Reason: one strength control for all layer objects keeps calibration simple.
- Unverified merges go to an `integration/*` branch and are pushed there; `main` only moves when verify is green. Reason: Netlify deploys `main`.
