/** Pure search for the rocket landing net: flat, dry, clear land along the pad's direction. */
import { NET, ROCKET } from './constants';

export interface SiteWorld {
  heightAt(x: number, z: number): number;
  isLand(x: number, z: number): boolean;
  /** Something solid (tree, building) stands above the ground here. Optional. */
  blocked?(x: number, z: number): boolean;
  /** Other places that must stay clear (the pads' own anchor is not listed). */
  keepClear: readonly { x: number; z: number; radius: number }[];
}

export interface NetSite {
  x: number;
  z: number;
  groundY: number;
  /** Distance from the search origin, metres. */
  distance: number;
  /** Heading of the launch (radians, +Z = 0). */
  heading: number;
  /** True when no flat landing was found at 45 m or more. */
  shortened: boolean;
}

/** Sample points covering a disc of radius `r` around (x, z). */
export function siteSamples(x: number, z: number, r: number): { x: number; z: number }[] {
  const out = [{ x, z }];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    out.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    out.push({ x: x + Math.cos(a) * r * 0.5, z: z + Math.sin(a) * r * 0.5 });
  }
  return out;
}

/** Is a net of `NET.radius` happy at (x, z)? */
export function siteOk(world: SiteWorld, x: number, z: number): boolean {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of siteSamples(x, z, NET.siteRadius)) {
    if (!world.isLand(s.x, s.z)) return false;
    if (world.blocked?.(s.x, s.z)) return false;
    const h = world.heightAt(s.x, s.z);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  if (hi - lo > NET.maxSpread) return false;
  for (const a of world.keepClear) {
    if (Math.hypot(x - a.x, z - a.z) < a.radius + NET.radius + NET.anchorClearance) return false;
  }
  return true;
}

/**
 * Best net site: along `yaw` first, then slightly to either side; the preferred 45-65 m distances
 * first, then (shortened) 20-40 m when nothing flat exists in range.
 */
export function findNetSite(world: SiteWorld, from: { x: number; z: number }, yaw: number): NetSite | null {
  for (const [distances, shortened] of [
    [ROCKET.distances, false],
    [ROCKET.shortDistances, true],
  ] as const) {
    for (const off of ROCKET.yawOffsets) {
      const heading = yaw + off;
      for (const d of distances) {
        const x = from.x + Math.sin(heading) * d;
        const z = from.z + Math.cos(heading) * d;
        if (siteOk(world, x, z)) return { x, z, groundY: world.heightAt(x, z), distance: d, heading, shortened };
      }
    }
  }
  return null;
}
