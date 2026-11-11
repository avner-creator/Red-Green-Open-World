/**
 * Per-object fade for layer objects. Toolkit controllers have their own `setFade`; `createFader`
 * works on ANY three object placed on a layer (gems, keys, custom meshes): it remembers each
 * material's base opacity and scales coverage down. Fading only ever shrinks an object's effect:
 * fade 1 is the object as built, fade 0 draws nothing at all (no pixel changes).
 */
import * as THREE from 'three';
import { clamp01 } from './common';

/** Smoothstep-eased value between `from` and `to` after `elapsed` of `duration` seconds (pure). */
export function fadeValue(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return to;
  const x = clamp01(elapsed / duration);
  const e = x * x * (3 - 2 * x);
  return from + (to - from) * e;
}

interface MatState {
  mat: THREE.Material;
  opacity: number;
  transparent: boolean;
  visible: boolean;
  /** ShaderMaterial: a `fade` uniform of its own (toolkit materials). */
  fadeUniform: THREE.IUniform<number> | null;
  /** ShaderMaterial without one: injected multiplier on the final alpha. */
  injected: THREE.IUniform<number> | null;
}

export interface FaderOptions {
  /** Start value. Default 1. */
  initial?: number;
  /**
   * Clone the object's materials first, so a material shared with other objects is not faded
   * with them. Default false (materials are changed in place).
   */
  clone?: boolean;
}

export interface Fader {
  /** Current fade 0..1. */
  readonly value: number;
  readonly target: number;
  /** Ease to `target` (0..1) over `seconds` (0 = at once). */
  fadeTo(target: number, seconds?: number): void;
  /** Jump to a value at once. */
  set(value: number): void;
  update(dt: number): void;
  /** Put every material back exactly as it was. */
  restore(): void;
}

function injectFade(mat: THREE.ShaderMaterial): THREE.IUniform<number> {
  const u: THREE.IUniform<number> = { value: 1 };
  const prev = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.uniforms.toolkitFade = u;
    const fs = shader.fragmentShader;
    const end = fs.lastIndexOf('}');
    shader.fragmentShader = `uniform float toolkitFade;\n${fs.slice(0, end)}  gl_FragColor.a *= toolkitFade;\n${fs.slice(end)}`;
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|toolkitFade`;
  mat.needsUpdate = true;
  return u;
}

export function createFader(object: THREE.Object3D, opts: FaderOptions = {}): Fader {
  const states: MatState[] = [];
  const seen = new Map<THREE.Material, MatState>();
  object.traverse((o) => {
    const holder = o as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
    if (!holder.material) return;
    const list = Array.isArray(holder.material) ? holder.material : [holder.material];
    const out = list.map((m0) => {
      const m = opts.clone ? m0.clone() : m0;
      if (!seen.has(m)) {
        const sm = (m as THREE.ShaderMaterial).isShaderMaterial ? (m as THREE.ShaderMaterial) : null;
        const fu = sm?.uniforms?.fade as THREE.IUniform<number> | undefined;
        const st: MatState = {
          mat: m,
          opacity: m.opacity,
          transparent: m.transparent,
          visible: m.visible,
          fadeUniform: fu && typeof fu.value === 'number' ? fu : null,
          injected: null,
        };
        if (sm && !st.fadeUniform) st.injected = injectFade(sm);
        seen.set(m, st);
        states.push(st);
      }
      return m;
    });
    if (opts.clone) holder.material = Array.isArray(holder.material) ? out : out[0];
  });

  let value = clamp01(opts.initial ?? 1);
  let from = value;
  let target = value;
  let elapsed = 0;
  let duration = 0;

  const apply = (f: number): void => {
    for (const s of states) {
      const m = s.mat;
      m.visible = s.visible && f > 0;
      if (s.fadeUniform) {
        s.fadeUniform.value = f;
        continue;
      }
      if (s.injected) s.injected.value = f;
      else m.opacity = s.opacity * f;
      // Partial coverage needs blending (and three's OPAQUE define off), so recompile on change.
      const transparent = f < 1 ? true : s.transparent;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
    }
  };
  apply(value);

  return {
    get value() {
      return value;
    },
    get target() {
      return target;
    },
    fadeTo(t, seconds = 0) {
      from = value;
      target = clamp01(t);
      elapsed = 0;
      duration = Math.max(0, seconds);
      if (duration === 0) {
        value = target;
        apply(value);
      }
    },
    set(v) {
      value = target = from = clamp01(v);
      duration = 0;
      apply(value);
    },
    update(dt) {
      if (value === target) return;
      elapsed += dt;
      value = clamp01(fadeValue(from, target, elapsed, duration));
      apply(value);
    },
    restore() {
      value = target = from = 1;
      duration = 0;
      for (const s of states) {
        s.mat.visible = s.visible;
        s.mat.opacity = s.opacity;
        if (s.fadeUniform) s.fadeUniform.value = 1;
        if (s.injected) s.injected.value = 1;
        if (s.mat.transparent !== s.transparent) {
          s.mat.transparent = s.transparent;
          s.mat.needsUpdate = true;
        }
      }
    },
  };
}
