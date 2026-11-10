/**
 * STUB (orchestrator scaffold). The engine-engineer replaces this whole folder.
 * Keep the exported names and signatures: `createInput`, `createPhysics`, `createPlayerSystems`.
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { FIXED_DT, PLAYER } from '../config';
import type {
  CameraApi, GameContext, GameSystem, InputApi, InputState, InteractionApi, Interactable, PhysicsApi,
  PlayerApi, VehiclesApi,
} from '../types';

const NEUTRAL: InputState = {
  moveX: 0, moveY: 0, lookX: 0, lookY: 0, sprint: false, jump: false, use: false, jumpPressed: false,
  usePressed: false, flopPressed: false, respawnPressed: false, pausePressed: false, device: 'keyboard',
};

export function createInput(_ctx: Pick<GameContext, 'canvas' | 'testMode'>): InputApi {
  const state: InputState = { ...NEUTRAL };
  let injected: Partial<InputState> | null = null;
  return {
    state,
    update() {
      Object.assign(state, NEUTRAL, injected ?? {});
    },
    capturePointer() {},
    releasePointer() {},
    setGameplayEnabled() {},
    inject(patch) {
      injected = patch;
    },
  };
}

export async function createPhysics(_ctx: Pick<GameContext, 'events'>): Promise<PhysicsApi> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -PLAYER.gravity, z: 0 });
  world.timestep = FIXED_DT;
  const fixed = (desc: RAPIER.ColliderDesc, p: THREE.Vector3, q?: THREE.Quaternion): RAPIER.Collider => {
    desc.setTranslation(p.x, p.y, p.z);
    if (q) desc.setRotation(q);
    return world.createCollider(desc);
  };
  let acc = 0;
  return {
    rapier: RAPIER,
    world,
    addStaticBox: (c, h, q) => fixed(RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z), c, q),
    addStaticCylinder: (c, hh, r) => fixed(RAPIER.ColliderDesc.cylinder(hh, r), c),
    addStaticSphere: (c, r) => fixed(RAPIER.ColliderDesc.ball(r), c),
    addStaticMesh(mesh) {
      mesh.updateWorldMatrix(true, false);
      const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const pos = new Float32Array(g.attributes.position.array);
      const idx = g.index ? new Uint32Array(g.index.array) : new Uint32Array(pos.length / 3).map((_, i) => i);
      return world.createCollider(RAPIER.ColliderDesc.trimesh(pos, idx));
    },
    addHeightfield(nx, nz, heights, size) {
      // Rapier wants column-major (x outer, z inner); the API takes row-major [z][x].
      const h = new Float32Array((nx + 1) * (nz + 1));
      for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) h[x * (nz + 1) + z] = heights[z * (nx + 1) + x];
      return world.createCollider(RAPIER.ColliderDesc.heightfield(nz, nx, h, { x: size.x, y: 1, z: size.z }));
    },
    removeCollider: (c) => world.removeCollider(c, true),
    raycast(origin, dir, maxDist) {
      const ray = new RAPIER.Ray(origin, dir);
      const hit = world.castRayAndGetNormal(ray, maxDist, true);
      if (!hit) return null;
      const p = ray.pointAt(hit.timeOfImpact);
      return { point: new THREE.Vector3(p.x, p.y, p.z), normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z), distance: hit.timeOfImpact };
    },
    step(dt) {
      acc = Math.min(acc + dt, 5 * FIXED_DT);
      while (acc >= FIXED_DT) {
        world.step();
        acc -= FIXED_DT;
      }
    },
  };
}

export interface PlayerSystems {
  player: PlayerApi;
  cameraRig: CameraApi;
  interactions: InteractionApi;
  vehicles: VehiclesApi;
  system: GameSystem;
}

export async function createPlayerSystems(ctx: GameContext): Promise<PlayerSystems> {
  const spawn = ctx.world.anchors.spawn;
  const object = new THREE.Mesh(
    new THREE.CapsuleGeometry(PLAYER.radius, PLAYER.height - 2 * PLAYER.radius).translate(0, PLAYER.height / 2, 0),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }),
  );
  object.castShadow = true;
  ctx.scene.add(object);
  const position = object.position;
  position.copy(spawn.position);
  const velocity = new THREE.Vector3();
  const targets = new Set<Interactable>();
  const player: PlayerApi = {
    object, position, velocity, yaw: spawn.yaw, mode: 'walk', grounded: true, airTime: 0, airPeak: 0,
    teleport(p, yaw) {
      position.copy(p);
      if (yaw !== undefined) player.yaw = yaw;
    },
    launch(v) {
      velocity.copy(v);
    },
    flop() {},
    respawn() {
      position.copy(spawn.position);
    },
    setExternalController() {},
    setAnimation() {},
    setVisible(v) {
      object.visible = v;
    },
    attach(_part, o) {
      object.add(o);
      return () => o.removeFromParent();
    },
    vehicle: null,
  };
  const cameraRig: CameraApi = { camera: ctx.camera, setOverride() {}, shake() {}, yaw: 0 };
  return {
    player,
    cameraRig,
    interactions: {
      add(t) {
        targets.add(t);
        return () => targets.delete(t);
      },
      focused: null,
    },
    vehicles: { all: [] },
    system: {
      update() {
        ctx.camera.position.set(position.x, position.y + 3, position.z + 8);
        ctx.camera.lookAt(position.x, position.y + 1.2, position.z);
      },
    },
  };
}
