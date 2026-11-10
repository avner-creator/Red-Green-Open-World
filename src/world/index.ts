/**
 * The island. Builds terrain (+ Rapier heightfield), water, sky and lighting, the village, Bouncy
 * Park and the other areas, vegetation, colliders, post-processing, anchors and collectible spots.
 * Everything is procedural and seeded (no network requests, no Math.random).
 */
import * as THREE from 'three';
import { WORLD } from '../config';
import type { Anchor, AnchorName, GameContext, Quality, WorldApi } from '../types';
import { ANCHORS } from './layout';
import { buildTerrain, sampleHeight } from './terrain';
import { createTerrainMesh } from './terrain-mesh';
import { createWater } from './water';
import { createLighting } from './lighting';
import { createMaterials, U } from './materials';
import { Batcher } from './batch';
import { Colliders, type Kit } from './props';
import { buildRoads } from './roads';
import { buildVillage, PLAZA } from './village';
import { buildPark } from './park';
import { buildAreas } from './areas';
import { buildScatter, type Keepout } from './scatter';
import { buildChestSpots, buildGemSpots } from './spots';
import { createPost } from './post';
import { LOTS } from './village-data';

type BootCtx = Pick<GameContext, 'scene' | 'renderer' | 'camera' | 'physics' | 'vision' | 'settings' | 'events' | 'testMode'>;

export async function createWorld(ctx: BootCtx): Promise<WorldApi> {
  const t0 = performance.now();
  const terrain = buildTerrain();
  const heightAt = (x: number, z: number): number => sampleHeight(terrain, x, z);
  ctx.physics.addHeightfield(terrain.n, terrain.n, terrain.heights, { x: terrain.size, z: terrain.size });

  const root = new THREE.Group();
  root.name = 'world';
  ctx.scene.add(root);
  const mats = createMaterials();
  root.add(createTerrainMesh(terrain));
  const water = createWater(terrain);
  root.add(water.mesh);
  const lighting = createLighting(ctx.scene, ctx.renderer);

  const b = new Batcher();
  const col = new Colliders(ctx.physics);
  const kit: Kit = { b, col, h: heightAt };
  buildRoads(b, terrain.roads, heightAt);
  const villageTrees = buildVillage(kit, { addMeshCollider: (m) => void ctx.physics.addStaticMesh(m) });
  const park = buildPark(kit);
  const areas = buildAreas(kit);
  const keepouts: Keepout[] = [
    { x: PLAZA.x, z: PLAZA.z, r: PLAZA.r + 1, paved: true },
    { x: 0, z: -37, hx: 8.5, hz: 22, paved: true },
    ...LOTS.map((l) => ({ x: l.x, z: l.z, r: Math.max(l.w, l.d) / 2 + 1.5 })),
    ...park.keepouts,
    ...areas.keepouts,
  ];
  const staticMeshes = b.build(root, mats);
  const scatter = buildScatter(terrain, mats, col, [...villageTrees, ...park.trees, ...areas.trees], keepouts);
  root.add(scatter.group);

  const post = createPost(ctx.camera);

  const anchors = {} as Record<AnchorName, Anchor>;
  for (const [name, a] of Object.entries(ANCHORS) as [AnchorName, (typeof ANCHORS)[AnchorName]][]) {
    anchors[name] = { position: new THREE.Vector3(a.x, a.y ?? heightAt(a.x, a.z), a.z), yaw: a.yaw, radius: a.radius };
  }
  const gemSpots = buildGemSpots(heightAt, terrain.roads).map((s) => ({ position: new THREE.Vector3(s.x, s.y, s.z), tag: s.tag }));
  const chestSpots = buildChestSpots(heightAt).map((c) => ({ position: new THREE.Vector3(c.x, c.y, c.z), yaw: c.yaw }));

  let quality: Quality | null = null;
  const half = WORLD.size / 2;
  const api: WorldApi = {
    size: WORLD.size,
    waterLevel: WORLD.waterLevel,
    heightAt,
    isLand: (x, z) => Math.abs(x) < half - 2 && Math.abs(z) < half - 2 && heightAt(x, z) > WORLD.waterLevel + 0.1,
    anchors,
    gemSpots,
    chestSpots,
    setTimeOfDay(t) {
      lighting.setTime(t);
      post.setExposure(lighting.exposure);
    },
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      lighting.setQuality(q);
      scatter.setQuality(q);
      ctx.vision.setPostPasses(post.passes(q));
    },
    update(dt) {
      U.time.value += dt;
      mats.update();
      lighting.update(ctx.camera);
    },
  };
  api.setQuality(ctx.settings.get().quality);
  api.setTimeOfDay(0);
  if (ctx.testMode) {
    const tris = staticMeshes.reduce((a, m) => a + (m.geometry.attributes.position.count / 3), 0);
    console.info(
      `[world] built in ${Math.round(performance.now() - t0)} ms: ${staticMeshes.length} static meshes (${Math.round(tris)} tris), ` +
        `${scatter.stats().instances} instances, ${col.count} colliders, ${gemSpots.length} gem spots`,
    );
  }
  return api;
}
