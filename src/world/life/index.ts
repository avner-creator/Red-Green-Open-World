/**
 * A living island: critters, townsfolk, cloud shadows and wind. Registered with one line in
 * `src/world/index.ts` (`installLife`), which wraps the world's update/quality/time-of-day hooks.
 *
 * Everything here is a both-eye object in the main scene: nothing is weak-eye-only, nothing points
 * at or reveals a weak-eye object (townsfolk only ever point at attraction anchors).
 * Budget: ≤ 25 draw calls and ≤ 60k triangles on Medium (less on Low), < 0.5 ms CPU per frame.
 * Deterministic: seeded random numbers and dt-driven time only.
 */
import * as THREE from 'three';
import type { GameContext, PlayerApi, VehiclesApi, WorldApi, Quality, AudioApi } from '../../types';
import { createCritters, type LifeView } from './critters';
import { createClouds } from './clouds';
import { createTownsfolk, FOLK_DEBUG } from './townsfolk';
import type { Threat } from './math';

type LifeCtx = Pick<GameContext, 'scene' | 'camera' | 'physics' | 'events' | 'testMode'> & {
  // Created after the world (filled in by boot before the first update).
  player?: PlayerApi;
  vehicles?: VehiclesApi;
  audio?: AudioApi;
};

export interface LifeDebug {
  stats(): { avgMs: number; maxMs: number; frames: number };
  resetStats(): void;
  critters: ReturnType<ReturnType<typeof createCritters>['debug']>;
  townsfolk: ReturnType<ReturnType<typeof createTownsfolk>['debug']>;
  townsfolkReady: boolean;
  root: THREE.Object3D;
  folkDebug: { ik: boolean };
  /** Hide/show everything this module draws (draw-call budget checks). */
  setVisible(v: boolean): void;
  wind: number;
  loadTownsfolk(): Promise<void>;
}

declare global {
  interface Window {
    /** Test mode only: the living-island systems (see tests/e2e/life.spec.ts). */
    __rgLife?: LifeDebug;
  }
}

/** Build the island's life and hook it into the world API. */
export function installLife(world: WorldApi, ctx: LifeCtx, parent: THREE.Object3D): void {
  const root = new THREE.Group();
  root.name = 'life';
  parent.add(root);
  const sun = (ctx.scene.getObjectByName('sun') as THREE.DirectionalLight | undefined) ?? null;
  const clouds = createClouds(sun);
  ctx.scene.add(clouds.object);
  let squeakCooldown = 0;
  const critters = createCritters({
    heightAt: world.heightAt,
    isLand: world.isLand,
    waterLevel: world.waterLevel,
    squeak(kind, x, z) {
      const p = ctx.player?.position;
      if (!ctx.audio || !p || squeakCooldown > 0 || Math.hypot(p.x - x, p.z - z) > 25) return;
      squeakCooldown = 0.15;
      ctx.audio.play('boing', { volume: 0.35, pitch: kind === 'chicken' ? 2.6 : 1.9 });
    },
  });
  root.add(critters.group);
  const folk = createTownsfolk({
    heightAt: world.heightAt,
    anchors: world.anchors,
    addCollider: (c, hh, r) => void ctx.physics.addStaticCylinder(c, hh, r),
  });
  root.add(folk.group);

  // Load the townsfolk once play starts (they share the hero GLBs), never during boot. In test mode
  // only on request (`__rgLife.loadTownsfolk()`): an async pop-in between two frames a test compares
  // would make pixel tests flaky.
  ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && !ctx.testMode) void folk.load();
  });
  ctx.events.on('stunt', () => {
    const p = ctx.player?.position;
    if (p) folk.cheer(p.x, p.z);
  });
  ctx.events.on('player:emote', () => {
    const p = ctx.player?.position;
    if (p) folk.wave(p.x, p.z);
  });

  const threats: Threat[] = [];
  const blobs: [number, number, number, number][] = [];
  const view: LifeView = { cam: ctx.camera.position, player: null, threats, blobs };
  const player = { x: 0, y: 0, z: 0, vx: 0, vz: 0, inVehicle: false };
  const folkPlayer = { x: 0, y: 0, z: 0, speed: 0, onFoot: true };
  const sunDir = new THREE.Vector3();
  let total = 0;
  let worst = 0;
  let frames = 0;

  const { update, setQuality, setTimeOfDay } = world;
  const w = world as { -readonly [K in keyof WorldApi]: WorldApi[K] };
  w.update = (dt) => {
    update(dt);
    const t0 = performance.now();
    squeakCooldown -= dt;
    threats.length = 0;
    blobs.length = 0;
    const p = ctx.player;
    if (p) {
      const veh = p.vehicle;
      player.x = p.position.x;
      player.y = p.position.y;
      player.z = p.position.z;
      player.vx = p.velocity.x;
      player.vz = p.velocity.z;
      player.inVehicle = veh !== null;
      view.player = player;
      if (!veh) threats.push({ x: player.x, z: player.z, vx: player.vx, vz: player.vz, radius: 0.4 });
      folkPlayer.x = player.x;
      folkPlayer.y = player.y;
      folkPlayer.z = player.z;
      folkPlayer.speed = Math.hypot(player.vx, player.vz);
      folkPlayer.onFoot = p.mode === 'walk' && p.grounded;
    }
    for (const v of ctx.vehicles?.all ?? []) {
      // Vehicle speed is signed along its heading; derive a velocity from its facing.
      const fwd = v.object.getWorldDirection(sunDir);
      threats.push({ x: v.position.x, z: v.position.z, vx: fwd.x * v.speed, vz: fwd.z * v.speed, radius: v.kind === 'car' ? 1.3 : 0.8 });
    }
    folk.update(dt, { cam: ctx.camera, player: p ? folkPlayer : null });
    folk.blobs(blobs);
    critters.update(dt, view);
    if (sun) sunDir.copy(sun.position).sub(sun.target.position).normalize();
    else sunDir.set(0, 1, 0);
    clouds.update(dt, ctx.camera.position, sunDir, world.heightAt);
    const ms = performance.now() - t0;
    total += ms;
    worst = Math.max(worst, ms);
    frames++;
  };
  let quality: Quality = 'medium';
  w.setQuality = (q: Quality) => {
    quality = q;
    setQuality(q);
    critters.setQuality(q);
    folk.setQuality(q);
    clouds.setQuality(q);
  };
  w.setTimeOfDay = (t) => {
    setTimeOfDay(t);
    critters.setTimeOfDay(t);
  };

  if (ctx.testMode) {
    window.__rgLife = {
      stats: () => ({ avgMs: frames ? total / frames : 0, maxMs: worst, frames }),
      resetStats: () => {
        total = 0;
        worst = 0;
        frames = 0;
      },
      get critters() {
        return critters.debug();
      },
      get townsfolk() {
        return folk.debug();
      },
      get townsfolkReady() {
        return folk.ready;
      },
      get wind() {
        return clouds.wind;
      },
      root,
      folkDebug: FOLK_DEBUG,
      setVisible(v) {
        root.visible = v;
        clouds.object.visible = v;
        if (v) clouds.setQuality(quality);
      },
      loadTownsfolk: () => folk.load(),
    };
  }
}
