/**
 * The fakes' look: the real Glow Gem's faceted geometry and grey shading (`buildGemGeometry` in
 * `src/activities/gems.ts`), rebuilt with two knobs so a fake can differ in ONE way only:
 * the number of facets, or no sparkle (the real gem's bright top table and its alternating
 * light/dark facet stripes). With the defaults it is vertex-for-vertex the real gem (unit-tested),
 * and the halo is the same texture.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REAL_FACETS } from './logic';

/** Grey of the top table on a fake without sparkle (the real gem's table is 1.0). */
export const DULL_TABLE = 0.62;

export function fakeGemGeometry(facets: number = REAL_FACETS, sparkle = true): THREE.BufferGeometry {
  const crown = new THREE.CylinderGeometry(0.28, 0.5, 0.22, facets, 1).translate(0, 0.11, 0).toNonIndexed();
  const pavilion = new THREE.ConeGeometry(0.5, 0.75, facets, 1, true).rotateX(Math.PI).translate(0, -0.375, 0).toNonIndexed();
  const geo = mergeGeometries([crown, pavilion], false);
  crown.dispose();
  pavilion.dispose();
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const light = new THREE.Vector3(0.4, 0.8, 0.45).normalize();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    let grey: number;
    if (n.y > 0.99) grey = sparkle ? 1 : DULL_TABLE;
    else if (n.y < -0.99) grey = 0.3;
    else {
      const facet = Math.floor((Math.atan2(n.x, n.z) + Math.PI) / (Math.PI / 4));
      const base = 0.38 + 0.5 * Math.max(0, n.dot(light));
      grey = base + (sparkle ? (facet % 2 === 0 ? 0.12 : -0.1) : 0.01);
    }
    grey = Math.min(1, Math.max(0.22, grey));
    for (let k = 0; k < 3; k++) colors.set([grey, grey, grey], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** The real gem's soft halo (same gradient as gems.ts). */
export function haloTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}
