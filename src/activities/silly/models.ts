/**
 * Silly Zone props (both-eye, procedural, bright/dark brightness contrast so they read in R-only
 * and G-only). Built for a small draw budget:
 *  - everything static goes into ONE shared Kit (2 draws: gloss + matte),
 *  - all capsule-shaped movers (tube-people bodies and arms, the sweeper bar, the wrecking pillows
 *    and their ropes) are instances of ONE capsule InstancedMesh,
 *  - all little spheres (eyes, pupils, mouths) are ONE instanced mesh,
 *  - the bumper caps are two instanced meshes (light and dark),
 *  - the picture board and the start pad share one canvas texture (1 draw).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Kit } from '../bungee/kit';
import { SILLY } from './logic';
import { BOOP } from './game';

export const COL = {
  navy: 0x1b2252,
  ink: 0x14161f,
  cream: 0xfff1cf,
  white: 0xffffff,
  yellow: 0xffd23f,
  sky: 0x9fe3ff,
  pink: 0xff9ed8,
  lime: 0xc8f26a,
  plum: 0x5b3f7c,
} as const;

/** Flag a moving mesh so the camera collision never treats it as a wall. */
export function moving<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    c.userData.cameraIgnore = true;
  });
  return o;
}

// ───────────────────────────── Beach ball ─────────────────────────────

export function createBallMesh(): THREE.Mesh {
  const r = SILLY.ball.radius;
  const geo = new THREE.SphereGeometry(r, 40, 24);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const gores = [COL.white, COL.navy, COL.yellow, COL.navy, COL.sky, COL.navy];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.abs(y) > r * 0.9) c.set(COL.white);
    else if (Math.abs(y) > r * 0.86) c.set(COL.ink);
    else {
      const a = Math.atan2(z, x) + Math.PI;
      c.set(gores[Math.floor((a / (Math.PI * 2)) * 6 + 1e-6) % 6]);
    }
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }));
  mesh.name = 'silly-ball';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return moving(mesh);
}

/** One merged geometry from a single-finish Kit (the Kit's material is thrown away). */
function kitGeometry(k: Kit): THREE.BufferGeometry {
  const g = k.build('tmp');
  const mesh = g.children[0] as THREE.Mesh;
  (mesh.material as THREE.Material).dispose();
  return mesh.geometry;
}

// ───────────────────────────── Bumper mushrooms ─────────────────────────────

export interface MushroomModel {
  /** Light caps (even indices) and dark caps (odd indices), instanced. */
  light: THREE.InstancedMesh;
  dark: THREE.InstancedMesh;
  /** Pose cap `i` (yaw spin + squash). */
  pose(i: number, yaw: number, squash: number): void;
}

/** Adds the stems to the shared static kit; returns the instanced spinning caps. */
export function createMushrooms(spots: readonly THREE.Vector3[], k: Kit): MushroomModel {
  const b = SILLY.bumper;
  for (const p of spots) {
    k.cyl('gloss', COL.navy, p.x, p.y + 0.06, p.z, 1.5, 0.12, 28);
    k.add('gloss', new THREE.CylinderGeometry(0.38, 0.55, b.top - 0.55, 18), COL.cream, k.t(p.x, p.y + (b.top - 0.55) / 2, p.z));
    k.add('gloss', new THREE.TorusGeometry(0.47, 0.07, 8, 20), COL.navy, k.t(p.x, p.y + 0.55, p.z, Math.PI / 2));
  }
  const capGeo = (dark: boolean): THREE.BufferGeometry => {
    const kc = new Kit();
    const capCol = dark ? COL.navy : COL.yellow;
    const spotCol = dark ? COL.cream : COL.navy;
    kc.add('gloss', new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), capCol, kc.t(0, 0, 0, 0, 0, 0, b.capRadius, 0.78, b.capRadius));
    kc.add('gloss', new THREE.TorusGeometry(b.capRadius, 0.16, 10, 32), dark ? COL.yellow : COL.ink, kc.t(0, 0.02, 0, Math.PI / 2));
    kc.add('gloss', new THREE.CircleGeometry(b.capRadius, 28), COL.cream, kc.t(0, -0.01, 0, Math.PI / 2));
    for (let s = 0; s < 7; s++) {
      const a = (s / 7) * Math.PI * 2;
      const el = s % 2 ? 0.55 : 0.95;
      const nx = Math.cos(a) * Math.cos(el);
      const ny = Math.sin(el);
      const nz = Math.sin(a) * Math.cos(el);
      const n = new THREE.Vector3(nx * b.capRadius, ny * 0.78, nz * b.capRadius);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx / b.capRadius, ny / 0.78, nz / b.capRadius).normalize());
      kc.add('gloss', new THREE.SphereGeometry(0.24, 10, 6), spotCol, new THREE.Matrix4().compose(n, q, new THREE.Vector3(1, 0.3, 1)));
    }
    kc.add('gloss', new THREE.SphereGeometry(0.28, 10, 6), spotCol, kc.t(0, 0.74, 0, 0, 0, 0, 1, 0.45, 1));
    return kitGeometry(kc);
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32 });
  const nLight = Math.ceil(spots.length / 2);
  const light = new THREE.InstancedMesh(capGeo(false), mat, Math.max(1, nLight));
  const dark = new THREE.InstancedMesh(capGeo(true), mat, Math.max(1, spots.length - nLight));
  light.name = 'silly-mushroom-caps-light';
  dark.name = 'silly-mushroom-caps-dark';
  for (const m of [light, dark]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    moving(m);
  }
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const pose = (i: number, yaw: number, squash: number): void => {
    const p = spots[i];
    pos.set(p.x, p.y + b.top - 0.78, p.z);
    scl.set(1 + squash * 0.4, 1 - squash, 1 + squash * 0.4);
    mtx.compose(pos, q.setFromAxisAngle(up, yaw), scl);
    const m = i % 2 ? dark : light;
    m.setMatrixAt(Math.floor(i / 2), mtx);
    m.instanceMatrix.needsUpdate = true;
  };
  spots.forEach((_, i) => pose(i, 0, 0));
  light.computeBoundingSphere();
  dark.computeBoundingSphere();
  return { light, dark, pose };
}

// ───────────────────────────── Capsules (tube people, sweeper, pillows) ─────────────────────────────

/** Base capsule: radius 0.34, straight length SILLY.tube.segLen (scaled per instance). */
export const CAPSULE = { radius: 0.34, length: SILLY.tube.segLen } as const;

export interface CapsuleSlots {
  readonly mesh: THREE.InstancedMesh;
  /** First instance of each block. */
  readonly tubeBody: number;
  readonly tubeArms: number;
  readonly sweeper: number;
  readonly pillows: number;
}

export const SWEEPER_PARTS = 8; // bar segments; + 2 end bumpers
export const PILLOW_PARTS = 4; // 2 ropes + 2 pillows

export function createCapsules(tubeCount: number): CapsuleSlots {
  const segs = SILLY.tube.segments;
  const tubeBody = 0;
  const tubeArms = tubeCount * segs;
  const sweeper = tubeArms + tubeCount * 4;
  const pillows = sweeper + SWEEPER_PARTS + 2;
  const count = pillows + PILLOW_PARTS;
  const mesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(CAPSULE.radius, CAPSULE.length, 4, 12), new THREE.MeshStandardMaterial({ roughness: 0.4 }), count);
  mesh.name = 'silly-capsules';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const c = new THREE.Color(COL.white);
  for (let i = 0; i < count; i++) mesh.setColorAt(i, c);
  // Sweeper: alternating pink / cream padding, navy end bumpers.
  for (let i = 0; i < SWEEPER_PARTS + 2; i++) mesh.setColorAt(sweeper + i, c.set(i >= SWEEPER_PARTS ? COL.navy : i % 2 ? COL.cream : COL.pink));
  // Pillows: cream ropes, big sky/pink pillows.
  mesh.setColorAt(pillows, c.set(COL.cream));
  mesh.setColorAt(pillows + 1, c.set(COL.cream));
  mesh.setColorAt(pillows + 2, c.set(COL.sky));
  mesh.setColorAt(pillows + 3, c.set(COL.pink));
  moving(mesh);
  return { mesh, tubeBody, tubeArms, sweeper, pillows };
}

/** Tube colour schemes [light, dark]. */
export const TUBE_SCHEMES: readonly [number, number][] = [
  [COL.yellow, COL.navy],
  [COL.sky, COL.ink],
  [COL.pink, COL.navy],
  [COL.lime, COL.ink],
  [COL.cream, COL.navy],
];

/** Colour tube `t`'s body and arms: striped (normal) or solid bright (booped, happy). */
export function paintTube(s: CapsuleSlots, t: number, happy: boolean): void {
  const segs = SILLY.tube.segments;
  const [light, dark] = TUBE_SCHEMES[t % TUBE_SCHEMES.length];
  const c = new THREE.Color();
  for (let i = 0; i < segs; i++) s.mesh.setColorAt(s.tubeBody + t * segs + i, c.set(happy ? (i % 2 ? COL.white : light) : i === segs - 1 ? light : i % 2 ? dark : light));
  for (let a = 0; a < 4; a++) s.mesh.setColorAt(s.tubeArms + t * 4 + a, c.set(happy ? COL.white : a % 2 ? light : dark));
  if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
}

/** Eyes (2), pupils (2) and an "O" mouth (1) per tube: one instanced sphere mesh. */
export function createFaces(tubeCount: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ roughness: 0.35 }), tubeCount * 5);
  mesh.name = 'silly-faces';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const c = new THREE.Color();
  for (let t = 0; t < tubeCount; t++) {
    for (let k = 0; k < 5; k++) mesh.setColorAt(t * 5 + k, c.set(k < 2 ? COL.white : COL.ink));
  }
  return moving(mesh);
}

/** Bobbing "bop me!" arrows above lit tube people (bright, both-eye). */
export function createMarkers(count: number): THREE.InstancedMesh {
  const k = new Kit();
  // Down arrow: a fat cone head and a shaft, with a dark rim so it reads on the bright sky.
  k.add('gloss', new THREE.ConeGeometry(0.62, 0.8, 4), COL.yellow, k.t(0, 0, 0, Math.PI, Math.PI / 4, 0));
  k.add('gloss', new THREE.BoxGeometry(0.42, 0.7, 0.42), COL.yellow, k.t(0, 0.72, 0));
  k.add('gloss', new THREE.ConeGeometry(0.72, 0.92, 4), COL.ink, k.t(0, -0.02, 0, Math.PI, Math.PI / 4, 0, 1, 0.92, 1).premultiply(new THREE.Matrix4().makeTranslation(0, 0.06, 0)));
  const geo = kitGeometry(k);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0x3a2a00 }), count);
  mesh.name = 'silly-markers';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  return moving(mesh);
}

/** Static tube blower bases (into the shared kit). */
export function addTubeBases(k: Kit, bases: readonly THREE.Vector3[], yaws: readonly number[]): void {
  bases.forEach((p, i) => {
    k.add('gloss', new THREE.CylinderGeometry(0.62, 0.72, 0.5, 20), COL.navy, k.t(p.x, p.y + 0.25, p.z));
    k.add('matte', new THREE.TorusGeometry(0.62, 0.08, 8, 24), COL.yellow, k.t(p.x, p.y + 0.5, p.z, Math.PI / 2));
    for (let g = 0; g < 3; g++) {
      const yaw = yaws[i];
      k.box('matte', COL.cream, p.x + Math.sin(yaw) * 0.66, p.y + 0.15 + g * 0.11, p.z + Math.cos(yaw) * 0.66, 0.5, 0.05, 0.04, 0, yaw, 0);
    }
  });
}

// ───────────────────────────── Sweeper hub and pillow gantry (static parts) ─────────────────────────────

export function addSweeperHub(k: Kit, c: THREE.Vector3): void {
  const s = BOOP.sweeper;
  k.cyl('matte', COL.navy, c.x, c.y + 0.03, c.z, s.length + 0.6, 0.04, 48);
  k.add('matte', new THREE.TorusGeometry(s.length + 0.45, 0.07, 6, 64), COL.yellow, k.t(c.x, c.y + 0.06, c.z, Math.PI / 2));
  k.cyl('gloss', COL.yellow, c.x, c.y + 0.5, c.z, 0.7, 1.0, 24);
  k.add('gloss', new THREE.SphereGeometry(0.72, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), COL.pink, k.t(c.x, c.y + 1.0, c.z));
}

export interface GantrySpec {
  /** Beam centre at ground level (beam runs along X). */
  at: THREE.Vector3;
  halfSpan: number;
  height: number;
}

export function addGantry(k: Kit, g: GantrySpec): void {
  const { at, halfSpan, height } = g;
  for (const sx of [-1, 1]) {
    const x = at.x + sx * halfSpan;
    for (const sz of [-1, 1]) k.rod('gloss', COL.navy, new THREE.Vector3(x, at.y, at.z + sz * 1.3), new THREE.Vector3(x, at.y + height, at.z), 0.13, 10);
    k.add('gloss', new THREE.SphereGeometry(0.28, 12, 8), COL.yellow, k.t(x, at.y + height, at.z));
  }
  k.add('gloss', new THREE.CylinderGeometry(0.16, 0.16, halfSpan * 2, 12), COL.yellow, k.t(at.x, at.y + height, at.z, 0, 0, Math.PI / 2));
  // Striped beam wraps.
  for (let i = 0; i < 7; i++) k.add('gloss', new THREE.TorusGeometry(0.17, 0.04, 6, 14), COL.navy, k.t(at.x - halfSpan + ((i + 1) * halfSpan * 2) / 8, at.y + height, at.z, 0, Math.PI / 2));
}

// ───────────────────────────── FLOP button ─────────────────────────────

function flopTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#1b2252';
    for (let i = 0; i < 16; i++) {
      g.save();
      g.translate(128, 128);
      g.rotate((i / 16) * Math.PI * 2);
      g.beginPath();
      g.moveTo(-8, 70);
      g.lineTo(8, 70);
      g.lineTo(0, 128);
      g.fill();
      g.restore();
    }
    g.beginPath();
    g.arc(128, 128, 72, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(128 - 60, 128 - 60);
    g.scale(5, 5);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#fff1cf';
    g.lineWidth = 3.2;
    g.stroke(new Path2D('M20 12a8 8 0 1 1-2.5-5.8'));
    g.fillStyle = '#fff1cf';
    g.fill(new Path2D('M14.5 2.5l5.5.5-.5 5.5z'));
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Adds the button's base ring to the kit; returns the pressable cap. */
export function createFlopButton(p: THREE.Vector3, k: Kit): THREE.Mesh {
  const r = SILLY.flop.radius;
  k.cyl('matte', COL.navy, p.x, p.y + 0.03, p.z, r + 0.45, 0.06, 40);
  k.add('matte', new THREE.TorusGeometry(r + 0.3, 0.09, 8, 40), COL.cream, k.t(p.x, p.y + 0.06, p.z, Math.PI / 2));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    k.cyl('gloss', i % 2 ? COL.yellow : COL.cream, p.x + Math.cos(a) * (r + 0.95), p.y + 0.04, p.z + Math.sin(a) * (r + 0.95), 0.16, 0.08, 10);
  }
  const side = new THREE.MeshStandardMaterial({ color: COL.ink, roughness: 0.5 });
  const top = new THREE.MeshStandardMaterial({ map: flopTexture(), roughness: 0.4 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.24, 40), [side, top, side]);
  cap.name = 'silly-flop-button';
  cap.position.set(p.x, p.y + 0.06 + 0.12, p.z);
  cap.castShadow = true;
  cap.receiveShadow = true;
  return moving(cap);
}

// ───────────────────────────── See-saw ─────────────────────────────

export interface SeesawModel {
  /** Plank pivot (rotation.z tilts it; +Z up at the +X end). */
  plank: THREE.Group;
  jelly: THREE.Group;
  /** Jelly face (wobble target). */
  jellyBody: THREE.Mesh;
}

export const SEESAW = { half: 3.2, pivotY: 0.85, pedestal: 1.25 } as const;

/** Adds the fixed parts (fulcrum, pedestal, mat) at `c` to the kit; returns the moving parts (local to `c`). */
export function createSeesaw(c: THREE.Vector3, k: Kit): SeesawModel {
  const { half, pivotY, pedestal } = SEESAW;
  k.add('gloss', new THREE.CylinderGeometry(0.2, 0.75, pivotY, 3, 1), COL.navy, k.t(c.x, c.y + pivotY / 2, c.z, 0, Math.PI / 2, 0, 1, 1, 1.4));
  k.cyl('gloss', COL.cream, c.x, c.y + pivotY, c.z, 0.12, 1.2, 12, Math.PI / 2);
  k.cyl('gloss', COL.navy, c.x + half + 0.2, c.y + pedestal / 2, c.z + 1.7, 0.6, pedestal, 20);
  k.add('matte', new THREE.TorusGeometry(0.6, 0.07, 8, 20), COL.yellow, k.t(c.x + half + 0.2, c.y + pedestal, c.z + 1.7, Math.PI / 2));
  k.box('matte', COL.navy, c.x - half - 3.5, c.y + 0.015, c.z, 5.5, 0.03, 2.2);
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) k.box('matte', COL.yellow, c.x - half - 1.6 - i * 1.3, c.y + 0.035, c.z + s * 0.42, 0.22, 0.02, 0.95, 0, s * 0.75, 0);
  }

  const plank = new THREE.Group();
  plank.position.y = pivotY;
  const kp = new Kit();
  const n = 8;
  for (let i = 0; i < n; i++) kp.box('gloss', i % 2 ? COL.cream : COL.yellow, -half + ((i + 0.5) * 2 * half) / n, 0, 0, (2 * half) / n, 0.16, 0.95);
  kp.add('gloss', new THREE.TorusGeometry(0.62, 0.12, 8, 24), COL.ink, kp.t(-half + 0.55, 0.12, 0, Math.PI / 2));
  kp.cyl('gloss', COL.navy, -half + 0.55, 0.09, 0, 0.62, 0.04, 24);
  kp.cyl('gloss', COL.navy, half - 0.6, 0.11, 0, 0.55, 0.06, 20);
  plank.add(kp.build('silly-seesaw-plank'));

  const jelly = new THREE.Group();
  const jellyBody = new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.1, 1.2, 4, 0.28), new THREE.MeshStandardMaterial({ color: COL.pink, roughness: 0.25, emissive: 0x220011 }));
  jellyBody.position.y = 0.55;
  jellyBody.castShadow = true;
  jelly.add(jellyBody);
  const kf = new Kit();
  for (const s of [-1, 1]) {
    kf.add('gloss', new THREE.SphereGeometry(0.13, 12, 8), COL.white, kf.t(s * 0.22, 0.68, 0.6));
    kf.add('gloss', new THREE.SphereGeometry(0.065, 10, 6), COL.ink, kf.t(s * 0.22, 0.68, 0.71));
  }
  kf.add('gloss', new THREE.TorusGeometry(0.16, 0.04, 6, 16, Math.PI), COL.ink, kf.t(0, 0.45, 0.61, 0, 0, Math.PI));
  const face = kf.build('silly-jelly-face', false);
  jellyBody.add(face);
  face.position.y = -0.55;
  moving(plank);
  moving(jelly);
  return { plank, jelly, jellyBody };
}

// ───────────────────────────── Floor dressing ─────────────────────────────

/** Mat under the bumper row (into the kit). */
export function addFloorDressing(k: Kit, mushrooms: readonly THREE.Vector3[]): void {
  if (mushrooms.length < 2) return;
  const a = mushrooms[0];
  const b = mushrooms[mushrooms.length - 1];
  const cx = (a.x + b.x) / 2;
  const cz = (a.z + b.z) / 2;
  const len = Math.hypot(b.x - a.x, b.z - a.z) + 4;
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  k.box('matte', COL.navy, cx, a.y + 0.012, cz, 3.6, 0.02, len, 0, yaw, 0);
  const n = Math.floor(len / 0.9);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    for (const s of [-1, 1]) {
      k.cyl('matte', COL.cream, cx + Math.sin(yaw) * t * len + Math.cos(yaw) * s * 1.55, a.y + 0.026, cz + Math.cos(yaw) * t * len - Math.sin(yaw) * s * 1.55, 0.13, 0.01, 10);
    }
  }
}
