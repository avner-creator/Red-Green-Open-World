/**
 * The Scoops parlour: an open-fronted ice-cream shop with a striped scalloped awning, a giant cone
 * on the roof, a serving counter with flavour tubs, a cone rack, sauces and a sprinkles cannon, a
 * back counter with topping bowls, and a high shelf with three candy jars. A small terrace with a
 * parasol table sits in front.
 *
 * Local frame: the open front faces +Z; the floor top is at y = FLOOR. Static parts merge into two
 * draw calls (matte + gloss); the jars are an instanced pair (bodies + lids) so they can pop.
 * Light/dark stripes everywhere so the shop reads in R-only and G-only.
 */
import * as THREE from 'three';
import { FLAVOURS, SAUCES, TOPPINGS, CONES } from './logic';
import type { FlavourId, SauceId, ToppingId, ConeId } from './logic';
import { Kit, T, box, cyl, disc, glossMaterial, paintMaterial, sphere, torus } from './kit';
import { asShadowProxy } from '../../core/shadow-proxy';
import { addBottle, addBowlContents, addCone, addTubDome, hash } from './ingredients';

/** Floor top above the ground: high enough to keep the island's grass tufts under it. */
export const FLOOR = 0.5;
const COUNTER_TOP = FLOOR + 1.0;
const BACK_TOP = FLOOR + 1.0;

/**
 * Every spot the station needs, in the parlour's local frame.
 *
 * The game camera (`BUILD_CAMERA` in index.ts) stands in front of the shop, a little to the right,
 * and always centres the hero. So the hero builds at the right end of the counter, up on a chef's
 * step (seen over the counter), and everything they work with runs to their left: tubs, the cone
 * holder, the sprinkles cannon, sauces and the three jars. The cone stays ~1.9 m beside the hero's
 * head, clear of the biggest hat, and the whole row fits a 16:9 and a phone screen (QA6 M5).
 */
export const LAYOUT = {
  floor: FLOOR,
  /** Where the hero stands to build: behind the right end of the counter, on the chef's step. */
  chef: new THREE.Vector3(2.45, FLOOR + 0.45, 0.75),
  /** Where the hero walks up to (in front of the counter) and is handed back. */
  customer: new THREE.Vector3(0, FLOOR, 2.85),
  /** The E prompt. */
  prompt: new THREE.Vector3(0, COUNTER_TOP + 0.35, 2.2),
  /** The cone stands here while it is built (tip of the cone). */
  holder: new THREE.Vector3(0.55, COUNTER_TOP + 0.12, 1.72),
  coneRack: (i: number): THREE.Vector3 => new THREE.Vector3(-1.55 + i * 0.3, BACK_TOP + 0.16, -2.42),
  bottle: (i: number): THREE.Vector3 => new THREE.Vector3(-0.72 + i * 0.28, COUNTER_TOP, 1.62),
  cannon: new THREE.Vector3(0.15, COUNTER_TOP, 1.78),
  tub: (i: number): THREE.Vector3 => new THREE.Vector3(1.0 + i * 0.4, COUNTER_TOP, 1.72),
  bowl: (i: number): THREE.Vector3 => new THREE.Vector3((i < 3 ? -3.25 : 1.0) + (i % 3) * 0.6, BACK_TOP + 0.09, -2.42),
  jar: (i: number): THREE.Vector3 => new THREE.Vector3(-1.95 + i * 0.42, COUNTER_TOP + 0.06, 1.72),
  /** Friends wait here (customer side), facing the hero: one either side, off the camera's line. */
  queue: [new THREE.Vector3(-2.9, FLOOR, 2.75), new THREE.Vector3(3.35, FLOOR, 2.5)] as const,
  /** Friends hang out here while nobody is building (clear of the terrace table and the counter). */
  hangout: [new THREE.Vector3(-1.25, FLOOR, 4.25), new THREE.Vector3(2.6, FLOOR, 4.3)] as const,
  /** The terrace table (centre): a clear hero-wide way round it to the flower box. */
  table: new THREE.Vector3(-2.55, FLOOR, 4.35),
  /** Clear radius of the site (ground pad and dressing stay inside). */
  radius: 6.4,
} as const;

export const JAR = { radius: 0.19, height: 0.42 } as const;

export interface ParlourCollider {
  /** Centre (local) and half extents, yaw relative to the parlour. */
  kind: 'box' | 'cyl';
  c: THREE.Vector3;
  h: THREE.Vector3;
  /**
   * Invisible and solid only for the walking hero (camera and gameplay rays pass through): the
   * shop front above the counter, so the hero can neither get behind the counter nor stand on it.
   */
  heroOnly?: boolean;
}

/**
 * The closed shop front: the counter plus an invisible pane from its top up to the roof, wall to
 * wall (x ±3.85, over the old 0.45 m slits at the counter ends). Nobody walks or jumps behind the
 * counter or onto it; the build hop over it is scripted (QA6 counter row, round 5 M1).
 */
export const FRONT = { x: 3.85, z0: 1.33, z1: 2.11, top: FLOOR + 3.7 } as const;

export interface Parlour {
  group: THREE.Group;
  /** Jar lids are instances (index = jar); `setJar` animates a lid pop (0..1) and a wobble (0..1). */
  setJar(i: number, lidOpen: number, wobble: number): void;
  colliders: ParlourCollider[];
  dispose(): void;
}

const CREAM = 0xfaf3e3;
const RASPBERRY = 0x8a2050;
const PINK = 0xf9d3e0;
const PLUM = 0x4a2a44;
const MINT = 0xbfeedd;
const WOOD = 0x8a5a36;
const WOOD_DARK = 0x5a3a22;
const STEEL = 0xc4ccd4;

function walls(k: Kit): void {
  const H = 3.6;
  // Back wall: plum outside, pink/cream stripes inside.
  k.box(0, FLOOR + H / 2, -3.05, 8.3, H, 0.3, PLUM);
  for (let i = 0; i < 14; i++) k.box(-3.85 + 0.55 * i + 0.275, FLOOR + H / 2, -2.88, 0.55, H, 0.04, i % 2 ? CREAM : PINK);
  // Side walls with a big porthole-style band.
  for (const sx of [-1, 1]) {
    k.box(sx * 4.0, FLOOR + H / 2, -0.4, 0.3, H, 5.0, PLUM);
    k.box(sx * 3.84, FLOOR + H / 2, -0.4, 0.04, H, 5.0, PINK);
    k.box(sx * 3.82, FLOOR + 1.25, -0.4, 0.04, 0.16, 5.0, RASPBERRY);
    k.box(sx * 4.16, FLOOR + 1.25, -0.4, 0.04, 0.16, 5.0, CREAM);
    // Candy-striped corner pillars at the open front.
    for (let j = 0; j < 8; j++) k.add(cyl(14), j % 2 ? CREAM : RASPBERRY, T(sx * 3.95, FLOOR + j * (H / 8), 2.25, 0, 0.2, H / 8, 0.2));
    k.add(sphere(10, 8), 0xffd93b, T(sx * 3.95, FLOOR + H + 0.12, 2.25, 0, 0.24, 0.24, 0.24));
  }
  // Roof slab and trim.
  k.box(0, FLOOR + H + 0.15, -0.35, 8.8, 0.3, 5.9, PLUM);
  k.box(0, FLOOR + H + 0.33, -0.35, 8.6, 0.06, 5.7, CREAM);
  // Striped awning sloping out over the counter, with scallops.
  const n = 16;
  const w = 8.8 / n;
  for (let i = 0; i < n; i++) {
    const x = -4.4 + w * (i + 0.5);
    k.add(box(), i % 2 ? CREAM : RASPBERRY, T(x, FLOOR + H - 0.25, 2.95, 0, w, 0.06, 1.5, 0.42));
    const sc = new THREE.CircleGeometry(w / 2, 12, Math.PI, Math.PI);
    k.add(sc, i % 2 ? RASPBERRY : CREAM, T(x, FLOOR + H - 0.56, 3.62, 0, 1, 1, 1));
    k.add(new THREE.CircleGeometry(w / 2, 12, Math.PI, Math.PI), i % 2 ? RASPBERRY : CREAM, T(x, FLOOR + H - 0.56, 3.6, Math.PI, 1, 1, 1));
  }
  k.box(0, FLOOR + H - 0.55, 3.61, 8.8, 0.06, 0.05, PLUM);
}

function roofSign(k: Kit, g: Kit): void {
  const y = FLOOR + 3.95;
  const z = 0.4;
  // Plinth.
  k.add(cyl(18), CREAM, T(0, y, z, 0, 0.7, 0.2, 0.7));
  // Giant waffle cone (tip down) + three scoops + cherry.
  addCone(k, 'waffle', T(0, y + 0.15, z), 4.4);
  const s = 0.95;
  g.add(sphere(16, 12), 0xf38fb1, T(0, y + 2.15, z, 0, 0.72 * s, 0.6 * s, 0.72 * s));
  g.add(torus(0.62, 0.11, Math.PI * 2, 24).rotateX(Math.PI / 2), 0xd8709a, T(0, y + 1.86, z));
  g.add(sphere(16, 12), 0x5b3421, T(-0.1, y + 2.85, z, 0, 0.6 * s, 0.5 * s, 0.6 * s));
  g.add(sphere(16, 12), 0x9fe8c2, T(0.05, y + 3.4, z + 0.05, 0, 0.5 * s, 0.42 * s, 0.5 * s));
  for (let i = 0; i < 14; i++) {
    const a = hash(i) * Math.PI * 2;
    const el = 0.3 + hash(i + 5) * 1.0;
    g.add(cyl(4), i % 2 ? 0xffffff : 0x2a1a3a, T(Math.cos(el) * Math.sin(a) * 0.48, y + 3.4 + Math.sin(el) * 0.4, z + 0.05 + Math.cos(el) * Math.cos(a) * 0.48, a, 0.025, 0.11, 0.025, 1.1));
  }
  g.add(sphere(12, 10), 0xc8233a, T(0.05, y + 3.92, z + 0.05, 0, 0.16, 0.16, 0.16));
  k.add(cyl(6), 0x3a6a2a, T(0.08, y + 4.05, z + 0.05, 0, 0.015, 0.22, 0.015, 0, -0.4));
}

function counters(k: Kit, g: Kit): void {
  // Front counter: striped panel facing the customers, marble top.
  const cz = 1.72;
  k.box(0, FLOOR + 0.5, cz, 6.6, 1.0, 0.62, CREAM);
  for (let i = 0; i < 12; i++) k.box(-3.025 + i * 0.55, FLOOR + 0.52, cz + 0.315, 0.27, 0.86, 0.03, RASPBERRY);
  k.box(0, FLOOR + 0.04, cz + 0.33, 6.6, 0.08, 0.04, PLUM);
  k.box(0, COUNTER_TOP + 0.03, cz, 6.8, 0.06, 0.78, 0xf6f4f0);
  k.box(0, COUNTER_TOP + 0.005, cz + 0.39, 6.8, 0.05, 0.02, RASPBERRY);
  // Back counter.
  k.box(0, FLOOR + 0.5, -2.45, 7.5, 1.0, 0.66, MINT);
  for (let i = 0; i < 13; i++) k.box(-3.6 + i * 0.6, FLOOR + 0.5, -2.11, 0.3, 0.84, 0.02, CREAM);
  k.box(0, BACK_TOP + 0.03, -2.45, 7.6, 0.06, 0.72, 0xf6f4f0);
  // The chef's step the hero builds on: a chunky wooden crate with a light top and dark slats.
  const st = LAYOUT.chef;
  k.box(st.x, (FLOOR + st.y) / 2, st.z, 0.95, st.y - FLOOR, 0.8, WOOD);
  k.box(st.x, st.y - 0.02, st.z, 0.99, 0.04, 0.84, CREAM);
  for (const dz of [-0.2, 0.2]) k.box(st.x, (FLOOR + st.y) / 2, st.z + dz * 2.02, 0.97, 0.06, 0.02, WOOD_DARK);
  // Flavour tubs set into the counter.
  FLAVOURS.forEach((f: FlavourId, i) => {
    const p = (LAYOUT.tub(i) as THREE.Vector3).clone();
    k.add(cyl(16, 1, 0.85), STEEL, T(p.x, p.y - 0.04, p.z, 0, 0.18, 0.1, 0.18));
    k.add(torus(0.18, 0.016, Math.PI * 2, 20).rotateX(Math.PI / 2), 0xe8edf2, T(p.x, p.y + 0.06, p.z));
    addTubDome(g, f, T(p.x, p.y + 0.07, p.z), i + 1);
  });
  // Cone rack with the three cones (back counter).
  k.box(-1.25, BACK_TOP + 0.1, -2.42, 1.0, 0.14, 0.26, WOOD);
  CONES.forEach((c: ConeId, i) => {
    const p = LAYOUT.coneRack(i);
    k.add(torus(0.1, 0.016, Math.PI * 2, 16).rotateX(Math.PI / 2), WOOD_DARK, T(p.x, BACK_TOP + 0.18, p.z));
    addCone(k, c, T(p.x, BACK_TOP + 0.02, p.z), 0.8);
  });
  // Squeeze bottles.
  SAUCES.forEach((s: SauceId, i) => addBottle(g, s, T(LAYOUT.bottle(i).x, COUNTER_TOP + 0.06, LAYOUT.bottle(i).z)));
  // Sprinkles cannon: a chunky toy cannon on wheels aimed at the cone holder.
  const cp = LAYOUT.cannon;
  const cm = T(cp.x, COUNTER_TOP + 0.06, cp.z, Math.PI / 2);
  k.add(cyl(14, 0.09, 0.12), 0x2f6f8f, cm.clone().multiply(T(0, 0.12, 0, 0, 1, 0.42, 1, -Math.PI / 2 + 0.5)));
  k.add(torus(0.1, 0.025, Math.PI * 2, 16), 0xffd93b, cm.clone().multiply(T(0, 0.12 + Math.cos(0.5) * 0.0, 0.0, 0, 1, 1, 1, 0.5)));
  for (const sx of [-1, 1]) k.add(cyl(14), 0xffd93b, cm.clone().multiply(T(sx * 0.12, 0.08, -0.04, 0, 0.08, 0.04, 0.08, 0, Math.PI / 2)));
  k.add(sphere(8, 6), 0xffffff, cm.clone().multiply(T(0, 0.36, 0.2, 0, 0.03, 0.03, 0.03)));
  // Cone holder: a steel ring on a stem.
  const hp = LAYOUT.holder;
  k.add(cyl(12), STEEL, T(hp.x, COUNTER_TOP + 0.06, hp.z, 0, 0.1, 0.02, 0.1));
  k.add(cyl(8), STEEL, T(hp.x, COUNTER_TOP + 0.06, hp.z, 0, 0.018, 0.16, 0.018));
  k.add(torus(0.075, 0.014, Math.PI * 2, 16).rotateX(Math.PI / 2), STEEL, T(hp.x, hp.y + 0.1, hp.z));

  // Topping bowls on the back counter.
  TOPPINGS.forEach((t: ToppingId, i) => {
    const p = LAYOUT.bowl(i);
    k.add(new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xffffff, T(p.x, p.y, p.z, 0, 0.24, 0.14, 0.24));
    k.add(torus(0.24, 0.016, Math.PI * 2, 20).rotateX(Math.PI / 2), 0x2f3b52, T(p.x, p.y, p.z));
    addBowlContents(g, t, T(p.x, p.y - 0.02, p.z, 0, 1.4, 1.4, 1.4));
  });
}

function floorAndTerrace(k: Kit): void {
  // Plinth (deep enough to hide small terrain dips) and a checkered floor.
  k.box(0, FLOOR - 0.55, 0.75, 9.2, 1.1, 8.6, 0xe8dcc8);
  // A step all the way round (two easy 25 cm steps up), with a dark edge line.
  k.box(0, (FLOOR / 2 - 0.6) / 2, 0.75, 10.0, FLOOR / 2 + 0.6, 9.4, 0xd2c2a6);
  k.box(0, FLOOR / 2 - 0.01, 0.75, 10.02, 0.03, 9.42, 0x5a3a2a);
  const tile = 0.6;
  for (let ix = 0; ix < 15; ix++) {
    for (let iz = 0; iz < 14; iz++) {
      const x = -4.5 + tile * (ix + 0.5);
      const z = -3.45 + tile * (iz + 0.5);
      k.add(new THREE.PlaneGeometry(tile, tile).rotateX(-Math.PI / 2), (ix + iz) % 2 ? 0x5a3a2a : 0xf6ecd8, T(x, FLOOR + 0.004, z));
    }
  }
  k.box(0, FLOOR - 0.02, 5.03, 9.2, 0.06, 0.06, RASPBERRY);
  // Terrace table with a striped parasol and two stools (left of the front: the game camera
  // looks in from the right).
  const tx = LAYOUT.table.x;
  const tz = LAYOUT.table.z;
  k.add(cyl(18), CREAM, T(tx, FLOOR + 0.74, tz, 0, 0.5, 0.05, 0.5));
  k.add(cyl(8), PLUM, T(tx, FLOOR, tz, 0, 0.05, 0.75, 0.05));
  k.add(cyl(14), PLUM, T(tx, FLOOR, tz, 0, 0.25, 0.04, 0.25));
  k.add(cyl(8), CREAM, T(tx, FLOOR + 0.75, tz, 0, 0.03, 1.55, 0.03));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    k.add(
      new THREE.ConeGeometry(1.25, 0.45, 3, 1, true, a, (Math.PI * 2) / 10).translate(0, 0.225, 0),
      i % 2 ? CREAM : RASPBERRY,
      T(tx, FLOOR + 2.2, tz),
    );
  }
  k.add(sphere(8, 6), 0xffd93b, T(tx, FLOOR + 2.7, tz, 0, 0.08, 0.08, 0.08));
  for (const [sx, sz] of [[tx - 0.75, tz - 0.1], [tx + 0.55, tz + 0.5]]) {
    k.add(cyl(14), RASPBERRY, T(sx, FLOOR + 0.42, sz, 0, 0.24, 0.07, 0.24));
    k.add(cyl(8), PLUM, T(sx, FLOOR, sz, 0, 0.04, 0.44, 0.04));
  }
  // Flower boxes either side of the front.
  for (const sx of [-1, 1]) {
    k.box(sx * 3.95, FLOOR + 0.25, 3.3, 0.5, 0.5, 1.2, WOOD);
    for (let j = 0; j < 6; j++) {
      const fz = 2.85 + j * 0.18;
      k.add(sphere(6, 4), j % 2 ? 0xffffff : 0xffd93b, T(sx * 3.95 + (j % 2 ? 0.1 : -0.1), FLOOR + 0.6, fz, 0, 0.09, 0.07, 0.09));
      k.add(sphere(6, 4), 0x2f5a2a, T(sx * 3.95, FLOOR + 0.5, fz, 0, 0.13, 0.08, 0.1));
    }
  }
  // A welcome mat: big cone pictogram in the floor in front of the counter.
  k.add(disc(24), 0x2f3b52, T(0, FLOOR + 0.008, 3.45, 0, 0.7, 1, 0.7));
  k.add(new THREE.CircleGeometry(1, 3).rotateX(-Math.PI / 2), 0xffd93b, T(0, FLOOR + 0.012, 3.62, Math.PI / 2, 0.3, 1, 0.42));
  k.add(disc(16), 0xf9d3e0, T(0, FLOOR + 0.012, 3.25, 0, 0.22, 1, 0.22));
}

export function buildParlour(): Parlour {
  const matte = new Kit();
  const gloss = new Kit();
  floorAndTerrace(matte);
  walls(matte);
  roofSign(matte, gloss);
  counters(matte, gloss);
  const paintMat = paintMaterial();
  const glossMat = glossMaterial();
  const group = new THREE.Group();
  group.name = 'Scoops.parlour';
  const a = matte.mesh(paintMat);
  a.castShadow = false;
  a.receiveShadow = true;
  // Shadows come from a low-poly stand-in (shadow-map only).
  const sp = new Kit();
  const H = 3.6;
  sp.box(0, FLOOR + H / 2, -3.05, 8.3, H, 0.3, 0);
  for (const sx of [-1, 1]) {
    sp.box(sx * 4.0, FLOOR + H / 2, -0.4, 0.3, H, 5.0, 0);
    sp.box(sx * 3.95, FLOOR + H / 2, 2.25, 0.4, H, 0.4, 0);
  }
  sp.box(0, FLOOR + H + 0.18, -0.35, 8.8, 0.36, 5.9, 0);
  sp.add(box(), 0, T(0, FLOOR + H - 0.3, 2.95, 0, 8.8, 0.08, 1.5, 0.42));
  sp.box(0, FLOOR + 0.5, 1.72, 6.6, 1.0, 0.62, 0);
  sp.box(0, FLOOR + 0.5, -2.45, 7.5, 1.0, 0.66, 0);
  sp.add(new THREE.ConeGeometry(1, 1, 8).rotateX(Math.PI).translate(0, 0.5, 0), 0, T(0, FLOOR + 4.1, 0.4, 0, 0.66, 1.85, 0.66));
  sp.add(new THREE.IcosahedronGeometry(1, 0), 0, T(0, FLOOR + 6.3, 0.4, 0, 0.7, 1.5, 0.7));
  sp.add(new THREE.ConeGeometry(1.25, 0.45, 8).translate(0, 0.225, 0), 0, T(LAYOUT.table.x, FLOOR + 2.2, LAYOUT.table.z));
  const proxy = asShadowProxy(new THREE.Mesh(sp.build()));
  group.add(proxy);
  const b = gloss.mesh(glossMat);
  b.castShadow = false;
  b.receiveShadow = true;
  group.add(a, b);

  // Jars: glass-look bodies (light, banded) with 1/2/3 big dark dots on the front (both eyes: the
  // jar's number), merged into the static mesh. The lids are one instanced mesh so they can pop.
  const jarKit = new Kit();
  for (let i = 0; i < 3; i++) {
    const p = LAYOUT.jar(i);
    jarKit.add(cyl(16), 0xd6ecf2, T(p.x, p.y, p.z, 0, JAR.radius, JAR.height, JAR.radius));
    jarKit.add(cyl(16), 0x9fc4d0, T(p.x, p.y + 0.04, p.z, 0, JAR.radius + 0.005, 0.05, JAR.radius + 0.005));
    jarKit.add(cyl(16), 0x9fc4d0, T(p.x, p.y + JAR.height - 0.1, p.z, 0, JAR.radius + 0.005, 0.03, JAR.radius + 0.005));
    for (let d = 0; d <= i; d++) {
      jarKit.add(new THREE.CircleGeometry(0.036, 14), 0x2f3b52, T(p.x + (d - i / 2) * 0.1, p.y + 0.22, p.z + JAR.radius + 0.004));
    }
  }
  const jarMat = glossMaterial();
  const jars = jarKit.mesh(jarMat);
  jars.receiveShadow = true;
  const lidKit = new Kit();
  lidKit.add(cyl(16), 0x2f3b52, T(0, 0, 0, 0, JAR.radius + 0.02, 0.07, JAR.radius + 0.02));
  lidKit.add(sphere(10, 6), 0xffd93b, T(0, 0.08, 0, 0, 0.06, 0.05, 0.06));
  const lidGeo = lidKit.build();
  const lids = new THREE.InstancedMesh(lidGeo, jarMat, 3);
  lids.frustumCulled = false;
  group.add(jars, lids);
  const lm = new THREE.Matrix4();
  const lq = new THREE.Quaternion();
  const le = new THREE.Euler();
  const lp = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const setLid = (i: number, open: number, wobble: number): void => {
    const p = LAYOUT.jar(i);
    const wz = Math.sin(wobble * 30) * wobble * 0.3;
    lp.set(p.x, p.y + JAR.height + open * 0.24, p.z + open * 0.06);
    lq.setFromEuler(le.set(-open * 0.9, 0, wz));
    lids.setMatrixAt(i, lm.compose(lp, lq, one));
    lids.instanceMatrix.needsUpdate = true;
  };
  for (let i = 0; i < 3; i++) setLid(i, 0, 0);

  const colliders: ParlourCollider[] = [
    { kind: 'box', c: new THREE.Vector3(0, FLOOR - 0.55, 0.75), h: new THREE.Vector3(4.6, 0.55, 4.3) },
    { kind: 'box', c: new THREE.Vector3(0, (FLOOR / 2 - 0.6) / 2, 0.75), h: new THREE.Vector3(5.0, (FLOOR / 2 + 0.6) / 2, 4.7) },
    { kind: 'box', c: new THREE.Vector3(0, FLOOR + 1.9, -3.05), h: new THREE.Vector3(4.15, 1.9, 0.15) },
    { kind: 'box', c: new THREE.Vector3(-4.0, FLOOR + 1.9, -0.4), h: new THREE.Vector3(0.15, 1.9, 2.5) },
    { kind: 'box', c: new THREE.Vector3(4.0, FLOOR + 1.9, -0.4), h: new THREE.Vector3(0.15, 1.9, 2.5) },
    { kind: 'box', c: new THREE.Vector3(0, FLOOR + 0.55, 1.72), h: new THREE.Vector3(3.4, 0.55, 0.39) },
    { kind: 'box', c: new THREE.Vector3(0, FLOOR + 0.55, -2.45), h: new THREE.Vector3(3.8, 0.55, 0.36) },
    { kind: 'box', c: new THREE.Vector3(0, FLOOR + 3.9, -0.35), h: new THREE.Vector3(4.4, 0.2, 2.95) },
    { kind: 'cyl', c: new THREE.Vector3(-3.95, FLOOR + 1.8, 2.25), h: new THREE.Vector3(0.22, 1.8, 0.22) },
    { kind: 'cyl', c: new THREE.Vector3(3.95, FLOOR + 1.8, 2.25), h: new THREE.Vector3(0.22, 1.8, 0.22) },
    { kind: 'cyl', c: new THREE.Vector3(LAYOUT.table.x, FLOOR + 0.4, LAYOUT.table.z), h: new THREE.Vector3(0.5, 0.4, 0.5) },
    {
      kind: 'box',
      c: new THREE.Vector3(0, (FLOOR + FRONT.top) / 2, (FRONT.z0 + FRONT.z1) / 2),
      h: new THREE.Vector3(FRONT.x, (FRONT.top - FLOOR) / 2, (FRONT.z1 - FRONT.z0) / 2),
      heroOnly: true,
    },
    { kind: 'box', c: new THREE.Vector3(-3.95, FLOOR + 0.25, 3.3), h: new THREE.Vector3(0.25, 0.25, 0.6) },
    { kind: 'box', c: new THREE.Vector3(3.95, FLOOR + 0.25, 3.3), h: new THREE.Vector3(0.25, 0.25, 0.6) },
  ];

  return {
    group,
    colliders,
    setJar: setLid,
    dispose() {
      a.geometry.dispose();
      b.geometry.dispose();
      proxy.geometry.dispose();
      jars.geometry.dispose();
      lidGeo.dispose();
      paintMat.dispose();
      glossMat.dispose();
      jarMat.dispose();
    },
  };
}
