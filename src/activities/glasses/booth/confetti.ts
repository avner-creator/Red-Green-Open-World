/**
 * One-draw-call confetti burst (an InstancedMesh, pooled; deterministic when driven by a seeded
 * rng). Bright and dark pieces alternate so a burst reads by brightness in the R-only and the
 * G-only picture. (Moved here from ../gates/kit.ts, which re-exports it.)
 */
import * as THREE from 'three';

/** Bright and dark entries so the burst reads by brightness in the R-only and the G-only picture. */
const CONFETTI = [0xffffff, 0xffe066, 0x1b2a6b, 0xffffff, 0x9fd8ff, 0x101318, 0xffb0e0, 0xfff2b0];

export class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private readonly geo = new THREE.PlaneGeometry(0.16, 0.1);
  private readonly mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: true });
  private readonly p: Float32Array; // px py pz vx vy vz age life spin
  private readonly max: number;
  private alive = 0;
  private next = 0;
  private readonly obj = new THREE.Object3D();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(max = 90) {
    this.max = max;
    this.p = new Float32Array(max * 9);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.name = 'glasses:confetti';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, this.zero);
      this.mesh.setColorAt(i, c.setHex(CONFETTI[i % CONFETTI.length]));
    }
    this.mesh.visible = false;
  }

  /** Burst `n` pieces at a world point (deterministic: driven by `rng`). */
  burst(x: number, y: number, z: number, rng: () => number, n = 45, up = 5): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const o = i * 9;
      const a = rng() * Math.PI * 2;
      const sp = 1.2 + rng() * 2.6;
      this.p[o] = x;
      this.p[o + 1] = y;
      this.p[o + 2] = z;
      this.p[o + 3] = Math.cos(a) * sp;
      this.p[o + 4] = up * (0.6 + rng() * 0.6);
      this.p[o + 5] = Math.sin(a) * sp;
      this.p[o + 6] = 0;
      this.p[o + 7] = 1.6 + rng() * 0.8;
      this.p[o + 8] = (rng() - 0.5) * 14;
    }
    this.alive = this.max;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    let live = 0;
    for (let i = 0; i < this.max; i++) {
      const o = i * 9;
      if (this.p[o + 7] <= 0 || this.p[o + 6] >= this.p[o + 7]) {
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      live++;
      const age = (this.p[o + 6] += dt);
      this.p[o + 4] -= 7.5 * dt;
      const drag = Math.exp(-1.6 * dt);
      this.p[o + 3] *= drag;
      this.p[o + 5] *= drag;
      if (this.p[o + 4] < -1.4) this.p[o + 4] = -1.4; // flutter down
      this.p[o] += this.p[o + 3] * dt;
      this.p[o + 1] += this.p[o + 4] * dt;
      this.p[o + 2] += this.p[o + 5] * dt;
      const s = Math.min(1, (this.p[o + 7] - age) * 3);
      this.obj.position.set(this.p[o], this.p[o + 1], this.p[o + 2]);
      this.obj.rotation.set(age * this.p[o + 8], age * this.p[o + 8] * 0.7, age * 3);
      this.obj.scale.setScalar(Math.max(0, s));
      this.obj.updateMatrix();
      this.mesh.setMatrixAt(i, this.obj.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alive = live;
    if (live === 0) this.mesh.visible = false;
  }

  /** Drop every piece at once (far-idle, reset). */
  clear(): void {
    for (let i = 0; i < this.max; i++) {
      this.p[i * 9 + 7] = 0;
      this.mesh.setMatrixAt(i, this.zero);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alive = 0;
    this.mesh.visible = false;
  }

  get live(): number {
    return this.alive;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
