Ready for owner playtest: **yes** (no blocker; two Pip majors in the follower's minutes 1–3 should be fixed before tagging v1.0)

# QA round 9 (main @ d22bda2, batch 8): release gate

Played 2026-11-12. Chromium SwiftShader, `vite preview` on 4420–4429, 960×540 keyboard unless noted, phone = 750×342
(iPhone 13 landscape) with CDP touch. Play is stepped (`&freeze=1`, `__rg.step(1/60)`) with real key/touch events in
between; `?test=1` teleports only for travel and for reading state. I cannot hear audio. `npm run verify` not run (green
on this commit: 395 passed). Scripts on branch `agent/qa-round9` in `scripts/qa9/` (copied from qa8, output now
`test-results/qa9/`, not committed). Logs in `scripts/qa9/logs/`.

Console errors: **0** in every run (3 five-minute sessions, sit-in-buggy, map board ×2, driver session with vault, hero
ring, Gear Shack, buggy, Scoops, secret paths, channel checks, 6 frame-time runs).
Download: `dist/` 15 MB raw, **8.7 MB** gzip -9 (budget 15 MB). Live site serves this build (`index-uj3vDW6G.js`).
Frame time (960×540 Low, spawn, round 8 method, alternated with a fresh build of 4fc165d): main 833 / 882 ms,
old 938 / 833 ms: **no regression** (machine slower today than in round 8 for both builds).

## Blockers

None.

## Majors

### M1 (buddy) Pip says "Follow me!" and starts the garage lead the moment the foam race starts
Deterministic, 2 of 2 follower runs (default glasses; green-left/weak-right).
Repro: PLAY, follow Pip: trampoline (25 s), then Pip leads to the foam course and says "Stand on the glowing ring to
start the foam race!" (67.8 s). Step on the ring: at race clock 2.9 s Pip's bubble shows **"Follow me!" with paw, WASD
and car icons** (74.5 s), and his lead target becomes the garage. A child who follows Pip leaves the course: my follower
ended pinned behind the striped stall on the course deck for 60 s (hero still from 108 s to 168 s) and the race took
~95 s of the 300 s session. Pip's how-to lines for the course come *after* the "Follow me!".
Screens: `test-results/qa9/first3-desktop-c1/t0298-L15.png` (bubble at race 2.9 s), `t0612.png` (stuck at the stall,
race 81 s). Log: `scripts/qa9/logs/c1-panda.txt`, `c2-green-right.txt`.
Likely cause: `nextLead()` (src/buddy/director.ts:1166) runs when the foam place is marked done by the walk-on start,
while the hero is still in `walk` mode, so the `quiet` guard (`inGame` = mode external, src/buddy/index.ts:1251) is
not set yet; the queued line's `valid` only checks `leadTo !== null` (director.ts:1182).

### M2 (buddy / world routes) Pip's first lead after the trampoline dead-ends at a fence; Carnival Row dropped
Deterministic, 2 of 2 runs. After "Up high, steer…" Pip says "Follow me!" toward Carnival Row (39 s), runs ~16 m and
stops at the blue rail fence by the lamp post near (43, −33). Pip and the child stand there 10 s with no line; then the
director logs `carnivalRow: unreachable: no progress for 10 s (22.8 m left)` and Pip silently re-routes 70 m west to the
foam course. Carnival Row stays "unreachable" for the rest of the session (never offered again).
Screen: `test-results/qa9/first3-desktop-c2/t0181.png`. Ticks 41–51 s in `test-results/qa9/first3-desktop-c2/log.json`.

Net effect of M1 + M2 on the first five minutes: a follower now visits 3 places (trampoline, foam course, garage/buggy)
instead of round 8's 10–11; Pip says "Now you choose!" at 186 s (three leads done).

## Round 8 findings re-checked

| Round 8 item | Result | Evidence |
|---|---|---|
| M1 foam run started with hero stuck beside the deck | **not reproduced** | 2 walk-on starts put the hero on the deck and he moved (c1/c2 ticks 68–108 s). The later 60 s stall is M1 above (stall prop, hero walking toward Pip) |
| M2 child sits in buggy during Pip's story | **mostly fixed** | In at 20 s: cues at 37, 44, 50, 52, 64 s, then **75 s silence** (64→139 s), then every 15–30 s. `logs/sit20.txt` |
| M3 vault door never visibly opens | **fixed** | 1 wrong pad then 3,1,2 with real keys: door gone, chamber and treasure visible, +5 gems. `drv/v9/00-door.png` → `03-open.png`, `04-inside.png`; sep 0 |
| M4 hero ring sparkle can't be won | **fixed** | Q fired ≥0.4 s into the sparkle: 3 of 3 hits (tier 1, 1, 2), 0 cancelled. Firing <0.25 s in "spoils" by design. Sep 0 |
| m1 Gear Shack from behind | **fixed** (walk) / partly (camera) | 12 of 12 directions reach the prompt, max stuck 0 s. From 180° the camera sits by the counter and the hero is out of view: `drv/shack9/d180.png` |
| m2 parked buggy aims at dot signs | **fixed** | W from the parking spot drives 76 m straight, no hit (`drv/buggy9/drive6.png`) |
| m3 dot-signs facing rule | not re-tested | |
| m4 spiral secret paths | **partly** | Trampoline: stone 15/15 in 41 jumps, jump to pedestal claims it. Lighthouse: best stone 5/26 in 80 jumps (38 falls) |
| m5 gates top hat | not re-tested | |
| m6 map board | **fixed** | reading view below |
| m7–m14 | not re-tested (minors) | |

## Batch 8 checks

- **Map board reading view** (`scripts/qa9/mapboard9.mjs`, `board-phone.mjs`): frog, panda, rex, all in the magic top
  hat, walk up with W from 13 m and stop at 3.8 m: camera eases in over 0.6 s (weight 0 → 1), the hero sits below the
  board, all 8 badges clear and readable in composite, R-only and G-only (`board9-960/rex-1-read.png`,
  `frog-1-read.R.png`, `.G.png`). Mouse look (pointer lock stubbed: headless cannot lock) cancels it in 0.3 s and it
  stays off. Sprint past and walk past at 4.5 m: weight 0 throughout. Buggy driven through the zone: 0. Phone 750×342,
  touch stick walk-up: eases in the same way; one-finger look drag cancels it; badges readable but the top row is
  slightly cut by the board roof (`board9-phone/rex-read.png`, minor).
- **Pip's first lead from spawn**: story 0–15.5 s, "Follow me" to the trampoline, gift at 19 s, first fun at 25 s,
  identical in 3 runs. Ignorer: one rescue at 20 s, calls to bounce pads (57 s), rocket pads (114 s), last call dot signs
  (240 s), idle chatter between; no line > 3 times (`logs/ignore.txt`).
- **Pip in vehicles**: rides in the back seat; cues as above (M2 r8 row).
- **Buggy findability**: Pip leads straight to it; with keys from the garage tool cart it is a 50 m walk with no stall
  and the E prompt shows on arrival (`drv/buggy9/arrive.png`). Nothing at the garage points to it (minor).
- **Vault door**: fixed (above). **Secret paths**: above. **Scoops**: from 5 angles straight to the counter, prompt on
  arrival; a keys-only child (Space/E/arrow) finishes a cone in 13 s, +1 gem, back in walk mode
  (`drv/scoops9e/p7-build-toppings.png`).

## Core rule spot checks (strong channel and blue delta must be exactly 0)

| Place | Glasses | Weak layer: strong / blue | Strong layer: weak / blue |
|---|---|---|---|
| Village vault (open) | red L, weak L | 0 / 0 (35 085 px) | 0 / 0 |
| Plaza, hero ring | red L, weak L | 0 / 0 | 0 / 0 |
| Village vault (closed) | green L, weak R | 0 / 0 | 0 / 0 (4 425 px) |
| Trampoline | green L, weak R | 0 / 0 | — |
| Map board reading view | green L, weak R | 0 / 0 | 0 / 0 |

R-only and G-only: HUD, reading view, phone HUD and end screen readable in both (`first3-desktop-c2/zz-end.R.png`,
`.G.png`). Wording grep (therapy/medical/patient/…): none in `src`, `index.html`, `public`. No violence seen.
`ASSETS.md` names every file in `public/assets/`.

## Minors

| # | Area | Finding | Evidence |
|---|---|---|---|
| m1 | buddy | Child sitting in the buggy: one 75 s silent stretch (64→139 s) | `logs/sit20.txt` |
| m2 | core camera | Phone reading view: board roof clips the top badge row a little | `board9-phone/rex-read.png` |
| m3 | core camera | Right after a Scoops cone the camera is tight, hero dithered, carried key fills the top | `drv/scoops9e/p17-idle-undefined.png` |
| m4 | core camera | Gear Shack approached from behind: camera at the counter, hero out of view | `drv/shack9/d180.png` |
| m5 | secrets | Lighthouse spiral: patient hopper 5/26 in 80 jumps | `scripts/qa9/logs/driver-results.txt` |
| m6 | secrets / camera | Falling off the trampoline path's top: camera inside the start sign | `drv/paths9/1-end.png` |
| m7 | buddy | "The tool cart gives your buggy silly new parts!" is said at the buggy, 50 m from the cart | c1 line 21 (186 s) |
| m8 | core camera | In the buggy the hero's duck hat hides the road ahead | `first3-desktop-c1/t0826-L23.png` |
| m9 | wayfinding | No sign at the garage pointing to the parked buggy | `drv/buggy9/face-buggy.png` |

## Definition of done (docs/BUILD_PLAN.md)

| Line | Status |
|---|---|
| Loads on Netlify; verify green in Chromium | **met** (live serves d22bda2's build; verify 395 passed). Edge/Firefox/Safari: **owner** |
| Weak-eye objects absent from strong channel, both lens/eye combos (automated) | **met** (e2e) + 5 spot checks above |
| HUD, player, world readable in R-only and G-only | **met** (spot checked) |
| ≤ 3 clicks to play; 5-minute session ends on the sticker-book screen | **met** (1 click; 3 sessions ended) |
| Every attraction works; no violence | **met** per rounds 8–9 and e2e (round 9 re-played vault, hero ring, Scoops, buggy, trampoline, foam start, secret path); no violence |
| `ASSETS.md` complete; credits in game | **met** (all files listed; credits screen in `src/ui/screens.ts`) |
| Performance budgets | download **met** (8.7 MB); 60/30 fps on real hardware: **owner** (`perf:check` green) |

## Not tested

Audio by ear; real glasses, calibration and crosstalk sliders on a real monitor; real phone and gamepad; real-time feel
(all stepped); Edge/Firefox/Safari; carnival, sumo, plane, dragon, balloon, bungee, race, Silly Zone, dot signs, gates
this round (round 8 played them; batch 8 touched them only for minors); a full foam race played properly; a real child.
