/**
 * The booth's geometry (pure: three.js geometry only, unit-tested in node). Everything static of
 * a booth (marquee, striped poles, banner, bunting, picture board, lamp bar, start pad, decals)
 * and the few quads that change (demo, lamps, pad, device, prompt) are ONE non-indexed geometry
 * for ONE draw call with the shared booth atlas. Changing quads are addressed by name
 * (`slots`): their vertex range, so a controller rewrites only their UVs, colours or positions.
 *
 * Frame: the mini-game's frame (site-local metres, +Z towards the approach); the mesh sits at the
 * frame's origin with its yaw, at the site's height.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bannerUv, cellUv, deviceUv, footprintsUv, KIT_CELL, lampUv, swatchUv } from './cells';
import type { SwatchId, UvRect } from './cells';
import type { BoothSpec } from './types';

/** Marquee measurements (marquee-local metres; front at z = 0, facing +Z). */
export const MARQUEE = {
  poleX: 1.45,
  poleR: 0.13,
  poleTop: 4.3,
  sink: 0.6,
  finialR: 0.2,
  counterW: 2.64,
  counterH: 0.85,
  counterZ: -0.18,
  boardY: 1.95,
  boardW: 2.2,
  boardH: 1.95,
  demo: 1.76,
  lampY: 3.2,
  lampBarW: 2.74,
  lampBarH: 0.52,
  lamp: 0.42,
  bannerY: 3.9,
  bannerW: 3.4,
  bannerH: 0.85,
  markY: 5.02,
  mark: 1.15,
  mastTop: 6.0,
} as const;

export const PAD_R = 0.95;
/** Height of the device pictogram and the default prompt above the pad (m). */
export const DEVICE_Y = 1.5;
export const PROMPT_Y = 2.75;

export interface Slot {
  /** First vertex and vertex count in the merged geometry. */
  start: number;
  count: number;
  /** Unit UV (0..1) of each vertex, so the UV rect can be swapped and billboards rebuilt. */
  unit: Float32Array;
  /** Rest size (w, h) for quads. */
  w: number;
  h: number;
}

export interface BoxCollider {
  /** Frame-local centre (y relative to the site's y) and half extents, turned by `yaw`. */
  center: THREE.Vector3;
  half: THREE.Vector3;
  yaw: number;
}

export interface BoothGeometry {
  geometry: THREE.BufferGeometry;
  slots: Map<string, Slot>;
  triangles: number;
  /** Frame-local box of the marquee (for the 30 m screen-rect check). */
  marqueeBox: THREE.Box3;
  colliders: BoxCollider[];
  /** Frame-local points: the pad centre on its ground, the prompt and countdown spots. */
  padCenter: THREE.Vector3;
  promptAt: THREE.Vector3;
  countdownAt: THREE.Vector3;
  /** Frame-local point just in front of the banner (celebration confetti, prize gems start here). */
  bannerAt: THREE.Vector3;
  /** Frame-local point in front of the picture board: where the play prompt floats by default. */
  boardFront: THREE.Vector3;
  /** Frame-local point in front of the magic-glasses mark (celebration burst and confetti). */
  topAt: THREE.Vector3;
}

type Piece = { geo: THREE.BufferGeometry; name?: string; w?: number; h?: number };

function remap(geo: THREE.BufferGeometry, rect: UvRect): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * rect[2], rect[1] + uv.getY(i) * rect[3]);
  return geo;
}

function flat(geo: THREE.BufferGeometry, s: SwatchId): THREE.BufferGeometry {
  const r = swatchUv(s);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + r[2] / 2, r[1] + r[3] / 2);
  return geo;
}

/** Collect pieces; named ones become addressable slots. */
class Collector {
  readonly pieces: Piece[] = [];
  add(geo: THREE.BufferGeometry, m?: THREE.Matrix4): void {
    if (m) geo.applyMatrix4(m);
    this.pieces.push({ geo });
  }
  box(w: number, h: number, d: number, at: THREE.Matrix4, look: SwatchId | UvRect): void {
    const g = new THREE.BoxGeometry(w, h, d);
    if (typeof look === 'string') flat(g, look);
    else remap(g, look);
    this.add(g, at);
  }
  /** Quad in the XY plane facing +Z (before `at`), UVs over `rect`. */
  quad(w: number, h: number, at: THREE.Matrix4, rect: UvRect, name?: string): void {
    const g = new THREE.PlaneGeometry(w, h);
    const unit = g.getAttribute('uv').clone();
    remap(g, rect);
    g.applyMatrix4(at);
    g.userData.unit = unit;
    this.pieces.push({ geo: g, name, w, h });
  }
}

const M = (x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')), new THREE.Vector3(1, 1, 1));

/** Matrix product a·b (new matrix). */
const mul = (a: THREE.Matrix4, b: THREE.Matrix4): THREE.Matrix4 => a.clone().multiply(b);

/** Build a booth. `ground(x, z)` = ground height under a frame-local point (relative to the site's y). */
export function buildBoothGeometry(spec: BoothSpec, ground: (x: number, z: number) => number = () => 0): BoothGeometry {
  const K = MARQUEE;
  const col = new Collector();
  const colliders: BoxCollider[] = [];
  const mq = spec.marquee;
  const toFrame = (lx: number, lz: number): { x: number; z: number } => {
    const c = Math.cos(mq.yaw);
    const s = Math.sin(mq.yaw);
    return { x: mq.x + lx * c + lz * s, z: mq.z - lx * s + lz * c };
  };
  // Marquee base height: the lowest ground under its feet (the poles sink into higher ground).
  const feet = [[-K.poleX, 0], [K.poleX, 0], [-K.poleX, K.counterZ * 2], [K.poleX, K.counterZ * 2]].map(([x, z]) => {
    const p = toFrame(x, z);
    return ground(p.x, p.z);
  });
  const baseY = Math.min(...feet);
  const B = M(mq.x, baseY, mq.z, mq.yaw);
  const at = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0): THREE.Matrix4 => mul(B, M(x, y, z, yaw, pitch, roll));

  // ── poles: candy-striped cylinders, gold finials and foot collars ──
  for (const sx of [-1, 1]) {
    const h = K.poleTop + K.sink;
    const pole = new THREE.CylinderGeometry(K.poleR, K.poleR, h, 10, 1, true);
    remap(pole, cellUv(KIT_CELL.stripes, 6));
    col.add(pole, at(sx * K.poleX, h / 2 - K.sink, 0));
    const fin = new THREE.SphereGeometry(K.finialR, 8, 6);
    flat(fin, 'gold');
    col.add(fin, at(sx * K.poleX, K.poleTop + K.finialR * 0.8, 0));
    col.box(K.poleR * 2 + 0.12, 0.3, K.poleR * 2 + 0.12, at(sx * K.poleX, 0.05, 0), 'woodDark');
    colliders.push({ center: new THREE.Vector3(...pt(toFrame(sx * K.poleX, 0), baseY + (K.poleTop - K.sink) / 2)), half: new THREE.Vector3(K.poleR + 0.05, (K.poleTop + K.sink) / 2, K.poleR + 0.05), yaw: mq.yaw });
  }
  // ── counter: striped front, gold top ──
  col.box(K.counterW, K.counterH + K.sink, 0.5, at(0, (K.counterH - K.sink) / 2, K.counterZ), cellUv(KIT_CELL.stripes, 6));
  col.box(K.counterW + 0.16, 0.1, 0.62, at(0, K.counterH + 0.05, K.counterZ), 'gold');
  // ── picture board: gold frame, dark face, the demo quad ──
  col.box(K.boardW, K.boardH, 0.12, at(0, K.boardY, -0.12), 'gold');
  col.box(K.boardW - 0.16, K.boardH - 0.16, 0.04, at(0, K.boardY, -0.05), 'ink');
  col.quad(K.demo, K.demo, at(0, K.boardY, -0.02), cellUv(0), 'demo');
  // ── lamp bar (night) with the lamps ──
  col.box(K.lampBarW, K.lampBarH, 0.16, at(0, K.lampY, -0.12), 'night');
  const n = Math.max(1, Math.min(6, Math.round(spec.lamps)));
  const step = Math.min(0.5, (K.lampBarW - 0.3) / n);
  for (let i = 0; i < n; i++) col.quad(K.lamp, K.lamp, at((i - (n - 1) / 2) * step, K.lampY, -0.035), lampUv('off'), `lamp${i}`);
  // ── banner: a dark box (upper part) and the banner quad on both faces (scallops hang below) ──
  const boxH = K.bannerH * 0.72;
  const bannerTop = K.bannerY + K.bannerH / 2;
  col.box(K.bannerW, boxH, 0.16, at(0, bannerTop - boxH / 2, -0.12), 'night');
  col.quad(K.bannerW, K.bannerH, at(0, K.bannerY, -0.035), bannerUv());
  col.quad(K.bannerW, K.bannerH, at(0, K.bannerY, -0.205, Math.PI), bannerUv());
  // ── the magic-glasses mark on top (both faces) on a short stem ──
  col.box(0.14, K.markY - bannerTop, 0.14, at(0, (K.markY + bannerTop) / 2 - K.mark / 4, -0.12), 'gold');
  col.quad(K.mark, K.mark, at(0, K.markY, -0.04), cellUv(KIT_CELL.mark));
  col.quad(K.mark, K.mark, at(0, K.markY, -0.2, Math.PI), cellUv(KIT_CELL.mark));
  // ── a mast above the mark, and bunting: a string from the mast top to each finial, flags on it
  // (beside the mark, never over it). Everything stays inside the marquee's width. ──
  col.box(0.1, K.mastTop - K.markY, 0.1, at(0, (K.mastTop + K.markY) / 2, -0.12), 'gold');
  const ball = new THREE.SphereGeometry(0.17, 8, 6);
  flat(ball, 'gold');
  col.add(ball, at(0, K.mastTop + 0.1, -0.12));
  for (const sx of [-1, 1]) {
    const top = new THREE.Vector3(0, K.mastTop, -0.12);
    const end = new THREE.Vector3(sx * K.poleX, K.poleTop + 0.05, 0);
    const d = end.clone().sub(top);
    const len = d.length();
    const yaw = Math.atan2(d.x, d.z);
    const pitch = -Math.asin(d.y / len);
    const mid = top.clone().add(end).multiplyScalar(0.5);
    col.box(0.03, 0.03, len, at(mid.x, mid.y, mid.z, yaw, pitch), 'ink');
    const along = d.clone().normalize();
    const flags = 4;
    for (let k = 0; k < flags; k++) {
      const t = 0.52 + (k / (flags - 1)) * 0.43;
      const p = top.clone().addScaledVector(d, t);
      const fw = 0.3;
      const fh = 0.4;
      const p0 = p.clone().addScaledVector(along, -fw / 2);
      const p1 = p.clone().addScaledVector(along, fw / 2);
      const p2 = p.clone().add(new THREE.Vector3(0, -fh, 0));
      const flag = new THREE.BufferGeometry();
      const pos = [p0, p1, p2, p1, p0, p2].flatMap((v) => [v.x, v.y, v.z]);
      flag.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      flag.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
      flag.computeVertexNormals();
      flat(flag, (['berry', 'sun', 'navy', 'white'] as const)[(k + (sx > 0 ? 1 : 0)) % 4]);
      col.add(flag, B);
    }
  }
  // Colliders: the counter and the board between the poles.
  {
    const c = toFrame(0, K.counterZ);
    colliders.push({ center: new THREE.Vector3(c.x, baseY + K.boardY / 2 + 0.6, c.z), half: new THREE.Vector3(K.poleX, K.boardY / 2 + 1.1, 0.28), yaw: mq.yaw });
  }

  // ── the start pad: dark rim, face, a glowing ring round it, the device pictogram above ──
  const pr = spec.pad.r ?? PAD_R;
  const padY = ground(spec.pad.x, spec.pad.z);
  {
    const rim = new THREE.CylinderGeometry(pr + 0.1, pr + 0.16, 0.34, 24, 1, true);
    flat(rim, 'ink');
    col.add(rim, M(spec.pad.x, padY - 0.1, spec.pad.z));
    const glow = new THREE.RingGeometry(pr + 0.02, pr + 0.24, 32, 1);
    flat(glow, 'sun');
    glow.rotateX(-Math.PI / 2);
    glow.translate(spec.pad.x, padY + 0.075, spec.pad.z);
    col.pieces.push({ geo: glow, name: 'padGlow', w: 0, h: 0 });
    glow.userData.unit = glow.getAttribute('uv').clone();
    const face = new THREE.CircleGeometry(pr, 32);
    const unit = face.getAttribute('uv').clone();
    remap(face, cellUv(spec.pad.walkIn ? KIT_CELL.padWalk : KIT_CELL.padPress, 4));
    face.rotateX(-Math.PI / 2);
    // Texture top (v = 1) points to −Z: towards the play.
    face.translate(spec.pad.x, padY + 0.07, spec.pad.z);
    face.userData.unit = unit;
    col.pieces.push({ geo: face, name: 'padFace', w: pr * 2, h: pr * 2 });
    col.quad(0.78, 0.78, M(spec.pad.x, padY + DEVICE_Y, spec.pad.z), deviceUv('keyboard'), 'device');
  }
  // ── the prompt (billboard; starts hidden) ──
  const promptAt = new THREE.Vector3(spec.prompt?.x ?? spec.pad.x, spec.prompt ? spec.prompt.y : padY + PROMPT_Y, spec.prompt?.z ?? spec.pad.z);
  col.quad(1.0, 1.0, M(promptAt.x, promptAt.y, promptAt.z), cellUv(KIT_CELL.burst), 'prompt');
  // ── ground decals ──
  for (const d of spec.decals ?? []) {
    const rect = d.kind === 'chevron' ? cellUv(KIT_CELL.chevron, 6) : footprintsUv();
    col.quad(d.size, d.size, M(d.x, ground(d.x, d.z) + 0.05, d.z, d.yaw, -Math.PI / 2), rect);
  }

  // ── merge ──
  const slots = new Map<string, Slot>();
  const geos: THREE.BufferGeometry[] = [];
  let at0 = 0;
  for (const p of col.pieces) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    if (g !== p.geo) {
      // toNonIndexed() keeps attributes; carry the unit UVs through the same expansion.
      const unit = p.geo.userData.unit as THREE.BufferAttribute | undefined;
      if (unit) {
        const idx = p.geo.index as THREE.BufferAttribute;
        const out = new Float32Array(idx.count * 2);
        for (let i = 0; i < idx.count; i++) {
          out[i * 2] = unit.getX(idx.getX(i));
          out[i * 2 + 1] = unit.getY(idx.getX(i));
        }
        g.userData.unit = new THREE.BufferAttribute(out, 2);
      }
      p.geo.dispose();
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (p.name) {
      const u = g.userData.unit as THREE.BufferAttribute;
      slots.set(p.name, { start: at0, count, unit: Float32Array.from(u.array as Float32Array), w: p.w ?? 0, h: p.h ?? 0 });
    }
    geos.push(g);
    at0 += count;
  }
  const geometry = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!geometry) throw new Error('booth: geometry merge failed');
  for (const name of ['position', 'normal', 'uv', 'color']) (geometry.getAttribute(name) as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius += 1.0; // bobbing prompt, billboards

  const marqueeBox = new THREE.Box3();
  for (const [x, y, z] of [[-K.poleX - K.finialR, 0, 0.1], [K.poleX + K.finialR, K.mastTop + 0.3, 0.1], [-K.poleX, 0, -0.5], [K.poleX, K.mastTop, -0.5]]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(B);
    marqueeBox.expandByPoint(p);
  }
  const countdownAt = spec.countdown ? new THREE.Vector3(spec.countdown.x, spec.countdown.y, spec.countdown.z) : new THREE.Vector3(0, K.boardY, 0.6).applyMatrix4(B);
  return {
    geometry,
    slots,
    triangles: geometry.getAttribute('position').count / 3,
    marqueeBox,
    colliders,
    padCenter: new THREE.Vector3(spec.pad.x, padY, spec.pad.z),
    promptAt,
    countdownAt,
    bannerAt: new THREE.Vector3(0, K.bannerY, 0.4).applyMatrix4(B),
    boardFront: new THREE.Vector3(0, K.boardY + 0.05, 0.45).applyMatrix4(B),
    topAt: new THREE.Vector3(0, K.markY + 0.2, 0.5).applyMatrix4(B),
  };
}

function pt(p: { x: number; z: number }, y: number): [number, number, number] {
  return [p.x, y, p.z];
}

/** Rewrite the UVs of a slot to `rect` (unit UVs → rect). */
export function setSlotUv(uv: THREE.BufferAttribute, s: Slot, rect: UvRect): void {
  const a = uv.array as Float32Array;
  for (let i = 0; i < s.count; i++) {
    a[(s.start + i) * 2] = rect[0] + s.unit[i * 2] * rect[2];
    a[(s.start + i) * 2 + 1] = rect[1] + s.unit[i * 2 + 1] * rect[3];
  }
  uv.addUpdateRange(s.start * 2, s.count * 2);
  uv.needsUpdate = true;
}

/** Set a slot's vertex colour (a brightness multiplier: 1 = as drawn, > 1 glows). */
export function setSlotColor(color: THREE.BufferAttribute, s: Slot, r: number, g = r, b = r): void {
  const a = color.array as Float32Array;
  for (let i = s.start; i < s.start + s.count; i++) {
    a[i * 3] = r;
    a[i * 3 + 1] = g;
    a[i * 3 + 2] = b;
  }
  color.addUpdateRange(s.start * 3, s.count * 3);
  color.needsUpdate = true;
}

/**
 * Place a quad slot as a billboard: centre `c`, axes `right` and `up` (frame-local, unit length),
 * size × `scale`. Scale 0 collapses it (hidden, no extra draw).
 */
export function placeQuad(pos: THREE.BufferAttribute, nor: THREE.BufferAttribute, s: Slot, c: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, scale: number): void {
  const a = pos.array as Float32Array;
  const n = nor.array as Float32Array;
  const nx = right.y * up.z - right.z * up.y;
  const ny = right.z * up.x - right.x * up.z;
  const nz = right.x * up.y - right.y * up.x;
  for (let i = 0; i < s.count; i++) {
    const du = (s.unit[i * 2] - 0.5) * s.w * scale;
    const dv = (s.unit[i * 2 + 1] - 0.5) * s.h * scale;
    const k = (s.start + i) * 3;
    a[k] = c.x + right.x * du + up.x * dv;
    a[k + 1] = c.y + right.y * du + up.y * dv;
    a[k + 2] = c.z + right.z * du + up.z * dv;
    n[k] = nx;
    n[k + 1] = ny;
    n[k + 2] = nz;
  }
  pos.addUpdateRange(s.start * 3, s.count * 3);
  nor.addUpdateRange(s.start * 3, s.count * 3);
  pos.needsUpdate = true;
  nor.needsUpdate = true;
}
