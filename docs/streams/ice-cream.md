# Stream K — Scoops, the ice-cream shop (branch `agent/ice-cream`)

Folder: `src/activities/scoops/` (registered in `src/activities/index.ts`: import, create,
update, dispose). No new assets (everything is procedural), so no `ASSETS.md` rows.

## What it is

An open-fronted ice-cream parlour: candy-striped pillars, a scalloped raspberry/cream awning, a
giant three-scoop cone on the roof, a checkered floor, a serving counter (flavour tubs, sauce
bottles, a toy sprinkles cannon, a cone holder, three numbered candy jars), a back counter (cone
rack and six topping bowls) and a terrace with a parasol table. Two friends (other heroes from the
character catalog) hang out on the terrace.

**Play**: walk to the counter, press **E** (the hand prompt). The hero hops over the counter and
the camera swings round to face them across it. Build a cone, one row of picture tiles at a time:

1. **Cone**: waffle, chocolate-dipped, rainbow.
2. **Scoops** (up to 5): vanilla, chocolate, strawberry, mint, blueberry. The tower wobbles like a
   springy pendulum. Wait for the wobble to settle and even five scoops stand; pile them on while
   it still sways and the top flies off and splats on the counter (two scoops always stay). The
   friends laugh, nobody minds.
3. **Sauce** (or skip): fudge, strawberry, caramel.
4. **Toppings** (up to 3): gummy worms, popcorn, a whole pickle, a rubber duck, the sprinkles
   cannon (it fires), marshmallows. Plus the three **candy jars** (see the glasses twist), then
   the **eat** tile.

**Eat**: the cone goes to the hero's mouth, three big chomps (squash and stretch, camera bumps), a
gulp, stars and a fanfare, the friends dance, and the hero hops back out in walk mode with a
**30-second effect** for each topping (no topping: the top scoop decides):

| Topping | Effect | Flavour (no topping) |
|---|---|---|
| sprinkles | rainbow trail (striped ribbon on the ground) | strawberry |
| popcorn | moon-jump (3× jumps, slow fall, never a flop landing) | — |
| pickle | giant head (the head bone swells to 2.3×, hats follow) | chocolate |
| rubber duck | bubble burps (every 3 s, with a "boing" and a squash) | blueberry |
| gummy worms | super speed (~1.6× sprint on the ground) | mint |
| marshmallows | tiny hero (45 %) | vanilla |

Effect chips with a countdown ring sit on the left of the screen.

**Recipe card**: a friend's order (pictures only: cone, scoops, sauce, topping, "+4 gems") on the
right. Match it (scoops in any order, extra toppings allowed) and that friend gets the same cone
and chomps along with you.

**Glasses twist**: the **secret topping of the day** (star candy, golden cherry, glow gummy bear
or rocket pop, by date) floats above one of the three identical candy jars and is registered only
with `ctx.vision.add(..., VisionLayer.WeakOnly)` (layer materials + a glow halo + sparkles). It is
on show whenever nobody is building, so a kid with glasses spots it from the terrace. Pick that
jar's tile and the treat jumps onto your cone (still weak-eye-only) and adds its own extra effect
plus 2 gems. A wrong jar pops open empty and the treat hops to another jar (the weak eye sees it
move); after two misses the jars close for that cone. The tiles and jars are identical for both
eyes apart from their 1/2/3 dot numbers; nothing in the main scene, HUD or audio says which jar.

**Controls** (all through `ctx.input.state`): left/right (A/D, stick, touch joystick) chooses a
tile, jump (Space, A, touch jump) adds it, use (E, X, touch hand) is next/eat, respawn (R, Y)
leaves. Tiles can also be **clicked/tapped, or dragged up off the bar** onto the cone; a round exit
button (above the skill button) leaves on touch. A bobbing 3D arrow points at the counter item the
selected tile stands for. Key hints follow the input device; nothing needs reading.

**Economy** (defensive: works with or without Stream C): the first cone each session is free;
after that `ctx.profile.spend(3, 'ticket')`. A child who can't pay sees a gem icon with how many
more they need (nothing else is locked). Prizes via `ctx.profile.earn(n, 'mission')`: 1 per cone,
+4 for a matching card, +2 for the secret. Leaving before eating refunds the ticket
(`earn(price, 'ticket')`). Without `ctx.profile` everything is free and no gems are paid.
Each eaten cone emits `stunt` (1–3 stars) and `ui:toast { icon: 'check' }` as the done signal.

## Site

No `iceCream` anchor on `main` yet, so the parlour uses `anchors.iceCream` if present, else
**x = 24, z = −2, yaw = −1.22** (front faces the plaza and the spawn point), ground y = 18.0.
It is the open flat ground between the plaza disc and Bouncy Park, between the `park` and `east`
roads, clear of every anchor radius. Footprint: a raised floor (top 0.5 m, two 25 cm steps all
round) of 10 × 9.4 m; clear radius **6.4 m** around (24, −2) plus the terrace to local z = +5.4.
Gem spots nearest: (24, −14) and (15, −9), both outside the footprint.

## Requests for the main build (I did not edit these files)

1. **Anchor**: add `iceCream` to `AnchorName` (`src/types.ts`) and to `ANCHORS` in
   `src/world/layout.ts`: `iceCream: { x: 24, z: -2, radius: 7, yaw: -1.22, onLand: true }`,
   with a scatter/grass keepout (radius ~7.5). Grass tufts grow up to ~0.4 m there now; the
   raised floor hides them.
2. **Old kiosk**: the small ice-cream kiosk in Bouncy Park (`kiosk()` in `src/world/park.ts`, at
   94.5, −36) can be removed now that Scoops exists (or kept as a "branch" — it does nothing).
3. `StuntKind`: add `'scoops'`; the cone currently reports as `'bullseye'` so the stars count.
4. `PlayerApi`: a small hook such as `setMoveScale(k)` / `setGravityScale(k)`. Super speed and the
   moon-jump float currently scale `ctx.player.velocity` directly after the player update
   (the interface calls it read-only); the jump itself uses `player.launch`.
5. `IconName`: an `iceCream` icon for the counter prompt (uses `'hand'` now).
6. Optional `SfxName`s `'chomp'`, `'burp'`, `'slurp'` (now `'bump'`, `'boing'`, `'splash'`).
7. With Stream C merged: `TicketKind` `'scoops'` if tickets should go through the economy's
   ticket events instead of `profile.spend` directly.

## Performance

Measured at Medium, 640×360, from the plaza looking at the parlour with both friends loaded:
**+9 draw calls** for the whole frame, about **33k triangles** in the colour pass (parlour 12k
matte + 8k gloss, jars 1.2k, friends 12k), shadows from a 160-triangle stand-in plus two capsule
stand-ins for the friends (layer 7). The build station adds the cone (≤ 7 small draws) only while
in use. Nothing but active effects updates when the player is more than 45 m away; the friends'
GLBs load lazily the first time the player comes within 45 m.

## Tests

- Unit (`tests/activities/scoops.test.ts`, 17): wobble (settled 5-stack never topples, rushed
  stack always topples, short stacks never, frame-rate independence), builder flow, caps, cursor,
  secret jars (right/wrong/closing), recipes (deterministic, forgiving match), effects mapping,
  secret of the day, tickets, scoring, effect easing, friend picking.
- E2e (`tests/e2e/scoops.spec.ts`, ~16 s): a full round (mouse click on a tile, keys for the
  rest, secret jar, chomp, effects, back in walk mode at the counter, the head really grows), a
  toppling tower, leaving with R and walking away, and the **channel test**: the secret topping
  changes only the weak channel (strong channel and blue bit-identical) for all 4 lens/eye
  combinations.
- Screenshots full/R/G: `npm run build && node scripts/shots-scoops.mjs` →
  `test-results/ice-cream/` (exterior, station with scoops, toppings, secret found, chomp,
  effects).

## Known limits

- The camera override has no pitch, so a player who tilted the camera far up or down before
  opening the station keeps that tilt (it still frames the counter).
- The giant head scales the character's `Head` bone; a model without bones swells its head anchor
  instead (only the hat grows).
