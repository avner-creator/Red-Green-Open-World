/**
 * Draw-call merge for loaded characters: all meshes that share a material become one SkinnedMesh.
 *
 * Some GLBs (the robot) are many small rigid meshes parented to bones plus a few skinned ones,
 * which costs a draw call each, twice with shadows. The merge is exact for any pose:
 * - a rigid mesh M under parent P becomes vertices weighted 1.0 to a "bone" P whose inverse is
 *   M.matrix · T⁻¹ (T = merged mesh's world matrix at load), so P.world · M.matrix · p as before;
 * - a skinned mesh S keeps its weights; each of its bones b gets inverse  I_b · S.bindMatrix · T⁻¹,
 *   which reproduces Σ w · b.world · I_b · S.bindMatrix · p (attached bind mode).
 * Meshes with morph targets, multi-material meshes, and meshes that animation tracks target by name
 * are left alone (their tracks must keep finding them).
 */
import * as THREE from 'three';

interface Part {
  mesh: THREE.Mesh;
  /** Skeleton entries this part's skinIndex refers to: [object, inverse]. */
  bones: [THREE.Object3D, THREE.Matrix4][];
}

const KEEP = ['position', 'normal', 'uv'] as const;

/** Merge same-material meshes under `model` into skinned meshes. Returns the number of draws saved. */
export function mergeCharacterMeshes(model: THREE.Object3D, animations: readonly THREE.AnimationClip[] = []): number {
  const animated = new Set<string>();
  for (const clip of animations) {
    for (const track of clip.tracks) animated.add(THREE.PropertyBinding.parseTrackName(track.name).nodeName);
  }
  model.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.parent || Array.isArray(m.material)) return;
    if (m.morphTargetInfluences?.length || Object.keys(m.geometry.morphAttributes).length) return;
    if (animated.has(m.name) || !m.geometry.attributes.position || !m.geometry.attributes.normal) return;
    const s = m as THREE.SkinnedMesh;
    if (s.isSkinnedMesh && (s.bindMode !== THREE.AttachedBindMode || !s.geometry.attributes.skinIndex)) return;
    const list = groups.get(m.material) ?? [];
    list.push(m);
    groups.set(m.material, list);
  });

  let saved = 0;
  const modelInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const parts: Part[] = meshes.map((mesh) => {
      const s = mesh as THREE.SkinnedMesh;
      if (s.isSkinnedMesh) {
        return {
          mesh,
          bones: s.skeleton.bones.map((b, i): [THREE.Object3D, THREE.Matrix4] => [b, s.skeleton.boneInverses[i].clone().multiply(s.bindMatrix).multiply(modelInv)]),
        };
      }
      mesh.updateMatrix();
      return { mesh, bones: [[mesh.parent as THREE.Object3D, mesh.matrix.clone().multiply(modelInv)]] };
    });
    const withUv = parts.every((p) => !!p.mesh.geometry.attributes.uv);
    const geos: THREE.BufferGeometry[] = [];
    const bones: THREE.Object3D[] = [];
    const inverses: THREE.Matrix4[] = [];
    for (const p of parts) {
      const src = p.mesh.geometry;
      const g = new THREE.BufferGeometry();
      for (const name of KEEP) {
        if (name === 'uv' && !withUv) continue;
        g.setAttribute(name, toFloat(src.attributes[name]));
      }
      const count = src.attributes.position.count;
      const idx = new Uint16Array(count * 4);
      const wgt = new Float32Array(count * 4);
      const offset = bones.length;
      const si = src.attributes.skinIndex;
      const sw = src.attributes.skinWeight;
      for (let v = 0; v < count; v++) {
        if (si && sw) {
          for (let k = 0; k < 4; k++) {
            idx[v * 4 + k] = offset + si.getComponent(v, k);
            wgt[v * 4 + k] = sw.getComponent(v, k);
          }
        } else {
          idx[v * 4] = offset;
          wgt[v * 4] = 1;
        }
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
      if (src.index) g.setIndex(src.index.clone());
      else g.setIndex([...Array(count).keys()]);
      for (const [b, inv] of p.bones) {
        bones.push(b);
        inverses.push(inv);
      }
      geos.push(g);
    }
    const merged = mergeIndexed(geos);
    const first = meshes[0];
    const skinned = new THREE.SkinnedMesh(merged, material);
    skinned.name = `merged-${material.name || material.uuid.slice(0, 8)}`;
    skinned.castShadow = meshes.some((m) => m.castShadow);
    skinned.receiveShadow = meshes.some((m) => m.receiveShadow);
    skinned.frustumCulled = false;
    skinned.renderOrder = first.renderOrder;
    model.add(skinned);
    skinned.updateMatrixWorld(true);
    // Skeleton only reads `matrixWorld` from its entries, so plain Object3D parents work as bones.
    skinned.bind(new THREE.Skeleton(bones as THREE.Bone[], inverses), skinned.matrixWorld);
    for (const m of meshes) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    saved += meshes.length - 1;
  }
  return saved;
}

/** A plain float copy of any (quantized, normalized or interleaved) attribute. */
function toFloat(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const out = new Float32Array(a.count * a.itemSize);
  for (let v = 0; v < a.count; v++) for (let k = 0; k < a.itemSize; k++) out[v * a.itemSize + k] = a.getComponent(v, k);
  return new THREE.BufferAttribute(out, a.itemSize);
}

/** Concatenate indexed geometries with identical attribute sets (indices offset per part). */
function mergeIndexed(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const names = Object.keys(geos[0].attributes);
  let vertices = 0;
  let indices = 0;
  for (const g of geos) {
    vertices += g.attributes.position.count;
    indices += (g.index as THREE.BufferAttribute).count;
  }
  for (const name of names) {
    const a0 = geos[0].attributes[name] as THREE.BufferAttribute;
    const arr = name === 'skinIndex' ? new Uint16Array(vertices * a0.itemSize) : new Float32Array(vertices * a0.itemSize);
    let o = 0;
    for (const g of geos) {
      const a = g.attributes[name] as THREE.BufferAttribute;
      for (let v = 0; v < a.count; v++) for (let k = 0; k < a.itemSize; k++) arr[o++] = a.getComponent(v, k);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, a0.itemSize));
  }
  const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  let o = 0;
  let base = 0;
  for (const g of geos) {
    const ix = g.index as THREE.BufferAttribute;
    for (let i = 0; i < ix.count; i++) index[o++] = ix.getX(i) + base;
    base += g.attributes.position.count;
    g.dispose();
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}
