/**
 * Rings, timing rings and reticles for the vision layers. Each is ONE quad with a signed-distance
 * shader (one draw call), grey + anti-aliased alpha only.
 */
import * as THREE from 'three';
import { applyFade, baseFragmentHead, baseUniforms, clamp01, layerMesh, layerShaderMaterial, linearGrey, planeGeometry } from './common';
import type { Facing, LayerBlock } from './common';

// ───────────────────────────── Pure timing maths ─────────────────────────────

export type TimingGrade = 'perfect' | 'good' | 'early' | 'late';

export interface TimingWindowOptions {
  /** `t` at which the closing ring sits exactly on the target ring. Default 0.8. */
  perfectAt?: number;
  /** |t − perfectAt| within this is "perfect". Default 0.04. */
  perfect?: number;
  /** |t − perfectAt| within this is "good" (beyond it: early / late). Default 0.12. */
  good?: number;
}

export interface TimingResult {
  grade: TimingGrade;
  /** 1 at perfect, falling linearly to 0 at the edge of the "good" window (0 outside it). */
  score: number;
  /** t − perfectAt (negative = early). */
  offset: number;
}

export const TIMING_DEFAULTS: Required<TimingWindowOptions> = { perfectAt: 0.8, perfect: 0.04, good: 0.12 };

/** How close a press at `t` (0..1 along the closing ring) is to "perfect". */
export function timingWindow(t: number, opts: TimingWindowOptions = {}): TimingResult {
  const o = { ...TIMING_DEFAULTS, ...opts };
  const offset = t - o.perfectAt;
  const a = Math.abs(offset);
  const score = a >= o.good ? 0 : 1 - a / o.good;
  const grade: TimingGrade = a <= o.perfect ? 'perfect' : a <= o.good ? 'good' : offset < 0 ? 'early' : 'late';
  return { grade, score, offset };
}

/** Radius of the closing ring at `t`: `start` at t = 0, `target` at t = perfectAt, keeps shrinking after. */
export function timingRadius(t: number, target: number, start: number, perfectAt = TIMING_DEFAULTS.perfectAt): number {
  const r = start + (target - start) * (clamp01(t) / Math.max(1e-3, perfectAt));
  return Math.max(0, r);
}

// ───────────────────────────── GLSL ─────────────────────────────

const ringLib = /* glsl */ `
const float TAU = 6.28318530718;
// Signed distance (metres along the arc) to the interval [0, fill) of a 0..1 periodic coordinate.
float arcSdf(float local, float fill, float len) {
  local = fract(local);
  if (local < fill) return -min(local, fill - local) * len;
  return min(local - fill, 1.0 - local) * len;
}
// Clockwise angle from 12 o'clock, 0..1.
float clockAngle(vec2 p) { return fract(atan(p.x, p.y) / TAU); }
float ringSdf(float d, float r, float th) { return abs(d - r) - th * 0.5; }
float aaW(float sdf, float w) { return clamp(0.5 - sdf / w, 0.0, 1.0); }
float boxSdf(vec2 p, vec2 c, vec2 h) {
  vec2 q = abs(p - c) - h;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
`;

const ringFragment = /* glsl */ `
${baseFragmentHead}
${ringLib}
uniform float halfSize;
uniform float radius;
uniform float thickness;
uniform float segments;
uniform float segmentFill;
uniform float rotation;
uniform float progress;
uniform float trackAlpha;
uniform float pulse;
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * halfSize;
  float d = length(p);
  float w = max(fwidth(d), 1e-5);
  float r = radius * (1.0 + 0.08 * pulse);
  float a = aaW(ringSdf(d, r, thickness), w);
  float ang = clockAngle(p);
  float circ = TAU * r;
  if (segments > 0.5) {
    a *= aaW(arcSdf(ang * segments - rotation * segments, segmentFill, circ / segments), w);
  }
  if (progress < 1.0) {
    float on = progress <= 0.0 ? 0.0 : aaW(arcSdf(ang, progress, circ), w);
    a *= mix(trackAlpha, 1.0, on);
  }
  a *= (1.0 - 0.3 * pulse) * opacity * fade;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(color, a);
}
`;

const timingFragment = /* glsl */ `
${baseFragmentHead}
${ringLib}
uniform float halfSize;
uniform float target;
uniform float current;
uniform float thickness;
uniform float near; // 0..1, 1 = inside the perfect window
uniform float targetAlpha;
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * halfSize;
  float d = length(p);
  float w = max(fwidth(d), 1e-5);
  float inner = aaW(ringSdf(d, target, thickness * (1.0 + 0.7 * near)), w) * mix(targetAlpha, 1.0, near);
  float outer = aaW(ringSdf(d, current, thickness), w);
  float a = max(inner, outer) * opacity * fade;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(color, a);
}
`;

const reticleFragment = /* glsl */ `
${baseFragmentHead}
${ringLib}
uniform float halfSize;
uniform float radius;
uniform float thickness;
uniform float tickGap;
uniform float tickLength;
uniform float dotRadius;
uniform float rotation;
uniform float pulse;
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * halfSize;
  float d = length(p);
  float w = max(fwidth(d), 1e-5);
  float r = radius * (1.0 + 0.06 * pulse);
  float s = ringSdf(d, r, thickness);
  float c = cos(rotation * TAU);
  float sn = sin(rotation * TAU);
  vec2 q = vec2(c * p.x - sn * p.y, sn * p.x + c * p.y);
  vec2 aq = abs(q);
  if (aq.x > aq.y) aq = aq.yx; // fold the 4 ticks onto the vertical one
  float mid = r + tickGap + tickLength * 0.5;
  s = min(s, boxSdf(aq, vec2(0.0, mid), vec2(thickness * 0.5, tickLength * 0.5)) - thickness * 0.15);
  s = min(s, d - dotRadius);
  float a = aaW(s, w) * opacity * fade;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(color, a);
}
`;

// ───────────────────────────── Ring ─────────────────────────────

export interface RingOptions {
  /** Centre-line radius, metres. Default 0.5. */
  radius?: number;
  /** Line thickness, metres. Default 0.08. */
  thickness?: number;
  /** Number of dashes (0 = solid). One segment with fill 0.85 is "a ring with one gap". Default 0. */
  segments?: number;
  /** Fraction of each segment that is drawn. Default 0.7. */
  segmentFill?: number;
  /** Start rotation in turns (clockwise). Default 0. */
  rotation?: number;
  /** Turns per second (dashes spin). Default 0. */
  spin?: number;
  /** Progress arc 0..1 clockwise from 12 o'clock; the rest is a faint track. Default 1 (full ring). */
  progress?: number;
  /** Opacity of the track beyond the progress arc. Default 0.25. */
  trackAlpha?: number;
  /** Pulse amount 0..1 (size + coverage breathing). Default 0. */
  pulse?: number;
  /** Pulses per second. Default 1.2. */
  pulseSpeed?: number;
  /** Grey "pop" level 0..1. Default 1. */
  level?: number;
  /** Coverage multiplier 0..1 (tiers). Default 1. */
  opacity?: number;
  /** Default 'billboard'. */
  facing?: Facing;
}

export interface RingBlock extends LayerBlock {
  readonly mesh: THREE.Mesh;
  setProgress(p: number): void;
  /** Change look options live (radius/thickness/facing are fixed at creation). */
  set(opts: Omit<RingOptions, 'radius' | 'thickness' | 'facing'>): void;
}

export function createRing(opts: RingOptions = {}): RingBlock {
  const radius = opts.radius ?? 0.5;
  const thickness = opts.thickness ?? 0.08;
  const half = radius * 1.1 + thickness;
  let spin = opts.spin ?? 0;
  let pulseAmt = opts.pulse ?? 0;
  let pulseSpeed = opts.pulseSpeed ?? 1.2;
  let time = 0;
  const u = {
    ...baseUniforms(opts.level ?? 1, opts.opacity ?? 1),
    halfSize: { value: half },
    radius: { value: radius },
    thickness: { value: thickness },
    segments: { value: Math.max(0, Math.round(opts.segments ?? 0)) },
    segmentFill: { value: clamp01(opts.segmentFill ?? 0.7) },
    rotation: { value: opts.rotation ?? 0 },
    progress: { value: clamp01(opts.progress ?? 1) },
    trackAlpha: { value: clamp01(opts.trackAlpha ?? 0.25) },
    pulse: { value: 0 },
  };
  const facing = opts.facing ?? 'billboard';
  const mat = layerShaderMaterial({ name: 'ToolkitRing', uniforms: u, fragmentShader: ringFragment, billboard: facing === 'billboard' });
  const mesh = layerMesh(planeGeometry(half * 2, half * 2, facing), mat, 'ToolkitRing');
  const pulseNow = (): number => pulseAmt * (0.5 + 0.5 * Math.sin(time * pulseSpeed * Math.PI * 2));
  return {
    object: mesh,
    mesh,
    setFade: (f) => applyFade(mat, f),
    setProgress(p) {
      u.progress.value = clamp01(p);
    },
    set(o) {
      if (o.segments !== undefined) u.segments.value = Math.max(0, Math.round(o.segments));
      if (o.segmentFill !== undefined) u.segmentFill.value = clamp01(o.segmentFill);
      if (o.rotation !== undefined) u.rotation.value = o.rotation;
      if (o.spin !== undefined) spin = o.spin;
      if (o.progress !== undefined) u.progress.value = clamp01(o.progress);
      if (o.trackAlpha !== undefined) u.trackAlpha.value = clamp01(o.trackAlpha);
      if (o.pulse !== undefined) pulseAmt = clamp01(o.pulse);
      if (o.pulseSpeed !== undefined) pulseSpeed = o.pulseSpeed;
      if (o.level !== undefined) u.color.value.copy(linearGrey(o.level));
      if (o.opacity !== undefined) u.opacity.value = clamp01(o.opacity);
      u.pulse.value = pulseNow();
    },
    update(dt) {
      time += dt;
      if (spin !== 0) u.rotation.value = (u.rotation.value + spin * dt) % 1;
      u.pulse.value = pulseNow();
    },
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}

// ───────────────────────────── Timing ring ─────────────────────────────

export interface TimingRingOptions extends TimingWindowOptions {
  /** Radius of the fixed target ring, metres. Default 0.5. */
  radius?: number;
  /** Radius of the closing ring at t = 0. Default 2.2 × radius. */
  startRadius?: number;
  /** Line thickness, metres. Default 0.08. */
  thickness?: number;
  /** Opacity of the target ring outside the perfect window. Default 0.55. */
  targetAlpha?: number;
  level?: number;
  opacity?: number;
  facing?: Facing;
}

export interface TimingRingBlock extends LayerBlock {
  readonly mesh: THREE.Mesh;
  /** Current position 0..1 (closing ring meets the target at `perfectAt`). */
  readonly t: number;
  setT(t: number): void;
  /** Auto-advance t from 0 to 1 over `seconds` in `update(dt)` (stops at 1). */
  play(seconds: number): void;
  readonly playing: boolean;
  /** Grade of a press right now. */
  result(): TimingResult;
}

export function createTimingRing(opts: TimingRingOptions = {}): TimingRingBlock {
  const win = { ...TIMING_DEFAULTS, perfectAt: opts.perfectAt ?? TIMING_DEFAULTS.perfectAt, perfect: opts.perfect ?? TIMING_DEFAULTS.perfect, good: opts.good ?? TIMING_DEFAULTS.good };
  const radius = opts.radius ?? 0.5;
  const start = opts.startRadius ?? radius * 2.2;
  const thickness = opts.thickness ?? 0.08;
  const half = Math.max(start, radius) + thickness * 2;
  const u = {
    ...baseUniforms(opts.level ?? 1, opts.opacity ?? 1),
    halfSize: { value: half },
    target: { value: radius },
    current: { value: start },
    thickness: { value: thickness },
    near: { value: 0 },
    targetAlpha: { value: clamp01(opts.targetAlpha ?? 0.55) },
  };
  const facing = opts.facing ?? 'billboard';
  const mat = layerShaderMaterial({ name: 'ToolkitTimingRing', uniforms: u, fragmentShader: timingFragment, billboard: facing === 'billboard' });
  const mesh = layerMesh(planeGeometry(half * 2, half * 2, facing), mat, 'ToolkitTimingRing');
  let t = 0;
  let duration = 0;
  const apply = (): void => {
    u.current.value = timingRadius(t, radius, start, win.perfectAt);
    const off = Math.abs(t - win.perfectAt);
    u.near.value = off <= win.perfect ? 1 : 0;
  };
  apply();
  return {
    object: mesh,
    mesh,
    get t() {
      return t;
    },
    get playing() {
      return duration > 0;
    },
    setT(v) {
      t = clamp01(v);
      apply();
    },
    play(seconds) {
      t = 0;
      duration = Math.max(1e-3, seconds);
      apply();
    },
    result: () => timingWindow(t, win),
    setFade: (f) => applyFade(mat, f),
    update(dt) {
      if (duration > 0) {
        t = Math.min(1, t + dt / duration);
        if (t >= 1) duration = 0;
        apply();
      }
    },
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}

// ───────────────────────────── Reticle ─────────────────────────────

export interface ReticleOptions {
  /** Ring radius, metres. Default 0.4. */
  radius?: number;
  /** Line thickness, metres. Default 0.06. */
  thickness?: number;
  /** Gap between ring and ticks. Default 0.06. */
  tickGap?: number;
  /** Tick length. Default 0.18. */
  tickLength?: number;
  /** Centre dot radius. Default 1.2 × thickness. */
  dot?: number;
  /** Turns per second. Default 0. */
  spin?: number;
  pulse?: number;
  pulseSpeed?: number;
  level?: number;
  opacity?: number;
  facing?: Facing;
}

export interface ReticleBlock extends LayerBlock {
  readonly mesh: THREE.Mesh;
  set(opts: Pick<ReticleOptions, 'spin' | 'pulse' | 'pulseSpeed' | 'level' | 'opacity'>): void;
}

export function createReticle(opts: ReticleOptions = {}): ReticleBlock {
  const radius = opts.radius ?? 0.4;
  const thickness = opts.thickness ?? 0.06;
  const tickGap = opts.tickGap ?? 0.06;
  const tickLength = opts.tickLength ?? 0.18;
  const half = radius * 1.06 + tickGap + tickLength + thickness;
  let spin = opts.spin ?? 0;
  let pulseAmt = opts.pulse ?? 0;
  let pulseSpeed = opts.pulseSpeed ?? 1.2;
  let time = 0;
  const u = {
    ...baseUniforms(opts.level ?? 1, opts.opacity ?? 1),
    halfSize: { value: half },
    radius: { value: radius },
    thickness: { value: thickness },
    tickGap: { value: tickGap },
    tickLength: { value: tickLength },
    dotRadius: { value: opts.dot ?? thickness * 1.2 },
    rotation: { value: 0 },
    pulse: { value: 0 },
  };
  const facing = opts.facing ?? 'billboard';
  const mat = layerShaderMaterial({ name: 'ToolkitReticle', uniforms: u, fragmentShader: reticleFragment, billboard: facing === 'billboard' });
  const mesh = layerMesh(planeGeometry(half * 2, half * 2, facing), mat, 'ToolkitReticle');
  const pulseNow = (): number => pulseAmt * (0.5 + 0.5 * Math.sin(time * pulseSpeed * Math.PI * 2));
  return {
    object: mesh,
    mesh,
    setFade: (f) => applyFade(mat, f),
    set(o) {
      if (o.spin !== undefined) spin = o.spin;
      if (o.pulse !== undefined) pulseAmt = clamp01(o.pulse);
      if (o.pulseSpeed !== undefined) pulseSpeed = o.pulseSpeed;
      if (o.level !== undefined) u.color.value.copy(linearGrey(o.level));
      if (o.opacity !== undefined) u.opacity.value = clamp01(o.opacity);
      u.pulse.value = pulseNow();
    },
    update(dt) {
      time += dt;
      if (spin !== 0) u.rotation.value = (u.rotation.value + spin * dt) % 1;
      u.pulse.value = pulseNow();
    },
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}
