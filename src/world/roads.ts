/**
 * Road and path ribbons laid on the terrain (crisp edges, tyre tracks, gravel shoulders), plus the
 * village lanes' dressing: stone kerbs, centre dashes, lamps, verge beds and landmark trees.
 */
import * as THREE from 'three';
import { T, type Batcher } from './batch';
import { lamp, type Kit } from './props';
import { shrubBed } from './core-areas';
import { anchorClearance, type ProcessedRoad } from './terrain';
import type { ManualTree } from './scatter';

type HeightFn = (x: number, z: number) => number;

interface Profile {
  /** Offsets across the road (metres from the centreline). */
  u: number[];
  colors: number[];
}

function profile(r: ProcessedRoad): Profile {
  const hw = r.def.width / 2;
  if (r.def.kerb) {
    return {
      u: [-hw - 1.0, -hw - 0.2, -hw, -hw + 0.6, 0, hw - 0.6, hw, hw + 0.2, hw + 1.0],
      colors: [0x9a9466, 0xa69a78, 0x625f5b, 0x6f6c67, 0x75726c, 0x6f6c67, 0x625f5b, 0xa69a78, 0x9a9466],
    };
  }
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

/** Village plaza: road ribbons stop at its paving edge. */
const PLAZA_C = { x: 0, z: -2, r: 20.9 };
const inPlaza = (x: number, z: number, m = 0): boolean => Math.hypot(x - PLAZA_C.x, z - PLAZA_C.z) < PLAZA_C.r + m;

export function buildRoads(b: Batcher, roads: readonly ProcessedRoad[], height: HeightFn): void {
  const c = new THREE.Color();
  roads.forEach((r, ri) => {
    const p = profile(r);
    const pts = resample(r.pts, 1.0).filter((q) => r.def.kind === 'street' || !inPlaza(q.x, q.z));
    if (pts.length < 2) return;
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

/** Distance from (x, z) to a road's centreline polyline. */
function distToRoad(r: ProcessedRoad, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < r.pts.length - 1; i++) {
    const a = r.pts[i];
    const b = r.pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

/**
 * Kerbs, centre dashes, lamps and verge planting along the kerbed lanes. `blocked` says where
 * nothing may stand (anchors, area forecourts). Returns landmark trees/bushes/rocks for the scatter.
 */
export function buildRoadDressing(k: Kit, roads: readonly ProcessedRoad[], blocked: (x: number, z: number) => boolean): ManualTree[] {
  const trees: ManualTree[] = [];
  const kerbPos: number[] = [];
  const dashes: [number, number, number][] = [];
  for (const r of roads) {
    if (!r.def.kerb) continue;
    const hw = r.def.width / 2;
    const others = roads.filter((o) => o !== r);
    const nearOther = (x: number, z: number, m: number): boolean => others.some((o) => distToRoad(o, x, z) < o.def.width / 2 + m);
    const pts = resample(r.pts, 1.0);
    const frame = (i: number): { x: number; z: number; nx: number; nz: number } => {
      const a = pts[Math.max(0, i - 1)];
      const bb = pts[Math.min(pts.length - 1, i + 1)];
      const tl = Math.hypot(bb.x - a.x, bb.z - a.z) || 1;
      return { x: pts[i].x, z: pts[i].z, nx: -(bb.z - a.z) / tl, nz: (bb.x - a.x) / tl };
    };
    // Kerbs: a low stone strip just outside each asphalt edge (inner face, top, outer face).
    const W = 0.3;
    const H = 0.15;
    for (const side of [-1, 1]) {
      for (let i = 0; i < pts.length - 1; i++) {
        const f0 = frame(i);
        const f1 = frame(i + 1);
        const ok = (f: typeof f0): boolean => {
          const x = f.x + f.nx * side * hw;
          const z = f.z + f.nz * side * hw;
          return !inPlaza(x, z, 0.6) && !nearOther(x, z, 0.8) && !blocked(x, z);
        };
        if (!ok(f0) || !ok(f1)) continue;
        const pt = (f: typeof f0, u: number, up: number): number[] => {
          const ex = f.x + f.nx * side * hw;
          const ez = f.z + f.nz * side * hw;
          return [f.x + f.nx * side * u, k.h(ex, ez) + 0.04 + up, f.z + f.nz * side * u];
        };
        const quad = (a0: number[], a1: number[], b0: number[], b1: number[]): void => {
          kerbPos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
        };
        const s0 = [pt(f0, hw, 0), pt(f0, hw, H), pt(f0, hw + W, H), pt(f0, hw + W, 0)];
        const s1 = [pt(f1, hw, 0), pt(f1, hw, H), pt(f1, hw + W, H), pt(f1, hw + W, 0)];
        // Winding flips with the side so faces point outwards on both kerbs.
        for (let q = 0; q < 3; q++) {
          if (side > 0) quad(s0[q], s0[q + 1], s1[q], s1[q + 1]);
          else quad(s0[q + 1], s0[q], s1[q + 1], s1[q]);
        }
      }
    }
    // Centre dashes: 1.5 m every 4 m.
    for (let i = 2; i < pts.length - 2; i += 4) {
      const f = frame(i);
      if (inPlaza(f.x, f.z, 1) || nearOther(f.x, f.z, 0.5) || blocked(f.x, f.z)) continue;
      dashes.push([f.x, f.z, Math.atan2(f.nz, -f.nx)]);
    }
    // Lamps every ~24 m on alternating sides; verge beds and landmark trees in between.
    let n = 0;
    for (let i = 6; i < pts.length - 4; i += 12) {
      const f = frame(i);
      const side = n % 2 === 0 ? 1 : -1;
      const even = Math.floor(n / 2) % 2 === 0;
      n++;
      const place = (off: number, pad: number): [number, number] | null => {
        const x = f.x + f.nx * side * off;
        const z = f.z + f.nz * side * off;
        if (inPlaza(x, z, pad) || nearOther(x, z, pad + 0.6) || anchorClearance(x, z) < pad || blocked(x, z)) return null;
        if (distToRoad(r, x, z) < off - 0.3) return null; // inside a bend
        return [x, z];
      };
      if (even) {
        const p = place(hw + 0.95, 1.5);
        if (p) lamp(k, p[0], p[1]);
      } else {
        const p = place(hw + 2.0, 1.5);
        if (p) shrubBed(k, p[0], p[1], 3.6, Math.atan2(f.nx, f.nz) + Math.PI / 2, 40 + n);
      }
      // Landmarks well back from the verge: trees, rock pairs with a bush, or a lone bush.
      if (r.def.landmarks === false) continue;
      const q = place(hw + 6.5 + (n % 3), 3);
      if (!q) continue;
      if (n % 2 === 0) trees.push({ x: q[0], z: q[1], kind: n % 6 === 0 ? 'pine' : 'oak', scale: 0.95 + (n % 4) * 0.08 });
      else if (n % 3 === 1) {
        trees.push(
          { x: q[0], z: q[1], kind: 'rock', scale: 1.3 },
          { x: q[0] + 1.6 * f.nz, z: q[1] - 1.6 * f.nx, kind: 'rock', scale: 0.55 },
          { x: q[0] - 1.8 * f.nz, z: q[1] + 1.8 * f.nx, kind: 'bush', scale: 1.1 },
        );
      } else trees.push({ x: q[0], z: q[1], kind: 'bush', scale: 1.2 });
    }
  }
  if (kerbPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(kerbPos, 3));
    g.computeVertexNormals();
    k.b.add('matte', g, 0xc9c1b1);
    g.dispose();
  }
  const dash = new THREE.PlaneGeometry(0.16, 1.5).rotateX(-Math.PI / 2);
  for (const [x, z, yaw] of dashes) k.b.add('road', dash, 0xf1ede2, T(x, k.h(x, z) + 0.12, z, yaw));
  dash.dispose();
  return trees;
}
