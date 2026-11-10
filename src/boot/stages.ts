/**
 * Boot stages and the loading bar's maths (pure; unit-tested in tests/boot.test.ts).
 *
 * Each stage owns a slice of the bar proportional to `weight`. When a stage starts, the bar jumps to
 * the slice's start and then creeps towards `CREEP` of the slice over about `ms` (a compositor-only
 * CSS transform transition, so it keeps moving while the main thread is busy building the world).
 * The next stage snaps it forward again. The bar therefore never stalls and never runs backwards.
 */
export const BOOT_STAGES = [
  /** Download the engine, world, activity and UI chunks (in parallel). */
  { id: 'code', weight: 26, ms: 1800 },
  /** Rapier: fetch + compile the physics WASM. */
  { id: 'physics', weight: 14, ms: 900 },
  /** Terrain, roads, village, props, lighting and post-processing. */
  { id: 'world', weight: 26, ms: 2600 },
  /** The hero (character GLB), camera, vehicles. */
  { id: 'player', weight: 10, ms: 900 },
  /** Gems, chests, trampolines, skydive, launch pads. */
  { id: 'activities', weight: 10, ms: 900 },
  /** Menus and HUD. */
  { id: 'ui', weight: 4, ms: 300 },
  /** First frame: compiles every shader. */
  { id: 'frame', weight: 10, ms: 1800 },
] as const;

export type BootStage = (typeof BOOT_STAGES)[number]['id'];

/** How far into its own slice a stage creeps before the next stage takes over. */
export const CREEP = 0.85;

const TOTAL = BOOT_STAGES.reduce((s, x) => s + x.weight, 0);

/** The bar range [start, end] (0..1) owned by a stage. */
export function stageRange(id: BootStage): [number, number] {
  let acc = 0;
  for (const s of BOOT_STAGES) {
    if (s.id === id) return [acc / TOTAL, (acc + s.weight) / TOTAL];
    acc += s.weight;
  }
  return [0, 0];
}

/** Where the bar should end up while `id` runs, and how long the creep should take (ms). */
export function stageTarget(id: BootStage): { from: number; to: number; ms: number } {
  const [a, b] = stageRange(id);
  const ms = BOOT_STAGES.find((s) => s.id === id)?.ms ?? 1000;
  return { from: a, to: a + (b - a) * CREEP, ms };
}

/** Monotonic progress: a new value never moves the bar backwards. */
export function nextProgress(current: number, wanted: number): number {
  return Math.min(1, Math.max(current, wanted));
}
