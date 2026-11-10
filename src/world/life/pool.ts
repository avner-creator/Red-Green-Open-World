/**
 * An InstancedMesh refilled every frame with only the instances that should draw (compacted), so a
 * species costs one draw call when any of it is near and nothing when none is.
 */
import * as THREE from 'three';

export class Pool {
  readonly mesh: THREE.InstancedMesh;
  private readonly anim: THREE.InstancedBufferAttribute | null;
  private readonly fade: THREE.InstancedBufferAttribute | null;
  private n = 0;

  constructor(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, readonly max: number, opts: { anim?: boolean; fade?: boolean; color?: boolean } = {}) {
    this.anim = opts.anim ? new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4) : null;
    this.fade = opts.fade ? new THREE.InstancedBufferAttribute(new Float32Array(max), 1) : null;
    if (this.anim) {
      this.anim.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAnim', this.anim);
    }
    if (this.fade) {
      this.fade.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFade', this.fade);
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.name = `life-${name}`;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (opts.color) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  begin(): void {
    this.n = 0;
  }

  get count(): number {
    return this.n;
  }

  push(m: THREE.Matrix4, color?: THREE.Color, a0 = 0, a1 = 0, a2 = 0, a3 = 0): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.mesh.setMatrixAt(i, m);
    if (color && this.mesh.instanceColor) this.mesh.setColorAt(i, color);
    if (this.anim) this.anim.setXYZW(i, a0, a1, a2, a3);
    if (this.fade) this.fade.setX(i, a0);
  }

  end(): void {
    const m = this.mesh;
    m.count = this.n;
    m.visible = this.n > 0;
    if (!this.n) return;
    m.instanceMatrix.clearUpdateRanges();
    m.instanceMatrix.addUpdateRange(0, this.n * 16);
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) {
      m.instanceColor.clearUpdateRanges();
      m.instanceColor.addUpdateRange(0, this.n * 3);
      m.instanceColor.needsUpdate = true;
    }
    if (this.anim) {
      this.anim.clearUpdateRanges();
      this.anim.addUpdateRange(0, this.n * 4);
      this.anim.needsUpdate = true;
    }
    if (this.fade) {
      this.fade.clearUpdateRanges();
      this.fade.addUpdateRange(0, this.n);
      this.fade.needsUpdate = true;
    }
    m.computeBoundingSphere();
  }
}
