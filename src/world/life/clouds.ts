/**
 * Drifting cloud shadows and the gentle gusty wind.
 *
 * Cloud shadows: a handful of soft cloud-shaped cards that only the sun's shadow camera sees (their
 * own layer), placed between the sun and the ground around the camera and drifting with the wind
 * the same way as the sky's cloud layer. Their depth pass is dithered with an ordered pattern in
 * shadow-map texels, so after PCF filtering they read as soft, partial shade (≈ 35 % at most), not
 * hard black patches. One draw in the shadow pass; nothing at all on Low (no shadow map).
 *
 * Wind: `U.wind` (shared uniform) scales the flutter of flags, bunting and awnings and the sway of
 * trees and grass, with slow deterministic gusts.
 */
import * as THREE from 'three';
import type { Quality } from '../../types';
import { GLSL_NOISE, U } from '../materials';
import { gust } from './math';

/** Layer only the sun's shadow camera renders. */
export const CLOUD_LAYER = 7;
const N = 6;
/** Wrap period of the cloud field around the camera (m), and the drift (m/s). */
const PERIOD = 220;
const DRIFT = { x: 2.2, z: 0.8 } as const;
/** Distance from the ground point towards the sun at which the card floats (inside the shadow box). */
const LIFT = 70;
const MAX_SHADE = 0.38;

export interface Clouds {
  object: THREE.Object3D;
  update(dt: number, cam: THREE.Vector3, sunDir: THREE.Vector3, heightAt: (x: number, z: number) => number): void;
  setQuality(q: Quality): void;
  readonly wind: number;
}

export function createClouds(sun: THREE.DirectionalLight | null): Clouds {
  const pos = new Float32Array(N * 4 * 3);
  const cloud = new Float32Array(N * 4 * 3);
  const index: number[] = [];
  const base: { x: number; z: number; size: number; stretch: number }[] = [];
  for (let i = 0; i < N; i++) {
    const a = i * 2.39996;
    const r = PERIOD * 0.42 * Math.sqrt((i + 0.5) / N);
    base.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, size: 22 + ((i * 37) % 13), stretch: 1.2 + ((i * 53) % 7) / 10 });
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    corners.forEach(([u, v], k) => cloud.set([u, v, i * 1.37], (i * 4 + k) * 3));
    const o = i * 4;
    index.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aCloud', new THREE.BufferAttribute(cloud, 3));
  geo.setIndex(index);

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aCloud;\nvarying vec3 vCloud;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloud = aCloud;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCloud;\n${GLSL_NOISE}`)
      .replace(
        'void main() {',
        /* glsl */ `void main() {
        {
          vec2 uv = vCloud.xy;
          float n = rgNoise(uv * 1.7 + vCloud.z * 5.3) * 0.65 + rgNoise(uv * 4.1 + vCloud.z * 2.1) * 0.35;
          float dens = smoothstep(1.0, 0.25, length(uv) + (n - 0.5) * 0.7) * ${MAX_SHADE.toFixed(2)};
          // 4x4 ordered dither in shadow-map texels: PCF turns it into partial shade.
          ivec2 p = ivec2(gl_FragCoord.xy) & 3;
          int bayer[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
          float th = (float(bayer[(p.y << 2) + p.x]) + 0.5) / 16.0;
          if (dens <= th) discard;
        }`,
      );
  };
  depth.customProgramCacheKey = () => 'rg-life-cloud-depth';

  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
  mesh.name = 'life-cloud-shadows';
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.layers.set(CLOUD_LAYER);
  sun?.shadow.camera.layers.enable(CLOUD_LAYER);

  let time = 0;
  let enabled = true;
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const c = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const wrap = (v: number, around: number): number => around + ((((v - around + PERIOD / 2) % PERIOD) + PERIOD) % PERIOD) - PERIOD / 2;
  const api: Clouds = {
    object: mesh,
    wind: 1,
    setQuality(q) {
      enabled = q !== 'low';
      mesh.visible = enabled && sun !== null;
    },
    update(dt, cam, sunDir, heightAt) {
      time += dt;
      (api as { wind: number }).wind = gust(time);
      U.wind.value = api.wind;
      if (!enabled || !sun) return;
      // Card plane faces the sun.
      right.crossVectors(Y, sunDir);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      up.crossVectors(sunDir, right).normalize();
      for (let i = 0; i < N; i++) {
        const b = base[i];
        const gx = wrap(b.x + DRIFT.x * time, cam.x);
        const gz = wrap(b.z + DRIFT.z * time, cam.z);
        c.set(gx, Math.max(heightAt(gx, gz), 0), gz).addScaledVector(sunDir, LIFT);
        // Fade the size in/out near the wrap edges so clouds never pop.
        const edge = Math.max(Math.abs(gx - cam.x), Math.abs(gz - cam.z)) / (PERIOD / 2);
        const s = b.size * (1 - THREE.MathUtils.smoothstep(edge, 0.8, 1));
        for (let j = 0; j < 4; j++) {
          const u = j === 1 || j === 2 ? 1 : -1;
          const v = j >= 2 ? 1 : -1;
          const o = (i * 4 + j) * 3;
          pos[o] = c.x + right.x * u * s * b.stretch + up.x * v * s;
          pos[o + 1] = c.y + right.y * u * s * b.stretch + up.y * v * s;
          pos[o + 2] = c.z + right.z * u * s * b.stretch + up.z * v * s;
        }
      }
      posAttr.needsUpdate = true;
    },
  };
  return api;
}
