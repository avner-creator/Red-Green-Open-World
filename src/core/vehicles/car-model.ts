/**
 * The buggy, modelled procedurally: bevelled extruded body panels with clearcoat paint and hood
 * stripes, a filleted tube roll cage, bucket seat, chunky lathe tyres with tread blocks and
 * spoked rims, cycle fenders that steer with the wheels, visible A-arms and coil-overs that follow
 * the suspension, rear engine with chrome exhausts, headlights and a light bar.
 *
 * Render cost (see scripts/perf-report.mjs): everything static is merged into two meshes (the
 * clearcoat paint, and one "parts" mesh whose colour / roughness / metalness / glow ride on vertex
 * attributes, `vertex-finish.ts`), the four wheels and the four fenders are one instanced mesh each, plus instanced
 * A-arms and coil-overs: 6 draws. None of them casts a shadow; a low-poly shadow proxy does
 * (`shadow-proxy.ts`). A lighter geometry set is swapped in at a distance (`setDetail`).
 *
 * Reads in R-only and G-only: light warm paint and bright rims vs near-black tyres/trim/cage.
 * Frame: chassis space (see car-sim): +Z forward, +Y up, +X left; origin = chassis centre.
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { asShadowProxy } from '../shadow-proxy';
import { finish, finishMaterial, plainGeometry, type Finish } from '../vertex-finish';
import { CAR, STATIC_LENGTH } from './car-sim';

export const DEFAULT_PAINT = 0xffbd2e;

export interface CarModel {
  /** Follows the physics body. */
  readonly root: THREE.Group;
  /** Body that leans/bounces (child of root). */
  readonly body: THREE.Group;
  /** Driver seat: the player's feet go here (child of body; +Z forward). */
  readonly seat: THREE.Object3D;
  /** Soft contact shadow (lives in the scene, placed by the caller on the ground). */
  readonly blob: THREE.Mesh;
  setColor(color: THREE.ColorRepresentation): void;
  /** Wheel lengths/spin/steer from the sim; body pitch/roll (rad) and heave (m). */
  update(wheels: readonly { length: number; spin: number; steer: number }[], pitch: number, roll: number, heave: number): void;
  setLights(on: boolean): void;
  /** Full geometry (true) or the lighter far set (false). */
  setDetail(high: boolean): void;
  dispose(): void;
}

// ───────────────────────────── finishes (per-vertex material) ─────────────────────────────

const TRIM: Finish = { color: 0x24272d, rough: 0.62, metal: 0.15 };
const CAGE: Finish = { color: 0x2c3036, rough: 0.3, metal: 0.8 };
const CHROME: Finish = { color: 0xe9ebef, rough: 0.16, metal: 1 };
const RUBBER: Finish = { color: 0x1a1b1d, rough: 0.9, metal: 0 };
const RIM: Finish = { color: 0xd8dce2, rough: 0.26, metal: 1 };
const LAMP: Finish = { color: 0xffffff, rough: 0.2, metal: 0, emissive: 0xfff0cf, glow: 2.2, switched: true };
const TAIL: Finish = { color: 0x5a0d08, rough: 0.3, metal: 0, emissive: 0xff2a14, glow: 1.2 };
const SPRING: Finish = { color: 0xff6a2a, rough: 0.35, metal: 0.5 };
const ARM: Finish = { color: 0x33373e, rough: 0.4, metal: 0.7 };
const LAMP_ON = 1;
const LAMP_OFF = 0.15 / 2.2;

// ───────────────────────────── geometry helpers ─────────────────────────────

const norm = (g: THREE.BufferGeometry): THREE.BufferGeometry => plainGeometry(g);

function merge(parts: THREE.BufferGeometry[], plain = false): THREE.BufferGeometry {
  const m = mergeGeometries(plain ? parts.map(norm) : parts, false);
  for (const p of parts) p.dispose();
  if (!m) throw new Error('car: merge failed');
  return m;
}

/** Level of detail for the builders: hi = close up, lo = far away. */
interface Lod {
  hi: boolean;
  /** Pick a segment count (or any number) for the level. */
  n(hi: number, lo: number): number;
}
const HI: Lod = { hi: true, n: (h) => h };
const LO: Lod = { hi: false, n: (_h, l) => l };

/** A side profile drawn in (z, y), extruded across x from x0 to x1, with rounded (bevelled) edges. */
function extrudeProfile(
  pts: (THREE.Vector2 | [number, number, number, number])[],
  x0: number,
  x1: number,
  bevel: number,
  curveSegments: number,
  bevelSegments: number,
): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const first = pts[0] as THREE.Vector2;
  s.moveTo(first.x, first.y);
  for (const p of pts.slice(1)) {
    if (p instanceof THREE.Vector2) s.lineTo(p.x, p.y);
    else s.quadraticCurveTo(p[0], p[1], p[2], p[3]);
  }
  const b = bevelSegments > 0 ? bevel : 0;
  const depth = Math.max(0.001, x1 - x0 - 2 * b);
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: bevelSegments > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: Math.max(1, bevelSegments),
    curveSegments,
  });
  // Shape x → car z, extrusion (+Z) → car x.
  g.rotateY(-Math.PI / 2);
  g.translate(x1 - b, 0, 0);
  return g;
}

const v2 = (z: number, y: number): THREE.Vector2 => new THREE.Vector2(z, y);
const q = (cz: number, cy: number, z: number, y: number): [number, number, number, number] => [cz, cy, z, y];

/** Tube through `pts` with rounded (filleted) corners of radius `r`. */
function filletTube(pts: THREE.Vector3[], r: number, radius: number, step: number, radial: number): THREE.BufferGeometry {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const n = pts.length;
  const corner = (i: number): { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3 } => {
    const p = pts[i];
    const da = pts[i - 1].clone().sub(p);
    const db = pts[i + 1].clone().sub(p);
    const ra = Math.min(r, da.length() * 0.45);
    const rb = Math.min(r, db.length() * 0.45);
    return { a: p.clone().add(da.normalize().multiplyScalar(ra)), b: p, c: p.clone().add(db.normalize().multiplyScalar(rb)) };
  };
  let cursor = pts[0].clone();
  for (let i = 1; i < n - 1; i++) {
    const c = corner(i);
    path.add(new THREE.LineCurve3(cursor, c.a));
    path.add(new THREE.QuadraticBezierCurve3(c.a, c.b, c.c));
    cursor = c.c;
  }
  path.add(new THREE.LineCurve3(cursor, pts[n - 1].clone()));
  const segs = Math.max(4, Math.round(path.getLength() / step));
  return new THREE.TubeGeometry(path, segs, radius, radial, false);
}

function straightTube(a: THREE.Vector3, b: THREE.Vector3, radius: number, radial: number): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, radius, radial, false);
}

function roundedBox(w: number, h: number, d: number, r: number, curveSegments = 3, bevelSegments = 2): THREE.BufferGeometry {
  // Extruded rounded rectangle (w×h), depth d along z, centred.
  const s = new THREE.Shape();
  const x = -w / 2 + r;
  const y = -h / 2 + r;
  const iw = w - 2 * r;
  const ih = h - 2 * r;
  s.moveTo(x, y - r);
  s.lineTo(x + iw, y - r);
  s.quadraticCurveTo(x + iw + r, y - r, x + iw + r, y);
  s.lineTo(x + iw + r, y + ih);
  s.quadraticCurveTo(x + iw + r, y + ih + r, x + iw, y + ih + r);
  s.lineTo(x, y + ih + r);
  s.quadraticCurveTo(x - r, y + ih + r, x - r, y + ih);
  s.lineTo(x - r, y);
  s.quadraticCurveTo(x - r, y - r, x, y - r);
  const bevel = Math.min(r * 0.6, d * 0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments, curveSegments });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  return g;
}

/** Box with chamfered edges and corners (44 flat-shaded triangles): crisp highlights, cheap. */
function chamferBox(w: number, h: number, d: number, c: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pts.push(
          new THREE.Vector3(sx * hx, sy * (hy - c), sz * (hz - c)),
          new THREE.Vector3(sx * (hx - c), sy * hy, sz * (hz - c)),
          new THREE.Vector3(sx * (hx - c), sy * (hy - c), sz * hz),
        );
      }
    }
  }
  return new ConvexGeometry(pts);
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry => {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z);
  return g.applyMatrix4(m);
};

// ───────────────────────────── materials ─────────────────────────────

function paintMaterial(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: DEFAULT_PAINT,
    metalness: 0.25,
    roughness: 0.34,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    sheen: 0,
  });
  // Twin dark racing stripes on the top surfaces (object space, so they ride with the body).
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCarLocal;\nvarying vec3 vCarNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarLocal = position;\nvCarNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCarLocal;\nvarying vec3 vCarNormal;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float d = abs(abs(vCarLocal.x) - 0.2);
          float w = fwidth(vCarLocal.x) * 1.2 + 0.002;
          float stripe = 1.0 - smoothstep(0.075 - w, 0.075 + w, d);
          float pin = 1.0 - smoothstep(0.012 - w, 0.012 + w, abs(d - 0.1));
          float top = smoothstep(0.35, 0.6, vCarNormal.y) * step(abs(vCarLocal.x), 0.48) * (1.0 - step(-0.8, vCarLocal.z) * step(vCarLocal.z, 0.45));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.037, 0.042), stripe * top);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.9, 0.86), pin * top);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'rg-car-paint';
  return m;
}

// ───────────────────────────── parts ─────────────────────────────

const TUB: (THREE.Vector2 | [number, number, number, number])[] = [
  v2(-1.32, -0.36), v2(1.38, -0.36), q(1.74, -0.36, 1.84, -0.06), q(1.9, 0.1, 1.74, 0.17),
  v2(0.8, 0.3), q(0.6, 0.31, 0.58, 0.5), v2(0.46, 0.5), v2(0.42, 0.02), v2(-0.76, 0.02),
  v2(-0.8, 0.42), v2(-1.36, 0.42), q(-1.58, 0.42, -1.58, 0.12), q(-1.58, -0.36, -1.32, -0.36),
];
const SILL: (THREE.Vector2 | [number, number, number, number])[] = [
  v2(-1.24, -0.3), v2(1.26, -0.3), q(1.5, -0.3, 1.5, 0.02), q(1.5, 0.2, 1.3, 0.24),
  v2(0.7, 0.4), q(0.48, 0.42, 0.36, 0.33), q(-0.15, 0.24, -0.66, 0.34), v2(-0.84, 0.47),
  v2(-1.28, 0.47), q(-1.44, 0.47, -1.44, 0.15), q(-1.44, -0.3, -1.24, -0.3),
];

function bodyGeometry(l: Lod): THREE.BufferGeometry {
  // Centre tub (cockpit floor at y = 0.02) and the side panels (door sills) with a sculpted dip.
  const cs = l.n(12, 5);
  const bs = l.n(3, 1);
  const parts = [extrudeProfile(TUB, -0.52, 0.52, 0.06, cs, bs)];
  for (const s of [1, -1]) {
    const x0 = s > 0 ? 0.46 : -0.66;
    parts.push(extrudeProfile(SILL, x0, x0 + 0.2, 0.05, cs, bs));
  }
  return merge(parts, true);
}

function fenderGeometry(l: Lod): THREE.BufferGeometry {
  // A cycle fender arc over the wheel (rides on the steering knuckle, so it never clips).
  const r0 = CAR.wheelRadius + 0.07;
  const r1 = r0 + 0.07;
  const a0 = Math.PI * 0.14;
  const a1 = Math.PI * 0.86;
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, a0, a1, false);
  s.absarc(0, 0, r0, a1, a0, true);
  const w = CAR.wheelWidth + 0.1;
  const g = new THREE.ExtrudeGeometry(s, { depth: w - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: l.n(2, 1), curveSegments: l.n(12, 6) });
  g.translate(0, 0, -(w - 0.06) / 2);
  g.rotateY(Math.PI / 2); // arc in the z-y plane, width along x
  return norm(g);
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const CAGE_TOP = 1.56;

/** Roll cage + bumpers as tubes; `step`/`radial` set the resolution (also used by the proxy). */
function cageTubes(R: number, step: number, radial: number, caps: boolean): THREE.BufferGeometry[] {
  const top = CAGE_TOP;
  const parts: THREE.BufferGeometry[] = [];
  const ft = (pts: THREE.Vector3[], r: number, radius: number): void => void parts.push(filletTube(pts, r, radius, step, radial));
  // Main hoop behind the seats.
  ft([V(0.6, 0.42, -0.74), V(0.56, 1.3, -0.74), V(0.38, top, -0.74), V(-0.38, top, -0.74), V(-0.56, 1.3, -0.74), V(-0.6, 0.42, -0.74)], 0.16, R);
  // Front hoop: A-pillars from the cowl up to the roof.
  ft([V(0.6, 0.5, 0.5), V(0.42, top - 0.04, -0.02), V(-0.42, top - 0.04, -0.02), V(-0.6, 0.5, 0.5)], 0.14, R);
  // Roof rails.
  for (const s of [1, -1]) parts.push(straightTube(V(s * 0.42, top - 0.04, -0.02), V(s * 0.4, top, -0.74), R, radial));
  // Rear braces down to the deck corners.
  for (const s of [1, -1]) ft([V(s * 0.48, top - 0.08, -0.74), V(s * 0.46, 0.92, -1.12), V(s * 0.46, 0.46, -1.36)], 0.12, R * 0.85);
  // Diagonal in the main hoop and harness bar.
  parts.push(straightTube(V(0.56, 0.6, -0.76), V(-0.4, top - 0.06, -0.76), R * 0.85, radial));
  parts.push(straightTube(V(0.56, 0.95, -0.76), V(-0.56, 0.95, -0.76), R * 0.75, radial));
  // Side intrusion bars.
  for (const s of [1, -1]) ft([V(s * 0.62, 0.52, 0.48), V(s * 0.66, 0.62, -0.1), V(s * 0.62, 0.55, -0.72)], 0.3, R * 0.8);
  // Joint caps.
  if (caps) {
    for (const p of [V(0.6, 0.42, -0.74), V(-0.6, 0.42, -0.74), V(0.6, 0.5, 0.5), V(-0.6, 0.5, 0.5), V(0.46, 0.46, -1.36), V(-0.46, 0.46, -1.36)]) {
      parts.push(at(new THREE.SphereGeometry(R * 1.6, 8, 6), p.x, p.y, p.z));
    }
  }
  // Front and rear tube bumpers + nerf bars.
  ft([V(0.62, -0.08, 1.62), V(0.5, -0.12, 1.98), V(-0.5, -0.12, 1.98), V(-0.62, -0.08, 1.62)], 0.16, 0.05);
  ft([V(0.28, -0.2, 1.75), V(0.28, 0.12, 1.96), V(-0.28, 0.12, 1.96), V(-0.28, -0.2, 1.75)], 0.1, 0.035);
  ft([V(0.6, -0.1, -1.4), V(0.5, -0.16, -1.72), V(-0.5, -0.16, -1.72), V(-0.6, -0.1, -1.4)], 0.16, 0.05);
  for (const s of [1, -1]) ft([V(s * 0.64, -0.22, 0.72), V(s * 0.8, -0.24, 0.5), V(s * 0.8, -0.24, -0.45), V(s * 0.64, -0.22, -0.66)], 0.14, 0.045);
  return parts;
}

function cageGeometry(l: Lod): THREE.BufferGeometry[] {
  return cageTubes(0.042, l.hi ? 0.075 : 0.2, l.n(8, 5), l.hi).map((g) => finish(g, CAGE));
}

function trimGeometry(l: Lod): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const cs = l.n(3, 1);
  const bs = l.n(2, 1);
  // One wide central bucket seat (the robot is broad-shouldered).
  const seat = extrudeProfile(
    [v2(0.18, 0.04), v2(0.2, 0.2), q(0.2, 0.26, 0.12, 0.27), v2(-0.36, 0.25), v2(-0.42, 0.88), q(-0.44, 0.96, -0.52, 0.94), v2(-0.6, 0.86), v2(-0.56, 0.08), q(-0.55, 0.04, -0.48, 0.04)],
    -0.3, 0.3, 0.06, l.n(6, 3), bs,
  );
  seat.translate(0, 0, -0.12);
  parts.push(seat);
  // Bolsters.
  for (const b of [-1, 1]) parts.push(at(new THREE.CapsuleGeometry(0.05, 0.5, l.n(3, 1), l.n(8, 5)), b * 0.3, 0.55, -0.62, 0.18));
  // Dashboard + steering column + wheel.
  parts.push(at(roundedBox(1.0, 0.16, 0.2, 0.05, cs, bs), 0, 0.46, 0.36));
  parts.push(straightTube(new THREE.Vector3(0, 0.46, 0.4), new THREE.Vector3(0, 0.62, 0.24), 0.025, l.n(6, 4)));
  parts.push(at(new THREE.TorusGeometry(0.16, 0.024, l.n(6, 4), l.n(20, 10)), 0, 0.64, 0.22, -0.95));
  parts.push(at(new THREE.CylinderGeometry(0.045, 0.045, 0.05, l.n(10, 6)), 0, 0.64, 0.22, -0.95 + Math.PI / 2));
  for (const a of [0, 2.1, 4.2]) {
    const sp = new THREE.BoxGeometry(0.15, 0.022, 0.012).translate(0.08, 0, 0).rotateZ(a + Math.PI / 2);
    parts.push(at(sp, 0, 0.64, 0.22, -0.95));
  }
  // Floor mat, belly pan, grille, light bar housing.
  parts.push(at(new THREE.BoxGeometry(0.98, 0.03, 1.1), 0, 0.06, -0.18));
  parts.push(at(roundedBox(1.1, 0.06, 2.9, 0.03, cs, 1), 0, -0.4, 0.14));
  parts.push(at(roundedBox(0.7, 0.14, 0.06, 0.04, cs, bs), 0, -0.06, 1.88, -0.25));
  parts.push(at(roundedBox(0.96, 0.1, 0.12, 0.04, cs, bs), 0, 1.6, 0.0));
  // Rear deck engine bay floor (dark) and tail panel.
  parts.push(at(roundedBox(0.92, 0.04, 0.5, 0.02, cs, 1), 0, 0.46, -1.08));
  parts.push(at(roundedBox(0.86, 0.22, 0.05, 0.04, cs, bs), 0, 0.17, -1.61, 0.12));
  // Side vents.
  if (l.hi) {
    for (const s of [1, -1]) {
      for (let i = 0; i < 3; i++) parts.push(at(chamferBox(0.03, 0.05, 0.34, 0.01), s * 0.665, 0.12 + i * 0.08, -1.0));
    }
  }
  return parts.map((g) => finish(g, TRIM));
}

function chromeGeometry(l: Lod): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const cs = l.n(3, 1);
  // Engine block with fins + air intake + exhausts.
  parts.push(at(roundedBox(0.56, 0.22, 0.42, 0.06, cs, l.n(2, 1)), 0, 0.58, -1.1));
  for (let i = 0; i < 5; i++) parts.push(at(chamferBox(0.6, 0.02, 0.36, 0.008), 0, 0.5 + i * 0.045, -1.1));
  parts.push(at(new THREE.CylinderGeometry(0.11, 0.13, 0.12, l.n(14, 8)), 0, 0.74, -1.1));
  parts.push(at(new THREE.TorusGeometry(0.11, 0.02, l.n(6, 4), l.n(16, 8)), 0, 0.8, -1.1, Math.PI / 2));
  for (const s of [1, -1]) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.26, 0.56, -1.2), new THREE.Vector3(s * 0.32, 0.5, -1.45), new THREE.Vector3(s * 0.34, 0.56, -1.7), new THREE.Vector3(s * 0.34, 0.66, -1.84),
    ]);
    parts.push(new THREE.TubeGeometry(path, l.n(12, 5), 0.045, l.n(8, 5), false));
    parts.push(at(new THREE.CylinderGeometry(0.06, 0.055, 0.12, l.n(12, 6), 1, true), s * 0.34, 0.68, -1.86, -1.1));
  }
  // Headlight pods (housing) on the hood.
  for (const s of [1, -1]) {
    parts.push(at(new THREE.CylinderGeometry(0.11, 0.09, 0.16, l.n(16, 8)), s * 0.42, 0.33, 1.42, Math.PI / 2));
    parts.push(at(new THREE.TorusGeometry(0.105, 0.016, l.n(6, 3), l.n(16, 8)), s * 0.42, 0.33, 1.5));
    parts.push(at(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 6), s * 0.42, 0.22, 1.4));
  }
  // Gear knob.
  if (l.hi) parts.push(at(new THREE.SphereGeometry(0.035, 8, 6), 0.36, 0.3, 0.1));
  return parts.map((g) => finish(g, CHROME));
}

function lampGeometry(l: Lod): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) parts.push(at(new THREE.SphereGeometry(0.095, l.n(14, 8), l.n(5, 3), 0, Math.PI * 2, 0, Math.PI / 2), s * 0.42, 0.33, 1.49, Math.PI / 2));
  // Light bar: four square lamps.
  for (const x of [-0.33, -0.11, 0.11, 0.33]) parts.push(at(chamferBox(0.16, 0.07, 0.03, 0.012), x, 1.6, 0.065));
  const out = parts.map((g) => finish(g, LAMP));
  for (const s of [1, -1]) out.push(finish(at(chamferBox(0.16, 0.08, 0.04, 0.014), s * 0.33, 0.2, -1.64, 0.12), TAIL));
  return out;
}

/** Tyre + rim, spinning together. Axle = X, rim face outboard (+X). */
function wheelGeometry(l: Lod): THREE.BufferGeometry {
  const r = CAR.wheelRadius;
  const hw = CAR.wheelWidth / 2;
  // Tyre: rounded lathe carcass + two staggered rows of tread blocks + a brake disc.
  const prof = [
    [0.255, -hw + 0.03], [0.3, -hw], [r - 0.06, -hw - 0.005], [r - 0.025, -hw + 0.03], [r - 0.012, -hw + 0.08],
    [r - 0.012, hw - 0.08], [r - 0.025, hw - 0.03], [r - 0.06, hw + 0.005], [0.3, hw], [0.255, hw - 0.03],
  ].map(([a, b]) => new THREE.Vector2(a, b));
  const tyre: THREE.BufferGeometry[] = [new THREE.LatheGeometry(prof, l.n(32, 16))];
  const n = l.hi ? 22 : 11;
  for (let i = 0; i < n; i++) {
    for (const row of [-1, 1]) {
      const a = ((i + (row > 0 ? 0.5 : 0)) / n) * Math.PI * 2;
      // x = radial, y = axial (lathe axis), z = along the circumference.
      const block = l.hi ? chamferBox(0.045, 0.1, 0.08, 0.014) : new THREE.BoxGeometry(0.045, 0.1, 0.13);
      block.translate(r - 0.008, row * 0.058, 0);
      block.rotateY(a);
      tyre.push(block);
    }
  }
  tyre.push(at(new THREE.CylinderGeometry(0.19, 0.19, 0.025, l.n(16, 8)), 0, -0.05, 0));
  // Rim: barrel, dished face with 6 spokes, hub and lug nuts.
  const rim: THREE.BufferGeometry[] = [];
  const barrel = [
    [0.255, -hw + 0.03], [0.265, -hw + 0.05], [0.25, -0.05], [0.25, hw - 0.06], [0.272, hw - 0.03], [0.262, hw - 0.015],
  ].map(([a, b]) => new THREE.Vector2(a, b));
  rim.push(new THREE.LatheGeometry(barrel, l.n(24, 12)));
  rim.push(at(new THREE.TorusGeometry(0.235, 0.022, l.n(6, 4), l.n(24, 12)), 0, hw - 0.05, 0, Math.PI / 2));
  for (let i = 0; i < 6; i++) {
    const sp = chamferBox(0.17, 0.04, 0.05, 0.014); // x = radial, y = axial, z = tangential
    sp.translate(0.13, hw - 0.07, 0);
    sp.rotateY((i / 6) * Math.PI * 2);
    rim.push(sp);
  }
  rim.push(at(new THREE.CylinderGeometry(0.075, 0.085, 0.08, l.n(12, 8)), 0, hw - 0.075, 0));
  if (l.hi) {
    rim.push(at(new THREE.SphereGeometry(0.05, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, hw - 0.035, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      rim.push(at(new THREE.CylinderGeometry(0.013, 0.013, 0.03, 6, 1), Math.cos(a) * 0.055, hw - 0.03, Math.sin(a) * 0.055));
    }
  }
  const g = merge([...tyre.map((p) => finish(p, RUBBER)), ...rim.map((p) => finish(p, RIM))]);
  g.rotateZ(-Math.PI / 2); // lathe axis Y → X (outer side = +X)
  return g;
}

function springGeometry(l: Lod): THREE.BufferGeometry {
  // Unit-length coil along +Y (scaled to the spring length each frame).
  const parts: THREE.BufferGeometry[] = [];
  if (l.hi) {
    const pts: THREE.Vector3[] = [];
    const turns = 6;
    const per = 10;
    for (let i = 0; i <= turns * per; i++) {
      const t = i / (turns * per);
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.06, 0.08 + t * 0.84, Math.sin(a) * 0.06));
    }
    parts.push(finish(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * per, 0.013, 5, false), SPRING));
  } else {
    parts.push(finish(new THREE.CylinderGeometry(0.068, 0.068, 0.84, 8, 1, true).translate(0, 0.5, 0), SPRING));
  }
  parts.push(finish(new THREE.CylinderGeometry(0.022, 0.022, 1, l.n(8, 5), 1, true).translate(0, 0.5, 0), SPRING));
  for (const y of [0.07, 0.93]) parts.push(finish(at(new THREE.CylinderGeometry(0.075, 0.075, 0.025, l.n(12, 8)), 0, y, 0), SPRING));
  return merge(parts);
}

// ───────────────────────────── shadow proxy ─────────────────────────────

/** Low-poly silhouette of the body, cage, seat and engine (body space), kept just inside the real
 * surfaces so a lit surface never shadows itself. */
function bodyProxyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [extrudeProfile(TUB, -0.52, 0.52, 0, 2, 0)];
  for (const s of [1, -1]) {
    const x0 = s > 0 ? 0.46 : -0.66;
    parts.push(extrudeProfile(SILL, x0, x0 + 0.2, 0, 2, 0));
  }
  parts.push(...cageTubes(0.034, 0.3, 4, false));
  parts.push(new THREE.BoxGeometry(0.5, 0.8, 0.08).translate(0, 0.5, -0.66));
  parts.push(new THREE.BoxGeometry(0.5, 0.18, 0.36).translate(0, 0.58, -1.1));
  return merge(parts, true);
}

/** Tyre cylinder + fender arc (steer space, no spin; the rear fenders' small tilt is ignored). */
function cornerProxyGeometry(front: boolean): THREE.BufferGeometry {
  const r0 = CAR.wheelRadius + 0.07;
  const s = new THREE.Shape();
  s.absarc(0, 0, r0 + 0.07, Math.PI * 0.14, Math.PI * 0.86, false);
  s.absarc(0, 0, r0, Math.PI * 0.86, Math.PI * 0.14, true);
  const w = CAR.wheelWidth + 0.06;
  const fender = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -w / 2).rotateY(Math.PI / 2);
  fender.rotateX(front ? 0.22 : -0.2);
  const tyre = new THREE.CylinderGeometry(CAR.wheelRadius - 0.035, CAR.wheelRadius - 0.035, CAR.wheelWidth - 0.04, 10).rotateZ(Math.PI / 2);
  return merge([tyre, fender], true);
}

// ───────────────────────────── assembly ─────────────────────────────

interface Corner {
  group: THREE.Object3D;
  steer: THREE.Object3D;
  /** Mirrors left wheels by a half turn about Y (a rotation, so instancing keeps the winding). */
  flip: THREE.Object3D;
  spin: THREE.Object3D;
  fender: THREE.Object3D;
  x: number;
  z: number;
  front: boolean;
  side: number;
}

function blobTexture(): THREE.Texture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / (size - 1)) * 2 - 1;
      const v = (y / (size - 1)) * 2 - 1;
      // Rounded-rectangle falloff.
      const d = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
      const a = Math.max(0, Math.min(1, (1 - d) / 0.45));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
      data[i + 3] = Math.round(a * a * (3 - 2 * a) * 255);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  return t;
}

interface GeometrySet {
  paint: THREE.BufferGeometry;
  parts: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  fender: THREE.BufferGeometry;
  spring: THREE.BufferGeometry;
}

function buildSet(l: Lod): GeometrySet {
  return {
    paint: bodyGeometry(l),
    parts: merge([...cageGeometry(l), ...trimGeometry(l), ...chromeGeometry(l), ...lampGeometry(l)]),
    wheel: wheelGeometry(l),
    fender: fenderGeometry(l),
    spring: springGeometry(l),
  };
}

export function createCarModel(): CarModel {
  const root = new THREE.Group();
  root.name = 'buggy';
  /** Other systems (chests/outfits) restore this paint on a session reset. */
  root.userData.defaultColor = DEFAULT_PAINT;
  const body = new THREE.Group();
  body.name = 'buggy-body';
  root.add(body);

  const lampLevel = { value: LAMP_ON };
  const paint = paintMaterial();
  // Fenders share the paint but not the hood stripes (their local space is centred on the wheel).
  const fenderPaint = new THREE.MeshPhysicalMaterial({ color: DEFAULT_PAINT, metalness: 0.25, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.07 });
  const parts = finishMaterial('rg-car-parts', lampLevel);
  const mats = [paint, fenderPaint, parts];
  const hi = buildSet(HI);
  const lo = buildSet(LO);
  const geoms: THREE.BufferGeometry[] = [...Object.values(hi), ...Object.values(lo)];

  const visual = <T extends THREE.Mesh>(m: T, name: string, parent: THREE.Object3D): T => {
    m.name = name;
    m.castShadow = false;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const paintMesh = visual(new THREE.Mesh(hi.paint, paint), 'buggy-paint', body);
  const partsMesh = visual(new THREE.Mesh(hi.parts, parts), 'buggy-parts', body);

  const seat = new THREE.Object3D();
  seat.name = 'buggy-seat';
  seat.position.set(0, -0.34, -0.24);
  body.add(seat);

  // Wheels: transform helpers per corner (never rendered), drawn as instanced meshes.
  const corners: Corner[] = [];
  const order: [number, number, boolean][] = [
    [CAR.wheelX, CAR.wheelFrontZ, true],
    [-CAR.wheelX, CAR.wheelFrontZ, true],
    [CAR.wheelX, CAR.wheelRearZ, false],
    [-CAR.wheelX, CAR.wheelRearZ, false],
  ];
  for (const [x, z, front] of order) {
    const group = new THREE.Object3D();
    group.position.set(x, CAR.hardY - CAR.restLength, z);
    const steer = new THREE.Object3D();
    const flip = new THREE.Object3D();
    const spin = new THREE.Object3D();
    const fender = new THREE.Object3D();
    const side = Math.sign(x);
    if (side < 0) flip.rotation.y = Math.PI;
    fender.rotation.x = front ? 0.22 : -0.2;
    group.add(steer);
    steer.add(flip, fender);
    flip.add(spin);
    corners.push({ group, steer, flip, spin, fender, x, z, front, side });
  }
  // Instanced meshes are culled with a fixed sphere around the chassis (instances move a little).
  const carSphere = new THREE.Sphere(new THREE.Vector3(0, 0.2, 0), 2.9);
  const instanced = (g: THREE.BufferGeometry, m: THREE.Material, n: number, name: string): THREE.InstancedMesh => {
    const im = visual(new THREE.InstancedMesh(g, m, n), name, root);
    im.boundingSphere = carSphere.clone();
    return im;
  };
  const wheels = instanced(hi.wheel, parts, 4, 'buggy-wheels');
  const fenders = instanced(hi.fender, fenderPaint, 4, 'buggy-fenders');
  // Suspension: two A-arms per corner and a coil-over each.
  const armG = finish(new THREE.CylinderGeometry(0.028, 0.028, 1, 6, 1, true).translate(0, 0.5, 0), ARM);
  geoms.push(armG);
  const arms = instanced(armG, parts, 8, 'buggy-arms');
  const springs = instanced(hi.spring, parts, 4, 'buggy-springs');
  for (const m of [arms, springs]) m.receiveShadow = false;

  // Shadow: one low-poly proxy for the body (rides with the body) + one instanced for the corners.
  const bodyProxyG = bodyProxyGeometry();
  const cornerProxyG = cornerProxyGeometry(true);
  geoms.push(bodyProxyG, cornerProxyG);
  body.add(asShadowProxy(new THREE.Mesh(bodyProxyG)));
  const cornerProxy = asShadowProxy(new THREE.InstancedMesh(cornerProxyG, undefined, 4));
  cornerProxy.boundingSphere = carSphere.clone();
  root.add(cornerProxy);

  // Contact shadow (both quality levels; most useful on Low without a shadow map).
  const blobTex = blobTexture();
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 4.2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.55, depthWrite: false, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  blob.name = 'buggy-blob';
  blob.renderOrder = 1;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const mat = new THREE.Matrix4();
  const steerM = new THREE.Matrix4();
  const scl = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const placeStrut = (im: THREE.InstancedMesh, i: number, from: THREE.Vector3, to: THREE.Vector3): void => {
    dir.subVectors(to, from);
    const len = dir.length();
    quat.setFromUnitVectors(Y, dir.divideScalar(Math.max(1e-6, len)));
    scl.set(1, len, 1);
    mat.compose(from, quat, scl);
    im.setMatrixAt(i, mat);
  };
  let high = true;

  const model: CarModel = {
    root,
    body,
    seat,
    blob,
    setColor(c) {
      paint.color.set(c);
      fenderPaint.color.set(c);
    },
    setLights(on) {
      lampLevel.value = on ? LAMP_ON : LAMP_OFF;
    },
    setDetail(h) {
      if (h === high) return;
      high = h;
      const set = h ? hi : lo;
      paintMesh.geometry = set.paint;
      partsMesh.geometry = set.parts;
      wheels.geometry = set.wheel;
      fenders.geometry = set.fender;
      springs.geometry = set.spring;
    },
    update(wheelState, pitch, roll, heave) {
      body.rotation.set(pitch, 0, roll);
      body.position.y = heave;
      for (let i = 0; i < corners.length; i++) {
        const c = corners[i];
        const w = wheelState[i];
        c.group.position.y = CAR.hardY - w.length;
        c.steer.rotation.y = w.steer;
        c.spin.rotation.x = w.spin * c.side;
        // Instance matrices in root space: group · steer (· flip · spin | · fender).
        c.group.updateMatrix();
        c.steer.updateMatrix();
        c.spin.updateMatrix();
        steerM.multiplyMatrices(c.group.matrix, c.steer.matrix);
        cornerProxy.setMatrixAt(i, steerM);
        mat.multiplyMatrices(steerM, c.fender.matrix);
        fenders.setMatrixAt(i, mat);
        mat.multiplyMatrices(steerM, c.flip.matrix).multiply(c.spin.matrix);
        wheels.setMatrixAt(i, mat);
        // A-arms: chassis pivots → knuckle (upper and lower).
        const hubY = c.group.position.y;
        const inX = c.side * 0.5;
        const outX = c.x - c.side * (CAR.wheelWidth / 2 + 0.04);
        a.set(inX, -0.08, c.z);
        b.set(outX, hubY + 0.1, c.z);
        placeStrut(arms, i * 2, a, b);
        a.set(inX, -0.3, c.z);
        b.set(outX, hubY - 0.1, c.z);
        placeStrut(arms, i * 2 + 1, a, b);
        // Coil-over: from a high chassis mount down to the lower arm near the hub.
        a.set(c.side * 0.55, 0.36, c.z + (c.front ? -0.14 : 0.14));
        b.set(outX - c.side * 0.06, hubY - 0.06, c.z);
        placeStrut(springs, i, b, a);
      }
      for (const m of [wheels, fenders, arms, springs, cornerProxy]) m.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of mats) m.dispose();
      blob.geometry.dispose();
      (blob.material as THREE.Material).dispose();
      blobTex.dispose();
    },
  };
  for (const c of corners) c.fender.updateMatrix();
  for (const c of corners) c.flip.updateMatrix();
  model.update(
    corners.map(() => ({ length: STATIC_LENGTH, spin: 0, steer: 0 })),
    0,
    0,
    0,
  );
  return model;
}
