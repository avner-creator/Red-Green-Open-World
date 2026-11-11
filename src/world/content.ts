/**
 * Everything static that the batcher draws and the physics collides with (roads, village, park,
 * areas and their dressing), plus gem and chest spots. No WebGL here, so tests can build it too.
 */
import type * as THREE from 'three';
import type { Kit } from './props';
import type { TerrainData } from './terrain';
import { buildRoadDressing, buildRoads } from './roads';
import { buildVillage, PLAZA } from './village';
import { buildPark } from './park';
import { buildAreas } from './areas';
import { buildCoreAreas } from './core-areas';
import { buildGearShack } from './gear-shack';
import { buildChestSpots, buildGemSpots, type ChestSpot, type Spot } from './spots';
import { LOTS } from './village-data';
import type { Keepout, ManualTree } from './scatter';
import { buildWayfinding, roadEdgeDistance, type Wayfinding } from './wayfinding';
import { buildOuterAreas, type OuterAreas } from './outer';
import { dressPaths } from './outer/paths';
import { buildSiteDressing, inSiteClearZone, raceCutDistance, siteKeepouts } from './sites';
import { GLASSES_WAY } from './attractions';

/** Inside a glasses-play site's clear circle (+ margin): the mini-games' startup probe wants it empty. */
const inGlassesSite = (x: number, z: number, m: number): boolean => GLASSES_WAY.some((g) => Math.hypot(x - g.x, z - g.z) < g.r + m);

export interface Content {
  trees: ManualTree[];
  keepouts: Keepout[];
  gemSpots: Spot[];
  chestSpots: ChestSpot[];
  wayfinding: Wayfinding;
  outer: OuterAreas;
}

export function buildContent(kit: Kit, terrain: TerrainData, addMeshCollider: (m: THREE.Mesh) => void): Content {
  buildRoads(kit.b, terrain.roads, kit.h);
  const villageTrees = buildVillage(kit, { addMeshCollider });
  const park = buildPark(kit);
  const areas = buildAreas(kit);
  const core = buildCoreAreas(kit);
  const shack = buildGearShack(kit);
  const outer = buildOuterAreas(kit, terrain.roads);
  const keepouts: Keepout[] = [
    { x: PLAZA.x, z: PLAZA.z, r: PLAZA.r + 1, paved: true },
    { x: 0, z: -37, hx: 8.5, hz: 22, paved: true },
    ...LOTS.map((l) => ({ x: l.x, z: l.z, r: Math.max(l.w, l.d) / 2 + 1.5 })),
    ...park.keepouts,
    ...areas.keepouts,
    ...core.keepouts,
    ...shack,
    ...outer.keepouts,
  ];
  const gemSpots = buildGemSpots(kit.h, terrain.roads);
  const chestSpots = buildChestSpots(kit.h);
  const near = (x: number, z: number, m: number): boolean =>
    [...gemSpots, ...chestSpots].some((s) => Math.hypot(s.x - x, s.z - z) < m);
  // Road dressing stays off paved areas, area footprints and gem/chest spots.
  const blocked = (x: number, z: number): boolean =>
    near(x, z, 2) ||
    inGlassesSite(x, z, 2.5) ||
    raceCutDistance(x, z) < 3 ||
    keepouts.some((k) =>
      k.r !== undefined ? Math.hypot(x - k.x, z - k.z) < k.r + 0.5 : Math.abs(x - k.x) < (k.hx ?? 0) + 0.5 && Math.abs(z - k.z) < (k.hz ?? 0) + 0.5,
    );
  const wayfinding = buildWayfinding(kit, terrain.roads, blocked);
  keepouts.push(...wayfinding.keepouts);
  const roadTrees = buildRoadDressing(kit, terrain.roads, blocked);
  // Outer path dressing (lamps, posts, shrubs) also gives way to the Carnival Island sites.
  const pathTrees = dressPaths(kit, terrain.roads, (x, z) => blocked(x, z) || inSiteClearZone(x, z, 1), (x, z) => roadEdgeDistance(terrain.roads, x, z));
  // Carnival Island sites: entrance dressing, then their footprints and flight/race corridors keep
  // the scatter out (added after the road dressing so kerbs and dashes still run through them).
  keepouts.push(...buildSiteDressing(kit, wayfinding.decals), ...siteKeepouts());
  // Nothing scattered (trees, rocks) on top of a gem or chest.
  for (const s of [...gemSpots, ...chestSpots]) keepouts.push({ x: s.x, z: s.z, r: 1.6 });
  // Hand-placed trees, bushes and rocks give way to the sites and stay off the roads (race line).
  const trees = [...villageTrees, ...park.trees, ...areas.trees, ...core.trees, ...outer.trees, ...roadTrees, ...pathTrees].filter(
    (t) => !inSiteClearZone(t.x, t.z, 1) && !inGlassesSite(t.x, t.z, 3) && roadEdgeDistance(terrain.roads, t.x, t.z) > 1,
  );
  return { trees, keepouts, gemSpots, chestSpots, wayfinding, outer };
}
