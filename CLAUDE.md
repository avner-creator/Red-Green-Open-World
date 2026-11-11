# Red-Green Open World — instructions for every agent

A short (about 5 minutes), polished, **non-violent** 3D open-world browser game for kids aged 8–13.
Players wear **red-green glasses**, as used in vision therapy. The game is built so that the
fun stuff (gems, treasures, secret paths) is visible **only to the weaker eye**. That pushes the
weaker eye to work.

**Read `docs/DIRECTIVES.md` first: the user's directives override everything below.**
Then read `docs/GAME_DESIGN.md` (what we build) and `docs/BUILD_PLAN.md` (milestones, agent ownership)
before you start. Progress is logged in `docs/PROGRESS.md`; decisions in `docs/DECISIONS.md`.
Picking the project up in a new session? Start with `docs/HANDOFF.md`.

## Autonomy rules (the user asked for these explicitly)

- **Work fully autonomously.** Don't stop to ask the user for design or technical choices. Pick the
  sensible option, write it in `docs/DECISIONS.md` (one line: decision + reason), and continue.
- Contact the user **only** for things they alone can do: signing in to a service (e.g. Netlify),
  approving a network or credential prompt, or a paid/licensed download. Batch these requests,
  and keep working on everything else while you wait.
- Don't fake progress. If something is blocked, log it in `docs/PROGRESS.md` under "Blocked"
  and move on to unblocked work.
- **Speed matters.** Ship a playable build early and improve it in milestones. Run independent
  work in parallel. Don't gold-plate: at most two polish passes per milestone, then move on.
- **Models:** only the orchestrator runs on Fable 5.2, and it writes no code (see
  DIRECTIVES.md). All implementation is done by Opus 5.5 or Sonnet 5.5 workers: named subagents,
  `general-purpose` with an explicit `model: "opus"`/`"sonnet"`, or child cloud sessions with
  `claude-opus-5-5`/`claude-sonnet-5-5`. Never `model: "fable"`, never `subagent_type: "fork"`.
- The user authorized the orchestrator to merge into `main` and push. Netlify deploys `main` to
  https://red-green-open-world.netlify.app. Only push `main` when `npm run verify` passes.

## Tech stack (fixed; don't switch without a logged reason)

- **Three.js + TypeScript + Vite**, static site deployed to **Netlify** (`netlify.toml`).
- Physics: **Rapier** (`@dimforge/rapier3d-compat`). Post-processing: pmndrs `postprocessing`
  (or three's EffectComposer). The dichoptic compositor must stay the **last** pass.
- Assets: **procedural first** (geometry and materials built in code: terrain, buildings, trees,
  cars, props), plus a small set of CC0 glTF/GLB models and a Poly Haven HDRI. Downloaded models
  are compressed with `@gltf-transform/cli` (meshopt + WebP textures).
- Audio: **procedural WebAudio** SFX and a simple generative music loop (no audio files needed).
- Tests: **Vitest** (unit) + **Playwright** (e2e, screenshots). Chromium is pre-installed in the
  cloud container; launch it with `--use-angle=swiftshader --enable-unsafe-swiftshader` for
  WebGL 2. Never run `playwright install`.
- `npm run verify` = typecheck + lint + unit tests + build + Playwright e2e (`tests/e2e`: page
  loads, no console errors, a frame renders, channel separation, screenshot saved to
  `test-results/`). It must stay green. E2e runs at 640×360 against `vite preview` because the
  software renderer is slow; keep the whole e2e suite under ~3 minutes.
- No backend, no accounts, no multiplayer, no analytics, no ads, no external network calls at
  runtime except loading our own static files.

## The red-green (dichoptic) rule: the core of the product

- Settings: **which lens is on the left eye** (red or green; default red-left) and **which eye is
  weaker** (left or right). From these, derive `weakChannel` (R or G) and `strongChannel`.
  The eye behind the red lens sees roughly the R channel; the eye behind the green lens sees G.
- **Weak-eye-only objects** (gems, clues, secret paths) must be invisible to the strong eye.
  Required architecture (owned by `src/vision/`):
  1. Render the scene **without** weak-eye objects → color `C` (tone-mapped, final).
  2. Render weak-eye objects to a separate target → their shading `L` and a coverage mask `M`.
  3. Final pass: `out = C`; `out[weakChannel] = mix(C[weakChannel], f(L, C[weakChannel]), M * strength)`.
     **Never** change `strongChannel` or blue for masked pixels. Pick `f` so the object stays
     clearly visible: brighten where the background is dark, darken where it's bright.
     The pass works on **display-referred (sRGB-encoded) values**, after tone mapping, bloom, AO
     and anti-aliasing, and writes straight to the canvas. Nothing may run after it.
  4. Weak-eye objects don't cast shadows, don't occlude, and don't show in reflections. They
     **are hidden by the world** (the layer pass depth-tests against the main scene's depth), so a
     gem behind a wall is hidden for both eyes.
  5. **Strong-eye-only objects** (chest locks) use the same pipeline mirrored: they change only
     `strongChannel`. One `VisionLayer` enum: `Both | WeakOnly | StrongOnly`.
  6. No bloom, glow sprite, particle, shadow, HUD marker or sound-independent visual may reveal
     a weak-eye object to the strong eye. Effects for weak-eye objects are drawn *on the layer*.
     (Audio cues such as the proximity chime are fine and encouraged.)
  7. Test hooks: `?test=1` enables `window.__rg` (see `src/types.ts` `TestApi`): freeze time,
     teleport, set eye settings, toggle layers, skip the timer. The Playwright channel-separation
     test renders the same frozen frame with and without layer objects and compares pixels.
- **Both-eye objects**: the world, the player, the HUD, menus. They must read clearly in **both**
  the R and G channels alone. Never use hue as the only cue. Test by viewing the R-only and
  G-only channel screenshots (`npm run shots:channels`).
- **Calibration screen** (reached from settings): test patterns plus sliders for weak-channel
  strength and crosstalk, so the strong eye sees nothing with real glasses on a real monitor.
  "Crosstalk" = how much of the weak channel leaks through the strong eye's lens. We can't
  cancel it by touching the strong channel, so the slider **limits the weak-channel delta**
  (max |f − C|) until the leak is below what the strong eye notices.
- **Strong-eye contrast** slider (optional dichoptic rebalancing): scales strong-channel contrast
  down, 100% → 40%.
- **Both-eye locks**: some rewards need both eyes, e.g. a chest's key is weak-eye-only and its
  lock is strong-eye-only. This encourages the two eyes to work together.
- Settings are behind a **grown-up gate** (hold a key for 3 s, or simple math) and saved in
  `localStorage` (wrapped in try/catch).
- Not a health app: no medical or therapy wording, claims or disclaimers anywhere in the game.

## Content rules

- **No violence**: no weapons, fighting, killing, blood, injury or crashes that hurt anyone.
  Crashes are bouncy and comic. Falls end in a silly ragdoll flop and a quick respawn. NPCs and
  animals are friendly. Cars bump people and animals gently out of the way (or there are no
  pedestrians on roads).
- Ages 8–13: big readable icons, minimal text (8-year-olds), but with "cool" factor (13-year-olds).
  No reading needed to play. Controls: WASD/arrows + mouse, Space jump, E use/enter/mount,
  Shift sprint, R respawn; full gamepad support.
- Original content only. No real brands or car logos. Never use or imitate assets, characters,
  names or maps from GTA, Red Dead Redemption, Goat Simulator or any other game. "Silly physics
  sandbox" is a mechanic we may use; their content is not.

## Assets and licensing

- Prefer **CC0** (Poly Haven, ambientCG, Quaternius). CC-BY is allowed only with an entry in
  `ASSETS.md` and the in-game credits. Never use NC, ND, "editorial", ripped or unclear-license
  assets.
- Every file in `public/assets/` gets an `ASSETS.md` row: file, source URL, author, license.
- Reachable from the cloud container: api/dl/cdn.polyhaven.com, ambientcg.com, quaternius.com,
  opengameart.org (check each item's license), cdn.jsdelivr.net (npm and `/gh/` GitHub files),
  raw.githubusercontent.com, and the npm registry. kenney.nl and poly.pizza block automated
  downloads, so don't use them.
- Vite emits hashed files to `dist/build/` (immutable cache). `public/assets/` files are not
  hashed, so they get a short cache (see `netlify.toml`).
- Budget: initial download ≤ 15 MB compressed (hard limit 40 MB), more streamed in as needed. 60 fps on a mid-range
  laptop at "High", playable at 30 fps on integrated graphics at "Low".

## Working in a worktree (every subagent)

- Run `npm ci --prefer-offline --no-audit --no-fund` first. Work only in your own folders.
- **Never edit** `src/types.ts`, `src/main.ts`, `src/config.ts`, `package.json` or another
  agent's folder. If you need a change there, say so in your final report (exact diff wanted).
  Code against the interfaces in `src/types.ts`; get other systems through `GameContext`.
- **Commit your work on your worktree branch** before you finish (small clear commits), and put
  the branch name in your report. Uncommitted work is lost.
- **Commit and push work in progress often** (at least every ~20 minutes and at every working
  state): `git push origin HEAD:refs/heads/agent/<area>-<task>` (no force; add new commits instead of rewriting) with the branch name from your
  brief. The session can end at any time; pushed WIP is what lets another session continue.
- Run `npm run verify` before finishing. If it fails because of code outside your folders, say so.
- Look at your own screenshots (Read the PNG) before you report. Keep the report under 300 words.

## Code conventions

- `src/core` engine loop, input, physics, player, camera, vehicles, horse · `src/vision` dichoptic
  compositor, calibration, eye settings · `src/world` map, terrain, lighting, sky, asset loading ·
  `src/activities` trampoline, skydive, bungee, launch pads, collectibles · `src/ui` menus, HUD,
  timer, end screen, settings, credits · `tests/` unit + e2e.
- **Attractions register themselves**: every folder under `src/activities/` has a `register.ts`
  (`export default (ctx) => GameSystem`, plus a numeric `order`: rides 10–99, pickups 100–199,
  gear 200+). `src/activities/index.ts` discovers them with `import.meta.glob`; never add
  registration lines to `index.ts`.
- Worktree agents: use the unique local branch name given in your brief, never a shared name such
  as `work`.
- Strict TypeScript, no `any` without a comment. Small modules. Constants in `src/config.ts`.
- Camera collision only treats static world scenery as obstacles. Set `userData.cameraIgnore = true` on a mesh to opt out and `userData.cameraOccluder = true` to opt in. Layer objects and anything that moves must never affect the camera.
- Downloaded models are added to the scene on a simulation step (in `update()`), never inside a promise callback, so a frozen frame stays identical between renders.
- Commit often with clear messages. One concern per commit.
