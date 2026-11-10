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
import { buildScatter } from './scatter';
import { buildContent } from './content';
import { createPost } from './post';
import { createGearShackLive } from './gear-shack';
import { createPictogramAtlas } from './pictograms';
import { createDecalMesh, pictoMaterial } from './decals';
import { createBeacons } from './beacons';
import { LAUNCH_NET } from './layout';

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
  const terrainMesh = createTerrainMesh(terrain);
  root.add(terrainMesh.group);
  const water = createWater(terrain);
  root.add(water.mesh);
  const lighting = createLighting(ctx.scene, ctx.renderer);

  const b = new Batcher();
  const col = new Colliders(ctx.physics);
  const kit: Kit = { b, col, h: heightAt };
  const content = buildContent(kit, terrain, (m) => void ctx.physics.addStaticMesh(m));
  const staticMeshes = b.build(root, mats);
  const gemSpots = content.gemSpots.map((s) => ({ position: new THREE.Vector3(s.x, s.y, s.z), tag: s.tag }));
  const chestSpots = content.chestSpots.map((c) => ({ position: new THREE.Vector3(c.x, c.y, c.z), yaw: c.yaw }));
  const scatter = buildScatter(terrain, mats, col, content.trees, content.keepouts, terrainMesh.colorAt);
  root.add(scatter.group);
  const shack = createGearShackLive(mats, heightAt);
  root.add(shack.group);
  // Wayfinding: one pictogram atlas shared by all sign faces and the beacon badges.
  const atlas = createPictogramAtlas();
  atlas.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
  root.add(createDecalMesh(content.wayfinding.decals, pictoMaterial(atlas)));
  const beacons = createBeacons(content.wayfinding.beacons, atlas);
  root.add(beacons.group);

  const post = createPost(ctx.camera);

  const anchors = {} as Record<AnchorName, Anchor>;
  for (const [name, a] of Object.entries(ANCHORS) as [AnchorName, (typeof ANCHORS)[AnchorName]][]) {
    anchors[name] = { position: new THREE.Vector3(a.x, a.y ?? heightAt(a.x, a.z), a.z), yaw: a.yaw, radius: a.radius };
  }
  // Where the rocket-pad flight should land (the landing net).
  Object.assign(anchors.launchPads, {
    target: new THREE.Vector3(LAUNCH_NET.x, heightAt(LAUNCH_NET.x, LAUNCH_NET.z), LAUNCH_NET.z),
    targetRadius: LAUNCH_NET.radius,
  });

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
      shack.setQuality(q);
      ctx.vision.setPostPasses(post.passes(q));
    },
    update(dt) {
      U.time.value += dt;
      mats.update();
      lighting.update(ctx.camera);
      scatter.update(ctx.camera);
      shack.update(dt);
      beacons.update(U.time.value, ctx.camera);
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
