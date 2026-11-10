# Stream I: loading, boot size and first impression (branch `agent/boot-loading`)

Status: **in progress: full `npm run verify` running.**

## Before / after (`npm run boot:requests`, cold cache, 960×540)

gzip/brotli = the dist files compressed at max level (Netlify serves brotli where it can).

| What the player waits for | Before (`main` 0bd44a5) | After (this branch) |
|---|---|---|
| Loading screen with a moving progress bar | no real loading screen ("Loading…" text, no progress) until the whole 2 MB bundle ran | **10 KB gzip**: inline HTML/CSS (3 KB) paints at once, entry script (7 KB) drives the bar |
| Boot → title, first visit (robot) | 3 requests, **2.06 MB gzip** | 17 requests, **1.69 MB gzip / 1.30 MB brotli** |
| Boot → title, stored frog (biggest hero) | **2.11 MB gzip** | **1.74 MB gzip / 1.35 MB brotli** |
| JavaScript | 1 file, 5.65 MB raw, 2.08 MB gzip (4 MB of it Rapier's WASM as base64) | 14 chunks, 1.6 MB raw, 0.47 MB gzip / 0.40 MB brotli |
| Physics WASM | inside the JS as base64, decoded on the main thread | own hashed file, 3.0 MB raw, 1.15 MB gzip / 0.83 MB brotli, preloaded from the HTML, compiled while it streams |
| Title → first playable frame | 2.35 MB of music | unchanged (audio is not this stream's folder; see follow-ups) |

Targets: ≤ 900 KB gzip to show the loading screen with progress (**10 KB**), ≤ 2.0 MB gzip to the
playable title (**1.69–1.74 MB**). Time to `__rg.ready` in the e2e browser (SwiftShader, 640×360,
4 runs each, same machine): main 1.9–5.4 s (noisy), branch 2.4–2.8 s after the first run.

## What was built

- **Inline loading screen** (`index.html`): animated wordmark (letters drop in and breathe), red-green
  glasses with a glint, a progress bar, and four wordless icon tips that fade in turn (glasses → gem,
  bounce, key + lock → chest, keys → run). White and warm yellow on navy, so it reads in the R-only and
  G-only channels (screenshots: `node scripts/shots-boot.mjs` → `test-results/boot/`, phone 640×360,
  1080p and 4K, each full/R/G). All motion is transform/opacity (compositor), so it stays smooth
  while the main thread builds the island; `prefers-reduced-motion` stops it. No FOUC: everything is
  inline and the page background matches. If no JavaScript ever runs, a reload button fades in
  after 25 s.
- **Progress driven by real boot stages** (`src/boot/stages.ts`, `src/boot/loader.ts`): code →
  physics → world → player → activities → ui → frame. Each stage owns a slice of the bar sized by
  its weight; entering a stage snaps the bar to the slice start, then a long CSS transform transition
  creeps to 85 % of the slice, so the bar keeps moving through long synchronous steps and never runs
  backwards. A short paint yield (`nextPaint`, works in background tabs too) runs before each long
  step. At the end the bar fills, the screen zooms slightly and fades into the title (≈ 0.7 s).
- **Code splitting** (`src/main.ts`, `vite.config.ts`): only config/events/settings/session and the
  boot module are static imports. three, audio, vision (+ postprocessing), core (+ Rapier glue), world,
  activities and UI are dynamic imports, all started at once (downloaded in parallel; Vite adds
  `modulepreload` for their shared chunks) and awaited in the old boot order, so system construction
  order is unchanged. Named vendor chunks `three`, `postfx`, `rapier` keep hashes stable across game
  code changes. One copy each of three, postprocessing and Rapier (`npm ls`).
- **Rapier WASM as a file** (`vite.config.ts` plugin `rg:rapier-wasm-file`, build only): cuts the
  base64 blob out of `@dimforge/rapier3d-compat` and points wasm-bindgen at the real `.wasm`
  (hashed in `build/`), plus a `<link rel=preload as=fetch>` so it downloads alongside the JS. The
  build fails if a Rapier update changes the pattern. Dev and Vitest keep the stock path.
- **Failure screens** (`src/boot/failure.ts`), wordless: one icon and one big yellow retry button.
  - No WebGL 2: crossed-out cube on a screen; checked on a throwaway canvas before anything loads.
  - Failed download (any chunk, the WASM, a model, or any boot error): cloud with a crossed arrow;
    retry reloads.
  - Lost WebGL context: screen with a spinning arrow; the game stops updating/drawing and pauses;
    three.js rebuilds its GPU state on restore and the screen closes, **no reload**. If the context
    does not come back within 4 s a retry (reload) button appears.
  - Background tab: the boot keeps going while hidden (no rAF dependency) and the reveal waits until
    the tab is visible. Hiding the tab during play pauses the session (the pause menu greets the
    player back) and fades the music out (`audio.setMusic(false)`, back on when visible).
- **netlify.toml**: security headers on `/*` (CSP with `'wasm-unsafe-eval'` for Rapier and
  `'unsafe-inline'` styles for the runtime UI CSS, no third-party origins, `nosniff`,
  `Referrer-Policy: no-referrer`, a Permissions-Policy that turns off camera/mic/location/payment/USB);
  `index.html` revalidated; `build/*` immutable; `assets/*` 1 h; explicit
  `model/gltf-binary` and `audio/ogg` per asset folder. `.wasm` relies on Netlify's built-in
  `application/wasm` (a `/build/*.wasm` rule is not used: Netlify only allows `*` at the end of a
  path, so it could match the JS too). `vite preview` sends the same headers (`SECURITY_HEADERS` in
  `vite.config.ts`), so the whole e2e suite runs under the production CSP; a unit test keeps the two
  in sync.
- **Offline hint**: skipped (not trivial without a service worker; brief said skip otherwise).

## Tests

- Unit `tests/boot/boot.test.ts` (8): stage slices cover the bar in order, creep stays inside its
  slice, progress is monotonic; netlify.toml headers equal the preview headers, CSP allows WASM
  without `'unsafe-eval'`, cache rules, `*` only at path ends, MIME per asset folder.
- E2E `tests/e2e/boot.spec.ts` (4) + `boot-nowebgl.spec.ts` (1), about 17 s together:
  loading screen visible before `__rg.ready`, stages logged in order with monotonic progress ending
  at 100 %, then the title's Play button; tab hidden → paused (visibility emulated); `loseContext()`
  → wordless screen → `restoreContext()` → screen gone, a real frame renders, no errors; a
  `world-*.js` chunk aborted → failure screen, retry reloads into the loading screen; Chromium with
  `--disable-gpu --disable-3d-apis` (no SwiftShader flags) → no-WebGL screen with retry, no page error.
- Suite time stays flat: in test mode the loading screen's decorative animation is off and the reveal
  is 150 ms (every e2e boot waits for it). Under SwiftShader the animation competes with the first
  frame's shader compile.

## Changes outside `src/boot/` (for the integrator)

- `src/main.ts` (boot/loader parts only): static imports reduced to config/events/settings/session/
  input-touch-math/boot; systems via `chunks.*` dynamic imports; `loader.stage(...)` + `nextPaint()`
  between steps; `watchContextLoss` (stop loop + pause + screen) and `watchVisibility` (pause + music)
  after the loop is defined; end of boot: first frame → `api.ready` → loop → `whenVisible()` →
  `loader.done()`; boot errors → `loader.fail('load')` (was a ⚠️ text). The frame loop, update order,
  test API and resize logic are unchanged apart from `contextLost` skipping update/render.
- `index.html`, `vite.config.ts`, `netlify.toml` (owned by this stream).
- `scripts/boot-requests.mjs`: adds the "loading screen" stage and gzip/brotli columns.
  New `scripts/shots-boot.mjs`.
- Nothing needed in `src/types.ts`, `src/config.ts` or `package.json`. `#boot` is still the overlay id
  and is still removed after the reveal, so `tests/e2e/helpers.ts` and the shot scripts work as before.

## Findings and follow-ups (not done here)

- **Cross-Origin-Opener-Policy is deliberately not set**: with `same-origin`, Chromium started every
  page with a cold shader cache and the first frame took ~1.5 s longer under SwiftShader. The game
  opens no windows and needs no `SharedArrayBuffer`, so COOP buys nothing.
- **Music after Play is 2.35 MB** (`music-action.ogg` 1.27 MB, `music-explore.ogg` 0.87 MB). The audio
  owner could load only the first cue at Play and stream the others when their cue comes up, or
  re-encode at a lower bitrate (OGG does not compress further on the wire).
- The first frame (shader compile) is the slowest boot stage on weak GPUs. three's
  `renderer.compileAsync` (KHR_parallel_shader_compile) could warm the materials during the world
  stage; that touches `src/vision`/`src/world`, so it is left to their owners.
- Netlify may not compress `.glb`; the character models are 0.17–0.42 MB raw (~0.1–0.16 MB gzip).
