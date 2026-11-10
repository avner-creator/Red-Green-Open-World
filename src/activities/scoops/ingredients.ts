/**
 * How each ingredient looks (procedural, vertex colours). Shared by the parlour's tubs and bowls,
 * the cone you build, the falling scoops and the friends' copies. Every flavour/topping differs by
 * brightness AND pattern (chips, seeds, stripes), never by hue alone, so it reads in R-only and
 * G-only.
 */
import * as THREE from 'three';
import type { ConeId, FlavourId, SauceId, ToppingId } from './logic';
import { Kit, T, blob, cone, cyl, hemi, sphere, torus } from './kit';

/** Hero-cone dimensions (a chunky toy scale so it reads from the counter camera). */
export const CONE = { height: 0.42, rim: 0.15, scoop: 0.165, step: 0.215 } as const;

export const FLAVOUR_COLOR: Readonly<Record<FlavourId, number>> = {
  vanilla: 0xfff1cf,
  choc: 0x5b3421,
  berry: 0xf38fb1,
  mint: 0x9fe8c2,
  blue: 0x4f69c9,
};
/** Chips/seeds/flecks: dark on light flavours, light on dark ones. */
const FLAVOUR_CHIP: Readonly<Record<FlavourId, number>> = {
  vanilla: 0x2a1a10,
  choc: 0xfff4dc,
  berry: 0x5a1020,
  mint: 0x2a1408,
  blue: 0xf4f6ff,
};
const FLAVOUR_CHIPS: Readonly<Record<FlavourId, number>> = { vanilla: 5, choc: 9, berry: 12, mint: 9, blue: 10 };

export const SAUCE_COLOR: Readonly<Record<SauceId, number>> = { fudge: 0x3a1c0e, strawberry: 0xd8486a, caramel: 0xf2b84e };

const WAFFLE = 0xdba25c;
const WAFFLE_DARK = 0x9a6430;

/** Deterministic 0..1 noise. */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Waffle grid painter in the cone's local space (diagonal criss-cross of darker lines). */
function wafflePaint(dark = WAFFLE_DARK, light = WAFFLE): (x: number, y: number, z: number) => THREE.Color {
  const cd = new THREE.Color(dark);
  const cl = new THREE.Color(light);
  return (x, y, z) => {
    const a = Math.atan2(x, z);
    const u = a * 3 + y * 22;
    const v = a * 3 - y * 22;
    const line = Math.min(Math.abs(u - Math.round(u)), Math.abs(v - Math.round(v)));
    return line < 0.12 ? cd : cl;
  };
}

/** A cone with its tip at the origin and the rim at y = CONE.height (local). */
export function addCone(k: Kit, id: ConeId, m: THREE.Matrix4, scale = 1): void {
  const h = CONE.height * scale;
  const r = CONE.rim * scale;
  // Fine vertical segments so the waffle painter has vertices to colour.
  const g = new THREE.ConeGeometry(1, 1, 18, 8, true).rotateX(Math.PI).translate(0, 0.5, 0);
  const local = T(0, 0, 0, 0, r, h, r);
  if (id === 'waffle') {
    k.add(g, wafflePaint(), m.clone().multiply(local));
  } else if (id === 'choco') {
    // Waffle bottom, chocolate-dipped top with white sprinkles.
    const dip = new THREE.Color(0x3b2012);
    const waffle = wafflePaint();
    k.add(g, (x, y, z) => (y > 0.62 ? dip : waffle(x, y, z)), m.clone().multiply(local));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + hash(i) * 0.4;
      const yy = h * (0.72 + hash(i + 7) * 0.2);
      const rr = r * (yy / h) + 0.004;
      k.add(sphere(4, 3), 0xfffaf0, m.clone().multiply(T(Math.sin(a) * rr, yy, Math.cos(a) * rr, a, 0.012 * scale, 0.006 * scale, 0.026 * scale)));
    }
  } else {
    // Rainbow: bold bands that alternate light and dark (readable in either channel).
    const bands = [0xfff1a8, 0x7a2e8a, 0xa8f0d0, 0x2a5aa8, 0xffc0d8, 0x8a3a20];
    k.add(g, (_x, y) => new THREE.Color(bands[Math.min(bands.length - 1, Math.floor(y * bands.length))]), m.clone().multiply(local));
  }
  // The inside, seen from above before the first scoop.
  k.add(new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), 0x6a4020, m.clone().multiply(T(0, h * 0.93, 0, 0, r * 0.94, 1, r * 0.94)));
  // Rolled rim.
  k.add(torus(r * 0.98, 0.018 * scale, Math.PI * 2, 20).rotateX(Math.PI / 2), id === 'choco' ? 0x3b2012 : WAFFLE_DARK, m.clone().multiply(T(0, h, 0)));
}

/** A scoop sitting with its base at the origin. */
export function addScoop(k: Kit, f: FlavourId, m: THREE.Matrix4, seed = 0, scale = 1): void {
  const r = CONE.scoop * scale;
  const c = FLAVOUR_COLOR[f];
  k.add(sphere(14, 10), c, m.clone().multiply(T(0, r * 0.8, 0, 0, r, r * 0.86, r)));
  // The scooped "lip" around the bottom.
  const lip = new THREE.Color(c).multiplyScalar(0.86);
  k.add(torus(r * 0.92, r * 0.16, Math.PI * 2, 18).rotateX(Math.PI / 2), lip, m.clone().multiply(T(0, r * 0.22, 0)));
  const chips = FLAVOUR_CHIPS[f];
  for (let i = 0; i < chips; i++) {
    const a = hash(seed * 31 + i) * Math.PI * 2;
    const el = 0.15 + hash(seed * 17 + i * 3) * 1.1;
    const x = Math.cos(el) * Math.sin(a) * r * 1.0;
    const y = r * 0.8 + Math.sin(el) * r * 0.86;
    const z = Math.cos(el) * Math.cos(a) * r * 1.0;
    const sz = (f === 'berry' ? 0.012 : 0.018) * scale;
    k.add(blob(), FLAVOUR_CHIP[f], m.clone().multiply(T(x, y, z, a, sz, sz * 0.7, sz * 1.2)));
  }
}

/** Sauce draped over a scoop whose base is at the origin. */
export function addSauce(k: Kit, s: SauceId, m: THREE.Matrix4, scale = 1): void {
  const r = CONE.scoop * scale;
  const c = SAUCE_COLOR[s];
  k.add(hemi(14, 5), c, m.clone().multiply(T(0, r * 1.0, 0, 0, r * 1.04, r * 0.74, r * 1.04)));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const len = r * (0.35 + hash(i + 3) * 0.4);
    k.add(cyl(6), c, m.clone().multiply(T(Math.sin(a) * r * 0.98, r * 1.02 - len, Math.cos(a) * r * 0.98, a, 0.022 * scale, len, 0.022 * scale)));
    k.add(sphere(6, 4), c, m.clone().multiply(T(Math.sin(a) * r * 0.98, r * 1.02 - len, Math.cos(a) * r * 0.98, 0, 0.027 * scale, 0.032 * scale, 0.027 * scale)));
  }
}

/** One rubber duck, base at the origin, facing +Z. */
export function addDuck(k: Kit, m: THREE.Matrix4, s = 1): void {
  k.add(sphere(10, 8), 0xffd93b, m.clone().multiply(T(0, 0.05 * s, 0, 0, 0.07 * s, 0.05 * s, 0.085 * s)));
  k.add(sphere(10, 8), 0xffd93b, m.clone().multiply(T(0, 0.115 * s, 0.045 * s, 0, 0.045 * s, 0.045 * s, 0.045 * s)));
  k.add(sphere(6, 4), 0xe0701a, m.clone().multiply(T(0, 0.108 * s, 0.092 * s, 0, 0.022 * s, 0.01 * s, 0.026 * s)));
  for (const sx of [-1, 1]) k.add(sphere(6, 4), 0x111111, m.clone().multiply(T(sx * 0.024 * s, 0.13 * s, 0.078 * s, 0, 0.009 * s, 0.011 * s, 0.006 * s)));
}

/** A topping crowning a cone whose top scoop's base is at the origin. */
export function addTopping(k: Kit, t: ToppingId, m: THREE.Matrix4, seed = 0, scale = 1): void {
  const r = CONE.scoop * scale;
  const top = r * 1.62;
  switch (t) {
    case 'worms':
      // Two-tone gummy worms draped over the scoop.
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + seed;
        for (let j = 0; j < 4; j++) {
          k.add(
            torus(r * 0.55, 0.02 * scale, Math.PI / 4, 4),
            j % 2 ? 0xfff07a : 0x6a1a4a,
            m.clone().multiply(T(Math.sin(a) * r * 0.25, top * 0.78, Math.cos(a) * r * 0.25, a, 1, 1, 1, Math.PI / 2 - 0.4, (j * Math.PI) / 4)),
          );
        }
      }
      break;
    case 'popcorn':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + hash(seed + i);
        const rr = i < 5 ? r * 0.55 : 0;
        const y = i < 5 ? top * 0.86 : top * 1.02;
        k.add(blob(), i % 2 ? 0xfffbea : 0xf6e2a8, m.clone().multiply(T(Math.sin(a) * rr, y, Math.cos(a) * rr, a, 0.05 * scale, 0.042 * scale, 0.05 * scale)));
      }
      break;
    case 'pickle':
      // One whole pickle stuck in the top like a flag (silly!).
      k.add(new THREE.CapsuleGeometry(0.035 * scale, 0.16 * scale, 4, 10), 0x3f6a2a, m.clone().multiply(T(0.02, top + 0.06 * scale, 0, 0, 1, 1, 1, 0, -0.35)));
      for (let i = 0; i < 6; i++) {
        k.add(sphere(4, 3), 0x7aa84a, m.clone().multiply(T(0.02 + Math.sin(-0.35) * -(0.04 + i * 0.025) * scale, top + (0.0 + i * 0.024) * scale, 0.032 * scale, 0, 0.012 * scale, 0.012 * scale, 0.012 * scale)));
      }
      break;
    case 'duck':
      addDuck(k, m.clone().multiply(T(0, top * 0.92, 0)), 1.25 * scale);
      break;
    case 'sprinkles':
      for (let i = 0; i < 26; i++) {
        const a = hash(seed * 13 + i) * Math.PI * 2;
        const el = 0.35 + hash(seed * 7 + i * 5) * 1.15;
        const x = Math.cos(el) * Math.sin(a) * r * 1.02;
        const y = r * 0.8 + Math.sin(el) * r * 0.88;
        const z = Math.cos(el) * Math.cos(a) * r * 1.02;
        k.add(cyl(4), i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0x2a1a3a : 0xffd93b, m.clone().multiply(T(x, y, z, a, 0.008 * scale, 0.04 * scale, 0.008 * scale, 1.2, hash(i) * 3)));
      }
      break;
    case 'marsh':
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const rr = i < 3 ? r * 0.45 : 0;
        const y = i < 3 ? top * 0.82 : top * 0.98;
        k.add(cyl(10), i % 2 ? 0xfff8fb : 0xf2b2cc, m.clone().multiply(T(Math.sin(a) * rr, y, Math.cos(a) * rr, a, 0.045 * scale, 0.07 * scale, 0.045 * scale, 0.3, 0.2)));
      }
      break;
  }
}

/** Contents of a topping bowl on the back counter (bowl rim at the origin). */
export function addBowlContents(k: Kit, t: ToppingId, m: THREE.Matrix4): void {
  const mm = (x: number, y: number, z: number): THREE.Matrix4 => m.clone().multiply(T(x, y, z));
  switch (t) {
    case 'worms':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        k.add(torus(0.07, 0.016, Math.PI * 1.1, 8), i % 2 ? 0xfff07a : 0x6a1a4a, m.clone().multiply(T(Math.sin(a) * 0.06, 0.0, Math.cos(a) * 0.06, a, 1, 1, 1, Math.PI / 2, 0)));
      }
      break;
    case 'popcorn':
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + hash(i);
        const rr = (i % 3) * 0.05;
        k.add(blob(), i % 2 ? 0xfffbea : 0xf6e2a8, m.clone().multiply(T(Math.sin(a) * rr, 0.02 + (i % 2) * 0.03, Math.cos(a) * rr, a, 0.045, 0.04, 0.045)));
      }
      break;
    case 'pickle':
      for (let i = 0; i < 3; i++) {
        k.add(new THREE.CapsuleGeometry(0.03, 0.13, 4, 8), 0x3f6a2a, m.clone().multiply(T(-0.06 + i * 0.06, 0.03, 0, i * 0.5, 1, 1, 1, Math.PI / 2 - 0.2, 0)));
      }
      break;
    case 'duck':
      addDuck(k, mm(-0.05, 0.0, 0.01), 1.1);
      addDuck(k, m.clone().multiply(T(0.07, 0.0, -0.03, 0.8)), 0.9);
      break;
    case 'sprinkles':
      for (let i = 0; i < 40; i++) {
        const a = hash(i * 3.3) * Math.PI * 2;
        const rr = hash(i * 1.7) * 0.11;
        k.add(cyl(4), i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0x2a1a3a : 0xffd93b, m.clone().multiply(T(Math.sin(a) * rr, 0.02 + hash(i) * 0.02, Math.cos(a) * rr, a, 0.008, 0.035, 0.008, Math.PI / 2, 0)));
      }
      break;
    case 'marsh':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const rr = i < 5 ? 0.07 : 0;
        k.add(cyl(10), i % 2 ? 0xfff8fb : 0xf2b2cc, m.clone().multiply(T(Math.sin(a) * rr, 0.0 + (i === 5 ? 0.04 : 0), Math.cos(a) * rr, a, 0.04, 0.06, 0.04)));
      }
      break;
  }
}

/** A flavour dome in a tub (tub rim at the origin), with a scoop dent and chips. */
export function addTubDome(k: Kit, f: FlavourId, m: THREE.Matrix4, seed: number): void {
  k.add(hemi(14, 5), FLAVOUR_COLOR[f], m.clone().multiply(T(0, -0.02, 0, 0, 0.155, 0.07, 0.155)));
  k.add(sphere(10, 8), new THREE.Color(FLAVOUR_COLOR[f]).multiplyScalar(0.9), m.clone().multiply(T(0.03, 0.05, 0.02, 0, 0.075, 0.06, 0.075)));
  const chips = FLAVOUR_CHIPS[f];
  for (let i = 0; i < chips; i++) {
    const a = hash(seed * 9 + i) * Math.PI * 2;
    const rr = 0.03 + hash(seed * 5 + i) * 0.1;
    k.add(blob(), FLAVOUR_CHIP[f], m.clone().multiply(T(Math.sin(a) * rr, 0.035 - rr * 0.12, Math.cos(a) * rr, a, 0.014, 0.01, 0.018)));
  }
}

/** A squeeze bottle (base at the origin). */
export function addBottle(k: Kit, s: SauceId, m: THREE.Matrix4): void {
  const c = SAUCE_COLOR[s];
  k.add(cyl(14), c, m.clone().multiply(T(0, 0, 0, 0, 0.075, 0.26, 0.075)));
  k.add(cyl(14), 0xfafafa, m.clone().multiply(T(0, 0.09, 0, 0, 0.078, 0.07, 0.078)));
  k.add(sphere(10, 6), c, m.clone().multiply(T(0, 0.26, 0, 0, 0.075, 0.04, 0.075)));
  k.add(cone(10), 0xfafafa, m.clone().multiply(T(0, 0.27, 0, 0, 0.03, 0.12, 0.03)));
  k.add(sphere(8, 6), c, m.clone().multiply(T(0, 0.125, 0.076, 0, 0.034, 0.034, 0.006)));
}

/** A scoop that has fallen off: a flat splat (base at the origin). */
export function addSplat(k: Kit, f: FlavourId, m: THREE.Matrix4): void {
  const c = FLAVOUR_COLOR[f];
  k.add(sphere(12, 6), c, m.clone().multiply(T(0, 0.02, 0, 0, CONE.scoop * 1.25, 0.05, CONE.scoop * 1.1)));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    k.add(sphere(6, 4), c, m.clone().multiply(T(Math.sin(a) * CONE.scoop * 1.35, 0.01, Math.cos(a) * CONE.scoop * 1.25, 0, 0.05, 0.025, 0.05)));
  }
}
