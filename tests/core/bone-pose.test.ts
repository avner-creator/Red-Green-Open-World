import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PoseLayer, aimBone, rotateBoneWorld } from '../../src/core/vehicles/bone-pose';

/** root → hip (rotated, scaled parent like a glTF armature) → upper → lower; foot hangs off root (IK). */
function rig(): { root: THREE.Object3D; upper: THREE.Bone; lower: THREE.Bone; foot: THREE.Bone } {
  const root = new THREE.Group();
  const arm = new THREE.Group();
  arm.rotation.x = -Math.PI / 2;
  arm.scale.setScalar(2);
  root.add(arm);
  const upper = new THREE.Bone();
  upper.position.set(0, 0, 0.5); // 1 m up after the armature rotation and scale
  upper.rotation.x = Math.PI; // pointing down
  arm.add(upper);
  const lower = new THREE.Bone();
  lower.position.set(0, 0.2, 0); // 0.4 m along the bone
  upper.add(lower);
  const foot = new THREE.Bone();
  arm.add(foot);
  root.updateMatrixWorld(true);
  foot.position.copy(arm.worldToLocal(lower.localToWorld(new THREE.Vector3(0, 0.2, 0))));
  root.updateMatrixWorld(true);
  return { root, upper, lower, foot };
}

const wp = (o: THREE.Object3D): THREE.Vector3 => o.getWorldPosition(new THREE.Vector3());

describe('bone posing', () => {
  it('aims a bone at a world direction and carries a non-child IK foot along', () => {
    const { upper, lower, foot } = rig();
    const layer = new PoseLayer();
    const dir = new THREE.Vector3(1, -1, 0).normalize();
    expect(aimBone(layer, upper, lower, dir, 1, [foot])).toBe(true);
    const got = wp(lower).sub(wp(upper)).normalize();
    expect(got.distanceTo(dir)).toBeLessThan(1e-5);
    // The foot stays at the end of the (rotated) lower bone.
    const end = lower.localToWorld(new THREE.Vector3(0, 0.2, 0));
    expect(wp(foot).distanceTo(end)).toBeLessThan(1e-5);
  });

  it('half weight aims half way', () => {
    const { upper, lower } = rig();
    const layer = new PoseLayer();
    const before = wp(lower).sub(wp(upper)).normalize();
    const dir = new THREE.Vector3(1, 0, 0);
    aimBone(layer, upper, lower, dir, 0.5);
    const got = wp(lower).sub(wp(upper)).normalize();
    expect(got.angleTo(before)).toBeCloseTo(before.angleTo(dir) / 2, 4);
  });

  it('restore puts every touched bone back exactly', () => {
    const { root, upper, lower, foot } = rig();
    const layer = new PoseLayer();
    const q0 = upper.quaternion.clone();
    const f0 = foot.position.clone();
    aimBone(layer, upper, lower, new THREE.Vector3(0, 0, 1), 1, [foot]);
    rotateBoneWorld(layer, lower, new THREE.Vector3(1, 0, 0), 0.7);
    expect(layer.size).toBe(3);
    layer.restore();
    root.updateMatrixWorld(true);
    expect(upper.quaternion.angleTo(q0)).toBeLessThan(1e-6);
    expect(foot.position.distanceTo(f0)).toBeLessThan(1e-9);
    expect(layer.size).toBe(0);
  });
});
