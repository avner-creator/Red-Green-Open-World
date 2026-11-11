/**
 * Geometric LOD for the terrain render mesh (pure; no WebGL). The (n+1)² grid is split into square
 * tiles; each tile can be drawn at a coarser step (every 2nd, 4th, 10th… sample). All tiles share
 * one vertex buffer and are concatenated into one index buffer, so the whole terrain is one draw.
 *
 * Steps are chosen per tile from a precomputed geometric error (max height difference between the
 * coarse surface and the full grid, weighted up on roads and pads) divided by the distance to the
 * camera: a screen-space error budget, so roads cut into slopes and cliffs stay detailed further out.
 * Where neighbouring tiles differ in step, both edges get a double-sided skirt that hangs a few metres
 * down (a second copy of the grid, lowered), so there are never cracks between tiles.
 *
 * Only the render mesh changes: the physics heightfield and `heightAt` keep the full grid.
 */

/** Steps a tile may use (all divide the tile size). */
export const LOD_STEPS = [1, 2, 4, 10] as const;
/** Step for tiles entirely under the (opaque) sea: two triangles. */
export const SEA_STEP = 20;

export interface LodGrid {
  /** Cells per side of the full grid. */
  n: number;
  /** Cells per tile side. */
  tile: number;
  /** Tiles per side. */
  tiles: number;
  /** Per tile: max geometric error (m) per entry of LOD_STEPS. */
  err: Float32Array[];
  /** Per tile: min / max height. */
  y0: Float32Array;
  y1: Float32Array;
  /** Per tile: true if every sample is under the sea surface (minus a margin). */
  sea: Uint8Array;
}

/**
 * Height of the coarse surface (step s, same b–c diagonal split as the full grid) at full-grid
 * sample (ix, iz) inside a coarse cell whose corner is (cx, cz).
 */
function coarseAt(H: ArrayLike<number>, N: number, s: number, cx: number, cz: number, ix: number, iz: number): number {
  const fx = (ix - cx) / s;
  const fz = (iz - cz) / s;
  const a = H[cz * N + cx];
  const b = H[cz * N + cx + s];
  const c = H[(cz + s) * N + cx];
  const d = H[(cz + s) * N + cx + s];
  // Triangles (a, c, b) and (b, c, d), split along b–c (fx + fz = 1).
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

/**
 * Precompute per-tile errors. `weight` (optional, per grid sample) scales the error at that sample
 * (roads and pads matter more: a coarse surface must not cover the road ribbon).
 */
export function buildLodGrid(heights: ArrayLike<number>, n: number, tile: number, weight?: ArrayLike<number>, seaLevel = -0.4): LodGrid {
  const N = n + 1;
  const tiles = Math.round(n / tile);
  const err: Float32Array[] = [];
  const y0 = new Float32Array(tiles * tiles);
  const y1 = new Float32Array(tiles * tiles);
  const sea = new Uint8Array(tiles * tiles);
  for (let tz = 0; tz < tiles; tz++) {
    for (let tx = 0; tx < tiles; tx++) {
      const ti = tz * tiles + tx;
      const e = new Float32Array(LOD_STEPS.length);
      let lo = Infinity;
      let hi = -Infinity;
      for (let iz = tz * tile; iz <= (tz + 1) * tile; iz++) {
        for (let ix = tx * tile; ix <= (tx + 1) * tile; ix++) {
          const h = heights[iz * N + ix];
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      }
      LOD_STEPS.forEach((s, si) => {
        if (s === 1) return;
        let m = 0;
        for (let iz = tz * tile; iz <= (tz + 1) * tile; iz++) {
          for (let ix = tx * tile; ix <= (tx + 1) * tile; ix++) {
            const cx = Math.min(tx * tile + Math.floor((ix - tx * tile) / s) * s, (tx + 1) * tile - s);
            const cz = Math.min(tz * tile + Math.floor((iz - tz * tile) / s) * s, (tz + 1) * tile - s);
            const i = iz * N + ix;
            const d = Math.abs(coarseAt(heights, N, s, cx, cz, ix, iz) - heights[i]) * (weight ? weight[i] : 1);
            if (d > m) m = d;
          }
        }
        e[si] = m;
      });
      err.push(e);
      y0[ti] = lo;
      y1[ti] = hi;
      sea[ti] = hi < seaLevel ? 1 : 0;
    }
  }
  return { n, tile, tiles, err, y0, y1, sea };
}

/**
 * Coarsest step whose error stays under `tau` × distance (and full detail within `fullWithin` m).
 * `prev` adds hysteresis: a tile only changes step when it is clearly past the threshold.
 */
export function pickStep(g: LodGrid, ti: number, dist: number, tau: number, fullWithin: number, prev = 0): number {
  if (g.sea[ti]) return SEA_STEP;
  if (dist < fullWithin) return 1;
  let best = 1;
  for (let si = LOD_STEPS.length - 1; si > 0; si--) {
    const s = LOD_STEPS[si];
    // Hysteresis: going coarser needs 10% headroom; staying at the current step tolerates 10% over.
    const k = s === prev ? 1.1 : 0.9;
    if (g.err[ti][si] <= tau * dist * k) {
      best = s;
      break;
    }
  }
  return best;
}

/** Edge bits for skirts: which tile edges border a neighbour drawn at another step. */
export const EDGE_W = 1;
export const EDGE_E = 2;
export const EDGE_N = 4; // −z
export const EDGE_S = 8; // +z

/**
 * Index list for one tile at step `s` with skirts on the edges in `mask`. Vertex i of the grid is
 * index i; its lowered skirt copy is index `skirtBase + i`.
 */
export function tileIndices(n: number, tile: number, tx: number, tz: number, s: number, mask: number, skirtBase: number): Uint32Array {
  const N = n + 1;
  const cells = tile / s;
  const skirtSegs = (mask & EDGE_W ? 1 : 0) + (mask & EDGE_E ? 1 : 0) + (mask & EDGE_N ? 1 : 0) + (mask & EDGE_S ? 1 : 0);
  const out = new Uint32Array(cells * cells * 6 + skirtSegs * cells * 12);
  let k = 0;
  const x0 = tx * tile;
  const z0 = tz * tile;
  for (let iz = z0; iz < z0 + tile; iz += s) {
    for (let ix = x0; ix < x0 + tile; ix += s) {
      const a = iz * N + ix;
      const b = a + s;
      const c = a + s * N;
      const d = c + s;
      out[k++] = a; out[k++] = c; out[k++] = b;
      out[k++] = b; out[k++] = c; out[k++] = d;
    }
  }
  const skirt = (ax: number, az: number, dx: number, dz: number): void => {
    for (let j = 0; j < cells; j++) {
      const p = (az + dz * j * s) * N + ax + dx * j * s;
      const q = (az + dz * (j + 1) * s) * N + ax + dx * (j + 1) * s;
      const P = skirtBase + p;
      const Q = skirtBase + q;
      // Both windings: the skirt may be seen from either tile.
      out[k++] = p; out[k++] = q; out[k++] = Q;
      out[k++] = p; out[k++] = Q; out[k++] = P;
      out[k++] = q; out[k++] = p; out[k++] = Q;
      out[k++] = Q; out[k++] = p; out[k++] = P;
    }
  };
  if (mask & EDGE_W) skirt(x0, z0, 0, 1);
  if (mask & EDGE_E) skirt(x0 + tile, z0, 0, 1);
  if (mask & EDGE_N) skirt(x0, z0, 1, 0);
  if (mask & EDGE_S) skirt(x0, z0 + tile, 1, 0);
  return out;
}
