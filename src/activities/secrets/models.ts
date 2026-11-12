/**
 * Meshes for the secrets. Layer meshes (stones, halos, arrows, the weak-eye sign, the strong-eye
 * buttons and tiles) only keep brightness, so their shape is baked into grey vertex colours.
 * Both-eye meshes (pedestals, vault rock and door) share one lit surface material (per-vertex
 * colour, roughness, metalness and glow; see batch.ts) and read in the red-only and green-only
 * channels by brightness: bright gold/cream against dark stone and steel.
 *
 * Draw calls: every pedestal, vault, sign and button row is ONE merged mesh (parts that move are
 * re-posed on the CPU by `PartBatch`), and each sits in a distance cull.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { merge, noise, paint, shadeGrey } from '../chests/bake';
import { symbolShape } from '../chests/lockModel';
import { createGlowMaterial } from '../../vision';
import type { ShapeKind } from './doorLogic';
import { PartBatch, insideOut, surface } from './batch';
import type { Surf } from './batch';
import type { Crag } from './routes';

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
    // `opts.alpha`: three reads vertex alpha from a 4-component colour attribute by itself
    // (there is no `vertexAlphas` material parameter; passing one only logs a warning).
  });
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
  const out = g.index ? g.toNonIndexed() : g;
  g.dispose();
  out.computeVertexNormals();
  return paint(out, (_x, _y, _z, _nx, ny) => {
    const v = ny > 0.5 ? 1 : 0.55;
    return new THREE.Color(v, v, v);
  });
}

// ───────────────────────────── surfaces (both eyes) ─────────────────────────────

const GOLD = 0xffcf3a;
const CREAM = 0xf4ecd8;
const SLATE = 0x2e3440;

const S_STONE = { rough: 0.75, metal: 0.1 };
const S_CREAM = { rough: 0.6, metal: 0 };
const S_GOLD = { rough: 0.3, metal: 0.75, glow: 0.06 };
const S_STEEL = { rough: 0.45, metal: 0.7 };
const S_BRASS = { rough: 0.35, metal: 0.85 };
const S_MATTE = { rough: 0.9, metal: 0 };
const S_FRAME = { rough: 0.7, metal: 0 };
const S_TREASURE = { rough: 0.28, metal: 0.85, glow: 0.1 };
const S_GEM = { rough: 0.15, metal: 0.1, glow: 0.12 };
/** Progress lamps: dark glass when off, a bright glow when lit. */
export const LAMP_OFF = { color: new THREE.Color(0x2a2e33), surf: { rough: 0.25, metal: 0.2, glow: 0 } };
export const LAMP_ON = { color: new THREE.Color(0xfff4cf), surf: { rough: 0.3, metal: 0, glow: 2.2 } };
/** Glow of the ring under a floating pedestal (pulses between about 0.6 and 1.1). */
export const RING_GLOW = { rough: 0.5, metal: 0, glow: 0.85 };

// ───────────────────────────── pedestal (both eyes) ─────────────────────────────

export interface PedestalModel {
  /** One mesh (name `secret-pedestal`); place it at the pedestal top. */
  mesh: THREE.Mesh;
  batch: PartBatch;
  /** Part index of the trophy star (rest pose: centred on the pedestal axis at y = 0). */
  star: number;
  /** Part index of the glowing ring under a floating pedestal, or -1. */
  ring: number;
  dispose(): void;
}

export function buildPedestal(r: number, floating: boolean, post: number, material: THREE.Material): PedestalModel {
  const fixed: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, color: number, s: Surf): void => void fixed.push(surface(geo, color, s));
  // Top: cream disc with a gold rim and a dark band below, so the edge reads in both channels.
  add(new THREE.CylinderGeometry(r, r * 0.97, 0.16, 40).translate(0, -0.08, 0), CREAM, S_CREAM);
  add(new THREE.TorusGeometry(r - 0.05, 0.07, 8, 48).rotateX(Math.PI / 2), GOLD, S_GOLD);
  add(new THREE.CylinderGeometry(r * 0.97, r * 0.82, 0.32, 40).translate(0, -0.32, 0), SLATE, S_STONE);
  // Inlaid star pattern on the top (thin raised gold).
  add(new THREE.ExtrudeGeometry(shapeOutline('star', r * 0.42), { depth: 0.02, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2), GOLD, S_GOLD);
  if (post > 0) add(new THREE.CylinderGeometry(0.28, 0.4, post, 12).translate(0, -0.48 - post / 2 + 0.1, 0), SLATE, S_STONE);
  if (floating) {
    add(new THREE.ConeGeometry(r * 0.8, 1.1, 24).rotateX(Math.PI).translate(0, -0.48 - 0.55, 0), CREAM, S_CREAM);
    add(new THREE.TorusGeometry(r * 0.62, 0.05, 6, 40).rotateX(Math.PI / 2).translate(0, -0.85, 0), GOLD, S_GOLD);
  }
  // The trophy: a fat gold star on a short cream column, floating over the centre.
  add(new THREE.CylinderGeometry(0.12, 0.2, 0.55, 12).translate(0, 0.27, 0), CREAM, S_CREAM);
  add(new THREE.SphereGeometry(0.16, 12, 8).translate(0, 0.62, 0), GOLD, S_GOLD);
  const star = new THREE.ExtrudeGeometry(shapeOutline('star', 0.5), { depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }).translate(0, 0, -0.08);
  const parts = [merge(fixed), surface(star, GOLD, S_GOLD)];
  if (floating) parts.push(surface(new THREE.TorusGeometry(r * 0.88, 0.06, 6, 48).rotateX(Math.PI / 2).translate(0, -0.5, 0), 0xfff1b0, RING_GLOW));
  const batch = new PartBatch(parts);
  for (const g of [...fixed, ...parts]) g.dispose();
  // The star spins and pops up to ~2.6 m above the top.
  const bs = batch.geometry.boundingSphere;
  if (bs) bs.radius += 1.5;
  const mesh = new THREE.Mesh(batch.geometry, material);
  mesh.name = 'secret-pedestal';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, batch, star: 1, ring: floating ? 2 : -1, dispose: () => batch.dispose() };
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
  /** The three round windows on the door where the weak eye sees the sequence (door-local). */
  screenY: 2.62,
  screenX: 1.3,
  screenR: 0.5,
  /** Floor pads: base and cap sizes, cap height above the ground at rest. */
  padBaseR: 0.8,
  padCapH: 0.13,
  /** Outer crag top (the crag's width and depth are per vault: `Crag`). */
  outerTop: 7.2,
  /** How far the door sinks into the floor when it opens. */
  sink: 3.9,
} as const;

export interface VaultModel {
  /** One mesh (name `secret-vault`), placed at the door base and rotated by the yaw. */
  mesh: THREE.Mesh;
  /** The door leaf with its window rings (name `secret-vault-door`), a child of `mesh`. */
  door: THREE.Mesh;
  batch: PartBatch;
  /** Move the door leaf (door-local offset from its closed pose); the window rings move with it. */
  setDoor(x: number, y: number): void;
  /** Light or darken progress lamp `i` (0..2): the ring round window `i`. */
  setLamp(i: number, on: boolean): void;
  /** Pose the treasure star: spin angle, height above the chamber floor, scale. */
  setStar(spin: number, y: number, scale: number): void;
  /** Pose the treasure star anywhere (door-local x, y, z): it flies out to the hero. */
  setStarAt(x: number, y: number, z: number, spin: number, scale: number): void;
  /** Pose floor pad `i`'s cap: push-in depth (m), sideways shake (m), look and dwell disc fill (0 hides it). */
  setPad(i: number, push: number, shake: number, look: PadLook, fill?: number): void;
  /** Upload what changed this frame. */
  commit(): void;
  dispose(): void;
}

function rockPiece(seed: number, sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1); // polyhedra are already non-indexed
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
  // Non-indexed: per-face normals, i.e. the faceted look without a flat-shading material.
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

const TREASURE_Z = -VAULT.depth * 0.58;
const STAR_Y = 1.35;

/** Floor pad looks: idle (bright cream), lit (glowing gold: a right step), dark (a wrong step). */
export type PadLook = 'idle' | 'lit' | 'dark';
const PAD_LOOK: Record<PadLook, { color: THREE.Color; surf: { rough: number; metal: number; glow: number } }> = {
  idle: { color: new THREE.Color(0xf1e6cc), surf: { rough: 0.55, metal: 0.05, glow: 0.05 } },
  lit: { color: new THREE.Color(0xffd23a), surf: { rough: 0.3, metal: 0.4, glow: 1.4 } },
  dark: { color: new THREE.Color(0x2a2724), surf: { rough: 0.8, metal: 0, glow: 0 } },
};

/** Door-local rest pose of a floor pad: centre on the ground (y is the ground height there). */
export interface PadPlace {
  x: number;
  y: number;
  z: number;
}

/** Door-local pose of the rule-demo board (centre of its face), facing out of the door, turned by `yaw`. */
export interface BoardPlace {
  x: number;
  /** Ground height under the board. */
  y: number;
  z: number;
  yaw: number;
}

export const BOARD = { w: 2.4, h: 2.1, bottom: 0.75 } as const;

export function buildVault(seed: number, crag: Crag, material: THREE.Material, pads: readonly PadPlace[] = [], board: BoardPlace | null = null): VaultModel {
  const V = VAULT;
  const fixed: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, color: number, s: Surf): void => void fixed.push(surface(geo, color, s));

  // Rock: chunky faceted boulders around the chamber, kept out of the room, the doorway and
  // (roughly) inside the crag's outer extents.
  const keepOut: Box3[] = [
    { min: [-V.halfW - 0.55, -5, -V.depth - 0.55], max: [V.halfW + 0.55, V.h + 0.75, 0.2] },
    { min: [-V.halfW - 0.75, -5, -1.2], max: [V.halfW + 0.75, V.h + 0.95, 9] },
  ];
  const outer: Box3 = { min: [-crag.halfW - 0.6, -5, crag.back - 0.8], max: [crag.halfW + 0.6, 20, 2] };
  const sxMax = Math.min(1, crag.halfW / 6.4);
  const parts: THREE.BufferGeometry[] = [];
  let k = 0;
  for (let ix = -3; ix <= 3; ix++) {
    for (let iy = 0; iy <= 3; iy++) {
      for (let iz = 0; iz <= 3; iz++) {
        k++;
        const n1 = noise(seed * 31 + k * 1.7);
        const n2 = noise(seed * 17 + k * 2.3);
        const n3 = noise(seed * 7 + k * 3.1);
        const cx = (ix * 2.05 + (n1 - 0.5) * 0.8) * sxMax;
        const cy = iy * 2.1 - 0.4 + (n2 - 0.5) * 0.6;
        const cz = -0.9 - iz * 2.35 + (n3 - 0.5) * 0.6;
        // Mound profile: lower towards the sides and the back.
        const hx = cx / crag.halfW;
        const hz = (cz + 4) / 5;
        if (cy > V.outerTop * (1 - 0.45 * hx * hx - 0.25 * Math.max(0, -hz - 0.3))) continue;
        const sx = (1.35 + n1 * 0.6) * Math.max(0.8, sxMax);
        const sy = 1.15 + n2 * 0.5;
        const sz = 1.3 + n3 * 0.5;
        const ext: Box3 = { min: [cx - sx * 1.1, cy - sy * 1.1, cz - sz * 1.1], max: [cx + sx * 1.1, cy + sy * 1.1, cz + sz * 1.1] };
        if (keepOut.some((b) => boxesOverlap(b, ext))) continue;
        if (ext.min[0] < outer.min[0] || ext.max[0] > outer.max[0] || ext.min[2] < outer.min[2]) continue;
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
  const rock = merge(parts);
  for (const p of parts) p.dispose();
  fixed.push(
    surface(
      rock,
      (x, y, z, _nx, ny) => {
        const n = noise(Math.round(x * 3) * 1.3 + Math.round(y * 3) * 7.1 + Math.round(z * 3) * 3.7);
        // Warm grey stone; tops a bit lighter, undersides darker (baked AO on top of real lighting).
        const v = 0.36 + n * 0.12 + 0.08 * ny + (y < 0.4 ? -0.06 : 0);
        return new THREE.Color(v * 1.04, v, v * 0.94).convertSRGBToLinear();
      },
      { rough: 0.95, metal: 0 },
    ),
  );

  // Chamber: dark stone walls, floor and ceiling (seen from inside), plus a thin floor slab.
  add(insideOut(new THREE.BoxGeometry(V.halfW * 2, V.h, V.depth).translate(0, V.h / 2, -V.depth / 2)), 0x3b3833, S_MATTE);
  add(new THREE.BoxGeometry(V.halfW * 2 - 0.05, 0.08, V.depth + 0.9).translate(0, 0.04, -V.depth / 2 + 0.45), 0x5a5249, { rough: 0.85, metal: 0 });
  // Thick wall shells (outside faces, set 3 cm back from the room so nothing z-fights) so gaps
  // between boulders never show into the room.
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.6, V.h + 0.6, V.depth + 0.6).translate(s * (V.halfW + 0.33), V.h / 2, -V.depth / 2 - 0.3), 0x3b3833, S_MATTE);
  add(new THREE.BoxGeometry(V.halfW * 2 + 1.2, 0.6, V.depth + 0.6).translate(0, V.h + 0.33, -V.depth / 2 - 0.3), 0x3b3833, S_MATTE);
  add(new THREE.BoxGeometry(V.halfW * 2 + 1.2, V.h + 0.6, 0.6).translate(0, V.h / 2, -V.depth - 0.33), 0x3b3833, S_MATTE);

  // Door frame: cream stone posts and lintel with a dark reveal (reads in both channels).
  for (const s of [-1, 1]) add(new RoundedBoxGeometry(0.7, V.doorH + 0.5, 0.95, 2, 0.08).translate(s * (V.halfW + 0.35), (V.doorH + 0.5) / 2 - 0.1, -0.12), 0xe9dfc8, S_FRAME);
  add(new RoundedBoxGeometry(V.halfW * 2 + 1.5, 0.8, 1.05, 2, 0.1).translate(0, V.doorH + 0.5, -0.1), 0xe9dfc8, S_FRAME);
  add(new THREE.BoxGeometry(V.halfW * 2 + 0.05, 0.14, 0.5).translate(0, V.doorH + 0.06, -0.05), 0x1d1b19, S_MATTE);
  // Treasure window over the lintel ("what's inside"): a round gold-framed porthole with bars, and
  // behind it a glowing heap of gold with a big star. Bright gold on near-black reads in R and G.
  {
    const wy = V.doorH + 1.15;
    const wz = 0.62;
    add(new THREE.CylinderGeometry(0.86, 0.86, 0.3, 36).rotateX(Math.PI / 2).translate(0, wy, wz - 0.2), 0x1d1b19, S_MATTE);
    add(new THREE.CylinderGeometry(0.72, 0.72, 0.06, 36).rotateX(Math.PI / 2).translate(0, wy, wz - 0.02), 0xffb92e, { rough: 0.4, metal: 0, glow: 0.9 });
    add(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.55, 0.4).translate(0, wy - 0.42, wz + 0.02), 0xffd23a, { rough: 0.3, metal: 0.6, glow: 0.5 });
    add(new THREE.ExtrudeGeometry(shapeOutline('star', 0.32), { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }).translate(0, wy + 0.08, wz + 0.04), 0xfff4cf, { rough: 0.3, metal: 0.3, glow: 1.2 });
    add(new THREE.TorusGeometry(0.76, 0.1, 10, 40).translate(0, wy, wz + 0.04), 0xe8b84a, S_BRASS);
    for (const bx of [-0.36, 0, 0.36]) {
      const hh = Math.sqrt(Math.max(0, 0.72 * 0.72 - bx * bx));
      add(new THREE.CylinderGeometry(0.045, 0.045, hh * 2, 8).translate(bx, wy, wz + 0.12), 0x1d1b19, { rough: 0.5, metal: 0.6 });
    }
  }

  // Treasure pile inside: gold heap, coin stacks and gems (the big star is its own part: it spins).
  const T = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.translate(0, 0, TREASURE_Z);
  add(T(new THREE.SphereGeometry(1.25, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 0.85)), 0xffc928, S_TREASURE);
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
  const coinGeo = merge(coins);
  for (const c of coins) c.dispose();
  add(T(coinGeo), 0xffc928, S_TREASURE);
  for (const [x, y, z, s, m] of [[-0.4, 0.75, 0.3, 0.22, 0], [0.5, 0.6, -0.2, 0.18, 1], [0.1, 0.55, 0.65, 0.15, 1], [-0.85, 0.4, -0.3, 0.16, 0]] as const) {
    add(T(new THREE.OctahedronGeometry(s, 0).scale(1, 1.4, 1).rotateY(x * 3).translate(x, y, z)), m === 0 ? 0xff4fb8 : 0x5ad8ff, S_GEM);
  }

  // Door leaf (moves as one part): dark steel with bright brass bands, rivets, a wheel and a plain
  // dark panel where the (strong-eye) buttons sit.
  const door: THREE.BufferGeometry[] = [];
  const dadd = (geo: THREE.BufferGeometry, color: number, s: typeof S_STONE): void => void door.push(surface(geo, color, s));
  dadd(new RoundedBoxGeometry(V.doorW, V.doorH, V.doorT, 3, 0.06).translate(0, V.doorH / 2, -V.doorT / 2 - 0.02), 0x3e4752, S_STEEL);
  for (const y of [0.35, V.doorH - 0.35]) dadd(new THREE.BoxGeometry(V.doorW - 0.1, 0.16, 0.06).translate(0, y, 0.0), 0xe8b84a, S_BRASS);
  for (const x of [-V.doorW / 2 + 0.3, V.doorW / 2 - 0.3]) dadd(new THREE.BoxGeometry(0.16, V.doorH - 0.6, 0.06).translate(x, V.doorH / 2, 0), 0xe8b84a, S_BRASS);
  for (let i = 0; i < 11; i++) {
    for (const y of [0.35, V.doorH - 0.35]) dadd(new THREE.SphereGeometry(0.05, 6, 4).translate(-V.doorW / 2 + 0.3 + (i * (V.doorW - 0.6)) / 10, y, 0.05), 0xe8b84a, S_BRASS);
  }
  dadd(new THREE.TorusGeometry(0.42, 0.06, 8, 32).translate(0, 1.15, 0.08), 0xe8b84a, S_BRASS);
  for (let i = 0; i < 3; i++) dadd(new THREE.BoxGeometry(0.9, 0.06, 0.06).rotateZ((i * Math.PI) / 3).translate(0, 1.15, 0.08), 0xe8b84a, S_BRASS);
  dadd(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12).rotateX(Math.PI / 2).translate(0, 1.15, 0.1), 0xe8b84a, S_BRASS);
  // Three round dark windows: the weak eye sees the sequence in them; the strong eye sees empty glass.
  for (let i = 0; i < 3; i++) {
    const sx = (i - 1) * V.screenX;
    dadd(new THREE.CylinderGeometry(V.screenR, V.screenR, 0.06, 32).rotateX(Math.PI / 2).translate(sx, V.screenY, 0.02), 0x111316, { rough: 0.2, metal: 0.3 });
    // Pips under each window (1, 2, 3): the order, without numbers.
    for (let p = 0; p <= i; p++) dadd(new THREE.SphereGeometry(0.07, 10, 6).translate(sx + (p - i / 2) * 0.22, V.screenY - V.screenR - 0.2, 0.06), 0xf4ecd8, S_CREAM);
  }

  // Floor pads (both eyes): a dark ring base each; the caps are moving parts below.
  for (const pd of pads) {
    add(new THREE.CylinderGeometry(V.padBaseR, V.padBaseR + 0.06, 0.1, 32).translate(pd.x, pd.y + 0.03, pd.z), 0x23262b, { rough: 0.7, metal: 0.2 });
    add(new THREE.TorusGeometry(V.padBaseR - 0.04, 0.045, 6, 32).rotateX(Math.PI / 2).translate(pd.x, pd.y + 0.09, pd.z), 0xe8b84a, S_BRASS);
  }

  // Rule-demo board: a dark frame on two posts (its picture is a separate canvas mesh).
  if (board) {
    const fr: THREE.BufferGeometry[] = [];
    const cy = board.y + BOARD.bottom + BOARD.h / 2;
    for (const s of [-1, 1]) fr.push(new THREE.CylinderGeometry(0.06, 0.07, BOARD.bottom + BOARD.h + 0.15, 8).translate(s * (BOARD.w / 2 - 0.12), board.y + (BOARD.bottom + BOARD.h + 0.15) / 2 - 0.05, -0.08));
    fr.push(new RoundedBoxGeometry(BOARD.w + 0.16, BOARD.h + 0.16, 0.08, 2, 0.04).translate(0, cy, -0.06));
    const frame = merge(fr);
    for (const f of fr) f.dispose();
    frame.rotateY(board.yaw).translate(board.x, 0, board.z);
    add(frame, 0x1d1b19, { rough: 0.7, metal: 0.1 });
  }

  // Parts: 0 fixed, 1 treasure star, 2.. pad caps, then dwell discs. The door leaf and its three
  // window rings are their own small mesh (`secret-vault-door`, a child of the vault): it slides
  // down into the floor by its transform, so the opening is one matrix, never a skipped upload.
  const lamps = [0, 1, 2].map((i) => surface(new THREE.TorusGeometry(V.screenR + 0.06, 0.075, 8, 36).translate((i - 1) * V.screenX, V.screenY, 0.06), LAMP_OFF.color.getHex(), LAMP_OFF.surf));
  const star = surface(
    new THREE.ExtrudeGeometry(shapeOutline('star', 0.42), { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }).translate(0, 0, -0.07),
    0xffc928,
    S_TREASURE,
  );
  const caps = pads.map((pd) =>
    surface(
      merge([
        new THREE.CylinderGeometry(V.padBaseR - 0.16, V.padBaseR - 0.1, V.padCapH, 32).translate(0, V.padCapH / 2, 0),
        new THREE.TorusGeometry(V.padBaseR - 0.16, 0.035, 6, 32).rotateX(Math.PI / 2).translate(0, V.padCapH, 0),
      ]).translate(pd.x, pd.y + 0.02, pd.z),
      PAD_LOOK.idle.color.getHex(),
      PAD_LOOK.idle.surf,
    ),
  );
  // Dwell discs (one per pad, posed on its cap): a dark disc grows from the middle while a step is
  // being counted. Dark on the cream cap: reads by brightness in both eyes.
  const discs = pads.map(() => surface(new THREE.CylinderGeometry(1, 1, 0.02, 32), 0x1c2340, { rough: 0.8, metal: 0 }));
  const all = [merge(fixed), star, ...caps, ...discs];
  const batch = new PartBatch(all);
  const doorParts = [merge(door), ...lamps];
  const doorBatch = new PartBatch(doorParts);
  for (const g of [...fixed, ...door, ...all, ...doorParts]) g.dispose();
  const mesh = new THREE.Mesh(batch.geometry, material);
  mesh.name = 'secret-vault';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const doorMesh = new THREE.Mesh(doorBatch.geometry, material);
  doorMesh.name = 'secret-vault-door';
  doorMesh.castShadow = true;
  doorMesh.receiveShadow = true;
  mesh.add(doorMesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const UPV = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const padAt = pads.map((pd) => new THREE.Vector3(pd.x, pd.y, pd.z));
  const padLook: PadLook[] = pads.map(() => 'idle');
  const CAP0 = 2;
  const model: VaultModel = {
    mesh,
    door: doorMesh,
    batch,
    setDoor(x, y) {
      doorMesh.position.set(x, y, 0);
      // Below the floor it is gone for good: skip drawing it.
      doorMesh.visible = y > -V.doorH;
    },
    setLamp(i, on) {
      const l = on ? LAMP_ON : LAMP_OFF;
      doorBatch.setColor(1 + i, l.color);
      doorBatch.setSurface(1 + i, l.surf);
    },
    setStar(spin, y, scale) {
      batch.setMatrix(1, m.compose(p.set(0, y, TREASURE_Z), q.setFromAxisAngle(UPV, spin), sc.setScalar(scale)));
    },
    setStarAt(x, y, z, spin, scale) {
      batch.setMatrix(1, m.compose(p.set(x, y, z), q.setFromAxisAngle(UPV, spin), sc.setScalar(scale)));
    },
    setPad(i, push, shake, look, fill = 0) {
      const c = padAt[i];
      if (!c) return;
      batch.setMatrix(CAP0 + i, m.makeTranslation(shake, -push, 0));
      const r = fill > 0 ? (V.padBaseR - 0.2) * Math.min(1, 0.15 + 0.85 * fill) : 0;
      batch.setMatrix(CAP0 + pads.length + i, m.compose(p.set(c.x + shake, c.y + 0.02 + V.padCapH + 0.012 - push, c.z), q.identity(), sc.set(r, 1, r)));
      if (padLook[i] !== look) {
        padLook[i] = look;
        batch.setColor(CAP0 + i, PAD_LOOK[look].color);
        batch.setSurface(CAP0 + i, PAD_LOOK[look].surf);
      }
    },
    commit: () => {
      batch.commit();
      doorBatch.commit();
    },
    dispose: () => {
      batch.dispose();
      doorBatch.dispose();
    },
  };
  model.setStar(0, STAR_Y, 1);
  for (let i = 0; i < pads.length; i++) model.setPad(i, 0, 0, 'idle', 0);
  model.commit();
  return model;
}

/** Rest height of the treasure star above the chamber floor. */
export const TREASURE_STAR_Y = STAR_Y;

// ───────────────────────────── vault layer parts ─────────────────────────────

export interface SignModel {
  /** Door-local root (two meshes: shapes and their glow); add it under the vault's WeakOnly group. */
  root: THREE.Group;
  /** Pose step `i` (0..2): scale about its centre and a little roll (wobble). */
  setStep(i: number, scale: number, roll: number): void;
  commit(): void;
  dispose(): void;
}

/** The weak-eye sequence: three big shapes in the door's three windows, with little arrows between. */
export function buildSign(sequence: readonly ShapeKind[]): SignModel {
  const root = new THREE.Group();
  root.name = 'vault-sign';
  const solid = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const glowMat = createGlowMaterial({ level: 1, coreOpacity: 0.12, rimPower: 2.2, pulse: 0.25 });
  const stepX = (i: number): number => (i - 1) * VAULT.screenX;
  const solids: THREE.BufferGeometry[] = [];
  const glows: THREE.BufferGeometry[] = [];
  sequence.forEach((kind, i) => {
    // The 1, 2, 3 pips are on the door itself (both eyes); the shape sits in its window.
    const step = shadeGrey(shapeSolid(kind, 0.4, 0.14), 1, 0.62, facet);
    solids.push(step.translate(stepX(i), 0, 0));
    const glow = new THREE.SphereGeometry(0.62, 20, 12).scale(1, 1, 0.35).toNonIndexed();
    glow.deleteAttribute('uv');
    glows.push(glow.translate(stepX(i), 0, 0));
  });
  // Little arrows between the shapes (part 3 of the solid batch, never moves).
  const chev: THREE.BufferGeometry[] = [];
  for (const x of [-VAULT.screenX / 2, VAULT.screenX / 2]) {
    for (const s of [-1, 1]) chev.push(new THREE.BoxGeometry(0.22, 0.06, 0.06).rotateZ(-s * 0.7).translate(x, s * 0.07, 0));
  }
  solids.push(shadeGrey(merge(chev), 0.9, 0.6));
  for (const c of chev) c.dispose();
  const solidBatch = new PartBatch(solids);
  const glowBatch = new PartBatch(glows);
  for (const g of [...solids, ...glows]) g.dispose();
  // Steps grow up to ~1.3×.
  for (const b of [solidBatch, glowBatch]) if (b.geometry.boundingSphere) b.geometry.boundingSphere.radius *= 1.35;
  const glowMesh = new THREE.Mesh(glowBatch.geometry, glowMat);
  glowMesh.renderOrder = 1;
  root.add(new THREE.Mesh(solidBatch.geometry, solid), glowMesh);
  const m = new THREE.Matrix4();
  const r = new THREE.Matrix4();
  return {
    root,
    setStep(i, scale, roll) {
      const x = stepX(i);
      // Translate to the step centre, roll and scale there, translate back.
      m.makeTranslation(x, 0, 0).multiply(r.makeRotationZ(roll)).multiply(r.makeScale(scale, scale, scale)).multiply(r.makeTranslation(-x, 0, 0));
      solidBatch.setMatrix(i, m);
      glowBatch.setMatrix(i, m);
    },
    commit() {
      solidBatch.commit();
      glowBatch.commit();
    },
    dispose() {
      solidBatch.dispose();
      glowBatch.dispose();
      solid.dispose();
      glowMat.dispose();
    },
  };
}

export interface ButtonsModel {
  /** Door-local root of the one mesh: the shapes over the floor pads (strong eye). */
  root: THREE.Group;
  /**
   * Pose pad `i`'s shape: push-in depth (it rides down with the pad), extra scale (0 hides it) and a
   * little sideways shake.
   */
  setButton(i: number, push: number, scale: number, shake: number, turn?: number): void;
  commit(): void;
  dispose(): void;
}

/**
 * Strong-eye shapes for the floor pads: a big shape standing over each pad (tilted back toward the
 * player walking up) and a matching flat shape on the pad's cap, all in one mesh. `angles` turn each
 * one to face straight out from the door centre.
 */
export function buildButtons(pads: readonly { x: number; y: number; z: number }[], angles: readonly number[], shapes: readonly ShapeKind[], capH: number): ButtonsModel {
  const solid = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const root = new THREE.Group();
  root.name = 'vault-buttons';
  // On a layer only coverage and brightness show: a bright rim ring with the shape floating inside
  // reads best (a filled plate would hide the shape).
  const parts: THREE.BufferGeometry[] = [];
  const centres: THREE.Vector3[] = [];
  pads.forEach((pd, i) => {
    const rim = shadeGrey(new THREE.TorusGeometry(0.4, 0.05, 6, 32), 0.95, 0.6);
    const sym = shadeGrey(shapeSolid(shapes[i], 0.27, 0.08).translate(0, 0, 0.04), 1, 0.65, facet);
    const standY = capH + 0.78;
    const stand = merge([rim, sym]).rotateX(-0.45).translate(0, standY, 0);
    const flat = shadeGrey(shapeSolid(shapes[i], 0.3, 0.03).rotateX(-Math.PI / 2).translate(0, capH + 0.04, 0), 1, 0.8);
    const g = merge([stand, flat]).rotateY(angles[i] ?? 0).translate(pd.x, pd.y + 0.02, pd.z);
    parts.push(g);
    centres.push(new THREE.Vector3(pd.x, pd.y + 0.02 + capH, pd.z));
  });
  const batch = new PartBatch(parts);
  for (const g of parts) g.dispose();
  if (batch.geometry.boundingSphere) batch.geometry.boundingSphere.radius += 0.5;
  root.add(new THREE.Mesh(batch.geometry, solid));
  const m = new THREE.Matrix4();
  const r = new THREE.Matrix4();
  return {
    root,
    setButton(i, push, scale, shake, turn = 0) {
      const c = centres[i];
      // Turn about the pad's vertical axis (`turn` is relative to the shape's built-in facing).
      m.makeTranslation(c.x + shake, c.y - push, c.z).multiply(r.makeRotationY(turn)).multiply(r.makeScale(scale, scale, scale)).multiply(r.makeTranslation(-c.x, -c.y, -c.z));
      batch.setMatrix(i, m);
    },
    commit: () => batch.commit(),
    dispose() {
      batch.dispose();
      solid.dispose();
    },
  };
}
