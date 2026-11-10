/**
 * Meshes for the secrets. Layer meshes (stones, halos, arrows, the weak-eye sign, the strong-eye
 * buttons and tiles) only keep brightness, so their shape is baked into grey vertex colours.
 * Both-eye meshes (pedestals, vault rock and door) use lit standard materials and read in the
 * red-only and green-only channels by brightness: bright gold/cream against dark stone and steel.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { merge, noise, paint, shadeGrey } from '../chests/bake';
import { symbolShape } from '../chests/lockModel';
import { createGlowMaterial } from '../../vision';
import type { ShapeKind } from './doorLogic';

// ───────────────────────────── shapes ─────────────────────────────

/** 2D outline of a button shape, radius about `r`. */
export function shapeOutline(kind: ShapeKind, r: number): THREE.Shape {
  if (kind === 'triangle') {
    const s = new THREE.Shape();
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
      if (i === 0) s.moveTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1 - r * 0.12);
      else s.lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1 - r * 0.12);
    }
    s.closePath();
    return s;
  }
  return symbolShape(kind === 'ring' ? 'circle' : kind, r);
}

/** Extruded shape facing +Z, centred on z = 0. */
export function shapeSolid(kind: ShapeKind, r: number, depth: number): THREE.BufferGeometry {
  const bevel = depth * 0.35;
  const g = new THREE.ExtrudeGeometry(shapeOutline(kind, r), { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 12 });
  return g.translate(0, 0, -depth / 2);
}

const facet = (nx: number, ny: number): number => 0.08 * Math.sin(Math.atan2(ny, nx) * 3);

// ───────────────────────────── stones (weak eye) ─────────────────────────────

/**
 * A floating stepping stone for a top radius of 1 (scale by the stone radius): flat bright top with
 * a raised rim ring, chunky faceted sides, and a dark tapering underside like a little sky island.
 */
export function stoneGeometry(): THREE.BufferGeometry {
  const prof = [
    new THREE.Vector2(0, 0.0),
    new THREE.Vector2(0.62, 0.0),
    new THREE.Vector2(0.7, 0.035),
    new THREE.Vector2(0.86, 0.035),
    new THREE.Vector2(0.98, -0.02),
    new THREE.Vector2(1.0, -0.12),
    new THREE.Vector2(0.9, -0.36),
    new THREE.Vector2(0.62, -0.52),
    new THREE.Vector2(0.3, -0.78),
    new THREE.Vector2(0, -0.92),
  ];
  // Lathe winds the wrong way for a top-down profile; flip so normals face out.
  const g = new THREE.LatheGeometry(prof.slice().reverse(), 9).toNonIndexed();
  const pos = g.getAttribute('position');
  // Rocky jitter on the underside only (the top stays a flat landing disc).
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -0.1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n = noise(Math.round(x * 50) * 7.3 + Math.round(z * 50) * 3.1 + Math.round(y * 50));
      const k = 1 + (n - 0.5) * 0.22;
      pos.setXYZ(i, x * k, y * (1 + (n - 0.5) * 0.12), z * k);
    }
  }
  g.computeVertexNormals();
  return paint(g, (x, y, z, _nx, ny) => {
    const rr = Math.hypot(x, z);
    let v: number;
    if (ny > 0.6) v = rr > 0.66 && rr < 0.9 ? 1 : 0.78 + 0.1 * Math.cos(rr * 9);
    else if (y > -0.2) v = 0.72;
    else v = 0.3 + 0.25 * Math.max(0, (y + 0.92) / 0.72);
    return new THREE.Color(v, v, v);
  });
}

/** Soft halo disc lying just under a stone's rim (vertex alpha: transparent centre and outside). */
export function haloGeometry(): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(0.8, 1.3, 28, 2).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const rr = Math.hypot(pos.getX(i), pos.getZ(i));
    const a = rr < 0.95 ? (rr - 0.8) / 0.15 : Math.max(0, (1.3 - rr) / 0.35);
    col.set([1, 1, 1, Math.max(0, Math.min(1, a)) * 0.6], i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.deleteAttribute('uv');
  return g;
}

export function layerBasic(opts: { transparent?: boolean; alpha?: boolean } = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: !!opts.transparent,
    depthWrite: !opts.transparent,
    toneMapped: false,
    ...(opts.alpha ? { vertexAlphas: true } : {}),
  } as THREE.MeshBasicMaterialParameters);
}

// ───────────────────────────── arrows (weak eye) ─────────────────────────────

/** A fat chevron arrow lying flat, tip toward +Z, about 1 m long, with a bright core and a darker rim. */
export function arrowGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.55);
  s.lineTo(0.5, 0.0);
  s.lineTo(0.27, 0.0);
  s.lineTo(0.27, -0.45);
  s.lineTo(-0.27, -0.45);
  s.lineTo(-0.27, 0.0);
  s.lineTo(-0.5, 0.0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 1 });
  // Shape is in XY with the tip at +Y; rotateX(+90°) maps +Y → +Z (tip forward) and the z = 0 cap
  // to an upward-facing top at y = 0, with the extrusion going down.
  g.rotateX(Math.PI / 2);
  const out = g.toNonIndexed();
  g.dispose();
  out.computeVertexNormals();
  return paint(out, (_x, _y, _z, _nx, ny) => {
    const v = ny > 0.5 ? 1 : 0.55;
    return new THREE.Color(v, v, v);
  });
}

// ───────────────────────────── pedestal (both eyes) ─────────────────────────────

export interface PedestalModel {
  group: THREE.Group;
  /** The trophy star (spins; pops when claimed). */
  star: THREE.Object3D;
  /** Glowing ring under a floating pedestal (null when standing). */
  ring: THREE.Mesh | null;
  dispose(): void;
}

const GOLD = 0xffcf3a;
const CREAM = 0xf4ecd8;
const SLATE = 0x2e3440;

export function buildPedestal(r: number, floating: boolean, post: number): PedestalModel {
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const group = new THREE.Group();
  group.name = 'secret-pedestal';
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const stone = new THREE.MeshStandardMaterial({ color: SLATE, roughness: 0.75, metalness: 0.1 });
  const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.75, emissive: 0x6a4a00, emissiveIntensity: 0.35 });
  mats.push(stone, cream, gold);
  // Top: cream disc with a gold rim and a dark band below, so the edge reads in both channels.
  add(new THREE.CylinderGeometry(r, r * 0.97, 0.16, 40).translate(0, -0.08, 0), cream);
  add(new THREE.TorusGeometry(r - 0.05, 0.07, 8, 48).rotateX(Math.PI / 2).translate(0, 0.0, 0), gold);
  add(new THREE.CylinderGeometry(r * 0.97, r * 0.82, 0.32, 40).translate(0, -0.32, 0), stone);
  // Inlaid star pattern on the top (thin raised gold).
  const inlay = new THREE.ExtrudeGeometry(shapeOutline('star', r * 0.42), { depth: 0.02, bevelEnabled: false, curveSegments: 4 });
  add(inlay.rotateX(-Math.PI / 2).translate(0, 0.0, 0), gold, false);
  if (post > 0) {
    add(new THREE.CylinderGeometry(0.28, 0.4, post, 12).translate(0, -0.48 - post / 2 + 0.1, 0), stone);
  }
  let ring: THREE.Mesh | null = null;
  if (floating) {
    add(new THREE.ConeGeometry(r * 0.8, 1.1, 24).rotateX(Math.PI).translate(0, -0.48 - 0.55, 0), cream);
    add(new THREE.TorusGeometry(r * 0.62, 0.05, 6, 40).rotateX(Math.PI / 2).translate(0, -0.85, 0), gold, false);
    const glow = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.85, toneMapped: false });
    mats.push(glow);
    ring = add(new THREE.TorusGeometry(r * 0.88, 0.06, 6, 48).rotateX(Math.PI / 2).translate(0, -0.5, 0), glow, false);
  }
  // The trophy: a fat gold star on a short cream column, floating over the centre.
  const star = new THREE.Group();
  const starGeo = new THREE.ExtrudeGeometry(shapeOutline('star', 0.5), { depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
  starGeo.translate(0, 0, -0.08);
  geos.push(starGeo);
  const sm = new THREE.Mesh(starGeo, gold);
  sm.castShadow = true;
  star.add(sm);
  star.position.set(0, 1.45, 0);
  group.add(star);
  add(new THREE.CylinderGeometry(0.12, 0.2, 0.55, 12).translate(0, 0.27, 0), cream);
  add(new THREE.SphereGeometry(0.16, 12, 8).translate(0, 0.62, 0), gold);
  return {
    group,
    star,
    ring,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

// ───────────────────────────── vault (both eyes) ─────────────────────────────

/** Door-local sizes (metres). Door plane at z = 0, +Z out of the rock, x along the door. */
export const VAULT = {
  /** Chamber inside: x ±halfW, y 0..h, z −depth..0. */
  halfW: 2.3,
  h: 3.6,
  depth: 4.4,
  /** Door leaf. */
  doorW: 4.5,
  doorH: 3.75,
  doorT: 0.3,
  /** Height of the button row on the door. */
  buttonY: 2.35,
  /** Outer crag extents. */
  outerHalfW: 6.4,
  outerTop: 7.2,
  outerBack: -8.6,
  /** How far the door sinks into the floor when it opens. */
  sink: 3.9,
} as const;

export interface VaultModel {
  /** Static parts (rock, frame, chamber, treasure). Placed at the door base, rotated by yaw. */
  group: THREE.Group;
  /** Sliding door leaf (child of group). */
  door: THREE.Group;
  /** The three progress lamps (child of group). */
  lamps: THREE.Mesh[];
  lampOn: THREE.MeshStandardMaterial;
  lampOff: THREE.MeshStandardMaterial;
  treasure: THREE.Group;
  dispose(): void;
}

function rockPiece(seed: number, sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  const pos = g.getAttribute('position');
  // Displace by a hash of the (shared) original vertex so faces stay watertight.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = noise(seed * 13.7 + Math.round(x * 100) * 0.917 + Math.round(y * 100) * 1.31 + Math.round(z * 100) * 0.533);
    const k = 0.84 + n * 0.3;
    pos.setXYZ(i, x * k * sx, y * k * sy * (y > 0 ? 0.92 : 1), z * k * sz);
  }
  g.computeVertexNormals();
  return g;
}

interface Box3 {
  min: [number, number, number];
  max: [number, number, number];
}

function boxesOverlap(a: Box3, b: Box3): boolean {
  for (let i = 0; i < 3; i++) if (a.max[i] <= b.min[i] || a.min[i] >= b.max[i]) return false;
  return true;
}

export function buildVault(seed: number): VaultModel {
  const V = VAULT;
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const group = new THREE.Group();
  group.name = 'secret-vault';
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = group, shadow = true): THREE.Mesh => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // Rock: chunky faceted boulders around the chamber, kept out of the room and the doorway.
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  mats.push(rockMat);
  const keepOut: Box3[] = [
    { min: [-V.halfW - 0.55, -5, -V.depth - 0.55], max: [V.halfW + 0.55, V.h + 0.75, 0.2] },
    { min: [-V.halfW - 0.75, -5, -1.2], max: [V.halfW + 0.75, V.h + 0.95, 9] },
  ];
  const parts: THREE.BufferGeometry[] = [];
  let k = 0;
  for (let ix = -3; ix <= 3; ix++) {
    for (let iy = 0; iy <= 3; iy++) {
      for (let iz = 0; iz <= 3; iz++) {
        k++;
        const n1 = noise(seed * 31 + k * 1.7);
        const n2 = noise(seed * 17 + k * 2.3);
        const n3 = noise(seed * 7 + k * 3.1);
        const cx = ix * 2.05 + (n1 - 0.5) * 0.8;
        const cy = iy * 2.1 - 0.4 + (n2 - 0.5) * 0.6;
        const cz = -0.9 - iz * 2.35 + (n3 - 0.5) * 0.6;
        // Mound profile: lower towards the sides and the back.
        const hx = cx / V.outerHalfW;
        const hz = (cz + 4) / 5;
        if (cy > V.outerTop * (1 - 0.45 * hx * hx - 0.25 * Math.max(0, -hz - 0.3))) continue;
        const sx = 1.35 + n1 * 0.6;
        const sy = 1.15 + n2 * 0.5;
        const sz = 1.3 + n3 * 0.5;
        const ext: Box3 = { min: [cx - sx * 1.1, cy - sy * 1.1, cz - sz * 1.1], max: [cx + sx * 1.1, cy + sy * 1.1, cz + sz * 1.1] };
        if (keepOut.some((b) => boxesOverlap(b, ext))) continue;
        const g = rockPiece(seed * 100 + k, sx, sy, sz);
        g.rotateY(n2 * 6.28);
        g.translate(cx, cy, cz);
        parts.push(g);
      }
    }
  }
  // Facing stones either side of the door and above it (pressed flat against the frame).
  for (const s of [-1, 1]) {
    for (let iy = 0; iy < 3; iy++) {
      const g = rockPiece(seed * 50 + iy + (s > 0 ? 10 : 0), 0.95, 1.25, 1.1);
      g.translate(s * (V.halfW + 1.55 + (iy % 2) * 0.3), 0.6 + iy * 2.1, -0.75);
      parts.push(g);
    }
  }
  for (let ix = -1; ix <= 1; ix++) {
    const g = rockPiece(seed * 60 + ix, 1.35, 0.9, 1.1);
    g.translate(ix * 2.0, V.h + 1.85, -0.9);
    parts.push(g);
  }
  const rockGeo = paint(merge(parts), (x, y, z, nx, ny) => {
    const n = noise(Math.round(x * 3) * 1.3 + Math.round(y * 3) * 7.1 + Math.round(z * 3) * 3.7);
    // Warm grey stone; tops a bit lighter, undersides darker (baked AO on top of real lighting).
    const v = 0.36 + n * 0.12 + 0.08 * ny + (y < 0.4 ? -0.06 : 0);
    void nx;
    return new THREE.Color(v * 1.04, v, v * 0.94).convertSRGBToLinear();
  });
  for (const p of parts) p.dispose();
  mesh(rockGeo, rockMat);

  // Chamber: dark stone walls, floor and ceiling (inside faces), plus a thin floor slab.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3b3833, roughness: 0.9 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x5a5249, roughness: 0.85 });
  mats.push(wallMat, floorMat);
  const room = new THREE.BoxGeometry(V.halfW * 2, V.h, V.depth).translate(0, V.h / 2, -V.depth / 2);
  const roomMesh = mesh(room, new THREE.MeshStandardMaterial({ color: 0x3b3833, roughness: 0.9, side: THREE.BackSide }));
  mats.push(roomMesh.material as THREE.Material);
  mesh(new THREE.BoxGeometry(V.halfW * 2 - 0.05, 0.08, V.depth + 0.9).translate(0, 0.04, -V.depth / 2 + 0.45), floorMat);
  // Thick wall shells (outside faces) so gaps between boulders never show into the room.
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.6, V.h + 0.6, V.depth + 0.6).translate(s * (V.halfW + 0.3), V.h / 2, -V.depth / 2 - 0.3), wallMat);
  mesh(new THREE.BoxGeometry(V.halfW * 2 + 1.2, 0.6, V.depth + 0.6).translate(0, V.h + 0.3, -V.depth / 2 - 0.3), wallMat);
  mesh(new THREE.BoxGeometry(V.halfW * 2 + 1.2, V.h + 0.6, 0.6).translate(0, V.h / 2, -V.depth - 0.3), wallMat);

  // Door frame: cream stone posts and lintel with a dark reveal (reads in both channels).
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe9dfc8, roughness: 0.7 });
  const revealMat = new THREE.MeshStandardMaterial({ color: 0x1d1b19, roughness: 0.9 });
  mats.push(frameMat, revealMat);
  for (const s of [-1, 1]) {
    mesh(new RoundedBoxGeometry(0.7, V.doorH + 0.5, 0.95, 2, 0.08).translate(s * (V.halfW + 0.35), (V.doorH + 0.5) / 2 - 0.1, -0.12), frameMat);
  }
  mesh(new RoundedBoxGeometry(V.halfW * 2 + 1.5, 0.8, 1.05, 2, 0.1).translate(0, V.doorH + 0.5, -0.1), frameMat);
  mesh(new THREE.BoxGeometry(V.halfW * 2 + 0.05, 0.14, 0.5).translate(0, V.doorH + 0.06, -0.05), revealMat);
  // Keystone.
  mesh(new RoundedBoxGeometry(0.7, 0.95, 1.15, 2, 0.08).translate(0, V.doorH + 0.62, -0.05), frameMat);

  // Progress lamps on the lintel.
  const lampOff = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.25, metalness: 0.2 });
  const lampOn = new THREE.MeshStandardMaterial({ color: 0xfff4cf, emissive: 0xffe9a8, emissiveIntensity: 2.2, roughness: 0.3, toneMapped: true });
  mats.push(lampOff, lampOn);
  const lamps: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.95;
    if (i !== 1) {
      lamps.push(mesh(new THREE.SphereGeometry(0.2, 16, 10).translate(x, V.doorH + 0.5, 0.48), lampOff, group, false));
    } else {
      lamps.push(mesh(new THREE.SphereGeometry(0.2, 16, 10).translate(x, V.doorH + 1.2, 0.58), lampOff, group, false));
    }
    mesh(new THREE.TorusGeometry(0.23, 0.05, 6, 20).translate(x, i === 1 ? V.doorH + 1.2 : V.doorH + 0.5, i === 1 ? 0.56 : 0.46), revealMat, group, false);
  }

  // Door leaf: dark steel with bright brass bands, rivets and a wheel.
  const door = new THREE.Group();
  door.name = 'vault-door';
  group.add(door);
  const steel = new THREE.MeshStandardMaterial({ color: 0x3e4752, roughness: 0.45, metalness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xe8b84a, roughness: 0.35, metalness: 0.85 });
  mats.push(steel, brass);
  mesh(new RoundedBoxGeometry(V.doorW, V.doorH, V.doorT, 3, 0.06).translate(0, V.doorH / 2, -V.doorT / 2 - 0.02), steel, door);
  for (const y of [0.35, V.doorH - 0.35]) mesh(new THREE.BoxGeometry(V.doorW - 0.1, 0.16, 0.06).translate(0, y, 0.0), brass, door);
  for (const x of [-V.doorW / 2 + 0.3, V.doorW / 2 - 0.3]) mesh(new THREE.BoxGeometry(0.16, V.doorH - 0.6, 0.06).translate(x, V.doorH / 2, 0), brass, door);
  const rivets: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 11; i++) {
    for (const y of [0.35, V.doorH - 0.35]) rivets.push(new THREE.SphereGeometry(0.05, 6, 4).translate(-V.doorW / 2 + 0.3 + (i * (V.doorW - 0.6)) / 10, y, 0.05));
  }
  mesh(merge(rivets), brass, door, false);
  for (const r of rivets) r.dispose();
  // Wheel below the button row.
  mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 32).translate(0, 1.15, 0.08), brass, door);
  for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06).rotateZ((i * Math.PI) / 3).translate(0, 1.15, 0.08), brass, door, false);
  mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12).rotateX(Math.PI / 2).translate(0, 1.15, 0.1), brass, door, false);
  // Recessed panel where the (strong-eye) buttons sit: plain on purpose.
  mesh(new THREE.BoxGeometry(V.doorW - 0.9, 0.9, 0.04).translate(0, V.buttonY, 0.0), revealMat, door, false);

  // Treasure pile inside: gold heap, coin stacks, gems and a big star.
  const treasure = new THREE.Group();
  treasure.position.set(0, 0, -V.depth * 0.58);
  group.add(treasure);
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc928, roughness: 0.28, metalness: 0.85, emissive: 0x7a4a00, emissiveIntensity: 0.45 });
  const gemA = new THREE.MeshStandardMaterial({ color: 0xff4fb8, roughness: 0.15, metalness: 0.1, emissive: 0x5a0a3a, emissiveIntensity: 0.5 });
  const gemB = new THREE.MeshStandardMaterial({ color: 0x5ad8ff, roughness: 0.15, metalness: 0.1, emissive: 0x0a3a5a, emissiveIntensity: 0.5 });
  mats.push(goldMat, gemA, gemB);
  mesh(new THREE.SphereGeometry(1.25, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 0.85), goldMat, treasure);
  const coins: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 26; i++) {
    const a = noise(seed + i * 3.3) * Math.PI * 2;
    const rr = 0.5 + noise(seed + i * 5.1) * 1.0;
    const x = Math.cos(a) * rr * 1.1;
    const z = Math.sin(a) * rr * 0.85;
    const y = Math.max(0.03, 0.68 * Math.sqrt(Math.max(0, 1 - (rr / 1.25) ** 2))) + 0.02;
    coins.push(new THREE.CylinderGeometry(0.13, 0.13, 0.035, 12).rotateX(noise(i) * 0.9).rotateZ(noise(i + 9) * 0.9).translate(x, y, z));
  }
  for (const [x, z, h] of [[-1.3, 0.4, 0.5], [1.35, 0.2, 0.7], [0.9, 0.9, 0.35], [-0.8, -0.8, 0.6]]) {
    for (let j = 0; j < Math.round(h / 0.05); j++) coins.push(new THREE.CylinderGeometry(0.14, 0.14, 0.045, 12).translate(x + Math.sin(j) * 0.015, 0.025 + j * 0.05, z));
  }
  mesh(merge(coins), goldMat, treasure);
  for (const c of coins) c.dispose();
  for (const [x, y, z, s, m] of [[-0.4, 0.75, 0.3, 0.22, 0], [0.5, 0.6, -0.2, 0.18, 1], [0.1, 0.55, 0.65, 0.15, 1], [-0.85, 0.4, -0.3, 0.16, 0]] as const) {
    const g = new THREE.OctahedronGeometry(s, 0).scale(1, 1.4, 1).rotateY(x * 3).translate(x, y, z);
    mesh(g, m === 0 ? gemA : gemB, treasure);
  }
  const bigStar = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeOutline('star', 0.42), { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }).translate(0, 0, -0.07), goldMat);
  geos.push(bigStar.geometry);
  bigStar.position.set(0, 1.35, 0);
  bigStar.name = 'treasure-star';
  treasure.add(bigStar);

  return {
    group,
    door,
    lamps,
    lampOn,
    lampOff,
    treasure,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

// ───────────────────────────── vault layer parts ─────────────────────────────

export interface SignModel {
  /** Door-local root; add to the WeakOnly layer and copy the vault transform onto it. */
  root: THREE.Group;
  /** One group per step (shape + glow + pips), left to right. */
  steps: THREE.Group[];
  dispose(): void;
}

/** The weak-eye sequence: three big shapes in a row above the door, with 1/2/3 pips and arrows. */
export function buildSign(sequence: readonly ShapeKind[]): SignModel {
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const root = new THREE.Group();
  root.name = 'vault-sign';
  const solid = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const glowMat = createGlowMaterial({ level: 1, coreOpacity: 0.12, rimPower: 2.2, pulse: 0.25 });
  mats.push(solid, glowMat);
  const steps: THREE.Group[] = [];
  const glowGeo = new THREE.SphereGeometry(0.62, 20, 12).scale(1, 1, 0.35);
  geos.push(glowGeo);
  sequence.forEach((kind, i) => {
    const g = new THREE.Group();
    g.position.set((i - 1) * 1.45, 0, 0);
    const shape = shadeGrey(shapeSolid(kind, 0.42, 0.14), 1, 0.62, facet);
    geos.push(shape);
    g.add(new THREE.Mesh(shape, solid));
    g.add(new THREE.Mesh(glowGeo, glowMat));
    // Pips: 1, 2, 3 dots under the shape (order without numbers).
    const pips: THREE.BufferGeometry[] = [];
    for (let p = 0; p <= i; p++) pips.push(new THREE.SphereGeometry(0.075, 10, 6).translate((p - i / 2) * 0.24, -0.66, 0));
    const pipGeo = shadeGrey(merge(pips), 1, 0.7);
    for (const p of pips) p.dispose();
    geos.push(pipGeo);
    g.add(new THREE.Mesh(pipGeo, solid));
    root.add(g);
    steps.push(g);
  });
  // Little arrows between the shapes.
  const chev: THREE.BufferGeometry[] = [];
  for (const x of [-0.725, 0.725]) {
    for (const s of [-1, 1]) chev.push(new THREE.BoxGeometry(0.22, 0.06, 0.06).rotateZ(-s * 0.7).translate(x, s * 0.07, 0));
  }
  const chevGeo = shadeGrey(merge(chev), 0.9, 0.6);
  for (const c of chev) c.dispose();
  geos.push(chevGeo);
  root.add(new THREE.Mesh(chevGeo, solid));
  return {
    root,
    steps,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

export interface ButtonsModel {
  /** Door-local root for the buttons on the door (strong eye). */
  door: THREE.Group;
  /** World-placed tiles on the ground in front (strong eye), one per button. */
  tiles: THREE.Group;
  buttons: THREE.Group[];
  tileMeshes: THREE.Group[];
  dispose(): void;
}

/** Strong-eye shape buttons (on the door) and matching floor tiles (in front of each button). */
export function buildButtons(xs: readonly number[], shapes: readonly ShapeKind[]): ButtonsModel {
  const geos: THREE.BufferGeometry[] = [];
  const solid = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const door = new THREE.Group();
  door.name = 'vault-buttons';
  const tiles = new THREE.Group();
  tiles.name = 'vault-tiles';
  const buttons: THREE.Group[] = [];
  const tileMeshes: THREE.Group[] = [];
  // No filled plates: on a layer only coverage and brightness show, so a shape inside a filled
  // plate would barely read. A bright ring (or frame) with the shape floating inside it reads best.
  const rim = shadeGrey(new THREE.TorusGeometry(0.37, 0.05, 6, 32), 0.95, 0.6);
  const tileRim = shadeGrey(merge([
    new THREE.BoxGeometry(0.86, 0.06, 0.06).translate(0, 0.01, 0.6),
    new THREE.BoxGeometry(0.86, 0.06, 0.06).translate(0, 0.01, -0.6),
    new THREE.BoxGeometry(0.06, 0.06, 1.25).translate(0.41, 0.01, 0),
    new THREE.BoxGeometry(0.06, 0.06, 1.25).translate(-0.41, 0.01, 0),
  ]), 0.95, 0.7);
  geos.push(rim, tileRim);
  xs.forEach((x, i) => {
    const b = new THREE.Group();
    b.position.set(x, 0, 0.1);
    const sym = shadeGrey(shapeSolid(shapes[i], 0.24, 0.07).translate(0, 0, 0.04), 1, 0.65, facet);
    geos.push(sym);
    b.add(new THREE.Mesh(rim, solid), new THREE.Mesh(sym, solid));
    door.add(b);
    buttons.push(b);
    const t = new THREE.Group();
    const flatSym = shadeGrey(shapeSolid(shapes[i], 0.3, 0.04).rotateX(-Math.PI / 2).translate(0, 0.03, 0), 1, 0.8);
    geos.push(flatSym);
    t.add(new THREE.Mesh(tileRim, solid), new THREE.Mesh(flatSym, solid));
    tiles.add(t);
    tileMeshes.push(t);
  });
  return {
    door,
    tiles,
    buttons,
    tileMeshes,
    dispose() {
      for (const g of geos) g.dispose();
      solid.dispose();
    },
  };
}
