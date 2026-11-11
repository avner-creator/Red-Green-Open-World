/**
 * The small shared set of PBR materials. Everything uses vertex colours, so one material can draw
 * many differently coloured objects in a single merged mesh. Detail comes from cheap world-space
 * shader noise, not textures.
 */
import * as THREE from 'three';

/** Bump slots the toy shader checks (ring buffer, newest overwrite oldest). */
export const TOY_BUMP_SLOTS = 8;

/** Toy motion kinds (aPivot.w). */
export const TOY = { still: 0, spin: 1, wobble: 2, pinwheel: 3, sway: 4 } as const;

/** Shared animated uniforms. */
export const U = {
  time: { value: 0 },
  /** 0 by day → 1 at sunset: windows and lamps light up. */
  glow: { value: 0 },
  /** Grass and flowers shrink away between 70% and 100% of this distance from the camera. */
  grassFar: { value: 42 },
  /** Direction towards the sun and its colour × intensity (set by the lighting; used by the sea glint). */
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  sunColor: { value: new THREE.Color(1, 1, 1) },
  /** Wind strength (1 = normal breeze; gusts up to ~1.5). Driven by src/world/life. */
  wind: { value: 1 },
  /**
   * Recent bumps of island toys (see toys.ts): xyz = the bumped toy's pivot, w = the game time of the
   * bump. Toy vertices whose pivot matches a slot wobble / spin up from that time on.
   */
  bumps: { value: Array.from({ length: TOY_BUMP_SLOTS }, () => new THREE.Vector4(0, -1e4, 0, -1e4)) },
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
    shader.uniforms.uWind = U.wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uGrassFar;\nuniform float uWind;\nvarying vec3 vWorldPos;\n${edit.vertexPre ?? ''}`)
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
  | 'paint' | 'matte' | 'gloss' | 'metal' | 'glass' | 'window' | 'glow' | 'paving' | 'road' | 'cloth' | 'rubber' | 'toy'
  /** Batcher-only: paint, matte, gloss, metal, glass and rubber merged (per-vertex surface). */
  | 'surface';

/**
 * Per-vertex surface of the keys the batcher merges into one 'surface' mesh (one draw call instead of
 * nine): roughness, metalness and the kind (0 plain, 1 matte noise, 2 rubber noise, 3 paving pattern,
 * 4 window: dark glass that lights up at sunset, 5 glow: unlit bulb, brighter at sunset).
 */
export const SURFACE: Partial<Record<MatKey, readonly [number, number, number]>> = {
  paint: [0.62, 0, 0],
  matte: [0.9, 0, 1],
  gloss: [0.32, 0, 0],
  metal: [0.38, 0.75, 0],
  glass: [0.08, 0.2, 0],
  rubber: [0.75, 0, 2],
  paving: [0.85, 0, 3],
  window: [0.12, 0.1, 4],
  glow: [1, 0, 5],
};

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
    vertex: 'transformed += vec3(0.55, 0.35, 0.75) * aWave * 0.22 * uWind * sin(uTime * 5.0 + transformed.x * 0.9 + transformed.z * 0.7 + aWave * 2.5);',
  });

  // Instanced vegetation: sway grows with height above the instance origin.
  const foliage = std({ roughness: 0.88 });
  patch(foliage, 'rg-foliage', {
    vertex: `{ vec3 ip = vec3(0.0);
      #ifdef USE_INSTANCING
      ip = instanceMatrix[3].xyz;
      #endif
      float sw = max(transformed.y - 1.5, 0.0) * 0.018 * uWind;
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
      float sw = transformed.y * transformed.y * 0.35 * uWind;
      transformed.x += sin(uTime * 2.1 + ip.x * 0.37 + ip.z * 0.23) * sw;
      transformed.z += cos(uTime * 1.7 + ip.z * 0.31) * sw * 0.6; }`,
    // Blades are double-sided but keep their up-facing normals on the back side too (no dark backs).
    afterNormal: 'normal = normalize(vNormal);',
  });
  const rock = std({ roughness: 0.82 });
  patch(rock, 'rg-rock', {
    fragment: 'diffuseColor.rgb *= 0.82 + 0.3 * rgNoise(vWorldPos.xz * 1.3 + vWorldPos.y * 1.9) + 0.08 * rgNoise(vWorldPos.xy * 6.0);',
  });

  const toy = createToyMaterial();
  // The merged surface: roughness / metalness / noise from the vertex (`aSurf`, see SURFACE).
  const surface = std({ roughness: 1, metalness: 1, emissive: new THREE.Color(1, 1, 1) });
  patch(surface, 'rg-surface', {
    vertexPre: 'attribute vec3 aSurf; varying vec3 vSurf;',
    vertex: 'vSurf = aSurf;',
    fragmentPre: 'varying vec3 vSurf; float rgLit; vec3 rgGlowC;',
    fragment: `rgLit = 0.0; rgGlowC = vec3(0.0);
      if (vSurf.z > 4.5) { rgGlowC = diffuseColor.rgb; diffuseColor.rgb = vec3(0.0); }
      else if (vSurf.z > 3.5) { rgLit = diffuseColor.r; diffuseColor.rgb = vec3(0.05, 0.07, 0.1); }
      else if (vSurf.z > 2.5) {
        vec2 pp = vWorldPos.xz * vec2(1.7, 2.3);
        vec2 cell = vec2(pp.x + 0.5 * floor(pp.y), pp.y);
        vec2 f = fract(cell); vec2 id = floor(cell);
        float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
        float fw = fwidth(pp.x) + fwidth(pp.y);
        float grout = mix(smoothstep(0.03, 0.09, e), 0.88, smoothstep(0.25, 0.7, fw));
        float tone = 0.86 + 0.22 * rgHash(id) + 0.06 * rgNoise(vWorldPos.xz * 0.4);
        diffuseColor.rgb *= mix(0.62, tone, grout);
      }
      else if (vSurf.z > 1.5) diffuseColor.rgb *= 0.94 + 0.08 * rgNoise(vWorldPos.xz * 9.0);
      else if (vSurf.z > 0.5) diffuseColor.rgb *= 0.92 + 0.16 * rgNoise(vWorldPos.xz * 1.7 + vWorldPos.y * 1.3);`,
    emissive: 'totalEmissiveRadiance = vec3(1.0, 0.62, 0.3) * rgLit * (0.08 + 2.4 * uGlow) + rgGlowC * (1.0 + 3.5 * uGlow);',
  });
  const base = surface.onBeforeCompile;
  surface.onBeforeCompile = (shader, renderer) => {
    base.call(surface, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vSurf.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vSurf.y;');
  };
  const map: Record<MatKey, THREE.Material> = { paint, matte, gloss, metal, glass, window, glow: glowBasic, paving, road, cloth, rubber, toy, surface };
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

/**
 * Island toys and spinners: glossy painted plastic whose vertices move in the vertex shader, so every
 * toy, pinwheel, windmill sail and big wheel on the island shares one merged, cell-culled mesh (one
 * draw call). Per vertex: aPivot = (pivot xyz, kind) and aAxis = (axis xyz, speed or size).
 * - spin: turns about the axis through the pivot at `speed` rad/s (big wheel, windmill sails).
 * - pinwheel: idles slowly in the wind and whirls up after a bump.
 * - wobble: a bump squashes it (jelly bounce) and rocks it; `aAxis.w` = toy height.
 * - sway: rocks gently all the time (spring toys, balloons on sticks), more after a bump.
 * Bumps come from `U.bumps` (toys.ts writes the bumped toy's pivot and the time).
 */
function createToyMaterial(): THREE.MeshStandardMaterial {
  const toy = std({ roughness: 0.38 });
  const N = TOY_BUMP_SLOTS;
  patch(toy, 'rg-toy', {
    vertexPre: /* glsl */ `
      attribute vec4 aPivot;
      attribute vec4 aAxis;
      uniform vec4 uBumps[${N}];
      mat3 rgToyM = mat3(1.0);
      vec3 rgToyT = vec3(0.0);
      mat3 rgRot(vec3 a, float t) {
        float c = cos(t); float s = sin(t); float k = 1.0 - c;
        return mat3(c + a.x * a.x * k, a.y * a.x * k + a.z * s, a.z * a.x * k - a.y * s,
                    a.x * a.y * k - a.z * s, c + a.y * a.y * k, a.z * a.y * k + a.x * s,
                    a.x * a.z * k + a.y * s, a.y * a.z * k - a.x * s, c + a.z * a.z * k);
      }
      float rgBumpAge() {
        float age = 1e4;
        for (int i = 0; i < ${N}; i++) {
          vec4 b = uBumps[i];
          if (distance(b.xyz, aPivot.xyz) < 0.05) age = min(age, uTime - b.w);
        }
        return age;
      }
      void rgToyPrep() {
        int kind = int(aPivot.w + 0.5);
        if (kind == 0) return;
        vec3 ax = normalize(aAxis.xyz + vec3(0.0, 1e-5, 0.0));
        if (kind == 1) { rgToyM = rgRot(ax, uTime * aAxis.w); }
        else if (kind == 3) {
          float e = max(rgBumpAge(), 0.0);
          float ang = uTime * 0.9 * uWind + (e < 60.0 ? 9.0 * (1.0 - exp(-1.2 * e)) : 9.0);
          rgToyM = rgRot(ax, ang);
        } else {
          float e = max(rgBumpAge(), 0.0);
          float k = exp(-3.2 * e);
          float sq = 0.32 * k * sin(e * 15.0);
          float rock = 0.16 * k * sin(e * 9.0 + 1.0);
          if (kind == 4) rock += 0.05 * uWind * sin(uTime * 1.7 + aPivot.x * 0.7 + aPivot.z * 0.5);
          mat3 S = mat3(1.0 + sq * 0.5, 0.0, 0.0, 0.0, 1.0 - sq, 0.0, 0.0, 0.0, 1.0 + sq * 0.5);
          float sa = sin(aPivot.x * 3.1 + aPivot.z * 1.7);
          vec3 rax = normalize(vec3(sa, 0.0, cos(aPivot.x * 3.1 + aPivot.z * 1.7)));
          rgToyM = rgRot(rax, rock) * S;
        }
        rgToyT = aPivot.xyz;
      }`,
    vertex: 'transformed = rgToyM * (transformed - rgToyT) + rgToyT;',
  });
  const base = toy.onBeforeCompile;
  toy.onBeforeCompile = (shader, renderer) => {
    base.call(toy, shader, renderer);
    shader.uniforms.uBumps = U.bumps;
    // Prepare the toy transform before the normal is used; turn the normal with it.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\nrgToyPrep();\nobjectNormal = normalize(rgToyM * objectNormal);',
    );
  };
  return toy;
}
