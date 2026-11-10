import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGear } from '../../src/activities/gear/models';

const FACE_HEAD = ['hat-propeller', 'hat-crown', 'hat-wizard', 'glasses-shades', 'glasses-goggles', 'hat-explorer', 'glasses-star'];
const BACK = ['pack-explorer', 'pack-rocket'];

function box(id: string): THREE.Box3 {
  const w = buildGear(id);
  if (!w) throw new Error(id);
  w.object.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(w.object);
  w.dispose();
  return b;
}

describe('gear models', () => {
  it('every head and face item is centred left/right', () => {
    for (const id of FACE_HEAD) {
      const b = box(id);
      const c = (b.min.x + b.max.x) / 2;
      expect(Math.abs(c), `${id} centre ${c}`).toBeLessThan(0.05);
    }
  });
  it('backpacks are centred and sit behind the torso surface', () => {
    for (const id of BACK) {
      const b = box(id);
      expect(Math.abs((b.min.x + b.max.x) / 2)).toBeLessThan(0.03);
      expect(b.max.z).toBeLessThan(0.02);
    }
  });
});
