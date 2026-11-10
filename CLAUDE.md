# Red-Green Open World — instructions for every agent

A short (about 5 minutes), polished, **non-violent** 3D open-world browser game for kids aged 8–13.
Players wear **red-green glasses**, as used in vision therapy. The game is built so that the
fun stuff (gems, treasures, secret paths) is visible **only to the weaker eye**. That pushes the
weaker eye to work.

Read `docs/GAME_DESIGN.md` (what we build) and `docs/BUILD_PLAN.md` (milestones, agent ownership)
before you start. Progress is logged in `docs/PROGRESS.md`; decisions in `docs/DECISIONS.md`.

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
- **Models:** only the orchestrator (main session) runs on Fable 5.2. Subagents run on the model
  in their `.claude/agents/*.md` frontmatter (Opus or Sonnet). Never pass `model: "fable"` and
  never use `subagent_type: "fork"` (a fork inherits Fable). Use the named subagents, or
  `general-purpose` with `model: "sonnet"` for ad-hoc tasks.
- The user authorized the orchestrator to merge into `main` and push. Netlify deploys `main` to
  https://red-green-open-world.netlify.app. Only push `main` when `npm run verify` passes.

## Tech stack (fixed; don't switch without a logged reason)

- **Three.js + TypeScript + Vite**, static site deployed to **Netlify** (`netlify.toml`).
- Physics: **Rapier** (`@dimforge/rapier3d-compat`). Post-processing: pmndrs `postprocessing`
  (or three's EffectComposer). The dichoptic compositor must stay the **last** pass.
- Assets: glTF/GLB, compressed with `@gltf-transform/cli` (meshopt + KTX2/WebP textures).
- Tests: **Vitest** (unit) + **Playwright** (e2e, screenshots). Chromium is pre-installed in the
  cloud container; launch it with `--use-angle=swiftshader --enable-unsafe-swiftshader` for
  WebGL 2. Never run `playwright install`.
- `npm run verify` = typecheck + lint + unit tests + build + Playwright smoke test (page loads,
  no console errors, a frame renders, screenshot saved to `test-results/`). It must stay green.
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
  4. Weak-eye objects don't cast shadows, don't occlude, and don't show in reflections.
- **Both-eye objects**: the world, the player, the HUD, menus. They must read clearly in **both**
  the R and G channels alone. Never use hue as the only cue. Test by viewing the R-only and
  G-only channel screenshots (`npm run shots:channels`).
- **Calibration screen** (reached from settings): test patterns plus sliders for weak-channel
  strength and crosstalk, so the strong eye sees nothing with real glasses on a real monitor.
- **Strong-eye contrast** slider (optional dichoptic rebalancing): scales strong-channel contrast
  down, 100% → 40%.
- **Both-eye locks**: some rewards need both eyes, e.g. a chest's key is weak-eye-only and its
  lock is strong-eye-only. This encourages the two eyes to work together.
- Settings are behind a **grown-up gate** (hold a key for 3 s, or simple math) and saved in
  `localStorage` (wrapped in try/catch).
- No medical or treatment claims anywhere in the game. A neutral line is fine: "Use as directed
  by your eye care professional."

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
- Budget: initial download ≤ 40 MB compressed, more streamed in as needed. 60 fps on a mid-range
  laptop at "High", playable at 30 fps on integrated graphics at "Low".

## Code conventions

- `src/core` engine loop, input, physics, player, camera, vehicles, horse · `src/vision` dichoptic
  compositor, calibration, eye settings · `src/world` map, terrain, lighting, sky, asset loading ·
  `src/activities` trampoline, skydive, bungee, launch pads, collectibles · `src/ui` menus, HUD,
  timer, end screen, settings, credits · `tests/` unit + e2e.
- Strict TypeScript, no `any` without a comment. Small modules. Constants in `src/config.ts`.
- Commit often with clear messages. One concern per commit.
