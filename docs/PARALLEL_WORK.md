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

## Which model for which stream

- Streams A and B are single-builder jobs: run each as **one Opus 5.5 session**, no orchestrator.
- Stream C is a multi-part block: run it with **Fable 5.2 as orchestrator** and Opus/Sonnet
  subagents as builders (the same rules as `docs/DIRECTIVES.md` §1).

## Stream C — economy, shop and missions (branch `agent/economy`, orchestrated)

> You are the orchestrator for one workstream of Red-Green Open World; another orchestrator
> session is building the rest on `main` at the same time. Read `docs/DIRECTIVES.md`, `CLAUDE.md`,
> `docs/HANDOFF.md`, `docs/BUILD_PLAN.md` and `docs/GAME_DESIGN.md` — your scope is items 1–4 of
> the "Fun and motivation pass": gems as money with a persistent wallet, mega gems, combo
> streaks, respawning gems, the Gear Shack shop kiosk on the plaza plus a wardrobe in the pause
> menu, ride tickets (balloon 5 gems with the first ride per session free; rocket pads 3), and
> three wordless mission cards per session with gem bonuses. You write no code yourself: use the
> named subagents in `.claude/agents/` (integrator for `src/types.ts`/`src/main.ts`/`src/config.ts`
> and a new `src/profile.ts` localStorage profile; activities-designer for gem values, respawn,
> combos, tickets and missions in `src/activities/`; ui-designer for wallet HUD, shop, wardrobe,
> mission cards and the end screen; world-artist for the kiosk model at the plaza;
> dichoptic-engineer only if the vision layer needs a change; qa-playtester at the end).
> Shared-interface rule: change `src/types.ts` **additively only** (new optional fields, new
> events, new interfaces such as `ProfileApi`/`ShopItem`/`Mission`), never rename or remove, and
> list every addition in `docs/streams/economy.md` so the other orchestrator can merge cleanly.
> Do not touch: character select, trampoline/pads/rocket-pad physics, wayfinding, music, touch
> controls (other streams). Mega gems, wallet numbers and shop items must never reveal weak-eye
> object positions to the strong eye; mega gems are weak-eye-only like normal gems, and the
> channel-separation e2e must cover them. Rebase on `origin/main` at least every hour and before
> you finish. Work on branch `agent/economy` (subagent worktrees merged into it), push often
> (plain push), keep `npm run verify` green on it, and when done write `docs/streams/economy.md`
> (what was built, interface additions, how to test) and tell the project owner the branch is
> ready to merge.

## More streams (optional attractions from the cut list; each is one Opus 5.5 session)

These add breadth. They are independent of each other and of streams A–C. Each lives in a NEW
folder and registers itself with one line, so merges stay trivial.

## Stream D — rideable horse (branch `agent/core-horse`)

> Add a rideable horse to Red-Green Open World, in `src/core/vehicles/` next to the buggy (read
> how the buggy implements `VehicleApi`, enter/exit with E, chase camera, respawn and audio, and
> follow the same patterns; `kind: 'horse'`). Two horses stand in the paddock at
> `ctx.world.anchors.ranch`, idling (ear flick, tail swish, head bob), friendly. E mounts (the
> rider sits on the horse; `player.mode = 'riding'`; `player.position` follows so gem pickup
> works), E dismounts to a free side. A kinematic "fast character" controller (not a physics
> rig): walk → trot → gallop with Shift (top speed ~13 m/s), smooth turning, a jump on Space that
> clears fences (~1.6 m), sure-footed on slopes, slows and turns back in shallow water, can't get
> stuck (R puts horse and rider on the nearest safe spot). Model: a rigged, animated CC0 horse if
> you can source one within 30 minutes (quaternius.com packs, opengameart.org with a CC0 licence
> check; compress with `@gltf-transform/cli`; add an `ASSETS.md` row), otherwise a well-shaped
> procedural horse (curved body, neck, head, mane, tail, four two-segment legs) with a
> convincing procedural gait (diagonal pairs at trot, bounding at gallop, body bob, head
> counter-motion). It must look good and read in R-only and G-only (brightness contrast).
> `setColor()` tints the coat. Audio: `ctx.audio.setLoop('gallop', intensity, pitch)` and
> `ctx.audio.play('neigh')` on F. Whinny + friendly rear-up emote when mounted. No one can be
> hurt: other objects are nudged with a soft bump. Tests: unit tests for gait/speed maths;
> Playwright e2e (`?test=1&quality=low`): teleport to the ranch, mount, ride forward, jump,
> dismount; `state().playerMode === 'riding'`. Screenshots full/R/G in `test-results/horse/`.
> Do not edit `src/types.ts`; if `ctx.world.anchors.ranch` needs dressing or a gate, list it in
> `docs/streams/core-horse.md`.

## Stream E — bungee bridge and Silly Zone (branch `agent/activities-bungee-silly`)

> Build two attractions for Red-Green Open World in new folders `src/activities/bungee/` and
> `src/activities/silly/`, each registered with one line in `src/activities/index.ts` (read how
> `src/activities/skydive/` uses `ExternalController`, the camera override, interactions, stunts
> and audio, and follow the same patterns).
> **Bungee** at `ctx.world.anchors.bungee` (a platform on the bridge deck; the jump goes toward
> −X, about 31 m above the canyon floor; landing shore at `anchors.bungeeLanding`): E at the
> platform → a harness and a thick striped elastic cord attach (rendered as a stretching,
> sagging tube, both-eye, brightness-striped) → wind-up → the player dives → the cord stretches
> with a believable spring-damper (2–3 big boings, the first rebound nearly back to the deck),
> wide FOV, wind loop, whoops → then lowers the player gently to the shore. Steering during the
> swing lets the player sweep through weak-eye-only positions: export an array `bungeeSpots`
> of good gem positions along the fall line (do not create gems yourself). `stunt {kind:'bungee'}`
> with stars for dive depth. Nobody ever hits the ground: the cord length adapts to the terrain.
> R cancels safely.
> **Silly Zone** at `ctx.world.anchors.sillyZone`: a giant beach ball (~3 m, Rapier dynamic body)
> you can push, bounce on and roll down the slope; 4–5 wobbly inflatable tube characters that
> flail and bend away when you run through them (procedural, spring-driven, friendly faces);
> a big round "FLOP" floor button that triggers `ctx.player.flop()` with confetti; a row of
> spinning bumper mushrooms that boing the player sideways; a see-saw catapult that flips you
> a few metres. Everything is comic and soft; nothing breaks, nothing is hurt. Build the
> ground dressing yourself only inside the anchor radius (bright brightness-contrast patterns,
> readable in R-only and G-only); list any wider world changes you want in
> `docs/streams/activities-bungee-silly.md`. Export `sillySpots` (gem-worthy positions) too.
> Pure logic with unit tests (cord spring maths never lets the player below ground + 2 m;
> bumper impulses). Playwright e2e (`?test=1&quality=low`, `step(dt, n, false)`): full bungee
> jump ends on the shore in walk mode; pushing the ball moves it; the flop button flops.
> Screenshots full/R/G in `test-results/bungee/` and `test-results/silly/`.

## Stream F — secret paths and weak-eye extras (branch `agent/activities-secrets`)

> Deepen the red-green heart of Red-Green Open World in a new folder `src/activities/secrets/`
> (one registration line in `src/activities/index.ts`). Read the dichoptic rule in `CLAUDE.md`,
> `src/vision/index.ts` exports (`createGlowMaterial`, `createLayerMaterial`) and how
> `src/activities/chests/` uses `VisionLayer.WeakOnly` / `StrongOnly`.
> 1. **Secret paths**: 4 routes of weak-eye-only floating stepping stones (visual on the WeakOnly
>    layer, but with real invisible colliders so they can be walked and jumped on): one from a
>    plaza rooftop to another rooftop, one spiralling up beside the trampoline, one out over the
>    lake to the floating platform at `anchors.lakePlatform`, one up the lighthouse at
>    `anchors.lighthouse`. Each ends at a both-eye reward pedestal that pops a big confetti
>    burst and emits `stunt` stars. Stones pulse gently and chime when stepped on; a stone you
>    stand on is briefly shown brighter (still weak-eye-only). Falling off is a normal fall.
> 2. **Weak-eye arrows**: trails of weak-eye-only arrow decals on the ground leading from the
>    roads to each secret path start and to each chest key.
> 3. **Two-eye doors**: 2 vault doors in rock faces: a weak-eye-only symbol sequence (3 shapes)
>    floats nearby, and strong-eye-only buttons with shapes sit on the door; pressing the
>    buttons in the order the weak eye sees opens it (E on each; wrong order = friendly wobble
>    and reset). Inside: a both-eye treasure pile that emits a big `stunt` and a toast. Export
>    `secretRewardSpots` rather than creating gems.
> Nothing weak-eye-only or strong-eye-only may leak into the main scene, HUD or audio position.
> Unit tests for the sequence logic and path generation (stones reachable: gaps ≤ 2.2 m
> horizontally and ≤ 1.0 m up, all above ground/water, none inside colliders). Playwright e2e
> (`?test=1&quality=low`) including a channel test with canvas readback as in
> `tests/e2e/vision.spec.ts`: stones and arrows change only the weak channel, door buttons only
> the strong channel, zero difference elsewhere, for all 4 lens/eye combinations. Screenshots
> full/R/G in `test-results/secrets/`. Notes in `docs/streams/activities-secrets.md`.
