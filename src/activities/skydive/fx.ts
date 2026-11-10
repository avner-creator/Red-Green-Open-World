/**
 * Wind streaks (both-eye, main scene, subtle): thin lines around the player that rush past along
 * the relative wind, longer and brighter with speed.
 */
import * as THREE from 'three';

const COUNT = 90;
const BOX = { x: 13, y: 22, z: 13 };

export interface WindStreaks {
  /** `intensity` 0..1 sets opacity; `vel` is the player's velocity (m/s). */
  update(dt: number, center: THREE.Vector3, vel: THREE.Vector3, intensity: number): void;
  hide(): void;
  dispose(): void;
}

export function createWindStreaks(scene: THREE.Scene, seed = 1): WindStreaks {
  let s = seed;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const offsets = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    offsets[i * 3] = (rnd() * 2 - 1) * BOX.x;
    offsets[i * 3 + 1] = (rnd() * 2 - 1) * BOX.y;
    offsets[i * 3 + 2] = (rnd() * 2 - 1) * BOX.z;
  }
  const positions = new Float32Array(COUNT * 6);
  const colors = new Float32Array(COUNT * 6);
  for (let i = 0; i < COUNT; i++) {
    // Head bright, tail fades out.
    colors.set([1, 1, 1, 0, 0, 0], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  lines.renderOrder = 5;
  scene.add(lines);

  const wrap = (v: number, h: number): number => {
    const span = h * 2;
    return ((((v + h) % span) + span) % span) - h;
  };

  return {
    update(dt, center, vel, intensity) {
      const op = Math.max(0, Math.min(1, intensity)) * 0.32;
      lines.visible = op > 0.005;
      mat.opacity = op;
      if (!lines.visible) return;
      const len = 0.045;
      for (let i = 0; i < COUNT; i++) {
        const o = i * 3;
        offsets[o] = wrap(offsets[o] - vel.x * dt, BOX.x);
        offsets[o + 1] = wrap(offsets[o + 1] - vel.y * dt, BOX.y);
        offsets[o + 2] = wrap(offsets[o + 2] - vel.z * dt, BOX.z);
        const x = center.x + offsets[o];
        const y = center.y + offsets[o + 1];
        const z = center.z + offsets[o + 2];
        positions.set([x, y, z, x + vel.x * len, y + vel.y * len, z + vel.z * len], i * 6);
      }
      posAttr.needsUpdate = true;
    },
    hide() {
      lines.visible = false;
    },
    dispose() {
      lines.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}
