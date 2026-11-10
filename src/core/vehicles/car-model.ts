/**
 * The buggy, modelled procedurally: bevelled extruded body panels with clearcoat paint and hood
 * stripes, a filleted tube roll cage, bucket seats, chunky lathe tyres with tread blocks and
 * spoked rims, cycle fenders that steer with the wheels, visible A-arms and coil-overs that follow
 * the suspension, rear engine with chrome exhausts, headlights and a light bar.
 *
 * Reads in R-only and G-only: light warm paint and bright rims vs near-black tyres/trim/cage.
 * Frame: chassis space (see car-sim): +Z forward, +Y up, +X left; origin = chassis centre.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  dispose(): void;
}

// ───────────────────────────── geometry helpers ─────────────────────────────

/** Keep only position/normal/uv and make non-indexed so anything can be merged. */
function norm(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') n.deleteAttribute(name);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position.count) * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  if (n !== g) g.dispose();
  return n;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(parts.map(norm), false);
  for (const p of parts) p.dispose();
  if (!m) throw new Error('car: merge failed');
  return m;
}

/** A side profile drawn in (z, y), extruded across x from x0 to x1, with rounded (bevelled) edges. */
function extrudeProfile(pts: (THREE.Vector2 | [number, number, number, number])[], x0: number, x1: number, bevel = 0.05): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const first = pts[0] as THREE.Vector2;
  s.moveTo(first.x, first.y);
  for (const p of pts.slice(1)) {
    if (p instanceof THREE.Vector2) s.lineTo(p.x, p.y);
    else s.quadraticCurveTo(p[0], p[1], p[2], p[3]);
  }
  const depth = Math.max(0.001, x1 - x0 - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 14,
  });
  // Shape x → car z, extrusion (+Z) → car x.
  g.rotateY(-Math.PI / 2);
  g.translate(x1 - bevel, 0, 0);
  return g;
}

const v2 = (z: number, y: number): THREE.Vector2 => new THREE.Vector2(z, y);
const q = (cz: number, cy: number, z: number, y: number): [number, number, number, number] => [cz, cy, z, y];

/** Tube through `pts` with rounded (filleted) corners of radius `r`. */
function filletTube(pts: THREE.Vector3[], r: number, radius: number, closed = false): THREE.BufferGeometry {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const n = pts.length;
  const corner = (i: number): { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3 } => {
    const p = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const da = prev.clone().sub(p);
    const db = next.clone().sub(p);
    const ra = Math.min(r, da.length() * 0.45);
    const rb = Math.min(r, db.length() * 0.45);
    return { a: p.clone().add(da.normalize().multiplyScalar(ra)), b: p, c: p.clone().add(db.normalize().multiplyScalar(rb)) };
  };
  let cursor = closed ? corner(0).c : pts[0].clone();
  const last = closed ? n : n - 1;
  for (let i = 1; i <= last; i++) {
    const idx = i % n;
    if (!closed && i === n - 1) {
      path.add(new THREE.LineCurve3(cursor, pts[idx].clone()));
      break;
    }
    const c = corner(idx);
    path.add(new THREE.LineCurve3(cursor, c.a));
    path.add(new THREE.QuadraticBezierCurve3(c.a, c.b, c.c));
    cursor = c.c;
  }
  const segs = Math.max(8, Math.round(path.getLength() / 0.05));
  return new THREE.TubeGeometry(path, segs, radius, 10, false);
}

function straightTube(a: THREE.Vector3, b: THREE.Vector3, radius: number): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 2, radius, 10, false);
}

function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
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
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  return g;
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

function bodyGeometry(): THREE.BufferGeometry {
  // Centre tub (cockpit floor at y = 0.02).
  const tub = extrudeProfile(
    [
      v2(-1.32, -0.36), v2(1.38, -0.36), q(1.74, -0.36, 1.84, -0.06), q(1.9, 0.1, 1.74, 0.17),
      v2(0.8, 0.3), q(0.6, 0.31, 0.58, 0.5), v2(0.46, 0.5), v2(0.42, 0.02), v2(-0.76, 0.02),
      v2(-0.8, 0.42), v2(-1.36, 0.42), q(-1.58, 0.42, -1.58, 0.12), q(-1.58, -0.36, -1.32, -0.36),
    ],
    -0.52, 0.52, 0.06,
  );
  const parts = [tub];
  // Side panels (door sills), a little higher than the floor, with a sculpted dip.
  for (const s of [1, -1]) {
    const x0 = s > 0 ? 0.46 : -0.66;
    parts.push(
      extrudeProfile(
        [
          v2(-1.24, -0.3), v2(1.26, -0.3), q(1.5, -0.3, 1.5, 0.02), q(1.5, 0.2, 1.3, 0.24),
          v2(0.7, 0.4), q(0.48, 0.42, 0.36, 0.33), q(-0.15, 0.24, -0.66, 0.34), v2(-0.84, 0.47),
          v2(-1.28, 0.47), q(-1.44, 0.47, -1.44, 0.15), q(-1.44, -0.3, -1.24, -0.3),
        ],
        x0, x0 + 0.2, 0.05,
      ),
    );
  }
  return merge(parts);
}

function fenderGeometry(): THREE.BufferGeometry {
  // A cycle fender arc over the wheel (child of the steering knuckle, so it never clips).
  const r0 = CAR.wheelRadius + 0.07;
  const r1 = r0 + 0.07;
  const a0 = Math.PI * 0.14;
  const a1 = Math.PI * 0.86;
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, a0, a1, false);
  s.absarc(0, 0, r0, a1, a0, true);
  const w = CAR.wheelWidth + 0.1;
  const g = new THREE.ExtrudeGeometry(s, { depth: w - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 3, curveSegments: 24 });
  g.translate(0, 0, -(w - 0.06) / 2);
  g.rotateY(Math.PI / 2); // arc in the z-y plane, width along x
  return g;
}

function cageGeometry(): THREE.BufferGeometry {
  const R = 0.042;
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const top = 1.56;
  const parts: THREE.BufferGeometry[] = [];
  // Main hoop behind the seats.
  parts.push(filletTube([V(0.6, 0.42, -0.74), V(0.56, 1.3, -0.74), V(0.38, top, -0.74), V(-0.38, top, -0.74), V(-0.56, 1.3, -0.74), V(-0.6, 0.42, -0.74)], 0.16, R));
  // Front hoop: A-pillars from the cowl up to the roof.
  parts.push(filletTube([V(0.6, 0.5, 0.5), V(0.42, top - 0.04, -0.02), V(-0.42, top - 0.04, -0.02), V(-0.6, 0.5, 0.5)], 0.14, R));
  // Roof rails and the centre spine.
  for (const s of [1, -1]) parts.push(straightTube(V(s * 0.42, top - 0.04, -0.02), V(s * 0.4, top, -0.74), R));
  // Rear braces down to the deck corners.
  for (const s of [1, -1]) parts.push(filletTube([V(s * 0.48, top - 0.08, -0.74), V(s * 0.46, 0.92, -1.12), V(s * 0.46, 0.46, -1.36)], 0.12, R * 0.85));
  // Diagonal in the main hoop and harness bar.
  parts.push(straightTube(V(0.56, 0.6, -0.76), V(-0.4, top - 0.06, -0.76), R * 0.85));
  parts.push(straightTube(V(0.56, 0.95, -0.76), V(-0.56, 0.95, -0.76), R * 0.75));
  // Side intrusion bars.
  for (const s of [1, -1]) parts.push(filletTube([V(s * 0.62, 0.52, 0.48), V(s * 0.66, 0.62, -0.1), V(s * 0.62, 0.55, -0.72)], 0.3, R * 0.8));
  // Joint caps.
  for (const p of [V(0.6, 0.42, -0.74), V(-0.6, 0.42, -0.74), V(0.6, 0.5, 0.5), V(-0.6, 0.5, 0.5), V(0.46, 0.46, -1.36), V(-0.46, 0.46, -1.36)]) {
    parts.push(at(new THREE.SphereGeometry(R * 1.6, 12, 8), p.x, p.y, p.z));
  }
  // Front and rear tube bumpers + nerf bars.
  parts.push(filletTube([V(0.62, -0.08, 1.62), V(0.5, -0.12, 1.98), V(-0.5, -0.12, 1.98), V(-0.62, -0.08, 1.62)], 0.16, 0.05));
  parts.push(filletTube([V(0.28, -0.2, 1.75), V(0.28, 0.12, 1.96), V(-0.28, 0.12, 1.96), V(-0.28, -0.2, 1.75)], 0.1, 0.035));
  parts.push(filletTube([V(0.6, -0.1, -1.4), V(0.5, -0.16, -1.72), V(-0.5, -0.16, -1.72), V(-0.6, -0.1, -1.4)], 0.16, 0.05));
  for (const s of [1, -1]) parts.push(filletTube([V(s * 0.64, -0.22, 0.72), V(s * 0.8, -0.24, 0.5), V(s * 0.8, -0.24, -0.45), V(s * 0.64, -0.22, -0.66)], 0.14, 0.045));
  return merge(parts);
}

function trimGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // One wide central bucket seat (the robot is broad-shouldered).
  for (const sx of [0]) {
    const seat = extrudeProfile(
      [v2(0.18, 0.04), v2(0.2, 0.2), q(0.2, 0.26, 0.12, 0.27), v2(-0.36, 0.25), v2(-0.42, 0.88), q(-0.44, 0.96, -0.52, 0.94), v2(-0.6, 0.86), v2(-0.56, 0.08), q(-0.55, 0.04, -0.48, 0.04)],
      sx - 0.3, sx + 0.3, 0.06,
    );
    seat.translate(0, 0, -0.12);
    parts.push(seat);
    // Bolsters.
    for (const b of [-1, 1]) parts.push(at(new THREE.CapsuleGeometry(0.05, 0.5, 4, 8), sx + b * 0.3, 0.55, -0.62, 0.18));
  }
  // Dashboard + steering column + wheel.
  parts.push(at(roundedBox(1.0, 0.16, 0.2, 0.05), 0, 0.46, 0.36));
  parts.push(straightTube(new THREE.Vector3(0, 0.46, 0.4), new THREE.Vector3(0, 0.62, 0.24), 0.025));
  parts.push(at(new THREE.TorusGeometry(0.16, 0.024, 8, 28), 0, 0.64, 0.22, -0.95));
  parts.push(at(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12), 0, 0.64, 0.22, -0.95 + Math.PI / 2));
  for (const a of [0, 2.1, 4.2]) {
    const sp = new THREE.BoxGeometry(0.15, 0.022, 0.012).translate(0.08, 0, 0).rotateZ(a + Math.PI / 2);
    parts.push(at(sp, 0, 0.64, 0.22, -0.95));
  }
  // Floor mat, belly pan, grille, light bar housing, mirrors.
  parts.push(at(new THREE.BoxGeometry(0.98, 0.03, 1.1), 0, 0.06, -0.18));
  parts.push(at(roundedBox(1.1, 0.06, 2.9, 0.03), 0, -0.4, 0.14));
  parts.push(at(roundedBox(0.7, 0.14, 0.06, 0.04), 0, -0.06, 1.88, -0.25));
  parts.push(at(roundedBox(0.96, 0.1, 0.12, 0.04), 0, 1.6, 0.0));
  // Rear deck engine bay floor (dark) and number-plate-free tail panel.
  parts.push(at(roundedBox(0.92, 0.04, 0.5, 0.02), 0, 0.46, -1.08));
  // Tail panel and side vents.
  parts.push(at(roundedBox(0.86, 0.22, 0.05, 0.04), 0, 0.17, -1.61, 0.12));
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) parts.push(at(roundedBox(0.03, 0.05, 0.34, 0.012), s * 0.665, 0.12 + i * 0.08, -1.0));
  }
  return merge(parts);
}

function chromeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Engine block with fins + air intake + exhausts.
  parts.push(at(roundedBox(0.56, 0.22, 0.42, 0.06), 0, 0.58, -1.1));
  for (let i = 0; i < 5; i++) parts.push(at(roundedBox(0.6, 0.02, 0.36, 0.008), 0, 0.5 + i * 0.045, -1.1));
  parts.push(at(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 20), 0, 0.74, -1.1));
  parts.push(at(new THREE.TorusGeometry(0.11, 0.02, 8, 24), 0, 0.8, -1.1, Math.PI / 2));
  for (const s of [1, -1]) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.26, 0.56, -1.2), new THREE.Vector3(s * 0.32, 0.5, -1.45), new THREE.Vector3(s * 0.34, 0.56, -1.7), new THREE.Vector3(s * 0.34, 0.66, -1.84),
    ]);
    parts.push(new THREE.TubeGeometry(path, 20, 0.045, 12, false));
    parts.push(at(new THREE.CylinderGeometry(0.06, 0.055, 0.12, 16, 1, true), s * 0.34, 0.68, -1.86, -1.1));
  }
  // Headlight pods (housing) on the hood.
  for (const s of [1, -1]) {
    parts.push(at(new THREE.CylinderGeometry(0.11, 0.09, 0.16, 24), s * 0.42, 0.33, 1.42, Math.PI / 2));
    parts.push(at(new THREE.TorusGeometry(0.105, 0.016, 8, 24), s * 0.42, 0.33, 1.5));
    parts.push(at(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 8), s * 0.42, 0.22, 1.4));
  }
  // Steering wheel hub badge-free cap and gear knob.
  parts.push(at(new THREE.SphereGeometry(0.035, 12, 8), 0.36, 0.3, 0.1));
  return merge(parts);
}

function lampGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) parts.push(at(new THREE.SphereGeometry(0.095, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), s * 0.42, 0.33, 1.49, Math.PI / 2));
  // Light bar: four square lamps.
  for (const x of [-0.33, -0.11, 0.11, 0.33]) parts.push(at(roundedBox(0.16, 0.07, 0.03, 0.02), x, 1.6, 0.065));
  return merge(parts);
}

function tailGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) parts.push(at(roundedBox(0.16, 0.08, 0.04, 0.03), s * 0.33, 0.2, -1.64, 0.12));
  return merge(parts);
}

/** Tyre: rounded lathe carcass + two staggered rows of tread blocks + a brake disc. Axle = X. */
function tyreGeometry(): THREE.BufferGeometry {
  const r = CAR.wheelRadius;
  const hw = CAR.wheelWidth / 2;
  const prof = [
    [0.255, -hw + 0.03], [0.3, -hw], [r - 0.06, -hw - 0.005], [r - 0.025, -hw + 0.03], [r - 0.012, -hw + 0.08],
    [r - 0.012, hw - 0.08], [r - 0.025, hw - 0.03], [r - 0.06, hw + 0.005], [0.3, hw], [0.255, hw - 0.03],
  ].map(([a, b]) => new THREE.Vector2(a, b));
  const parts: THREE.BufferGeometry[] = [new THREE.LatheGeometry(prof, 40)];
  const n = 22;
  for (let i = 0; i < n; i++) {
    for (const row of [-1, 1]) {
      const a = ((i + (row > 0 ? 0.5 : 0)) / n) * Math.PI * 2;
      // x = radial, y = axial (lathe axis), z = along the circumference.
      const block = roundedBox(0.045, 0.1, 0.08, 0.014);
      block.translate(r - 0.008, row * 0.058, 0);
      block.rotateY(a);
      parts.push(block);
    }
  }
  // Brake disc + caliper hint (inside the rim).
  parts.push(at(new THREE.CylinderGeometry(0.19, 0.19, 0.025, 28), 0, -0.05, 0));
  const g = merge(parts);
  g.rotateZ(-Math.PI / 2); // lathe axis Y → X (outer side = +X)
  return g;
}

/** Rim: barrel, dished face with 6 spokes, hub and lug nuts. Outer face at +X. */
function rimGeometry(): THREE.BufferGeometry {
  const hw = CAR.wheelWidth / 2;
  const parts: THREE.BufferGeometry[] = [];
  const barrel = [
    [0.255, -hw + 0.03], [0.265, -hw + 0.05], [0.25, -0.05], [0.25, hw - 0.06], [0.272, hw - 0.03], [0.262, hw - 0.015],
  ].map(([a, b]) => new THREE.Vector2(a, b));
  parts.push(new THREE.LatheGeometry(barrel, 36));
  // Face ring.
  parts.push(at(new THREE.TorusGeometry(0.235, 0.022, 8, 36), 0, hw - 0.05, 0, Math.PI / 2));
  // Spokes.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = roundedBox(0.17, 0.04, 0.05, 0.018); // x = radial, y = axial, z = tangential
    sp.translate(0.13, hw - 0.07, 0);
    sp.rotateY(a);
    parts.push(sp);
  }
  // Hub, centre cap, lug nuts.
  parts.push(at(new THREE.CylinderGeometry(0.075, 0.085, 0.08, 20), 0, hw - 0.075, 0));
  parts.push(at(new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, hw - 0.035, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    parts.push(at(new THREE.CylinderGeometry(0.013, 0.013, 0.03, 6), Math.cos(a) * 0.055, hw - 0.03, Math.sin(a) * 0.055));
  }
  const g = merge(parts);
  g.rotateZ(-Math.PI / 2);
  return g;
}

function springGeometry(): THREE.BufferGeometry {
  // Unit-length coil along +Y (scaled to the spring length each frame).
  const pts: THREE.Vector3[] = [];
  const turns = 6;
  for (let i = 0; i <= turns * 16; i++) {
    const t = i / (turns * 16);
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.06, 0.08 + t * 0.84, Math.sin(a) * 0.06));
  }
  const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 16, 0.013, 6, false);
  const damper = new THREE.CylinderGeometry(0.022, 0.022, 1, 10).translate(0, 0.5, 0);
  const caps = [at(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 14), 0, 0.07, 0), at(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 14), 0, 0.93, 0)];
  return merge([coil, damper, ...caps]);
}

// ───────────────────────────── assembly ─────────────────────────────

interface Corner {
  group: THREE.Group;
  steer: THREE.Group;
  spin: THREE.Group;
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

export function createCarModel(): CarModel {
  const root = new THREE.Group();
  root.name = 'buggy';
  /** Other systems (chests/outfits) restore this paint on a session reset. */
  root.userData.defaultColor = DEFAULT_PAINT;
  const body = new THREE.Group();
  body.name = 'buggy-body';
  root.add(body);

  const paint = paintMaterial();
  // Fenders share the paint but not the hood stripes (their local space is centred on the wheel).
  const fenderPaint = new THREE.MeshPhysicalMaterial({ color: DEFAULT_PAINT, metalness: 0.25, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.07 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x24272d, roughness: 0.62, metalness: 0.15 });
  const cageMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.3, metalness: 0.8 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe9ebef, roughness: 0.16, metalness: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.9, metalness: 0 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.26, metalness: 1 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0cf, emissiveIntensity: 2.2, roughness: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x5a0d08, emissive: 0xff2a14, emissiveIntensity: 1.2, roughness: 0.3 });
  const springMat = new THREE.MeshStandardMaterial({ color: 0xff6a2a, roughness: 0.35, metalness: 0.5 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x33373e, roughness: 0.4, metalness: 0.7 });
  const mats = [paint, fenderPaint, trim, cageMat, chrome, rubber, rimMat, lamp, tail, springMat, armMat];
  const geoms: THREE.BufferGeometry[] = [];

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, name: string): THREE.Mesh => {
    const me = new THREE.Mesh(g, m);
    me.name = name;
    me.castShadow = true;
    me.receiveShadow = true;
    parent.add(me);
    geoms.push(g);
    return me;
  };

  mesh(bodyGeometry(), paint, body, 'buggy-paint');
  mesh(cageGeometry(), cageMat, body, 'buggy-cage');
  mesh(trimGeometry(), trim, body, 'buggy-trim');
  mesh(chromeGeometry(), chrome, body, 'buggy-chrome');
  mesh(lampGeometry(), lamp, body, 'buggy-lamps').castShadow = false;
  mesh(tailGeometry(), tail, body, 'buggy-tail').castShadow = false;

  const seat = new THREE.Object3D();
  seat.name = 'buggy-seat';
  seat.position.set(0, -0.34, -0.24);
  body.add(seat);

  // Wheels.
  const tyreG = tyreGeometry();
  const rimG = rimGeometry();
  const fenderG = fenderGeometry();
  geoms.push(tyreG, rimG, fenderG);
  const corners: Corner[] = [];
  const order: [number, number, boolean][] = [
    [CAR.wheelX, CAR.wheelFrontZ, true],
    [-CAR.wheelX, CAR.wheelFrontZ, true],
    [CAR.wheelX, CAR.wheelRearZ, false],
    [-CAR.wheelX, CAR.wheelRearZ, false],
  ];
  for (const [x, z, front] of order) {
    const group = new THREE.Group();
    group.position.set(x, CAR.hardY - CAR.restLength, z);
    const steer = new THREE.Group();
    const spin = new THREE.Group();
    const side = Math.sign(x);
    spin.scale.x = side; // mirror so the rim face is always outboard
    group.add(steer);
    steer.add(spin);
    const t = new THREE.Mesh(tyreG, rubber);
    const r = new THREE.Mesh(rimG, rimMat);
    for (const m of [t, r]) {
      m.castShadow = true;
      m.receiveShadow = true;
      spin.add(m);
    }
    const f = new THREE.Mesh(fenderG, fenderPaint);
    f.castShadow = true;
    f.receiveShadow = true;
    f.rotation.x = front ? 0.22 : -0.2;
    steer.add(f);
    root.add(group);
    corners.push({ group, steer, spin, x, z, front, side });
  }

  // Suspension: two A-arms per corner (instanced) and a coil-over each.
  const armG = new THREE.CylinderGeometry(0.028, 0.028, 1, 8).translate(0, 0.5, 0);
  const springG = springGeometry();
  geoms.push(armG, springG);
  const arms = new THREE.InstancedMesh(armG, armMat, 8);
  const springs = new THREE.InstancedMesh(springG, springMat, 4);
  for (const m of [arms, springs]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    root.add(m);
  }

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
      lamp.emissiveIntensity = on ? 2.2 : 0.15;
    },
    update(wheels, pitch, roll, heave) {
      body.rotation.set(pitch, 0, roll);
      body.position.y = heave;
      for (let i = 0; i < corners.length; i++) {
        const c = corners[i];
        const w = wheels[i];
        c.group.position.y = CAR.hardY - w.length;
        c.steer.rotation.y = w.steer;
        c.spin.rotation.x = w.spin;
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
      arms.instanceMatrix.needsUpdate = true;
      springs.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of mats) m.dispose();
      blob.geometry.dispose();
      (blob.material as THREE.Material).dispose();
      blobTex.dispose();
    },
  };
  model.update(
    corners.map(() => ({ length: STATIC_LENGTH, spin: 0, steer: 0 })),
    0,
    0,
    0,
  );
  return model;
}
