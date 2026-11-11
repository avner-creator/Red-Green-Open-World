/**
 * Big cartoon eyes for every hero: glossy eyeballs with a dark iris and two highlights, upper and
 * lower lids in the skin colour, and soft blush cheeks. One merged skinned mesh (one draw): every
 * piece hangs on its own pivot under the head bone, and `mergeCharacterMeshes` turns the pivots
 * into bones, so lids, eye squash and eye direction animate per piece for free.
 *
 * Expressions (`FaceState`) are lid angles + eye scale + where the eyes look; they read by shape
 * (open, squint, closed, wide), never by colour, so they work in the R-only and G-only channel.
 */
import * as THREE from 'three';
import type { FaceDef } from './catalog';

export type FaceState = 'neutral' | 'happy' | 'wow' | 'determined' | 'giggle' | 'sleepy' | 'blink';

/** Target pose of one expression. Lid angles: radians about the eye's X axis (+ = closing). */
interface FacePose {
  upper: number;
  lower: number;
  /** Upper-lid tilt (inner corner down = determined). */
  tilt: number;
  /** Eye scale (x, y). */
  sx: number;
  sy: number;
}

const OPEN_UP = -0.85;
const OPEN_LO = 0.95;
export const FACE_POSES: Readonly<Record<FaceState, FacePose>> = {
  neutral: { upper: OPEN_UP, lower: OPEN_LO, tilt: 0, sx: 1, sy: 1 },
  blink: { upper: 0.85, lower: 0.35, tilt: 0, sx: 1, sy: 0.92 },
  happy: { upper: -0.45, lower: -0.05, tilt: -0.12, sx: 1.04, sy: 0.9 },
  wow: { upper: -1.35, lower: 1.25, tilt: 0, sx: 1.16, sy: 1.18 },
  determined: { upper: -0.25, lower: 0.7, tilt: 0.38, sx: 1, sy: 0.96 },
  giggle: { upper: 0.6, lower: -0.15, tilt: -0.2, sx: 1.05, sy: 0.8 },
  sleepy: { upper: 0.12, lower: 0.75, tilt: -0.08, sx: 1, sy: 0.95 },
};

export interface FaceRig {
  readonly mesh: THREE.Object3D;
  /** Current expression (before blinks). */
  readonly state: FaceState;
  set(state: FaceState): void;
  /** Look direction offset, radians (yaw +left, pitch +up), eased. */
  look(yaw: number, pitch: number): void;
  /** Close the eyes for a moment. */
  blink(): void;
  update(dt: number): void;
}

const TEX_W = 512;
const TEX_H = 256;
/** UV spots (right half of the atlas) for flat-coloured pieces. */
const UV_LID: [number, number] = [0.75, 0.78];
const UV_BLUSH: [number, number] = [0.75, 0.22];

function faceTexture(def: FaceDef): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d');
  if (!g) return null;
  // Left half: the eyeball in equirect layout (u 0..0.5 ↔ x 0..256). Front (+Z) is u = 0.25 → x = 64.
  g.fillStyle = def.sclera ?? '#fffaf0';
  g.fillRect(0, 0, TEX_W / 2, TEX_H);
  const cx = 64;
  const cy = 128;
  const iris = def.iris ?? '#3a2414';
  const k = def.irisSize ?? 1;
  // Equirect: 1° = 256/360 px across, 256/180 px down.
  const ax = (256 / 360) * 34 * k;
  const ay = (256 / 180) * 34 * k;
  const grad = g.createRadialGradient(cx, cy - ay * 0.3, 1, cx, cy, ay);
  grad.addColorStop(0, def.irisLight ?? '#8a5a2b');
  grad.addColorStop(1, iris);
  g.fillStyle = '#1b120c';
  g.beginPath();
  g.ellipse(cx, cy, ax * 1.08, ay * 1.08, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(cx, cy, ax, ay, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0d0907';
  g.beginPath();
  g.ellipse(cx, cy + ay * 0.06, ax * 0.55, ay * 0.55, 0, 0, Math.PI * 2);
  g.fill();
  // Two highlights (big upper-left, small lower-right) make the eyes look wet and alive.
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(cx - ax * 0.32, cy - ay * 0.38, ax * 0.32, ay * 0.3, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(cx + ax * 0.34, cy + ay * 0.34, ax * 0.14, ay * 0.13, 0, 0, Math.PI * 2);
  g.fill();
  // Right half: lid colour (top) and blush (bottom).
  g.fillStyle = def.lid;
  g.fillRect(TEX_W / 2, 0, TEX_W / 2, TEX_H / 2);
  g.fillStyle = def.blushColor ?? '#ff9aa8';
  g.fillRect(TEX_W / 2, TEX_H / 2, TEX_W / 2, TEX_H / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

/** Point every UV of a geometry at one flat-coloured spot of the atlas. */
function flatUv(geo: THREE.BufferGeometry, uv: [number, number]): THREE.BufferGeometry {
  const a = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0], uv[1]);
  return geo;
}

interface Piece {
  pivot: THREE.Object3D;
  rest: THREE.Quaternion;
  /** Local scale after re-parenting (undoes the bone's world scale). */
  restScale: THREE.Vector3;
  side: 1 | -1;
}

/**
 * Build the face under `bone` (must be inside `object`'s hierarchy, at the rest pose). Positions in
 * `def` are character space (metres, after the catalog scale), left eye (+X); the right one mirrors.
 * Returns the rig; the caller merges meshes afterwards (one draw).
 */
export function buildFace(def: FaceDef, object: THREE.Object3D, bone: THREE.Object3D, material?: THREE.Material): FaceRig {
  const map = faceTexture(def);
  const mat =
    material ??
    new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0xf4f0e6, roughness: 0.32, metalness: 0, name: 'hero-face' });
  const r = def.eyeR;
  const eyeGeo = new THREE.SphereGeometry(r, 22, 16);
  {
    const uv = eyeGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
  }
  const upGeo = flatUv(new THREE.SphereGeometry(r * 1.07, 22, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), UV_LID);
  const loGeo = flatUv(new THREE.SphereGeometry(r * 1.05, 22, 6, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4), UV_LID);
  const blushGeo = flatUv(new THREE.CircleGeometry(1, 16), UV_BLUSH);

  object.updateMatrixWorld(true);
  const eyes: Piece[] = [];
  const uppers: Piece[] = [];
  const lowers: Piece[] = [];
  const add = (geo: THREE.BufferGeometry, at: readonly [number, number, number], side: 1 | -1, euler: THREE.Euler, scale?: THREE.Vector3): Piece => {
    const pivot = new THREE.Object3D();
    pivot.name = 'face-pivot';
    pivot.position.set(at[0] * side, at[1], at[2]);
    pivot.quaternion.setFromEuler(euler);
    if (scale) pivot.scale.copy(scale);
    object.add(pivot);
    pivot.updateMatrixWorld(true);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'face-part';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    pivot.add(mesh);
    bone.attach(pivot);
    return { pivot, rest: pivot.quaternion.clone(), restScale: pivot.scale.clone(), side };
  };
  const yaw = def.eyeYaw ?? 0.18;
  const pitch = def.eyePitch ?? 0;
  for (const side of [1, -1] as const) {
    const e = new THREE.Euler(-pitch, yaw * side, 0, 'YXZ');
    eyes.push(add(eyeGeo, def.eyeAt, side, e));
    uppers.push(add(upGeo, def.eyeAt, side, e));
    lowers.push(add(loGeo, def.eyeAt, side, e));
    if (def.blushAt) {
      const b = def.blushAt;
      const s = def.blushR ?? r * 0.75;
      add(blushGeo, b, side, new THREE.Euler(0, (def.blushYaw ?? 0.6) * side, 0, 'YXZ'), new THREE.Vector3(s, s * 0.6, 1));
    }
  }

  let state: FaceState = 'neutral';
  let blinkT = 0;
  const cur: FacePose = { ...FACE_POSES.neutral };
  let lookYaw = 0;
  let lookPitch = 0;
  let wantYaw = 0;
  let wantPitch = 0;
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const ax = new THREE.Vector3(1, 0, 0);
  const ay = new THREE.Vector3(0, 1, 0);
  const az = new THREE.Vector3(0, 0, 1);

  function pose(): void {
    const scale = (p: Piece): void => {
      p.pivot.scale.set(p.restScale.x * cur.sx, p.restScale.y * cur.sy, p.restScale.z * cur.sx);
    };
    for (const p of eyes) {
      qa.setFromAxisAngle(ay, lookYaw);
      qb.setFromAxisAngle(ax, -lookPitch);
      p.pivot.quaternion.copy(p.rest).multiply(qa).multiply(qb);
      scale(p);
    }
    for (const p of uppers) {
      qa.setFromAxisAngle(az, cur.tilt * p.side);
      qb.setFromAxisAngle(ax, cur.upper);
      p.pivot.quaternion.copy(p.rest).multiply(qa).multiply(qb);
      scale(p);
    }
    for (const p of lowers) {
      qb.setFromAxisAngle(ax, cur.lower);
      p.pivot.quaternion.copy(p.rest).multiply(qb);
      scale(p);
    }
  }
  pose();

  return {
    // The merged mesh replaces the parts; callers find it by material name if they need it.
    mesh: bone,
    get state() {
      return state;
    },
    set(s) {
      if (s !== 'blink') state = s;
    },
    look(y, p) {
      wantYaw = Math.max(-0.5, Math.min(0.5, y));
      wantPitch = Math.max(-0.35, Math.min(0.35, p));
    },
    blink() {
      blinkT = 0.13;
    },
    update(dt) {
      blinkT = Math.max(0, blinkT - dt);
      const closedEyes = state === 'giggle' || state === 'happy';
      const target = FACE_POSES[blinkT > 0 && !closedEyes ? 'blink' : state];
      // Lids snap fast (blinks must read), the rest eases.
      const kLid = 1 - Math.exp(-dt * (blinkT > 0 ? 40 : 14));
      const k = 1 - Math.exp(-dt * 10);
      cur.upper += (target.upper - cur.upper) * kLid;
      cur.lower += (target.lower - cur.lower) * kLid;
      cur.tilt += (target.tilt - cur.tilt) * k;
      cur.sx += (target.sx - cur.sx) * k;
      cur.sy += (target.sy - cur.sy) * k;
      const kl = 1 - Math.exp(-dt * 8);
      lookYaw += (wantYaw - lookYaw) * kl;
      lookPitch += (wantPitch - lookPitch) * kl;
      pose();
    },
  };
}
