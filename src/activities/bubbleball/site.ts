/**
 * Where the bumper games stand. Uses the world anchor (`bubbleArena`, `dinoRing`) when the main
 * build has added it; until then a fixed, hand-checked spot on the open meadow south of the garage
 * (clear of roads, props, trees and every other anchor radius; see docs/streams/bumper-arena.md).
 *
 * Both games stand on their own raised inflatable deck, so the deck top is flat whatever the
 * meadow does underneath: `deckY` is the highest ground under the footprint plus a little.
 */
import type { Anchor, GameContext } from '../../types';

export interface SiteDef {
  x: number;
  z: number;
  /** Rotation about +Y. Bubble Ball: the pitch's long axis is local +X. */
  yaw: number;
}

export interface Site extends SiteDef {
  /** Flat deck top (world y). */
  deckY: number;
  /** Lowest ground under the footprint (skirt bottom). */
  groundY: number;
  /** True when a world anchor placed it. */
  fromAnchor: boolean;
}

/** Fallback spots (metres, world). Long axis of the pitch runs east-west. */
export const FALLBACK_SITES = {
  bubbleArena: { x: 35, z: 57.5, yaw: 0 },
  dinoRing: { x: 16, z: 58.5, yaw: 0 },
} as const satisfies Record<string, SiteDef>;

export type BumperSiteName = keyof typeof FALLBACK_SITES;

/** Highest / lowest terrain over a footprint sampled every metre. */
export function footprintHeights(
  heightAt: (x: number, z: number) => number,
  inside: (lx: number, lz: number) => boolean,
  site: SiteDef,
  reach: number,
): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  const c = Math.cos(site.yaw);
  const s = Math.sin(site.yaw);
  for (let lx = -reach; lx <= reach; lx += 1) {
    for (let lz = -reach; lz <= reach; lz += 1) {
      if (!inside(lx, lz)) continue;
      const y = heightAt(site.x + lx * c + lz * s, site.z - lx * s + lz * c);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  }
  if (!Number.isFinite(lo)) lo = hi = heightAt(site.x, site.z);
  return { lo, hi };
}

export function resolveSite(
  ctx: Pick<GameContext, 'world'>,
  name: BumperSiteName,
  inside: (lx: number, lz: number) => boolean,
  reach: number,
  lift = 0.25,
): Site {
  const anchor = (ctx.world.anchors as Readonly<Record<string, Anchor | undefined>>)[name];
  const def: SiteDef = anchor ? { x: anchor.position.x, z: anchor.position.z, yaw: anchor.yaw } : { ...FALLBACK_SITES[name] };
  const { lo, hi } = footprintHeights(ctx.world.heightAt, inside, def, reach);
  return { ...def, deckY: hi + lift, groundY: lo, fromAnchor: !!anchor };
}
