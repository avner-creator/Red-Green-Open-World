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
- Sky is procedural golden hour with a baked environment map (no HDRI download); AO is baked into vertex colours; one soft shadow map follows the camera. Reason: world-artist's call for look per cost; no asset licensing needed.
- `heightAt` uses Rapier's triangle split instead of bilinear. Reason: bilinear was up to 13 cm off the collider.
- E2e boots at Low quality (`?test=1&quality=low`) except smoke, vision and screenshots. Reason: shadows cost ~330 of ~520 ms per frame on the software renderer.
- Next wave scope follows the DIRECTIVES core list: one car, balloon skydive, both-eye chests with 3 outfits; horse, bungee and Silly Zone only if the timeboxes allow.
- Handoff: `docs/HANDOFF.md` is the single entry point for a new session/account; workers push WIP to `agent/<area>-<task>` branches. Reason: usage limits may end this session; nothing may live only in the container.
- Skydive scoring: hoop bonus gems count as `stunt bullseye` (1 star each); touchdown gives 1/2/3 stars for the 12/7/3 m rings; `longGlide` stars at 40/80/140 m; with no input the parachute steers gently toward the rings. Reason: skydive agent's design; keeps the gem system simple.
- Both-eye lock design: the key is weak-eye-only; the keyhole side of the chest and its arrow are strong-eye-only; the chest looks the same from all four sides to both eyes. Reason: needs both eyes without being hard for an 8-year-old.

## Owner playtest feedback, 2026-11-10 (see GAME_DESIGN.md "Fun and motivation pass")
- Gems become a currency with a persistent wallet (localStorage profile), spent on characters, outfits, paints, trails and ride tickets; gems respawn. Reason: owner feedback that gems felt pointless; wanting gems is what makes the weak eye work. Replaces "no saving between sessions".
- Balloon ride costs 5 gems (first ride per session free); rocket pads 3; everything else free. Reason: gives gems a reason without ever locking a child out of fun.
- Character select with skills and backstories; some free, some bought. Reason: owner found the robot unrelatable.
- Trampoline first bounce ~12 m, cap ~45 m, air tricks; bigger pads; rocket pads. Reason: owner wants crazier, sillier thrills.
- Wayfinding: beacons, plaza signpost, HUD compass, pictogram signs. Walk 6.5 / sprint 11 m/s. Controls card on demand. Livelier music.
- Touch/mobile is v2 unless the parallel stream in docs/PARALLEL_WORK.md delivers it. Reason: time.
- World scatter is drawn per species and level of detail, re-picked when the camera moves; grass is generated lazily per cell. Reason: world-artist's performance pass.
- The UI polish agent was stopped after it finished: it kept re-sending its final report.
- Economy, shop and missions (fun pass items 1–4) are built by a second account on branch `agent/economy`; the main session builds the rest and merges it. Reason: owner offered extra capacity; additive-only interface rule keeps the two orchestrators from colliding.
- Spawn yaw is 1.75 (facing the attractions); beacons float 9–12 m near the plaza (18–22 m at the far fields) because the walking camera shows only ~8° above the horizon. Reason: world-artist's visibility test.
- Running jump is ~7.9 m (asked 5–6 m). Reason: matching 5–6 m made the jump too low; owner wants "a little crazy".
- `launchPads` anchor moved to (80, 24) with a fixed landing-net target at (83, −34) inside the park. Reason: tighter attraction hub.
- UI screenshots in e2e are opt-in (`RG_SHOTS=1`, `npm run shots:ui`). Reason: they cost ~2 min per run on the software renderer.

## Stream B — characters (branch `agent/characters`)
- Characters come from Quaternius CC0 packs via the trebeljahr/quaternius-showcase GitHub mirror (pinned commit). Reason: quaternius.com, opengameart.org and jsDelivr are blocked from that cloud session; raw.githubusercontent.com works and the mirror lists every pack as CC0-1.0.
- Cast: robot + four space-suit animals (frog, red panda, bee, flamingo; one shared rig) + a T-rex. Reason: the only fully animated, kid-friendly CC0 characters reachable; no robot re-skins were needed.
- Missing clips (dance, flop, sit, spin, hop, dino wave/fall) are hand-keyed in code with a two-bone leg IK, because these rigs pin the feet to separate root joints.
- Hero objects (buggy, balloon, player, thrills) are batched by material with per-vertex finishes, and cast shadows through low-poly shadow-only proxies on render layer 7 (core enables that layer on the sun's shadow camera). Reason: whole frame at spawn on Medium went from 442 draws / 811k triangles to 198 / 534k with no visible change.
- The balloon burner's point light was replaced by an emissive glow inside the envelope. Reason: per-object lights are expensive; the basket no longer gets warm light during burns.
- Boot loads only the saved character (`CHARACTER_KEY` in `src/config.ts`); music loads after Play. Reason: first-visit download to the title screen is ~2.2 MB gzip.
- Attractions self-register through `src/activities/<folder>/register.ts`, discovered with `import.meta.glob`. Reason: every stream added a line to the same list and conflicted.
- The buggy's handling runs inside each fixed physics step and is drawn interpolated; camera follow is exact at any frame time. Reason: owner saw the car shake on a real display; measured jerk at 90–144 Hz and uneven frame rates dropped from 17–161 to ~0.2.
- The frog (Hopper) is the first-run default hero; the saved hero lives in the profile (`equipped.character`). Reason: owner found the robot unlikeable; one source of truth.
- Chests open from any side with a symbol-ring lock (three both-eye symbols ring the chest; the right one floats above it for the strong eye only); a locked chest says "find the key". Reason: owner found the keyhole-side rule silly and unexplained.
- "Carnival Island" is the in-game setting; Pip, a procedural talking puppy with a synthesized gibberish voice, is the guide. Mini-games use foam, bubbles and water balloons only; the plane ride is a stunt contest, the dragon breathes bubbles. Reason: owner playtest 2; non-violence rule.
- Worktree agents get unique local branch names. Reason: two agents sharing `work` put a chest commit on the Pip branch.
- Pip the puppy buddy is procedural (2 skinned draws + shadow proxy), not a CC0 GLB. Reason: eye tracking, blinks, eyebrows and ear/tail springs need a custom rig, and the CC0 animal packs are realistic-proportioned, not "big head, big eyes".
- Pip's intro is skipped by any NON-game key (Enter, Backspace, letters other than the controls) or a tap on the bubble, not WASD/Space/E. Reason: kids press the move keys at once, which must not skip the tour; the tour never blocks movement.
- In `?test=1` Pip is visible but silent unless `&buddy=1` (talk) or `&buddyIntro=1` (talk + tour). Reason: other specs must not see bubbles or callouts.
- Batch 2 site conflict (carnival boardwalk over the rooftops secret start, foam course over the village vault): the secret pieces move, attractions and sites stay. Reason: secrets live in one folder; attraction coordinates are baked into two streams.
- Batch 2 is held on `integration/m1` (not `main`) until the one red e2e test and the Medium render budget are fixed. Reason: `main` only moves when verify is green, and every view is over budget.
- R releases every ride, including the horse and rocket/trampoline flight (overrides "stay mounted on R"). Reason: one rule kids can rely on.
- Play on the title starts at once with the saved (or default frog) hero; hero select is behind "change hero". Reason: one obvious button for 8-year-olds.
- The orchestrator may `git apply` a diff a worker wrote and tested for files outside that worker's folders. Reason: it is the worker's code; avoids a second agent for a mechanical step.
- Pip must never move toward, look at or point at a weak-eye-only or strong-eye-only object (QA round 3 found his intro walking toward the nearest gem). Removed, not logged as an exception. Reason: it tells the other eye where the object is, which breaks the core rule.
- QA3 fixes: every chest keeps ≥ 3 m from posts (measured from the arm tips), beacons, boards, small props and site circles (unit test). Plaza chest moved to the inner ring north-east of the fountain. Reason: the lock symbol must never overlap a sign.
- `stamp:earned { id }` is emitted by attractions with a clear "round done" point (carnival, race, scoops, foam, bubble ball, dino sumo, rocket landing, chest); those ids stamp only on completion. Other slots keep the ticket/stunt/mode/glasses derivation. Reason: one explicit event where a clean emit point exists, no regressions elsewhere.
- The first rocket-pad launch is free, like every attraction's first play. Reason: consistent "first go is free" rule.
- HUD picture bubbles on desktop live on the pause screen ("?" legend); while playing the pointer is locked. Tap (touch) and free-pointer hover still show the bubble. Reason: a locked pointer cannot hover or click HUD chips.
- Secrets arrow trails: when the straight road→key line has no room (fewer than 3 arrows: cliff edge, water, a wall), the trail is laid from the nearest direction turned ±30°…180°. Reason: trails follow wherever chests and keys move (the lighthouse key sat on the north path's cliff edge).
- Glasses stepping-stone trails go to the two sites nearest spawn, computed from `FIXED_SITES` (now odd one out and dot signs). Reason: follows site moves automatically.
- E2e checks of short-lived UI (toasts, HUD moments) read the DOM in the same `page.evaluate` that raised them; Pip bubbles in tests come from `__rgBuddy.ask()` (same path as T / tapping Pip). Reason: no real-time races on a busy machine.
- Pip speaks real words: pre-rendered Kokoro-82M (Apache-2.0, voice af_heart) MP3 clips per fixed line, pitched up for a puppy; dynamic lines fall back to on-device Web Speech (localService voices only), then animalese. Reason: Piper voices and Hugging Face are unreachable from the container; Kokoro weights come pinned from npm, best quality with a clean licence.
- Pip's "Now find the keyhole side" line and clip removed: chests open from any side (symbol ring), so it was unreachable except as a fallback, which now says "Step on the right shape!".
- Phase 3 (glasses booth kit) promoted to `main` on Stream P's own green `npm run verify` (a3b503e: 1267 unit, 327 e2e), without a second run here. Reason: checked with git that the verified commit contains main's verified code (5a0089c), that Phase 3 touches `src/` only under `src/activities/glasses/`, and that everything after a3b503e is docs; this machine had four agents running, where a full verify gives false failures.
