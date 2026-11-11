/**
 * Goofy face items (face anchor: front of the face, +Z out of the face, eyes at about x = ±0.15).
 * Dark frames against bright lenses/eyes (and the reverse), so each reads in R alone and G alone.
 */
import * as THREE from 'three';
import { P, Wobble, at, ball, box, cyl, goofy, paintBy, slab, torus, tube } from './kit';
import type { Geo, Wearable } from './kit';

const DX = 0.15;

/** Giant round glasses with huge magnified eyes. */
export function buildBigGlasses(): Wearable {
  const body: Geo[] = [P(at(box(0.1, 0.035, 0.03, 0.012), 0, 0.03, 0.02), 0x14141c, 0.8)];
  const eyes: Geo[] = [];
  for (const s of [-1, 1]) {
    body.push(P(at(torus(0.135, 0.028, 6, 20), s * (DX + 0.02), 0, 0.02), 0x14141c, 0.75));
    body.push(P(at(cyl(0.13, 0.13, 0.01, 16).rotateX(Math.PI / 2), s * (DX + 0.02), 0, 0.0), 0xf4fbff, 0.95));
    body.push(P(at(box(0.025, 0.03, 0.3, 0.01), s * (DX + 0.15), 0.02, -0.15), 0x14141c, 0.8));
    eyes.push(P(at(ball(0.07, 12, 8).scale(1, 1, 0.3), s * (DX + 0.02), -0.01, 0.018), 0x101018, 1, 0.9));
    eyes.push(P(at(ball(0.022, 6, 4).scale(1, 1, 0.3), s * (DX + 0.02) - 0.025, 0.02, 0.04), 0xffffff, 1, 1.1));
  }
  return goofy({
    body,
    moving: eyes,
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      p.position.set(Math.sin(w.time * 0.8) * 0.02, a * 0.04, 0);
    },
    offset: [0, 0, 0.07],
    material: { roughness: 0.3 },
  });
}

/** Big round clown nose with a shiny white spot. */
export function buildClownNose(): Wearable {
  return goofy({
    moving: [P(at(ball(0.085, 14, 10), 0, -0.08, 0.09), 0xe8202a, 0.55, 1.1), P(at(ball(0.025, 8, 6), -0.03, -0.05, 0.16), 0xffffff, 1, 1.1)],
    pivot: [0, -0.08, 0.05],
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      const s = 1 + Math.max(0, Math.sin(w.time * 2.5)) * 0.08 + a * 0.2;
      p.scale.set(s, s, s);
    },
    offset: [0, 0, 0.04],
    material: { roughness: 0.25 },
  });
}

/** Curly moustache that boings when you move. */
export function buildMoustache(): Wearable {
  const parts: Geo[] = [P(at(ball(0.06, 10, 6).scale(1.6, 0.8, 0.8), 0, -0.13, 0.09), 0x2a1a10, 0.7)];
  for (const s of [-1, 1]) {
    parts.push(P(tube([[0, -0.13, 0.1], [s * 0.1, -0.15, 0.1], [s * 0.2, -0.11, 0.07], [s * 0.24, -0.04, 0.06], [s * 0.2, -0.02, 0.06]], 0.032, 14, 6), 0x2a1a10, 0.7));
  }
  return goofy({
    moving: parts,
    pivot: [0, -0.13, 0.1],
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      p.rotation.z = Math.sin(w.time * 6) * 0.03;
      p.scale.set(1, 1 + a * 0.6, 1);
    },
    wobble: new Wobble(110, 4, 0.08, 0.02, 6),
    offset: [0, 0, 0.03],
    material: { roughness: 0.9 },
  });
}

/** Silly disguise: round black glasses, a big nose, bushy brows and a moustache. */
export function buildDisguise(): Wearable {
  const body: Geo[] = [P(at(box(0.08, 0.025, 0.025, 0.01), 0, 0.02, 0), 0x0d0d14, 0.8)];
  for (const s of [-1, 1]) {
    body.push(P(at(torus(0.085, 0.02, 5, 16), s * DX, 0, 0), 0x0d0d14, 0.8));
    body.push(P(at(cyl(0.08, 0.08, 0.008, 18).rotateX(Math.PI / 2), s * DX, 0, -0.005), 0xcfe8ff, 0.95));
    body.push(P(at(ball(0.06, 8, 6).scale(1.6, 0.55, 0.6), s * DX, 0.12, 0.02, 0, 0, -s * 0.15), 0x1a1008, 0.8));
    body.push(P(at(box(0.02, 0.025, 0.28, 0.01), s * (DX + 0.09), 0.01, -0.14), 0x0d0d14, 0.8));
    body.push(P(tube([[0, -0.15, 0.1], [s * 0.08, -0.17, 0.09], [s * 0.15, -0.14, 0.06]], 0.035, 8, 6), 0x1a1008, 0.8));
  }
  body.push(P(at(ball(0.07, 12, 8).scale(0.9, 1.1, 1.3), 0, -0.06, 0.1), 0xf6b48a, 0.6, 1.05));
  return goofy({ body, offset: [0, 0, 0.07], material: { roughness: 0.5 } });
}

function heart(r: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([(x / 17) * r, (y / 17) * r]);
  }
  return pts;
}

/** Heart-shaped shades: bright pink frames, dark lenses with a white glint. */
export function buildHeartShades(): Wearable {
  const body: Geo[] = [P(at(box(0.08, 0.025, 0.025, 0.01), 0, 0.04, 0), 0xff6ab4, 0.7, 1.1)];
  for (const s of [-1, 1]) {
    body.push(P(at(slab(heart(0.12), 0.02, 0.008), s * DX, 0, -0.005), 0xff6ab4, 0.7, 1.1));
    body.push(P(at(slab(heart(0.09), 0.02, 0.004), s * DX, 0.005, 0.008), 0x0a0a12, 1, 0.9));
    body.push(P(at(box(0.02, 0.07, 0.006, 0.003), s * DX - 0.035, 0.025, 0.022, 0, 0, -0.5), 0xffffff, 1, 1.1));
    body.push(P(at(box(0.02, 0.025, 0.3, 0.01), s * (DX + 0.11), 0.02, -0.15), 0xff6ab4, 0.7, 1.1));
  }
  return goofy({ body, offset: [0, 0, 0.08], material: { roughness: 0.3 } });
}

/** Snorkel mask: bright yellow frame, dark glossy window, snorkel up the side. */
export function buildSnorkel(): Wearable {
  const oval = (rx: number, ry: number): [number, number][] =>
    Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2;
      return [Math.cos(a) * rx, Math.sin(a) * ry * (Math.sin(a) < 0 ? 0.85 : 1)];
    });
  const body: Geo[] = [
    P(at(slab(oval(0.3, 0.15), 0.06, 0.015), 0, 0.0, 0.0), 0xffd21f, 0.6, 1.05),
    P(at(slab(oval(0.25, 0.11), 0.06, 0.006), 0, 0.005, 0.01), 0x14304a, 0.9, 0.9),
    P(at(box(0.04, 0.12, 0.006, 0.003), -0.12, 0.02, 0.045, 0, 0, -0.5), 0xffffff, 1, 1.1),
    P(at(torus(0.29, 0.022, 6, 28, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI), 0, 0.02, -0.25), 0x1c1c26, 0.7),
    P(tube([[0.3, -0.12, -0.04], [0.33, 0.05, -0.06], [0.34, 0.25, -0.08], [0.33, 0.42, -0.08]], 0.03, 10, 6), 0xffd21f, 0.6, 1.05),
    P(at(cyl(0.04, 0.04, 0.06, 10), 0.33, 0.45, -0.08), 0xff7414, 0.7),
  ];
  return goofy({ body, offset: [0, 0.01, 0.05], material: { roughness: 0.25 } });
}

/** Googly eyes: two big white eyes whose pupils jiggle about. */
export function buildGooglyEyes(): Wearable {
  const body: Geo[] = [];
  const pupils: Geo[] = [];
  for (const s of [-1, 1]) {
    body.push(P(at(cyl(0.1, 0.1, 0.05, 20).rotateX(Math.PI / 2), s * DX, 0.02, 0.02), 0xffffff, 0.85, 1.05));
    body.push(P(at(torus(0.1, 0.012, 6, 20), s * DX, 0.02, 0.045), 0x14141c, 0.8));
    pupils.push(P(at(cyl(0.05, 0.05, 0.02, 16).rotateX(Math.PI / 2), s * DX, 0.02, 0.055), 0x0a0a12, 1, 0.8));
  }
  const w2 = new Wobble(60, 2, 0.12, 0.0, 1.3, 0.7);
  return goofy({
    body,
    moving: pupils,
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      const b = w2.step(dt, speed * 0.7);
      const t = w.time;
      p.position.set(Math.sin(t * 1.9) * 0.02 + b * 0.05, -0.02 + Math.cos(t * 2.7) * 0.012 + a * 0.05, 0);
    },
    offset: [0, 0, 0.05],
    material: { roughness: 0.3 },
  });
}

/** Superhero eye mask: dark, with a bright edge, tied at the back with flappy ribbons. */
export function buildHeroMask(): Wearable {
  const outline: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = -0.3 + t * 0.6;
    outline.push([x, 0.06 + 0.05 * Math.cos(t * Math.PI * 2) + 0.03 * Math.abs(Math.sin(t * Math.PI * 2))]);
  }
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = 0.3 - t * 0.6;
    outline.push([x, -0.07 - 0.03 * Math.cos(t * Math.PI * 2) + (Math.abs(x) < 0.05 ? 0.04 : 0)]);
  }
  const mask = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const s of [-1, 1]) {
    const hole = new THREE.Path();
    hole.absellipse(s * DX, 0.005, 0.065, 0.045, 0, Math.PI * 2, false, s * 0.2);
    mask.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(mask, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 1, curveSegments: 8 });
  const body: Geo[] = [paintBy(geo, (x, y) => (Math.abs(y) > 0.075 || Math.abs(x) > 0.28 ? 0xffd21f : 0x2a1060), 0.65, 1.05)];
  const ribbons: Geo[] = [];
  for (const s of [-1, 1]) {
    body.push(P(at(box(0.02, 0.03, 0.3, 0.01), s * 0.3, 0.0, -0.15), 0x2a1060, 0.7));
    ribbons.push(P(at(box(0.1, 0.025, 0.012, 0.005), s * 0.05, -0.04, 0, 0, 0, s * 1.1), 0x2a1060, 0.7));
  }
  return goofy({
    body,
    moving: ribbons,
    pivot: [0, 0, -0.32],
    animate: (p, w, dt, speed) => {
      p.rotation.x = w.step(dt, speed) * 0.8 + Math.sin(w.time * 5) * 0.08;
    },
    offset: [0, 0.01, 0.06],
  });
}

/** Big fluffy white beard that bounces. */
export function buildBeard(): Wearable {
  const puffs: Geo[] = [];
  const spots: [number, number, number, number][] = [
    [0, -0.2, 0.09, 0.11], [-0.11, -0.16, 0.06, 0.09], [0.11, -0.16, 0.06, 0.09], [-0.19, -0.08, 0.02, 0.07], [0.19, -0.08, 0.02, 0.07],
    [-0.06, -0.32, 0.07, 0.09], [0.06, -0.32, 0.07, 0.09], [0, -0.43, 0.06, 0.08], [0, -0.53, 0.05, 0.06],
  ];
  for (const [x, y, z, r] of spots) puffs.push(P(at(ball(r, 10, 6), x, y, z), 0xffffff, 0.6, 1.02));
  for (const s of [-1, 1]) puffs.push(P(at(ball(0.07, 8, 6).scale(1.5, 0.6, 0.7), s * 0.07, -0.1, 0.12, 0, 0, -s * 0.3), 0xe8e8ee, 0.7));
  return goofy({
    moving: puffs,
    pivot: [0, -0.1, 0.06],
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      p.rotation.x = a * 0.6;
      p.scale.y = 1 + Math.sin(w.time * 2.4) * 0.03;
    },
    offset: [0, 0, 0.0],
    material: { roughness: 0.95 },
  });
}

/** Robot visor: a bright scanning stripe in a dark band. */
export function buildVisor(): Wearable {
  const band = new THREE.CylinderGeometry(0.3, 0.3, 0.13, 26, 1, true, -1.25, 2.5).translate(0, 0, -0.27);
  const body: Geo[] = [
    paintBy(band, () => 0x14161e, 0.6),
    P(at(torus(0.3, 0.012, 4, 26, 2.5).rotateX(Math.PI / 2).rotateY(1.25 - Math.PI / 2), 0, 0.065, -0.27), 0xffd21f, 0.7),
    P(at(torus(0.3, 0.012, 4, 26, 2.5).rotateX(Math.PI / 2).rotateY(1.25 - Math.PI / 2), 0, -0.065, -0.27), 0xffd21f, 0.7),
  ];
  const stripe = new THREE.CylinderGeometry(0.305, 0.305, 0.035, 8, 1, true, -0.2, 0.4).translate(0, 0, -0.27);
  return goofy({
    body,
    moving: [P(stripe, 0xffffff, 1, 1.2)],
    pivot: [0, 0, -0.27],
    animate: (p, w, dt) => {
      w.step(dt, 0);
      p.rotation.y = Math.sin(w.time * 2.2) * 0.9;
    },
    offset: [0, 0.01, 0.0],
    material: { roughness: 0.3, emissive: 0x111111 },
  });
}
