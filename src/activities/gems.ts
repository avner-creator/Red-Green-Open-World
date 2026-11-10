/**
 * Glow Gems: weak-eye-only collectibles. Everything here lives on the weak-eye layer and is drawn
 * as brightness only (MeshBasicMaterial grey levels), so the shape must read from shading alone.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GEMS, PLAYER } from '../config';
import { VisionLayer } from '../types';
import type { GameContext } from '../types';
import { GEM_FX } from './constants';
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

export interface Gems {
  update(dt: number): void;
  reset(): void;
  dispose(): void;
}

export function createGems(ctx: GameContext): Gems {
  const spots = ctx.world.gemSpots;
  const field = new GemField(
    spots.map((s) => s.position),
    { pickupRadius: GEMS.pickupRadius, nearRadius: GEMS.nearRadius, nearInterval: GEM_FX.nearInterval },
  );
  const n = spots.length;
  ctx.session.setTotals({ gems: n });

  const gemGeo = buildGemGeometry();
  const gemMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const haloTex = haloTexture();
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0.45, depthWrite: false });
  const sparkGeo = new THREE.OctahedronGeometry(0.5);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const gems = new THREE.InstancedMesh(gemGeo, gemMat, Math.max(1, n));
  const halos = new THREE.InstancedMesh(haloGeo, haloMat, Math.max(1, n + GEM_FX.maxBursts));
  const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, GEM_FX.maxBursts * GEM_FX.particles);
  for (const m of [gems, halos, sparks]) {
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  const group = new THREE.Group();
  group.add(gems, halos, sparks);
  // Weak-eye layer only: never added to ctx.scene.
  ctx.vision.add(group, VisionLayer.WeakOnly);

  const bursts: { t: number; pos: THREE.Vector3 }[] = [];
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
    ctx.session.setTotals({ gems: n });
  }

  function drawBursts(): void {
    for (let b = 0; b < GEM_FX.maxBursts; b++) {
      const burst = bursts[b];
      const flashIdx = n + b;
      if (!burst) {
        halos.setMatrixAt(flashIdx, zero);
        for (let p = 0; p < GEM_FX.particles; p++) sparks.setMatrixAt(b * GEM_FX.particles + p, zero);
        continue;
      }
      const k = burst.t / GEM_FX.burstSeconds;
      const ease = 1 - (1 - k) * (1 - k);
      dummy.position.copy(burst.pos);
      dummy.quaternion.copy(ctx.camera.quaternion);
      dummy.scale.setScalar(1.2 + ease * 3.5);
      dummy.updateMatrix();
      halos.setMatrixAt(flashIdx, dummy.matrix);
      for (let p = 0; p < GEM_FX.particles; p++) {
        const ang = (p / GEM_FX.particles) * Math.PI * 2;
        const up = p % 2 === 0 ? 0.9 : 0.2;
        dummy.position.set(
          burst.pos.x + Math.cos(ang) * ease * 2.2,
          burst.pos.y + up * ease * 2 - ease * ease * 0.6,
          burst.pos.z + Math.sin(ang) * ease * 2.2,
        );
        dummy.quaternion.identity();
        dummy.rotation.set(ang, k * 6, 0);
        dummy.scale.setScalar(0.28 * (1 - k));
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
        const position = spots[i].position.clone();
        bursts.push({ t: 0, pos: position.clone() });
        ctx.events.emit('gem:collected', { id: `gem${i}`, count: field.count, total: field.total, position });
        ctx.session.setTotals({ gems: n });
      }
      const near = field.tickNear(dt, cur);
      if (near) ctx.events.emit('gem:near', { id: `gem${near.index}`, distance: near.distance });
    }
    prev.copy(cur);
    havePrev = true;

    for (const burst of bursts) burst.t += dt;
    while (bursts.length && bursts[0].t >= GEM_FX.burstSeconds) bursts.shift();

    // Spin + bob + halo.
    for (let i = 0; i < n; i++) {
      if (field.collected[i]) {
        gems.setMatrixAt(i, zero);
        halos.setMatrixAt(i, zero);
        continue;
      }
      const p = spots[i].position;
      const y = p.y + Math.sin(time * 2 + i * 1.7) * 0.15;
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(0, time * 1.2 + i, 0);
      dummy.scale.setScalar(1.15);
      dummy.updateMatrix();
      gems.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, y, p.z);
      dummy.quaternion.copy(ctx.camera.quaternion);
      dummy.scale.setScalar(2.2 + Math.sin(time * 3 + i) * 0.25);
      dummy.updateMatrix();
      halos.setMatrixAt(i, dummy.matrix);
    }
    gems.instanceMatrix.needsUpdate = true;
    drawBursts();
  }

  return {
    update,
    reset,
    dispose() {
      offReset();
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
