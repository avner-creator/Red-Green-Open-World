/**
 * Geometry helpers: bake colour (and fake lighting) into vertex colours so a whole prop merges into
 * one or two draw calls, and shapes read from brightness alone (needed for the layer objects).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type VertexPainter = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => THREE.Color;

/** Plain, non-indexed, uv-less copy with a normal attribute (so parts can be merged). */
export function prep(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  g.deleteAttribute('uv1');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

/** Colour every vertex with `paint` (vertex colours are linear). */
export function paint(geo: THREE.BufferGeometry, painter: THREE.ColorRepresentation | VertexPainter): THREE.BufferGeometry {
  const g = prep(geo);
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  const fixed = typeof painter === 'function' ? null : new THREE.Color(painter);
  for (let i = 0; i < pos.count; i++) {
    const c = fixed ?? (painter as VertexPainter)(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Apply a transform and return the same geometry (chainable). */
export function placed(geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  if (rz) geo.rotateZ(rz);
  return geo.translate(x, y, z);
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts.map(prep), false);
  if (!geo) throw new Error('chest geometry merge failed');
  return geo;
}

/** Cheap baked "AO": darker near the ground, plus a soft top light. `h` is the height scale. */
export function groundShade(y: number, h = 0.35): number {
  const t = Math.min(1, Math.max(0, y / h));
  return 0.62 + 0.38 * (t * t * (3 - 2 * t));
}

const LIGHT = new THREE.Vector3(0.45, 0.8, 0.4).normalize();

/** Lambert-style grey for layer objects: `ambient + (1-ambient) * n.l`, scaled by `base`. */
export function shadeGrey(geo: THREE.BufferGeometry, base = 1, ambient = 0.45, facet?: (nx: number, ny: number, nz: number) => number): THREE.BufferGeometry {
  return paint(geo, (_x, _y, _z, nx, ny, nz) => {
    const d = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
    const g = Math.min(1, Math.max(0, (ambient + (1 - ambient) * d + (facet ? facet(nx, ny, nz) : 0)) * base));
    return new THREE.Color(g, g, g);
  });
}

/** sRGB hex with a lightness nudge (for plank and facet variation). */
export function tone(hex: number, dl = 0, ds = 0): THREE.Color {
  const c = new THREE.Color(hex);
  if (dl || ds) c.offsetHSL(0, ds, dl);
  return c;
}

/** Deterministic 0..1 noise from a number (stable plank-to-plank variation). */
export function noise(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
