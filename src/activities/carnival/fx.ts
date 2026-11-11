/**
 * Carnival effects. Both-eye: confetti (the thrill rides' brightness-safe confetti) and white pop
 * puffs. Weak-eye: a puff burst drawn ONLY on the weak layer, for things only the weak eye sees
 * (a prize balloon popping must not flash for the strong eye).
 */
import * as THREE from 'three';
import { VisionLayer } from '../../types';
import type { GameContext } from '../../types';
import { createLayerMaterial } from '../../vision';
import { ThrillConfetti } from '../thrillConfetti';

const PUFFS = 48;

interface Puff {
  t: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  s: number;
}

/** A pool of little expanding, fading spheres (one instanced draw). */
class PuffPool {
  readonly mesh: THREE.InstancedMesh;
  private readonly puffs: Puff[] = [];
  private next = 0;
  private live = 0;
  private readonly o = new THREE.Object3D();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(material: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), material, PUFFS);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < PUFFS; i++) {
      this.puffs.push({ t: 1, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, s: 0 });
      this.mesh.setMatrixAt(i, this.zero);
    }
    this.mesh.visible = false;
  }

  burst(p: THREE.Vector3, count: number, size: number): void {
    for (let n = 0; n < count; n++) {
      const q = this.puffs[this.next];
      this.next = (this.next + 1) % PUFFS;
      const a = (n / count) * Math.PI * 2 + Math.random();
      const up = Math.random() * 0.8 - 0.2;
      q.t = 0;
      q.x = p.x;
      q.y = p.y;
      q.z = p.z;
      q.dx = Math.cos(a) * (1.2 + Math.random());
      q.dy = up * 1.5 + 0.4;
      q.dz = Math.sin(a) * (1.2 + Math.random());
      q.s = size * (0.6 + Math.random() * 0.6);
    }
    this.live = 1;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (!this.live) return;
    let any = false;
    for (let i = 0; i < PUFFS; i++) {
      const q = this.puffs[i];
      if (q.t >= 1) continue;
      q.t = Math.min(1, q.t + dt / 0.45);
      if (q.t >= 1) {
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      any = true;
      const e = 1 - (1 - q.t) * (1 - q.t);
      this.o.position.set(q.x + q.dx * e * 0.5, q.y + q.dy * e * 0.5, q.z + q.dz * e * 0.5);
      this.o.scale.setScalar(q.s * (1 - q.t) * (0.6 + e));
      this.o.updateMatrix();
      this.mesh.setMatrixAt(i, this.o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!any) {
      this.live = 0;
      this.mesh.visible = false;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}

export class CarnivalFx {
  private readonly confetti = new ThrillConfetti();
  private readonly puffMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x777777, roughness: 0.8 });
  private readonly weakMat = createLayerMaterial(1);
  private readonly puffs = new PuffPool(this.puffMat);
  private readonly weakPuffs = new PuffPool(this.weakMat);

  /** Seconds the confetti stays drawn after the last burst (hidden when idle: no draw call). */
  private confettiLife = 0;

  constructor(private readonly ctx: GameContext) {
    this.confetti.group.visible = false;
    this.puffs.mesh.name = 'carnival-puffs';
    this.weakPuffs.mesh.name = 'carnival-weak-puffs';
    ctx.scene.add(this.confetti.group);
    ctx.scene.add(this.puffs.mesh);
    ctx.vision.add(this.weakPuffs.mesh, VisionLayer.WeakOnly);
  }

  /** Both-eye pop puff (world position). */
  pop(p: THREE.Vector3, size = 0.35, count = 10): void {
    this.puffs.burst(p, count, size);
  }

  /** Weak-eye-only pop puff (world position). */
  weakPop(p: THREE.Vector3, size = 0.4, count = 14): void {
    this.weakPuffs.burst(p, count, size);
  }

  /** Both-eye confetti burst (world position). */
  burst(p: THREE.Vector3, count: number): void {
    this.confetti.burst(p, count);
    this.confetti.group.visible = true;
    this.confettiLife = 4;
  }

  update(dt: number): void {
    if (this.confettiLife > 0) {
      this.confettiLife -= dt;
      this.confetti.update(dt);
      if (this.confettiLife <= 0) {
        this.confetti.clear();
        this.confetti.group.visible = false;
      }
    }
    this.puffs.update(dt);
    this.weakPuffs.update(dt);
  }

  dispose(): void {
    this.ctx.scene.remove(this.confetti.group);
    this.ctx.scene.remove(this.puffs.mesh);
    this.ctx.vision.remove(this.weakPuffs.mesh);
    this.confetti.dispose();
    this.puffs.dispose();
    this.weakPuffs.dispose();
    this.puffMat.dispose();
    this.weakMat.dispose();
  }
}
