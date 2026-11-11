/**
 * Goofy hats (head anchor: origin on top of the head, +Y up, +Z forward). Sized like the chest's
 * explorer hat (crown radius ~0.22 m before the anchor's per-hero scale). Original designs.
 * Colours are chosen to differ in brightness in BOTH the R and the G channel: bright white/yellow
 * parts against dark outlines and bands.
 */
import * as THREE from 'three';
import { P, Wobble, at, ball, box, cone, cyl, eye, goofy, lathe, paintBy, slab, sway, torus, tube } from './kit';
import type { Geo, Wearable } from './kit';

const DOWN = -0.065;

/** Traffic cone: orange with two bright white bands and a dark square foot. */
export function buildConeHat(): Wearable {
  const body = paintBy(cyl(0.025, 0.17, 0.5, 16, true).translate(0, 0.29, 0), (_x, y) => ((y > 0.17 && y < 0.24) || (y > 0.32 && y < 0.38) ? 0xffffff : 0xff7414), 0.6, 1.05);
  return goofy({
    body: [P(at(box(0.42, 0.045, 0.42, 0.02), 0, 0.02, 0), 0x1c1c22, 0.7)],
    moving: [body, P(at(cyl(0.028, 0.028, 0.02, 12), 0, 0.54, 0), 0xffffff, 0.7)],
    pivot: [0, 0.04, 0],
    animate: sway(0.7),
    offset: [0, DOWN + 0.01, 0],
    tilt: [-0.06, 0, 0.05],
  });
}

/** Rubber duck sitting on the head, bobbing. */
export function buildDuckHat(): Wearable {
  const Y = 0xffd21f;
  const moving: Geo[] = [
    P(at(ball(0.2, 16, 10).scale(1.15, 0.78, 1.3), 0, 0.13, -0.02), Y, 0.6, 1.05),
    P(at(ball(0.13, 14, 10), 0, 0.33, 0.11), Y, 0.6, 1.05),
    P(at(ball(0.07, 10, 6).scale(1.1, 0.45, 1.3), 0, 0.31, 0.25), 0xff8a14, 0.7, 1.0),
    P(at(cone(0.07, 0.14, 8), 0, 0.2, -0.27, -1.1), Y, 0.6, 1.05),
    ...eye(0.065, 0.37, 0.2, 0.035, [0.4, 0, 1]),
    ...eye(-0.065, 0.37, 0.2, 0.035, [-0.4, 0, 1]),
    // Wing bumps.
    P(at(ball(0.09, 10, 6).scale(0.5, 0.7, 1.2), 0.21, 0.15, -0.02), 0xe0b010, 0.6),
    P(at(ball(0.09, 10, 6).scale(0.5, 0.7, 1.2), -0.21, 0.15, -0.02), 0xe0b010, 0.6),
  ];
  return goofy({
    moving,
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      p.rotation.x = a * 0.8;
      p.position.y = Math.abs(Math.sin(w.time * 3.2)) * 0.03;
      p.rotation.y = Math.sin(w.time * 0.9) * 0.25;
    },
    offset: [0, DOWN, 0],
    material: { roughness: 0.3 },
  });
}

/** A pizza slice standing on its crust, cheese with dark pepperoni. */
export function buildPizzaHat(): Wearable {
  const wedge = paintBy(slab([[-0.24, 0], [0.24, 0], [0.0, 0.52]], 0.045, 0.01), (_x, y) => (y < 0.07 ? 0xb8661c : 0xffcf3a), 0.6, 1.05);
  const parts: Geo[] = [wedge, P(at(cyl(0.05, 0.05, 0.5, 10).rotateZ(Math.PI / 2), 0, 0.03, 0), 0xd88a32, 0.6)];
  const spots: [number, number][] = [[0, 0.33], [-0.09, 0.16], [0.1, 0.18], [0.0, 0.11]];
  for (const [x, y] of spots) for (const z of [0.034, -0.034]) parts.push(P(at(cyl(0.042, 0.042, 0.012, 12).rotateX(Math.PI / 2), x, y, z), 0x8e1a1a, 0.8));
  // Cheese drips.
  parts.push(P(at(ball(0.03, 8, 6).scale(1, 1.6, 0.6), 0.12, 0.2, 0.03), 0xffe070, 0.7, 1.1));
  return goofy({
    moving: parts,
    pivot: [0, 0, 0],
    animate: sway(0.6),
    offset: [0, DOWN + 0.04, 0],
    tilt: [0, 0, 0.12],
  });
}

/** Giant sombrero: huge brim, zig-zag band, white pom-poms all around. */
export function buildSombrero(): Wearable {
  const brim = lathe([[0, 0.22], [0.12, 0.215], [0.16, 0.16], [0.18, 0.04], [0.26, 0.02], [0.45, 0.03], [0.6, 0.09], [0.62, 0.075], [0.45, 0.005], [0.2, -0.01], [0, -0.01]], 32);
  const felt = paintBy(brim, (x, y, z) => {
    const r = Math.hypot(x, z);
    if (r > 0.57) return 0xffffff;
    if (r < 0.19 && y > 0.05 && y < 0.11) return Math.floor((Math.atan2(x, z) / Math.PI) * 10 + (y - 0.05) * 160) % 2 === 0 ? 0x1d2a8a : 0xffffff;
    return 0xe8b04a;
  }, 0.55, 1.05);
  const parts: Geo[] = [felt];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(P(at(ball(0.03, 6, 4), Math.sin(a) * 0.62, 0.055, Math.cos(a) * 0.62), i % 2 ? 0xffffff : 0x1d2a8a, 0.7, 1.05));
  }
  return goofy({ body: parts, offset: [0, DOWN, 0], tilt: [-0.08, 0, -0.06] });
}

/** Chef's hat: white band, big floppy puff that wobbles. */
export function buildChefHat(): Wearable {
  const puff: Geo[] = [P(at(ball(0.25, 16, 10).scale(1, 0.75, 1), 0, 0.3, 0), 0xffffff, 0.55, 1.0)];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    puff.push(P(at(ball(0.13, 10, 6), Math.sin(a) * 0.17, 0.33, Math.cos(a) * 0.17), 0xf4f4f0, 0.55, 1.0));
  }
  return goofy({
    body: [P(at(cyl(0.21, 0.2, 0.2, 20, true), 0, 0.1, 0), 0xf0f0ea, 0.55), P(at(torus(0.205, 0.014, 6, 20).rotateX(Math.PI / 2), 0, 0.02, 0), 0x2a2f3a, 0.8)],
    moving: puff,
    pivot: [0, 0.2, 0],
    animate: sway(1.1),
    offset: [0, DOWN, 0],
  });
}

/** Viking helmet: silver dome, gold band, big boingy horns. */
export function buildVikingHelmet(): Wearable {
  const dome = new THREE.SphereGeometry(0.24, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2);
  const body: Geo[] = [
    P(dome, 0xb8c0ca, 0.5, 1.05),
    P(at(torus(0.24, 0.025, 6, 22).rotateX(Math.PI / 2), 0, 0.01, 0), 0xffc928, 0.6, 1.08),
    P(at(box(0.05, 0.26, 0.04, 0.02), 0, 0.12, 0.2, -0.5), 0xffc928, 0.6, 1.08),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    body.push(P(at(ball(0.018, 6, 4), Math.sin(a) * 0.255, 0.01, Math.cos(a) * 0.255), 0x2a2f3a, 0.8));
  }
  const horns: Geo[] = [];
  for (const s of [-1, 1]) {
    horns.push(P(tube([[s * 0.2, 0.12, 0], [s * 0.34, 0.2, 0.02], [s * 0.4, 0.36, 0.05], [s * 0.36, 0.5, 0.06]], 0.045, 12, 8), 0xfff2d0, 0.6, 1.05));
    horns.push(P(at(cone(0.04, 0.09, 8), s * 0.35, 0.54, 0.06, 0, 0, s * 0.35), 0x3a2a18, 0.8));
  }
  return goofy({
    body,
    moving: horns,
    pivot: [0, 0.12, 0],
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      p.rotation.z = a * 0.5;
      p.scale.set(1, 1 + a * 0.3, 1);
    },
    wobble: new Wobble(90, 3.5, 0.08, 0.06, 3),
    offset: [0, DOWN, 0],
    material: { roughness: 0.35, metalness: 0.25 },
  });
}

/** Unicorn horn (bright spiral) with two little ears and a mane tuft. */
export function buildUnicornHorn(): Wearable {
  const horn = paintBy(cone(0.07, 0.42, 16).translate(0, 0.21, 0), (x, y, z) => (Math.floor((Math.atan2(x, z) / (Math.PI * 2) + y * 9) * 2 + 100) % 2 === 0 ? 0xffffff : 0xffc928), 0.65, 1.05);
  const body: Geo[] = [P(at(torus(0.21, 0.025, 6, 20).rotateX(Math.PI / 2), 0, 0.02, 0), 0xff9ad0, 0.7)];
  for (const s of [-1, 1]) {
    body.push(P(at(cone(0.07, 0.16, 8), s * 0.15, 0.07, -0.03, -0.1, 0, -s * 0.3), 0xffffff, 0.7));
    body.push(P(at(cone(0.04, 0.1, 8), s * 0.15, 0.065, -0.005, -0.1, 0, -s * 0.3), 0x6a2a8a, 0.8));
  }
  for (let i = 0; i < 4; i++) body.push(P(at(ball(0.06, 8, 6), 0, 0.03 - i * 0.02, -0.08 - i * 0.07), [0xa064ff, 0xffffff, 0xff9ad0, 0xffe24a][i] ?? 0xffffff, 0.65));
  return goofy({
    body,
    moving: [at(horn, 0, 0.02, 0.1, 0.45)],
    pivot: [0, 0.02, 0.1],
    animate: sway(0.5),
    offset: [0, DOWN, 0],
    material: { roughness: 0.35 },
  });
}

/** Dino hood: dark green cap with bright spikes, googly eyes and a row of white teeth. */
export function buildDinoHood(): Wearable {
  const hood = new THREE.SphereGeometry(0.26, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const body: Geo[] = [P(at(hood, 0, -0.04, -0.02), 0x2f7a3a, 0.55, 1.0), ...eye(0.11, 0.17, 0.14, 0.06), ...eye(-0.11, 0.17, 0.14, 0.06)];
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 2.2;
    body.push(P(at(cone(0.022, 0.06, 6).rotateX(Math.PI), Math.sin(a) * 0.255, 0.0, Math.cos(a) * 0.255), 0xffffff, 0.8));
  }
  const spikes: Geo[] = [];
  for (let i = 0; i < 5; i++) {
    const a = -0.2 - i * 0.42;
    const y = Math.cos(a) * 0.24 - 0.04;
    const z = Math.sin(a) * 0.24 - 0.02;
    spikes.push(P(at(cone(0.06 - i * 0.006, 0.16 - i * 0.012, 4).scale(0.45, 1, 1), 0, y + 0.05, z, a), 0xffc928, 0.65, 1.08));
  }
  return goofy({ body, moving: spikes, pivot: [0, 0.2, -0.05], animate: sway(0.4), offset: [0, DOWN, 0] });
}

/** Shark fin on a headband, wiggling. */
export function buildSharkFin(): Wearable {
  const fin = paintBy(slab([[-0.17, 0], [0.13, 0], [0.11, 0.06], [-0.02, 0.2], [-0.18, 0.38], [-0.1, 0.16]], 0.05, 0.012), (_x, y) => (y < 0.06 ? 0xffffff : 0x4a6a8a), 0.55, 1.05);
  return goofy({
    body: [P(at(torus(0.215, 0.022, 6, 22).rotateX(Math.PI / 2), 0, 0.01, 0), 0x1c2230, 0.7)],
    moving: [at(fin, 0, 0.0, 0.02, 0, Math.PI / 2, 0)],
    pivot: [0, 0, 0],
    animate: (p, w, dt, speed) => {
      p.rotation.z = w.step(dt, speed) * 0.6;
      p.rotation.y = Math.sin(w.time * 4) * 0.12;
    },
    offset: [0, DOWN + 0.03, 0],
  });
}

/** Antlers with little bright bells, wobbling. */
export function buildAntlers(): Wearable {
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    parts.push(P(tube([[s * 0.12, 0.02, 0], [s * 0.2, 0.17, -0.02], [s * 0.25, 0.32, -0.04], [s * 0.36, 0.44, -0.06]], 0.028, 10, 6), 0x7a4a22, 0.6));
    parts.push(P(tube([[s * 0.2, 0.17, -0.02], [s * 0.12, 0.3, 0.0], [s * 0.1, 0.4, 0.02]], 0.022, 8, 6), 0x7a4a22, 0.6));
    parts.push(P(tube([[s * 0.25, 0.32, -0.04], [s * 0.38, 0.33, -0.02], [s * 0.46, 0.38, 0.0]], 0.02, 8, 6), 0x7a4a22, 0.6));
    for (const [x, y, z] of [[0.1, 0.42, 0.02], [0.46, 0.39, 0], [0.36, 0.46, -0.06]] as const) parts.push(P(at(ball(0.035, 8, 6), s * x, y, z), 0xffe24a, 0.75, 1.1));
  }
  return goofy({
    body: [P(at(torus(0.21, 0.02, 6, 20).rotateX(Math.PI / 2), 0, 0.02, 0), 0x2a1a10, 0.7)],
    moving: parts,
    pivot: [0, 0.02, 0],
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      p.rotation.x = a * 0.5;
      p.rotation.z = Math.sin(w.time * 2.1) * 0.05;
    },
    offset: [0, DOWN, 0],
  });
}

/** Flower pot with one huge daisy on a springy stem. */
export function buildFlowerPot(): Wearable {
  const body: Geo[] = [
    P(at(cyl(0.2, 0.15, 0.2, 16), 0, 0.1, 0), 0xc8643a, 0.55),
    P(at(cyl(0.225, 0.225, 0.06, 16), 0, 0.21, 0), 0xe07a48, 0.6, 1.05),
    P(at(cyl(0.19, 0.19, 0.02, 14), 0, 0.235, 0), 0x2a1a10, 0.8),
  ];
  const moving: Geo[] = [P(tube([[0, 0.24, 0], [0.03, 0.4, 0], [-0.02, 0.55, 0.02], [0, 0.66, 0.04]], 0.018, 10, 5), 0x2f7a3a, 0.6)];
  for (const s of [-1, 1]) moving.push(P(at(ball(0.07, 8, 6).scale(1, 0.25, 0.5), s * 0.07, 0.4, 0, 0, 0, s * 0.4), 0x3f9a4a, 0.6));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    moving.push(P(at(ball(0.065, 8, 6).scale(1, 0.45, 0.2), Math.cos(a) * 0.09, 0.7 + Math.sin(a) * 0.09, 0.05, 0, 0, a), 0xffffff, 0.75, 1.05));
  }
  moving.push(P(at(ball(0.055, 10, 6).scale(1, 1, 0.5), 0, 0.7, 0.07), 0xffc928, 0.7, 1.05));
  return goofy({ body, moving, pivot: [0, 0.24, 0], animate: sway(1.0), wobble: new Wobble(45, 2.8, 0.08, 0.08, 2), offset: [0, DOWN, 0] });
}

/** Fishbowl hat: glass bowl (one transparent draw), gravel, weed and a bright fish inside. */
export function buildFishbowl(): Wearable {
  const body: Geo[] = [
    P(at(cyl(0.16, 0.12, 0.06, 18), 0, 0.03, 0), 0xffffff, 0.6),
    P(at(cyl(0.165, 0.165, 0.04, 18), 0, 0.08, 0), 0x3a3a48, 0.8),
    P(tube([[0.06, 0.08, -0.04], [0.09, 0.18, -0.05], [0.05, 0.28, -0.06]], 0.014, 6, 5), 0x2f7a3a, 0.6),
    // Fish: bright orange body, white stripe, big eye.
    P(at(ball(0.07, 10, 6).scale(1.3, 0.8, 0.55), -0.02, 0.22, 0.03), 0xff8a14, 0.65, 1.1),
    P(at(cone(0.05, 0.07, 6).rotateZ(Math.PI / 2).scale(1, 1, 0.3), 0.09, 0.22, 0.03), 0xff8a14, 0.65, 1.1),
    P(at(ball(0.071, 10, 6).scale(0.2, 0.8, 0.56), 0.0, 0.22, 0.03), 0xffffff, 0.8),
    ...eye(-0.085, 0.235, 0.055, 0.022, [-1, 0, 0.6]),
    P(at(ball(0.015, 6, 4), -0.05, 0.33, 0.06), 0xffffff, 0.9),
    P(at(ball(0.011, 6, 4), -0.03, 0.39, 0.05), 0xffffff, 0.9),
  ];
  const glass = new THREE.SphereGeometry(0.24, 18, 12, 0, Math.PI * 2, 0.35, Math.PI - 0.6).translate(0, 0.25, 0);
  const water = new THREE.SphereGeometry(0.23, 16, 8, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.45).translate(0, 0.25, 0);
  return goofy({
    body,
    glass: { parts: [P(glass, 0xd8f4ff, 0.9, 1.05), P(water, 0x6ad0ff, 0.9)], opacity: 0.42 },
    offset: [0, DOWN + 0.02, 0],
    material: { roughness: 0.4 },
  });
}

/** Pirate tricorn: dark hat with three turned-up points, gold trim, a white star and a feather. */
export function buildTricorn(): Wearable {
  const brim = lathe([[0, 0.2], [0.15, 0.2], [0.2, 0.15], [0.22, 0.03], [0.3, 0.02], [0.38, 0.04], [0.39, 0.03], [0.3, 0.0], [0.2, -0.01], [0, -0.01]], 30);
  const pos = brim.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.23) continue;
    const a = Math.atan2(x, z);
    const up = Math.pow((Math.cos(3 * a) + 1) / 2, 1.5) * 0.17 * ((r - 0.23) / 0.16);
    pos.setY(i, pos.getY(i) + up);
  }
  brim.computeVertexNormals();
  const felt = paintBy(brim, (x, _y, z) => (Math.hypot(x, z) > 0.36 ? 0xffc928 : 0x1a1a26), 0.55, 1.05);
  const star = slab([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
    const r = i % 2 ? 0.026 : 0.062;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    return [Math.cos(a) * r, Math.sin(a) * r] as const;
  }), 0.01, 0.003);
  const feather = P(at(ball(0.1, 10, 6).scale(0.35, 1.4, 0.15), 0.0, 0.0, 0.0), 0xffffff, 0.75, 1.05);
  return goofy({
    body: [felt, P(at(star, 0, 0.13, 0.215, -0.15), 0xffffff, 0.8, 1.05)],
    moving: [at(feather, -0.2, 0.3, -0.05, -0.3, 0, 0.5)],
    pivot: [-0.15, 0.18, -0.05],
    animate: sway(1.2),
    offset: [0, DOWN, 0],
  });
}

/** Magic top hat with two floppy bunny ears popping out. */
export function buildTopHat(): Wearable {
  const hat = lathe([[0, 0.42], [0.19, 0.42], [0.2, 0.4], [0.17, 0.05], [0.3, 0.02], [0.31, 0.0], [0.17, -0.01], [0, -0.01]], 24);
  const body: Geo[] = [
    paintBy(hat, (_x, y) => (y > 0.07 && y < 0.14 ? 0x8a46ff : 0x15151e), 0.55, 1.1),
    P(at(cyl(0.18, 0.18, 0.01, 18), 0, 0.425, 0), 0x050508, 1),
  ];
  const ears: Geo[] = [];
  for (const s of [-1, 1]) {
    ears.push(P(at(ball(0.06, 10, 6).scale(0.75, 2.6, 0.45), s * 0.07, 0.56, 0, 0, 0, -s * 0.2), 0xffffff, 0.75, 1.05));
    ears.push(P(at(ball(0.035, 8, 6).scale(0.7, 2.4, 0.3), s * 0.07, 0.56, 0.02, 0, 0, -s * 0.2), 0xff9ad0, 0.8));
  }
  return goofy({
    body,
    moving: ears,
    pivot: [0, 0.42, 0],
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      p.rotation.x = a;
      p.scale.y = 1 + Math.sin(w.time * 2.6) * 0.06;
    },
    wobble: new Wobble(55, 3, 0.09, 0.07, 2.6),
    offset: [0, DOWN, 0],
    tilt: [-0.05, 0, 0.08],
  });
}

/** Striped knit beanie with a giant bouncy pom-pom. */
export function buildPomBeanie(): Wearable {
  const knit = new THREE.SphereGeometry(0.235, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.15, 1);
  const body: Geo[] = [
    paintBy(knit, (_x, y) => (Math.floor(y * 18) % 2 === 0 ? 0xffffff : 0x1d3fd0), 0.55, 1.05),
    P(at(torus(0.235, 0.04, 6, 22).rotateX(Math.PI / 2), 0, 0.01, 0), 0xffd21f, 0.6, 1.05),
  ];
  const pom: Geo[] = [P(at(ball(0.13, 12, 8), 0, 0.38, 0), 0xffd21f, 0.6, 1.08)];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pom.push(P(at(ball(0.06, 6, 4), Math.sin(a) * 0.1, 0.38 + Math.cos(a * 2) * 0.05, Math.cos(a) * 0.1), 0xffe870, 0.7, 1.08));
  }
  return goofy({
    body,
    moving: pom,
    pivot: [0, 0.27, 0],
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      p.rotation.x = a * 1.2;
      p.position.y = 0.27 + Math.abs(Math.sin(w.time * 3)) * 0.02;
    },
    wobble: new Wobble(50, 3, 0.1, 0.06, 3),
    offset: [0, DOWN, 0],
  });
}

/** Birthday cake hat: two tiers, frosting drips, candles with bright flames. */
export function buildCakeHat(): Wearable {
  const body: Geo[] = [
    P(at(cyl(0.24, 0.24, 0.13, 22), 0, 0.065, 0), 0xffa0c8, 0.6),
    P(at(cyl(0.17, 0.17, 0.11, 20), 0, 0.185, 0), 0xffffff, 0.6),
    P(at(torus(0.24, 0.025, 6, 22).rotateX(Math.PI / 2), 0, 0.13, 0), 0xffffff, 0.7),
    P(at(torus(0.17, 0.022, 6, 20).rotateX(Math.PI / 2), 0, 0.24, 0), 0x6a2a8a, 0.8),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    body.push(P(at(ball(0.03, 6, 4).scale(1, 1.8, 0.7), Math.sin(a) * 0.24, 0.1, Math.cos(a) * 0.24), 0xffffff, 0.7));
  }
  const flames: Geo[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const x = Math.sin(a) * 0.09;
    const z = Math.cos(a) * 0.09;
    body.push(paintBy(at(cyl(0.016, 0.016, 0.12, 8), x, 0.3, z), (_x, y) => (Math.floor(y * 60) % 2 ? 0xffffff : 0x1d3fd0), 0.7));
    flames.push(P(at(ball(0.024, 8, 6).scale(1, 1.8, 1), x, 0.385, z), 0xffe86a, 1, 1.15));
  }
  return goofy({
    body,
    moving: flames,
    animate: (p, w, dt) => {
      w.step(dt, 0);
      p.scale.y = 1 + Math.sin(w.time * 17) * 0.015;
    },
    offset: [0, DOWN, 0],
  });
}

/** Friendly octopus hugging the head, tentacles dangling and wiggling. */
export function buildOctopusHat(): Wearable {
  const body: Geo[] = [
    P(at(ball(0.22, 14, 8).scale(1, 1.05, 1), 0, 0.18, -0.02), 0x8a46d8, 0.55, 1.05),
    ...eye(0.08, 0.2, 0.17, 0.06),
    ...eye(-0.08, 0.2, 0.17, 0.06),
    P(at(ball(0.03, 8, 6).scale(1.6, 0.6, 0.6), 0, 0.12, 0.2), 0x2a0a3a, 0.9),
  ];
  for (let i = 0; i < 4; i++) body.push(P(at(ball(0.025, 6, 4), Math.sin(i * 1.7) * 0.18, 0.28 + i * 0.02, Math.cos(i * 1.7) * 0.15 - 0.05), 0xd8b0ff, 0.8, 1.05));
  const arms: Geo[] = [];
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * Math.PI * 2;
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    if (sz > 0.6) continue; // keep the face clear
    arms.push(P(tube([[sx * 0.17, 0.04, sz * 0.17], [sx * 0.27, -0.06, sz * 0.27], [sx * 0.3, -0.2, sz * 0.3], [sx * 0.24, -0.3, sz * 0.26]], 0.035, 8, 5), 0x8a46d8, 0.55, 1.05));
    arms.push(P(at(ball(0.03, 6, 4), sx * 0.24, -0.31, sz * 0.26), 0xd8b0ff, 0.7));
  }
  return goofy({
    body,
    moving: arms,
    pivot: [0, 0.05, 0],
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      p.rotation.x = a * 0.6;
      p.scale.set(1 + Math.sin(w.time * 3.1) * 0.05, 1 + Math.sin(w.time * 3.1 + 1) * 0.07, 1);
    },
    offset: [0, DOWN, 0],
    material: { roughness: 0.35 },
  });
}

/** Jester hat: three floppy points with jingle bells. */
export function buildJesterHat(): Wearable {
  const body: Geo[] = [
    paintBy(new THREE.SphereGeometry(0.235, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), (x) => (x > 0 ? 0x1d3fd0 : 0xffd21f), 0.55, 1.05),
    P(at(torus(0.235, 0.03, 6, 22).rotateX(Math.PI / 2), 0, 0.01, 0), 0xffffff, 0.7),
  ];
  const points: Geo[] = [];
  const dirs: [number, number, number][] = [[-1, 0, 0x1d3fd0], [0, -1, 0xffd21f], [1, 0, 0x1d3fd0]];
  for (const [dx, dz, c] of dirs) {
    const tip: [number, number, number] = [dx * 0.42, 0.06, dz * 0.32];
    points.push(P(tube([[dx * 0.1, 0.17, dz * 0.08], [dx * 0.25, 0.3, dz * 0.2], [dx * 0.38, 0.22, dz * 0.3], tip], 0.05, 10, 6), c, 0.55, 1.05));
    points.push(P(at(ball(0.045, 8, 6), tip[0], tip[1] - 0.04, tip[2]), 0xffffff, 0.8, 1.08));
  }
  return goofy({
    body,
    moving: points,
    pivot: [0, 0.15, 0],
    animate: (p, w, dt, speed) => {
      const a = w.step(dt, speed);
      p.rotation.x = a * 0.6;
      p.rotation.z = Math.sin(w.time * 2.3) * 0.08;
    },
    wobble: new Wobble(50, 2.6, 0.1, 0.06, 2.3),
    offset: [0, DOWN, 0],
  });
}
