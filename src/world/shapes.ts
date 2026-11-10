/** Geometry primitives (cached; the batcher clones them). Origins sit at the base unless noted. */
import * as THREE from 'three';
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

/**
 * Box with chamfered edges, base at y=0 (not unit: bevel must not scale). A single 45° chamfer:
 * 6 faces + 12 edge strips + 8 corner triangles = 44 triangles (a one-segment rounded box has 108),
 * flat-shaded so the bevels still catch the light.
 */
export function rbox(w: number, h: number, d: number, r = 0.06): THREE.BufferGeometry {
  return cached(`rbox${w},${h},${d},${r}`, () => chamferBox(w, h, d, Math.min(r, w / 2, h / 2, d / 2) * 0.999).translate(0, h / 2, 0));
}

function chamferBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const X = w / 2;
  const Y = h / 2;
  const Z = d / 2;
  const x = X - r;
  const y = Y - r;
  const z = Z - r;
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]): void => {
    pos.push(...a, ...b, ...c);
  };
  const quad = (a: number[], b: number[], c: number[], e: number[]): void => {
    tri(a, b, c);
    tri(a, c, e);
  };
  for (const s of [1, -1]) {
    // Faces (counter-clockwise seen from outside).
    quad([s * X, -y, s * z], [s * X, -y, -s * z], [s * X, y, -s * z], [s * X, y, s * z]);
    quad([-s * x, s * Y, z], [s * x, s * Y, z], [s * x, s * Y, -z], [-s * x, s * Y, -z]);
    quad([-s * x, -y, s * Z], [s * x, -y, s * Z], [s * x, y, s * Z], [-s * x, y, s * Z]);
  }
  // Edge strips and corners, built from the sign pattern so the winding is right by construction.
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      // Edge along Z between the ±X and ±Y faces.
      quad([sx * X, sy * y, -z], [sx * X, sy * y, z], [sx * x, sy * Y, z], [sx * x, sy * Y, -z]);
      // Edge along X between the ±Y and ±Z faces (sx plays ±Y, sy plays ±Z).
      quad([-x, sx * Y, sy * z], [x, sx * Y, sy * z], [x, sx * y, sy * Z], [-x, sx * y, sy * Z]);
      // Edge along Y between the ±Z and ±X faces (sx plays ±Z, sy plays ±X).
      quad([sy * x, -y, sx * Z], [sy * x, y, sx * Z], [sy * X, y, sx * z], [sy * X, -y, sx * z]);
      for (const sz of [1, -1]) tri([sx * X, sy * y, sz * z], [sx * x, sy * Y, sz * z], [sx * x, sy * y, sz * Z]);
    }
  }
  // Fix winding per triangle: the outward direction is the triangle centroid (convex, centred).
  const v = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    a.set(pos[i + 3] - pos[i], pos[i + 4] - pos[i + 1], pos[i + 5] - pos[i + 2]);
    b.set(pos[i + 6] - pos[i], pos[i + 7] - pos[i + 1], pos[i + 8] - pos[i + 2]);
    v.set(pos[i] + pos[i + 3] + pos[i + 6], pos[i + 1] + pos[i + 4] + pos[i + 7], pos[i + 2] + pos[i + 5] + pos[i + 8]);
    if (a.cross(b).dot(v) < 0) {
      for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
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
