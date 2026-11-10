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
import { buildChestSpots, buildGemSpots, type ChestSpot, type Spot } from './spots';
import { LOTS } from './village-data';
import type { Keepout, ManualTree } from './scatter';

export interface Content {
  trees: ManualTree[];
  keepouts: Keepout[];
  gemSpots: Spot[];
  chestSpots: ChestSpot[];
}

export function buildContent(kit: Kit, terrain: TerrainData, addMeshCollider: (m: THREE.Mesh) => void): Content {
  buildRoads(kit.b, terrain.roads, kit.h);
  const villageTrees = buildVillage(kit, { addMeshCollider });
  const park = buildPark(kit);
  const areas = buildAreas(kit);
  const core = buildCoreAreas(kit);
  const keepouts: Keepout[] = [
    { x: PLAZA.x, z: PLAZA.z, r: PLAZA.r + 1, paved: true },
    { x: 0, z: -37, hx: 8.5, hz: 22, paved: true },
    ...LOTS.map((l) => ({ x: l.x, z: l.z, r: Math.max(l.w, l.d) / 2 + 1.5 })),
    ...park.keepouts,
    ...areas.keepouts,
    ...core.keepouts,
  ];
  const gemSpots = buildGemSpots(kit.h, terrain.roads);
  const chestSpots = buildChestSpots(kit.h);
  const near = (x: number, z: number, m: number): boolean =>
    [...gemSpots, ...chestSpots].some((s) => Math.hypot(s.x - x, s.z - z) < m);
  // Road dressing stays off paved areas, area footprints and gem/chest spots.
  const blocked = (x: number, z: number): boolean =>
    near(x, z, 2) ||
    keepouts.some((k) =>
      k.r !== undefined ? Math.hypot(x - k.x, z - k.z) < k.r + 0.5 : Math.abs(x - k.x) < (k.hx ?? 0) + 0.5 && Math.abs(z - k.z) < (k.hz ?? 0) + 0.5,
    );
  const roadTrees = buildRoadDressing(kit, terrain.roads, blocked);
  // Nothing scattered (trees, rocks) on top of a gem or chest.
  for (const s of [...gemSpots, ...chestSpots]) keepouts.push({ x: s.x, z: s.z, r: 1.6 });
  return { trees: [...villageTrees, ...park.trees, ...areas.trees, ...core.trees, ...roadTrees], keepouts, gemSpots, chestSpots };
}
