/**
 * See-through foliage (QA6 m7): tree crowns, pine skirts and trunks between the camera and the hero,
 * or pressing against the lens, are dithered away instead of hiding the hero or filling the view
 * ("the occluding tree should fade", CLAUDE.md camera conventions).
 *
 * Only static world scenery that already counts as a camera occluder (instanced vegetation under
 * the `world` root, see camera-occluders.ts) is patched, and only its main material: shadows keep
 * the whole tree. Vision-layer objects are never touched. The cut is a cone from the camera to the
 * hero's middle (wider at the hero), plus a ball round the camera itself, with a 4×4 ordered
 * dither at its soft edge. `covers()` mirrors the shader for the test probe.
 */
import * as THREE from 'three';

/** Cut radius at the hero end of the cone (m): the hero's whole body shows. */
const R_HERO = 1.05;
/** Cut radius at the camera end of the cone (m). */
const R_CAM = 0.45;
/** Foliage closer to the camera than this is cut in every direction (m). */
const R_NEAR = 1.4;
/** The cone stops this far in front of the hero (what they stand in stays). */
const STOP_SHORT = 0.5;
/** Cache key suffix of patched programs. */
const KEY = '|rg-cut';

export interface CameraCutout {
  /** Patch a scenery material once (only the world's own foliage: other materials are skipped). */
  patch(mat: THREE.Material | THREE.Material[]): void;
  /** Camera and hero middle this frame; `on` false switches the cut off (title, rides). */
  update(camera: THREE.Vector3, hero: THREE.Vector3, on: boolean): void;
  /** Is a fragment of a patched material at world point `p` cut away (mostly: alpha > 0.5)? */
  covers(p: THREE.Vector3): boolean;
  /** Was this material patched? */
  patched(mat: THREE.Material): boolean;
}

export function createCameraCutout(): CameraCutout {
  const uniforms = {
    uCutA: { value: new THREE.Vector3() },
    uCutB: { value: new THREE.Vector3() },
    uCutOn: { value: 0 },
  };
  const done = new WeakSet<THREE.Material>();
  const ab = new THREE.Vector3();
  const ap = new THREE.Vector3();

  /** 0..1 how much is cut at `p` (same maths as the shader). */
  const amount = (p: THREE.Vector3): number => {
    if (uniforms.uCutOn.value < 0.5) return 0;
    const a = uniforms.uCutA.value;
    const b = uniforms.uCutB.value;
    const near = 1 - smooth(R_NEAR * 0.7, R_NEAR, p.distanceTo(a));
    ab.subVectors(b, a);
    const len = ab.length();
    if (len < 1e-3) return near;
    ap.subVectors(p, a);
    const t = ap.dot(ab) / (len * len);
    const stop = Math.max(0, 1 - STOP_SHORT / len);
    if (t < 0 || t > stop) return near;
    const d = ap.addScaledVector(ab, -t).length();
    const r = R_CAM + (R_HERO - R_CAM) * t;
    return Math.max(near, 1 - smooth(r * 0.82, r, d));
  };

  return {
    patch(mat) {
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        if (done.has(m)) continue;
        done.add(m);
        const baseKey = m.customProgramCacheKey?.call(m) ?? '';
        // The world's foliage material (it already provides vWorldPos after the wind sway).
        if (!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial || !baseKey.startsWith('rg-foliage')) continue;
        const base = m.onBeforeCompile;
        m.onBeforeCompile = (shader, renderer) => {
          base.call(m, shader, renderer);
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\nuniform vec3 uCutA;\nuniform vec3 uCutB;\nuniform float uCutOn;`)
            .replace(
              'void main() {',
              `void main() {
  if (uCutOn > 0.5) {
    vec3 ab = uCutB - uCutA;
    float len = max(length(ab), 1e-3);
    vec3 ap = vWorldPos - uCutA;
    float t = dot(ap, ab) / (len * len);
    float cut = 1.0 - smoothstep(${(R_NEAR * 0.7).toFixed(3)}, ${R_NEAR.toFixed(3)}, length(ap));
    if (t >= 0.0 && t <= max(0.0, 1.0 - ${STOP_SHORT.toFixed(3)} / len)) {
      float r = mix(${R_CAM.toFixed(3)}, ${R_HERO.toFixed(3)}, t);
      cut = max(cut, 1.0 - smoothstep(r * 0.82, r, length(ap - ab * t)));
    }
    ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
    int i = q.x + q.y * 4;
    float th = float(i == 0 ? 0 : i == 1 ? 8 : i == 2 ? 2 : i == 3 ? 10 : i == 4 ? 12 : i == 5 ? 4 : i == 6 ? 14 : i == 7 ? 6 : i == 8 ? 3 : i == 9 ? 11 : i == 10 ? 1 : i == 11 ? 9 : i == 12 ? 15 : i == 13 ? 7 : i == 14 ? 13 : 5) / 16.0 + 1.0 / 32.0;
    if (cut > th) discard;
  }`,
            );
        };
        m.customProgramCacheKey = () => baseKey + KEY;
        m.needsUpdate = true;
      }
    },
    update(camera, hero, on) {
      uniforms.uCutA.value.copy(camera);
      uniforms.uCutB.value.copy(hero);
      uniforms.uCutOn.value = on ? 1 : 0;
    },
    covers: (p) => amount(p) > 0.5,
    patched: (m) => done.has(m) && (m.customProgramCacheKey?.call(m) ?? '').endsWith(KEY),
  };
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
