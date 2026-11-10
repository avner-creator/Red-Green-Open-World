# Stream B — characters (branch `agent/characters`)

Six playable, animated, CC0 characters, ready for the main build to wire into the player controller
and the character-select carousel. Nothing in the game uses them yet.

## The cast

| id | Name | What it is | Skill | Price | Emote clip | Height |
|---|---|---|---|---|---|---|
| `robot` | Bolt | the current white robot | doubleJump | free (default) | `Dance` | 1.70 m |
| `frog` | Hopper | frog in a lime space suit | superBounce | free | `Hop` | 1.64 m |
| `panda` | Mochi | red panda in a peach space suit | dash | 25 | `Dance` | 1.83 m (ears) |
| `bee` | Bumble | bee in a yellow space suit | glide | 40 | `Wave` | 1.56 m |
| `flamingo` | Rosa | flamingo in a pink space suit | doubleJump | 60 | `Spin` | 1.73 m |
| `rex` | Stomp | friendly lime T-rex | groundPound | 100 | `Dance` | 1.67 m (3.5 m long) |

All five skills are used. Backstories are in the catalog (one fun line each, no health wording).
Six good CC0 animated models were found, so **no robot re-skins were needed**.

## Files

- `public/assets/characters/{robot,frog,panda,bee,flamingo,rex}.glb`: 170–406 KB each (≈2 MB in
  total), meshopt + quantized, lossless WebP palette atlas. Load them only when needed (the chosen
  character, plus the carousel). Each has an `ASSETS.md` row (all CC0 1.0, Quaternius).
- `src/core/characters/catalog.ts`: the data module. Per character: `id`, `name`, `backstory`,
  `modelUrl` (relative to `import.meta.env.BASE_URL`), `scale`, `height`, `length`,
  `anims: Record<PlayerAnim, ClipRef>`, `emote`, `attach` (`head | face | back`: bone, offset in
  metres, optional rotation and outfit scale), `price`, `skill`, `cardColors`.
  Also `CHARACTERS`, `CHARACTER_IDS`, `getCharacter(id)`, `DEFAULT_CHARACTER = 'robot'`.
- `src/core/characters/load.ts`: `loadCharacter(def)` returns `{ object, anchors, mixer,
  play(anim | 'emote', rate?, fade?), update(dt) }`: scaled, feet at the origin, facing +Z, with
  outfit anchors that follow their bones. It sets the **meshopt decoder** on the GLTFLoader (the
  new GLBs need it; the old `player-model.ts` loader does not have one).
- `src/core/characters/preview.ts` + `tools/characters/preview.html`: the lineup preview (dev only,
  not in the game bundle).
- `scripts/shots-characters.mjs`: renders every character in every animation and saves full / R /
  G screenshots to `test-results/characters/` (lineups per animation, close-ups, anchor views).
- `tools/characters/`: the offline asset pipeline (its own `package.json`; not part of the game
  build). `build.mjs` downloads the pinned sources, removes the pistol mesh and every
  fighting/hurt clip (Death, HitReact, Punch, *Gun*, Weapon, Attack…), recolours, enlarges heads,
  adds procedural clips (`clips.mjs`, with a two-bone leg IK because these rigs pin the feet), then
  compresses. Output is byte-for-byte reproducible. `measure.mjs` prints head and body boxes.
- `tests/core/characters.test.ts`: checks the catalog against the real GLB files (every
  `PlayerAnim` and emote clip exists, attach bones exist, ≤ 600 KB, meshopt, no banned
  clips/meshes, two free, all skills used, no health words).

## Red/green readability

Suits were repainted per character (they were all the same grey) in light colours that stay
bright in both channels, with near-black gloves, boots and collar for contrast. The T-rex went from
dark realistic greens to a light lime body with darker back markings and a cream belly. The robot
uses the same both-channel palette as the current player. Checked in `lineup-*-R.png` and
`lineup-*-G.png` against the game's grass tone; every character reads by brightness and
silhouette in each channel alone. Heads are 1.35× (animals) and 1.25× (rex), for more personality
and easier recognition at camera distance.

## Animation mapping notes

- Astronauts: `fall` = `Jump_Idle` (looping in-air pose); `cheer` = `Yes`; `sit` = procedural
  `Sit` (thighs forward, hands on a wheel); `flop` = procedural starfish `Flop` (the existing
  tumble in `player-fx` still spins the body).
- Robot: `fall` = `Jump` started at 45% (as the current player-model does), new `Flop` clip.
- Rex: only Idle/Walk/Run/Jump exist in the pack; `Dance`, `Wave`, `Fall`, `Flop`, `Sit` are
  procedural (tail wag, tiny-arm wave). `cheer` = `Jump`. Its `back` anchor lies along the spine
  (rotation −90° about X).
- `ClipRef.startAt` (0..1) and `ClipRef.rate` are honoured by `loadCharacter().play`.

## For the main build (no shared files were changed)

1. Optional `package.json` script: `"shots:characters": "node scripts/shots-characters.mjs"`.
2. Player wiring: swap `createPlayerModel` for `loadCharacter(getCharacter(id))` (or copy its
   anchor code). Keep the root → squash → spin hierarchy; put `object` under `spin` with
   `position.y = -centre`. Outfits authored for the robot can use `anchor` directly; the anchor
   `scale` already sizes them up for the bigger animal heads.
3. Rex is 3.5 m nose to tail; the 0.35 m capsule is fine for the ground, but the camera distance
   could grow by ~1 m while playing it, and its tail may poke through walls.
4. Credits (`src/ui/credits.ts`): add `{ item: 'Ultimate Space Kit, Animated Dinosaur Pack', by:
   'Quaternius', license: 'CC0', kind: 'model' }`.
5. Skills are only ids here; their behaviour is the main build's job.

## How to test

```bash
npx vitest run tests/core/characters.test.ts
```

```bash
node scripts/shots-characters.mjs
```

```bash
cd tools/characters && npm install && npm run build
```

Live preview: `npm run dev`, then open `/tools/characters/preview.html` (buttons switch the clip).
