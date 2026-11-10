/** Helpers shared by the booth games: aim maths and a pooled arc projectile (one instanced draw). */
import * as THREE from 'three';
import { STAND_Z } from '../layout';

/** The player's eye in the booth frame (aim rays start here). */
export const EYE = new THREE.Vector3(0, 1.5, STAND_Z);

/** Unit aim direction for yaw (+ = left) and pitch (+ = up), booth frame. */
export function aimDir(yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c);
}

/** Yaw/pitch that point from `from` at `to`. */
export function aimAt(from: THREE.Vector3, to: THREE.Vector3): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** Where the aim ray from `eye` hits the plane z = `planeZ` (null if it points away). */
export function aimOnPlaneZ(eye: THREE.Vector3, yaw: number, pitch: number, planeZ: number, out = new THREE.Vector3()): THREE.Vector3 | null {
  const d = aimDir(yaw, pitch);
  if (Math.abs(d.z) < 1e-4) return null;
  const t = (planeZ - eye.z) / d.z;
  if (t <= 0) return null;
  return out.copy(eye).addScaledVector(d, t);
}

/** Where the aim ray hits the horizontal plane y = `planeY`. */
export function aimOnPlaneY(eye: THREE.Vector3, yaw: number, pitch: number, planeY: number, out = new THREE.Vector3()): THREE.Vector3 | null {
  const d = aimDir(yaw, pitch);
  if (Math.abs(d.y) < 1e-4) return null;
  const t = (planeY - eye.y) / d.y;
  if (t <= 0) return null;
  return out.copy(eye).addScaledVector(d, t);
}

/** Point on a lob from `a` to `b` with apex `h` above the straight line, t in 0..1. */
export function arcPoint(a: THREE.Vector3, b: THREE.Vector3, h: number, t: number, out = new THREE.Vector3()): THREE.Vector3 {
  out.lerpVectors(a, b, t);
  out.y += 4 * h * t * (1 - t);
  return out;
}

export interface Shot<T> {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  h: number;
  spin: number;
  data: T;
}

/**
 * Pooled flying objects (beanbags, rings…) in the booth frame: `throw` then `update`; `onLand` is
 * called once when each arrives.
 */
export class Projectiles<T> {
  readonly mesh: THREE.InstancedMesh;
  private readonly shots: (Shot<T> | null)[];
  private readonly o = new THREE.Object3D();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly p = new THREE.Vector3();

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
    private readonly onLand: (s: Shot<T>) => void,
    private readonly orient: 'spin' | 'flat' = 'spin',
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shots = new Array<Shot<T> | null>(capacity).fill(null);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, this.zero);
    this.mesh.visible = false;
  }

  get flying(): number {
    return this.shots.filter(Boolean).length;
  }

  throw(from: THREE.Vector3, to: THREE.Vector3, dur: number, h: number, data: T, color?: THREE.ColorRepresentation): boolean {
    const i = this.shots.indexOf(null);
    if (i < 0) return false;
    this.shots[i] = { from: from.clone(), to: to.clone(), t: 0, dur, h, spin: (Math.random() - 0.5) * 16, data };
    if (color !== undefined) {
      this.mesh.setColorAt(i, new THREE.Color(color));
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    this.mesh.visible = true;
    return true;
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i];
      if (!s) continue;
      s.t = Math.min(1, s.t + dt / s.dur);
      arcPoint(s.from, s.to, s.h, s.t, this.p);
      this.o.position.copy(this.p);
      if (this.orient === 'spin') this.o.rotation.set(s.t * s.spin, s.t * s.spin * 0.7, 0);
      else this.o.rotation.set(0.25 * Math.sin(s.t * 6), s.t * s.spin, 0.2);
      this.o.scale.setScalar(1);
      this.o.updateMatrix();
      this.mesh.setMatrixAt(i, this.o.matrix);
      any = true;
      if (s.t >= 1) {
        this.shots[i] = null;
        this.mesh.setMatrixAt(i, this.zero);
        this.onLand(s);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!any) this.mesh.visible = false;
  }

  clear(): void {
    for (let i = 0; i < this.shots.length; i++) {
      this.shots[i] = null;
      this.mesh.setMatrixAt(i, this.zero);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = false;
  }
}
