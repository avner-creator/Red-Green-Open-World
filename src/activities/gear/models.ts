/**
 * Procedural gear for the robot, in the same style as the chest wearables: baked vertex shading,
 * shapes that read from brightness alone (dark on the light robot, bright accents), merged into one
 * or two draw calls. Authored in metres at the attach anchor: +Y up, +Z forward.
 * (`back` anchor: origin on the torso's back; `face`: front of the face; `head`: top of the head.)
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { merge, noise, paint, placed } from '../chests/bake';
import { buildClothCape, buildWearable as buildChestWearable, disposer, lit, mesh, std } from '../chests/wearables';
import type { CapeSpec, Wearable } from '../chests/wearables';

export type { Wearable };

const part = (geo: THREE.BufferGeometry, color: number, ambient = 0.6, k = 1): THREE.BufferGeometry => paint(geo, lit(color, ambient, k));
const at = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry => placed(geo, x, y, z, rx, ry, rz);
const rbox = (w: number, h: number, d: number, r = 0.02): THREE.BufferGeometry => new RoundedBoxGeometry(w, h, d, 2, r);

/** Wrap `inner` in an outer group scaled by `k`: the pop-in scales the outer one, so fitting survives it. */
function fit(inner: THREE.Object3D, k: number): THREE.Group {
  const outer = new THREE.Group();
  inner.scale.multiplyScalar(k);
  inner.position.multiplyScalar(k);
  outer.add(inner);
  return outer;
}

// ───────────────────────────── Propeller cap ─────────────────────────────

export function buildPropellerCap(): Wearable {
  const R = 0.215;
  const Y = new THREE.Color(0xffd21f);
  const B = new THREE.Color(0x1d3fd0);
  const dome = new THREE.SphereGeometry(R, 30, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.82, 1);
  const panels = paint(dome, (x, _y, z, nx, ny, nz) => {
    const turn = (Math.atan2(x, z) / (Math.PI * 2) + 1) % 1;
    const f = (turn * 6) % 1;
    const seam = f < 0.035 || f > 0.965;
    const base = seam ? new THREE.Color(0x10163a) : Math.floor(turn * 6) % 2 === 0 ? Y : B;
    const d = Math.max(0, nx * 0.45 + ny * 0.8 + nz * 0.4);
    const s = 0.62 + 0.5 * d;
    return new THREE.Color(Math.min(1, base.r * s), Math.min(1, base.g * s), Math.min(1, base.b * s));
  });
  const rim = part(new THREE.TorusGeometry(R, 0.016, 8, 30).rotateX(Math.PI / 2), 0x10163a, 0.8);
  const bill = part(at(rbox(0.28, 0.022, 0.2, 0.01), 0, -0.004, 0.23, 0.14), 0xe8332a, 0.65);
  const button = part(at(new THREE.SphereGeometry(0.032, 10, 8), 0, R * 0.82, 0), 0xe8332a, 0.7, 1.1);
  const pole = part(at(new THREE.CylinderGeometry(0.009, 0.009, 0.075, 8), 0, R * 0.82 + 0.04, 0), 0x2a2f3a, 0.7);
  const capGeo = merge([panels, rim, bill, button, pole]);
  const capMat = std({ side: THREE.DoubleSide, roughness: 0.55 });

  const blades = merge([
    part(at(rbox(0.42, 0.012, 0.075, 0.005), 0, 0, 0), 0xe8332a, 0.7, 1.05),
    part(at(rbox(0.42, 0.012, 0.075, 0.005), 0, 0.001, 0, 0, Math.PI / 2), 0x10163a, 0.8),
    part(at(new THREE.SphereGeometry(0.02, 8, 6), 0, 0.006, 0), 0xffd21f, 0.7),
  ]);
  const bladeMat = std({ roughness: 0.5 });
  const prop = mesh(blades, bladeMat);
  prop.position.y = R * 0.82 + 0.08;

  const g = new THREE.Group();
  g.add(mesh(capGeo, capMat), prop);
  g.position.y = -0.065;
  g.rotation.x = -0.05;
  return {
    object: fit(g, 1.6),
    update(dt, speed) {
      prop.rotation.y += dt * (7 + Math.min(14, speed * 1.6));
    },
    dispose: disposer([capGeo, blades], [capMat, bladeMat]),
  };
}

// ───────────────────────────── Royal crown ─────────────────────────────

export function buildCrown(): Wearable {
  const gold = 0xffc928;
  const band = part(new THREE.CylinderGeometry(0.215, 0.195, 0.1, 34, 1, true).translate(0, 0.05, 0), gold, 0.6, 1.08);
  const topRim = part(new THREE.TorusGeometry(0.205, 0.014, 6, 34).rotateX(Math.PI / 2).translate(0, 0.1, 0), 0xffe27a, 0.7, 1.1);
  const botRim = part(new THREE.TorusGeometry(0.2, 0.014, 6, 34).rotateX(Math.PI / 2).translate(0, 0.0, 0), 0xe0a014, 0.6);
  const parts: THREE.BufferGeometry[] = [band, topRim, botRim];
  const N = 5;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const x = Math.sin(a) * 0.2;
    const z = Math.cos(a) * 0.2;
    parts.push(part(at(new THREE.ConeGeometry(0.058, 0.17, 12, 1), x, 0.1 + 0.085, z), gold, 0.6, 1.08));
    parts.push(part(at(new THREE.SphereGeometry(0.03, 10, 8), x, 0.1 + 0.18, z), i % 2 === 0 ? 0x1a2fd0 : 0xd0182c, 0.75, 1.0));
    // A jewel on the band between the points.
    const b = a + Math.PI / N;
    parts.push(part(at(new THREE.SphereGeometry(0.026, 10, 8), Math.sin(b) * 0.212, 0.05, Math.cos(b) * 0.212), i % 2 === 0 ? 0xd0182c : 0x1a2fd0, 0.75));
  }
  // Velvet cap inside, seen between the points.
  parts.push(part(at(new THREE.ConeGeometry(0.19, 0.17, 24, 1, true), 0, 0.17, 0), 0x6e0d1c, 0.7));
  const geo = merge(parts);
  const mat = std({ side: THREE.DoubleSide, roughness: 0.3, metalness: 0.35 });
  const g = new THREE.Group();
  g.add(mesh(geo, mat));
  g.position.y = -0.04;
  g.rotation.set(-0.05, 0, 0.05);
  return { object: fit(g, 1.5), dispose: disposer([geo], [mat]) };
}

// ───────────────────────────── Wizard hat ─────────────────────────────

export function buildWizardHat(): Wearable {
  const H = 0.62;
  const R = 0.19;
  const bend = (t: number): { z: number; x: number; y: number } => ({ z: -0.3 * t * t, x: 0.05 * t * t, y: -0.05 * t * t });
  const cone = new THREE.ConeGeometry(R, H, 26, 16, true).translate(0, H / 2, 0);
  const pos = cone.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, pos.getY(i) / H));
    const b = bend(t);
    pos.setXYZ(i, pos.getX(i) + b.x, pos.getY(i) + b.y, pos.getZ(i) + b.z);
  }
  cone.computeVertexNormals();
  const robe = paint(cone, (_x, y, _z, nx, ny, nz) => {
    const base = new THREE.Color(0x3a1c8c);
    const d = Math.max(0, nx * 0.45 + ny * 0.8 + nz * 0.4);
    const s = 0.55 + 0.7 * d + 0.1 * noise(Math.floor(y * 40));
    return new THREE.Color(Math.min(1, base.r * s), Math.min(1, base.g * s), Math.min(1, base.b * s));
  });
  const brimPts = [[0, 0.004], [0.2, 0.004], [0.33, 0.016], [0.41, 0.055], [0.415, 0.038], [0.34, -0.01], [0.2, -0.012], [0, -0.012]].map(([r, y]) => new THREE.Vector2(r, y));
  const brim = paint(new THREE.LatheGeometry(brimPts, 40), (x, y, z, nx, ny, nz) => lit(0x4f2bb0, 0.5, 1.05)(x, y, z, nx, ny, nz));
  const bandGeo = part(new THREE.CylinderGeometry(R * 0.93, R * 1.0, 0.065, 28, 1, true).translate(0, 0.06, 0), 0xffd21f, 0.65, 1.1);
  const buckle = part(at(rbox(0.07, 0.07, 0.016, 0.01), 0, 0.06, R * 0.97 + 0.01), 0xfff0a0, 0.7, 1.1);
  const buckleHole = part(at(rbox(0.032, 0.036, 0.018, 0.006), 0, 0.06, R * 0.97 + 0.012), 0x3a1c8c, 0.9, 0.6);
  const parts: THREE.BufferGeometry[] = [robe, brim, bandGeo, buckle, buckleHole];
  // Little stars on the cone, bright on dark purple.
  for (let k = 0; k < 9; k++) {
    const t = 0.16 + 0.68 * noise(k * 3.3);
    const a = noise(k * 5.1 + 2) * Math.PI * 2;
    const r = R * (1 - t) + 0.006;
    const b = bend(t);
    const px = Math.sin(a) * r + b.x;
    const pz = Math.cos(a) * r + b.z;
    const star = new THREE.OctahedronGeometry(0.03 + 0.012 * noise(k), 0).scale(1, 1, 0.4);
    star.rotateY(a);
    parts.push(part(at(star, px, t * H + b.y, pz, 0.35), 0xffe24a, 0.85, 1.1));
  }
  const geo = merge(parts);
  const mat = std({ side: THREE.DoubleSide, roughness: 0.8 });
  const g = new THREE.Group();
  g.add(mesh(geo, mat));
  g.position.y = -0.065;
  g.rotation.x = -0.08;
  return { object: fit(g, 1.15), dispose: disposer([geo], [mat]) };
}

// ───────────────────────────── Capes ─────────────────────────────

const STAR_CAPE: CapeSpec = {
  top: '#5a24b8', bottom: '#2a0f6e', trim: '#ffe24a', trimDark: '#c8920f', emblem: 'star', emblemFill: '#ffffff', emblemStroke: '#ffd21f',
};
const FLAME_CAPE: CapeSpec = {
  top: '#7a0c18', bottom: '#ff8a1a', trim: '#2a0a0a', trimDark: '#000000', emblem: 'flame', emblemFill: '#ffe24a', emblemStroke: '#3a0a0a',
};

export const buildStarCape = (): Wearable => buildClothCape(STAR_CAPE);
export const buildFlameCape = (): Wearable => buildClothCape(FLAME_CAPE);

// ───────────────────────────── Backpacks ─────────────────────────────

export function buildExplorerPack(): Wearable {
  const parts: THREE.BufferGeometry[] = [
    part(at(rbox(0.36, 0.44, 0.2, 0.06), 0, 0, -0.12), 0x6b3f1c, 0.55),
    part(at(rbox(0.375, 0.15, 0.225, 0.05), 0, 0.17, -0.12), 0x3f230d, 0.55),
    part(at(rbox(0.27, 0.19, 0.08, 0.04), 0, -0.08, -0.235), 0xc98a42, 0.6, 1.05),
    part(at(rbox(0.07, 0.04, 0.02, 0.01), 0, 0.1, -0.245), 0xffe07a, 0.7, 1.1),
    part(at(rbox(0.03, 0.2, 0.012, 0.005), 0, -0.07, -0.278), 0x3f230d, 0.7),
    // Bedroll on top, with dark ends.
    part(at(new THREE.CylinderGeometry(0.075, 0.075, 0.4, 16), 0, 0.3, -0.12, 0, 0, Math.PI / 2), 0xf2e4b8, 0.6, 1.05),
    part(at(new THREE.CylinderGeometry(0.078, 0.078, 0.03, 16), 0.19, 0.3, -0.12, 0, 0, Math.PI / 2), 0x3a2a14, 0.7),
    part(at(new THREE.CylinderGeometry(0.078, 0.078, 0.03, 16), -0.19, 0.3, -0.12, 0, 0, Math.PI / 2), 0x3a2a14, 0.7),
    // Side water bottle.
    part(at(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 12), 0.2, -0.1, -0.15), 0x1d6fd0, 0.65),
    part(at(new THREE.CylinderGeometry(0.02, 0.03, 0.04, 12), 0.2, 0.02, -0.15), 0xf2f2f2, 0.7),
  ];
  const geo = merge(parts);
  const mat = std({ roughness: 0.85 });
  const g = new THREE.Group();
  g.add(mesh(geo, mat));
  g.position.y = 0.02;
  return { object: g, dispose: disposer([geo], [mat]) };
}

export function buildRocketPack(): Wearable {
  const parts: THREE.BufferGeometry[] = [part(at(rbox(0.3, 0.3, 0.08, 0.03), 0, 0.03, -0.09), 0x3a3f4a, 0.6)];
  for (const sx of [-1, 1]) {
    const x = sx * 0.105;
    const z = -0.16;
    parts.push(part(at(new THREE.CylinderGeometry(0.088, 0.088, 0.44, 20), x, 0.04, z), 0x1a2a55, 0.5, 1.0));
    parts.push(part(at(new THREE.CylinderGeometry(0.092, 0.092, 0.035, 20), x, 0.12, z), 0xffffff, 0.8));
    parts.push(part(at(new THREE.CylinderGeometry(0.092, 0.092, 0.035, 20), x, -0.04, z), 0xffffff, 0.8));
    parts.push(part(at(new THREE.ConeGeometry(0.088, 0.14, 20), x, 0.33, z), 0xffd21f, 0.7, 1.1));
    parts.push(part(at(new THREE.CylinderGeometry(0.05, 0.075, 0.07, 16, 1, true), x, -0.215, z), 0x23262d, 0.6));
  }
  const geo = merge(parts);
  const mat = std({ side: THREE.DoubleSide, roughness: 0.4, metalness: 0.25 });
  // Flames: bright core, orange outside; flicker with speed. Unlit, so they read on the dark nozzles.
  const flameGeo = merge([
    paint(at(new THREE.ConeGeometry(0.052, 0.2, 12).rotateX(Math.PI), 0, -0.1, 0), (_x, y) => (y > -0.12 ? new THREE.Color(0xfff2a0) : new THREE.Color(0xff8a1a))),
    paint(at(new THREE.ConeGeometry(0.03, 0.12, 10).rotateX(Math.PI), 0, -0.06, 0), new THREE.Color(0xffffff)),
  ]);
  const flameMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const flames: THREE.Mesh[] = [];
  const g = new THREE.Group();
  g.add(mesh(geo, mat));
  for (const sx of [-1, 1]) {
    const f = mesh(flameGeo, flameMat, false);
    f.position.set(sx * 0.105, -0.25, -0.16);
    flames.push(f);
    g.add(f);
  }
  g.position.y = 0.02;
  let t = 0;
  return {
    object: g,
    update(dt, speed) {
      t += dt;
      const k = 0.7 + Math.min(1.2, speed * 0.12);
      flames.forEach((f, i) => {
        const fl = k * (0.85 + 0.25 * Math.sin(t * 38 + i * 2) + 0.12 * Math.sin(t * 71 + i));
        f.scale.set(1, Math.max(0.3, fl), 1);
      });
    },
    dispose: disposer([geo, flameGeo], [mat, flameMat]),
  };
}

// ───────────────────────────── Glasses ─────────────────────────────

export function buildShades(): Wearable {
  const dx = 0.15;
  const parts: THREE.BufferGeometry[] = [];
  const glints: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    parts.push(part(at(rbox(0.215, 0.14, 0.016, 0.04), sx * dx, 0, 0), 0xffe14a, 0.7, 1.1)); // rim
    parts.push(paint(at(rbox(0.185, 0.112, 0.024, 0.036), sx * dx, 0, 0.004), 0x0a0c12));
    glints.push(paint(at(rbox(0.02, 0.085, 0.006, 0.003), sx * dx - 0.04, 0.002, 0.018, 0, 0, -0.5), 0xffffff));
    glints.push(paint(at(rbox(0.01, 0.055, 0.006, 0.003), sx * dx - 0.014, 0.002, 0.018, 0, 0, -0.5), 0xd8e6ff));
    parts.push(part(at(rbox(0.022, 0.03, 0.34, 0.01), sx * (dx + 0.12), 0.015, -0.17), 0xffe14a, 0.7, 1.1));
  }
  parts.push(part(at(rbox(0.1, 0.026, 0.024, 0.01), 0, 0.025, 0), 0xffe14a, 0.7, 1.1));
  parts.push(part(at(rbox(0.56, 0.026, 0.026, 0.01), 0, 0.078, -0.004), 0x23262d, 0.7));
  const geo = merge([...parts, ...glints]);
  const mat = std({ roughness: 0.25, metalness: 0.1 });
  const g = new THREE.Group();
  g.add(mesh(geo, mat));
  g.position.z = 0.08;
  return { object: g, dispose: disposer([geo], [mat]) };
}

export function buildGoggles(): Wearable {
  const dx = 0.15;
  const brass = 0xe0a63a;
  const parts: THREE.BufferGeometry[] = [];
  const lensParts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    parts.push(part(at(new THREE.TorusGeometry(0.095, 0.021, 10, 26), sx * dx, 0, 0), brass, 0.6, 1.1));
    parts.push(part(at(new THREE.TorusGeometry(0.117, 0.012, 8, 26), sx * dx, 0, -0.014), 0x2a1c12, 0.8));
    lensParts.push(paint(at(new THREE.CircleGeometry(0.088, 22), sx * dx, 0, 0.002), 0xa8ecff));
    // Bolts on the rim.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      parts.push(part(at(new THREE.SphereGeometry(0.009, 6, 5), sx * dx + Math.cos(a) * 0.095, Math.sin(a) * 0.095, 0.019), 0xfff0b0, 0.8));
    }
  }
  parts.push(part(at(rbox(0.06, 0.03, 0.03, 0.01), 0, 0.005, 0), brass, 0.6));
  // Strap around the back of the head.
  const arc = 4.5;
  const strap = new THREE.TorusGeometry(0.29, 0.02, 8, 36, arc).rotateZ(-arc / 2 - Math.PI / 2).rotateX(Math.PI / 2);
  parts.push(part(at(strap.scale(1, 1, 0.9), 0, 0, -0.26), 0x2a1c12, 0.7));
  const geo = merge(parts);
  const lensGeo = merge(lensParts);
  const mat = std({ roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide });
  const lensMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const g = new THREE.Group();
  g.add(mesh(geo, mat), mesh(lensGeo, lensMat, false));
  g.position.z = 0.07;
  return { object: g, dispose: disposer([geo, lensGeo], [mat, lensMat]) };
}

/** Any gear or chest wearable by shop id; null for ids with no model (paints, trails, emotes). */
export function buildGear(id: string): Wearable | null {
  switch (id) {
    case 'hat-propeller':
      return buildPropellerCap();
    case 'hat-crown':
      return buildCrown();
    case 'hat-wizard':
      return buildWizardHat();
    case 'cape-star':
      return buildStarCape();
    case 'cape-flame':
      return buildFlameCape();
    case 'pack-explorer':
      return buildExplorerPack();
    case 'pack-rocket':
      return buildRocketPack();
    case 'glasses-shades':
      return buildShades();
    case 'glasses-goggles':
      return buildGoggles();
    default:
      return buildChestWearable(id);
  }
}
