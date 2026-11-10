/** Pure gain mapping helpers. */

export function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** Perceptual-ish slider mapping: 0..1 to linear gain (squared). */
export function volumeToGain(v: number): number {
  const c = clamp01(v);
  return c * c;
}

/** Landing volume from impact speed (m/s): silent below `minSpeed`, full at `maxSpeed`. */
export function landVolume(speed: number, minSpeed = 3, maxSpeed = 14): number {
  if (!(speed >= minSpeed)) return 0;
  return 0.25 + 0.75 * clamp01((speed - minSpeed) / (maxSpeed - minSpeed));
}
