/**
 * Dressing for the outer footpaths (the lighthouse path and the beach path): lantern posts on
 * alternating sides, low timber edging posts and verge shrubs, kept off gems, junctions and areas.
 * (The outer roads — west, south, ridge — use the shared kerb/lamp/verge dressing in roads.ts.)
 */
import { T } from '../batch';
import { C, lamp, type Kit } from '../props';
import { rbox } from '../shapes';
import { shrubBed } from '../core-areas';
import type { ProcessedRoad } from '../terrain';
import type { ManualTree } from '../scatter';

const PATHS = ['north', 'beach'];

export function dressPaths(k: Kit, roads: readonly ProcessedRoad[], blocked: (x: number, z: number) => boolean, roadEdge: (x: number, z: number) => number): ManualTree[] {
  const trees: ManualTree[] = [];
  for (const r of roads) {
    if (!PATHS.includes(r.def.id)) continue;
    const hw = r.def.width / 2;
    let acc = 0;
    let n = 0;
    let nextLamp = 8;
    let nextPost = 3;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i];
      const b = r.pts[i + 1];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      const ux = (b.x - a.x) / seg;
      const uz = (b.z - a.z) / seg;
      const nx = -uz;
      const nz = ux;
      const at = (d: number, off: number): [number, number] | null => {
        const t = (d - acc) / seg;
        const x = a.x + (b.x - a.x) * t + nx * off;
        const z = a.z + (b.z - a.z) * t + nz * off;
        // Must stand beside this path and clear of every other road and anything blocked.
        if (blocked(x, z) || roadEdge(x, z) < Math.abs(off) - hw - 0.4) return null;
        return [x, z];
      };
      while (acc + seg >= nextLamp) {
        const side = n % 2 ? 1 : -1;
        const p = at(nextLamp, side * (hw + 0.9));
        if (p) lamp(k, p[0], p[1]);
        const q = at(nextLamp + 6, -side * (hw + 1.9));
        if (q && n % 2 === 0) shrubBed(k, q[0], q[1], 3.0, Math.atan2(ux, uz) + Math.PI / 2, 60 + n);
        const t = at(nextLamp + 3, side * (hw + 6.5));
        if (t) trees.push({ x: t[0], z: t[1], kind: n % 3 === 0 ? 'rock' : 'bush', scale: n % 3 === 0 ? 0.9 : 1.1 });
        n++;
        nextLamp += 18;
      }
      while (acc + seg >= nextPost) {
        for (const s of [-1, 1]) {
          const p = at(nextPost, s * (hw + 0.35));
          if (!p) continue;
          const y = k.h(p[0], p[1]);
          k.b.add('paint', rbox(0.14, 0.55, 0.14, 0.03), C.woodDark, T(p[0], y - 0.05, p[1], Math.atan2(ux, uz)), { aoY: y, aoH: 0.3, ao: 0.3 });
        }
        nextPost += 3;
      }
      acc += seg;
    }
  }
  return trees;
}
