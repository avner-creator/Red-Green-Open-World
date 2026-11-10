/**
 * World post-processing (runs before the vision compositor, which vision appends itself):
 * gentle bloom → exposure + ACES filmic tone mapping + light grade (contrast, saturation, vignette)
 * → SMAA. Outputs tone-mapped linear colour.
 */
import * as THREE from 'three';
import { BloomEffect, BlendFunction, Effect, EffectPass, KernelSize, SMAAEffect, SMAAPreset } from 'postprocessing';
import type { Pass } from 'postprocessing';
import type { Quality } from '../types';

const GRADE = /* glsl */ `
uniform float exposure;
uniform float saturation;
uniform float contrast;
uniform float vignette;
vec3 rgAces(vec3 x) {
  // Narkowicz fit, slightly softened shoulder.
  const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = rgAces(inputColor.rgb * exposure * 0.8);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, saturation);
  // Contrast around mid-grey in a perceptual-ish space.
  vec3 g = pow(max(c, 0.0), vec3(1.0 / 2.2));
  g = (g - 0.5) * contrast + 0.5;
  c = pow(max(g, 0.0), vec3(2.2));
  vec2 v = uv - 0.5;
  c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(v, v) * 2.2);
  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}`;

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, THREE.Uniform>([
        ['exposure', new THREE.Uniform(1)],
        ['saturation', new THREE.Uniform(1.14)],
        ['contrast', new THREE.Uniform(1.06)],
        ['vignette', new THREE.Uniform(0.22)],
      ]),
    });
  }
  set exposure(v: number) {
    (this.uniforms.get('exposure') as THREE.Uniform).value = v;
  }
}

export interface Post {
  setExposure(v: number): void;
  passes(q: Quality): Pass[];
}

export function createPost(camera: THREE.Camera): Post {
  const gradeLow = new GradeEffect();
  const grade = new GradeEffect();
  const bloom = new BloomEffect({
    intensity: 0.55,
    luminanceThreshold: 0.82,
    luminanceSmoothing: 0.25,
    mipmapBlur: true,
    radius: 0.72,
    kernelSize: KernelSize.MEDIUM,
  });
  const smaa = new SMAAEffect({ preset: SMAAPreset.MEDIUM });
  let low: Pass[] | null = null;
  let full: Pass[] | null = null;
  return {
    setExposure(v) {
      grade.exposure = v;
      gradeLow.exposure = v;
    },
    passes(q) {
      if (q === 'low') {
        if (!low) {
          const p = new EffectPass(camera, gradeLow);
          p.dithering = true;
          low = [p];
        }
        return low;
      }
      if (!full) {
        const main = new EffectPass(camera, bloom, grade);
        const aa = new EffectPass(camera, smaa);
        aa.dithering = true;
        full = [main, aa];
      }
      return full;
    },
  };
}
