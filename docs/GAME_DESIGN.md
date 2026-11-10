# Game design: Red-Green Open World

## Pitch
A tiny, gorgeous island you can explore for **5 minutes**. Drive a bouncy car, ride a horse,
bounce on a giant trampoline, skydive from a hot-air balloon and bungee off a bridge. Hidden
everywhere are **Glow Gems** and secrets that **only your weaker eye can see** through the
red-green glasses. Find as many as you can before the sun sets.

## Audience and session
- Ages 8–13, often in a vision-therapy practice or at home. One session = **5 minutes**
  (a grown-up can change it to 3–15). No levels, no saving progress between sessions, and no
  multiplayer. Each session is fresh, with a score/sticker summary at the end.
- Must be **easy to start**: Play button → 10-second wordless tutorial → playing.

## Art direction
- **Polished stylized-realistic**: think a high-end animated film diorama, not photoreal.
  Physically based materials, HDRI sky, soft shadows, ambient occlusion, gentle bloom, golden-hour
  lighting that moves toward sunset as the timer runs down.
- Why not photoreal (GTA/RDR look): that needs custom AAA art. Free assets in one consistent
  stylized look will look **far more professional** than mixed photoscans. Also, everything is
  seen through red/green lenses, so **shape, lighting and contrast matter more than hue**.
- Readability in both color channels is a hard requirement (see CLAUDE.md).

## The island (about 400 × 400 m, compact and dense)
1. **Starter Village**: a small main street, a fountain plaza (spawn point), and a garage with 2–3
   cars (original designs: buggy, pickup, mini convertible).
2. **Ranch**: fences, barn, 2 horses you can mount (E). Trot and gallop, plus a little jump.
3. **Bouncy Park**: giant trampoline (each bounce goes higher, up to about 40 m), bounce pads,
   ramps.
4. **Canyon Bridge**: bungee platform. Jump, stretch, boing back up, then release into the lake.
5. **Balloon Field**: a hot-air balloon rises to about 180 m in about 10 seconds (a 5-minute
   session can't afford a slow ride). Jump out → freefall → open the
   parachute (Space) → glide and land on target rings for bonus gems.
6. **Lake and beach**: a splashy landing zone, a floating platform and a little lighthouse.
7. **Silly Zone** (sandbox silliness): a giant bouncy ball, launch pads, a "flop" button
   (ragdoll on demand), and wobbly inflatable characters. Everything is comic and nothing is hurt.

## The player and the feel of the big moments
- **Player character**: a friendly explorer robot (CC0 "RobotExpressive" by Quaternius: idle,
  walk, run, jump, dance, wave, thumbs-up). Outfits attach to its head and back.
- **Flop** (F or a big fall): a comic tumble (spin + squash + boing sound), then the robot pops
  back up. It is an animation, not a physics ragdoll: cheaper, safer, and always funny.
- **Cars and horse** are arcade: they can't flip for long, can't get stuck (R respawns next to
  the vehicle), and can't leave the island (a soft invisible boundary + shallow water turns you
  around).
- **Skydive feel**: wide FOV in freefall, wind streaks and rising wind sound, a big clear ground
  target, steer with WASD, Space opens the parachute (auto-opens at 40 m, so nobody "crashes"),
  then a slow, easy glide. Gems form a trail down to the rings.
- **Trampoline feel**: each bounce is higher (up to 40 m), camera pulls back, squash and stretch
  on the mat, gems at 10/20/30/40 m.
- **Bungee**: E on the platform → jump → elastic stretch (visible cord) → two or three boings →
  lowered gently to the lake shore. Gems under the bridge are grabbed on the way.

## Collectibles and rewards (the therapy hook)
- **Glow Gems (weak-eye-only)**, about 60 across the island: on rooftops, on trampoline peaks,
  along skydive paths, under the bridge. A soft chime when you're near.
- **Secret paths (weak-eye-only)**: floating stepping stones and arrows that lead to bonus areas.
- **Treasure chests (both-eye lock)**: the key glows for the weak eye, the lock for the strong eye.
  You need both to open a chest. Chests give **outfits**: hats, capes, helmets, glasses frames,
  and car and horse colors. You can wear an outfit right away.
- **Stunt stars**: for big bounces, long glides and bullseye landings. Visible to both eyes.
- **End screen**: a sticker book showing gems found, chests opened, best stunt and outfits
  unlocked. Big and celebratory, with no failure state.

## Controls
WASD/arrows move · mouse look · Space jump/parachute · Shift sprint · E use/enter/mount ·
F flop (ragdoll) · R respawn · Esc pause. Full gamepad mapping. On-screen icon prompts.

## Grown-up settings (behind a gate)
Lens on the left eye (red/green) · weaker eye (left/right) · weak-eye strength · crosstalk
calibration · strong-eye contrast · session length · audio volumes · graphics quality
(Low/Medium/High) · reset.

## Out of scope for the demo
Touch/mobile controls, Levels, accounts, saving progress between sessions, multiplayer, story/dialogue, shops,
any combat.

## Fun and motivation pass (owner playtest feedback, 2026-11-10) — overrides earlier sections where they differ

**Why**: the first playable was pretty but tame. Gems had no purpose, attractions were far apart
and unexplained, walking was slow, the robot had no personality, the music was dull. The weak-eye
gems must be the thing every kid *wants*, because wanting them is what makes the weak eye work.

1. **Gems are money.** The HUD shows a wallet. Gems buy things and are the only currency, and
   gems are only visible to the weak eye.
   - Values: normal gem 1; **mega gems** (bigger, different shape, weak-eye-only) worth 5 at thrill
     spots (trampoline peak, skydive trail, mid-air after launch pads, on the road for the car).
   - Streak: gems collected within 3 s of each other build a combo (×2, ×3 up to ×5) with rising chime.
   - Gems **respawn** about 45 s after pickup, so there is always something for the weak eye to hunt.
   - The wallet and everything unlocked are **kept between sessions** (localStorage profile; a
     grown-up can reset it). This replaces "no saving between sessions".
2. **Things to buy (Gear Shack kiosk on the plaza + wardrobe in the pause menu).**
   Characters, outfits (hats, capes, glasses, backpacks), buggy paints, trails (sparkle, rainbow,
   bubbles behind the player), emotes. Prices 5–100 gems; chests still give exclusive items for free.
   Buying is instant, wearable right away, with a big celebratory unlock moment.
3. **Tickets.** The balloon ride costs 5 gems (the first ride each session is free). Rocket pads
   cost 3. Trampoline, bounce pads and the buggy are free. Nothing can soft-lock: free fun is
   always next to gems.
4. **Missions.** Three wordless mission cards per session (icon + number: "collect 10 gems",
   "bounce 30 m", "land in the rings", "open a chest", "drive through 5 gems"), each paying a gem
   bonus, and a jackpot for all three. Shown small on the HUD and on the end screen.
5. **Characters with personality.** Onboarding = pick your character (big carousel, each with a
   name, a one-line backstory, a signature emote and one **skill**). Two are free, the rest are
   bought with gems. Skills: double jump, glide, dash, super bounce, ground-pound. Characters are
   CC0 animated models if they can be sourced quickly (Quaternius), otherwise bold re-skins of the
   robot with different silhouettes (add-on parts), colours and animations.
6. **Bigger, sillier thrills (still non-violent).** Trampoline: the first bounce is already ~12 m,
   then ×1.5 up to ~45 m (150 ft); flips and spins in the air with the move keys score trick stars;
   landing off the mat is a comic flop. Bounce pads 8/15/25 m. Rocket pads fling you ~60 m across
   the park into a bouncy landing net. The buggy gets ramps and a loop of mega gems. Everything
   wobbles, boings and confetti-pops.
7. **Finding your way.** Every attraction is a landmark: a tall both-eye beacon (bobbing balloon
   marker with the attraction's icon) visible across the island, a big icon signpost at the plaza
   with arrows to each attraction, an icon compass strip on the HUD, and at each attraction a
   picture sign showing what to do in 2–3 pictograms. Attractions are pulled closer to the plaza
   where the terrain allows.
8. **Faster on foot.** Walk 6.5 m/s, sprint 11 m/s.
9. **Controls help.** A "?" button on the HUD (and H / gamepad Back) shows the controls card at
   any time; it is also in the pause menu.
10. **Music.** Upbeat, catchy, and it changes with what you do (plaza, driving, sky, last 30 s).
    Use CC0 tracks (OpenGameArt, with ASSETS.md rows) if good ones are found; otherwise a much
    livelier generative score.
11. **Touch/mobile controls**: planned for v2 unless a parallel workstream delivers them (see
    docs/PARALLEL_WORK.md).
