import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mergeCharacterMeshes } from '../../src/core/characters/merge';

/** World positions of every vertex of every mesh under `root` (skinning applied). */
function worldVertices(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const out: THREE.Vector3[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const s = m as THREE.SkinnedMesh;
    if (s.isSkinnedMesh) s.skeleton.update();
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3();
      if (s.isSkinnedMesh) s.getVertexPosition(i, v);
      else v.fromBufferAttribute(pos, i);
      out.push(v.applyMatrix4(m.matrixWorld));
    }
  });
  return out;
}

/** A tiny rig: bone chain with rigid meshes on bones/groups and one skinned mesh, two materials. */
function rig(): { root: THREE.Group; bones: THREE.Bone[] } {
  const a = new THREE.MeshStandardMaterial();
  const b = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  root.scale.setScalar(0.7);
  root.position.set(2, 0, -1);
  const hip = new THREE.Bone();
  hip.position.set(0, 1, 0);
  const knee = new THREE.Bone();
  knee.position.set(0.1, -0.5, 0);
  hip.add(knee);
  root.add(hip);
  const holder = new THREE.Group(); // non-bone parent between a bone and a mesh
  holder.position.set(0, 0.2, 0.1);
  holder.rotation.z = 0.3;
  knee.add(holder);
  const m1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), a);
  m1.position.set(0.05, 0.1, 0);
  m1.rotation.y = 0.4;
  hip.add(m1);
  const m2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), a);
  holder.add(m2);
  const m3 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), b);
  knee.add(m3);
  // Skinned mesh weighted between hip and knee, bound at the rest pose.
  const geo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 4);
  const n = geo.attributes.position.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = geo.attributes.position.getY(i) + 0.5;
    si.set([0, 1, 0, 0], i * 4);
    sw.set([1 - t, t, 0, 0], i * 4);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const skinned = new THREE.SkinnedMesh(geo, a);
  skinned.position.set(0, 0.3, 0);
  root.add(skinned);
  root.updateMatrixWorld(true);
  skinned.bind(new THREE.Skeleton([hip, knee]));
  return { root, bones: [hip, knee] };
}

function pose(bones: THREE.Bone[]): void {
  bones[0].rotation.set(0.5, -0.2, 0.3);
  bones[1].rotation.set(-0.8, 0.1, 0);
  bones[1].position.y = -0.45;
}

describe('mergeCharacterMeshes', () => {
  it('merges per material and keeps every vertex where it was, in any pose', () => {
    const before = rig();
    pose(before.bones);
    const expected = worldVertices(before.root);

    const after = rig();
    const saved = mergeCharacterMeshes(after.root);
    let meshes = 0;
    after.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(saved).toBe(2); // material a: 3 meshes → 1; material b: 1 mesh stays
    expect(meshes).toBe(2);
    pose(after.bones);
    const got = worldVertices(after.root);
    expect(got.length).toBe(expected.length);
    // Same multiset of points (order changes with the merge): compare sorted coordinates.
    const key = (v: THREE.Vector3): string => [v.x, v.y, v.z].map((c) => c.toFixed(4)).join(',');
    expect(got.map(key).sort()).toEqual(expected.map(key).sort());
  });

  it('leaves meshes alone that animation tracks target by name', () => {
    const r = rig();
    r.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh && !o.name) o.name = `part${o.id}`;
    });
    const names: string[] = [];
    r.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.name) names.push(o.name);
    });
    const clip = new THREE.AnimationClip('a', 1, names.map((n) => new THREE.VectorKeyframeTrack(`${n}.position`, [0], [0, 0, 0])));
    expect(mergeCharacterMeshes(r.root, [clip])).toBe(0);
  });
});
