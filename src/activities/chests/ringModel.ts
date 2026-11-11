/**
 * Both-eye parts of the symbol lock, drawn in the MAIN scene, plus the weak-eye arrow trail.
 *
 *  - Floor buttons: ONE InstancedMesh for every cushion and one per symbol for the raised symbols
 *    (4 draws for all chests, none cast shadows). Cream cushion, dark navy rim and symbol: they read
 *    by brightness in the R-only and G-only channels. All cushions look the same apart from their
 *    own symbol, so nothing here gives the answer away.
 *  - A "?" badge (both-eye) that bobs over a chest while its key is still missing.
 *  - The arrow trail (WeakOnly): chevrons on the ground from the chest toward the key, pulsing in
 *    sequence. Not in the main scene, so the strong eye never sees it.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { merge, paint, shadeGrey } from './bake';
import { RING } from './logic';
import { extrudeShape, symbolShape, SYMBOLS } from './lockModel';

const CUSHION_H = 0.16;
const CREAM = 0xfff1c9;
const NAVY = 0x1a1650;
const SYMBOL_COLOR = 0x1c2a78;
const LIGHT = new THREE.Vector3(0.4, 0.8, 0.45).normalize();

function cushionGeometry(): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(RING.size, CUSHION_H, RING.size, 1, 0.1);
  const cream = new THREE.Color(CREAM);
  const navy = new THREE.Color(NAVY);
  return paint(g, (x, y, z, _nx, ny) => {
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const rim = ny < 0.85 || edge > RING.size / 2 - 0.02;
    const c = rim ? navy : cream;
    const s = ny > 0.7 ? 1 : 0.8 + 0.2 * (y / CUSHION_H + 0.5);
    return new THREE.Color(c.r * s, c.g * s, c.b * s);
  });
}

function symbolGeometry(symbol: number): THREE.BufferGeometry {
  const g = extrudeShape(symbolShape(SYMBOLS[symbol], 0.4), 0.1, 0.03);
  g.rotateX(-Math.PI / 2); // lie flat, front facing up
  g.translate(0, CUSHION_H / 2 + 0.05, 0);
  const col = new THREE.Color(SYMBOL_COLOR);
  return paint(g, (_x, _y, _z, nx, ny, nz) => {
    const d = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
    const s = 0.8 + 0.7 * d;
    return new THREE.Color(col.r * s, col.g * s, col.b * s);
  });
}

export interface ButtonPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Vertical squash 0..1 (1 = flat). */
  squash: number;
  /** Brightness multiplier. */
  tint: number;
}

export interface ButtonSet {
  readonly meshes: THREE.InstancedMesh[];
  /** Place button `slot` (chest * count + k). */
  set(slot: number, symbol: number, pose: ButtonPose): void;
  flush(): void;
  dispose(): void;
}

/** Instanced buttons for `slots` buttons in total; `symbols[slot]` fixes each slot's symbol. */
export function buildButtons(symbols: readonly number[]): ButtonSet {
  const baseGeo = cushionGeometry();
  const symGeos = [0, 1, 2].map(symbolGeometry);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
  const base = new THREE.InstancedMesh(baseGeo, mat, symbols.length);
  const perSymbol = [0, 1, 2].map((k) => symbols.reduce((n, s) => n + (s === k ? 1 : 0), 0));
  const syms = symGeos.map((g, k) => new THREE.InstancedMesh(g, mat, Math.max(1, perSymbol[k])));
  const meshes = [base, ...syms];
  // Instances spread over the whole island: skip culling (4 draws in total).
  for (const m of meshes) {
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = true;
    m.name = 'chest-buttons';
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  const symIndex = new Map<number, number>(); // slot -> instance index within its symbol mesh
  const counters = [0, 0, 0];
  symbols.forEach((s, slot) => symIndex.set(slot, counters[s]++));
  for (const m of syms) m.count = Math.max(0, perSymbol[syms.indexOf(m)]);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const UPV = new THREE.Vector3(0, 1, 0);
  return {
    meshes,
    set(slot, symbol, p) {
      q.setFromAxisAngle(UPV, p.yaw);
      pos.set(p.x, p.y + CUSHION_H / 2, p.z);
      sc.set(1, p.squash, 1);
      m4.compose(pos, q, sc);
      base.setMatrixAt(slot, m4);
      syms[symbol].setMatrixAt(symIndex.get(slot) ?? 0, m4);
      col.setRGB(p.tint, p.tint, p.tint);
      base.setColorAt(slot, col);
      syms[symbol].setColorAt(symIndex.get(slot) ?? 0, col);
    },
    flush() {
      for (const m of meshes) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      baseGeo.dispose();
      for (const g of symGeos) g.dispose();
      mat.dispose();
      for (const m of meshes) m.dispose();
    },
  };
}

// ───────────────────────────── "?" badge ─────────────────────────────

export interface Badge {
  group: THREE.Group;
  dispose(): void;
}

/** A both-eye question-mark sign: bright "?" on a dark disc (reads in either channel alone). */
export function buildBadge(): Badge {
  const parts: THREE.BufferGeometry[] = [];
  const disc = new THREE.CylinderGeometry(0.24, 0.24, 0.04, 20).rotateX(Math.PI / 2).translate(0, 0, -0.03);
  parts.push(paint(disc, new THREE.Color(NAVY)));
  const hook = new THREE.TorusGeometry(0.085, 0.03, 6, 14, Math.PI * 1.45).rotateZ(-Math.PI * 0.2).translate(0, 0.07, 0);
  parts.push(paint(hook, new THREE.Color(0xfffbe0)));
  parts.push(paint(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 8).translate(0.0, -0.045, 0), new THREE.Color(0xfffbe0)));
  parts.push(paint(new THREE.SphereGeometry(0.036, 8, 6).translate(0, -0.15, 0), new THREE.Color(0xfffbe0)));
  const geo = merge(parts);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.name = 'chest-badge';
  group.add(mesh);
  group.scale.setScalar(1.4);
  group.visible = false;
  return {
    group,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

// ───────────────────────────── Weak-eye arrow trail ─────────────────────────────

/**
 * Switch for the chest -> key arrow trail. `src/activities/secrets/` may later provide its own
 * arrows to keys; set `chestTrail.enabled = false` (or call `setChestTrailEnabled(false)`) to turn
 * this one off.
 */
export const chestTrail = { enabled: true };

export function setChestTrailEnabled(on: boolean): void {
  chestTrail.enabled = on;
}

function chevronGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // Chevron pointing +Y, 0.9 wide, 0.5 long.
  s.moveTo(0, 0.28);
  s.lineTo(0.45, -0.08);
  s.lineTo(0.45, -0.28);
  s.lineTo(0, 0.08);
  s.lineTo(-0.45, -0.28);
  s.lineTo(-0.45, -0.08);
  s.closePath();
  const g = extrudeShape(s, 0.04, 0.012);
  g.rotateX(-Math.PI / 2); // flat on the ground, pointing -Z
  return shadeGrey(g, 1, 0.65);
}

export interface Trail {
  mesh: THREE.InstancedMesh;
  /** Lay chevrons from (sx,sz) toward (ex,ez); `ground` gives terrain height. */
  layOut(sx: number, sz: number, ex: number, ez: number, ground: (x: number, z: number) => number): void;
  update(t: number): void;
  dispose(): void;
}

export const TRAIL_COUNT = 6;

export function buildTrail(): Trail {
  const geo = chevronGeometry();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, mat, TRAIL_COUNT);
  mesh.name = 'chest-trail';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const base: { p: THREE.Vector3; yaw: number; size: number }[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const UPV = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < TRAIL_COUNT; i++) mesh.setColorAt(i, col.setRGB(1, 1, 1));
  return {
    mesh,
    layOut(sx, sz, ex, ez, ground) {
      base.length = 0;
      const dx = ex - sx;
      const dz = ez - sz;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      const yaw = Math.atan2(-ux, -uz);
      const size = Math.min(1.3, Math.max(0.75, (len / (TRAIL_COUNT - 1)) * 1.1));
      for (let i = 0; i < TRAIL_COUNT; i++) {
        const t = i / (TRAIL_COUNT - 1);
        const x = sx + dx * t;
        const z = sz + dz * t;
        base.push({ p: new THREE.Vector3(x, ground(x, z) + 0.15, z), yaw, size });
      }
    },
    update(t) {
      for (let i = 0; i < base.length; i++) {
        const b = base[i];
        const w = Math.max(0, Math.sin(t * 3.2 - i * 0.9));
        const pulse = w * w;
        q.setFromAxisAngle(UPV, b.yaw);
        const k = b.size * (0.85 + 0.3 * pulse);
        sc.set(k, 1 + pulse * 0.5, k);
        m4.compose(b.p, q, sc);
        mesh.setMatrixAt(i, m4);
        const v = 0.45 + 0.55 * pulse;
        mesh.setColorAt(i, col.setRGB(v, v, v));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}
