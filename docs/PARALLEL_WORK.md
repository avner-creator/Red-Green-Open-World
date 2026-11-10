# Parallel workstreams for a second Claude account

These streams are self-contained, touch few shared files, and can run on another account's
machine at the same time as the main build. Each one: open a Claude Code cloud session on
`avner-creator/Red-Green-Open-World` (model **Opus 5.5**, auto permission mode), paste the brief,
and it pushes to its own branch. The main orchestrator merges the branch when it reports done
(tell the orchestrator "stream X is pushed").

Rules for every stream: read `docs/DIRECTIVES.md`, `CLAUDE.md` and `docs/GAME_DESIGN.md` (the
"Fun and motivation pass" section) first. Branch from the latest `main`. Do not edit
`src/types.ts`, `src/main.ts`, `src/config.ts` or `package.json` unless the brief says so; list
anything you need there in `docs/streams/<stream>.md` on your branch. Commit and push often
(plain push, no force). `npm run verify` must be green before you call it done. Look at your own
screenshots (full, R-only, G-only). No health/medical wording; no violence; CC0 assets only, each
with an `ASSETS.md` row.

## Stream A — touch and mobile controls (branch `agent/mobile-touch`)

> Make Red-Green Open World fully playable on phones and tablets (landscape). Add touch input
> inside `src/core/input*` feeding the existing `InputState` (no interface change): a floating
> left-thumb joystick (move), right-side drag to look, big buttons for jump, use (shows the
> current interaction icon), sprint toggle, flop and pause; multi-touch safe; shown only on touch
> devices or after the first touch; hidden with keyboard/gamepad. The buttons themselves are DOM
> in `src/ui/touch/` (new folder), styled like the existing HUD (white/yellow on dark, thick
> outlines, readable through red or green lenses alone), sized for small hands, respecting safe
> areas and notches. Handle: no pointer lock on mobile, orientation (ask for landscape with an
> icon, no text), `visualViewport` resize, fullscreen on Play where allowed, audio unlock on first
> touch, a "low" quality default and lower pixel-ratio cap on phones (expose what you need from
> main.ts in your notes file rather than editing it; a `?quality=` param already exists for tests),
> menus and settings usable by touch at 360×640 CSS px landscape (667×375). Driving and
> skydiving must work with the same controls. Tests: unit tests for joystick maths; Playwright
> e2e with `hasTouch: true` and a mobile viewport: tap Play, drag the joystick and assert the
> player moves, tap jump, open/close pause. Screenshots of the touch HUD (full/R/G) at phone and
> tablet sizes in `test-results/touch/`. Report in `docs/streams/mobile-touch.md`.

## Stream B — characters (branch `agent/characters`)

> Source and prepare playable characters for Red-Green Open World. Goal: 6 distinct, appealing,
> slightly crazy animated characters for kids 8–13 (for example: a robot, an astronaut cat, a
> dino, a ninja frog, a wizard kid, a penguin in a jetpack — use what you can actually get).
> Sources allowed: CC0 only, from quaternius.com packs, opengameart.org (check each licence),
> three.js examples via cdn.jsdelivr.net, Poly Haven. Each needs at least idle, walk, run and jump
> animations (retarget or share a skeleton where possible; procedural fallbacks are acceptable
> for jump/fall). Deliver compressed GLBs (`@gltf-transform/cli`, meshopt + WebP, ≤ 600 KB each)
> in `public/assets/characters/`, an `ASSETS.md` row for each, and a data module
> `src/core/characters/catalog.ts` exporting for each character: id, name, one-line backstory
> (fun, no health wording), model URL, scale, animation-clip mapping to the game's `PlayerAnim`
> names, attach points for head/back/face outfits, a signature emote clip, price in gems (two
> free), and its skill id (`doubleJump | glide | dash | superBounce | groundPound`). Each must
> read clearly in R-only and G-only channel screenshots (brightness contrast, not hue). Provide
> a standalone preview page or script that renders every character with each animation and
> saves full/R/G screenshots to `test-results/characters/`. If fewer than 6 good CC0 animated
> models can be found, fill the set with bold re-skins of the existing
> `public/assets/models/RobotExpressive.glb` (different proportions, add-on parts, colours) and
> say so. Do not wire the characters into the player controller or UI (the main build does
> that); just make the catalog and assets correct and documented in
> `docs/streams/characters.md`.
