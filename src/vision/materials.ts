/**
 * Helper materials for WeakOnly / StrongOnly layer objects. Any three material works in a layer
 * (colour is turned into luminance); these just make the common cases easy.
 */
import * as THREE from 'three';

/**
 * Flat grey for layer objects. `level` 0..1 is how strongly the object "pops" from its background
 * (1 = maximum contrast). `opacity` < 1 gives a partial mask (soft edges, fading in/out).
 */
export function createLayerMaterial(level = 1, opacity = 1): THREE.MeshBasicMaterial {
  const c = Math.min(1, Math.max(0, level));
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(c, c, c).convertSRGBToLinear(),
    transparent: opacity < 1,
    opacity,
  });
}

/** Shared animation clock for glow materials, advanced by the vision system's render(dt). */
export const glowTime: { value: number } = { value: 0 };

export interface GlowOptions {
  /** Brightness/pop of the glow, 0..1. Default 1. */
  level?: number;
  /** Opacity facing the camera (core). Default 0.25. */
  coreOpacity?: number;
  /** Rim sharpness; higher = thinner rim. Default 2. */
  rimPower?: number;
  /** Gentle pulse amount 0..1. Default 0.2. */
  pulse?: number;
}

/**
 * Fresnel glow/halo for layer objects (e.g. a slightly larger sphere around a gem): transparent in
 * the middle, solid at the rim, softly pulsing. Writes no depth so it never hides other layer
 * objects behind it.
 */
export function createGlowMaterial(opts: GlowOptions = {}): THREE.ShaderMaterial {
  const level = opts.level ?? 1;
  const c = new THREE.Color(level, level, level).convertSRGBToLinear();
  return new THREE.ShaderMaterial({
    name: 'VisionGlow',
    uniforms: {
      color: { value: c },
      coreOpacity: { value: opts.coreOpacity ?? 0.25 },
      rimPower: { value: opts.rimPower ?? 2 },
      pulse: { value: opts.pulse ?? 0.2 },
      time: glowTime,
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float coreOpacity;
      uniform float rimPower;
      uniform float pulse;
      uniform float time;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), rimPower);
        float a = mix(coreOpacity, 1.0, rim) * (1.0 - pulse * 0.5 + pulse * 0.5 * sin(time * 3.0));
        gl_FragColor = vec4(color, clamp(a, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}
