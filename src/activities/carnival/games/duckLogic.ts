/** Duck Pond rules (pure): duck swim paths, lucky ducks, net catches. */

export const POND = { x: 0, z: -2.4, r: 1.72, waterY: 0.56 } as const;
export const NET_R = 0.3;
/** A scoop catches ducks within this distance (xz) of the net centre (aim at a duck!). */
export const CATCH_R = 0.34;
/** An empty scoop: the hero splashes and wobbles this long. */
export const EMPTY_STUN = 0.9;
export const MAX_CATCH = 2;
export const LUCKY_COUNT = 3;
export const LUCKY_POINTS = 3;
export const DUCK_RESPAWN = 2.2;

export interface Lane {
  radius: number;
  /** Angular speed, rad/s (+ = counter-clockwise seen from above). */
  speed: number;
  count: number;
}

export const LANES: readonly Lane[] = [
  { radius: 1.25, speed: -0.32, count: 8 },
  { radius: 0.66, speed: 0.45, count: 4 },
];

export const DUCK_COUNT = LANES.reduce((n, l) => n + l.count, 0);

/** Lane and start angle of duck i. */
export function duckLane(i: number): { lane: Lane; a0: number } {
  let k = i;
  for (const lane of LANES) {
    if (k < lane.count) return { lane, a0: (k / lane.count) * Math.PI * 2 + (lane.radius < 1 ? 0.4 : 0) };
    k -= lane.count;
  }
  return { lane: LANES[0], a0: 0 };
}

/** Pond-frame position (x, z) of duck i at time t (booth frame, includes the pond centre). */
export function duckXZ(i: number, t: number): [number, number] {
  const { lane, a0 } = duckLane(i);
  const a = a0 + lane.speed * t;
  return [POND.x + Math.sin(a) * lane.radius, POND.z + Math.cos(a) * lane.radius];
}

/** Heading (yaw) of duck i at time t: along its swim direction. */
export function duckYaw(i: number, t: number): number {
  const { lane, a0 } = duckLane(i);
  const a = a0 + lane.speed * t;
  return a + (lane.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
}

/** Clamp a net centre into the pond (keeps the hoop inside the rim). */
export function clampToPond(x: number, z: number, margin = NET_R * 0.5): [number, number] {
  const dx = x - POND.x;
  const dz = z - POND.z;
  const d = Math.hypot(dx, dz);
  const max = POND.r - margin;
  if (d <= max) return [x, z];
  return [POND.x + (dx / d) * max, POND.z + (dz / d) * max];
}

/** Indices of the (up to `max`) catchable ducks nearest the net, closest first. */
export function catchDucks(netX: number, netZ: number, ducks: readonly { x: number; z: number; ok: boolean }[], radius = CATCH_R, max = MAX_CATCH): number[] {
  return ducks
    .map((d, i) => ({ i, d: Math.hypot(d.x - netX, d.z - netZ), ok: d.ok }))
    .filter((e) => e.ok && e.d <= radius)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((e) => e.i);
}
