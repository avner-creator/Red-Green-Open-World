/**
 * Both-eye celebration confetti for glasses play: a pooled instanced field (ONE draw call, hidden
 * when nothing flies). Only ever burst AFTER an answer, at a both-eye spot (a pedestal, the aim
 * pad), never at a weak-eye object. Palette entries have equal red and green, bright or dark, so
 * the burst reads the same in the R-only and G-only picture (brightness, not hue).
 */
import * as THREE from 'three';
import { mulberry32 } from '../../../vision/toolkit';

export const CONFETTI_PALETTE = [0xffffff, 0xfff27a, 0xf2f2c8, 0x34348a, 0x1c1c40, 0xd2d2ff] as const;

interface Bit {
  age: number;
  life: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
}

export class GlassesConfetti {
  readonly mesh: THREE.InstancedMesh;
  private readonly bits: Bit[] = [];
  private readonly geo = new THREE.PlaneGeometry(0.14, 0.08);
  private readonly mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: true });
  private readonly dummy = new THREE.Object3D();
  private readonly rng: () => number;
  private next = 0;
  private alive = 0;

  constructor(
    readonly max = 56,
    seed = 7,
  ) {
    this.rng = mulberry32(seed);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.name = 'GlassesConfetti';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      this.bits.push({ age: 0, life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() });
      this.mesh.setColorAt(i, c.setHex(CONFETTI_PALETTE[i % CONFETTI_PALETTE.length]));
    }
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  /** Throw `n` bits up and out from `at`. */
  burst(at: THREE.Vector3, n = 36, power = 1): void {
    const r = this.rng;
    for (let k = 0; k < n; k++) {
      const b = this.bits[this.next];
      this.next = (this.next + 1) % this.max;
      const a = r() * Math.PI * 2;
      const s = (1.2 + r() * 2.2) * power;
      b.age = 0;
      b.life = 1.3 + r() * 0.7;
      b.p.copy(at);
      b.v.set(Math.cos(a) * s, (3.6 + r() * 2.6) * power, Math.sin(a) * s);
      b.r.set(r() * 6, r() * 6, r() * 6);
      b.w.set((r() - 0.5) * 16, (r() - 0.5) * 16, (r() - 0.5) * 16);
    }
    this.refresh(0);
  }

  get active(): boolean {
    return this.alive > 0;
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    this.refresh(dt);
  }

  clear(): void {
    for (const b of this.bits) b.life = 0;
    this.refresh(0);
  }

  private refresh(dt: number): void {
    let n = 0;
    for (const b of this.bits) {
      if (b.age >= b.life) continue;
      b.age += dt;
      if (b.age >= b.life) continue;
      b.v.y -= 9 * dt;
      b.v.multiplyScalar(Math.exp(-1.4 * dt));
      b.p.addScaledVector(b.v, dt);
      b.r.x += b.w.x * dt;
      b.r.y += b.w.y * dt;
      b.r.z += b.w.z * dt;
      const s = Math.min(1, (b.life - b.age) * 3);
      this.dummy.position.copy(b.p);
      this.dummy.rotation.copy(b.r);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      n++;
    }
    this.alive = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
