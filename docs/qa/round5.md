# QA round 5 (main @ dbc75bb, batch 4)

Played 14:15–15:50 UTC on a quiet machine (one other builder). Chromium SwiftShader, `?test=1&freeze=1&quality=low`,
real keyboard / CDP touch through the input layer, time via `__rg.step`, real PLAY click. 960×540 desktop and
iPhone 13 landscape (750×342). Screenshots in `test-results/qa5/` (not committed). I cannot hear audio: voice was
checked only as "which clip ids were requested" (`__rgBuddy.voice()`), never listened to.

Scripts (all on `agent/qa5`):
- `scripts/qa5/first3.mjs [desktop|phone] [secs] [followSecs]` — first minutes as a new child, obeying Pip.
  Env: `QA_DEST=1` walk to Pip's lead point instead of Pip's body (the stuck-on-Scoops run); `QA_TAG` output suffix.
- `scripts/qa5/driver.mjs` + `scripts/qa5/steps/*.js` — interactive driver (copy of qa4's). Start:
  `QA_QUERY='&freeze=1&quality=low' RG_PORT=4378 QA_CTL=4476 node scripts/qa5/driver.mjs`, then
  `curl --data-binary @scripts/qa5/steps/00-helpers.js 127.0.0.1:4476/run`, `01b-play.js`, then any step.
- `scripts/qa5/hud-overlap.mjs` — HUD rectangle overlaps per profile.
- qa4b scripts reused unchanged for dino, bubble soccer, carnival, sky (foam.mjs is broken against the new API).

## Table

| Item | Works | Clear (non-reader) | Fun | Top defect |
|---|---|---|---|---|
| Title / PLAY | yes | yes: PLAY is huge, Pip points at it | 4 | — |
| Dressing room (title + kiosk) | yes (try, buy, wear; hat stays on when changing hero) | grid is all identical cone icons | 3 | item pictures never swap in (M4) |
| Hero select + power pick | yes; 10 heroes, 5 free, 3 powers each | yes | 4 | locked powers look the same as free (no lock glyph seen) — minor |
| Using powers | yes: double jump (2.2 m vs 1.0), dash (31 m vs 14), bounce ball (20 m); glide unclear on flat ground; rocket boots needs a hold (a tap = 0.7 m) | chip icon changes per power | 3 | camera behind the plaza chevron sign hides the hero (`drv/pw/dash.png`) |
| Pip story (6 beats) | yes, all 6 clip ids in order, no `speech` fallbacks | yes (pictogram bubbles) | 4 | — |
| Pip leads to trampoline | yes (reached at 25 s both profiles) | yes | 4 | — |
| Pip leads to the 2nd attraction | **no** (desktop: 250 s idle next to the hero) | no | 1 | B1 |
| Rescue at a fence | fires but never frees | no | 1 | M1 |
| Free duck hat | yes at 25 s (gifts enabled) | yes ("present" bubble) | 4 | — |
| Unasked pauses | none in 4 runs (pauseLog empty); Fun Pass / help Esc close without pause | — | — | workshop Esc opens the pause menu (m3) |
| Buggy free drive | yes | yes | 3 | hero hidden behind Pip from the chase camera (M2) |
| Buggy race | starts, ends with podium/result | yes | 2 | car wedged off track 135 s, no reset (M3) |
| Gear Shack kiosk + workshop | yes (bought duck hat, duck ornament) | yes | 3 | — |
| Gem hunt 60 s | partly (my bot was weak: +1 gem) | — | ? | not verified |
| End screen → play again | yes, no intro replay | yes | 4 | — |
| Radio | M cycles 11 entries, button cycles, chip shows | word-only chip ("Zoom", "Boo!") | 3 | — |
| Silly Zone | win (6/6, 3★, +5) and time-out (1/6, 1★) | yes, board pictogram + arrows | 4 | — |
| Balloon | auto-board by walking in; W held all the way lands safely | yes | 4 | — |
| Vault | opens with the right pads | rule board good; R/G split correct | 3 | walking across pads counts wrong steps (M5) |
| Chest | key, carry, open by stepping on the symbol | E prompt with lock does nothing useful | 3 | m4 |
| Dino sumo | yes 3★ active, passive scores 0 | yes | 3 | — |
| Bubble soccer | yes, ball solid (min 1.09 m vs 1.07) | camera wide and high, readable | 3 | — |
| Carnival (5 booths) | yes, 4 wins + 1 second | yes | 3 | — |
| Foam course | runs (autopilot lap), countdown | — | ? | camera inside hero/bush (m5) |
| Plane / dragon | both complete with result | yes | 4 | — |
| Trampoline surprises | yes: kicks, bonus stars, up to 64 m | yes | 5 | — |
| Toys (5 kinds) | solid, no pass-through, no launch out of world | — | 3 | — |
| Map board | yes, visible from spawn (left edge) | yes | — | bench right in front of it (m6) |
| Six mini-games, weak layer | strong channel unchanged at all six sites (diff R-only); odd-one-out: shapes vanish with the weak layer hidden, walking onto the answer button + E = hit, +2 gems | board is pictures only | 3 | other five rounds not played |
| Phase 2 `bounce` layer | ring R-only, a timed press scored "hit/perfect" | — | 4 | other five layers not played |

## Defects

### Blocker
- **B1 (buddy) Pip stops leading after the trampoline.** A child who follows Pip stands still for the rest of
  the session: `lead.to = bouncePads`, `state = run`, but Pip sits at the hero's feet from 47 s to 300 s and
  only says idle lines ("Is it snack time?", "I smell adventure!", "Hurry! Sunset is coming!"). Hero at
  (52.6, 19.0, −31.2) on the trampoline rim. Repro: `RG_PORT=4387 QA_TAG=-long node scripts/qa5/first3.mjs desktop 300 300`;
  `test-results/qa5/first3-desktop-long/t0804.png`, log.json. On the phone run Pip set off again only after ~95 s.

### Major
- **M1 (buddy / activities-scoops) Stuck on the Scoops counter; rescue never frees.** Walking toward Pip's lead
  point the phone hero ended on the Scoops counter (y ≈ 20) and stayed 100+ s; 14 "This way!" rescues, no hop-free.
  `QA_DEST=1 RG_PORT=4375 node scripts/qa5/first3.mjs phone 180 120`; `test-results/qa5/first3-phone/t0420.png`.
- **M2 (core vehicles / buddy) While driving, the chase camera shows Pip, not the hero.** Pip in the back seat
  covers the driver; the frog is invisible in every driving/race frame (`test-results/qa5/drv/b/drive-0010.png`,
  `drv/r/t040.png`; hero is visible from the front in `drv/w/01-open.png`).
- **M3 (activities-race) Race car wedged off the track, no rescue.** Steering toward the racing line, the car left
  the line near s≈150 and sat at (−0.1, 74.8) with W held for 135 s until the rivals finished; no auto-reset, no
  hint. Steps `22-race.js` (`drv/r/t040.png`). (Autopilot run finishes fine: `24-race-podium.js`.)
- **M4 (ui wardrobe / itemArt) Item pictures never swap in**: with `__rgGear.enablePreviews(true)` and 12 s of
  real-time loop, 0 of 23 tiles got an `<img>` although `item.preview()` returns a PNG data URL; the grid is 23
  identical cone icons (`drv/t/09-wardrobe-fresh.png`, `drv/g/03-bought.png`). Previews are opt-in in test mode,
  so confirm in a real build; suspect the queue's `active` check (`src/ui/itemArt.ts` / `wardrobe/screen.ts:111`).
- **M5 (activities-secrets) Vault pads trigger when you walk across them.** Pads are ~2.3 m apart in an arc;
  walking from pad 2 to pad 0 crosses pad 1 and resets the sequence (misses 15→17). Detouring around works.
  `95-vault.js` vs `96-vault-detour.js`.
- **M6 (core player) Hero walks into the parked buggy from behind** (centre 0.25 m from the car centre).
  `E0-passthrough.js`; `drv/pt/buggy-0.0.png`.

### Minor
- m1 (buddy) Bubble jumps 340–509 px in one frame twice per run (story:5 at 18 s, intro:jump at 27 s), plus a
  ~30 px hop at the start of every line. No overlaps, no off-screen. first3 logs "JUMPS".
- m2 (ui touch) Phone: the lightning (skill) button covers the lower half of the wardrobe button and its "!"
  badge (`first3-phone-b/t0299-L14.png`).
- m3 (activities-workshop) Esc in the workshop opens the pause menu over it; Esc closes the kiosk shop
  (`drv/w`, `42-workshop.js`).
- m4 (activities-chests) At the chest the prompt is "lock + E", but E does nothing; the child must step on the
  matching symbol tile (`drv/ch/03-at-chest.png`).
- m5 (core camera) Camera inside a tree at the foam booth (`drv/foam/00-booth.png`), inside the hero's head at
  the foam countdown (`drv/foam/01-start.png`), inside a bush on the race result (`drv/r2/result-095.png`).
- m6 (world) A bench stands right in front of the map board (`drv/map/01-board.png`).
- m7 (buddy) In the Scoops game Pip keeps saying "This way, buddy!" every 25 s for 140 s (`first3-desktop`).
- m9 (core camera) The plaza chevron sign sits between camera and hero when walking east from spawn (`drv/pw/dash.png`).
- m8 (tests) `scripts/qa4b/foam.mjs` fails on the current `__rgFoam` API.

## Not tested / not verified
Audio (cannot hear). NPC pass-through (folk do not load in test mode). Gamepad. Five of six Phase 2 layers
and full rounds of the six mini-games (only the channel split was checked). Glide and rocket boots only briefly.
Gem hunt with a mega gem by a child (bot too weak). R-only/G-only of every new screen (title, HUD, vault,
bounce ring checked). Real phone, real glasses.
