/**
 * Outer areas (stream G): ranch, canyon bridge, Silly Zone surroundings, lake and beach, lighthouse.
 * Pure (no WebGL): everything static goes into the shared batcher and colliders; the few moving
 * parts are returned as `live` definitions for `createOuterLive` at runtime.
 */
import { Batcher } from '../batch';
import type { Kit } from '../props';
import type { ProcessedRoad } from '../terrain';
import type { Keepout, ManualTree } from '../scatter';
import { roadEdgeDistance } from '../wayfinding';
import { buildRanch, ARCH } from './ranch';
import { buildCanyon } from './canyon';
import { buildSillySurroundings, SILLY_ARCH } from './silly';
import { buildLake } from './lake';
import { buildLighthouse } from './lighthouse';
import type { OuterLiveDefs } from './live';

export interface OuterAreas {
  trees: ManualTree[];
  keepouts: Keepout[];
  live: OuterLiveDefs;
  /** Lighthouse walkway samples (tests). */
  walkway: ReturnType<typeof buildLighthouse>['walkway'];
  riverLine: ReturnType<typeof buildCanyon>['riverLine'];
  /**
   * One batcher per area: every part of an area (ground paint and small parts included) merges into
   * that area's own meshes, so the whole area is frustum-culled when you are elsewhere instead of
   * landing in island-wide buckets that are drawn from everywhere.
   */
  batchers: Batcher[];
}

export function buildOuterAreas(k: Kit, roads: readonly ProcessedRoad[]): OuterAreas {
  const roadEdge = (x: number, z: number): number => roadEdgeDistance(roads, x, z);
  const batchers: Batcher[] = [];
  const area = (): Kit => {
    const b = new Batcher();
    batchers.push(b);
    return { ...k, b };
  };
  const ranch = buildRanch(area());
  const canyon = buildCanyon(area());
  const silly = buildSillySurroundings(area(), roadEdge);
  const lake = buildLake(area());
  const lh = buildLighthouse(area());
  // Arch posts beside the roads: keep road lamps and verges off them.
  const archPosts: Keepout[] = [];
  for (const a of [ARCH, SILLY_ARCH]) {
    for (const s of [-1, 1]) archPosts.push({ x: a.x + Math.cos(a.yaw) * s * a.half, z: a.z - Math.sin(a.yaw) * s * a.half, r: 1.6 });
  }
  const parts = [ranch, canyon, silly, lake, lh];
  return {
    trees: parts.flatMap((p) => p.trees),
    keepouts: [...parts.flatMap((p) => p.keepouts), ...archPosts],
    live: { waterfall: canyon.waterfall, river: canyon.river, lamp: lh.lamp, windmill: ranch.windmill, buoys: lake.buoys },
    walkway: lh.walkway,
    riverLine: canyon.riverLine,
    batchers,
  };
}
