/**
 * Island heightfield (pure, no WebGL). The same grid feeds the render mesh, the Rapier heightfield
 * and `heightAt`, which interpolates on the same two triangles per cell as the collider.
 */
import { ANCHORS, BAY, CANYON, CELL, GRID, PADS, RIDGE_Y, ROADS, SEED, SIZE } from './layout';
import type { PadDef, RoadDef } from './layout';
import { clamp, fbm, lerp, smoothstep } from './rng';

export interface RoadPoint {
  x: number;
  z: number;
  h: number;
}

export interface ProcessedRoad {
  def: RoadDef;
  /** Densified centreline with final heights. */
  pts: RoadPoint[];
}

export interface TerrainData {
  n: number;
  size: number;
  cell: number;
  /** Row-major [z][x], (n+1)². */
  heights: Float32Array;
  /** 0..1 how much each sample is road surface. */
  roadMask: Float32Array;
  /** 0..1 how much each sample is inside a flat pad that should stay clear. */
  padMask: Float32Array;
  roads: ProcessedRoad[];
}

const HALF = SIZE / 2;

/** Distance from the origin to the coastline in the direction of (x, z). */
export function coastRadius(x: number, z: number): number {
  const a = Math.atan2(z, x);
  return 161 + 6 * Math.sin(3 * a + 1.1) + 4 * Math.sin(5 * a + 2.3) + 6 * fbm(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 3, SEED + 5);
}

function gauss(x: number, z: number, cx: number, cz: number, s: number): number {
  const dx = x - cx;
  const dz = z - cz;
  return Math.exp(-(dx * dx + dz * dz) / (2 * s * s));
}

/** Natural terrain before roads/pads. */
export function baseHeight(x: number, z: number): number {
  const d = coastRadius(x, z) - Math.hypot(x, z);
  let h: number;
  if (d >= 0) {
    const hills = 4.2 * fbm(x / 85, z / 85, 4, SEED) + 0.7 * fbm(x / 16, z / 16, 2, SEED + 7);
    h = 1.1 * smoothstep(0, 9, d) + 16.5 * smoothstep(10, 95, d) + hills * smoothstep(12, 50, d);
    h += 7 * gauss(x, z, -50, -28, 15) + 9 * gauss(x, z, 118, -52, 22) + 5 * gauss(x, z, -40, 70, 18);
  } else {
    h = d > -12 ? d * 0.12 : -1.44 + (d + 12) * 0.9;
  }
  // Northern ridge plateau with cliffs to the sea.
  const rm = smoothstep(-58, -84, z) * smoothstep(2, 24, d);
  h = lerp(h, RIDGE_Y + 1.4 * fbm(x / 40, z / 40, 3, SEED + 11), rm);
  // Bay: a gentle bowl that opens to the sea in the west.
  const db = Math.hypot(x - BAY.x, z - BAY.z);
  const p = BAY.depth + Math.max(0, db - BAY.inner) * 0.28 + Math.max(0, db - BAY.inner - 28) * 0.55;
  h = Math.min(h, p);
  // Canyon, carved east–west through the ridge, its floor sloping down into the bay.
  const cx = clamp(x, CANYON.x0, CANYON.x1);
  const dc = Math.hypot(x - cx, z - CANYON.z) + 1.6 * fbm(x / 9, z / 9, 2, SEED + 3);
  const floor = lerp(CANYON.floorWest, CANYON.floorEast, clamp((x - CANYON.x0) / (CANYON.x1 - CANYON.x0), 0, 1));
  const cm = 1 - smoothstep(CANYON.floorHalf, CANYON.topHalf, dc);
  if (h > floor) h -= (h - floor) * cm;
  return Math.max(h, -30);
}

function padOutside(p: PadDef, x: number, z: number): number {
  if (p.shape === 'circle') return Math.max(0, Math.hypot(x - p.x, z - p.z) - (p.r ?? 0));
  const ox = Math.max(0, Math.abs(x - p.x) - (p.hx ?? 0));
  const oz = Math.max(0, Math.abs(z - p.z) - (p.hz ?? 0));
  return Math.hypot(ox, oz);
}

const FALLOFF: Record<RoadDef['kind'], number> = { street: 5, road: 7, path: 4 };

/** Grid-bilinear sample used only while building (before the final grid exists). */
function gridSample(h: Float32Array, x: number, z: number): number {
  const n = GRID;
  const gx = clamp((x + HALF) / CELL, 0, n - 1e-6);
  const gz = clamp((z + HALF) / CELL, 0, n - 1e-6);
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const i = iz * (n + 1) + ix;
  return lerp(lerp(h[i], h[i + 1], fx), lerp(h[i + n + 1], h[i + n + 2], fx), fz);
}

function densify(def: RoadDef, h: Float32Array): RoadPoint[] {
  const pts: RoadPoint[] = [];
  const fixed: boolean[] = [];
  for (let s = 0; s < def.points.length - 1; s++) {
    const a = def.points[s];
    const b = def.points[s + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(len / 3));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const x = lerp(a[0], b[0], t);
      const z = lerp(a[1], b[1], t);
      const fa = a.length === 3 && k === 0;
      pts.push({ x, z, h: fa ? (a as readonly number[])[2] : gridSample(h, x, z) });
      fixed.push(fa);
    }
  }
  const last = def.points[def.points.length - 1];
  pts.push({ x: last[0], z: last[1], h: last.length === 3 ? (last as readonly number[])[2] : gridSample(h, last[0], last[1]) });
  fixed.push(last.length === 3);
  // Smooth the profile so the road has gentle grades; pinned points stay put.
  for (let it = 0; it < 60; it++) {
    for (let i = 1; i < pts.length - 1; i++) {
      if (!fixed[i]) pts[i].h = 0.5 * pts[i].h + 0.25 * (pts[i - 1].h + pts[i + 1].h);
    }
  }
  return pts;
}

export function buildTerrain(): TerrainData {
  const n = GRID;
  const count = (n + 1) * (n + 1);
  const heights = new Float32Array(count);
  const roadMask = new Float32Array(count);
  const padMask = new Float32Array(count);
  const xs = (i: number): number => -HALF + i * CELL;
  for (let iz = 0; iz <= n; iz++) for (let ix = 0; ix <= n; ix++) heights[iz * (n + 1) + ix] = baseHeight(xs(ix), xs(iz));

  // 1) Pads with soft falloff.
  const padTargets = PADS.map((p) => p.y ?? gridSample(heights, p.x, p.z));
  for (let iz = 0; iz <= n; iz++) {
    for (let ix = 0; ix <= n; ix++) {
      const i = iz * (n + 1) + ix;
      const x = xs(ix);
      const z = xs(iz);
      PADS.forEach((p, k) => {
        const out = padOutside(p, x, z);
        if (out > p.falloff) return;
        const w = 1 - smoothstep(0, p.falloff, out);
        heights[i] = lerp(heights[i], padTargets[k], w);
        if (p.clear !== false) padMask[i] = Math.max(padMask[i], 1 - smoothstep(0, 3, out));
      });
    }
  }

  // 2) Roads: smooth profile, flatten across the width, blend the shoulders.
  const roads: ProcessedRoad[] = ROADS.map((def) => ({ def, pts: densify(def, heights) }));
  const bestW = new Float32Array(count);
  const bestH = new Float32Array(count);
  for (const road of roads) {
    const hw = road.def.width / 2;
    const fo = FALLOFF[road.def.kind];
    const reach = hw + fo;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of road.pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const ix0 = Math.max(0, Math.floor((minX - reach + HALF) / CELL));
    const ix1 = Math.min(n, Math.ceil((maxX + reach + HALF) / CELL));
    const iz0 = Math.max(0, Math.floor((minZ - reach + HALF) / CELL));
    const iz1 = Math.min(n, Math.ceil((maxZ + reach + HALF) / CELL));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = xs(ix);
        const z = xs(iz);
        let best = Infinity;
        let bh = 0;
        for (let s = 0; s < road.pts.length - 1; s++) {
          const a = road.pts[s];
          const b = road.pts[s + 1];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const l2 = dx * dx + dz * dz || 1;
          const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
          const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
          if (d < best) {
            best = d;
            bh = lerp(a.h, b.h, t);
          }
        }
        if (best > reach) continue;
        const i = iz * (n + 1) + ix;
        const w = 1 - smoothstep(hw, reach, best);
        if (w > bestW[i]) {
          bestW[i] = w;
          bestH[i] = bh;
        }
        roadMask[i] = Math.max(roadMask[i], 1 - smoothstep(hw - 0.5, hw + 1.2, best));
      }
    }
  }
  for (let i = 0; i < count; i++) if (bestW[i] > 0) heights[i] = lerp(heights[i], bestH[i], bestW[i]);

  // 3) Pads again, hard inside their shape, so every anchor stands on perfectly flat ground.
  for (let iz = 0; iz <= n; iz++) {
    for (let ix = 0; ix <= n; ix++) {
      const x = xs(ix);
      const z = xs(iz);
      PADS.forEach((p, k) => {
        if (padOutside(p, x, z) <= CELL * 0.5) heights[iz * (n + 1) + ix] = padTargets[k];
      });
    }
  }
  return { n, size: SIZE, cell: CELL, heights, roadMask, padMask, roads };
}

/**
 * Height on the terrain surface. Each cell is split along the (x1,z0)–(x0,z1) diagonal, exactly like
 * Rapier's heightfield, so `heightAt` matches the collider (verified in tests/world).
 */
export function sampleHeight(t: TerrainData, x: number, z: number): number {
  const n = t.n;
  const gx = (x + t.size / 2) / t.cell;
  const gz = (z + t.size / 2) / t.cell;
  if (gx < 0 || gz < 0 || gx > n || gz > n) return -30;
  const ix = Math.min(Math.floor(gx), n - 1);
  const iz = Math.min(Math.floor(gz), n - 1);
  const fx = gx - ix;
  const fz = gz - iz;
  const i = iz * (n + 1) + ix;
  const H = t.heights;
  const h00 = H[i];
  const h10 = H[i + 1];
  const h01 = H[i + n + 1];
  const h11 = H[i + n + 2];
  if (fx + fz <= 1) return h00 + fx * (h10 - h00) + fz * (h01 - h00);
  return h11 + (1 - fx) * (h01 - h11) + (1 - fz) * (h10 - h11);
}

/** Bilinear lookup of a per-sample mask. */
export function sampleMask(t: TerrainData, mask: Float32Array, x: number, z: number): number {
  const n = t.n;
  const gx = clamp((x + t.size / 2) / t.cell, 0, n - 1e-6);
  const gz = clamp((z + t.size / 2) / t.cell, 0, n - 1e-6);
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const i = iz * (n + 1) + ix;
  return lerp(lerp(mask[i], mask[i + 1], fx), lerp(mask[i + n + 1], mask[i + n + 2], fx), fz);
}

/** Steepness 0 (flat) .. 1+ (cliff): gradient magnitude. */
export function slopeAt(t: TerrainData, x: number, z: number): number {
  const e = t.cell * 0.5;
  const dx = sampleHeight(t, x + e, z) - sampleHeight(t, x - e, z);
  const dz = sampleHeight(t, x, z + e) - sampleHeight(t, x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/** Minimum distance from (x,z) to any anchor's clear circle edge (negative = inside one). */
export function anchorClearance(x: number, z: number): number {
  let best = Infinity;
  for (const a of Object.values(ANCHORS)) best = Math.min(best, Math.hypot(x - a.x, z - a.z) - a.radius);
  return best;
}
