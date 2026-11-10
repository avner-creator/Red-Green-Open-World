/**
 * Cartoon dust puffs (one instanced mesh, fixed pool): soft low-poly balls that pop out of the
 * tyres, drift up, grow and shrink away. Light warm tone so they read in both R and G.
 */
import * as THREE from 'three';

const POOL = 48;

export interface Dust {
  readonly mesh: THREE.InstancedMesh;
  emit(at: THREE.Vector3, vel: THREE.Vector3, size: number): void;
  update(dt: number): void;
  dispose(): void;
}

export function createDust(): Dust {
  const geo = new THREE.IcosahedronGeometry(0.5, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0xeadfc8, emissive: 0x5a4f3c, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, POOL);
  mesh.name = 'buggy-dust';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const life = new Float32Array(POOL); // seconds left (0 = free)
  const max = new Float32Array(POOL);
  const size = new Float32Array(POOL);
  const pos = Array.from({ length: POOL }, () => new THREE.Vector3());
  const vel = Array.from({ length: POOL }, () => new THREE.Vector3());
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let next = 0;
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < POOL; i++) mesh.setMatrixAt(i, hide);

  return {
    mesh,
    emit(at, v, sz) {
      const i = next;
      next = (next + 1) % POOL;
      pos[i].copy(at);
      vel[i].copy(v);
      max[i] = life[i] = 0.55 + sz * 0.3;
      size[i] = sz;
    },
    update(dt) {
      let any = false;
      for (let i = 0; i < POOL; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) {
          mesh.setMatrixAt(i, hide);
          any = true;
          continue;
        }
        const k = 1 - life[i] / max[i];
        vel[i].multiplyScalar(Math.exp(-3 * dt));
        vel[i].y += 0.6 * dt;
        pos[i].addScaledVector(vel[i], dt);
        const sc = size[i] * (0.35 + 1.1 * Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5)) * (1 - k * k);
        q.setFromAxisAngle(s.set(0, 1, 0), i * 1.7 + k);
        m.compose(pos[i], q, s.set(sc, sc * 0.85, sc));
        mesh.setMatrixAt(i, m);
        any = true;
      }
      if (any) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
