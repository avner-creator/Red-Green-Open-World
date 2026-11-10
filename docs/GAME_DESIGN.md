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
5. **Balloon Field**: a hot-air balloon rises to about 300 m. Jump out → freefall → open the
   parachute (Space) → glide and land on target rings for bonus gems.
6. **Lake and beach**: a splashy landing zone, a floating platform and a little lighthouse.
7. **Silly Zone** (sandbox silliness): a giant bouncy ball, launch pads, a "flop" button
   (ragdoll on demand), and wobbly inflatable characters. Everything is comic and nothing is hurt.

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
Levels, accounts, saving progress between sessions, multiplayer, story/dialogue, shops,
any combat.
