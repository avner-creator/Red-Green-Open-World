/**
 * Glow Gems: weak-eye-only collectibles. Everything here lives on the weak-eye layer and is drawn
 * as brightness only (MeshBasicMaterial grey levels), so the shape must read from shading alone.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ECONOMY, GEMS, PLAYER } from '../config';
import { VisionLayer } from '../types';
import type { GameContext } from '../types';
import { GEM_FX, MEGA } from './constants';
import { buildMegaGemGeometry } from './economy/megaGem';
import { attractionMegas, computeMegaSpots } from './economy/megaSpots';
import { thrillSpots } from './thrillSpots';
import { bungeeSpots } from './bungee';
import { sillySpots } from './silly';
import { secretRewardSpots } from './secrets';
import { hasPickupSink } from './economy/rules';
import { GemField } from './gemLogic';

/** Faceted gem (crown + pavilion). Grey level per facet is baked into vertex colours. */
export function buildGemGeometry(): THREE.BufferGeometry {
  const crown = new THREE.CylinderGeometry(0.28, 0.5, 0.22, 8, 1).translate(0, 0.11, 0).toNonIndexed();
  const pavilion = new THREE.ConeGeometry(0.5, 0.75, 8, 1, true).rotateX(Math.PI).translate(0, -0.375, 0).toNonIndexed();
  const geo = mergeGeometries([crown, pavilion], false);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const light = new THREE.Vector3(0.4, 0.8, 0.45).normalize();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    let grey: number;
    if (n.y > 0.99) grey = 1; // flat table on top: the bright "core"
    else if (n.y < -0.99) grey = 0.3;
    else {
      const facet = Math.floor((Math.atan2(n.x, n.z) + Math.PI) / (Math.PI / 4));
      const base = 0.38 + 0.5 * Math.max(0, n.dot(light));
      grey = base + (facet % 2 === 0 ? 0.12 : -0.1);
    }
    grey = Math.min(1, Math.max(0.22, grey));
    for (let k = 0; k < 3; k++) colors.set([grey, grey, grey], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function haloTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/** Test hook (only with `?test=1`): what the economy e2e needs. Small on purpose. */
export interface EconomyTestHook {
  megaSpots: { x: number; y: number; z: number; tag: string }[];
  gemSpotCount: number;
  /** Bring every collected gem back right now (emits `gem:respawned`). */
  forceRespawn(): void;
}

declare global {
  interface Window {
    __rgEconomy?: EconomyTestHook;
  }
}

/** Ease-out-back pop-in: 0 to 1 with a little overshoot. */
export function popScale(k: number): number {
  if (k >= 1) return 1;
  if (k <= 0) return 0;
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
}

export interface Gems {
  update(dt: number): void;
  reset(): void;
  dispose(): void;
}

export function createGems(ctx: GameContext): Gems {
  const normalSpots = ctx.world.gemSpots.map((s) => s.position);
  // Mega gems are placed once the rides exist (the rocket arc is only known after the first
  // update of the thrills), see `initMegas`.
  const megaTags: string[] = [];
  const megaSpots: THREE.Vector3[] = [];
  let megasReady = false;
  const n = normalSpots.length;
  let m = 0;
  let total = n;
  const spots: THREE.Vector3[] = [...normalSpots];
  const field = new GemField(spots, {
    pickupRadius: GEMS.pickupRadius,
    nearRadius: GEMS.nearRadius,
    nearInterval: GEM_FX.nearInterval,
    respawnSeconds: ECONOMY.respawnSeconds,
    radiusOf: (i) => (i >= n ? MEGA.pickupRadius : GEMS.pickupRadius),
  });
  /** Seconds since a gem (re)appeared; used for the pop-in. Large = settled. */
  const age = spots.map(() => 99);
  const idOf = (i: number): string => (i >= n ? `mega${i - n}` : `gem${i}`);
  ctx.session.setTotals({ gems: total });

  const gemGeo = buildGemGeometry();
  const gemMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const megaGeo = buildMegaGemGeometry();
  const megaMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const haloTex = haloTexture();
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0.45, depthWrite: false });
  const sparkGeo = new THREE.OctahedronGeometry(0.5);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const gems = new THREE.InstancedMesh(gemGeo, gemMat, Math.max(1, n));
  const megas = new THREE.InstancedMesh(megaGeo, megaMat, MEGA.capacity);
  megas.count = 0;
  const halos = new THREE.InstancedMesh(haloGeo, haloMat, n + MEGA.capacity + GEM_FX.maxBursts);
  const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, GEM_FX.maxBursts * GEM_FX.particles);
  for (const mesh of [gems, megas, halos, sparks]) {
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  const group = new THREE.Group();
  group.add(gems, megas, halos, sparks);
  // Weak-eye layer only: never added to ctx.scene.
  ctx.vision.add(group, VisionLayer.WeakOnly);

  const bursts: { t: number; pos: THREE.Vector3; size: number }[] = [];
  const dummy = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const prev = new THREE.Vector3();
  const cur = new THREE.Vector3();
  let havePrev = false;
  let time = 0;
  let wasPlaying = false;

  const chest = (out: THREE.Vector3): void => {
    out.copy(ctx.player.position);
    out.y += PLAYER.height / 2;
  };

  const offReset = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') reset();
  });

  function reset(): void {
    field.reset();
    bursts.length = 0;
    havePrev = false;
    age.fill(99);
    ctx.session.setTotals({ gems: total });
  }

  const flat = (t: { tag: string; position: THREE.Vector3 }): { tag: string; x: number; y: number; z: number } => ({
    tag: t.tag, x: t.position.x, y: t.position.y, z: t.position.z,
  });

  /** Place the mega gems (first update while playing: thrills are built by then). */
  function initMegas(): void {
    megasReady = true;
    const defs = computeMegaSpots(
      ctx.world.anchors,
      (x, z) => ctx.world.heightAt(x, z),
      thrillSpots.map(flat),
    )
      // The newer attractions publish their gem-worthy spots too (filled at creation / first update).
      .concat(attractionMegas([...bungeeSpots, ...sillySpots, ...secretRewardSpots].map(flat)))
      .slice(0, MEGA.capacity);
    for (const d of defs) {
      const v = new THREE.Vector3(d.x, d.y, d.z);
      // Never sit on top of a normal gem (a world gem can hang in the same column): slide up.
      for (let tries = 0; tries < 4 && normalSpots.some((g) => g.distanceTo(v) < MEGA.minGemGap); tries++) v.y += MEGA.minGemGap;
      megaSpots.push(v);
      megaTags.push(d.tag);
      field.addSpot(v);
      age.push(99);
    }
    m = defs.length;
    total = n + m;
    megas.count = m;
    ctx.session.setTotals({ gems: total });
  }

  function respawned(list: number[]): void {
    for (const i of list) {
      age[i] = 0;
      ctx.events.emit('gem:respawned', { id: idOf(i) });
    }
  }

  function drawBursts(): void {
    for (let b = 0; b < GEM_FX.maxBursts; b++) {
      const burst = bursts[b];
      const flashIdx = n + MEGA.capacity + b;
      if (!burst) {
        halos.setMatrixAt(flashIdx, zero);
        for (let p = 0; p < GEM_FX.particles; p++) sparks.setMatrixAt(b * GEM_FX.particles + p, zero);
        continue;
      }
      const k = burst.t / GEM_FX.burstSeconds;
      const ease = 1 - (1 - k) * (1 - k);
      dummy.position.copy(burst.pos);
      dummy.quaternion.copy(ctx.camera.quaternion);
      dummy.scale.setScalar((1.2 + ease * 3.5) * burst.size);
      dummy.updateMatrix();
      halos.setMatrixAt(flashIdx, dummy.matrix);
      for (let p = 0; p < GEM_FX.particles; p++) {
        const ang = (p / GEM_FX.particles) * Math.PI * 2;
        const sz = burst.size;
        const up = p % 2 === 0 ? 0.9 : 0.2;
        dummy.position.set(
          burst.pos.x + Math.cos(ang) * ease * 2.2 * sz,
          burst.pos.y + up * ease * 2 * sz - ease * ease * 0.6,
          burst.pos.z + Math.sin(ang) * ease * 2.2 * sz,
        );
        dummy.quaternion.identity();
        dummy.rotation.set(ang, k * 6, 0);
        dummy.scale.setScalar(0.28 * sz * (1 - k));
        dummy.updateMatrix();
        sparks.setMatrixAt(b * GEM_FX.particles + p, dummy.matrix);
      }
    }
    halos.instanceMatrix.needsUpdate = true;
    sparks.instanceMatrix.needsUpdate = true;
  }

  function update(dt: number): void {
    time += dt;
    const playing = ctx.session.state.phase === 'playing';
    if (playing && !megasReady) initMegas();
    if (playing !== wasPlaying) {
      havePrev = false;
      wasPlaying = playing;
    }

    // Pickup along the movement segment (a big jump in one frame is a teleport: point test only).
    chest(cur);
    if (playing) {
      if (!havePrev) prev.copy(cur);
      const maxStep = GEM_FX.maxSpeed * Math.max(dt, 1 / 60) + GEM_FX.slack;
      const from = prev.distanceTo(cur) > maxStep ? cur : prev;
      for (const i of field.collect(from, cur)) {
        if (bursts.length >= GEM_FX.maxBursts) bursts.shift();
        const mega = i >= n;
        const value = mega ? ECONOMY.megaGemValue : ECONOMY.gemValue;
        const position = spots[i].clone();
        bursts.push({ t: 0, pos: position.clone(), size: mega ? MEGA.burstScale : 1 });
        // The economy extends the combo and pays value x combo into the wallet.
        let paid: { combo: number; gain: number } = { combo: 1, gain: value };
        if (hasPickupSink(ctx.economy)) paid = ctx.economy.recordPickup(value, mega);
        else ctx.profile.earn(value, 'gem');
        ctx.events.emit('gem:collected', {
          id: idOf(i), count: field.count, total: field.total, position, value, mega, combo: paid.combo, gain: paid.gain,
        });
        ctx.session.setTotals({ gems: total });
      }
      respawned(field.tickRespawn(dt));
      const near = field.tickNear(dt, cur);
      if (near) ctx.events.emit('gem:near', { id: idOf(near.index), distance: near.distance });
    }
    prev.copy(cur);
    havePrev = true;

    for (const burst of bursts) burst.t += dt;
    while (bursts.length && bursts[0].t >= GEM_FX.burstSeconds) bursts.shift();

    // Spin + bob + halo. Gems (re)appearing pop in on the layer.
    for (let i = 0; i < total; i++) {
      const isMega = i >= n;
      const mesh = isMega ? megas : gems;
      const slot = isMega ? i - n : i;
      if (field.collected[i]) {
        mesh.setMatrixAt(slot, zero);
        halos.setMatrixAt(i, zero);
        continue;
      }
      age[i] += dt;
      const pop = popScale(age[i] / MEGA.popSeconds);
      const p = spots[i];
      const y = p.y + Math.sin(time * 2 + i * 1.7) * (isMega ? 0.25 : 0.15);
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(0, time * (isMega ? 0.8 : 1.2) + i, 0);
      dummy.scale.setScalar((isMega ? MEGA.scale : 1.15) * pop);
      dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);
      dummy.position.set(p.x, y, p.z);
      dummy.quaternion.copy(ctx.camera.quaternion);
      dummy.scale.setScalar((isMega ? 5 : 2.2) * pop + Math.sin(time * 3 + i) * (isMega ? 0.5 : 0.25) * pop);
      dummy.updateMatrix();
      halos.setMatrixAt(i, dummy.matrix);
    }
    megas.instanceMatrix.needsUpdate = true;
    gems.instanceMatrix.needsUpdate = true;
    drawBursts();
  }

  if (ctx.testMode) {
    window.__rgEconomy = {
      get megaSpots() {
        return megaSpots.map((v, i) => ({ x: v.x, y: v.y, z: v.z, tag: megaTags[i] }));
      },
      gemSpotCount: n,
      forceRespawn: () => respawned(field.respawnAll()),
    };
  }

  return {
    update,
    reset,
    dispose() {
      offReset();
      if (ctx.testMode) delete window.__rgEconomy;
      megaGeo.dispose();
      megaMat.dispose();
      megas.dispose();
      ctx.vision.remove(group);
      gemGeo.dispose();
      gemMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      haloTex.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
      gems.dispose();
      halos.dispose();
      sparks.dispose();
    },
  };
}
