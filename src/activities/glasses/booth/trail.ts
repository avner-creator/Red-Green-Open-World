/**
 * "Back to the pad" ground trail (both eyes): a row of chunky arrows lying on the ground that march
 * from where the child stands to the start pad while a round waits for them (QA6 m3). White arrows
 * with a thick black rim: bright-on-dark in the R channel and in the G channel alike, never a hue
 * cue. One instanced mesh (one draw call), shown only while waiting.
 *
 * `layoutTrail` is pure (unit-tested): arrow spots along a polyline, marching with time.
 */
import * as THREE from 'three';

export interface TrailSpot {
  x: number;
  z: number;
  /** Heading (radians, atan2(dx, dz)): the arrow points along the path. */
  yaw: number;
  /** 0..1 pulse (1 = the arrow the "wave" is on: biggest). */
  pulse: number;
}

export const TRAIL = {
  /** Metres between arrows. */
  spacing: 1.3,
  /** Marching speed (m/s). */
  speed: 1.4,
  /** No arrows this close to the start (under the hero) or to the end (on the pad). */
  skipStart: 0.7,
  skipEnd: 0.9,
  max: 14,
  size: 0.95,
  lift: 0.2,
} as const;

/** Arrow spots along `path` (frame or world x/z) at time `t` (s); none within `skipEnd` m of the end (the pad). */
export function layoutTrail(path: readonly { x: number; z: number }[], t: number, max: number = TRAIL.max, skipEnd: number = TRAIL.skipEnd): TrailSpot[] {
  const out: TrailSpot[] = [];
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    lens.push(l);
    total += l;
  }
  const end = total - skipEnd;
  if (end <= TRAIL.skipStart) return out;
  const phase = (t * TRAIL.speed) % TRAIL.spacing;
  // The wave runs ahead of the arrows (twice their speed) so the row reads as "this way".
  const wave = (t * TRAIL.speed * 2) % Math.max(TRAIL.spacing, end);
  for (let d = TRAIL.skipStart + phase; d < end && out.length < max; d += TRAIL.spacing) {
    let rest = d;
    let i = 0;
    while (i < lens.length - 1 && rest > lens[i]) {
      rest -= lens[i];
      i++;
    }
    const a = path[i];
    const b = path[i + 1];
    const k = lens[i] > 1e-6 ? rest / lens[i] : 0;
    const dw = Math.abs(d - wave);
    out.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: Math.atan2(b.x - a.x, b.z - a.z), pulse: Math.max(0, 1 - dw / TRAIL.spacing) });
  }
  return out;
}

function arrowShape(scale: number): THREE.Shape {
  // A chunky arrow pointing +y (→ +z once laid flat): head and a short shaft.
  const s = new THREE.Shape();
  const p = (x: number, y: number): [number, number] => [x * scale, y * scale];
  s.moveTo(...p(0, 0.62));
  s.lineTo(...p(0.5, 0.08));
  s.lineTo(...p(0.2, 0.08));
  s.lineTo(...p(0.2, -0.55));
  s.lineTo(...p(-0.2, -0.55));
  s.lineTo(...p(-0.2, 0.08));
  s.lineTo(...p(-0.5, 0.08));
  s.closePath();
  return s;
}

function arrowGeometry(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, number, number][] = [
    [new THREE.ShapeGeometry(arrowShape(1.28)), 0x0b0c10, 0],
    [new THREE.ShapeGeometry(arrowShape(1)), 0xffffff, 0.012],
  ];
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const [g, hex, y] of parts) {
    g.rotateX(-Math.PI / 2);
    // Shape +y became −z: turn it so the arrow points +z.
    g.rotateY(Math.PI);
    g.translate(0, y, 0.05);
    const ng = g.index ? g.toNonIndexed() : g;
    const a = ng.getAttribute('position');
    c.setHex(hex);
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    g.dispose();
    if (ng !== g) ng.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

export class PadTrail {
  readonly mesh: THREE.InstancedMesh;
  private t = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(arrowGeometry(), mat, TRAIL.max);
    this.mesh.name = 'glasses:pad-trail';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.userData.cameraIgnore = true;
    this.mesh.count = 0;
  }

  /** Lay the arrows along `path` (world x/z); `groundY` gives the world ground height. */
  update(dt: number, path: readonly { x: number; z: number }[], groundY: (x: number, z: number) => number, urgent: boolean, skipEnd: number = TRAIL.skipEnd): number {
    this.t += dt;
    const spots = layoutTrail(path, this.t, TRAIL.max, skipEnd);
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      const k = TRAIL.size * (1 + (urgent ? 0.45 : 0.25) * sp.pulse);
      this.q.setFromAxisAngle(this.up, sp.yaw);
      this.m.compose(this.v.set(sp.x, groundY(sp.x, sp.z) + TRAIL.lift, sp.z), this.q, this.s.set(k, 1, k));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.count = spots.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    return spots.length;
  }

  reset(): void {
    this.t = 0;
    this.mesh.count = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
