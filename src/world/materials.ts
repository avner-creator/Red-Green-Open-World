/**
 * The small shared set of PBR materials. Everything uses vertex colours, so one material can draw
 * many differently coloured objects in a single merged mesh. Detail comes from cheap world-space
 * shader noise, not textures.
 */
import * as THREE from 'three';

/** Shared animated uniforms. */
export const U = {
  time: { value: 0 },
  /** 0 by day → 1 at sunset: windows and lamps light up. */
  glow: { value: 0 },
  /** Grass and flowers shrink away between 70% and 100% of this distance from the camera. */
  grassFar: { value: 42 },
};

export const GLSL_NOISE = /* glsl */ `
float rgHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rgNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rgHash(i), rgHash(i + vec2(1.0, 0.0)), f.x), mix(rgHash(i + vec2(0.0, 1.0)), rgHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/** Patch a built-in material: adds vWorldPos, shared uniforms, and the given GLSL edits. */
export function patch(
  mat: THREE.Material,
  key: string,
  edit: { vertexPre?: string; vertex?: string; fragmentPre?: string; fragment?: string; afterNormal?: string; emissive?: string },
): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.time;
    shader.uniforms.uGlow = U.glow;
    shader.uniforms.uGrassFar = U.grassFar;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uGrassFar;\nvarying vec3 vWorldPos;\n${edit.vertexPre ?? ''}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${edit.vertex ?? ''}\n{ vec4 rgWp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nrgWp = instanceMatrix * rgWp;\n#endif\nvWorldPos = (modelMatrix * rgWp).xyz; }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uGlow;\nvarying vec3 vWorldPos;\n${GLSL_NOISE}\n${edit.fragmentPre ?? ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${edit.fragment ?? ''}`);
    if (edit.afterNormal) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${edit.afterNormal}`);
    if (edit.emissive) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${edit.emissive}`);
  };
  mat.customProgramCacheKey = () => key;
}

export type MatKey =
  | 'paint' | 'matte' | 'gloss' | 'metal' | 'glass' | 'window' | 'glow' | 'paving' | 'road' | 'cloth' | 'rubber';

export interface Materials {
  get(key: MatKey): THREE.Material;
  foliage: THREE.MeshStandardMaterial;
  grass: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  glowBasic: THREE.MeshBasicMaterial;
  update(): void;
}

function std(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, ...p });
}

export function createMaterials(): Materials {
  const paint = std({ roughness: 0.62 });
  const matte = std({ roughness: 0.9 });
  patch(matte, 'rg-matte', { fragment: 'diffuseColor.rgb *= 0.92 + 0.16 * rgNoise(vWorldPos.xz * 1.7 + vWorldPos.y * 1.3);' });
  const gloss = std({ roughness: 0.32 });
  const metal = std({ roughness: 0.38, metalness: 0.75 });
  const glass = std({ roughness: 0.08, metalness: 0.2 });
  const rubber = std({ roughness: 0.75 });
  patch(rubber, 'rg-rubber', { fragment: 'diffuseColor.rgb *= 0.94 + 0.08 * rgNoise(vWorldPos.xz * 9.0);' });

  // Windows: dark glass by day; warm interior light at sunset. Vertex colour red = "lit" amount.
  const window = std({ roughness: 0.12, metalness: 0.1, emissive: new THREE.Color(1.0, 0.62, 0.3) });
  patch(window, 'rg-window', {
    fragment: 'float rgLit = diffuseColor.r; diffuseColor.rgb = vec3(0.05, 0.07, 0.1);',
    emissive: 'totalEmissiveRadiance *= rgLit * (0.08 + 2.4 * uGlow);',
  });

  // Lamp bulbs etc.: unlit, brightened at sunset so bloom picks them up.
  const glowBasic = new THREE.MeshBasicMaterial({ vertexColors: true });

  // Cobbles / pavers: running-bond pattern with grout, faded out where it would alias.
  const paving = std({ roughness: 0.85 });
  patch(paving, 'rg-paving', {
    fragment: /* glsl */ `
      vec2 pp = vWorldPos.xz * vec2(1.7, 2.3);
      vec2 cell = vec2(pp.x + 0.5 * floor(pp.y), pp.y);
      vec2 f = fract(cell); vec2 id = floor(cell);
      float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      float fw = fwidth(pp.x) + fwidth(pp.y);
      float grout = mix(smoothstep(0.03, 0.09, e), 0.88, smoothstep(0.25, 0.7, fw));
      float tone = 0.86 + 0.22 * rgHash(id) + 0.06 * rgNoise(vWorldPos.xz * 0.4);
      diffuseColor.rgb *= mix(0.62, tone, grout);`,
  });

  paving.polygonOffset = true;
  paving.polygonOffsetFactor = -1;
  paving.polygonOffsetUnits = -2;
  const road = std({ roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  patch(road, 'rg-road', {
    fragment: 'diffuseColor.rgb *= 0.86 + 0.16 * rgNoise(vWorldPos.xz * 0.6) + 0.1 * rgNoise(vWorldPos.xz * 7.0);',
  });

  // Flags, bunting, awnings: flutter in the wind. Attribute aWave = 0 at the fixed edge, 1 at the free edge.
  const cloth = std({ roughness: 0.8, side: THREE.DoubleSide });
  patch(cloth, 'rg-cloth', {
    vertexPre: 'attribute float aWave;',
    vertex: 'transformed += vec3(0.55, 0.35, 0.75) * aWave * 0.22 * sin(uTime * 5.0 + transformed.x * 0.9 + transformed.z * 0.7 + aWave * 2.5);',
  });

  // Instanced vegetation: sway grows with height above the instance origin.
  const foliage = std({ roughness: 0.88 });
  patch(foliage, 'rg-foliage', {
    vertex: `{ vec3 ip = vec3(0.0);
      #ifdef USE_INSTANCING
      ip = instanceMatrix[3].xyz;
      #endif
      float sw = max(transformed.y - 1.5, 0.0) * 0.018;
      transformed.x += sin(uTime * 1.3 + ip.x * 0.21 + ip.z * 0.17) * sw;
      transformed.z += cos(uTime * 1.1 + ip.x * 0.13) * sw * 0.7; }`,
    fragment: 'diffuseColor.rgb *= 0.9 + 0.2 * rgNoise(vWorldPos.xz * 2.1 + vWorldPos.y * 2.7);',
  });
  const grass = std({ roughness: 0.95, side: THREE.DoubleSide });
  patch(grass, 'rg-grass', {
    vertex: `{ vec3 ip = vec3(0.0);
      #ifdef USE_INSTANCING
      ip = instanceMatrix[3].xyz;
      #endif
      float fade = 1.0 - smoothstep(uGrassFar * 0.7, uGrassFar, distance(cameraPosition.xz, ip.xz));
      transformed *= fade;
      float sw = transformed.y * transformed.y * 0.35;
      transformed.x += sin(uTime * 2.1 + ip.x * 0.37 + ip.z * 0.23) * sw;
      transformed.z += cos(uTime * 1.7 + ip.z * 0.31) * sw * 0.6; }`,
    // Blades are double-sided but keep their up-facing normals on the back side too (no dark backs).
    afterNormal: 'normal = normalize(vNormal);',
  });
  const rock = std({ roughness: 0.82 });
  patch(rock, 'rg-rock', {
    fragment: 'diffuseColor.rgb *= 0.82 + 0.3 * rgNoise(vWorldPos.xz * 1.3 + vWorldPos.y * 1.9) + 0.08 * rgNoise(vWorldPos.xy * 6.0);',
  });

  const map: Record<MatKey, THREE.Material> = { paint, matte, gloss, metal, glass, window, glow: glowBasic, paving, road, cloth, rubber };
  return {
    get: (k) => map[k],
    foliage,
    grass,
    rock,
    glowBasic,
    update() {
      glowBasic.color.setScalar(1 + 3.5 * U.glow.value);
    },
  };
}
