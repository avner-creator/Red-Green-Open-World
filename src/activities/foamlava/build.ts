/**
 * Foam Lava visuals. Everything static is merged into one vertex-finished mesh (1 draw); the
 * moving parts are instanced (floats, blocks+planks, bubbles, blowers, puffs, splash, flags), the
 * foam is one shader mesh. Weak-eye tiles and stones live on the vision WeakOnly layer.
 * All geometry is authored in the course frame (see layout.ts) under `root`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { finish, finishMaterial, mergeFinished, placed, rodBetween } from '../../core/vertex-finish';
import { asShadowProxy } from '../../core/shadow-proxy';
import { createLayerMaterial } from '../../vision';
import { BOOTH, CANNON, CANNONS, CHUTE, FOAM_Y, PIT, ROPE, SOLIDS } from './layout';
import type { SolidDef } from './layout';
import { cannonState } from './sim';
import type { CourseSim } from './sim';
import { MAX_RIPPLES, createFoamMaterial } from './foamMaterial';
import type { FoamUniforms } from './foamMaterial';
import { MEDALS, TICKET } from './scoring';

// Palette: every colour is clearly darker or lighter than the pink-white foam in BOTH the R and
// the G channel (no mid-tone reds or greens doing the work alone).
const C = {
  woodTop: 0x8f5d33,
  woodSide: 0x5c3920,
  post: 0x3b2a1e,
  trim: 0xf4f1e8,
  navy: 0x1b2554,
  purple: 0x55278a,
  yellow: 0xffd23f,
  blue: 0x2453c4,
  binGreen: 0x23683a,
  binLid: 0x184a28,
  grey: 0x3a3f4b,
  white: 0xffffff,
  black: 0x111318,
} as const;

const F = (color: number, rough = 0.8, metal = 0): { color: number; rough: number; metal: number } => ({ color, rough, metal });

export interface CourseVisuals {
  root: THREE.Group;
  weakRoot: THREE.Group;
  /** Rope pivot group (rotation.z = swing angle). */
  update(sim: CourseSim, dt: number, near: boolean): void;
  splash(x: number, z: number, strength?: number): void;
  /** Little foam kick-up (landing on a float, wading). */
  spray(x: number, y: number, z: number, n?: number): void;
  setCheckpoint(cp: number, running: boolean): void;
  /** Bubble machine overdrive (finish). */
  celebrate(): void;
  dispose(): void;
}

function solid(id: string): SolidDef {
  const s = SOLIDS.find((d) => d.id === id);
  if (!s) throw new Error(`foamlava: no solid ${id}`);
  return s;
}

/** Wooden deck: plank top with white edge trim, posts down into the ground, skirt on low decks. */
function deckParts(s: SolidDef, parts: THREE.BufferGeometry[], legs = true): void {
  const hx = s.hx ?? 1;
  const hz = s.hz ?? 1;
  const top = s.top;
  parts.push(finish(placed(new THREE.BoxGeometry(hx * 2, 0.16, hz * 2), s.x, top - 0.08, s.z), F(C.woodTop, 0.85)));
  // Plank grooves (thin dark strips across the top).
  const n = Math.max(2, Math.round((hz * 2) / 0.45));
  for (let i = 1; i < n; i++) {
    const z = s.z - hz + (i * hz * 2) / n;
    parts.push(finish(placed(new THREE.BoxGeometry(hx * 2 - 0.1, 0.02, 0.035), s.x, top + 0.005, z), F(C.woodSide, 0.9)));
  }
  // White trim on the top edges (reads in both channels against wood and foam).
  const t = 0.09;
  parts.push(finish(placed(new THREE.BoxGeometry(hx * 2 + 0.04, 0.06, t), s.x, top + 0.01, s.z - hz), F(C.trim, 0.6)));
  parts.push(finish(placed(new THREE.BoxGeometry(hx * 2 + 0.04, 0.06, t), s.x, top + 0.01, s.z + hz), F(C.trim, 0.6)));
  parts.push(finish(placed(new THREE.BoxGeometry(t, 0.06, hz * 2), s.x - hx, top + 0.01, s.z), F(C.trim, 0.6)));
  parts.push(finish(placed(new THREE.BoxGeometry(t, 0.06, hz * 2), s.x + hx, top + 0.01, s.z), F(C.trim, 0.6)));
  if (top <= 1.1 && !legs) {
    parts.push(finish(placed(new THREE.BoxGeometry(hx * 2 - 0.06, top + 0.6, hz * 2 - 0.06), s.x, (top - 0.16 - 0.6) / 2 + 0.0, s.z), F(C.woodSide, 0.9)));
    return;
  }
  const ph = top + 0.7;
  const px = [s.x - hx + 0.12, s.x + hx - 0.12];
  const nz = Math.max(2, Math.ceil((hz * 2) / 2.2) + 1);
  for (const x of px) {
    for (let i = 0; i < nz; i++) {
      const z = s.z - hz + 0.12 + (i * (hz * 2 - 0.24)) / (nz - 1);
      parts.push(finish(placed(new THREE.BoxGeometry(0.16, ph, 0.16), x, top - 0.16 - ph / 2, z), F(C.post, 0.9)));
    }
  }
  // Cross braces on the long sides.
  if (top > 1.5) {
    for (const x of px) {
      const a = new THREE.Vector3(x, 0.2, s.z - hz + 0.15);
      const b = new THREE.Vector3(x, top - 0.3, s.z + hz - 0.15);
      parts.push(finish(rodBetween(a, b, 0.05, 6), F(C.post, 0.9)));
    }
  }
}

/** Upside-down wheelie bin: wide rim at the bottom, lid on top, ribs. */
function binParts(s: SolidDef, parts: THREE.BufferGeometry[]): void {
  const r = s.r ?? 0.7;
  const h = s.top + 0.6;
  parts.push(finish(placed(new THREE.CylinderGeometry(r * 0.92, r, h, 16), s.x, s.top - h / 2 - 0.06, s.z), F(C.binGreen, 0.55)));
  parts.push(finish(placed(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.12, 16), s.x, s.top - 0.06, s.z), F(C.binLid, 0.5)));
  parts.push(finish(placed(new THREE.TorusGeometry(r * 0.96, 0.05, 6, 20), s.x, s.top - 0.12, s.z, Math.PI / 2), F(C.trim, 0.5)));
  parts.push(finish(placed(new THREE.TorusGeometry(r * 1.0, 0.06, 6, 20), s.x, FOAM_Y + 0.08, s.z, Math.PI / 2), F(C.yellow, 0.5)));
}

/** Pit wall + striped inflatable tube along a straight edge. */
function rimRun(a: THREE.Vector2, b: THREE.Vector2, parts: THREE.BufferGeometry[]): void {
  const len = a.distanceTo(b);
  const n = Math.max(1, Math.round(len / 1.1));
  for (let i = 0; i < n; i++) {
    const p0 = new THREE.Vector3(a.x + ((b.x - a.x) * i) / n, FOAM_Y + 0.05, a.y + ((b.y - a.y) * i) / n);
    const p1 = new THREE.Vector3(a.x + ((b.x - a.x) * (i + 1)) / n, FOAM_Y + 0.05, a.y + ((b.y - a.y) * (i + 1)) / n);
    parts.push(finish(rodBetween(p0, p1, 0.3, 10), F(i % 2 ? C.purple : C.yellow, 0.45)));
  }
  // Wall below the tube down into the ground.
  const mid = new THREE.Vector3((a.x + b.x) / 2, (FOAM_Y - 0.9) / 2, (a.y + b.y) / 2);
  const wall = new THREE.BoxGeometry(len, FOAM_Y + 0.9, 0.12);
  wall.rotateY(-Math.atan2(b.y - a.y, b.x - a.x));
  parts.push(finish(wall.translate(mid.x, mid.y, mid.z), F(C.purple, 0.7)));
}

function signTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#1b2554';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 502, 246);
  // Foam waves along the bottom left (white on navy).
  g.fillStyle = '#ffe4ec';
  g.beginPath();
  g.moveTo(16, 230);
  for (let x = 16; x <= 250; x += 26) g.quadraticCurveTo(x + 13, 196, x + 26, 214);
  g.lineTo(250, 246);
  g.lineTo(16, 246);
  g.fill();
  // Little hero hopping over it (stick runner).
  g.strokeStyle = '#ffd23f';
  g.fillStyle = '#ffd23f';
  g.lineWidth = 12;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(130, 52, 20, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(128, 76);
  g.lineTo(118, 128);
  g.moveTo(118, 128);
  g.lineTo(88, 156);
  g.moveTo(118, 128);
  g.lineTo(152, 150);
  g.moveTo(126, 92);
  g.lineTo(92, 84);
  g.moveTo(126, 92);
  g.lineTo(162, 108);
  g.stroke();
  // Motion arc.
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  g.setLineDash([12, 10]);
  g.beginPath();
  g.arc(130, 190, 96, Math.PI * 1.08, Math.PI * 1.55);
  g.stroke();
  g.setLineDash([]);
  // Medal rows: circle + stars + seconds.
  const rows: [string, string, number, number][] = [
    ['#ffd23f', '#5a3d00', 3, MEDALS.gold],
    ['#e6e9f0', '#30343c', 2, MEDALS.silver],
    ['#b8733a', '#ffffff', 1, MEDALS.bronze],
  ];
  rows.forEach(([fill, ink, stars, secs], i) => {
    const y = 48 + i * 62;
    g.fillStyle = fill;
    g.strokeStyle = '#000000';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(292, y, 24, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = ink;
    g.font = 'bold 26px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(4 - stars), 292, y + 1);
    g.fillStyle = '#ffffff';
    g.font = 'bold 44px sans-serif';
    g.textAlign = 'left';
    g.fillText(`${secs}s`, 330, y + 2);
    g.fillStyle = '#ffd23f';
    g.font = 'bold 22px sans-serif';
    g.fillText('★'.repeat(stars), 432, y + 2);
  });
  // Ticket price: gem + number (first run free each day is shown by the HUD prompt).
  g.fillStyle = '#ffffff';
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'left';
  g.fillText(`\u{1F48E}${TICKET}`, 392, 232);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Puffy disc for the pool floats, with purple/white segments baked as vertex colours. */
function floatGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const R = 1;
  const t = 0.34;
  pts.push(new THREE.Vector2(0, t / 2));
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 2 - (i / 8) * Math.PI;
    pts.push(new THREE.Vector2(R - t / 2 + Math.cos(a) * (t / 2), Math.sin(a) * (t / 2)));
  }
  pts.push(new THREE.Vector2(0, -t / 2));
  const g = new THREE.LatheGeometry(pts, 24).toNonIndexed();
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(C.purple).convertSRGBToLinear();
  const b = new THREE.Color(C.trim).convertSRGBToLinear();
  const cc = new THREE.Color(C.yellow).convertSRGBToLinear();
  for (let i = 0; i < pos.count; i += 3) {
    // Colour per triangle by the angle of its centroid: 8 wedges; a yellow centre cap.
    let x = 0;
    let z = 0;
    for (let k = 0; k < 3; k++) {
      x += pos.getX(i + k) / 3;
      z += pos.getZ(i + k) / 3;
    }
    const rr = Math.hypot(x, z);
    const seg = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 8) % 2;
    const c = rr < 0.32 ? cc : seg ? a : b;
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function buildCourse(scene: THREE.Object3D): CourseVisuals {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };
  const root = new THREE.Group();
  root.name = 'foam-lava';
  const weakRoot = new THREE.Group();
  weakRoot.name = 'foam-lava-weak';

  // ───────────── Static parts: one merged mesh ─────────────
  const parts: THREE.BufferGeometry[] = [];
  for (const id of ['start', 'finish', 'cp1', 'bridgeA', 'bridgeB', 'towerA', 'towerB', 'cp3', 'walk']) deckParts(solid(id), parts, !['start', 'finish', 'cp3'].includes(id));
  for (const id of ['startStep', 'finishStep', 'gapStep']) deckParts(solid(id), parts, id === 'gapStep');
  for (const id of ['bin0', 'bin1', 'bin2', 'bin3']) binParts(solid(id), parts);
  // Balance-block posts (the wobbling caps are instanced).
  for (const id of ['block0', 'block1', 'block2', 'block3']) {
    const s = solid(id);
    parts.push(finish(placed(new THREE.CylinderGeometry(0.16, 0.22, s.top + 0.5, 8), s.x, (s.top - 0.5) / 2 - 0.12, s.z), F(C.grey, 0.6, 0.3)));
  }
  // Plank bridge: posts and rope rails.
  {
    const a = solid('bridgeA');
    const b = solid('bridgeB');
    for (const sx of [-1, 1]) {
      const x = a.x + sx * 1.15;
      const p0 = new THREE.Vector3(x, a.top + 1.0, a.z);
      const p1 = new THREE.Vector3(x, b.top + 1.0, b.z - (b.hz ?? 1) + 0.2);
      parts.push(finish(placed(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), x, a.top + 0.5, a.z), F(C.post)));
      parts.push(finish(placed(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), x, b.top + 0.5, p1.z), F(C.post)));
      // Sagging rope rail (a few straight pieces).
      const n = 6;
      for (let i = 0; i < n; i++) {
        const f0 = i / n;
        const f1 = (i + 1) / n;
        const q0 = p0.clone().lerp(p1, f0);
        const q1 = p0.clone().lerp(p1, f1);
        q0.y -= Math.sin(f0 * Math.PI) * 0.35;
        q1.y -= Math.sin(f1 * Math.PI) * 0.35;
        parts.push(finish(rodBetween(q0, q1, 0.035, 5), F(C.trim, 0.9)));
      }
    }
  }
  // Tower corner poles with bunting (landmarks from the plaza, never in the camera's way).
  for (const id of ['towerA', 'towerB']) {
    const s = solid(id);
    const hx = (s.hx ?? 1) - 0.12;
    const hz = (s.hz ?? 1) - 0.12;
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [dx, dz] of corners) {
      parts.push(finish(placed(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), s.x + dx * hx, s.top + 1.6, s.z + dz * hz), F(C.trim, 0.6)));
      parts.push(finish(placed(new THREE.SphereGeometry(0.16, 10, 8), s.x + dx * hx, s.top + 3.25, s.z + dz * hz), F(C.yellow, 0.5)));
    }
    // Pennant strings along the two long sides (sagging, alternating colours).
    for (const dx of [-1, 1]) {
      const a = new THREE.Vector3(s.x + dx * hx, s.top + 3.1, s.z - hz);
      const b = new THREE.Vector3(s.x + dx * hx, s.top + 3.1, s.z + hz);
      const n = 8;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const p0 = a.clone().lerp(b, f);
        p0.y -= Math.sin(f * Math.PI) * 0.45;
        const tri = new THREE.BufferGeometry();
        tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.17, 0, 0, 0.17, 0, -0.42, 0]), 3));
        tri.computeVertexNormals();
        parts.push(finish(tri.translate(p0.x, p0.y, p0.z), F(i % 2 ? C.purple : C.yellow, 0.7)));
        const back = new THREE.BufferGeometry();
        back.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.17, 0, 0, -0.17, 0, -0.42, 0]), 3));
        back.computeVertexNormals();
        parts.push(finish(back.translate(p0.x, p0.y, p0.z), F(i % 2 ? C.purple : C.yellow, 0.7)));
      }
      for (let i = 0; i < n; i++) {
        const q0 = a.clone().lerp(b, i / n);
        const q1 = a.clone().lerp(b, (i + 1) / n);
        q0.y -= Math.sin((i / n) * Math.PI) * 0.45;
        q1.y -= Math.sin(((i + 1) / n) * Math.PI) * 0.45;
        parts.push(finish(rodBetween(q0, q1, 0.018, 4), F(C.trim, 0.9)));
      }
    }
  }
  // Rope swing frame: two tall posts and a beam above the gap.
  parts.push(finish(placed(new THREE.CylinderGeometry(0.14, 0.18, ROPE.y + 0.9, 10), ROPE.x, (ROPE.y + 0.9) / 2 - 0.5, ROPE.z - 2.5), F(C.navy, 0.6)));
  parts.push(finish(placed(new THREE.CylinderGeometry(0.14, 0.18, ROPE.y + 0.9, 10), ROPE.x, (ROPE.y + 0.9) / 2 - 0.5, ROPE.z + 2.5), F(C.navy, 0.6)));
  parts.push(finish(rodBetween(new THREE.Vector3(ROPE.x, ROPE.y + 0.25, ROPE.z - 2.7), new THREE.Vector3(ROPE.x, ROPE.y + 0.25, ROPE.z + 2.7), 0.16, 10), F(C.yellow, 0.5)));
  // Slip-and-slide chute: blue tarp slab, white bumpers, supports.
  {
    const len = CHUTE.z1 - CHUTE.z0;
    const ang = Math.atan2(CHUTE.high - CHUTE.low, len);
    const cz = (CHUTE.z0 + CHUTE.z1) / 2;
    const cy = (CHUTE.high + CHUTE.low) / 2;
    const slab = new THREE.BoxGeometry(CHUTE.hx * 2, 0.12, Math.hypot(len, CHUTE.high - CHUTE.low));
    slab.rotateX(-ang).translate(CHUTE.x, cy - 0.06, cz);
    parts.push(finish(slab, F(C.blue, 0.25)));
    // Wet sheen stripes down the middle.
    for (const dx of [-0.45, 0, 0.45]) {
      const st = new THREE.BoxGeometry(0.1, 0.02, Math.hypot(len, CHUTE.high - CHUTE.low));
      st.rotateX(-ang).translate(CHUTE.x + dx, cy + 0.005, cz);
      parts.push(finish(st, F(0x8fb4ff, 0.15)));
    }
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(CHUTE.x + sx * (CHUTE.hx + 0.05), CHUTE.low + 0.12, CHUTE.z0);
      const b = new THREE.Vector3(CHUTE.x + sx * (CHUTE.hx + 0.05), CHUTE.high + 0.12, CHUTE.z1);
      parts.push(finish(rodBetween(a, b, 0.17, 10), F(C.trim, 0.5)));
      for (let i = 0; i <= 3; i++) {
        const z = CHUTE.z0 + 0.6 + (i * (len - 1.2)) / 3;
        const h = CHUTE.low + ((z - CHUTE.z0) / len) * (CHUTE.high - CHUTE.low);
        parts.push(finish(placed(new THREE.BoxGeometry(0.14, h + 0.6, 0.14), CHUTE.x + sx * (CHUTE.hx - 0.1), (h - 0.6) / 2 - 0.1, z), F(C.post)));
      }
    }
  }
  // Pit rim (not across the front of the decks, so you can step off them).
  const p = PIT;
  rimRun(new THREE.Vector2(p.x0, p.z0), new THREE.Vector2(p.x0, p.z1), parts);
  rimRun(new THREE.Vector2(p.x1, p.z0), new THREE.Vector2(p.x1, p.z1), parts);
  rimRun(new THREE.Vector2(p.x0, p.z1), new THREE.Vector2(p.x1, p.z1), parts);
  rimRun(new THREE.Vector2(-1.2, p.z0), new THREE.Vector2(1.2, p.z0), parts);
  // Lane divider: floating pool noodles.
  for (let i = 0; i < 20; i++) {
    const z0 = 3 + i * 1.7;
    const a = new THREE.Vector3(Math.sin(i * 1.3) * 0.12, FOAM_Y + 0.06, z0);
    const b = new THREE.Vector3(Math.sin(i * 1.3 + 1) * 0.12, FOAM_Y + 0.06, z0 + 1.55);
    parts.push(finish(rodBetween(a, b, 0.12, 8), F([C.yellow, C.navy, C.trim][i % 3], 0.5)));
  }
  // Blower stands (the blowers themselves swell, so they are instanced).
  for (const c of CANNONS) {
    parts.push(finish(placed(new THREE.BoxGeometry(0.9, 1.1, 0.9), c.x - 0.25, 0.25, c.z), F(C.navy, 0.7)));
    parts.push(finish(placed(new THREE.BoxGeometry(0.96, 0.08, 0.96), c.x - 0.25, 0.82, c.z), F(C.yellow, 0.6)));
  }
  // Booth (striped kiosk with a counter) between the start and finish decks.
  {
    const bx = BOOTH.x;
    const bz = BOOTH.z;
    parts.push(finish(placed(new THREE.BoxGeometry(2.0, 1.1, 1.3), bx, 0.45, bz), F(C.navy, 0.7)));
    parts.push(finish(placed(new THREE.BoxGeometry(2.2, 0.1, 1.5), bx, 1.05, bz), F(C.trim, 0.6)));
    for (const [dx, dz] of [[-0.9, -0.55], [0.9, -0.55], [-0.9, 0.55], [0.9, 0.55]]) {
      parts.push(finish(placed(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), bx + dx, 1.9, bz + dz), F(C.trim, 0.6)));
    }
    for (let i = 0; i < 6; i++) {
      parts.push(finish(placed(new THREE.BoxGeometry(2.5 / 6, 0.16, 1.9), bx - 1.25 + (i + 0.5) * (2.5 / 6), 2.75, bz), F(i % 2 ? C.purple : C.yellow, 0.6)));
    }
    // Sign board frame.
    parts.push(finish(placed(new THREE.BoxGeometry(2.5, 1.3, 0.1), bx, 3.6, bz - 0.2), F(C.trim, 0.6)));
  }
  // Start/finish arch spanning both decks: inflatable pillars, beam, chequered banner.
  {
    const z = 1.7;
    for (const x of [-5.75, 5.75]) {
      for (let i = 0; i < 4; i++) {
        parts.push(finish(placed(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12), x, 0.5 + i, z), F(i % 2 ? C.purple : C.yellow, 0.45)));
      }
    }
    parts.push(finish(rodBetween(new THREE.Vector3(-6.1, 4.3, z), new THREE.Vector3(6.1, 4.3, z), 0.45, 14), F(C.yellow, 0.45)));
    const n = 24;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 2; j++) {
        const w = 10.8 / n;
        parts.push(finish(placed(new THREE.BoxGeometry(w, 0.32, 0.06), -5.4 + (i + 0.5) * w, 3.62 - j * 0.32, z), F((i + j) % 2 ? C.black : C.white, 0.7)));
      }
    }
  }
  // Bubble machine beside the finish deck.
  const machine = new THREE.Vector3(-6.7, 0, -0.6);
  parts.push(finish(placed(new THREE.BoxGeometry(1.0, 1.2, 1.0), machine.x, 0.5, machine.z), F(C.blue, 0.4)));
  parts.push(finish(placed(new THREE.BoxGeometry(1.06, 0.12, 1.06), machine.x, 1.12, machine.z), F(C.yellow, 0.5)));
  parts.push(finish(placed(new THREE.TorusGeometry(0.45, 0.07, 8, 20), machine.x + 0.25, 1.75, machine.z, 0, Math.PI / 2), F(C.trim, 0.4)));
  parts.push(finish(placed(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), machine.x, 1.4, machine.z), F(C.grey, 0.5, 0.4)));
  // Checkpoint flag poles.
  const flagSpots = [
    { x: 5.2, y: 2.0, z: 20.8 },
    { x: 5.25, y: 2.3, z: 42.7 },
    { x: -5.25, y: 1.0, z: 26.9 },
  ];
  for (const f of flagSpots) parts.push(finish(placed(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), f.x, f.y + 1.2, f.z), F(C.trim, 0.5)));

  const staticMesh = new THREE.Mesh(keep(mergeFinished(parts)), keep(finishMaterial('rg-foamlava-static', { value: 1 }, { roughness: 1, metalness: 0 })));
  staticMesh.name = 'foam-lava-static';
  staticMesh.receiveShadow = true;
  staticMesh.castShadow = false;
  root.add(staticMesh);

  // Shadow proxy: a few boxes for the decks, towers, booth and arch (layer 7, shadow pass only).
  {
    const sp: THREE.BufferGeometry[] = [];
    for (const id of ['start', 'finish', 'cp1', 'towerA', 'towerB', 'cp3', 'walk', 'bridgeA', 'bridgeB']) {
      const s = solid(id);
      sp.push(placed(new THREE.BoxGeometry((s.hx ?? 1) * 2, 0.3, (s.hz ?? 1) * 2), s.x, s.top - 0.15, s.z));
    }
    sp.push(placed(new THREE.BoxGeometry(2.5, 0.2, 1.9), BOOTH.x, 2.75, BOOTH.z));
    sp.push(placed(new THREE.BoxGeometry(12.2, 1.2, 0.5), 0, 3.9, 1.7));
    const proxy = asShadowProxy(new THREE.Mesh(keep(mergeFinished(sp.map((g) => g.toNonIndexed())))));
    proxy.name = 'foam-lava-shadow';
    root.add(proxy);
  }

  // Sign (canvas texture).
  const tex = signTexture();
  if (tex) {
    keep(tex);
    const sign = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.36, 1.18)), keep(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
    sign.position.set(BOOTH.x, 3.6, BOOTH.z - 0.26);
    sign.rotation.y = Math.PI;
    sign.name = 'foam-lava-sign';
    root.add(sign);
  }

  // ───────────── Foam ─────────────
  const foam = createFoamMaterial();
  keep(foam.material);
  const fw = PIT.x1 - PIT.x0;
  const fl = PIT.z1 - PIT.z0;
  const foamGeo = keep(new THREE.PlaneGeometry(fw, fl, 24, 84).rotateX(-Math.PI / 2).translate((PIT.x0 + PIT.x1) / 2, 0, (PIT.z0 + PIT.z1) / 2));
  const foamMesh = new THREE.Mesh(foamGeo, foam.material);
  foamMesh.position.y = FOAM_Y;
  foamMesh.receiveShadow = true;
  foamMesh.name = 'foam-lava-foam';
  root.add(foamMesh);
  const uniforms: FoamUniforms = foam.uniforms;
  let rippleNext = 0;

  // ───────────── Instanced moving parts ─────────────
  const dummy = new THREE.Object3D();
  const floatIds = SOLIDS.map((s, i) => (s.kind === 'float' ? i : -1)).filter((i) => i >= 0);
  const floatMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 }));
  const floats = new THREE.InstancedMesh(keep(floatGeometry()), floatMat, floatIds.length);
  floats.name = 'foam-lava-floats';
  floats.receiveShadow = true;
  root.add(floats);

  const boxIds = SOLIDS.map((s, i) => (s.kind === 'block' || s.kind === 'plank' ? i : -1)).filter((i) => i >= 0);
  const boxes = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 1, 1)), keep(new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 })), boxIds.length);
  boxes.name = 'foam-lava-wobblers';
  boxes.receiveShadow = true;
  boxIds.forEach((i, k) => boxes.setColorAt(k, new THREE.Color(SOLIDS[i].kind === 'block' ? C.blue : C.woodTop)));
  root.add(boxes);

  const bubbleIds = SOLIDS.map((s, i) => (s.kind === 'bubble' ? i : -1)).filter((i) => i >= 0);
  const bubbleMat = keep(new THREE.MeshStandardMaterial({ color: 0x2f5fd0, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.78, emissive: 0x0b1840 }));
  const bubbles = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1, 22, 14)), bubbleMat, bubbleIds.length);
  bubbles.name = 'foam-lava-bubbles';
  root.add(bubbles);

  // Blowers: a striped barrel with a bell mouth pointing across the walkway (+x).
  const blowerGeo = (() => {
    const g: THREE.BufferGeometry[] = [];
    g.push(finish(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 14).rotateZ(-Math.PI / 2), F(C.yellow, 0.5)));
    g.push(finish(new THREE.CylinderGeometry(0.44, 0.44, 0.18, 14).rotateZ(-Math.PI / 2).translate(-0.1, 0, 0), F(C.navy, 0.5)));
    g.push(finish(new THREE.CylinderGeometry(0.62, 0.42, 0.35, 14, 1, true).rotateZ(-Math.PI / 2).translate(0.6, 0, 0), F(C.trim, 0.5)));
    g.push(finish(new THREE.CircleGeometry(0.4, 14).rotateY(Math.PI / 2).translate(0.46, 0, 0), F(C.black, 0.9)));
    return mergeFinished(g);
  })();
  const blowers = new THREE.InstancedMesh(keep(blowerGeo), keep(finishMaterial('rg-foamlava-blower', { value: 1 }, { roughness: 1, metalness: 0 })), CANNONS.length);
  blowers.name = 'foam-lava-blowers';
  root.add(blowers);

  const PUFFS = 7;
  const puffMat = keep(new THREE.MeshStandardMaterial({ color: 0xfff2f6, roughness: 0.9, transparent: true, opacity: 0.95 }));
  const puffs = new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(1, 1)), puffMat, CANNONS.length * PUFFS);
  puffs.name = 'foam-lava-puffs';
  puffs.frustumCulled = false;
  root.add(puffs);

  // Splash / spray particles (pooled).
  const SPRAY = 48;
  const sprayMat = keep(new THREE.MeshStandardMaterial({ color: 0xffeef3, roughness: 0.8 }));
  const sprayMesh = new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(1, 0)), sprayMat, SPRAY);
  sprayMesh.name = 'foam-lava-spray';
  sprayMesh.frustumCulled = false;
  root.add(sprayMesh);
  const spray = Array.from({ length: SPRAY }, () => ({ age: 9, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.1 }));
  let sprayNext = 0;

  // Machine bubbles drifting over the finish deck.
  const MB = 26;
  const mbMat = keep(new THREE.MeshStandardMaterial({ color: 0xe8f0ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55, emissive: 0x223366 }));
  const mbMesh = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1, 10, 8)), mbMat, MB);
  mbMesh.name = 'foam-lava-machine-bubbles';
  mbMesh.frustumCulled = false;
  root.add(mbMesh);
  const mb = Array.from({ length: MB }, (_, i) => ({ age: (i / MB) * 6, life: 6, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.2, seed: i * 1.37 }));
  let overdrive = 0;

  // Checkpoint flags (pennants): dark until reached, then bright and flapping.
  const flagGeo = keep(new THREE.BufferGeometry());
  flagGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, -0.7, 0, 1.05, -0.35, 0, 0, 0, 0, 1.05, -0.35, 0, 0, -0.7, 0]), 3));
  flagGeo.computeVertexNormals();
  const flags = new THREE.InstancedMesh(flagGeo, keep(new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide })), flagSpots.length);
  flags.name = 'foam-lava-flags';
  root.add(flags);
  let flagCp = 0;
  let flagRunning = false;

  // Rope: pivot group rotated about z; a rope and a knotted handle hanging along −y.
  const ropePivot = new THREE.Group();
  ropePivot.position.set(ROPE.x, ROPE.y, ROPE.z);
  const ropeGeo = (() => {
    const g: THREE.BufferGeometry[] = [];
    g.push(finish(new THREE.CylinderGeometry(0.045, 0.045, ROPE.length, 6).translate(0, -ROPE.length / 2, 0), F(0xe9dcc0, 0.95)));
    g.push(finish(new THREE.SphereGeometry(0.16, 10, 8).translate(0, -ROPE.length + 0.05, 0), F(C.yellow, 0.6)));
    g.push(finish(new THREE.SphereGeometry(0.11, 8, 6).translate(0, -ROPE.length + 0.45, 0), F(C.yellow, 0.6)));
    return mergeFinished(g);
  })();
  const rope = new THREE.Mesh(keep(ropeGeo), keep(finishMaterial('rg-foamlava-rope', { value: 1 }, { roughness: 1, metalness: 0 })));
  rope.name = 'foam-lava-rope';
  ropePivot.add(rope);
  root.add(ropePivot);

  // ───────────── Weak-eye layer: shortcut tiles and safe stones ─────────────
  const tileIds = SOLIDS.map((s, i) => (s.kind === 'tile' ? i : -1)).filter((i) => i >= 0);
  const stoneIds = SOLIDS.map((s, i) => (s.kind === 'stone' ? i : -1)).filter((i) => i >= 0);
  // Tile = slab + a thin raised frame just outside it (one geometry, unit footprint).
  const tileGeo = keep(
    mergeGeometries([
      new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
      new THREE.RingGeometry(0.74, 0.83, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4).translate(0, 0.56, 0).toNonIndexed(),
    ]) ?? new THREE.BoxGeometry(1, 1, 1),
  );
  const tiles = new THREE.InstancedMesh(tileGeo, keep(createLayerMaterial(1)), tileIds.length);
  tiles.name = 'foam-lava-tiles';
  tileIds.forEach((i, k) => {
    const s = SOLIDS[i];
    dummy.position.set(s.x, s.top - 0.09, s.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set((s.hx ?? 0.4) * 2, 0.18, (s.hz ?? 0.4) * 2);
    dummy.updateMatrix();
    tiles.setMatrixAt(k, dummy.matrix);
  });
  weakRoot.add(tiles);
  const stones = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(1, 1.08, 1, 16)), keep(createLayerMaterial(0.9)), stoneIds.length);
  stones.name = 'foam-lava-stones';
  stoneIds.forEach((i, k) => {
    const s = SOLIDS[i];
    dummy.position.set(s.x, s.top - 0.11, s.z);
    dummy.scale.set(s.r ?? 0.5, 0.22, s.r ?? 0.5);
    dummy.updateMatrix();
    stones.setMatrixAt(k, dummy.matrix);
  });
  weakRoot.add(stones);
  tiles.computeBoundingSphere();
  stones.computeBoundingSphere();

  scene.add(root);

  // ───────────── Per-frame update ─────────────
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let primed = false;
  function setFlags(cp: number, running: boolean, t: number): void {
    flagSpots.forEach((f, k) => {
      const reached = running && cp >= k + 1;
      const next = running && cp === k;
      dummy.position.set(f.x, f.y + 2.35, f.z);
      const flap = Math.sin(t * (reached ? 9 : 3) + k) * (reached ? 0.35 : 0.12);
      dummy.rotation.set(0, (f.x > 0 ? Math.PI : 0) + flap, 0);
      const s = next ? 1 + 0.18 * Math.sin(t * 6) : 1;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      flags.setMatrixAt(k, dummy.matrix);
      flags.setColorAt(k, new THREE.Color(reached ? C.yellow : next ? C.trim : C.navy));
    });
    flags.instanceMatrix.needsUpdate = true;
    if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
  }

  return {
    root,
    weakRoot,
    update(sim, dt, near) {
      uniforms.time.value = sim.worldTime;
      for (const r of uniforms.ripples.value) r.z += dt;
      if (!near) return;
      const t = sim.worldTime;
      floatIds.forEach((i, k) => {
        const s = SOLIDS[i];
        const st = sim.solids[i];
        e.set(Math.atan(st.tz), 0, -Math.atan(st.tx));
        q.setFromEuler(e);
        dummy.position.set(s.x, s.top - 0.17 - st.dip + st.bob, s.z);
        dummy.quaternion.copy(q);
        const sq = Math.max(0, -st.dipV) * 0.02;
        dummy.scale.set((s.r ?? 1) * (1 + sq), 1 - sq, (s.r ?? 1) * (1 + sq));
        dummy.updateMatrix();
        floats.setMatrixAt(k, dummy.matrix);
      });
      floats.instanceMatrix.needsUpdate = true;
      boxIds.forEach((i, k) => {
        const s = SOLIDS[i];
        const st = sim.solids[i];
        const thick = s.kind === 'plank' ? 0.12 : 0.3;
        e.set(Math.atan(st.tz), 0, -Math.atan(st.tx));
        dummy.quaternion.setFromEuler(e);
        dummy.position.set(s.x, s.top - thick / 2 - st.dip, s.z);
        dummy.scale.set((s.hx ?? 0.5) * 2, thick, (s.hz ?? 0.5) * 2);
        dummy.updateMatrix();
        boxes.setMatrixAt(k, dummy.matrix);
      });
      boxes.instanceMatrix.needsUpdate = true;
      bubbleIds.forEach((i, k) => {
        const s = SOLIDS[i];
        const st = sim.solids[i];
        const r = s.r ?? 0.8;
        const sq = Math.max(-0.3, Math.min(0.3, st.dip * 1.4));
        dummy.quaternion.identity();
        dummy.position.set(s.x, s.top - r * (1 - sq) + st.bob - 0.02, s.z);
        dummy.scale.set(r * (1 + sq * 0.6), r * (1 - sq), r * (1 + sq * 0.6));
        dummy.updateMatrix();
        bubbles.setMatrixAt(k, dummy.matrix);
      });
      bubbles.instanceMatrix.needsUpdate = true;
      // Blowers swell before a puff; puffs roll across the walkway.
      const clock = sim.cannonClock();
      let puffing = false;
      CANNONS.forEach((c, k) => {
        const cs = cannonState(clock, c.offset);
        const swell = cs.state === 'warn' ? 1 + 0.25 * cs.t + 0.05 * Math.sin(cs.t * 40) : cs.state === 'blast' ? 1.25 - 0.3 * cs.t : 1;
        dummy.quaternion.identity();
        dummy.position.set(c.x, 1.35, c.z);
        dummy.scale.set(1 / Math.sqrt(swell), swell, swell);
        dummy.updateMatrix();
        blowers.setMatrixAt(k, dummy.matrix);
        for (let j = 0; j < PUFFS; j++) {
          const idx = k * PUFFS + j;
          if (cs.state === 'blast' || (cs.state === 'idle' && cs.t < 0.12)) {
            puffing = true;
            const age = cs.state === 'blast' ? cs.t * CANNON.blast : CANNON.blast + cs.t * (CANNON.period - CANNON.warn - CANNON.blast);
            const f = Math.min(1, age / CANNON.blast);
            const spread = j / (PUFFS - 1);
            const x = c.x + 0.7 + (CANNON.reachX - c.x + 0.3) * f * (0.4 + 0.6 * spread);
            const fade = cs.state === 'idle' ? Math.max(0, 1 - cs.t / 0.12) : 1;
            const s = (0.35 + 0.45 * f + 0.15 * Math.sin(j * 2.1)) * fade;
            dummy.position.set(x, 1.35 + 0.25 * Math.sin(j * 1.7 + age * 6) + f * 0.3, c.z + 0.6 * Math.sin(j * 2.9));
            dummy.scale.setScalar(s);
          } else {
            dummy.position.set(c.x, 1.35, c.z);
            dummy.scale.setScalar(0);
          }
          dummy.updateMatrix();
          puffs.setMatrixAt(idx, dummy.matrix);
        }
      });
      blowers.instanceMatrix.needsUpdate = true;
      puffs.instanceMatrix.needsUpdate = true;
      puffs.visible = puffing;
      // Rope.
      ropePivot.rotation.z = sim.rope.theta;
      // Spray particles (the mesh is only drawn while some are flying).
      let flying = 0;
      for (let k = 0; k < SPRAY; k++) {
        const pp = spray[k];
        pp.age += dt;
        if (pp.age < pp.life) {
          flying++;
          pp.vy -= 9 * dt;
          pp.x += pp.vx * dt;
          pp.y += pp.vy * dt;
          pp.z += pp.vz * dt;
          if (pp.y < FOAM_Y) pp.age = pp.life;
          dummy.position.set(pp.x, pp.y, pp.z);
          dummy.scale.setScalar(pp.s * (1 - pp.age / pp.life * 0.5));
        } else dummy.scale.setScalar(0);
        dummy.quaternion.identity();
        dummy.updateMatrix();
        sprayMesh.setMatrixAt(k, dummy.matrix);
      }
      sprayMesh.instanceMatrix.needsUpdate = true;
      sprayMesh.visible = flying > 0;
      // Machine bubbles.
      overdrive = Math.max(0, overdrive - dt);
      const rate = overdrive > 0 ? 3 : 1;
      for (let k = 0; k < MB; k++) {
        const b = mb[k];
        b.age += dt * rate;
        if (b.age >= b.life) {
          b.age = 0;
          b.x = machine.x + 0.4;
          b.y = 1.75;
          b.z = machine.z;
          const a = Math.sin(b.seed * 7.1 + t);
          b.vx = 0.9 + 0.5 * Math.abs(a);
          b.vy = 0.25 + 0.2 * Math.cos(b.seed * 3.3);
          b.vz = 0.35 * Math.sin(b.seed * 5.7 + t * 0.3);
          b.s = 0.08 + 0.14 * Math.abs(Math.sin(b.seed * 9.3));
        }
        const u = b.age;
        dummy.position.set(b.x + b.vx * u, b.y + b.vy * u + 0.15 * Math.sin(u * 2 + b.seed), b.z + b.vz * u + 0.2 * Math.sin(u * 1.3 + b.seed));
        const pop = u > b.life - 0.15 ? 0 : Math.min(1, u * 4);
        dummy.scale.setScalar(b.s * pop);
        dummy.quaternion.identity();
        dummy.updateMatrix();
        mbMesh.setMatrixAt(k, dummy.matrix);
      }
      mbMesh.instanceMatrix.needsUpdate = true;
      setFlags(flagCp, flagRunning, t);
      if (!primed) {
        // Bounds from the real instance poses (plus slack for tipping and bobbing).
        primed = true;
        for (const m of [floats, boxes, bubbles, blowers, flags]) {
          m.computeBoundingSphere();
          if (m.boundingSphere) m.boundingSphere.radius += 1.5;
        }
      }
    },
    splash(x, z, strength = 1) {
      const r = uniforms.ripples.value[rippleNext];
      rippleNext = (rippleNext + 1) % MAX_RIPPLES;
      r.set(x, z, 0, strength);
      this.spray(x, FOAM_Y + 0.1, z, 16);
    },
    spray(x, y, z, n = 6) {
      for (let k = 0; k < n; k++) {
        const pp = spray[sprayNext];
        sprayNext = (sprayNext + 1) % SPRAY;
        const a = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 2.2;
        pp.age = 0;
        pp.life = 0.7 + Math.random() * 0.5;
        pp.x = x;
        pp.y = y;
        pp.z = z;
        pp.vx = Math.cos(a) * sp;
        pp.vz = Math.sin(a) * sp;
        pp.vy = 3 + Math.random() * 3;
        pp.s = 0.1 + Math.random() * 0.14;
      }
    },
    setCheckpoint(cp, running) {
      flagCp = cp;
      flagRunning = running;
    },
    celebrate() {
      overdrive = 4;
    },
    dispose() {
      scene.remove(root);
      for (const d of disposables) d.dispose();
      for (const m of [floats, boxes, bubbles, blowers, puffs, sprayMesh, mbMesh, flags, tiles, stones]) m.dispose();
    },
  };
}
