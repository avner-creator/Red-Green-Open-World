/**
 * Cheap particle pools for the sky rides (one InstancedMesh each = one draw): smoke-trail puffs,
 * splashes, confetti, bubbles, sparkles. Particles grow, fall/float and shrink away; nothing is
 * transparent-sorted, so a pool costs one draw whatever the count.
 */
import * as THREE from 'three';

export interface PuffOptions {
  max: number;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Gravity (m/s², + = falls). Negative floats up (bubbles). */
  gravity?: number;
  /** Velocity damping per second. */
  drag?: number;
}

interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  spin: number;
}

export class Puffs {
  readonly mesh: THREE.InstancedMesh;
  private readonly ps: P[] = [];
  private next = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly gravity: number;
  private readonly drag: number;
  private alive = 0;
  private dirty = true;

  constructor(private readonly opts: PuffOptions) {
    this.mesh = new THREE.InstancedMesh(opts.geometry, opts.material, opts.max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gravity = opts.gravity ?? 0;
    this.drag = opts.drag ?? 0;
    for (let i = 0; i < opts.max; i++) {
      this.ps.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 0, size: 0, grow: 0, spin: 0 });
      this.mesh.setMatrixAt(i, this.zero);
    }
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < opts.max; i++) this.mesh.setColorAt(i, white);
    if (this.mesh.instanceColor) this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  /** Live particles. */
  get count(): number {
    return this.alive;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow = 0, color?: THREE.Color): void {
    const i = this.next;
    this.next = (this.next + 1) % this.opts.max;
    const p = this.ps[i];
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.age = 0;
    p.life = life;
    p.size = size;
    p.grow = grow;
    p.spin = (i * 2.399) % (Math.PI * 2);
    if (color) {
      this.mesh.setColorAt(i, color);
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    this.dirty = true;
  }

  /** A burst of `n` particles flying out from a point. */
  burst(x: number, y: number, z: number, n: number, speed: number, life: number, size: number, colors?: readonly THREE.Color[], up = 0.5): void {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + k * 0.7;
      const e = ((k * 0.618) % 1) * 2 - 1 + up;
      const s = speed * (0.6 + 0.4 * ((k * 0.37) % 1));
      this.spawn(x, y, z, Math.cos(a) * s, e * s * 0.8, Math.sin(a) * s, life * (0.7 + 0.3 * ((k * 0.53) % 1)), size, 0, colors ? colors[k % colors.length] : undefined);
    }
  }

  update(dt: number): void {
    if (!this.dirty && this.alive === 0) return;
    this.dirty = false;
    let alive = 0;
    const d = this.dummy;
    const damp = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      if (p.age >= p.life) {
        if (p.life > 0) {
          this.mesh.setMatrixAt(i, this.zero);
          p.life = 0;
        }
        continue;
      }
      p.age += dt;
      p.vx *= damp;
      p.vy = p.vy * damp - this.gravity * dt;
      p.vz *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = p.age / p.life;
      const s = Math.max(0, (p.size + p.grow * k) * (k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4)));
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.spin + k * 4, p.spin * 1.3 + k * 3, 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, k >= 1 ? this.zero : d.matrix);
      alive++;
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Positions of live particles (bubble hits). */
  forEachAlive(fn: (x: number, y: number, z: number, i: number) => boolean | void): void {
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      if (p.age < p.life && fn(p.x, p.y, p.z, i) === true) p.age = p.life;
    }
  }

  clear(): void {
    for (let i = 0; i < this.ps.length; i++) {
      this.ps[i].age = 1;
      this.ps[i].life = 0;
      this.mesh.setMatrixAt(i, this.zero);
    }
    this.alive = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}

/** Confetti colours that differ in brightness in R-only and G-only (never hue alone). */
export const CONFETTI_COLORS: readonly THREE.Color[] = [0xffffff, 0xffd93b, 0x1d2a5c, 0x9ff3ff, 0xff9ab0, 0x2d1a40].map((c) => new THREE.Color(c));
