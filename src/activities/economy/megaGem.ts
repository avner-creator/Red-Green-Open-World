/**
 * Mega gem model: a spiky star-burst (a faceted core with 6 long spikes along the axes and 8 short
 * ones on the diagonals). A normal gem is a smooth faceted diamond, so a child can tell them apart
 * by shape alone. Brightness only (grey vertex colours, used with a MeshBasicMaterial): the weak
 * eye sees the shading, the strong eye sees nothing because it lives on the weak-eye layer.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const AXES: readonly THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];
const DIAGONALS: readonly THREE.Vector3[] = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
  (DIAGONALS as THREE.Vector3[]).push(new THREE.Vector3(sx, sy, sz).normalize());
}

function spike(dir: THREE.Vector3, baseRadius: number, length: number, from: number): THREE.BufferGeometry {
  const cone = new THREE.ConeGeometry(baseRadius, length, 4, 1, true);
  cone.translate(0, length / 2, 0); // base at the origin, tip up +Y
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  cone.applyQuaternion(q);
  cone.translate(dir.x * from, dir.y * from, dir.z * from);
  const out = cone.toNonIndexed();
  out.deleteAttribute('normal');
  out.deleteAttribute('uv');
  return out;
}

/** Unit-ish size (tip to tip about 2.2); the caller scales it. */
export function buildMegaGemGeometry(): THREE.BufferGeometry {
  const core = new THREE.IcosahedronGeometry(0.42, 0); // polyhedra are already non-indexed
  core.deleteAttribute('normal');
  core.deleteAttribute('uv');
  const parts: THREE.BufferGeometry[] = [core];
  for (const d of AXES) parts.push(spike(d, 0.2, 0.7, 0.3));
  for (const d of DIAGONALS) parts.push(spike(d, 0.13, 0.4, 0.3));
  const geo = mergeGeometries(parts, false);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const light = new THREE.Vector3(0.4, 0.8, 0.45).normalize();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const centre = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    centre.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (n.dot(centre) < 0) n.negate(); // outward-facing for the shading
    const lit = Math.max(0, n.dot(light));
    // Tips are bright, the core and the spike roots darker: a clear "sun" shape from brightness alone.
    const tip = Math.min(1, centre.length() / 1.0);
    const grey = Math.min(1, Math.max(0.25, 0.3 + 0.45 * lit + 0.35 * tip * tip));
    for (let k = 0; k < 3; k++) colors.set([grey, grey, grey], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
