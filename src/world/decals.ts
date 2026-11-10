/**
 * Textured quads that show pictograms from the atlas (sign faces, badges, ground icons). All of them
 * merge into one mesh with one material, so every sign in the world costs a single draw call.
 * Pure geometry: the atlas texture is attached at runtime (`createDecalMesh`).
 */
import * as THREE from 'three';
import { ATLAS_H, ATLAS_SIZE, pictoUv, type PictoId } from './pictograms';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export class Decals {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  count = 0;

  /**
   * A w×h quad centred on the origin of `m`, facing local +Z. Set `back` to also add the same picture
   * on the reverse side (facing −Z, still reading left-to-right) `gap` metres behind.
   */
  add(id: PictoId, m: THREE.Matrix4, w: number, h = w, back = false, gap = 0): void {
    this.quad(id, m, w, h, 0);
    if (back) this.quad(id, m.clone().multiply(new THREE.Matrix4().makeRotationY(Math.PI)), w, h, gap);
  }

  private quad(id: PictoId, m: THREE.Matrix4, w: number, h: number, z: number): void {
    const [u0, v0, du, dv] = pictoUv(id);
    // Half a texel inset so mip levels never sample the neighbour cell.
    const e = 0.5 / ATLAS_SIZE;
    const f = 0.5 / ATLAS_H;
    const corners: [number, number, number, number][] = [
      [-w / 2, -h / 2, u0 + e, v0 + f],
      [w / 2, -h / 2, u0 + du - e, v0 + f],
      [w / 2, h / 2, u0 + du - e, v0 + dv - f],
      [-w / 2, h / 2, u0 + e, v0 + dv - f],
    ];
    _nm.getNormalMatrix(m);
    _n.set(0, 0, 1).applyMatrix3(_nm).normalize();
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const [x, y, u, v] = corners[k];
      _v.set(x, y, z).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      this.nrm.push(_n.x, _n.y, _n.z);
      this.uv.push(u, v);
    }
    this.count++;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** Material for pictogram faces: lit like paint, with a little self-light so signs stay legible at sunset. */
export function pictoMaterial(atlas: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: atlas,
    alphaTest: 0.5,
    roughness: 0.55,
    emissive: new THREE.Color(1, 1, 1),
    emissiveMap: atlas,
    emissiveIntensity: 0.22,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
}

export function createDecalMesh(d: Decals, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(d.geometry(), mat);
  mesh.name = 'pictograms';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
