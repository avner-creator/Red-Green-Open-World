/**
 * Small modelling kit for the goofy wardrobe items: baked vertex colours (shapes read by brightness
 * alone, never hue), one merged mesh per part, and a springy "wobble" for tall or floppy bits.
 * Authored in metres at the attach anchor: +Y up, +Z forward (see ../models.ts).
 * Budget per worn item: ≤ ~1.5k triangles, ≤ 2 draw calls (a static body + one moving part).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { merge, paint, placed } from '../../chests/bake';
import { disposer, lit, mesh, std } from '../../chests/wearables';
import type { Wearable } from '../../chests/wearables';

export type { Wearable };
export { merge, paint };

export type Geo = THREE.BufferGeometry;

/** A part painted in one colour with baked light (`ambient` floor, `k` brightness). */
export const P = (geo: Geo, color: number, ambient = 0.6, k = 1): Geo => paint(geo, lit(color, ambient, k));
/** Rotate (XYZ, radians) then move a geometry. */
export const at = (geo: Geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): Geo => placed(geo, x, y, z, rx, ry, rz);
export const box = (w: number, h: number, d: number, r = 0.02): Geo => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
export const ball = (r: number, ws = 12, hs = 8): Geo => new THREE.SphereGeometry(r, ws, hs);
export const cyl = (rt: number, rb: number, h: number, seg = 14, open = false): Geo => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const cone = (r: number, h: number, seg = 14): Geo => new THREE.ConeGeometry(r, h, seg, 1);
export const torus = (r: number, tube: number, rs = 6, ts = 20, arc = Math.PI * 2): Geo => new THREE.TorusGeometry(r, tube, rs, ts, arc);
/** Lathe from [radius, y] pairs. */
export const lathe = (pts: readonly (readonly [number, number])[], seg = 24): Geo => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
/** A tube through points (smooth curve). */
export const tube = (pts: readonly (readonly [number, number, number])[], r: number, seg = 12, rs = 6): Geo =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))), seg, r, rs, false);
/** Flat shape (XY) extruded along +Z by `depth`, centred on z = 0. */
export const slab = (pts: readonly (readonly [number, number])[], depth: number, bevel = 0.008): Geo => {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 6 });
  return g.translate(0, 0, -depth / 2);
};
/** Painter: colour by a function of position, with the same baked light as `P`. */
export const paintBy = (geo: Geo, pick: (x: number, y: number, z: number) => number, ambient = 0.6, k = 1): Geo =>
  paint(geo, (x, y, z, nx, ny, nz) => lit(pick(x, y, z), ambient, k)(x, y, z, nx, ny, nz));
/** Eye: white ball, dark pupil looking forward (+Z), white glint. */
export function eye(x: number, y: number, z: number, r: number, dir: THREE.Vector3Tuple = [0, 0, 1]): Geo[] {
  const d = new THREE.Vector3(...dir).normalize();
  return [
    P(at(ball(r, 10, 6), x, y, z), 0xffffff, 0.8, 1.05),
    P(at(ball(r * 0.55, 8, 5), x + d.x * r * 0.62, y + d.y * r * 0.62, z + d.z * r * 0.62), 0x0d0f18, 1, 0.8),
    P(at(ball(r * 0.17, 6, 4), x + d.x * r * 0.95 - r * 0.15, y + d.y * r * 0.95 + r * 0.2, z + d.z * r * 0.95), 0xffffff, 1, 1.1),
  ];
}

/**
 * Damped spring driven by changes in the wearer's speed (start, stop, landing pops) plus a small
 * idle sway. `angle()` is in radians; use it for a pivot's rotation.
 */
export class Wobble {
  private a = 0;
  private v = 0;
  private prev = 0;
  private t: number;
  constructor(
    private readonly stiff = 70,
    private readonly damp = 4.5,
    private readonly gain = 0.06,
    private readonly idle = 0.05,
    private readonly freq = 2.4,
    phase = 0,
  ) {
    this.t = phase;
  }
  /** Give it a shove (radians per second). */
  kick(v: number): void {
    this.v += v;
  }
  step(dt: number, speed: number): number {
    const d = Math.min(0.05, Math.max(1e-3, dt));
    const acc = THREE.MathUtils.clamp((speed - this.prev) / d, -60, 60);
    this.prev = speed;
    this.t += d;
    this.v += (-this.stiff * this.a - this.damp * this.v - acc * this.gain) * d;
    this.a = THREE.MathUtils.clamp(this.a + this.v * d, -0.7, 0.7);
    return this.a + Math.sin(this.t * this.freq) * this.idle * (0.5 + Math.min(1, speed / 6));
  }
  get time(): number {
    return this.t;
  }
}

/** Wrap `inner` in an outer group scaled by `k` (the pop-in scales the outer group). */
export function scaled(inner: THREE.Object3D, k: number): THREE.Group {
  const outer = new THREE.Group();
  inner.scale.multiplyScalar(k);
  inner.position.multiplyScalar(k);
  outer.add(inner);
  return outer;
}

export interface GoofyParts {
  /** The static body (one draw). */
  body?: Geo[];
  /** A moving part (one draw), placed under a pivot at `pivot`. */
  moving?: Geo[];
  pivot?: THREE.Vector3Tuple;
  /** Transparent part instead of a moving one (fishbowl glass). */
  glass?: { parts: Geo[]; opacity: number };
  /** Per-frame motion of the pivot (rotation/scale) from the wobble spring. */
  animate?: (pivot: THREE.Object3D, w: Wobble, dt: number, speed: number) => void;
  /** Position/tilt of the whole item on the anchor. */
  offset?: THREE.Vector3Tuple;
  tilt?: THREE.Vector3Tuple;
  /** Uniform size on the anchor. */
  size?: number;
  wobble?: Wobble;
  material?: THREE.MeshStandardMaterialParameters;
}

/** Assemble a wearable from parts: ≤ 2 draw calls. */
export function goofy(spec: GoofyParts): Wearable {
  const geos: Geo[] = [];
  const mats: THREE.Material[] = [];
  const mat = std({ side: THREE.DoubleSide, roughness: 0.6, ...spec.material });
  mats.push(mat);
  const g = new THREE.Group();
  if (spec.body?.length) {
    const geo = merge(spec.body);
    geos.push(geo);
    g.add(mesh(geo, mat));
  }
  const pivot = new THREE.Group();
  pivot.position.set(...(spec.pivot ?? [0, 0, 0]));
  g.add(pivot);
  if (spec.moving?.length) {
    const p = spec.pivot ?? [0, 0, 0];
    const geo = merge(spec.moving).translate(-p[0], -p[1], -p[2]);
    geos.push(geo);
    pivot.add(mesh(geo, mat));
  }
  if (spec.glass) {
    const geo = merge(spec.glass.parts);
    geos.push(geo);
    const gm = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, opacity: spec.glass.opacity, roughness: 0.08, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide,
    });
    mats.push(gm);
    const m = mesh(geo, gm, false);
    m.renderOrder = 2;
    g.add(m);
  }
  g.position.set(...(spec.offset ?? [0, 0, 0]));
  g.rotation.set(...(spec.tilt ?? [0, 0, 0]));
  const w = spec.wobble ?? new Wobble();
  const anim = spec.animate;
  return {
    object: scaled(g, spec.size ?? 1),
    update: anim ? (dt, speed) => anim(pivot, w, dt, speed) : undefined,
    dispose: disposer(geos, mats),
  };
}

/** Standard sway: the pivot rocks forward/back and a little sideways. */
export const sway = (k = 1, side = 0.45) => (pivot: THREE.Object3D, w: Wobble, dt: number, speed: number): void => {
  const a = w.step(dt, speed) * k;
  pivot.rotation.x = a;
  pivot.rotation.z = Math.sin(w.time * 1.7) * 0.04 * k + a * side * 0.3;
};

/** Triangle count of a wearable (tests / budget). */
export function triangles(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return Math.round(n);
}

/** Draw calls of a wearable (meshes). */
export function drawCalls(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) n++;
  });
  return n;
}
