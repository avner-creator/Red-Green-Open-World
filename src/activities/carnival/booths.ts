/**
 * The carnival row's static build: five striped booths (stall, bell towers, glow tent), the midway
 * carpet, the entrance arch and the prize shelf frame. Everything static is merged into ONE
 * vertex-coloured mesh plus ONE pictogram-sign mesh; shadows come from one merged proxy.
 * All coordinates are in the SITE frame (see layout.ts).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARCH_X, BOOTH_D, BOOTH_FRONT_Z, BOOTH_W, BOOTH_X, DECK_H, DECK_X0, DECK_X1, GAME_IDS, MIDWAY_Z1, SHELF } from './layout';
import type { GameId } from './layout';
import { G, Kit, T } from './kit';
import { pictoUv } from './picto';
import type { PictoId } from './picto';

export const WHITE = 0xf4efe4;
export const GOLD = 0xffcf33;
export const NIGHT = 0x141833;
export const WOOD = 0x8a5a36;

/**
 * Booth accent colours: all dark in BOTH the red and the green channel, so the white stripes read
 * by brightness for either eye (never hue alone).
 */
export const BOOTH_COLOR: Readonly<Record<GameId, number>> = {
  balloonPop: 0x8c1c34,
  ringToss: 0x23308a,
  duckPond: 0x0b5560,
  strengthBell: 0x4a237a,
  glowDodge: 0x2a1450,
};

/** Counter height per stall booth (0 = no counter). */
export const COUNTER_H: Readonly<Record<GameId, number>> = {
  balloonPop: 1.0,
  ringToss: 0.95,
  duckPond: 0.72,
  strengthBell: 0,
  glowDodge: 0,
};

export interface ColliderBox {
  /** Site-frame centre and half extents (axis-aligned in the site frame). */
  center: THREE.Vector3;
  half: THREE.Vector3;
}

/** Pictogram quads with atlas UVs, merged into one geometry. */
export class SignKit {
  private readonly parts: THREE.BufferGeometry[] = [];
  add(id: PictoId, m: THREE.Matrix4, size = 1): void {
    const g = new THREE.PlaneGeometry(size, size);
    const [u0, v0, u1, v1] = pictoUv(id);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    g.applyMatrix4(m);
    this.parts.push(g);
  }
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false) ?? new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    g.computeBoundingSphere();
    return g;
  }
}

export interface RowBuild {
  kit: Kit;
  signs: SignKit;
  proxies: THREE.BufferGeometry[];
  colliders: ColliderBox[];
}

const mul = (a: THREE.Matrix4, b: THREE.Matrix4): THREE.Matrix4 => a.clone().multiply(b);

function proxyBox(out: THREE.BufferGeometry[], x: number, y: number, z: number, w: number, h: number, d: number): void {
  out.push(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z));
}

/** Striped awning roof + scalloped valance + bulbs + sign over a booth (booth frame matrix `B`). */
function awning(r: RowBuild, B: THREE.Matrix4, color: number, game: GameId, frontY: number): void {
  const k = r.kit;
  const pitch = 0.13;
  const len = BOOTH_D + 0.9;
  const zc = -BOOTH_D / 2 + 0.25;
  const yc = frontY + Math.sin(pitch) * (len / 2 - 0.25 + 0.25);
  for (let i = 0; i < 10; i++) {
    const x = -BOOTH_W / 2 - 0.05 + 0.5 * i + 0.27;
    k.add(G.boxC, i % 2 ? WHITE : color, mul(B, T(x, yc, zc, 0, 0.54, 0.07, len, pitch)));
  }
  // Scalloped valance along the front edge.
  for (let i = 0; i < 11; i++) {
    const x = -BOOTH_W / 2 + 0.03 + 0.494 * i;
    k.add(G.cylLo, i % 2 ? color : WHITE, mul(B, T(x, frontY - 0.02, 0.62, 0, 0.5, 0.05, 0.5, Math.PI / 2)));
  }
  // Warm bulbs under the valance.
  for (let i = 0; i < 9; i++) k.add(G.sphereLo, 0xfff0c0, mul(B, T(-2 + i * 0.5, frontY - 0.3, 0.6, 0, 0.13, 0.13, 0.13)), 1);
  // Sign: gold frame, night plate, pictogram.
  k.add(G.box, GOLD, mul(B, T(0, frontY + 0.12, 0.42, 0, 1.5, 1.24, 0.08)));
  k.add(G.box, NIGHT, mul(B, T(0, frontY + 0.2, 0.47, 0, 1.3, 1.08, 0.04)));
  r.signs.add(game, mul(B, T(0, frontY + 0.74, 0.5)), 1.0);
}

function stall(r: RowBuild, game: GameId, B: THREE.Matrix4): void {
  const k = r.kit;
  const c = BOOTH_COLOR[game];
  const ch = COUNTER_H[game];
  const d = BOOTH_D;
  k.add(G.box, WOOD, mul(B, T(0, 0, -d / 2, 0, BOOTH_W, 0.14, d)));
  // Counter: dark body, white stripes, gold top.
  k.add(G.box, c, mul(B, T(0, 0, -0.38, 0, BOOTH_W - 0.1, ch, 0.7)));
  for (let i = 0; i < 10; i++) k.add(G.box, WHITE, mul(B, T(-2.25 + i * 0.5, 0.08, 0.0, 0, 0.22, ch - 0.18, 0.04)));
  k.add(G.box, GOLD, mul(B, T(0, ch, -0.4, 0, BOOTH_W + 0.2, 0.09, 0.92)));
  // Posts with gold knobs.
  for (const x of [-2.42, 2.42]) {
    for (const z of [-0.12, -d + 0.08]) {
      k.add(G.cyl, WHITE, mul(B, T(x, 0, z, 0, 0.18, 3.25, 0.18)));
    }
    k.add(G.sphere, GOLD, mul(B, T(x, 3.3, -0.12, 0, 0.26, 0.26, 0.26)));
  }
  // Dark back wall (a dark backdrop makes the weak-eye prizes pop) with a gold rail; striped sides.
  k.add(G.box, NIGHT, mul(B, T(0, 0, -d + 0.02, 0, BOOTH_W - 0.1, 3.15, 0.12)));
  k.add(G.box, GOLD, mul(B, T(0, 3.12, -d + 0.1, 0, BOOTH_W - 0.1, 0.08, 0.08)));
  for (const s of [-1, 1]) {
    k.add(G.box, c, mul(B, T(s * 2.44, 0, -d / 2 - 0.3, 0, 0.1, 3.0, d - 0.6)));
    k.add(G.box, WHITE, mul(B, T(s * 2.5, 1.15, -d / 2 - 0.3, 0, 0.03, 0.22, d - 0.7)));
    k.add(G.box, WHITE, mul(B, T(s * 2.5, 2.3, -d / 2 - 0.3, 0, 0.03, 0.22, d - 0.7)));
  }
  awning(r, B, c, game, 3.15);
}

function bellBooth(r: RowBuild, game: GameId, B: THREE.Matrix4): void {
  const k = r.kit;
  const c = BOOTH_COLOR[game];
  const d = BOOTH_D;
  k.add(G.box, WOOD, mul(B, T(0, 0, -d / 2 + 0.6, 0, BOOTH_W, 0.14, d + 1.2)));
  // Tall dark backdrop with a gold border and stars, low striped side walls.
  k.add(G.box, NIGHT, mul(B, T(0, 0, -d + 0.02, 0, BOOTH_W - 0.1, 6.7, 0.14)));
  k.add(G.box, GOLD, mul(B, T(0, 6.6, -d + 0.1, 0, BOOTH_W, 0.14, 0.12)));
  for (const s of [-1, 1]) {
    k.add(G.box, GOLD, mul(B, T(s * 2.45, 0, -d + 0.1, 0, 0.14, 6.7, 0.12)));
    k.add(G.box, c, mul(B, T(s * 2.44, 0, -d / 2 - 0.3, 0, 0.1, 2.2, d - 0.6)));
    for (let i = 0; i < 4; i++) k.add(G.box, WHITE, mul(B, T(s * 2.5, 0.1, -d + 0.6 + i * 1.0, 0, 0.03, 2.0, 0.3)));
  }
  // Sign on top of the backdrop.
  k.add(G.box, GOLD, mul(B, T(0, 6.75, -d + 0.2, 0, 1.5, 1.24, 0.08)));
  k.add(G.box, NIGHT, mul(B, T(0, 6.83, -d + 0.25, 0, 1.3, 1.08, 0.04)));
  r.signs.add(game, mul(B, T(0, 7.37, -d + 0.28)), 1.0);
}

function tentBooth(r: RowBuild, game: GameId, B: THREE.Matrix4): void {
  const k = r.kit;
  const c = BOOTH_COLOR[game];
  const d = BOOTH_D;
  // Dark floor inside and a dark mat out into the midway, with neon tape lane lines.
  k.add(G.box, 0x0c0e1c, mul(B, T(0, 0, -d / 2, 0, BOOTH_W, 0.12, d)));
  k.add(G.box, 0x0c0e1c, mul(B, T(0, 0, 1.35, 0, BOOTH_W, 0.06, 2.7)));
  for (const x of [-2.35, -0.85, 0.85, 2.35]) k.add(G.box, 0xfff6b0, mul(B, T(x, 0.06, -d / 2 + 1.2, 0, 0.07, 0.07, d + 2.3)), 1);
  for (const z of [2.6, -d + 0.2]) k.add(G.box, 0xfff6b0, mul(B, T(0, 0.06, z, 0, 4.7, 0.07, 0.07)), 1);
  // Walls (dark) with neon zigzags; open front with striped curtains tied back.
  k.add(G.box, NIGHT, mul(B, T(0, 0, -d, 0, BOOTH_W, 3.2, 0.12)));
  for (const s of [-1, 1]) k.add(G.box, NIGHT, mul(B, T(s * 2.47, 0, -d / 2, 0, 0.12, 3.2, d)));
  for (let i = 0; i < 8; i++) {
    const x = -2.1 + i * 0.6;
    k.add(G.boxC, i % 2 ? 0xffffff : 0xfff6b0, mul(B, T(x, 2.35, -d + 0.1, 0, 0.62, 0.06, 0.03, 0, i % 2 ? 0.6 : -0.6)), 1);
  }
  for (const s of [-1, 1]) {
    k.add(G.cone, s > 0 ? WHITE : c, mul(B, T(s * 2.2, 0, 0.0, 0, 0.7, 3.1, 0.3)));
    k.add(G.cyl, WHITE, mul(B, T(s * 2.45, 0, 0.05, 0, 0.16, 3.3, 0.16)));
  }
  // Pointed striped roof (8 wedges alternate colour) + gold top ball and pennant.
  const roofY = 3.15;
  for (let i = 0; i < 8; i++) {
    const wedge = new THREE.ConeGeometry(3.75, 2.4, 2, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4).translate(0, 1.2, 0);
    k.add(wedge, i % 2 ? WHITE : c, mul(B, T(0, roofY, -d / 2, Math.PI / 8)));
    wedge.dispose();
  }
  k.add(G.sphere, GOLD, mul(B, T(0, roofY + 2.42, -d / 2, 0, 0.32, 0.32, 0.32)));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.add(G.sphereLo, 0xfff0c0, mul(B, T(Math.sin(a) * 3.3, roofY + 0.18, -d / 2 + Math.cos(a) * 3.3, 0, 0.14, 0.14, 0.14)), 1);
  }
  // Sign over the opening.
  k.add(G.box, GOLD, mul(B, T(0, roofY - 0.05, 0.25, 0, 1.5, 1.24, 0.08)));
  k.add(G.box, NIGHT, mul(B, T(0, roofY + 0.03, 0.3, 0, 1.3, 1.08, 0.04)));
  r.signs.add(game, mul(B, T(0, roofY + 0.57, 0.33)), 1.0);
}

function arch(r: RowBuild): void {
  const k = r.kit;
  const z0 = BOOTH_FRONT_Z + 0.35;
  const z1 = MIDWAY_Z1 - 0.3;
  const zc = (z0 + z1) / 2;
  const span = z1 - z0;
  for (const z of [z0, z1]) {
    k.add(G.cyl, WHITE, T(ARCH_X, 0, z, 0, 0.32, 4.6, 0.32));
    for (let i = 0; i < 6; i++) k.add(G.cylLo, i % 2 ? 0x8c1c34 : 0x23308a, T(ARCH_X, 0.4 + i * 0.7, z, 0, 0.36, 0.3, 0.36));
    k.add(G.sphere, GOLD, T(ARCH_X, 4.75, z, 0, 0.5, 0.5, 0.5));
  }
  // Curved beam of alternating segments with bulbs.
  const n = 12;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const a = (t: number): [number, number] => [z0 + span * t, 4.3 + Math.sin(t * Math.PI) * 0.9];
    const [za, ya] = a(t0);
    const [zb, yb] = a(t1);
    const len = Math.hypot(zb - za, yb - ya);
    const pitch = -Math.atan2(yb - ya, zb - za);
    k.add(G.boxC, i % 2 ? WHITE : 0x8c1c34, T(ARCH_X, (ya + yb) / 2, (za + zb) / 2, 0, 0.28, 0.42, len + 0.02, pitch));
    k.add(G.sphereLo, 0xfff0c0, T(ARCH_X - 0.16, (ya + yb) / 2 - 0.26, (za + zb) / 2, 0, 0.15, 0.15, 0.15), 1);
    k.add(G.sphereLo, 0xfff0c0, T(ARCH_X + 0.16, (ya + yb) / 2 - 0.26, (za + zb) / 2, 0, 0.15, 0.15, 0.15), 1);
  }
  // Round sign on both faces (tent pictogram).
  for (const s of [-1, 1]) {
    const yaw = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    k.add(G.cyl, GOLD, T(ARCH_X + s * 0.05, 5.6, zc, 0, 1.7, 0.08, 1.7, 0, Math.PI / 2));
    k.add(G.cyl, NIGHT, T(ARCH_X + s * 0.1, 5.6, zc, 0, 1.45, 0.06, 1.45, 0, Math.PI / 2));
    r.signs.add('tent', T(ARCH_X + s * 0.14, 5.6, zc, yaw), 1.1);
  }
  r.colliders.push({ center: new THREE.Vector3(ARCH_X, 2.3, z0), half: new THREE.Vector3(0.18, 2.3, 0.18) });
  r.colliders.push({ center: new THREE.Vector3(ARCH_X, 2.3, z1), half: new THREE.Vector3(0.18, 2.3, 0.18) });
  proxyBox(r.proxies, ARCH_X, 0, zc, 0.3, 5.2, span + 0.4);
}

/** Raised plank boardwalk under the whole row, with a step along the open edges. */
function boardwalk(r: RowBuild): void {
  const k = r.kit;
  const z0 = BOOTH_FRONT_Z - BOOTH_D - 0.35;
  const z1 = MIDWAY_Z1 + 0.25;
  const sink = 0.3;
  const xc = (DECK_X0 + DECK_X1) / 2;
  const zc = (z0 + z1) / 2;
  k.add(G.box, 0x6e4628, T(xc, -DECK_H - sink, zc, 0, DECK_X1 - DECK_X0, DECK_H + sink - 0.04, z1 - z0));
  const n = Math.round((DECK_X1 - DECK_X0) / 0.55);
  for (let i = 0; i < n; i++) {
    const x = DECK_X0 + (i + 0.5) * ((DECK_X1 - DECK_X0) / n);
    k.add(G.box, [0x9a6a42, 0x8c5e39, 0xa47248][i % 3], T(x, -0.045, zc, 0, (DECK_X1 - DECK_X0) / n - 0.035, 0.045, z1 - z0));
  }
  // Steps (half height) along the open midway edge and at both ends.
  const sh = DECK_H / 2;
  k.add(G.box, 0x7a5030, T(xc, -DECK_H - 0.1, z1 + 0.25, 0, DECK_X1 - DECK_X0, sh + 0.1, 0.5));
  for (const [x, w] of [[DECK_X1 + 0.25, 0.5], [DECK_X0 - 0.25, 0.5]] as const) {
    k.add(G.box, 0x7a5030, T(x, -DECK_H - 0.1, (BOOTH_FRONT_Z + z1) / 2, 0, w, sh + 0.1, z1 - BOOTH_FRONT_Z));
  }
  r.colliders.push({ center: new THREE.Vector3(xc, -DECK_H / 2 - 0.15, zc), half: new THREE.Vector3((DECK_X1 - DECK_X0) / 2, DECK_H / 2 + 0.15, (z1 - z0) / 2) });
  r.colliders.push({ center: new THREE.Vector3(xc, -DECK_H + sh / 2 - 0.1, z1 + 0.25), half: new THREE.Vector3((DECK_X1 - DECK_X0) / 2, sh / 2 + 0.1, 0.25) });
  for (const x of [DECK_X1 + 0.25, DECK_X0 - 0.25]) {
    r.colliders.push({ center: new THREE.Vector3(x, -DECK_H + sh / 2 - 0.1, (BOOTH_FRONT_Z + z1) / 2), half: new THREE.Vector3(0.25, sh / 2 + 0.1, (z1 - BOOTH_FRONT_Z) / 2) });
  }
}

function midway(r: RowBuild): void {
  const k = r.kit;
  const x0 = DECK_X0 + 0.6;
  const x1 = DECK_X1 - 0.4;
  const zc = (BOOTH_FRONT_Z + MIDWAY_Z1) / 2;
  const w = MIDWAY_Z1 - BOOTH_FRONT_Z;
  k.add(G.box, 0xc8a26a, T((x0 + x1) / 2, 0, zc, 0, x1 - x0, 0.05, w));
  for (const z of [BOOTH_FRONT_Z + 0.08, MIDWAY_Z1 - 0.08]) k.add(G.box, 0x6e4a2c, T((x0 + x1) / 2, 0, z, 0, x1 - x0, 0.07, 0.16));
  // Light poles with strings of bulbs across the midway between the booths.
  for (const x of [-9, -3, 3, 9]) {
    k.add(G.cyl, WHITE, T(x, 0, MIDWAY_Z1 - 0.35, 0, 0.14, 4.0, 0.14));
    k.add(G.sphere, GOLD, T(x, 4.0, MIDWAY_Z1 - 0.35, 0, 0.22, 0.22, 0.22));
    const za = MIDWAY_Z1 - 0.35;
    const zb = BOOTH_FRONT_Z - 0.2;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const y = 3.95 - Math.sin(t * Math.PI) * 0.55 - t * 0.6;
      k.add(G.sphereLo, i % 2 ? 0xfff0c0 : 0xffe07a, T(x, y, za + (zb - za) * t, 0, 0.13, 0.13, 0.13), 1);
    }
    r.colliders.push({ center: new THREE.Vector3(x, 2, MIDWAY_Z1 - 0.35), half: new THREE.Vector3(0.1, 2, 0.1) });
  }
}

function shelf(r: RowBuild): void {
  const k = r.kit;
  const S = T(SHELF.x, 0, SHELF.z, SHELF.yaw);
  // Stepped shelf (3 tiers), striped back board, plush sign.
  for (let t = 0; t < 3; t++) {
    k.add(G.box, WOOD, mul(S, T(0, 0, -0.35 - t * 0.38, 0, 3.6, 0.5 + t * 0.45, 0.38)));
    k.add(G.box, GOLD, mul(S, T(0, 0.5 + t * 0.45, -0.35 - t * 0.38, 0, 3.6, 0.04, 0.4)));
  }
  for (let i = 0; i < 9; i++) k.add(G.box, i % 2 ? WHITE : 0x8c1c34, mul(S, T(-1.6 + i * 0.4, 0, -1.42, 0, 0.4, 2.8, 0.08)));
  k.add(G.box, GOLD, mul(S, T(0, 2.75, -1.4, 0, 1.3, 1.1, 0.1)));
  k.add(G.box, NIGHT, mul(S, T(0, 2.82, -1.33, 0, 1.1, 0.95, 0.04)));
  r.signs.add('plush', mul(S, T(0, 3.29, -1.3)), 0.88);
  r.colliders.push({ center: new THREE.Vector3(SHELF.x - 0.75, 0.8, SHELF.z), half: new THREE.Vector3(0.8, 0.8, 1.8) });
  proxyBox(r.proxies, SHELF.x - 0.8, 0, SHELF.z, 1.2, 2.8, 3.6);
}

/** Build the whole static row (site frame). */
export function buildRow(): RowBuild {
  const r: RowBuild = { kit: new Kit(), signs: new SignKit(), proxies: [], colliders: [] };
  for (const game of GAME_IDS) {
    const bx = BOOTH_X[game];
    const B = T(bx, 0, BOOTH_FRONT_Z);
    if (game === 'strengthBell') bellBooth(r, game, B);
    else if (game === 'glowDodge') tentBooth(r, game, B);
    else stall(r, game, B);
    const zb = BOOTH_FRONT_Z - BOOTH_D / 2;
    if (game === 'glowDodge') {
      // Walls only: the lanes in front stay open.
      r.colliders.push({ center: new THREE.Vector3(bx, 1.6, BOOTH_FRONT_Z - BOOTH_D), half: new THREE.Vector3(BOOTH_W / 2, 1.6, 0.1) });
      for (const s of [-1, 1]) r.colliders.push({ center: new THREE.Vector3(bx + s * 2.47, 1.6, zb), half: new THREE.Vector3(0.1, 1.6, BOOTH_D / 2) });
      proxyBox(r.proxies, bx, 0, zb, BOOTH_W, 3.4, BOOTH_D);
    } else if (game === 'strengthBell') {
      r.colliders.push({ center: new THREE.Vector3(bx, 1.6, BOOTH_FRONT_Z - 1.2 - (BOOTH_D - 1.2) / 2), half: new THREE.Vector3(BOOTH_W / 2, 1.6, (BOOTH_D - 1.2) / 2) });
      proxyBox(r.proxies, bx, 0, BOOTH_FRONT_Z - BOOTH_D + 0.2, BOOTH_W, 6.7, 0.4);
      proxyBox(r.proxies, bx, 0, zb, BOOTH_W, 2.2, BOOTH_D);
    } else {
      r.colliders.push({ center: new THREE.Vector3(bx, 1.6, zb), half: new THREE.Vector3(BOOTH_W / 2, 1.6, BOOTH_D / 2) });
      proxyBox(r.proxies, bx, 0, zb + 0.3, BOOTH_W, 3.5, BOOTH_D + 0.6);
    }
  }
  boardwalk(r);
  arch(r);
  midway(r);
  shelf(r);
  return r;
}
