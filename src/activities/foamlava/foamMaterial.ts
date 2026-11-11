/**
 * The foam "lava": a lit MeshStandardMaterial patched with a slowly churning bubble pattern
 * (two layers of moving cell noise), gentle swell in the vertices and expanding splash rings.
 * Both-eye and brightness-readable: bright pink-white foam with darker bubble rims, so it reads in
 * the R channel and the G channel alone, and the dark platforms stand out against it.
 */
import * as THREE from 'three';

export const MAX_RIPPLES = 4;

export interface FoamUniforms {
  time: { value: number };
  /** xy = course-frame x,z of a splash; z = age (s); w = strength (0 = unused). */
  ripples: { value: THREE.Vector4[] };
}

export function createFoamMaterial(): { material: THREE.MeshStandardMaterial; uniforms: FoamUniforms } {
  const uniforms: FoamUniforms = {
    time: { value: 0 },
    ripples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 99, 0)) },
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0 });
  material.name = 'FoamLava';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fTime = uniforms.time;
    shader.uniforms.fRipples = uniforms.ripples;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float fTime;
        uniform vec4 fRipples[${MAX_RIPPLES}];
        varying vec2 vFoamXZ;
        float foamSwell(vec2 p) {
          float h = sin(p.x * 0.9 + fTime * 1.3) * 0.03 + sin(p.y * 0.7 - fTime * 1.1) * 0.035 + sin((p.x + p.y) * 1.7 + fTime * 2.1) * 0.015;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 r = fRipples[i];
            float d = length(p - r.xy);
            float front = r.z * 3.2;
            h += r.w * 0.12 * exp(-r.z * 1.6) * exp(-pow((d - front) * 2.2, 2.0));
          }
          return h;
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFoamXZ = position.xz;
        transformed.y += foamSwell(position.xz);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float fTime;
        uniform vec4 fRipples[${MAX_RIPPLES}];
        varying vec2 vFoamXZ;
        vec2 fHash(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return fract(sin(p) * 43758.5453);
        }
        // Distance to the nearest cell centre and to the cell edge (bubbles).
        vec2 fCells(vec2 p, float t) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float d1 = 8.0;
          float d2 = 8.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 g = vec2(float(x), float(y));
              vec2 o = fHash(i + g);
              o = 0.5 + 0.4 * sin(t + 6.2831 * o);
              float d = length(g + o - f);
              if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
            }
          }
          return vec2(d1, d2 - d1);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 fp = vFoamXZ;
        vec2 flow = vec2(sin(fTime * 0.21) * 0.5, fTime * 0.16);
        // Soft billows (big clumps of foam) from layered value noise.
        float bill = 0.0;
        float amp = 0.55;
        vec2 q = fp * 0.32 + flow * 0.4;
        for (int o = 0; o < 3; o++) {
          vec2 i = floor(q);
          vec2 f = fract(q);
          f = f * f * (3.0 - 2.0 * f);
          float a = fHash(i).x;
          float b = fHash(i + vec2(1.0, 0.0)).x;
          float c = fHash(i + vec2(0.0, 1.0)).x;
          float d = fHash(i + vec2(1.0, 1.0)).x;
          bill += amp * mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          q = q * 2.07 + vec2(1.7, 9.2);
          amp *= 0.5;
        }
        // Three sizes of bubbles; rims are thin and only a little darker than the foam.
        vec2 b1 = fCells(fp * 1.6 + flow, fTime * 0.5);
        vec2 b2 = fCells(fp * 3.7 - flow * 1.6, fTime * 0.8);
        vec2 b3 = fCells(fp * 8.0 + flow * 2.3, fTime * 1.1);
        float rim1 = 1.0 - smoothstep(0.015, 0.06, b1.y);
        float rim2 = 1.0 - smoothstep(0.012, 0.05, b2.y);
        float rim3 = 1.0 - smoothstep(0.01, 0.045, b3.y);
        // A soft highlight in the middle of the bigger bubbles.
        float shine = smoothstep(0.2, 0.04, b1.x) * 0.8 + smoothstep(0.12, 0.02, b2.x) * 0.4;
        vec3 foamBase = vec3(1.0, 0.9, 0.86);
        vec3 peach = vec3(1.0, 0.72, 0.62);
        vec3 shadowCol = vec3(0.9, 0.66, 0.66);
        vec3 c = mix(peach, foamBase, smoothstep(0.35, 0.75, bill));
        c = mix(c, shadowCol, rim1 * 0.55);
        c = mix(c, shadowCol, rim2 * 0.4);
        c = mix(c, shadowCol, rim3 * 0.25 * smoothstep(0.4, 0.8, bill));
        c = mix(c, vec3(1.0, 0.98, 0.96), clamp(shine, 0.0, 1.0) * 0.6);
        // Splash rings: a bright crest.
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          vec4 r = fRipples[i];
          float d = length(fp - r.xy);
          float ring = exp(-pow((d - r.z * 3.2) * 3.0, 2.0)) * exp(-r.z * 1.4) * r.w;
          c = mix(c, vec3(1.0), clamp(ring, 0.0, 1.0));
        }
        diffuseColor.rgb = c;`,
      );
  };
  material.customProgramCacheKey = () => 'rg-foam-lava';
  return { material, uniforms };
}
