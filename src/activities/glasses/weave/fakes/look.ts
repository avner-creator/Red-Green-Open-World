/**
 * The fakes' look: the real Glow Gem's faceted geometry and grey shading (`buildGemGeometry` in
 * `src/activities/gems.ts`), rebuilt with two knobs so a fake can differ in ONE way only:
 * upside down (point up), the number of facets, or no sparkle (the real gem's bright top table and its alternating
 * light/dark facet stripes). With the defaults it is vertex-for-vertex the real gem (unit-tested),
 * and the halo is the same texture.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REAL_FACETS } from './logic';

/** Grey of the top table on a fake without sparkle (the real gem's table is 1.0). */
export const DULL_TABLE = 0.62;

/** Height range of the real gem (pavilion tip to table): a flipped fake is moved back into it. */
const GEM_BOTTOM = -0.75;
const GEM_TOP = 0.22;

export function fakeGemGeometry(facets: number = REAL_FACETS, sparkle = true, flip = false): THREE.BufferGeometry {
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
  // Point up: same shading, same height range as the real gem (so it bobs at the same place).
  if (flip) geo.rotateX(Math.PI).translate(0, GEM_BOTTOM + GEM_TOP, 0);
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

/** The real gem's halo opacity (gems.ts `haloMat`). */
export const HALO_OPACITY = 0.45;

/**
 * One fake gem and its halo quad in ONE geometry, so the fakes and every halo/puff are a single
 * instanced draw: attribute `part` (0 = gem, 1 = halo quad), RGBA colour (the gem's greys at
 * alpha 1; the halo white at the real halo's opacity) and uv (the halo's; unused on the gem).
 * Each instance draws only the part named by its per-instance `kind` (see `fakesMaterial`).
 */
export function gemAndHaloGeometry(gem: THREE.BufferGeometry, kind: THREE.InstancedBufferAttribute): THREE.BufferGeometry {
  const quad = new THREE.PlaneGeometry(1, 1).toNonIndexed();
  const gp = gem.getAttribute('position');
  const gc = gem.getAttribute('color');
  const qp = quad.getAttribute('position');
  const qu = quad.getAttribute('uv');
  const n = gp.count + qp.count;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 4);
  const uv = new Float32Array(n * 2);
  const part = new Float32Array(n);
  for (let i = 0; i < gp.count; i++) {
    pos.set([gp.getX(i), gp.getY(i), gp.getZ(i)], i * 3);
    col.set([gc.getX(i), gc.getY(i), gc.getZ(i), 1], i * 4);
  }
  for (let j = 0; j < qp.count; j++) {
    const i = gp.count + j;
    pos.set([qp.getX(j), qp.getY(j), qp.getZ(j)], i * 3);
    col.set([1, 1, 1, HALO_OPACITY], i * 4);
    uv.set([qu.getX(j), qu.getY(j)], i * 2);
    part[i] = 1;
  }
  quad.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('part', new THREE.BufferAttribute(part, 1));
  geo.setAttribute('kind', kind);
  return geo;
}

/**
 * The material for `gemAndHaloGeometry`: the real gem's unlit vertex greys (gem instances) and the
 * real halo's texture × opacity (halo instances), blended like the real halo. The vertices of the
 * part an instance does not draw collapse to a point (no fragments). Fully transparent halo texels
 * are discarded, so a halo's empty corners never hide anything drawn after it.
 */
export function fakesMaterial(haloTex: THREE.Texture): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ map: haloTex, vertexColors: true, transparent: true, alphaTest: 1 / 512 });
  mat.onBeforeCompile = (s) => {
    s.vertexShader =
      'attribute float part;\nattribute float kind;\nvarying float vPart;\n' +
      s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPart = part;\n  if (abs(part - kind) > 0.5) transformed = vec3(0.0);');
    s.fragmentShader = 'varying float vPart;\n' + s.fragmentShader.replace('#include <map_fragment>', 'if (vPart > 0.5) {\n#include <map_fragment>\n}');
  };
  mat.customProgramCacheKey = () => 'glasses-weave-fakes';
  return mat;
}
