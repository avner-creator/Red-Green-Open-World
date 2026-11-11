# QA round 3 (main @ 7cda79b)

Scripts: `scripts/qa3/*.mjs` (Playwright, SwiftShader, 960×540, deviceScaleFactor 1, `?test=1`).
Screenshots: `test-results/qa3/<script>/` (not committed; rerun the scripts). Every screenshot named
below was looked at by eye.

## Defects

### Blocker
None found.

### Major
1. **Camera ends up inside trees and props** (core, camera rig). Whole screen is a tree canopy or a
   sign: `firstplay/t0030.png` (tree at the island edge), `sites/carnivalRow-15m.png` (green mesh),
   `sites/iceCream-15m.png` (Gear Shack sign overhead), `sites/gearShack-5m.png` (hero's head fills
   the screen at the shack), `quality-low/chest-north.png` (inside the plaza fingerpost).
2. **No-reading first minute still fails if the child does not follow Pip** (buddy). A child holding W
   from spawn walks off the plaza to the island-edge fence in ~20 s and stays stuck there for 30 s+
   (`ui/11-play-t40..60.png`, `firstplay/t0050.png`). The intro steps advance on timers whatever the
   child does: "Jump! Hold the button!" is said 50 m from the trampoline (`firstplay/t0030.png`),
   "Goals!" points at the ticket/flame box. Pip's lines are text with a small pictogram; the stuck
   nudge only fires after 40 s without progress.
3. **Pip's intro leads toward the nearest Glow Gem spot** (buddy / vision rule 6).
   `src/buddy/director.ts:387` `lead(gemWay())`, `src/buddy/index.ts:280`: Pip (both eyes) walks up
   to 7 m in the gem's direction snapped to 8 sectors. That gives the strong eye a direction to a
   weak-eye-only object. Needs an explicit decision (allow and log in DECISIONS.md, or lead to a
   gem *area* sign instead).
4. **Chest 0 on the plaza (11, 13) is crammed against a fingerpost** (world / activities/chests).
   The strong-eye lock symbol overlaps the signpost arms (`quality-low/chest-east.png`,
   `vision/chest-redL-weakleft.png`) and the camera clips the sign from the north side.

### Minor
5. At a chest, Pip's scheduled tip "Compass shows fun places!" replaces "Find the key!"
   (`quality-low/chest-east.png`) (buddy).
6. Help card: Shift (sprint) and Q (skill) share the lightning icon; the "WASD + circular arrow" row
   is unclear (`ui/03-help-keyboard.png`) (ui).
7. HUD goals box (ticket icon, "0 | flame 0/3") does not read as "goals" (`firstplay/t0042.png`) (ui).
8. Settings → Game: the "Settings · Gems and items (hold)" sub-label is tiny and runs into the Reset
   header (`ui/05b-settings-game.png`) (ui).
9. White jagged shards over the hero for a few frames right after Play (`ui/10-play-t0.png`);
   looks like a glitch (core or ui, spawn effect).
10. Dragon roost sits ~20 m up a cliff on the spawn side (`sites/dragonRoost-15m.png`); confirm a
    walkable path exists (world).
11. Pip runs off-screen while his intro bubble is up (`firstplay/t0009.png`, `t0012.png`) (buddy).
12. A white pole passes through the hero at the island-edge fence corner (`firstplay/t0050.png`) (world).
13. Fun Pass: 24 greyed stamp icons are small and hard to tell apart (`ui/12-funpass.png`) (ui).
14. `scripts/boot-requests.mjs` times out on the Play click on this machine (real-time loop on
    SwiftShader); boot request sizes not measured (scripts owner).

## Good
- Channel rule exact in all 4 lens/eye combos at odd-one-out, dot signs, glow-flies and a chest:
  hiding the weak layer changes only the weak channel, hiding the strong layer only the strong
  channel, blue never; HUD/Pip DOM text unchanged by layer visibility (`scripts/qa3/vision.mjs`).
- Title, hero select, help, gate, settings, calibration, Fun Pass, end screen and HUD read in R-only
  and G-only.
- Chest prompt shows a key icon + E from every side; Pip says "Find the key!" with a key pictogram.
- Trampoline walk-on bounces from all four sides (to y≈31), also after a balloon ride.
- Balloon: first ride free, rises to ~190 m, lands back on foot.
- Mini-game sites each have a how-to board with three pictograms; plaza post 3 and compass readable.
- No medical/therapy wording in `src/`, `index.html` or the built bundle; no brands; no violence
  strings. All 12 `public/assets` files have CC0 rows in ASSETS.md.

## Numbers
- dist: 11.4 MB raw, 7.6 MB gzip, 7.2 MB brotli (everything, incl. music and all heroes).
- perf-report: Medium worst view `vault` 208 draws / 470k tris (+ shadow 40/81k), Low worst `spawn`
  130 draws / 253k tris. Frame time not measured (SwiftShader only).

## Not verified
HUD explain bubbles (clicking HUD items showed none); a full round of every attraction and
mini-game (only balloon and trampoline played here; the rest rely on e2e); rocket pads at 0 gems
(no E target, step-on not tried); trees popping on Low while moving (static shots only); boot
request sizes; audio; real glasses; gamepad and touch.
