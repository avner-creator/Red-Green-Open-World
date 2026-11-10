/**
 * Bounce pads: springy pads in a line with fixed launch heights (8 / 15 / 25 m). Each pad flies
 * the player (exact arc) onto the next pad, and the last one throws them onto the trampoline.
 */
import * as THREE from 'three';
import type { GameContext } from '../types';
import { PADS } from './constants';
import { solveLaunch } from './ballistics';
import { PadChain, padLocalPositions } from './bounceLogic';
import type { Arc, ArrivalInfo, Flight, FlightHooks } from './flight';
import type { Trampoline } from './trampoline';
import { thrillSpots } from './thrillSpots';

interface Pad {
  index: number;
  apex: number;
  /** World position of the pad surface centre. */
  x: number;
  y: number;
  z: number;
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

export function createBouncePads(ctx: GameContext, flight: Flight, tramp: Trampoline): BouncePads {
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
      cap: new THREE.Mesh(capGeo, capMat), squash: 0,
    });
  });
  // A dark arrow on every cap points at the next pad (the last one at the trampoline).
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, -1);
  arrowShape.lineTo(-0.72, 0.1);
  arrowShape.lineTo(-0.26, 0.1);
  arrowShape.lineTo(-0.26, 0.95);
  arrowShape.lineTo(0.26, 0.95);
  arrowShape.lineTo(0.26, 0.1);
  arrowShape.lineTo(0.72, 0.1);
  arrowShape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(arrowShape).rotateX(-Math.PI / 2);
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0x1d2a5c, roughness: 0.6 });
  disposables.push(arrowGeo, arrowMat);
  pads.forEach((p, i) => {
    const next = pads[i + 1];
    const tx = next ? next.x : tramp.centre.x;
    const tz = next ? next.z : tramp.centre.z;
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.y = 0.125;
    arrow.scale.setScalar(PADS.radius * 0.62);
    arrow.rotation.y = Math.atan2(tx - p.x, tz - p.z);
    p.cap.add(arrow);
  });

  for (const p of pads) {
    const gy = p.y - PADS.top;
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(p.x, gy + PADS.top / 2, p.z);
    base.castShadow = true;
    base.receiveShadow = true;
    p.cap.position.set(p.x, p.y - 0.1, p.z);
    root.add(base, p.cap);
    colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(p.x, gy + PADS.top / 2, p.z), PADS.top / 2, PADS.radius));
  }

  const chain = new PadChain();
  let clock = 0;
  let cooldown = 0;
  let prevGrounded = true;
  let prevPad = -1;

  /** Arc from pad `index` to the next pad, or to the middle of the trampoline for the last one. */
  function arcFrom(index: number, from: { x: number; y: number; z: number }): Arc {
    const next = pads[index + 1];
    const tx = next ? next.x : tramp.centre.x;
    const tz = next ? next.z : tramp.centre.z;
    const ty = next ? next.y : tramp.matTopY;
    const sol = solveLaunch(tx - from.x, ty - from.y, tz - from.z, pads[index].apex);
    return { vx: sol.vx, vy: sol.vy, vz: sol.vz, endY: ty, dwell: 0.06, dip: 0.18 };
  }

  /** Index of the pad the flight is heading for (pads.length = the trampoline). */
  let target = -1;

  const hooks: FlightHooks = {
    onArrive(info: ArrivalInfo, f: Flight) {
      const here = target;
      if (here < pads.length) {
        // Landed on the next pad: spring straight on.
        const idx = here;
        target = idx + 1;
        fx(idx);
        return arcFrom(idx, info.pos);
      }
      // Landed on the trampoline: a big first bounce.
      tramp.catchFrom(info, f);
      return 'handoff';
    },
    camera() {
      const h = Math.min(1, Math.max(0, flight.height) / 25);
      return { distance: 6 + h * 9, height: 2.6 + h * 6, fov: 62 + h * 16 };
    },
    onEnd() {
      target = -1;
    },
  };
  /** Effects of launching from pad `index`. */
  function fx(index: number): void {
    const p = pads[index];
    ctx.audio.play('boing', { pitch: 1.3 - index * 0.12 });
    ctx.cameraRig.shake(0.08 + index * 0.04);
    p.squash = 1;
    flight.visual.stretch = -0.4;
    flight.visual.kick(8 + index * 4);
    if (chain.hit(clock)) {
      ctx.events.emit('stunt', { kind: 'bigAir', value: chain.count, stars: 2 });
      ctx.events.emit('ui:toast', { icon: 'rocket' });
    }
  }

  function launchFrom(index: number): void {
    const p = pads[index];
    if (!p || flight.active || ctx.player.mode !== 'walk') return;
    ctx.player.position.set(p.x, p.y, p.z);
    target = index + 1;
    flight.begin('pads', arcFrom(index, p), hooks);
    if (!flight.active) {
      target = -1;
      return;
    }
    fx(index);
    cooldown = PADS.cooldown;
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

  // Gem-worthy spots: above every pad and at the top of every pad-to-pad arc.
  pads.forEach((p, i) => {
    thrillSpots.push({ position: new THREE.Vector3(p.x, p.y + 2.5, p.z), tag: `pad${i}` });
    const arc = arcFrom(i, p);
    const next = pads[i + 1];
    const tx = next ? next.x : tramp.centre.x;
    const tz = next ? next.z : tramp.centre.z;
    const sol = solveLaunch(tx - p.x, (next ? next.y : tramp.matTopY) - p.y, tz - p.z, p.apex);
    const tm = arc.vy / 22;
    thrillSpots.push({ position: new THREE.Vector3(p.x + sol.vx * tm, p.y + p.apex, p.z + sol.vz * tm), tag: `padArc${i}` });
  });

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
