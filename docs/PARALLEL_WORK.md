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

## Streams G–I (added later; each is one Opus 5.5 session)

## Stream G — outer island art pass (branch `agent/world-outer`)

> Bring the outer areas of the Red-Green Open World island up to the standard of the plaza, Bouncy
> Park and garage (look at those first: `npm run build && npm run shots:channels -- spawn
> trampoline garage balloon`). You own `src/world/` for this stream. Read how the core areas are
> built (`src/world/core-areas.ts`, `wayfinding.ts`, `pictograms.ts`, `beacons.ts`, the scatter
> and chunk batching code, `lighting.ts`) and reuse those systems. Dress, in this order:
> **ranch** (`anchors.ranch`: barn with open doors, paddock with a gate that a horse can jump,
> hay, troughs, a riding track loop marked with flags, a how-to board and beacon for the horse),
> **canyon bridge** (`anchors.bungee`, `bungeeLanding`: bridge detailing, a proper jump platform
> with railings and flags, rock strata, a waterfall or river below, the landing shore, board +
> beacon), **Silly Zone** (`anchors.sillyZone`: only the surroundings — fences, wacky signposts,
> bright brightness-contrast ground patterns up to but not inside the anchor radius; board +
> beacon), **lake and beach** (`anchors.lakePlatform`: pier, floating platform, buoys, reeds,
> beach umbrellas and towels without text, sandcastles, rowing boats moored), **lighthouse**
> (`anchors.lighthouse`: stairs or a ramp so the top gallery is reachable on foot, rotating
> lamp glow, rocks, path), and the **roads** to all of them (same kerb/lamp/verge treatment as the
> core roads, chevrons, junction fingerposts). Add these five to the plaza fingerpost and their
> anchors' beacons. Do not move any existing anchor or gem/chest spot; do not edit other folders
> (three other streams are building a horse at the ranch, a bungee jump on the bridge and the
> Silly Zone props inside its radius — keep every anchor's clear radius empty). Everything must
> read in R-only and G-only (brightness, not hue). Colliders for anything solid. Performance:
> measure with `scripts/perf-report.mjs` if present, otherwise `renderer.info`; each newly
> dressed view must stay ≤ ~230 draw calls and ≤ ~500k triangles for the whole frame on Medium
> (batch by material in the existing chunks; small parts cast no shadow). Unit tests for
> placements (outside anchor radii, off roads, on land; spots-colliders test still passes).
> Screenshots full/R/G of every dressed area at start and sunset in `test-results/world-outer/`;
> judge them against a AAA-stylized bar and do up to two polish passes. Notes in
> `docs/streams/world-outer.md`.

## Stream H — a living island: friendly critters and townsfolk (branch `agent/world-life`)

> Make Red-Green Open World feel alive, in a new folder `src/world/life/` registered with one
> line where the world is assembled (read `src/world/index.ts`, the chunk batching code and
> `src/core/characters/load.ts` for how animated GLBs are loaded with the meshopt decoder).
> Add ambient, friendly, non-interactive-by-default life, all cheap and batched: seagulls
> circling the lighthouse and coast, small birds that scatter from the ground when the player
> runs near and resettle, butterflies over flower patches, fish that jump in the lake, a few
> sheep or chickens near the ranch that waddle out of the way of the player and the buggy (they
> are never hit: they hop aside with a comic squeak), ducks on the water, fireflies as the
> session approaches sunset (`setTimeOfDay`), drifting clouds and their shadows, flags and
> bunting reacting to a gentle wind. And 4–6 townsfolk standing at their stalls or benches in
> the plaza and at attractions (use CC0 animated characters from quaternius.com packs or the
> existing character GLBs in `public/assets/characters/` re-coloured; ≤ 400 KB each compressed
> with `@gltf-transform/cli`, an `ASSETS.md` row for each) who turn to look at the player, wave
> or cheer when the player does a stunt (`stunt` event) or an emote (`player:emote`), and point
> toward the nearest attraction when the player stands idle near them. No dialogue text.
> Everything is both-eye and must read in R-only and G-only; nothing here may be weak-eye-only
> or reveal weak-eye objects (townsfolk must not point at gems or keys). Critters use instancing
> or a single merged animated mesh per species with vertex-shader animation; whole stream budget
> ≤ 25 draw calls and ≤ 60k triangles on Medium, less on Low (`setQuality`), nothing at all
> costs more than 0.5 ms of CPU per frame. Deterministic in `ctx.testMode`. Unit tests for the
> flocking/avoidance maths; a Playwright e2e that boots (`?test=1&quality=low`), steps frames and
> asserts no errors, that birds scatter when the player approaches, and that the draw-call
> budget holds. Screenshots full/R/G in `test-results/life/`. Notes in `docs/streams/world-life.md`.

## Stream I — loading, boot size and first impression (branch `agent/boot-loading`)

> Make the first ten seconds of Red-Green Open World feel premium, and make it load fast. You
> own `index.html`, `vite.config.ts`, `src/main.ts` boot sequence and a new folder `src/boot/`
> for this stream (read `docs/HANDOFF.md` and `CLAUDE.md` first; `src/main.ts` normally belongs
> to the integrator, so keep changes to the boot/loader parts and list them in your notes).
> Current state: `npm run boot:requests` reports about 2.2 MB gzip before the title screen (one
> 2 MB JS bundle plus one character GLB) and 2.4 MB of music after Play. Deliver: (1) a real
> loading screen that appears instantly from inline HTML/CSS (animated wordmark, a progress bar
> driven by actual boot stages, playful icon tips with no text, readable in R-only and G-only,
> no flash of unstyled content, works at 360×640 landscape and 4K) and a smooth reveal into the
> title screen; (2) code-splitting so first paint needs far less: Rapier's WASM, the
> post-processing stack, attractions and UI screens loaded as separate chunks in a sensible
> order with `modulepreload`, tree-shaking of three.js imports, no duplicated dependencies,
> Brotli-friendly output; target ≤ 900 KB gzip to show the loading screen with progress and
> ≤ 2.0 MB gzip to the playable title screen, and report before/after from `npm run
> boot:requests`; (3) graceful failure screens, wordless with an icon and a retry button, for no
> WebGL 2, lost WebGL context (restore without reloading if possible), a failed chunk or asset
> load, and a tab that was in the background; (4) pause the game and music when the tab is
> hidden; (5) a `netlify.toml` check: long cache for hashed `build/*`, short for `assets/*`,
> correct MIME types for `.wasm`/`.glb`/`.ogg`, and a security-headers block that does not break
> WASM or audio; (6) a tiny service-worker-free offline hint only if trivial — otherwise skip.
> Do not change gameplay. Tests: e2e for the loading screen appearing before the title, the
> WebGL-missing screen (launch Chromium without GPU flags), context-loss recovery
> (`WEBGL_lose_context`), and tab-hidden pause; keep the suite's total time flat. Notes with the
> before/after table in `docs/streams/boot-loading.md`.

## Carnival Island streams J–N (owner playtest 2; each is one Opus 5.5 session)

Common rules for J–N, in addition to "Rules for every stream": read the "Carnival Island pass"
section of `docs/GAME_DESIGN.md`. Each attraction lives in its own NEW folder under
`src/activities/` and registers with one line in `src/activities/index.ts`. **Site**: use
`ctx.world.anchors[<name>]` if the main build has added it (names below); until then, pick a flat
land spot yourself with `ctx.world.heightAt`/`isLand` near the stated place, clear of roads and
existing anchor radii, and build your own ground pad and local dressing inside your radius only
(report the coordinates you used in your notes file). **Friends**: rival/teammate AIs are the
other heroes from `src/core/characters/catalog.ts` loaded with `loadCharacter` (cheerful, a bit
clumsy, never mean; they should lose to an 8-year-old who tries). **Glasses twist**: the bonus
elements named in the brief are registered ONLY with `ctx.vision.add(obj, VisionLayer.WeakOnly)`
(brightness-only materials from `src/vision`), never hinted in the main scene, HUD or by a
position-revealing sound, and each stream adds a canvas-readback channel test like
`tests/e2e/vision.spec.ts` (weak-eye objects change only the weak channel for all 4 lens/eye
combinations). **Economy** (on `main` after Stream C merges; code defensively if absent): pay
prizes with `ctx.profile.earn(n, 'mission')`, first play per session free then a 3-gem ticket via
`ctx.profile.spend`, never lock a child with 0 gems out of everything. **Feel**: start with E at
a booth/gate, a 3-2-1 with pictograms, 30–60 s rounds, big juicy feedback (squash/stretch,
confetti in brightness-safe colours, `ctx.audio.play` of existing SfxName values, camera
override), a result jingle with stars, instant replay or exit, R always leaves safely. Emit
`stunt` events for stars and a custom done signal through `ui:toast`. Controls work on keyboard,
gamepad and touch through `ctx.input.state` only. Performance: ≤ ~12 draw calls and ≤ 40k
triangles per attraction when idle, shadow proxies on layer 7, nothing updates when the player
is far away. Non-violent: foam, bubbles, water balloons, bouncing; nothing is a weapon and nobody
is hurt. Unit tests for scoring/AI maths; one Playwright e2e per attraction (`?test=1&quality=low`,
`step(dt, n, false)`) that plays a full round to a result; screenshots full/R/G in
`test-results/<stream>/`; notes in `docs/streams/<stream>.md`.

## Stream J — carnival games row (branch `agent/carnival-games`, folder `src/activities/carnival/`)

> Site: anchor `carnivalRow` (the village main street by the plaza, among the houses). Build a row
> of five striped booths with a friendly AI stall-keeper each, all playable against 1–2 friends:
> (1) **Balloon Pop**: throw soft beanbags at a wall of bobbing balloons; ordinary balloons are
> both-eye, the prize balloons are weak-eye-only and worth 3×; aim with the camera, Space/E to
> throw, generous aim assist. (2) **Ring Toss**: lob hoops onto wobbling pegs; charge-and-release
> power bar. (3) **Duck Pond**: scoop floating rubber ducks with a net; the lucky ducks carry a
> weak-eye-only mark on their back. (4) **Strength Bell**: time a press (or a hero's ground-pound)
> to send the puck up the tower to ring the bell; 5 height tiers with silly labels as pictograms.
> (5) **Glow Dodge tent**: a dark tent with neon tape lines where soft foam balls roll and lob
> toward you; dodge for 30 s — the glowing balls are weak-eye-only, their shadows are not drawn,
> a hit is a soft bonk and a giggle. (6) if time allows, **Ball Scramble**: lie on a wheeled board,
> get launched into a ball pit, trap balls under a basket for 30 s; golden weak-eye balls count
> triple. Prizes: gems plus plush-toy trinkets that appear on a shelf at the row.

## Stream K — Scoops, the ice-cream shop (branch `agent/ice-cream`, folder `src/activities/scoops/`)

> Site: anchor `iceCream` (the existing ice-cream shop prop in the village; replace/upgrade it
> with a proper open-fronted parlour and a counter you walk up to). E at the counter opens a
> 3D build-your-own-cone station: pick cone, stack up to 5 scoops (physics wobble — a too-tall
> cone leans and can topple comically), sauces, and silly toppings (gummy worms, popcorn, a
> pickle, a rubber duck, sprinkles cannon); a recipe card from a friend asks for a specific
> cone by pictures for bonus gems; the **secret topping of the day** is weak-eye-only on the
> shelf. Eating the cone (big chomp animation) gives a funny 30-second effect chosen by the
> toppings: giant head, tiny hero, rainbow trail, super speed, moon-jump, bubble burps. Friends
> queue up and react to your creation. Keyboard, gamepad and touch (tap/drag) controls.

## Stream L — Bubble Ball arena and Dino Sumo ring (branch `agent/bumper-arena`, folders `src/activities/bubbleball/`, `src/activities/dinosumo/`)

> Sites: anchors `bubbleArena` (a grassy field near the Bouncy Park) and `dinoRing` (next to it).
> **Bubble Ball**: the hero and five friends each wear a giant transparent inflatable bubble
> (legs free); arcade physics for bumping, rolling, flipping upside down and bouncing back up;
> 3-a-side soccer with a huge light ball, two inflatable goals, 60 s matches, kick-off, goal
> celebrations; bonus goal rings that appear in mid-air are weak-eye-only and score double.
> **Dino Sumo**: everyone wears a wobbly inflatable dinosaur suit (procedural, with a big clumsy
> tail and delayed secondary motion); a pool-noodle ring; bump friends out of the circle (they
> roll away giggling and waddle back), swing your tail (Space) to pop hanging water balloons —
> ordinary ones splash you, the weak-eye-only ones soak everybody and score triple. Use Rapier
> dynamic bodies or a simple custom circle-collision solver; nobody is hurt, everything bounces.

## Stream M — Foam Lava course (branch `agent/foam-lava`, folder `src/activities/foamlava/`)

> Site: anchor `foamCourse` (the open ground between the plaza and the lake). A backyard-style
> obstacle run across a sea of soapy foam "lava": pool floats that tip, upside-down bins,
> balance blocks, a wobbly plank bridge, a rope swing, a slip-and-slide chute, foam cannons that
> puff across the path on a rhythm, a bubble machine finale. Timed run with a friend ghost to
> beat, three medal times, checkpoints. The **secret shortcut tiles** and a few **safe-in-the-
> foam stepping stones** are weak-eye-only (visual on the WeakOnly layer with real invisible
> colliders). Falling into the foam = a comic flop, a bubble beard on the hero for 10 s, respawn
> at the last checkpoint with no penalty beyond time. Foam is a nice cheap shader (animated
> bubbly surface, both-eye, brightness-readable), with foam particles when you splash.

## Stream N — buggy workshop and race (branch `agent/buggy-race`, folders `src/activities/workshop/`, `src/activities/race/`)

> Sites: the existing `garage` anchor (workshop) and anchor `raceStart` (on the road loop by the
> garage). **Workshop**: E at the lift opens a turntable view of the buggy with silly upgrades
> bought with gems (read how `src/core/vehicles/` builds the buggy and `VehicleApi`; if
> `src/activities/gear/` from the economy stream is on `main`, add the items to its catalog and
> applier instead of inventing a parallel one): monster wheels (bigger, bouncier), spring bumper
> (bigger comic bounces), bubble exhaust, rocket boost (a short burst on the skill key), musical
> horns, a rubber-duck roof ornament, confetti cannon; visual parts attach to the buggy and
> gameplay effects go through small additive hooks you may add to `src/core/vehicles/` (list
> them). **Race**: a 60–90 s lap on the island roads against one or two friends in their own
> buggies (simple waypoint AI with rubber-banding so it is always close), start lights by
> pictogram, checkpoints as inflatable arches, mini-map-free (use the arches and chevrons),
> podium celebration. **Glasses twist**: boost pads and a glowing best racing line are
> weak-eye-only; hitting three boosts in a row gives a rocket surge. Bumping rivals is bouncy and
> comic. Works with every hero in the seat.

## Stream O — sky rides: stunt plane and friendly dragon (branch `agent/sky-rides`, folder `src/activities/skyrides/`)

> Follow the common rules for J–N above. Owner idea: "a plane air battle, or riding dragons".
> The game is strictly non-violent (no weapons, nobody shot at or hurt), so the air "battle" is a
> **stunt-and-splash sky contest**, not combat. Build ONE shared arcade flight controller (an
> `ExternalController`; read `src/activities/skydive/` and `src/activities/flight.ts` for how
> rides take and release the player, camera overrides, wind audio, and how rides must never take
> the player from one another) and two rides on top of it:
> **Stunt plane** at anchor `airstrip` (a short grass runway near the balloon field): a chunky
> toy biplane (original design, procedural, propeller blur, wobbling wings, hero visible in the
> open cockpit with scarf physics, the buddy puppy in the back seat if `src/buddy/` exists).
> E to board, auto take-off, forgiving controls (pitch/roll/yaw blended into "steer where you
> look" with auto-level, a boost on Shift, loops and barrel rolls on the skill key that score
> trick stars), can't crash: the ground and sea bounce you back up with a comic boing, the island
> edge turns you around. A 90-second sky contest against two friends in their own planes:
> fly through hoops, pop cloud-balloons by flying through them, drop water balloons (Space) on
> big floating bullseye rafts and on a giant inflatable duck, write a smoke trail; friends
> splash you with harmless confetti puffs when they overtake. Auto landing at the end with a
> podium. **Friendly dragon** at anchor `dragonRoost` (a rocky perch by the lighthouse or the
> highest hill): a round, goofy, smiling dragon (procedural, big eyes, stubby wings with
> secondary motion, wagging tail) that you feed a treat to befriend, then ride: wing-flap
> rhythm on Space for height, glide and swoop, a happy roar, and it breathes **bubbles and
> sparkles** (never fire at anything) that pop cloud-balloons; a relaxed free-flight tour of the
> whole island with a treasure trail, ending with a gentle landing back at the roost.
> **Glasses twist** (WeakOnly layer only): the bonus hoops, the golden cloud-balloons, the best
> flight line through the contest and the dragon's treasure trail are visible only to the weak
> eye; ordinary hoops and balloons are both-eye. Skies must stay readable in R-only and G-only
> (bright objects need dark outlines against the sky). Both rides keep gem pickup working at
> speed (segment tests), cost a ticket after the first free flight per session, and hand the
> player back on the ground in walk mode. Batch each vehicle to ≤ 8 draws with a shadow proxy.

## Stream P — red-green depth pass (branch `agent/glasses-depth`, orchestrated: Fable 5.2 + Opus/Sonnet builders)

> You are the orchestrator for Stream P of Red-Green Open World; other sessions are building the
> rest at the same time. Read `docs/DIRECTIVES.md` (you write no code; builders are Opus/Sonnet
> subagents, never Fable, never fork; the red-green system must be complete and excellent; no
> health or medical wording anywhere), `CLAUDE.md` (the red-green rule), `docs/HANDOFF.md`,
> `docs/BUILD_PLAN.md`, and `docs/GAME_DESIGN.md` — your scope is the whole "Red-green depth
> pass" section: more kinds of play that make the player want to use the weaker eye. Also read
> `src/vision/` (compositor, `VisionLayer.WeakOnly`/`StrongOnly`, `createGlowMaterial`,
> `createLayerMaterial`, calibration), `tests/e2e/vision.spec.ts` (canvas-readback channel
> tests), and how gems, chests and (if merged) secrets use the layers.
>
> **Phase 1 — start now, new files only** (`src/vision/` additions by `dichoptic-engineer`;
> a new folder `src/activities/glasses/` by `activities-designer` or an Opus builder; UI in new
> files under `src/ui/` by `ui-designer`):
> 1. Vision toolkit: reusable, tested building blocks on the layers — animated weak/strong
>    rings and reticles, world-space text/number sprites for a layer, half-symbol pairs
>    (one half per eye that complete each other), red-green dot pictures (a different dot
>    pattern per channel with a hidden shape that appears only with both eyes; generator +
>    material), tier presets (size / brightness / speed), a per-layer fade so objects can get
>    fainter smoothly, and a debug overlay for tests. Layer objects must stay depth-tested
>    against the world, never leak into the other channel or blue, and cost little.
> 2. Standalone mini-mechanics in `src/activities/glasses/`, placed with
>    `ctx.world.heightAt`/`isLand` near the plaza and existing anchors (no anchor changes):
>    **Glow-flies** (catch drifting weak-eye fireflies by running through them; faster and
>    fainter ones worth more), **Pip's lost toys** (follow a weak-eye paw-print trail to a
>    both-eye toy; works without the buddy code), **Odd one out pedestals** (three weak-eye
>    shapes, press the button under the different one; detail gets finer after hits and coarser
>    after misses within a session), **Line-up targets** (a weak-eye reticle that follows the
>    camera aim; hold it on a strong-eye target for a second to pop it), **Half-symbol gates**
>    (two halves, one per eye, show which of three arches to run through), **Dot-picture signs**
>    (the hidden shape is the answer to a nearby both-eye three-button pedestal).
>    Each pays gems through `ctx.profile.earn` if the economy is on `main` (code defensively),
>    has a wordless pictogram board, and never reveals a weak-eye position to the strong eye
>    through the main scene, the HUD or a positional sound.
> 3. Adaptive challenge (grown-up setting, off by default, behind the existing gate; labels in
>    plain game words such as "Auto challenge"): a gentle per-session staircase that nudges
>    weak-eye object brightness/size down and the other eye's dimmer up after successes and
>    back after misses, clamped to the calibrated limits in settings, never changing the saved
>    calibration itself. Plus a grown-up-only end-of-session summary screen (counts by kind and
>    tier, hit rates, in neutral words; no advice, no claims). Additive settings fields only.
>
> **Phase 2 — after `main` contains the economy and the merged attractions** (rebase first;
> coordinate through `docs/streams/glasses-depth.md`; additive changes, smallest diffs in other
> owners' folders): weave the toolkit into what exists — weak-eye perfect-bounce ring on the
> trampoline, parachute-open ring and gem-through-strong-hoop bonus in the skydive, boost-pad
> timing on the buggy/race if present, weak-eye skill-ready ring and combo number over the hero,
> a "real gem among fakes" variant at a few gem spots, dot-picture prize codes at the Gear Shack.
> Each as a small, optional, clearly rewarded layer on top of the existing fun.
>
> Quality bar: every mechanic is obvious to an 8-year-old from its pictogram board, fun without
> reading, and impossible to do with the weak eye shut — add an automated proof for each: with
> the weak layer hidden (`setLayerVisible`) the strong-channel frame carries no information that
> identifies the answer (compare frames across different answers), and the canvas-readback
> channel test holds for all 4 lens/eye combinations. Performance: each mechanic ≤ 6 draw calls,
> idle when the player is far. Work on branch `agent/glasses-depth` (subagent worktrees merged
> into it), change `src/types.ts` additively only, rebase on `origin/main` at least hourly, push
> often (plain push), keep `npm run verify` green, write `docs/streams/glasses-depth.md` (what
> was built, interface additions, how to test, what phase 2 touched), and tell the project owner
> when phase 1 and then phase 2 are ready to merge.
