/**
 * Contract between the glasses "weave" (`./index.ts`) and its six parts (`./bounce`, `./chute`,
 * `./hero`, `./boost`, `./fakes`, `./shack`): small weak-eye / both-eye layers woven into
 * attractions that already exist (Phase 2 of the red-green depth pass).
 *
 * Each part folder exports `create(env: WeaveEnv): WeavePart` from its `index.ts` and owns only that
 * folder. Unlike the Phase 1 mechanics (`../types.ts`) there are no sites, no pictogram boards and
 * no far-idle: the attraction the part lives on is the place.
 *
 * Activity — a part decides itself when it is active (e.g. only while the player is on the
 * trampoline, only during a race, only while the hero has a skill). While inactive it must cost
 * nothing: no layer objects attached (`env.remove` them, or never add them) and an early return at
 * the top of `update`. Prefer cheap checks (a flag set by an event, one distance test) over scans.
 *
 * Layers — the red-green rule (CLAUDE.md):
 *  - Put objects in the game ONLY through `env.add(object, layer)`; it attaches the object at once
 *    (`ctx.vision.add`) and tracks it. `env.remove(object)` detaches and untracks it (does not
 *    dispose). Add on activation, remove on deactivation; the weave removes everything still
 *    tracked on `dispose`.
 *  - A weak-eye answer must never be revealed to the strong eye: no both-eye effect, HUD marker or
 *    positional sound at a weak-eye object's position. Draw celebrations ON the same layer.
 *    A non-positional chime and `env.pay` (HUD toast "+N", no position) are fine.
 *  - Never change the existing attraction's behaviour: a part is an optional, rewarded extra on
 *    top. Read public state (`ctx.player`, `ctx.economy`, events) and the small hooks listed in
 *    `./README.md`; never reach into another owner's private state.
 *  - Budget: `drawObjects()` ≤ 6 draw calls while active, 0 while inactive. Prefer InstancedMesh /
 *    merged meshes. `env.tracked()` is a fine `drawObjects()` implementation.
 *
 * Results — every weak-eye (or both-eyes-together) try ends in exactly one `env.result(tier, hit)`:
 * it feeds the Auto challenge staircase and the grown-up summary. Pay with `env.pay(gems)` on hits.
 * Size things with `withChallenge(tier, env.challenge())` from the vision toolkit.
 *
 * Lifecycle (driven by the weave):
 *  - `reset()` when a session starts (title → playing), when the game returns to the title, and
 *    from the test API: put everything back to the start state and detach layer objects.
 *  - `update(dt)` every frame while the session phase is `playing` (never while paused/ended).
 *  - `dispose()` once; dispose your geometries, materials, colliders, interactables and event
 *    subscriptions there.
 */
import type * as THREE from 'three';
import type { ChallengeModifiers, GameContext, GlassesKind, GlassesTier, VisionLayer } from '../../../types';

export interface WeavePart {
  readonly id: string;
  readonly kind: GlassesKind;
  /** New session / back to title / test: start state, layer objects detached. */
  reset(): void;
  /** Every frame while playing. Return early (and keep nothing attached) while inactive. */
  update(dt: number): void;
  dispose(): void;
  /** Test/debug snapshot (active, state, the current answer, tier…). JSON-serialisable. */
  debug(): Record<string, unknown>;
  /** Test hook: force a state (e.g. `{ active: true, answer: 2 }`) and apply it at once. */
  force?(params: Record<string, unknown>): void;
  /** Every object that may issue a draw call (layer objects included), for the draw budget. */
  drawObjects(): THREE.Object3D[];
}

export interface WeaveEnv {
  readonly ctx: GameContext;
  /** Part id (= folder name) and kind, from the registry (`./parts.ts`). */
  readonly id: string;
  readonly kind: GlassesKind;
  /** Deterministic 0..1 generator seeded from the part id. */
  readonly rng: () => number;
  /** Pay gems through the economy (if present) + toast + sound (`../rewards.ts`). */
  pay(gems: number): void;
  /**
   * Emit `glasses:result` for this part (`mechanic` = the part id). `kind` defaults to the part's
   * kind; a part with two plays (chute: timeIt ring + lineUp hoop gem) passes the other one.
   */
  result(tier: GlassesTier, hit: boolean, kind?: GlassesKind): void;
  /** Current challenge modifiers (identity when the vision system has none). */
  challenge(): Readonly<ChallengeModifiers>;
  /** Attach an object on a layer now and track it. Returns the object. */
  add<T extends THREE.Object3D>(object: T, layer: VisionLayer): T;
  /** Detach and untrack (does not dispose). No-op for untracked objects. */
  remove(object: THREE.Object3D): void;
  /** Every tracked (attached) object, all layers. */
  tracked(): THREE.Object3D[];
}

export type WeaveFactory = (env: WeaveEnv) => WeavePart;
