/** Road and path ribbons laid on the terrain (crisp edges, tyre tracks, gravel shoulders). */
import * as THREE from 'three';
import type { Batcher } from './batch';
import type { ProcessedRoad } from './terrain';

type HeightFn = (x: number, z: number) => number;

interface Profile {
  /** Offsets across the road (metres from the centreline). */
  u: number[];
  colors: number[];
}

function profile(r: ProcessedRoad): Profile {
  const hw = r.def.width / 2;
  if (r.def.kind === 'path') {
    return { u: [-hw - 0.5, -hw + 0.3, 0, hw - 0.3, hw + 0.5], colors: [0xb59a72, 0xcbb68c, 0xd8c69e, 0xcbb68c, 0xb59a72] };
  }
  if (r.def.kind === 'street') {
    return { u: [-hw, -hw + 0.4, hw - 0.4, hw], colors: [0x8f897f, 0xb7ae9f, 0xb7ae9f, 0x8f897f] };
  }
  return {
    u: [-hw - 0.7, -hw, -hw + 0.5, -1.9, -1.25, 0, 1.25, 1.9, hw - 0.5, hw, hw + 0.7],
    colors: [0xb59a72, 0xa69173, 0xd3c09a, 0xd8c7a2, 0xb7a17b, 0xdccbaa, 0xb7a17b, 0xd8c7a2, 0xd3c09a, 0xa69173, 0xb59a72],
  };
}

/** Resample a polyline every `step` metres (keeps the original corners). */
function resample(src: readonly { x: number; z: number }[], step: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < src.length - 1; i++) {
    const a = src[i];
    const b = src[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  out.push(src[src.length - 1]);
  return out;
}

export function buildRoads(b: Batcher, roads: readonly ProcessedRoad[], height: HeightFn): void {
  const c = new THREE.Color();
  roads.forEach((r, ri) => {
    const p = profile(r);
    const pts = resample(r.pts, 1.0);
    const m = p.u.length;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const lift = 0.08 + ri * 0.006;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const bb = pts[Math.min(pts.length - 1, i + 1)];
      let tx = bb.x - a.x;
      let tz = bb.z - a.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      // Miter: widen at bends, but never more than 1.6×.
      let miter = 1;
      if (i > 0 && i < pts.length - 1) {
        const dx = pts[i].x - a.x;
        const dz = pts[i].z - a.z;
        const dl = Math.hypot(dx, dz) || 1;
        const cos = (dx / dl) * tx + (dz / dl) * tz;
        miter = Math.min(1.6, 1 / Math.max(0.3, cos));
      }
      const nx = -tz;
      const nz = tx;
      for (let k = 0; k < m; k++) {
        const x = pts[i].x + nx * p.u[k] * miter;
        const z = pts[i].z + nz * p.u[k] * miter;
        pos.push(x, height(x, z) + lift, z);
        c.set(p.colors[k]);
        col.push(c.r, c.g, c.b);
      }
      if (i > 0) {
        const o = (i - 1) * m;
        for (let k = 0; k < m - 1; k++) {
          const a0 = o + k;
          const a1 = o + k + 1;
          const b0 = o + m + k;
          const b1 = o + m + k + 1;
          idx.push(a0, a1, b0, a1, b1, b0);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Make sure all faces point up (winding depends on the profile direction).
    const nrm = g.attributes.normal;
    if (nrm.getY(0) < 0) {
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    b.add(r.def.kind === 'street' ? 'paving' : 'road', g, 0xffffff);
    g.dispose();
  });
}
