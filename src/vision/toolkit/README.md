# Vision toolkit (`src/vision/toolkit`)

Small building blocks for the weak-eye / strong-eye layers. Import from `'../../vision/toolkit'`.
A factory builds a `THREE.Object3D` and a small controller. **You** register the object on its layer:

```ts
import { VisionLayer } from '../../types';
import { createRing } from '../../vision/toolkit';
const ring = createRing({ radius: 0.6, progress: 0.5, pulse: 0.3 });
ring.object.position.set(x, y, z);
ctx.vision.add(ring.object, VisionLayer.WeakOnly); // or StrongOnly
// every frame: ring.update(dt); on teardown: ctx.vision.remove(ring.object); ring.dispose();
```

Every controller has `setFade(0..1)`, `update(dt)` and `dispose()`. Options shared by most blocks:
`level` (grey "pop" 0..1, default 1), `opacity` (coverage 0..1, default 1), and
`facing: 'billboard' | 'ground' | 'wall'` (billboard = faces the camera in the vertex shader, no CPU
cost; ground = flat, facing up, lift it 3–5 cm off the surface; wall = local XY plane facing +Z).

| Block | Factory | Draw calls |
|---|---|---|
| Ring (dashes, gaps, progress arc, pulse, spin) | `createRing` | 1 |
| Timing ring (closing ring onto a target ring) | `createTimingRing` + pure `timingWindow(t)` | 1 |
| Reticle (ring + 4 ticks + centre dot) | `createReticle` | 1 |
| Number / glyph sprite (any string length) | `createGlyphSprite` | 1 |
| Half symbol (one half) / pair (weak half + strong half) | `createHalfSymbol` / `createHalfSymbolPair` | 1 / 2 |
| Both-eye full symbol board (main scene) | `createFullSymbolMesh` / `createFullSymbolTexture` | 1 |
| Red-green dot picture pair | `createDotPicturePair` | 2 |
| Tier presets | `TIERS`, `withChallenge(tier, mods)` | – |
| Fader for ANY layer object | `createFader(object)` | – |

## Rings

```ts
const r = createRing({ radius: 0.5, thickness: 0.08, segments: 8, segmentFill: 0.6, spin: 0.2 });
r.setProgress(0.75);                // progress arc clockwise from 12 o'clock, rest is a faint track
const t = createTimingRing({ radius: 0.5, startRadius: 1.1 });   // perfect at t = 0.8 by default
t.play(1.2);                        // update(dt) closes it over 1.2 s (or drive it with setT)
if (pressed) { const { grade, score } = t.result(); }  // 'perfect' | 'good' | 'early' | 'late', 0..1
const aim = createReticle({ radius: 0.4, pulse: 0.3 });
```

`timingWindow(t, { perfectAt, perfect, good })` and `timingRadius(...)` are pure (unit-tested).

## Glyph sprites

```ts
const combo = createGlyphSprite({ text: '×3', height: 0.5 }); // or { value: 12 }
combo.setValue(4); combo.setText('✓');
```
Glyphs: `0–9 × + ! ? ← → ↑ ↓ ✓ ★ ♥ ● ■ ▲ ◆` (aliases `x * < > ^`; constants in `GLYPH`).
`maxChars` (default 8) is the buffer size. `height` is the digit ink height (0.5 m reads at ~8 m on 640×360).

## Half symbols

```ts
const answer = randomSymbol(mulberry32(seed));                 // { left: HalfShape, right: HalfShape }
const { candidates, answerIndex } = pickCandidates(answer, seed); // neither half alone picks the answer
const pair = createHalfSymbolPair({ symbol: answer, size: 1, weakSide: 'left' });
pair.weak.position.copy(p); pair.strong.position.copy(p);      // SAME transform for both halves
ctx.vision.add(pair.weak, VisionLayer.WeakOnly);
ctx.vision.add(pair.strong, VisionLayer.StrongOnly);
candidates.forEach((c, i) => arch[i].add(createFullSymbolMesh(c, 0.9))); // both-eye boards
```
Half shapes: `round`, `square`, `point`, `spiky` (16 symbols). Full boards are light on dark with a
thick dark outline, so they read in R-only and G-only.

## Dot pictures

```ts
const dots = createDotPicturePair({ shape: 'star', seed, size: 2.4, cells: 28, dotScale: 0.8 });
// both quads: same transform, 2–3 cm in front of a both-eye board of grey DOT_BOARD_GREY (0.2)
ctx.vision.add(dots.weak, VisionLayer.WeakOnly);
ctx.vision.add(dots.strong, VisionLayer.StrongOnly);
dots.setPicture('moon', seed2);
```
`S` = 50 % random dots from the seed only; `W = S XOR shape`. Each eye alone sees noise, and the
shape exists only between the two eyes (proven in unit + e2e tests). Shapes (`SHAPE_IDS`): star, heart,
circle, triangle, square, arrow, moon, fish. **Board:** a dark neutral grey (display ≈ 0.2, equal R and
G) gives the strongest, most even dots. The compositor brightens on dark and darkens on bright
backgrounds, and it is weakest and patchy around mid-grey. Tiers: smaller `dotScale`, lower `level`,
more `cells`.

## Tiers and challenge

```ts
const p = withChallenge(tier, ctx.vision.challenge?.()); // { size, level, opacity, speed, reward }
obj.scale.setScalar(base * p.size); createRing({ level: p.level, opacity: p.opacity });
```
`withChallenge` only applies `sizeScale` (clamped to `MIN_SIZE_SCALE`..1). It never returns
anything larger or brighter than the preset. Brightness and the other eye's contrast are applied
globally by the compositor.

## Fading

```ts
toolkitBlock.setFade(0.5);
const f = createFader(gemGroup, { clone: true }); // any materials: basic, standard, shader
f.fadeTo(0, 0.6); // smooth (smoothstep), deterministic; call f.update(dt) every frame
```
Fade 0 hides the materials (no pixel changes). Fading only shrinks coverage. `clone: true` stops a
material shared with other objects from fading with them.

## Dos and don'ts

- **Never mirror a layer object in the main scene**, the HUD, the minimap or with a *positional*
  sound. Anything in `ctx.scene` is seen by both eyes. A non-positional chime is fine.
- Effects for weak-eye objects (glow, sparkle, burst, pulse) are drawn **on the layer**: use another
  toolkit block or `createGlowMaterial` and register it on the same layer.
- Grey only: colour is ignored (luminance + alpha is all the compositor reads). Keep `toneMapped: false`,
  depth-tested, `depthWrite: false` for transparent things, and normal blending.
- Layer objects are hidden by the world's depth. Lift ground decals a few centimetres, and keep
  billboards out of the ground.
- Legibility is best on an even background. Over a dark/bright edge the compositor flips polarity
  inside the shape. Signs and boards (dot pictures, half symbols) should sit on a dark both-eye board.
  Free-floating weak-eye objects must **not** get a both-eye backing, because it would show their
  position to the strong eye.
- A pair's two meshes must share one transform (both halves / both dot layers are exactly registered).

Test hook (`?test=1`): `window.__rgVision.toolkit.spawn({ block, layer: 'weak' | 'strong' | 'pair',
distance, offsetX, offsetY, size, ... })`, `setFade(id | null, f)`, `setPicture`, `setSymbol`,
`update(dt)`, `remove(id)`, `removeAll()`. See `tests/e2e/glasses-toolkit.spec.ts`.
