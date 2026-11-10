/** Procedural village house: plinth, walls, trims, windows, door, shop front, roof with tile rows. */
import * as THREE from 'three';
import { M, T } from './batch';
import { C, box, type Kit } from './props';
import { blobG, boxG, cylG, prismG, pyramidG, rbox, sphereG } from './shapes';
import { FLOOR_H, PLINTH_H, lotDims } from './village-data';
import type { Lot } from './village-data';
import { Rng } from './rng';

type Face = 'front' | 'back' | 'left' | 'right';

export interface HouseOpts {
  /** Extra mesh colliders for non-box roofs. */
  addMeshCollider(mesh: THREE.Mesh): void;
}

export function house(k: Kit, lot: Lot, opts: HouseOpts, seed: number): void {
  const rng = new Rng(seed);
  const { baseY, wallTop, rise } = lotDims(lot);
  const { w, d } = lot;
  const m = T(lot.x, baseY, lot.z, lot.yaw);
  const wallH = wallTop - baseY - PLINTH_H;
  const accent = rng.pick([0x2f5d7c, 0x3b6b45, 0x7a3b30, 0x4a4f6a, 0x7b6a3a]);
  const b = k.b;

  // Plinth (extends below ground to hide slopes) and walls.
  box(b, 'matte', m, 0, -2.5, 0, w + 0.3, 2.5 + PLINTH_H, d + 0.3, 0xa79e8e);
  b.add('matte', boxG(), lot.wall, M(m, T(0, PLINTH_H, 0, 0, w, wallH, d)), { aoY: baseY + PLINTH_H, aoH: 1.6, ao: 0.28 });
  // Corner boards, floor bands, cornice.
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(b, 'paint', m, (cx * w) / 2, PLINTH_H, (cz * d) / 2, 0.32, wallH, 0.32, lot.trim);
  for (let f = 1; f < lot.floors; f++) box(b, 'paint', m, 0, PLINTH_H + f * FLOOR_H - 0.1, 0, w + 0.14, 0.2, d + 0.14, lot.trim);
  box(b, 'paint', m, 0, wallTop - baseY - 0.05, 0, w + 0.36, 0.28, d + 0.36, lot.trim);
  k.col.box(m, 0, (wallTop - baseY) / 2, 0, w / 2 + 0.15, (wallTop - baseY) / 2, d / 2 + 0.15);

  // Faces: local frame where +Z points out of the wall and X runs along it.
  const face = (f: Face, u: number, v: number): THREE.Matrix4 => {
    switch (f) {
      case 'front': return M(m, T(u, v, d / 2, 0));
      case 'back': return M(m, T(-u, v, -d / 2, Math.PI));
      case 'right': return M(m, T(w / 2, v, -u, Math.PI / 2));
      case 'left': return M(m, T(-w / 2, v, u, -Math.PI / 2));
    }
  };
  const faceLen = (f: Face): number => (f === 'front' || f === 'back' ? w : d);

  /** Four frame bars around an opening (x centre cx, bottom y0) so the glass can sit recessed. */
  const frame = (fm: THREE.Matrix4, cx: number, y0: number, ww: number, wh: number, t = 0.11): void => {
    for (const s of [-1, 1]) box(b, 'paint', fm, cx + s * (ww / 2 + t / 2), y0 - t, 0.02, t, wh + 2 * t, 0.16, lot.trim);
    box(b, 'paint', fm, cx, y0 + wh, 0.02, ww + 2 * t, t, 0.16, lot.trim);
    box(b, 'paint', fm, cx, y0 - t, 0.02, ww + 2 * t, t, 0.16, lot.trim);
  };

  const windowAt = (f: Face, u: number, v: number, ww = 1.0, wh = 1.35, shutters = true): void => {
    const fm = face(f, u, v);
    frame(fm, 0, 0, ww, wh);
    const lit = rng.next() < 0.55 ? 0.6 + rng.next() * 0.4 : 0.05;
    b.add('window', boxG(), new THREE.Color(lit, 0, 0), M(fm, T(0, 0, 0, 0, ww, wh, 0.04)));
    box(b, 'paint', fm, 0, 0, 0.03, 0.06, wh, 0.03, lot.trim); // vertical mullion
    box(b, 'paint', fm, 0, wh * 0.55, 0.03, ww, 0.05, 0.03, lot.trim); // transom
    box(b, 'paint', fm, 0, -0.2, 0.08, ww + 0.4, 0.09, 0.26, lot.trim); // sill
    if (shutters) {
      for (const s of [-1, 1]) {
        const sm = M(fm, T((s * (ww + 0.62)) / 2, -0.08, 0.08));
        b.add('paint', rbox(0.44, wh + 0.12, 0.06, 0.02), accent, sm);
        for (let i = 0; i < 4; i++) box(b, 'paint', sm, 0, 0.12 + i * 0.32, 0.03, 0.36, 0.04, 0.03, 0x1a1a1a);
      }
    }
    if (rng.next() < 0.45) {
      box(b, 'paint', fm, 0, -0.42, 0.22, ww + 0.1, 0.24, 0.28, 0x7a5236);
      for (let i = 0; i < 4; i++) {
        const fx = (i / 3 - 0.5) * ww;
        b.add('matte', blobG(seed + i, 1, 0.25), C.leaf, M(fm, T(fx, -0.12, 0.25, i, 0.2, 0.17, 0.16)));
        b.add('paint', sphereG(0), rng.pick([0xf2a0b8, 0xfff0b0, 0xf07050, 0xffffff]), M(fm, T(fx + 0.05, 0.0, 0.36, 0, 0.07, 0.07, 0.07)));
      }
    }
  };

  // Ground floor: shop front or door + windows.
  const groundV = PLINTH_H + 0.95;
  if (lot.awning !== undefined) {
    const fm = face('front', 0, PLINTH_H);
    // Big shop window + door.
    const sw = w * 0.62 - 1.7;
    const sx = -w * 0.12 - 0.6;
    frame(fm, sx, 0.35, sw, 1.9, 0.14);
    b.add('window', boxG(), new THREE.Color(0.9, 0, 0), M(fm, T(sx, 0.35, 0, 0, sw, 1.9, 0.04)));
    box(b, 'paint', fm, sx, 0.35 + 1.25, 0.03, sw, 0.06, 0.03, lot.trim);
    const dx = sx + sw / 2 + 0.75;
    frame(fm, dx, 0.05, 1.0, 2.15);
    b.add('paint', boxG(), 0x5c3a26, M(fm, T(dx, 0.05, -0.01, 0, 1.0, 2.15, 0.06)));
    b.add('window', boxG(), new THREE.Color(0.9, 0, 0), M(fm, T(dx, 1.1, 0.02, 0, 0.6, 0.8, 0.04)));
    // Striped awning (sloped), alternating colour and white.
    const aw = w * 0.82;
    const stripes = Math.round(aw / 0.55);
    for (let i = 0; i < stripes; i++) {
      const sx = -aw / 2 + (i + 0.5) * (aw / stripes);
      b.add('paint', boxG(), i % 2 ? 0xf6f1e6 : lot.awning, M(fm, T(sx, 2.75, 0.75, 0, aw / stripes, 0.05, 1.6, 0.42)));
      b.add('paint', boxG(), i % 2 ? 0xf6f1e6 : lot.awning, M(fm, T(sx, 2.25, 1.47, 0, aw / stripes, 0.3, 0.04)));
    }
    // Sign board.
    b.add('paint', rbox(w * 0.5, 0.55, 0.1, 0.04), accent, M(fm, T(0, 3.05, 0.06)));
    b.add('glow', boxG(), 0xfff3d6, M(fm, T(0, 3.2, 0.12, 0, w * 0.32, 0.22, 0.02)));
  } else {
    const fm = face('front', 0, PLINTH_H);
    frame(fm, 0, 0, 1.15, 2.2, 0.14);
    b.add('paint', boxG(), rng.pick([0x5c3a26, accent, 0x7a2e2e]), M(fm, T(0, 0, -0.01, 0, 1.15, 2.2, 0.06)));
    for (const py of [0.25, 1.2]) box(b, 'paint', fm, 0, py, 0.02, 0.8, 0.7, 0.03, 0x4a2e1e);
    b.add('gloss', sphereG(0), 0xe0b040, M(fm, T(0.4, 1.05, 0.12, 0, 0.05, 0.05, 0.05)));
    b.add('glow', cylG(8), C.bulb, M(fm, T(0.95, 2.1, 0.18, 0, 0.09, 0.25, 0.09)));
    box(b, 'matte', fm, 0, -PLINTH_H, 0.45, 1.9, PLINTH_H, 0.9, 0xbdb4a4); // step
    for (const s of [-1, 1]) if (w > 7) windowAt('front', s * (w / 2 - 1.6), groundV, 1.0, 1.35, true);
  }
  // Upper floors.
  for (let f = 1; f < lot.floors; f++) {
    const v = PLINTH_H + f * FLOOR_H + 0.75;
    const n = Math.max(2, Math.floor(w / 2.6));
    for (let i = 0; i < n; i++) windowAt('front', -w / 2 + (i + 0.5) * (w / n), v);
  }
  // Sides and back.
  for (const f of ['left', 'right', 'back'] as Face[]) {
    const len = faceLen(f);
    const n = Math.max(1, Math.floor(len / 3.4));
    for (let fl = 0; fl < lot.floors; fl++) {
      const v = PLINTH_H + fl * FLOOR_H + 0.95 - (fl > 0 ? 0.2 : 0);
      for (let i = 0; i < n; i++) if (rng.next() < 0.8) windowAt(f, -len / 2 + (i + 0.5) * (len / n), v, 0.9, 1.25, rng.next() < 0.5);
    }
  }

  // Roof.
  const top = wallTop - baseY;
  const roofCol = new THREE.Color(lot.roofColor);
  const tileCol = roofCol.clone().multiplyScalar(0.78).getHex();
  if (lot.roof === 'gable') {
    const e = d / 2 + 0.55;
    const ang = Math.atan2(rise, e);
    const L = Math.hypot(e, rise);
    b.add('matte', prismG(), lot.wall, M(m, T(0, top, 0, 0, w, rise * 0.98, 2 * e * 0.98)));
    for (const s of [1, -1]) {
      const sm = M(m, T(0, top + rise / 2, (s * e) / 2, 0, 1, 1, 1, s * ang));
      b.add('paint', boxG(), lot.roofColor, M(sm, T(0, -0.05, 0, 0, w + 0.9, 0.2, L + 0.1)));
      const rows = Math.floor(L / 0.42);
      for (let i = 0; i < rows; i++) b.add('paint', boxG(), tileCol, M(sm, T(0, 0.14, -L / 2 + (i + 0.6) * (L / rows), 0, w + 0.92, 0.07, 0.09)));
      k.col.box(sm, 0, 0.05, 0, (w + 0.9) / 2, 0.15, L / 2 + 0.05);
    }
    b.add('paint', boxG(), tileCol, M(m, T(0, top + rise - 0.02, 0, 0, w + 1.0, 0.24, 0.42)));
    // Chimney.
    const cx = w * 0.28 * (rng.next() < 0.5 ? -1 : 1);
    box(b, 'matte', m, cx, top + rise * 0.3, -e * 0.35, 0.75, rise * 0.95 + 0.6, 0.75, 0xa4583e);
    box(b, 'matte', m, cx, top + rise * 1.25 + 0.6, -e * 0.35, 0.95, 0.18, 0.95, 0x6e3a2a);
  } else if (lot.roof === 'hip') {
    const pm = M(m, T(0, top - 0.02, 0, 0, w + 1.1, rise, d + 1.1));
    b.add('paint', pyramidG(), lot.roofColor, pm);
    for (let i = 1; i < 6; i++) {
      const s = 1 - i / 6;
      b.add('paint', pyramidG(), tileCol, M(m, T(0, top - 0.02 + rise * (i / 6) - 0.03, 0, 0, (w + 1.16) * s, 0.06, (d + 1.16) * s)));
    }
    b.add('gloss', sphereG(1), 0xd9b34a, M(m, T(0, top + rise + 0.05, 0, 0, 0.22, 0.22, 0.22)));
    const col = new THREE.Mesh(pyramidG(), new THREE.MeshBasicMaterial());
    col.matrixAutoUpdate = false;
    col.matrix.copy(pm);
    col.matrixWorld.copy(pm);
    opts.addMeshCollider(col);
  } else {
    // Flat roof with parapet, a small stair hut and a rooftop garden.
    box(b, 'matte', m, 0, top, 0, w + 0.1, 0.15, d + 0.1, lot.roofColor);
    for (const [px, pz, pw, pd] of [[0, d / 2, w + 0.36, 0.25], [0, -d / 2, w + 0.36, 0.25], [w / 2, 0, 0.25, d], [-w / 2, 0, 0.25, d]]) {
      box(b, 'paint', m, px, top, pz, pw, 0.6, pd, lot.trim);
      k.col.box(m, px, top + 0.3, pz, pw / 2, 0.3, pd / 2);
    }
    box(b, 'matte', m, -w / 2 + 1.6, top + 0.15, -d / 2 + 1.4, 2.4, 2.1, 2.0, lot.wall);
    box(b, 'paint', m, -w / 2 + 1.6, top + 2.25, -d / 2 + 1.4, 2.7, 0.18, 2.3, lot.trim);
    k.col.box(m, -w / 2 + 1.6, top + 1.2, -d / 2 + 1.4, 1.2, 1.05, 1.0);
    for (let i = 0; i < 3; i++) {
      box(b, 'paint', m, w / 2 - 1.2, top + 0.15, -d / 2 + 1.5 + i * 2.2, 1.4, 0.5, 1.2, 0x8a5a36);
      b.add('matte', blobG(seed + 40 + i), C.leaf, M(m, T(w / 2 - 1.2, top + 0.85, -d / 2 + 1.5 + i * 2.2, i, 0.6, 0.45, 0.5)));
    }
  }
}
