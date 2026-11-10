/**
 * Sniffing around when a Glow Gem is near. RULE: Pip must never reveal where a weak-eye object
 * is. By construction these functions take NO gem data at all (only time, a seed and the hero's
 * position): the `gem:near` event only switches the sniff on, it never steers it. The heading is a
 * smooth wander around the hero, so it is uncorrelated with the gem's direction.
 */
import type { V2 } from './steer';

/** Cheap smooth value noise in -1..1 (sum of incommensurate sines). */
function wobble(t: number, seed: number): number {
  return (
    0.55 * Math.sin(t * 0.83 + seed * 1.7) +
    0.3 * Math.sin(t * 1.91 + seed * 3.1 + 1.3) +
    0.15 * Math.sin(t * 3.7 + seed * 5.3 + 2.1)
  );
}

/** Wander heading (radians) at time `t`: a slow loop around the hero that never settles. */
export function sniffHeading(t: number, seed: number): number {
  return t * 0.45 + seed * 2.39 + wobble(t, seed) * 1.6;
}

/** Point Pip snuffles towards: on a 1.3..2.1 m loop around the hero. */
export function sniffSpot(hero: V2, t: number, seed: number): V2 {
  const a = sniffHeading(t, seed);
  const r = 1.7 + 0.4 * wobble(t * 0.7, seed + 4);
  return { x: hero.x + Math.sin(a) * r, z: hero.z + Math.cos(a) * r };
}
