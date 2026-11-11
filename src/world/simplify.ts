/**
 * Cheap low-poly stand-ins: vertex clustering on a grid. Every vertex snaps to its grid cell's
 * representative (the first vertex seen in that cell, all attributes copied from it); triangles that
 * collapse are dropped. O(n), no allocation per vertex beyond the output, crude but fine for big
 * attraction shells seen from tens of metres away on the Low preset (`far-lod.ts`).
 */
import * as THREE from 'three';

/**
 * Stand-in for `geo` with grid cells of `cell` metres (geometry space). Returns null when the result
 * would not save at least a third of the triangles (not worth a swap).
 */
export function clusterSimplify(geo: THREE.BufferGeometry, cell: number): THREE.BufferGeometry | null {
  const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos || geo.morphAttributes.position) return null;
  const index = geo.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  if (triCount < 3) return null;
  // Representative vertex of each vertex's cell.
  const rep = new Int32Array(pos.count);
  const cells = new Map<string, number>();
  const inv = 1 / cell;
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.floor(pos.getX(i) * inv)},${Math.floor(pos.getY(i) * inv)},${Math.floor(pos.getZ(i) * inv)}`;
    let r = cells.get(key);
    if (r === undefined) cells.set(key, (r = i));
    rep[i] = r;
  }
  // Compact the representatives into a new vertex list.
  const remap = new Int32Array(pos.count).fill(-1);
  let nv = 0;
  const tris: number[] = [];
  const seen = new Set<string>();
  // Material groups keep their own (re-counted) index ranges.
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: triCount * 3, materialIndex: 0 }];
  const outGroups: { start: number; count: number; materialIndex: number }[] = [];
  for (const grp of groups) {
    const gStart = tris.length;
    const t1 = Math.min(triCount, Math.floor((grp.start + grp.count) / 3));
    for (let t = Math.floor(grp.start / 3); t < t1; t++) {
      const a = rep[index ? index.getX(t * 3) : t * 3];
      const b = rep[index ? index.getX(t * 3 + 1) : t * 3 + 1];
      const c = rep[index ? index.getX(t * 3 + 2) : t * 3 + 2];
      if (a === b || b === c || a === c) continue;
      // Drop exact duplicates (same three corners, same winding).
      const m = Math.min(a, b, c);
      const k = m === a ? `${a},${b},${c}` : m === b ? `${b},${c},${a}` : `${c},${a},${b}`;
      if (seen.has(k)) continue;
      seen.add(k);
      for (const v of [a, b, c]) {
        if (remap[v] < 0) remap[v] = nv++;
        tris.push(remap[v]);
      }
    }
    outGroups.push({
      start: gStart,
      count: tris.length - gStart,
      materialIndex: grp.materialIndex ?? 0,
    });
  }
  if (tris.length / 3 > triCount * 0.67) return null;
  const out = new THREE.BufferGeometry();
  const order = new Int32Array(nv);
  for (let i = 0; i < pos.count; i++) if (remap[i] >= 0) order[remap[i]] = i;
  for (const [name, attr] of Object.entries(geo.attributes) as [string, THREE.BufferAttribute | THREE.InterleavedBufferAttribute][]) {
    const size = attr.itemSize;
    const Arr = (attr.array as Float32Array).constructor as new (n: number) => Float32Array;
    const arr = new Arr(nv * size);
    for (let j = 0; j < nv; j++) for (let s = 0; s < size; s++) arr[j * size + s] = attr.getComponent(order[j], s);
    out.setAttribute(name, new THREE.BufferAttribute(arr, size, attr.normalized));
  }
  out.setIndex(tris);
  if (geo.groups.length) for (const g of outGroups) out.addGroup(g.start, g.count, g.materialIndex);
  out.boundingSphere = geo.boundingSphere?.clone() ?? null;
  out.boundingBox = geo.boundingBox?.clone() ?? null;
  return out;
}
