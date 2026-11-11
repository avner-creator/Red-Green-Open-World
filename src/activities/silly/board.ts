/**
 * The "Boop them all!" picture board and the walk-in start pad: one canvas texture, one mesh
 * (both-eye). The board tells the game in three wordless pictures: stand on the pad → bop the tube
 * people with the arrows → beat the clock for stars. Cream / yellow on navy (reads by brightness in
 * R-only and G-only); the posts go into the shared static kit.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Kit } from '../bungee/kit';
import { COL } from './models';

const W = 1536;
const H = 512;
const BOARD_W = 1024;

const NAVY = '#1b2252';
const INK = '#14161f';
const CREAM = '#fff1cf';
const YEL = '#ffd23f';
const PINK = '#ff9ed8';

type G = CanvasRenderingContext2D;

function stroke(g: G, w: number, col = INK): void {
  g.lineWidth = w;
  g.strokeStyle = col;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke();
}

/** A tube person at (x, base y), height h, bent by `bend` (−1..1), with a lit arrow above if `arrow`. */
function tube(g: G, x: number, y: number, h: number, bend: number, fill: string, arrow: boolean): void {
  const w = h * 0.2;
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.moveTo(-w / 2, 0);
  g.quadraticCurveTo(-w / 2 + bend * h * 0.15, -h * 0.5, bend * h * 0.4 - w / 2, -h);
  g.arc(bend * h * 0.4, -h, w / 2, Math.PI, 0);
  g.quadraticCurveTo(w / 2 + bend * h * 0.15, -h * 0.5, w / 2, 0);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  stroke(g, 6);
  // Arms flailing up.
  g.beginPath();
  g.moveTo(bend * h * 0.22 - w * 0.4, -h * 0.62);
  g.lineTo(bend * h * 0.22 - w * 1.4, -h * 0.95);
  g.moveTo(bend * h * 0.22 + w * 0.4, -h * 0.62);
  g.lineTo(bend * h * 0.22 + w * 1.4, -h * 0.9);
  stroke(g, 16);
  g.beginPath();
  g.moveTo(bend * h * 0.22 - w * 0.4, -h * 0.62);
  g.lineTo(bend * h * 0.22 - w * 1.4, -h * 0.95);
  g.moveTo(bend * h * 0.22 + w * 0.4, -h * 0.62);
  g.lineTo(bend * h * 0.22 + w * 1.4, -h * 0.9);
  stroke(g, 8, fill);
  // Face.
  const fx = bend * h * 0.4;
  g.fillStyle = INK;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(fx + s * w * 0.2, -h + w * 0.05, w * 0.1, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.arc(fx, -h + w * 0.3, w * 0.14, 0, Math.PI * 2);
  g.fill();
  if (arrow) {
    const ay = -h - w * 1.6;
    g.beginPath();
    g.moveTo(fx - 22, ay - 30);
    g.lineTo(fx + 22, ay - 30);
    g.lineTo(fx + 22, ay - 6);
    g.lineTo(fx + 38, ay - 6);
    g.lineTo(fx, ay + 30);
    g.lineTo(fx - 38, ay - 6);
    g.lineTo(fx - 22, ay - 6);
    g.closePath();
    g.fillStyle = YEL;
    g.fill();
    stroke(g, 6);
  }
  g.restore();
}

/** A running kid (head + body + limbs), facing right, at (x, foot y), size s. */
function kid(g: G, x: number, y: number, s: number, lean = 0): void {
  g.save();
  g.translate(x, y);
  g.rotate(lean);
  g.strokeStyle = CREAM;
  g.lineWidth = 16 * s;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, -70 * s);
  g.lineTo(-22 * s, -30 * s);
  g.lineTo(-30 * s, 0);
  g.moveTo(-22 * s, -30 * s);
  g.lineTo(18 * s, -4 * s);
  g.moveTo(0, -70 * s);
  g.lineTo(6 * s, -120 * s);
  g.moveTo(4 * s, -108 * s);
  g.lineTo(40 * s, -92 * s);
  g.moveTo(4 * s, -108 * s);
  g.lineTo(-30 * s, -96 * s);
  g.stroke();
  g.fillStyle = CREAM;
  g.beginPath();
  g.arc(10 * s, -146 * s, 22 * s, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function padIcon(g: G, cx: number, cy: number, r: number): void {
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = YEL;
  g.fill();
  stroke(g, Math.max(6, r * 0.08));
  g.beginPath();
  g.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  g.fillStyle = NAVY;
  g.fill();
  // Play triangle.
  g.beginPath();
  g.moveTo(cx - r * 0.25, cy - r * 0.38);
  g.lineTo(cx + r * 0.42, cy);
  g.lineTo(cx - r * 0.25, cy + r * 0.38);
  g.closePath();
  g.fillStyle = YEL;
  g.fill();
}

function clock(g: G, cx: number, cy: number, r: number): void {
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = CREAM;
  g.fill();
  stroke(g, 8);
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx, cy - r * 0.7);
  g.moveTo(cx, cy);
  g.lineTo(cx + r * 0.5, cy + r * 0.2);
  stroke(g, 9);
  g.fillStyle = INK;
  g.fillRect(cx - r * 0.25, cy - r - 18, r * 0.5, 14);
}

function star(g: G, cx: number, cy: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = YEL;
  g.fill();
  stroke(g, 7);
}

function arrowRight(g: G, x: number, y: number): void {
  g.beginPath();
  g.moveTo(x - 26, y - 14);
  g.lineTo(x + 2, y - 14);
  g.lineTo(x + 2, y - 30);
  g.lineTo(x + 32, y);
  g.lineTo(x + 2, y + 30);
  g.lineTo(x + 2, y + 14);
  g.lineTo(x - 26, y + 14);
  g.closePath();
  g.fillStyle = CREAM;
  g.fill();
}

function drawAtlas(g: G): void {
  // ── Board (left 1024×512) ──
  g.fillStyle = NAVY;
  g.fillRect(0, 0, BOARD_W, H);
  g.fillStyle = YEL;
  g.fillRect(0, 0, BOARD_W, 26);
  g.fillRect(0, H - 26, BOARD_W, 26);
  // Candy stripes on the top and bottom bands.
  g.fillStyle = PINK;
  for (let x = 0; x < BOARD_W; x += 64) {
    g.fillRect(x, 0, 32, 26);
    g.fillRect(x + 32, H - 26, 32, 26);
  }
  const cells = [16, 352, 688];
  for (const x of cells) {
    g.fillStyle = '#28306a';
    g.beginPath();
    g.roundRect(x, 52, 320, 408, 30);
    g.fill();
  }
  // 1: stand on the pad.
  g.save();
  g.beginPath();
  g.ellipse(176, 400, 120, 36, 0, 0, Math.PI * 2);
  g.fillStyle = YEL;
  g.fill();
  stroke(g, 7);
  g.beginPath();
  g.ellipse(176, 400, 82, 22, 0, 0, Math.PI * 2);
  g.fillStyle = NAVY;
  g.fill();
  g.restore();
  kid(g, 170, 404, 1.25);
  padIcon(g, 270, 130, 50);
  arrowRight(g, 336, 256);
  // 2: run into the lit tube people.
  kid(g, 420, 430, 1.1, 0.25);
  tube(g, 560, 430, 250, 0.45, YEL, true);
  tube(g, 640, 430, 200, 0, PINK, true);
  // Boop burst.
  g.save();
  g.translate(496, 290);
  g.fillStyle = CREAM;
  for (let i = 0; i < 8; i++) {
    g.rotate(Math.PI / 4);
    g.fillRect(-5, 22, 10, 30);
  }
  g.restore();
  arrowRight(g, 672, 256);
  // 3: beat the clock → stars.
  clock(g, 790, 175, 72);
  star(g, 760, 370, 52);
  star(g, 848, 352, 62);
  star(g, 936, 370, 52);

  // ── Start pad (right 512×512) ──
  const cx = BOARD_W + 256;
  g.fillStyle = INK;
  g.fillRect(BOARD_W, 0, 512, 512);
  g.beginPath();
  g.arc(cx, 256, 250, 0, Math.PI * 2);
  g.fillStyle = YEL;
  g.fill();
  g.beginPath();
  g.arc(cx, 256, 208, 0, Math.PI * 2);
  g.fillStyle = NAVY;
  g.fill();
  // Dotted ring.
  g.fillStyle = CREAM;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.beginPath();
    g.arc(cx + Math.cos(a) * 229, 256 + Math.sin(a) * 229, 9, 0, Math.PI * 2);
    g.fill();
  }
  // A big play triangle pointing into the park (up in the texture) and a small tube person.
  g.beginPath();
  g.moveTo(cx, 90);
  g.lineTo(cx + 118, 300);
  g.lineTo(cx - 118, 300);
  g.closePath();
  g.fillStyle = YEL;
  g.fill();
  stroke(g, 10);
  tube(g, cx + 120, 430, 150, 0.3, PINK, false);
  tube(g, cx - 120, 430, 150, -0.3, CREAM, false);
}

export interface BoardModel {
  readonly mesh: THREE.Mesh;
  /** Pulse the start pad glow (0..1). */
  setGlow(k: number): void;
}

export interface BoardSpec {
  /** Board centre at ground level and its facing yaw (+Z of yaw = the readable side). */
  board: THREE.Vector3;
  boardYaw: number;
  /** Start pad centre (on the ground) and radius. */
  pad: THREE.Vector3;
  padRadius: number;
  /** Extra turn of the pad picture (0: the triangle points to +Z). */
  padYaw: number;
}

/** Board sizes (metres). */
export const BOARD = { width: 3.4, height: 1.7, bottom: 1.25 } as const;

export function createBoard(spec: BoardSpec, k: Kit): BoardModel {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (g) drawAtlas(g);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const { width, height, bottom } = BOARD;
  const u = BOARD_W / W;
  const plane = new THREE.PlaneGeometry(width, height);
  const uv = plane.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * u);
  plane.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(spec.board.x, spec.board.y + bottom + height / 2, spec.board.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spec.boardYaw, 0)), new THREE.Vector3(1, 1, 1)));
  const disc = new THREE.CircleGeometry(spec.padRadius, 40).rotateX(-Math.PI / 2);
  const duv = disc.attributes.uv;
  // Circle UVs are 0..1 over the square; map into the right-hand 512×512 cell. Texture up → +Z
  // (into the park, away from the entrance) after the half turn.
  for (let i = 0; i < duv.count; i++) duv.setXY(i, u + duv.getX(i) * (1 - u), duv.getY(i));
  disc.rotateY(Math.PI + spec.padYaw);
  disc.translate(spec.pad.x, spec.pad.y + 0.07, spec.pad.z);
  const geo = mergeGeometries([plane.toNonIndexed(), disc.toNonIndexed()], false);
  plane.dispose();
  disc.dispose();
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.6, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo ?? new THREE.BufferGeometry(), mat);
  mesh.name = 'silly-board';
  mesh.receiveShadow = true;

  // Posts and frame (static kit).
  const right = new THREE.Vector3(Math.cos(spec.boardYaw), 0, -Math.sin(spec.boardYaw));
  const back = new THREE.Vector3(Math.sin(spec.boardYaw), 0, Math.cos(spec.boardYaw)).multiplyScalar(-0.06);
  for (const s of [-1, 1]) {
    const p = spec.board.clone().addScaledVector(right, s * (width / 2 + 0.05)).add(back);
    k.cyl('gloss', COL.yellow, p.x, p.y + (bottom + height + 0.2) / 2, p.z, 0.1, bottom + height + 0.2, 12);
    k.add('gloss', new THREE.SphereGeometry(0.18, 12, 8), COL.pink, k.t(p.x, p.y + bottom + height + 0.25, p.z));
  }
  const fb = spec.board.clone().add(back.clone().multiplyScalar(2));
  k.box('gloss', COL.yellow, fb.x, fb.y + bottom + height / 2, fb.z, width + 0.2, height + 0.2, 0.06, 0, spec.boardYaw, 0);
  // Pad rim.
  k.add('gloss', new THREE.TorusGeometry(spec.padRadius + 0.05, 0.1, 8, 40), COL.ink, k.t(spec.pad.x, spec.pad.y + 0.07, spec.pad.z, Math.PI / 2));
  k.cyl('matte', COL.ink, spec.pad.x, spec.pad.y + 0.03, spec.pad.z, spec.padRadius + 0.05, 0.06, 40);

  return {
    mesh,
    setGlow(v) {
      mat.emissiveIntensity = 0.25 + 0.45 * Math.max(0, Math.min(1, v));
    },
  };
}
