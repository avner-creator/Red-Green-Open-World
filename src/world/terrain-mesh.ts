/**
 * Render mesh for the heightfield (same grid and triangle split as the collider) with vertex
 * colours: grass / dry grass / sand / wet sand / rock / dirt under roads. Luminance differs between
 * these in both the R and G channels (sand and dirt are bright in both; grass is mid; rock is grey).
 */
import * as THREE from 'three';
import type { TerrainData } from './terrain';
import { sampleMask } from './terrain';
import { fbm, lerp, smoothstep } from './rng';
import { SEED } from './layout';
import { patch } from './materials';
import type { Quality } from '../types';
import { EDGE_E, EDGE_N, EDGE_S, EDGE_W, buildLodGrid, pickStep, tileIndices } from './terrain-lod';

type RGB = [number, number, number];
const lin = (hex: number): RGB => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const GRASS = lin(0x5d8a2c);
const GRASS_LUSH = lin(0x467a26);
const GRASS_DRY = lin(0x9a9a46);
const SAND = lin(0xe3cf9f);
const SAND_WET = lin(0xa89068);
const SEABED = lin(0x8c7f5c);
const ROCK = lin(0x8f867a);
const ROCK_DARK = lin(0x6b645c);
const DIRT = lin(0xb59a72);

const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export interface TerrainMesh {
  group: THREE.Group;
  colorAt(x: number, z: number, out: THREE.Color): THREE.Color;
  /** Pick tile steps and cull tiles for this camera (cheap; only re-selects after it moved/turned). */
  update(camera: THREE.Camera): void;
  setQuality(q: Quality): void;
  stats(): { triangles: number };
}

/** Cells per LOD tile (40 m). */
const TILE = 20;
/** How far skirts hang below the tile edges (m); more than any coarse tile's error on screen. */
const SKIRT_DROP = 8;
/**
 * Screen-space error budget (metres of height error per metre of distance) and the radius within
 * which tiles are always drawn at full detail.
 */
const LOD_Q: Record<Quality, { tau: number; full: number }> = {
  low: { tau: 0.016, full: 20 },
  medium: { tau: 0.007, full: 40 },
  high: { tau: 0.004, full: 60 },
};

/**
 * 0..1 per vertex: where farm plots may be painted. Open, gently sloped grass at least ~8 m from any
 * road and ~10 m from any pad (village, park, attractions), in a few broad noise-shaped regions.
 */
function fieldMask(t: TerrainData): Float32Array {
  const n = t.n;
  const N = n + 1;
  const dilate = (src: Float32Array, r: number): Float32Array => {
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    for (let iz = 0; iz <= n; iz++) {
      for (let ix = 0; ix <= n; ix++) {
        let m = 0;
        for (let k = Math.max(0, ix - r); k <= Math.min(n, ix + r); k++) m = Math.max(m, src[iz * N + k]);
        tmp[iz * N + ix] = m;
      }
    }
    for (let iz = 0; iz <= n; iz++) {
      for (let ix = 0; ix <= n; ix++) {
        let m = 0;
        for (let k = Math.max(0, iz - r); k <= Math.min(n, iz + r); k++) m = Math.max(m, tmp[k * N + ix]);
        out[iz * N + ix] = m;
      }
    }
    return out;
  };
  const road = dilate(t.roadMask, 4);
  const pad = dilate(t.padMask, 4);
  const out = new Float32Array(N * N);
  const half = t.size / 2;
  const H = t.heights;
  for (let iz = 0; iz <= n; iz++) {
    for (let ix = 0; ix <= n; ix++) {
      const i = iz * N + ix;
      const x = -half + ix * t.cell;
      const z = -half + iz * t.cell;
      const hl = H[iz * N + Math.max(0, ix - 1)];
      const hr = H[iz * N + Math.min(n, ix + 1)];
      const hd = H[Math.max(0, iz - 1) * N + ix];
      const hu = H[Math.min(n, iz + 1) * N + ix];
      const slope = Math.hypot(hr - hl, hu - hd) / (2 * t.cell);
      const region = smoothstep(-0.3, -0.1, fbm(x / 70, z / 70, 2, SEED + 41));
      const flat = 1 - smoothstep(0.4, 0.75, slope);
      const dry = smoothstep(3.5, 6, H[i]);
      out[i] = region * flat * dry * (1 - road[i]) * (1 - pad[i]);
    }
  }
  return out;
}

export function createTerrainMesh(t: TerrainData): TerrainMesh {
  const n = t.n;
  const N = n + 1;
  const H = t.heights;
  const pos = new Float32Array(N * N * 3);
  const nor = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  const half = t.size / 2;
  const v = new THREE.Vector3();
  for (let iz = 0; iz <= n; iz++) {
    for (let ix = 0; ix <= n; ix++) {
      const i = iz * N + ix;
      const x = -half + ix * t.cell;
      const z = -half + iz * t.cell;
      const h = H[i];
      pos[i * 3] = x;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = z;
      const hl = H[iz * N + Math.max(0, ix - 1)];
      const hr = H[iz * N + Math.min(n, ix + 1)];
      const hd = H[Math.max(0, iz - 1) * N + ix];
      const hu = H[Math.min(n, iz + 1) * N + ix];
      v.set(hl - hr, 2 * t.cell, hd - hu).normalize();
      nor[i * 3] = v.x;
      nor[i * 3 + 1] = v.y;
      nor[i * 3 + 2] = v.z;
      const slope = Math.hypot(hr - hl, hu - hd) / (2 * t.cell);

      const n1 = fbm(x / 38, z / 38, 3, SEED + 21);
      const n2 = fbm(x / 9, z / 9, 2, SEED + 22);
      let c: RGB = mix3(GRASS, GRASS_LUSH, smoothstep(-0.1, 0.4, n1));
      c = mix3(c, GRASS_DRY, smoothstep(0.15, 0.55, -n1 + n2 * 0.3) * 0.7);
      // Higher ground is a little sun-bleached.
      c = mix3(c, GRASS_DRY, smoothstep(22, 34, h) * 0.35);
      // Beach.
      const sandW = 1 - smoothstep(1.3, 2.6, h + n2 * 0.7);
      c = mix3(c, SAND, sandW);
      c = mix3(c, SAND_WET, 1 - smoothstep(-0.1, 0.45, h));
      c = mix3(c, SEABED, 1 - smoothstep(-1.5, -0.4, h));
      // Rock on steep slopes, with strata.
      const rockW = smoothstep(0.78, 1.2, slope + n2 * 0.15);
      const strata = 0.5 + 0.5 * Math.sin(h * 1.3 + n2 * 2.0);
      c = mix3(c, mix3(ROCK, ROCK_DARK, strata * 0.7), rockW);
      // Packed dirt under and beside roads (the road ribbon sits on top).
      const road = sampleMask(t, t.roadMask, x, z);
      c = mix3(c, DIRT, smoothstep(0.0, 0.6, road) * 0.85);
      // Slight darkening in hollows and at cliff feet: cheap ambient occlusion.
      const cav = Math.max(0, (hl + hr + hd + hu) / 4 - h);
      const ao = 1 - Math.min(0.35, cav * 0.25);
      col[i * 3] = c[0] * ao;
      col[i * 3 + 1] = c[1] * ao;
      col[i * 3 + 2] = c[2] * ao;
    }
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  patch(mat, 'rg-terrain', {
    vertexPre: 'attribute float aField; varying float vField;',
    vertex: 'vField = aField;',
    fragmentPre: /* glsl */ `
      varying float vField;
      // Triplanar value noise: no stretching on steep faces.
      float rgTri(vec3 p, vec3 w, float f) {
        return rgNoise(p.zy * f) * w.x + rgNoise(p.xz * f) * w.y + rgNoise(p.xy * f) * w.z;
      }`,
    afterNormal: /* glsl */ `
      {
        vec3 wN = inverseTransformDirection(normal, viewMatrix);
        vec3 bw = pow(abs(wN), vec3(4.0));
        bw /= (bw.x + bw.y + bw.z);
        vec3 p = vWorldPos;
        float fw = length(fwidth(p));
        float d1 = rgTri(p, bw, 0.21);
        float d2 = rgTri(p, bw, 1.9);
        float d3 = mix(rgTri(p, bw, 11.0), 0.5, smoothstep(0.05, 0.25, fw));
        diffuseColor.rgb *= 0.84 + 0.2 * d1 + 0.1 * d2 + 0.12 * (d3 - 0.5);
        // Break up flat green: broad lush/dry hue drift and small clover patches (grass only).
        float green = smoothstep(0.02, 0.12, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
        float drift = rgNoise(p.xz * 0.045) * 0.65 + rgNoise(p.xz * 0.17) * 0.35;
        vec3 dry = diffuseColor.rgb * vec3(1.18, 1.06, 0.78);
        vec3 lush = diffuseColor.rgb * vec3(0.86, 0.98, 0.9);
        vec3 tinted = mix(lush, dry, smoothstep(0.3, 0.75, drift));
        float clover = smoothstep(0.62, 0.78, rgNoise(p.xz * 0.6 + 17.0)) * (1.0 - smoothstep(0.1, 0.3, fw));
        tinted *= 1.0 - 0.12 * clover;
        diffuseColor.rgb = mix(diffuseColor.rgb, tinted, green);
        // Rock strata on real cliffs only (world-space height bands, broken up triplanar).
        float rk = smoothstep(0.72, 0.5, wN.y);
        float strata = 0.5 + 0.5 * sin(p.y * 2.1 + 3.0 * rgTri(p, bw, 0.12));
        float grain = rgTri(p, bw, 3.1);
        diffuseColor.rgb *= mix(1.0, 0.76 + 0.22 * strata + 0.12 * (grain - 0.5), rk);
        // Patchwork farmland on open flat ground away from roads and attractions: rotated plots of
        // meadow, hay, mown stripes and crop rows with darker hedge lines. Differs in brightness,
        // not just hue, so the diorama seen from the balloon reads in both colour channels.
        if (vField > 0.01) {
          vec2 q = mat2(0.94, -0.34, 0.34, 0.94) * p.xz;
          vec2 cs = vec2(34.0, 24.0);
          vec2 id = floor(q / cs);
          vec2 f = fract(q / cs) * cs;
          float hsh = rgHash(id + 3.7);
          float edge = min(min(f.x, cs.x - f.x), min(f.y, cs.y - f.y));
          float fwq = length(fwidth(q));
          vec3 c = diffuseColor.rgb;
          vec3 plot = c;
          if (hsh < 0.3) {
            plot = c * vec3(1.32, 1.18, 0.72);                                      // hay / dry pasture
          } else if (hsh < 0.55) {
            float st = step(0.5, fract(f.x / 3.2));                                 // mown stripes
            plot = c * mix(0.86, 1.12, mix(st, 0.5, smoothstep(0.3, 1.2, fwq)));
          } else if (hsh < 0.75) {
            float rw = smoothstep(0.3, 0.5, abs(fract(f.y / 1.4) - 0.5));          // crop rows
            plot = c * vec3(0.72, 0.84, 0.7) * mix(0.8, 1.06, mix(rw, 0.5, smoothstep(0.2, 0.8, fwq)));
          } else {
            plot = c * vec3(1.06, 1.04, 0.92);                                      // plain meadow
          }
          // Hedge rows along the plot edges.
          float hedge = 1.0 - smoothstep(0.6, 1.4 + fwq, edge);
          plot = mix(plot, c * vec3(0.55, 0.72, 0.5), hedge);
          diffuseColor.rgb = mix(c, plot, vField * green);
        }
      }`,
  });
  // One mesh, one draw: tiles pick a step by screen-space error each time the camera moves (see
  // terrain-lod.ts) and their index lists are concatenated into one dynamic index buffer.
  const NN = N * N;
  const posS = new Float32Array(NN * 6);
  posS.set(pos);
  for (let i = 0; i < NN; i++) {
    posS[(NN + i) * 3] = pos[i * 3];
    posS[(NN + i) * 3 + 1] = pos[i * 3 + 1] - SKIRT_DROP;
    posS[(NN + i) * 3 + 2] = pos[i * 3 + 2];
  }
  const twice = (a: Float32Array): Float32Array => {
    const o = new Float32Array(a.length * 2);
    o.set(a);
    o.set(a, a.length);
    return o;
  };
  const field = fieldMask(t);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posS, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(twice(nor), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(twice(col), 3));
  geo.setAttribute('aField', new THREE.BufferAttribute(twice(field), 1));
  // Roads and pads weigh more in the error: a coarse surface must not swallow the road ribbon.
  const weight = new Float32Array(NN);
  for (let i = 0; i < NN; i++) weight[i] = 1 + 3 * Math.min(1, t.roadMask[i] * 2) + 2 * t.padMask[i];
  const lod = buildLodGrid(H, n, TILE, weight);
  const TT = lod.tiles;
  const cap = n * n * 6 + TT * TT * 4 * TILE * 12;
  const indexA = new THREE.BufferAttribute(new Uint32Array(cap), 1);
  indexA.setUsage(THREE.DynamicDrawUsage);
  geo.setIndex(indexA);
  geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), half * 1.5);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain:lod';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  // Culled per tile in `update`.
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'terrain';
  group.add(mesh);

  const cache = new Map<number, Uint32Array>();
  const steps = new Int32Array(TT * TT);
  const visible = new Uint8Array(TT * TT);
  const keys = new Int32Array(TT * TT).fill(-1);
  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const lastPos = new THREE.Vector3(1e9, 0, 0);
  const lastDir = new THREE.Vector3();
  let quality: Quality = 'medium';
  let dirty = true;
  let triangles = 0;
  const tileSize = TILE * t.cell;

  const select = (): void => {
    const q = LOD_Q[quality];
    for (let tz = 0; tz < TT; tz++) {
      for (let tx = 0; tx < TT; tx++) {
        const ti = tz * TT + tx;
        const cx = -half + (tx + 0.5) * tileSize;
        const cz = -half + (tz + 0.5) * tileSize;
        const hs = tileSize / 2;
        const lo = lod.y0[ti];
        const hi = lod.y1[ti];
        sphere.center.set(cx, (lo + hi) / 2, cz);
        sphere.radius = Math.hypot(hs, hs, (hi - lo) / 2 + SKIRT_DROP / 2) + 2;
        visible[ti] = frustum.intersectsSphere(sphere) ? 1 : 0;
        // Distance from the camera to the tile's box.
        const dx = Math.max(0, Math.abs(camPos.x - cx) - hs);
        const dz = Math.max(0, Math.abs(camPos.z - cz) - hs);
        const dy = Math.max(0, camPos.y - hi, lo - camPos.y);
        steps[ti] = pickStep(lod, ti, Math.hypot(dx, dy, dz), q.tau, q.full, steps[ti]);
      }
    }
    let k = 0;
    let changed = false;
    for (let tz = 0; tz < TT; tz++) {
      for (let tx = 0; tx < TT; tx++) {
        const ti = tz * TT + tx;
        if (!visible[ti]) {
          if (keys[ti] !== -1) changed = true;
          keys[ti] = -1;
          continue;
        }
        const s = steps[ti];
        const other = (ox: number, oz: number): boolean => {
          if (ox < 0 || oz < 0 || ox >= TT || oz >= TT) return false;
          const oi = oz * TT + ox;
          return steps[oi] !== s;
        };
        const mask =
          (other(tx - 1, tz) ? EDGE_W : 0) | (other(tx + 1, tz) ? EDGE_E : 0) | (other(tx, tz - 1) ? EDGE_N : 0) | (other(tx, tz + 1) ? EDGE_S : 0);
        const key = (ti * 32 + s) * 16 + mask;
        if (keys[ti] !== key) changed = true;
        keys[ti] = key;
        let idx = cache.get(key);
        if (!idx) cache.set(key, (idx = tileIndices(n, TILE, tx, tz, s, mask, NN)));
        k += idx.length;
      }
    }
    if (!changed && !dirty) return;
    const arr = indexA.array as Uint32Array;
    k = 0;
    for (let ti = 0; ti < TT * TT; ti++) {
      if (keys[ti] === -1) continue;
      const idx = cache.get(keys[ti]) as Uint32Array;
      arr.set(idx, k);
      k += idx.length;
    }
    indexA.clearUpdateRanges();
    indexA.addUpdateRange(0, k);
    indexA.needsUpdate = true;
    geo.setDrawRange(0, k);
    triangles = k / 3;
  };

  const update = (camera: THREE.Camera): void => {
    camera.updateMatrixWorld();
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
    if (!dirty && camPos.distanceToSquared(lastPos) < 1 && camDir.dot(lastDir) > 0.9995) return;
    lastPos.copy(camPos);
    lastDir.copy(camDir);
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    select();
    dirty = false;
  };
  /** Base ground colour (before shader detail) at a point: grass tufts take it on so they blend in. */
  const colorAt = (x: number, z: number, out: THREE.Color): THREE.Color => {
    const gx = THREE.MathUtils.clamp((x + half) / t.cell, 0, n - 1e-6);
    const gz = THREE.MathUtils.clamp((z + half) / t.cell, 0, n - 1e-6);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const i = iz * N + ix;
    const w = [(1 - fx) * (1 - fz), fx * (1 - fz), (1 - fx) * fz, fx * fz];
    const ids = [i, i + 1, i + N, i + N + 1];
    let r = 0;
    let gg = 0;
    let bb = 0;
    for (let q = 0; q < 4; q++) {
      r += col[ids[q] * 3] * w[q];
      gg += col[ids[q] * 3 + 1] * w[q];
      bb += col[ids[q] * 3 + 2] * w[q];
    }
    return out.setRGB(r, gg, bb);
  };
  return {
    group,
    colorAt,
    update,
    setQuality(q) {
      quality = q;
      dirty = true;
    },
    stats: () => ({ triangles }),
  };
}
