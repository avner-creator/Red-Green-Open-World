/**
 * Sightlines that must stay open: from where a child arrives (a road, a trail end) to a glasses
 * mini-game booth. Trees, bushes and big rocks are left out along them (scatter keeps its random
 * sequence, so nothing else on the island moves). Pure data + one helper; no WebGL.
 */

export interface Sightline {
  id: string;
  /** Viewpoint (road / trail end). */
  ax: number;
  az: number;
  /** The booth's pad. */
  bx: number;
  bz: number;
  /** Half width of the open corridor (metres, plus the object's own radius). */
  half: number;
}

export const SIGHTLINES: readonly Sightline[] = [
  // Gates: from the loop road down to the pad (a trunk ~20 m in hid the booth).
  { id: 'gates', ax: 46, az: 82, bx: 46.8, bz: 103.8, half: 5 },
  // Glow-flies: from the west road trail end to the pad (the ranch arch moved off this line too).
  { id: 'glowflies', ax: -55.9, az: 34.1, bx: -65.6, bz: 22.6, half: 3 },
  // Line-up: from the ridge-road signpost to the pad.
  { id: 'lineup', ax: 65.2, az: -80.6, bx: 71.7, bz: -89.5, half: 3 },
  // Toys: from the trail-head flag to the pad.
  { id: 'toys', ax: -8, az: 69.5, bx: -30.5, bz: 69.7, half: 3 },
];

function segDist(px: number, pz: number, s: Sightline): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - s.ax - dx * t, pz - s.az - dz * t);
}

/** Is (x, z) with footprint radius `r` inside one of the open corridors? */
export function inSightline(x: number, z: number, r = 0): boolean {
  return SIGHTLINES.some((s) => segDist(x, z, s) < s.half + r);
}
