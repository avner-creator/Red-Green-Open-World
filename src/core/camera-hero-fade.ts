/**
 * Hero fade (QA6 M2): when scenery pins the camera close to the hero (the arm could not swing or
 * rise clear), the hero's own meshes are dithered away instead of the view filling with the inside
 * of their head or suit. A 4×4 ordered dither (no transparency sorting, no extra pass); shadows keep
 * the whole hero (only the main materials are patched, depth/shadow materials are three's own).
 *
 * Every material under the hero's root is patched once with a shared uniform; new materials (a
 * character swap, a hat) are picked up on the next frame. Nothing outside the hero is touched.
 */
import * as THREE from 'three';

/** Camera closer than this to the hero's body (m): fully dithered away. */
export const HERO_FADE_FULL = 0.45;
/** Camera further than this from the hero's body (m): no fade. */
export const HERO_FADE_NONE = 0.95;
const KEY = '|rg-herofade';

/** Fade amount 0..1 for a camera `d` metres from the hero's body (pure). */
export function heroFadeAmount(d: number): number {
  const t = Math.max(0, Math.min(1, (HERO_FADE_NONE - d) / (HERO_FADE_NONE - HERO_FADE_FULL)));
  return t * t * (3 - 2 * t);
}

/**
 * Distance from point `p` to the vertical segment x=`hx`, z=`hz`, y in [y0, y1] (the hero's body
 * axis), minus `r` (body radius), clamped at 0.
 */
export function distToBody(p: { x: number; y: number; z: number }, hx: number, hz: number, y0: number, y1: number, r: number): number {
  const y = Math.max(y0, Math.min(y1, p.y));
  return Math.max(0, Math.hypot(p.x - hx, p.y - y, p.z - hz) - r);
}

export interface HeroFade {
  /** Patch any new hero materials and set this frame's fade (0 = solid, 1 = gone). */
  update(root: THREE.Object3D, amount: number): void;
  readonly amount: number;
}

export function createHeroFade(): HeroFade {
  const uniforms = { uHeroFade: { value: 0 } };
  const done = new WeakSet<THREE.Material>();

  function patch(m: THREE.Material): void {
    if (done.has(m)) return;
    done.add(m);
    // Only materials three builds from its own shader chunks (they all have `void main() {`).
    if ((m as THREE.ShaderMaterial).isShaderMaterial) return;
    const baseKey = m.customProgramCacheKey?.call(m) ?? '';
    const base = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      base.call(m, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `uniform float uHeroFade;
void main() {
  if (uHeroFade > 0.0) {
    ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
    int i = q.x + q.y * 4;
    float th = float(i == 0 ? 0 : i == 1 ? 8 : i == 2 ? 2 : i == 3 ? 10 : i == 4 ? 12 : i == 5 ? 4 : i == 6 ? 14 : i == 7 ? 6 : i == 8 ? 3 : i == 9 ? 11 : i == 10 ? 1 : i == 11 ? 9 : i == 12 ? 15 : i == 13 ? 7 : i == 14 ? 13 : 5) / 16.0 + 1.0 / 32.0;
    if (uHeroFade > th) discard;
  }`,
      );
    };
    m.customProgramCacheKey = () => baseKey + KEY;
    m.needsUpdate = true;
  }

  return {
    update(root, amount) {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Cheap re-check: a mesh's material can be swapped (gear, paint), so look at it each frame.
        const mat = mesh.material;
        if (Array.isArray(mat)) for (const m of mat) patch(m);
        else if (mat) patch(mat);
      });
      uniforms.uHeroFade.value = amount < 0.01 ? 0 : Math.min(1, amount);
    },
    get amount() {
      return uniforms.uHeroFade.value;
    },
  };
}
