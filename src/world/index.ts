/**
 * STUB (orchestrator scaffold). The world-artist replaces this whole folder.
 * Keep the exported name and signature: `createWorld`.
 */
import * as THREE from 'three';
import { WORLD } from '../config';
import type { Anchor, AnchorName, GameContext, WorldApi } from '../types';

type BootCtx = Pick<GameContext, 'scene' | 'renderer' | 'camera' | 'physics' | 'vision' | 'settings' | 'events' | 'testMode'>;

export async function createWorld(ctx: BootCtx): Promise<WorldApi> {
  ctx.scene.background = new THREE.Color(0x9fc4e8);
  ctx.scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 1.2));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.5);
  sun.position.set(30, 50, 20);
  ctx.scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size, WORLD.size).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x6f9a55, roughness: 1 }),
  );
  ctx.scene.add(ground);
  ctx.physics.addStaticBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(WORLD.size / 2, 0.5, WORLD.size / 2));

  const a = (x: number, z: number, radius = 10, yaw = 0): Anchor => ({ position: new THREE.Vector3(x, 0, z), yaw, radius });
  const anchors: Record<AnchorName, Anchor> = {
    spawn: a(0, 0, 8), garage: a(25, 10), ranch: a(-70, 40, 25), trampoline: a(40, -50, 12),
    bouncePads: a(60, -40), bungee: a(-40, -110, 8), bungeeLanding: a(-40, -130), balloon: a(90, 60, 12),
    landingRings: a(110, 20, 20), lakePlatform: a(-110, -60), lighthouse: a(-150, -20), sillyZone: a(0, 90, 20),
    launchPads: a(20, 100),
  };
  return {
    size: WORLD.size,
    waterLevel: WORLD.waterLevel,
    heightAt: () => 0,
    isLand: (x, z) => Math.abs(x) < WORLD.size / 2 && Math.abs(z) < WORLD.size / 2,
    anchors,
    gemSpots: [
      { position: new THREE.Vector3(3, 1.2, -4), tag: 'plaza' },
      { position: new THREE.Vector3(-4, 1.2, -6), tag: 'plaza' },
      { position: new THREE.Vector3(0, 2.5, -9), tag: 'plaza' },
    ],
    chestSpots: [],
    setTimeOfDay() {},
    setQuality() {},
    update() {},
  };
}
