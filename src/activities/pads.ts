/** Bounce pads: small springy pads in an arc with fixed launch heights and a forward push. */
import * as THREE from 'three';
import type { GameContext } from '../types';
import { PADS } from './constants';
import { PadChain, padLocalPositions, pushSpeed, speedFromApex } from './bounceLogic';

interface Pad {
  index: number;
  apex: number;
  /** World position of the pad surface centre. */
  x: number;
  y: number;
  z: number;
  /** Unit horizontal direction of the push, and its speed. */
  dirX: number;
  dirZ: number;
  push: number;
  cap: THREE.Mesh;
  squash: number;
}

export interface BouncePads {
  update(dt: number): void;
  /** Launch from pad `index` (used by the landing detector and by tests). */
  launchFrom(index: number): void;
  reset(): void;
  dispose(): void;
}

export function createBouncePads(ctx: GameContext): BouncePads {
  const anchor = ctx.world.anchors.bouncePads;
  const sin = Math.sin(anchor.yaw);
  const cos = Math.cos(anchor.yaw);
  const local = padLocalPositions(PADS.heights.length, PADS.spacing);
  const disposables: { dispose(): void }[] = [];
  const colliders: ReturnType<typeof ctx.physics.addStaticCylinder>[] = [];
  const root = new THREE.Group();
  ctx.scene.add(root);

  const baseGeo = new THREE.CylinderGeometry(PADS.radius + 0.25, PADS.radius + 0.35, PADS.top, 24);
  const capGeo = new THREE.CylinderGeometry(PADS.radius, PADS.radius, 0.2, 24);
  const markGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.04, 20);
  disposables.push(baseGeo, capGeo, markGeo);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.7 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.5 });
  const markMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  disposables.push(baseMat, capMat, markMat);

  const pads: Pad[] = [];
  local.forEach((l, i) => {
    const wx = anchor.position.x + l.x * cos + l.z * sin;
    const wz = anchor.position.z - l.x * sin + l.z * cos;
    const gy = ctx.world.heightAt(wx, wz);
    pads.push({
      index: i, apex: PADS.heights[i], x: wx, y: gy + PADS.top, z: wz,
      dirX: 0, dirZ: 1, push: 0, cap: new THREE.Mesh(capGeo, capMat), squash: 0,
    });
  });
  pads.forEach((p, i) => {
    const next = pads[i + 1];
    const prev = pads[i - 1];
    let dx: number;
    let dz: number;
    let dist: number = PADS.spacing;
    if (next) {
      dx = next.x - p.x;
      dz = next.z - p.z;
      dist = Math.hypot(dx, dz);
    } else if (prev) {
      dx = p.x - prev.x;
      dz = p.z - prev.z;
    } else {
      dx = sin;
      dz = cos;
    }
    const len = Math.hypot(dx, dz) || 1;
    p.dirX = dx / len;
    p.dirZ = dz / len;
    p.push = pushSpeed(dist, p.apex);
  });

  for (const p of pads) {
    const gy = p.y - PADS.top;
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(p.x, gy + PADS.top / 2, p.z);
    base.castShadow = true;
    base.receiveShadow = true;
    p.cap.position.set(p.x, p.y - 0.1, p.z);
    const mark = new THREE.Mesh(markGeo, markMat);
    mark.position.set(0, 0.12, 0);
    p.cap.add(mark);
    root.add(base, p.cap);
    colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(p.x, gy + PADS.top / 2, p.z), PADS.top / 2, PADS.radius));
  }

  const chain = new PadChain();
  let clock = 0;
  let cooldown = 0;
  let prevGrounded = true;
  let prevPad = -1;

  function launchFrom(index: number): void {
    const p = pads[index];
    if (!p) return;
    ctx.player.launch(new THREE.Vector3(p.dirX * p.push, speedFromApex(p.apex), p.dirZ * p.push));
    ctx.audio.play('boing', { pitch: 1.3 - index * 0.12 });
    ctx.cameraRig.shake(0.08);
    p.squash = 1;
    cooldown = PADS.cooldown;
    if (chain.hit(clock)) {
      ctx.events.emit('stunt', { kind: 'bigAir', value: chain.count, stars: 1 });
      ctx.events.emit('ui:toast', { icon: 'rocket' });
    }
  }

  function padUnderPlayer(): number {
    const pos = ctx.player.position;
    for (const p of pads) {
      if (Math.hypot(pos.x - p.x, pos.z - p.z) < PADS.radius + 0.3 && Math.abs(pos.y - p.y) < 0.7) return p.index;
    }
    return -1;
  }

  function update(dt: number): void {
    clock += dt;
    cooldown = Math.max(0, cooldown - dt);
    const grounded = ctx.player.grounded;
    const idx = padUnderPlayer();
    if (grounded && idx >= 0 && cooldown <= 0 && (!prevGrounded || idx !== prevPad)) launchFrom(idx);
    prevGrounded = grounded;
    prevPad = grounded ? idx : -1;
    for (const p of pads) {
      if (p.squash > 0.001) {
        p.squash *= Math.exp(-9 * dt);
        const s = 1 - 0.55 * p.squash;
        p.cap.scale.set(1 + (1 - s) * 0.3, s, 1 + (1 - s) * 0.3);
      } else if (p.squash !== 0) {
        p.squash = 0;
        p.cap.scale.set(1, 1, 1);
      }
    }
  }

  function reset(): void {
    chain.reset();
    cooldown = 0;
  }

  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') reset();
  });

  return {
    update,
    launchFrom,
    reset,
    dispose() {
      offPhase();
      for (const c of colliders) ctx.physics.removeCollider(c);
      root.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
