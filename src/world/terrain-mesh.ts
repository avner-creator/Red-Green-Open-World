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
}

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
  const pad = dilate(t.padMask, 5);
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
      const region = smoothstep(-0.05, 0.12, fbm(x / 70, z / 70, 2, SEED + 41));
      const flat = 1 - smoothstep(0.12, 0.3, slope);
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
  const posA = new THREE.BufferAttribute(pos, 3);
  const norA = new THREE.BufferAttribute(nor, 3);
  const colA = new THREE.BufferAttribute(col, 3);
  const fieldA = new THREE.BufferAttribute(fieldMask(t), 1);
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
            plot = c * vec3(0.8, 0.9, 0.76) * mix(0.82, 1.08, mix(rw, 0.5, smoothstep(0.2, 0.8, fwq)));
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
  // 4×4 tiles that share one set of vertex buffers, so the camera frustum culls what is behind.
  const TILES = 4;
  const per = n / TILES;
  const group = new THREE.Group();
  group.name = 'terrain';
  for (let tz = 0; tz < TILES; tz++) {
    for (let tx = 0; tx < TILES; tx++) {
      const idx = new Uint32Array(per * per * 6);
      let k = 0;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let iz = tz * per; iz < (tz + 1) * per; iz++) {
        for (let ix = tx * per; ix < (tx + 1) * per; ix++) {
          const a = iz * N + ix;
          const b = a + 1;
          const c = a + N;
          const d = c + 1;
          // Split along b–c, matching Rapier's heightfield triangles.
          idx[k++] = a; idx[k++] = c; idx[k++] = b;
          idx[k++] = b; idx[k++] = c; idx[k++] = d;
          y0 = Math.min(y0, H[a], H[d]);
          y1 = Math.max(y1, H[a], H[d]);
        }
      }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', posA);
      tg.setAttribute('normal', norA);
      tg.setAttribute('color', colA);
      tg.setAttribute('aField', fieldA);
      tg.setIndex(new THREE.BufferAttribute(idx, 1));
      const cx = -half + (tx + 0.5) * per * t.cell;
      const cz = -half + (tz + 0.5) * per * t.cell;
      const hs = (per * t.cell) / 2;
      tg.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, (y0 + y1) / 2, cz), Math.hypot(hs, hs, (y1 - y0) / 2 + 1));
      tg.boundingBox = new THREE.Box3(new THREE.Vector3(cx - hs, y0 - 1, cz - hs), new THREE.Vector3(cx + hs, y1 + 1, cz + hs));
      const mesh = new THREE.Mesh(tg, mat);
      mesh.name = `terrain:${tx},${tz}`;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }
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
  return { group, colorAt };
}
