/** Geometry primitives (cached; the batcher clones them). Origins sit at the base unless noted. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from './rng';

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
}

/** Unit box (1×1×1), base at y=0. Scale with the matrix. */
export const boxG = (): THREE.BufferGeometry => cached('box', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));

/** Box with chamfered edges, base at y=0 (not unit: bevel must not scale). */
export function rbox(w: number, h: number, d: number, r = 0.06): THREE.BufferGeometry {
  return cached(`rbox${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2) * 0.999).translate(0, h / 2, 0));
}

/** Cylinder of radius 1 and height 1, base at y=0 (scale x/z for radius). */
export function cylG(seg = 12, top = 1, open = false): THREE.BufferGeometry {
  return cached(`cyl${seg},${top},${open}`, () => new THREE.CylinderGeometry(top, 1, 1, seg, 1, open).translate(0, 0.5, 0));
}

export function coneG(seg = 10): THREE.BufferGeometry {
  return cached(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0));
}

export function sphereG(detail = 1): THREE.BufferGeometry {
  return cached(`ico${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
}

/** Flat torus (lying in XZ). Pass `radius` instead of scaling, so the tube keeps its thickness. */
export function torusG(tube = 0.1, seg = 24, arc = Math.PI * 2, radius = 1): THREE.BufferGeometry {
  return cached(`torus${tube},${seg},${arc},${radius}`, () => new THREE.TorusGeometry(radius, tube, 8, seg, arc).rotateX(-Math.PI / 2));
}

/** Triangular prism: ridge along X (length 1), base width 1 along Z, height 1; base at y=0. */
export function prismG(): THREE.BufferGeometry {
  return cached('prism', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0.5, 0);
    shape.lineTo(0, 1);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    // shape is in XY, extruded along +Z → rotate so the extrusion runs along X.
    g.translate(0, 0, -0.5);
    g.rotateY(Math.PI / 2);
    return g;
  });
}

/** Four-sided pyramid with a square base 1×1 and height 1; base at y=0. */
export function pyramidG(): THREE.BufferGeometry {
  return cached('pyr', () => new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0));
}

/** Lumpy blob (jittered icosphere), radius ~1, centred. */
export function blobG(seed: number, detail = 1, amount = 0.18, smooth = true): THREE.BufferGeometry {
  return cached(`blob${seed},${detail},${amount},${smooth}`, () => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const pos = g.attributes.position;
    const rng = new Rng(seed);
    // Jitter shared vertices identically (non-indexed geometry repeats them).
    const map = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      let f = map.get(k);
      if (f === undefined) map.set(k, (f = 1 + (rng.next() - 0.5) * 2 * amount));
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f);
    }
    if (!smooth) {
      g.computeVertexNormals();
      return g;
    }
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    const m = mergeVertices(g);
    m.computeVertexNormals();
    return m;
  });
}

/** Flat triangle pennant hanging down from its top edge (width 1, length 1), in the XY plane. */
export function pennantG(): THREE.BufferGeometry {
  return cached('pennant', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0, -1, 0, 0.5, 0, 0], 3));
    g.setAttribute('aWave', new THREE.Float32BufferAttribute([0, 1, 0], 1));
    g.computeVertexNormals();
    return g;
  });
}

/** Rectangular flag attached along its left edge at x=0 (width 1 along +X, height 1 down from y=0). */
export function flagG(): THREE.BufferGeometry {
  return cached('flag', () => {
    const g = new THREE.PlaneGeometry(1, 1, 6, 2).translate(0.5, -0.5, 0);
    const pos = g.attributes.position;
    const w = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) w[i] = pos.getX(i);
    g.setAttribute('aWave', new THREE.BufferAttribute(w, 1));
    return g;
  });
}

/** A gently curved "cushion" disc (radius 1, height 1) for mats and pads. */
export function discG(seg = 32): THREE.BufferGeometry {
  return cached(`disc${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1).translate(0, 0.5, 0));
}
