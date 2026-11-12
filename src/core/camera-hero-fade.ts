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

/**
 * Top of the hero's body axis above the feet (m) for the fade: the head (`height` − 0.2), or up to
 * just under the top of whatever they wear (`wornTop`: the hero's bounds incl. hats and held items,
 * QA7 m2), at most 1.5 m above the head.
 */
export function heroAxisTop(height: number, wornTop: number | null): number {
  if (wornTop === null || !Number.isFinite(wornTop)) return height - 0.2;
  return Math.max(height - 0.2, Math.min(height + 1.5, wornTop) - 0.15);
}

/**
 * Most of the screen (share of width × height) the hero's bounds, worn items included, may cover
 * before the camera looks for a longer view and the hero starts to fade (QA8 m5: a top hat at a
 * booth filled half the screen).
 */
export const HERO_COVER_MAX = 0.25;
/** Cover at which the cover fade is complete, and how far it goes (the hero never vanishes). */
const COVER_FROM = 0.25;
const COVER_FULL = 0.36;
const COVER_FADE = 0.7;

/** Fade 0..`COVER_FADE` for a hero covering `cover` of the screen (pure). */
export function coverFadeAmount(cover: number): number {
  const t = Math.max(0, Math.min(1, (cover - COVER_FROM) / (COVER_FULL - COVER_FROM)));
  return t * t * (3 - 2 * t) * COVER_FADE;
}

const corner = new THREE.Vector3();

/**
 * Share of the screen (0..1 of width × height) the screen rectangle of world box `b` covers for
 * `camera` (matrices up to date). A box reaching behind the camera counts as covering it all.
 */
export function screenCover(camera: THREE.Camera, b: THREE.Box3): number {
  if (b.isEmpty()) return 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
    corner.applyMatrix4(camera.matrixWorldInverse);
    if (corner.z > -0.05) return 1;
    corner.applyMatrix4(camera.projectionMatrix);
    x0 = Math.min(x0, corner.x);
    x1 = Math.max(x1, corner.x);
    y0 = Math.min(y0, corner.y);
    y1 = Math.max(y1, corner.y);
  }
  const w = Math.max(0, Math.min(1, x1) - Math.max(-1, x0));
  const h = Math.max(0, Math.min(1, y1) - Math.max(-1, y0));
  return (w * h) / 4;
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
