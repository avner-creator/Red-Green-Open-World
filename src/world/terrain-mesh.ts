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

export function createTerrainMesh(t: TerrainData): THREE.Mesh {
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
  const idx = new Uint32Array(n * n * 6);
  let k = 0;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const a = iz * N + ix;
      const b = a + 1;
      const c = a + N;
      const d = c + 1;
      // Split along b–c, matching Rapier's heightfield triangles.
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  patch(mat, 'rg-terrain', {
    fragment: /* glsl */ `
      float fw = fwidth(vWorldPos.x) + fwidth(vWorldPos.z);
      float d1 = rgNoise(vWorldPos.xz * 0.21);
      float d2 = rgNoise(vWorldPos.xz * 1.9);
      float d3 = mix(rgNoise(vWorldPos.xz * 11.0), 0.5, smoothstep(0.05, 0.25, fw));
      diffuseColor.rgb *= 0.84 + 0.2 * d1 + 0.1 * d2 + 0.12 * (d3 - 0.5);`,
    // Rock strata and streaks on steep faces (world-space normal).
    afterNormal: /* glsl */ `
      {
        vec3 wN = inverseTransformDirection(normal, viewMatrix);
        float rk = smoothstep(0.82, 0.55, wN.y);
        float along = dot(vWorldPos.xz, normalize(vec2(-wN.z, wN.x) + 1e-4));
        float strata = rgNoise(vec2(vWorldPos.y * 1.6, along * 0.12));
        float streak = rgNoise(vec2(along * 0.9, vWorldPos.y * 0.08));
        diffuseColor.rgb *= mix(1.0, 0.72 + 0.28 * strata + 0.18 * (streak - 0.5), rk);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
