/**
 * Island toys: both-eye props that react when the hero bumps them. Built into the shared batcher on
 * the 'toy' material (see materials.ts `createToyMaterial`), so every toy on the island costs one draw
 * call together; their motion runs in the vertex shader and is keyed by each toy's pivot. `toys-live.ts`
 * watches the hero and writes the bumps. Pure geometry + data: no WebGL.
 *
 * - mushroom: big spotted cap you can land on: it squashes and bounces you up (boing).
 * - duck: giant rubber duck: squeaks and wobbles when you walk into it.
 * - pinwheel: striped pinwheel on a post: whirls when you run past.
 * - ball: giant beach ball on a sand dish: rocks and boings.
 * - spring: spring-mounted flower: rocks back and forth.
 * Colours always pair a saturated colour with white or near-black, so every toy reads by brightness in
 * the red-only and green-only channels.
 */
import * as THREE from 'three';
import { T } from '../batch';
import { TOY } from '../materials';
import type { Kit } from '../props';
import { coneG, cylG, sphereG, torusG } from '../shapes';

export type ToyKind = 'mushroom' | 'duck' | 'pinwheel' | 'ball' | 'spring';

export interface ToyDef {
  kind: ToyKind;
  /** Base on the ground. */
  x: number;
  y: number;
  z: number;
  /** Shader pivot (the key `U.bumps` matches): every moving part of the toy shares it. */
  pivot: [number, number, number];
  /** Footprint radius (collider) and the walkable top above the base (mushroom). */
  r: number;
  top: number;
}

export const CAPS = [0xe2483c, 0xd8409a, 0x3a72d8, 0xf08a24] as const;
const WHITE = 0xfaf6ec;
const INK = 0x1c1e24;

/** Add a toy part: geometry × matrix, tagged with its motion (pivot, kind, axis, speed/size). */
export function toyPart(
  k: Kit,
  geo: THREE.BufferGeometry,
  color: number,
  m: THREE.Matrix4,
  pivot: readonly [number, number, number],
  kind: number,
  axis: readonly [number, number, number] = [0, 1, 0],
  w = 0,
): void {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const pv = new Float32Array(n * 4);
  const ax = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pv.set([pivot[0], pivot[1], pivot[2], kind], i * 4);
    ax.set([axis[0], axis[1], axis[2], w], i * 4);
  }
  g.setAttribute('aPivot', new THREE.BufferAttribute(pv, 4));
  g.setAttribute('aAxis', new THREE.BufferAttribute(ax, 4));
  k.b.add('toy', g, color);
  g.dispose();
}

/** Beach-ball sphere: six coloured gores (vertex colours), white poles. */
let ballGeo: THREE.BufferGeometry | null = null;
function beachBallG(): THREE.BufferGeometry {
  if (ballGeo) return ballGeo;
  const g = new THREE.SphereGeometry(1, 18, 10).toNonIndexed();
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const gores = [0xe2483c, WHITE, 0x3a72d8, WHITE, 0xf2c14e, WHITE].map((c) => new THREE.Color(c));
  const white = new THREE.Color(WHITE);
  for (let i = 0; i < pos.count; i += 3) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let j = 0; j < 3; j++) {
      cx += pos.getX(i + j);
      cy += pos.getY(i + j);
      cz += pos.getZ(i + j);
    }
    const a = Math.atan2(cz, cx) + Math.PI;
    const c = Math.abs(cy / 3) > 0.86 ? white : gores[Math.floor((a / (Math.PI * 2)) * 6) % 6];
    for (let j = 0; j < 3; j++) col.set([c.r, c.g, c.b], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return (ballGeo = g);
}

/** Pinwheel head: four curled blades (flat triangles) in the local XY plane, facing +Z. */
let bladeGeo: THREE.BufferGeometry | null = null;
function bladeG(): THREE.BufferGeometry {
  if (bladeGeo) return bladeGeo;
  const g = new THREE.BufferGeometry();
  // One blade from the hub out to (0, 1) with a curl back to (0.45, 0.45); both faces.
  const p = [0, 0, 0, 0, 1, 0.08, 0.5, 0.5, 0.0, 0, 0, 0, 0.5, 0.5, 0.0, 0, 1, 0.08];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return (bladeGeo = g);
}

export function mushroom(k: Kit, x: number, z: number, s: number, cap: number): ToyDef {
  const y = k.h(x, z);
  const pivot: [number, number, number] = [x, y, z];
  const H = 1.35 * s;
  const R = 1.05 * s;
  const W = TOY.wobble;
  toyPart(k, cylG(10, 0.8, true), WHITE, T(x, y, z, 0, 0.42 * s, H - 0.2 * s, 0.42 * s), pivot, W, [0, 1, 0], H);
    // Cap: a dome (squashed sphere) with a cream rim underneath.
  toyPart(k, sphereG(1), cap, T(x, y + H - 0.1 * s, z, 0, R, 0.62 * s, R), pivot, W, [0, 1, 0], H);
  toyPart(k, cylG(12), 0xf3e6c8, T(x, y + H - 0.2 * s, z, 0, R * 0.9, 0.14 * s, R * 0.9), pivot, W, [0, 1, 0], H);
  // White spots on the dome (points on the unit sphere, mapped onto the squashed cap).
  const cy = y + H - 0.1 * s;
  for (let i = 0; i < 6; i++) {
    const el = i === 0 ? Math.PI / 2 : 0.55 + (i % 2) * 0.35;
    const az = i * 1.37;
    const dx = Math.cos(el) * Math.cos(az);
    const dy = Math.sin(el);
    const dz = Math.cos(el) * Math.sin(az);
    const r = (i === 0 ? 0.3 : 0.2) * s;
    toyPart(k, sphereG(0), WHITE, T(x + dx * R * 0.97, cy + dy * 0.62 * s * 0.97, z + dz * R * 0.97, -az, r, r * 0.5, r, Math.PI / 2 - el), pivot, W, [0, 1, 0], H);
  }
  // Solid drum: walk into the side (bump) or land on the top (bounce).
  k.col.cyl(x, y, z, (H + 0.35 * s) / 2, R * 0.85);
  return { kind: 'mushroom', x, y, z, pivot, r: R * 0.85, top: H + 0.35 * s };
}

export function duck(k: Kit, x: number, z: number, yaw: number, s = 1): ToyDef {
  const y = k.h(x, z);
  const pivot: [number, number, number] = [x, y, z];
  const W = TOY.wobble;
  const m = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, pitch = 0): THREE.Matrix4 => {
    const f = new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    return T(x + f.x * s, y + f.y * s, z + f.z * s, yaw, sx * s, sy * s, sz * s, pitch);
  };
  const YEL = 0xffd23a;
  toyPart(k, sphereG(1), YEL, m(0, 0.55, -0.1, 0.78, 0.55, 0.95), pivot, W, [0, 1, 0], 1.6 * s);
  toyPart(k, sphereG(1), YEL, m(0, 0.38, -0.95, 0.35, 0.3, 0.32), pivot, W, [0, 1, 0], 1.6 * s); // tail
  toyPart(k, sphereG(1), YEL, m(0, 1.18, 0.42, 0.48, 0.46, 0.46), pivot, W, [0, 1, 0], 1.6 * s); // head
  toyPart(k, coneG(10), 0xf06a1c, m(0, 1.12, 0.84, 0.17, 0.4, 0.12, Math.PI / 2), pivot, W, [0, 1, 0], 1.6 * s); // beak
  for (const sx of [-1, 1]) {
    toyPart(k, sphereG(1), WHITE, m(sx * 0.2, 1.3, 0.78, 0.11, 0.12, 0.06), pivot, W, [0, 1, 0], 1.6 * s);
    toyPart(k, sphereG(1), INK, m(sx * 0.21, 1.3, 0.83, 0.06, 0.07, 0.03), pivot, W, [0, 1, 0], 1.6 * s);
    toyPart(k, sphereG(1), 0xf4b800, m(sx * 0.62, 0.62, -0.15, 0.14, 0.32, 0.55), pivot, W, [0, 1, 0], 1.6 * s); // wing
  }
  k.col.cyl(x, y, z, 0.8 * s, 0.75 * s);
  return { kind: 'duck', x, y, z, pivot, r: 0.75 * s, top: 1.6 * s };
}

export function pinwheel(k: Kit, x: number, z: number, yaw: number, colors: readonly [number, number] = [0xe2483c, 0x3a72d8]): ToyDef {
  const y = k.h(x, z);
  const hy = y + 2.25;
  const pivot: [number, number, number] = [x, hy, z];
  // Post (stands still).
  k.b.add('paint', cylG(8), WHITE, T(x, y, z, 0, 0.07, 2.3, 0.07), { aoY: y, aoH: 0.4, ao: 0.3 });
  k.b.add('paint', cylG(10), INK, T(x, y, z, 0, 0.16, 0.12, 0.16));
  const ax: [number, number, number] = [Math.sin(yaw), 0, Math.cos(yaw)];
  for (let i = 0; i < 4; i++) {
    const m = T(x + ax[0] * 0.12, hy, z + ax[2] * 0.12, yaw, 0.95, 0.95, 0.95, 0, (i * Math.PI) / 2);
    toyPart(k, bladeG(), i % 2 ? colors[1] : colors[0], m, pivot, TOY.pinwheel, ax);
    const inner = T(x + ax[0] * 0.14, hy, z + ax[2] * 0.14, yaw, 0.55, 0.55, 0.55, 0, (i * Math.PI) / 2 + Math.PI / 4);
    toyPart(k, bladeG(), WHITE, inner, pivot, TOY.pinwheel, ax);
  }
  toyPart(k, sphereG(1), 0xf2c14e, T(x + ax[0] * 0.2, hy, z + ax[2] * 0.2, 0, 0.11, 0.11, 0.11), pivot, TOY.pinwheel, ax);
  k.col.cyl(x, y, z, 1.15, 0.12);
  return { kind: 'pinwheel', x, y, z, pivot, r: 0.12, top: 2.3 };
}

export function beachBall(k: Kit, x: number, z: number, s = 1): ToyDef {
  const y = k.h(x, z);
  const R = 0.75 * s;
  const pivot: [number, number, number] = [x, y, z];
  k.b.add('matte', cylG(18), 0xe9d9a8, T(x, y - 0.05, z, 0, R * 1.1, 0.12, R * 1.1), { aoY: y, aoH: 0.2, ao: 0.2 });
  toyPart(k, beachBallG(), WHITE, T(x, y + R + 0.02, z, 0.4, R, R, R), pivot, TOY.wobble, [0, 1, 0], 2 * R);
  k.col.sphere(x, y + R, z, R);
  return { kind: 'ball', x, y, z, pivot, r: R, top: 2 * R };
}

export function springFlower(k: Kit, x: number, z: number, petal: number): ToyDef {
  const y = k.h(x, z);
  const pivot: [number, number, number] = [x, y + 0.15, z];
  const S = TOY.sway;
  k.b.add('paint', cylG(14), INK, T(x, y, z, 0, 0.4, 0.15, 0.4), { aoY: y, aoH: 0.2, ao: 0.3 });
  for (let i = 0; i < 4; i++) toyPart(k, torusG(0.05, 10, Math.PI * 2, 0.22, 4), 0xc9ced6, T(x, y + 0.25 + i * 0.16, z), pivot, S, [0, 1, 0], 1.8);
  toyPart(k, cylG(8), 0x3b8a3a, T(x, y + 0.8, z, 0, 0.06, 0.65, 0.06), pivot, S, [0, 1, 0], 1.8);
  const fy = y + 1.55;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    toyPart(k, sphereG(0), petal, T(x + Math.cos(a) * 0.32, fy, z + Math.sin(a) * 0.32, -a, 0.24, 0.24, 0.1), pivot, S, [0, 1, 0], 1.8);
  }
  toyPart(k, sphereG(1), 0xf2c14e, T(x, fy, z, 0, 0.2, 0.2, 0.14), pivot, S, [0, 1, 0], 1.8);
  toyPart(k, sphereG(1), WHITE, T(x, fy, z, 0, 0.1, 0.1, 0.17), pivot, S, [0, 1, 0], 1.8);
  k.col.cyl(x, y, z, 0.6, 0.4);
  return { kind: 'spring', x, y, z, pivot, r: 0.4, top: 1.8 };
}

/** Footprint radius of each toy kind (for placement). */
export const TOY_R: Record<ToyKind, number> = { mushroom: 1.3, duck: 1.0, pinwheel: 0.6, ball: 1.0, spring: 0.6 };

