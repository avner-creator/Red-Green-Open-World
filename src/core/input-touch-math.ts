/** Pure touch-control maths (unit-tested): floating joystick, drag-to-look, device class. */
import { radialDeadZone } from './input-math';
import type { Vec2 } from './input-math';
import type { Quality } from '../types';

export const TOUCH = {
  /** Joystick knob travel as a fraction of the screen's short side, clamped to [min, max] CSS px. */
  stickRadiusFrac: 0.15,
  stickRadiusMin: 46,
  stickRadiusMax: 92,
  /** Fraction of the knob travel that reads as zero (thumb wobble). */
  stickDeadZone: 0.12,
  /** Radians of camera yaw for a drag across the screen's short side (about 150°). */
  lookYawPerShortSide: 2.6,
  /** Pitch is a little slower than yaw (kids overshoot up/down). */
  lookPitchPerShortSide: 1.7,
  /** Ignore single absurd jumps (a lost pointer reappearing elsewhere), CSS px per move event. */
  maxLookStep: 160,
  /** A short side at or below this many CSS px counts as a phone (landscape 667×375 → 375). */
  phoneShortSide: 500,
} as const;

/** Knob travel radius in CSS px for a viewport. */
export function stickRadius(width: number, height: number): number {
  const r = Math.min(width, height) * TOUCH.stickRadiusFrac;
  return Math.min(TOUCH.stickRadiusMax, Math.max(TOUCH.stickRadiusMin, r));
}

/**
 * Stick output for a finger at (x, y) with the base at (bx, by), all in CSS px (y grows down).
 * Returns the game's move vector: x right(+), y forward(+) = finger above the base. Length ≤ 1,
 * with a radial dead zone that is rescaled so control stays fine just past it.
 */
export function stickVector(bx: number, by: number, x: number, y: number, radius: number, deadZone: number = TOUCH.stickDeadZone): Vec2 {
  if (!(radius > 0)) return { x: 0, y: 0 };
  const nx = (x - bx) / radius;
  const ny = (by - y) / radius;
  const len = Math.hypot(nx, ny);
  const cx = len > 1 ? nx / len : nx;
  const cy = len > 1 ? ny / len : ny;
  return radialDeadZone(cx, cy, deadZone);
}

/**
 * Floating base: when the finger goes further than `radius` from the base, the base is dragged
 * along behind it (so reversing direction is instant). Returns the new base position.
 */
export function followBase(bx: number, by: number, x: number, y: number, radius: number): Vec2 {
  const dx = x - bx;
  const dy = y - by;
  const len = Math.hypot(dx, dy);
  if (len <= radius || len === 0) return { x: bx, y: by };
  const k = (len - radius) / len;
  return { x: bx + dx * k, y: by + dy * k };
}

/** Keep the base far enough from the screen edges that the whole ring stays visible. */
export function clampBase(x: number, y: number, radius: number, width: number, height: number, inset = 0): Vec2 {
  const m = radius + inset;
  const cx = width > 2 * m ? Math.min(width - m, Math.max(m, x)) : width / 2;
  const cy = height > 2 * m ? Math.min(height - m, Math.max(m, y)) : height / 2;
  return { x: cx, y: cy };
}

/**
 * Drag-to-look: CSS px moved → radians (same sign convention as the mouse: right/down positive).
 * Scaled by the short side so a swipe feels the same on a phone and on a tablet.
 */
export function lookFromDrag(dx: number, dy: number, width: number, height: number): Vec2 {
  const short = Math.max(1, Math.min(width, height));
  return { x: (dx / short) * TOUCH.lookYawPerShortSide, y: (dy / short) * TOUCH.lookPitchPerShortSide };
}

/** One pointer-move step of a look drag; an absurd jump (lost pointer reappearing) counts as 0. */
export function lookStep(d: number): number {
  return Number.isFinite(d) && Math.abs(d) <= TOUCH.maxLookStep ? d : 0;
}

export interface DeviceHints {
  /** `navigator.maxTouchPoints` */
  maxTouchPoints: number;
  /** `matchMedia('(pointer: coarse)').matches` */
  coarse: boolean;
  /** `matchMedia('(any-pointer: fine)').matches` (a mouse or trackpad is attached). */
  fine: boolean;
}

/** Show touch controls before the first touch only on touch-first devices (phones, tablets). */
export function prefersTouch(d: DeviceHints): boolean {
  return d.maxTouchPoints > 0 && d.coarse && !d.fine;
}

export function isPhoneViewport(width: number, height: number): boolean {
  return Math.min(width, height) <= TOUCH.phoneShortSide;
}

/** Boot quality for a touch-first device (null = leave the setting alone). */
export function touchQuality(touchFirst: boolean, phone: boolean): Quality | null {
  if (!touchFirst) return null;
  return phone ? 'low' : 'medium';
}

/** Suggested device-pixel-ratio cap for a quality level; phones get a lower cap. */
export function touchPixelRatioCap(quality: Quality, phone: boolean): number {
  const base = quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1;
  return phone ? Math.min(base, quality === 'low' ? 1 : 1.25) : base;
}
