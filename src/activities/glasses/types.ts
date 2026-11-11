/**
 * Contract between the glasses-play framework (`./index.ts`) and the six mechanics
 * (`./glowflies`, `./toys`, `./oddone`, `./lineup`, `./gates`, `./dotsigns`).
 *
 * Each mechanic folder exports `create(env: MechanicEnv): Mechanic` from its `index.ts` and owns
 * only that folder. The framework already builds the site's pictogram board (both eyes, one draw
 * call), finds the site, pays rewards, and runs far-idle; the mechanic builds the play itself.
 *
 * Site frame: `env.local(x, z)` maps site-local metres to world XZ. Local +Z points towards the
 * approach (where the player comes from), +X to the player's right as they walk in. Stay inside
 * `site.radius` (≈ 6 m) and keep clear of `site.board` (front-left edge).
 *
 * Layers — the red-green rule (CLAUDE.md):
 *  - Put objects in the game ONLY through `env.add(object, layer)`. `WeakOnly`/`StrongOnly`
 *    objects are attached to the vision layers while the mechanic is active and detached when the
 *    player is far (far-idle); `Both` objects stay in the main scene all the time.
 *  - A weak-eye answer must never be revealed to the strong eye: no both-eye effect, HUD marker or
 *    positional sound at a weak-eye object's position. Draw celebrations ON the same layer.
 *  - Budget: `drawObjects()` + the board ≤ 6 draw calls (the board is 1). Prefer InstancedMesh /
 *    merged meshes. `env.tracked()` is a fine `drawObjects()` implementation.
 *
 * Lifecycle (driven by the framework):
 *  - `reset()` when a session starts (title → playing) and from the test API.
 *  - `setActive(true|false)` when the player comes within ~60 m / leaves beyond ~70 m (layer
 *    objects are already attached/detached by then). Not called while far → costs nothing.
 *  - `update(dt)` every frame only while active AND the session phase is `playing`.
 *  - `dispose()` once; also call `env.remove` / dispose your geometries, materials, colliders,
 *    interactables and event subscriptions there.
 */
import type * as THREE from 'three';
import type { ChallengeModifiers, GameContext, GlassesKind, GlassesTier, VisionLayer } from '../../types';
import type { GlassesPicto } from './pictos';
import type { GlassesSite, XZ } from './sites';

export type { GlassesPicto } from './pictos';
export type { GlassesSite } from './sites';

export interface Mechanic {
  readonly id: string;
  readonly kind: GlassesKind;
  /** New session: put everything back to the start state. */
  reset(): void;
  /** Far-idle switch (the framework already attached/detached the layer objects). */
  setActive(on: boolean): void;
  update(dt: number): void;
  dispose(): void;
  /** Test/debug snapshot (state, the current answer, tier…). JSON-serialisable. */
  debug(): Record<string, unknown>;
  /** Test hook: force a state (e.g. `{ answer: 2 }`) and apply it at once (no update needed). */
  force?(params: Record<string, unknown>): void;
  /** Every object that may issue a draw call (layer objects included), for the draw budget. */
  drawObjects(): THREE.Object3D[];
}

export interface MechanicEnv {
  readonly ctx: GameContext;
  /** Mechanic id (= folder name) and kind, from the registry. */
  readonly id: string;
  readonly kind: GlassesKind;
  readonly site: Readonly<GlassesSite>;
  /** Deterministic 0..1 generator seeded from the mechanic id. */
  readonly rng: () => number;
  /** Site-local (x right, z towards the approach) → world XZ. */
  local(x: number, z: number): XZ;
  /** Terrain height under a world XZ. */
  groundAt(x: number, z: number): number;
  /** Swap the board's pictograms (2–3; keep the same count). */
  board(pictos: readonly GlassesPicto[]): void;
  /** Pay gems through the economy (if present) + toast + sound. */
  pay(gems: number): void;
  /** Emit `glasses:result` for this mechanic. */
  result(tier: GlassesTier, hit: boolean): void;
  /** Current challenge modifiers (identity when the vision system has none). */
  challenge(): Readonly<ChallengeModifiers>;
  /** Add an object on a layer and track it (see "Layers" above). Returns the object. */
  add<T extends THREE.Object3D>(object: T, layer: VisionLayer): T;
  /** Remove a tracked object from its layer (does not dispose it). */
  remove(object: THREE.Object3D): void;
  /** Every tracked object (all layers). */
  tracked(): THREE.Object3D[];
  /** True while the player is near (layer objects attached). */
  isActive(): boolean;
}

export type MechanicFactory = (env: MechanicEnv) => Mechanic;

/** Identity modifiers (Auto challenge off or not available). */
export const IDENTITY_CHALLENGE: Readonly<ChallengeModifiers> = Object.freeze({
  level: 0,
  maxLevel: 0,
  weakScale: 1,
  strongScale: 1,
  sizeScale: 1,
});
