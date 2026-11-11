/**
 * The treasure chest (both-eye, main scene): planked body, barrel lid on a hinge, brass straps,
 * corner guards and studs, a brass plate on every side with an empty key-shaped slot (fills with a bright key when the key is carried), a hidden heap of treasure and a light beam that appear when it opens.
 *
 * Wood is mid-dark and brass is bright with a dark gap between them, so it reads in the red-only
 * and green-only channels by brightness (the wood differs from grass in R, the brass in both).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { groundShade, merge, noise, paint, placed, tone } from './bake';

export const CHEST = {
  width: 1.12, // x
  depth: 0.78, // z
  bodyH: 0.5,
  lidR: 0.39,
} as const;

const WOOD = 0x8a4a22;
const WOOD_DARK = 0x4a230f;
const BRASS = 0xffd45a;
const BRASS_DARK = 0xb87a1a;
const VELVET = 0x6a1020;

const LIGHT = new THREE.Vector3(0.45, 0.8, 0.4).normalize();

/** Curved strip on the lid: x0..x1, angle phi0..phi1 (0 = front-bottom, pi/2 = top, pi = back-bottom). */
function arcStrip(x0: number, x1: number, r: number, phi0: number, phi1: number, seg: number, cz: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const phi = phi0 + ((phi1 - phi0) * i) / seg;
    const y = Math.sin(phi) * r;
    const z = cz + Math.cos(phi) * r;
    for (const x of [x0, x1]) {
      pos.push(x, y, z);
      nor.push(0, Math.sin(phi), Math.cos(phi));
    }
    if (i < seg) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, radius = 0.012): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2.2, h / 2.2, d / 2.2)).translate(x, y, z);
}

function sphere(r: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, 7, 5).translate(x, y, z);
}

/** Wood colour with plank-to-plank variation, streaky grain along x and a baked ground shade. */
function woodPainter(seed: number, shadeH = 0.4): (x: number, y: number, z: number) => THREE.Color {
  const base = tone(WOOD, (noise(seed) - 0.5) * 0.09, (noise(seed + 3) - 0.5) * 0.1);
  return (x, y, z) => {
    const grain = 0.9 + 0.12 * noise(Math.floor((x + z) * 34) + seed * 17);
    const s = groundShade(y, shadeH) * grain;
    return new THREE.Color(base.r * s, base.g * s, base.b * s);
  };
}

function brass(dark = false, ground = 0.4): (x: number, y: number) => THREE.Color {
  const c = new THREE.Color(dark ? BRASS_DARK : BRASS);
  return (_x, y) => {
    const s = groundShade(y, ground);
    return new THREE.Color(c.r * s, c.g * s, c.b * s);
  };
}

export interface ChestModel {
  readonly group: THREE.Group;
  /** Hinge pivot; rotation.x = 0 closed, negative opens. */
  readonly lid: THREE.Group;
  /** Heap of coins and gems, hidden until opened. */
  readonly treasure: THREE.Group;
  readonly star: THREE.Object3D;
  readonly beam: THREE.Mesh;
  /** Bright keys in the four front-plate slots: visible while the key is carried. */
  readonly keyFill: THREE.Mesh;
  setLid(open: number): void;
  dispose(): void;
}

function lidGeometry(): { wood: THREE.BufferGeometry; metal: THREE.BufferGeometry } {
  const { width: W, depth: D, lidR: R } = CHEST;
  const cz = D / 2;
  const wood: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];
  const NS = 6;
  const hx = W / 2 + 0.012;
  for (let j = 0; j < NS; j++) {
    const gap = 0.012;
    const p0 = (j * Math.PI) / NS + gap;
    const p1 = ((j + 1) * Math.PI) / NS - gap;
    const base = tone(WOOD, (noise(j * 5 + 1) - 0.5) * 0.09, (noise(j + 9) - 0.5) * 0.1);
    wood.push(paint(arcStrip(-hx, hx, R, p0, p1, 6, cz), (x, y) => {
      const grain = 0.9 + 0.12 * noise(Math.floor(x * 30) + j * 17);
      const s = grain * (0.85 + 0.25 * (y / R));
      return new THREE.Color(base.r * s, base.g * s, base.b * s);
    }));
  }
  // Inner shell (velvet-lined, visible when open and in the gaps between planks).
  wood.push(paint(arcStrip(-hx + 0.01, hx - 0.01, R - 0.03, 0, Math.PI, 14, cz), (_x, y) => {
    const c = new THREE.Color(VELVET);
    const s = 0.55 + 0.6 * (1 - y / R);
    return new THREE.Color(c.r * s, c.g * s, c.b * s);
  }));
  // End caps (half discs).
  for (const sx of [-1, 1]) {
    const cap = new THREE.CircleGeometry(R - 0.002, 16, 0, Math.PI);
    cap.rotateY(sx * (Math.PI / 2));
    cap.translate(sx * (W / 2 + 0.002), 0, cz);
    wood.push(paint(cap, tone(WOOD, -0.04)));
  }
  // Straps over the lid + edge rails + hoops at the ends.
  for (const sx of [-0.34, 0.34]) {
    const w = 0.055;
    metal.push(paint(arcStrip(sx - w, sx + w, R + 0.02, 0, Math.PI, 14, cz), brass(false, 0.12)));
    for (const e of [-w - 0.008, w + 0.008]) {
      metal.push(paint(arcStrip(sx + e - 0.008, sx + e + 0.008, R + 0.014, 0, Math.PI, 14, cz), brass(true)));
    }
    for (const e of [-w + 0.012, w - 0.012]) {
      for (let k = 1; k <= 7; k++) {
        const phi = (k * Math.PI) / 8;
        metal.push(paint(sphere(0.016, sx + e, Math.sin(phi) * (R + 0.032), cz + Math.cos(phi) * (R + 0.032)), brass(false, 0.1)));
      }
    }
  }
  for (const sx of [-1, 1]) {
    metal.push(paint(arcStrip(sx * (W / 2) - 0.02, sx * (W / 2) + 0.02, R + 0.014, 0, Math.PI, 14, cz), brass(true)));
  }
  // Lower lid rim (front and hinge edge).
  metal.push(paint(box(W + 0.03, 0.04, 0.034, 0, 0.018, 0), brass(true)));
  metal.push(paint(box(W + 0.03, 0.04, 0.034, 0, 0.018, D), brass(true)));
  return { wood: merge(wood), metal: merge(metal) };
}

/**
 * An upright key (bow on top, shaft, two teeth) as flat slabs facing +Z, centred on the origin, `k`
 * times the base size (about 0.2 m tall), `depth` thick, front face at `z`.
 */
function keyParts(k: number, depth: number, z: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(0.052 * k, 0.052 * k, depth, 14).rotateX(Math.PI / 2).translate(0, 0.075 * k, z - depth / 2),
    new THREE.BoxGeometry(0.03 * k, 0.15 * k, depth).translate(0, -0.03 * k, z - depth / 2),
    new THREE.BoxGeometry(0.06 * k, 0.03 * k, depth).translate(0.03 * k, -0.075 * k, z - depth / 2),
    new THREE.BoxGeometry(0.05 * k, 0.03 * k, depth).translate(0.025 * k, -0.035 * k, z - depth / 2),
  ];
  return merge(parts);
}

/** Bright key shapes in the four slots (one mesh); shown while the player carries the key. */
function keyFillGeometry(): THREE.BufferGeometry {
  const { width: W, depth: D } = CHEST;
  const parts: THREE.BufferGeometry[] = [];
  for (let s = 0; s < 4; s++) {
    const a = (s * Math.PI) / 2;
    const half = s % 2 === 0 ? D / 2 : W / 2;
    const g = paint(keyParts(0.82, 0.008, 0.0145), new THREE.Color(0xfffbe8));
    g.rotateY(a);
    g.translate(Math.sin(a) * (half + 0.006), 0.27, Math.cos(a) * (half + 0.006));
    parts.push(g);
  }
  return merge(parts);
}

function bodyGeometry(): { wood: THREE.BufferGeometry; metal: THREE.BufferGeometry } {
  const { width: W, depth: D, bodyH: H } = CHEST;
  const wood: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];
  const planks = 4;
  const ph = (H - 0.06) / planks;
  for (let i = 0; i < planks; i++) {
    const y = 0.06 + ph * (i + 0.5);
    wood.push(paint(box(W, ph - 0.008, D, 0, y, 0, 0.014), woodPainter(i + 1)));
  }
  // Plinth.
  wood.push(paint(box(W + 0.03, 0.07, D + 0.03, 0, 0.035, 0, 0.014), (_x, y) => {
    const c = new THREE.Color(WOOD_DARK);
    const s = groundShade(y, 0.2);
    return new THREE.Color(c.r * s, c.g * s, c.b * s);
  }));
  // Corner guards.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      metal.push(paint(box(0.085, H - 0.01, 0.085, sx * (W / 2 - 0.004), H / 2 + 0.005, sz * (D / 2 - 0.004), 0.02), brass(false, 0.3)));
    }
  }
  // Top rim.
  metal.push(paint(box(W + 0.02, 0.06, 0.04, 0, H - 0.03, D / 2 + 0.002), brass(false, 0.1)));
  metal.push(paint(box(W + 0.02, 0.06, 0.04, 0, H - 0.03, -D / 2 - 0.002), brass(false, 0.1)));
  metal.push(paint(box(0.04, 0.06, D + 0.02, W / 2 + 0.002, H - 0.03, 0), brass(false, 0.1)));
  metal.push(paint(box(0.04, 0.06, D + 0.02, -W / 2 - 0.002, H - 0.03, 0), brass(false, 0.1)));
  // Vertical straps (front and back) with studs.
  for (const sz of [-1, 1]) {
    for (const sx of [-0.34, 0.34]) {
      metal.push(paint(box(0.11, H - 0.1, 0.022, sx, 0.07 + (H - 0.1) / 2, sz * (D / 2 + 0.004)), brass(false, 0.3)));
      for (const e of [-0.04, 0.04]) {
        for (const y of [0.13, 0.25, 0.37]) metal.push(paint(sphere(0.016, sx + e, y, sz * (D / 2 + 0.016)), brass(false, 0.2)));
      }
    }
  }
  // A brass plate on all four sides, each with an EMPTY key-shaped slot (dark). Both eyes see it; the
  // bright key shape (`keyFillGeometry`) lights up in it once the player carries the key.
  for (let s = 0; s < 4; s++) {
    const a = (s * Math.PI) / 2;
    const half = s % 2 === 0 ? D / 2 : W / 2;
    const px = Math.sin(a) * (half + 0.006);
    const pz = Math.cos(a) * (half + 0.006);
    const g1 = paint(box(0.26, 0.3, 0.02, 0, 0, 0, 0.018), brass(false, 0.2));
    const slot = paint(keyParts(1.0, 0.006, 0.0105), new THREE.Color(0x120804));
    for (const g of [g1, slot]) {
      g.rotateY(a);
      g.translate(px, 0.27, pz);
      metal.push(g);
    }
  }
  return { wood: merge(wood), metal: merge(metal) };
}

function treasureGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shade = (hex: number | THREE.Color, k = 1): ((x: number, y: number, z: number, nx: number, ny: number, nz: number) => THREE.Color) => {
    const c = new THREE.Color(hex);
    return (_x, _y, _z, nx, ny, nz) => {
      const d = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
      const s = (0.5 + 0.75 * d) * k;
      return new THREE.Color(c.r * s, c.g * s, c.b * s);
    };
  };
  const rx = 0.4;
  const rz = 0.25;
  for (let i = 0; i < 34; i++) {
    const a = noise(i * 2.3) * Math.PI * 2;
    const r = Math.sqrt(noise(i * 5.1 + 2)) * 0.95;
    const x = Math.cos(a) * r * rx;
    const z = Math.sin(a) * r * rz;
    const y = (1 - r * r) * 0.13 + noise(i) * 0.03;
    const coin = new THREE.CylinderGeometry(0.075, 0.075, 0.02, 12);
    coin.rotateX((noise(i * 7) - 0.5) * 1.5);
    coin.rotateZ((noise(i * 3 + 1) - 0.5) * 1.5);
    coin.translate(x, y, z);
    parts.push(paint(coin, shade(i % 3 === 0 ? 0xffe27a : 0xffc22a)));
  }
  const gemColors = [0x4fe8ff, 0xff5fb4, 0xb6ff5a, 0xffffff, 0xffa238];
  for (let i = 0; i < gemColors.length; i++) {
    const a = (i / gemColors.length) * Math.PI * 2 + 0.4;
    const gem = new THREE.OctahedronGeometry(0.065 + (i % 2) * 0.015);
    gem.scale(1, 1.25, 1);
    gem.rotateY(i);
    gem.translate(Math.cos(a) * 0.22, 0.13 + (i % 2) * 0.04, Math.sin(a) * 0.12);
    parts.push(paint(gem.index ? gem.toNonIndexed() : gem, shade(gemColors[i], 1.1)));
  }
  return merge(parts);
}

function starGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const pts = 5;
  for (let i = 0; i < pts * 2; i++) {
    const r = i % 2 === 0 ? 0.2 : 0.09;
    const a = Math.PI / 2 + (i * Math.PI) / pts;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
  geo.translate(0, 0, -0.025);
  const c = new THREE.Color(0xffe066);
  return paint(geo, (_x, _y, _z, nx, ny, nz) => {
    const d = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
    const s = 0.7 + 0.5 * d;
    return new THREE.Color(c.r * s, c.g * s, c.b * s);
  });
}

function beamGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.62, 0.3, 2.8, 20, 1, true);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + 1.4) / 2.8; // 0 bottom .. 1 top
    colors.set([1, 0.82, 0.4, 0.55 * (1 - t) * (1 - t)], i * 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return geo;
}

export function buildChest(): ChestModel {
  const { depth: D, bodyH: H } = CHEST;
  const group = new THREE.Group();
  group.name = 'chest';
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  const brassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.35, emissive: 0x2a1a00 });
  const lidWoodMat = woodMat.clone();
  lidWoodMat.side = THREE.DoubleSide;
  const lidBrassMat = brassMat.clone();
  lidBrassMat.side = THREE.DoubleSide;
  mats.push(woodMat, brassMat, lidWoodMat, lidBrassMat);

  const body = bodyGeometry();
  const lidG = lidGeometry();
  const treasureG = treasureGeometry();
  const starG = starGeometry();
  const beamG = beamGeometry();
  const fillG = keyFillGeometry();
  geos.push(body.wood, body.metal, lidG.wood, lidG.metal, treasureG, starG, beamG, fillG);

  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  add(group, body.wood, woodMat);
  add(group, body.metal, brassMat);

  // Velvet cushion under the lid (shows when opened).
  const cushionG = paint(placed(new THREE.PlaneGeometry(CHEST.width - 0.12, D - 0.12).rotateX(-Math.PI / 2), 0, H + 0.002, 0), new THREE.Color(VELVET).multiplyScalar(0.8));
  geos.push(cushionG);
  const cushion = new THREE.Mesh(cushionG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mats.push(cushion.material as THREE.Material);
  group.add(cushion);

  const fillMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  mats.push(fillMat);
  const keyFill = new THREE.Mesh(fillG, fillMat);
  keyFill.visible = false;
  group.add(keyFill);

  const lid = new THREE.Group();
  lid.position.set(0, H, -D / 2);
  add(lid, lidG.wood, lidWoodMat);
  add(lid, lidG.metal, lidBrassMat);
  group.add(lid);

  const treasure = new THREE.Group();
  treasure.position.set(0, H + 0.002, 0);
  const heapMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  mats.push(heapMat);
  const heap = new THREE.Mesh(treasureG, heapMat);
  treasure.add(heap);
  const star = new THREE.Mesh(starG, heapMat);
  star.position.y = 0.62;
  treasure.add(star);
  treasure.visible = false;
  group.add(treasure);

  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  mats.push(beamMat);
  const beam = new THREE.Mesh(beamG, beamMat);
  beam.position.y = H + 1.4;
  beam.visible = false;
  beam.renderOrder = 5;
  group.add(beam);

  return {
    group,
    lid,
    treasure,
    star,
    beam,
    keyFill,
    setLid(open) {
      lid.rotation.x = -open * 1.95;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
