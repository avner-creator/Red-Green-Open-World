/**
 * The core areas next to the village, dressed to the plaza's standard: the garage workshop with its
 * forecourt, the balloon launch field and the landing meadow. Each keeps its anchor circle clear
 * (the buggy, the balloon and the rings are built by other systems on those anchors).
 */
import * as THREE from 'three';
import { M, T } from './batch';
import { C, barrel, bench, box, bunting, crate, cone, fence, flagpole, hayBale, icon, lamp, planter, type Kit } from './props';
import { boxG, blobG, cylG, rbox, sphereG, torusG } from './shapes';
import { ANCHORS, ROADS } from './layout';
import type { Keepout, ManualTree } from './scatter';

export interface CoreAreas {
  trees: ManualTree[];
  keepouts: Keepout[];
}

/**
 * A flat decal that hugs the terrain: a disc (or ring) in polar cells, coloured per vertex by `paint`.
 * Uses the road material (polygon offset, receives shadows, casts none).
 */
export function groundDisc(k: Kit, x: number, z: number, r0: number, r1: number, lift: number, paint: (x: number, z: number) => number, rings = 10, seg = 72): void {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    const r = r0 + ((r1 - r0) * i) / rings;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      pos.push(px, k.h(px, pz) + lift, pz);
      c.set(paint(px, pz));
      col.push(c.r, c.g, c.b);
      if (i > 0 && j > 0) {
        const a1 = i * (seg + 1) + j;
        const a0 = a1 - 1;
        const b1 = a1 - (seg + 1);
        const b0 = b1 - 1;
        idx.push(b0, a0, b1, b1, a0, a1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(seg + 2) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  k.b.add('road', g, 0xffffff);
  g.dispose();
}

/** Mower stripes (light/dark bands across `yaw`), the classic tidy-field look. */
function mown(cx: number, cz: number, yaw: number, width: number, light: number, dark: number): (x: number, z: number) => number {
  const ux = Math.cos(yaw);
  const uz = Math.sin(yaw);
  return (x, z) => (Math.floor(((x - cx) * ux + (z - cz) * uz) / width) % 2 === 0 ? light : dark);
}

/** Small sandbag pile. */
function sandbags(k: Kit, x: number, z: number, n: number, yaw = 0): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  for (let i = 0; i < n; i++) {
    const row = i < 3 ? 0 : 1;
    const px = (row === 0 ? i - 1 : i - 3.5) * 0.62;
    k.b.add('matte', sphereG(1), 0xc2a878, M(m, T(px, 0.17 + row * 0.27, 0, i * 0.7, 0.34, 0.18, 0.24)), { aoY: y, aoH: 0.3 });
  }
}

/** A shrub row on a little kerbed bed (verge planting). */
export function shrubBed(k: Kit, x: number, z: number, len: number, yaw: number, seed: number, flowers = true): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  k.b.add('matte', rbox(len, 0.22, 1.1, 0.05), C.stone, M(m, T(0, -0.05, 0)), { aoY: y, aoH: 0.25, ao: 0.25 });
  box(k.b, 'matte', m, 0, 0.15, 0, len - 0.2, 0.04, 0.9, C.soil);
  const n = Math.max(2, Math.round(len / 0.85));
  for (let i = 0; i < n; i++) {
    const px = -len / 2 + (i + 0.5) * (len / n);
    const s = 0.42 + ((i * 29 + seed * 7) % 5) * 0.05;
    k.b.add('matte', blobG(seed * 7 + i, 1, 0.22), i % 3 ? C.leaf : C.leafDark, M(m, T(px, 0.4, ((i % 2) - 0.5) * 0.15, i, s, s * 0.8, s * 0.9)), { aoY: y + 0.15, aoH: 0.5, ao: 0.4 });
    if (flowers && i % 2 === 1) {
      for (let f = 0; f < 3; f++) {
        k.b.add('paint', sphereG(0), [0xfff2c8, 0xf0a8c0, 0xf2c14e][(i + f) % 3], M(m, T(px + (f - 1) * 0.16, 0.72 + (f % 2) * 0.06, (f - 1) * 0.12, 0, 0.065, 0.065, 0.065)));
      }
    }
  }
}

// ───────────────────────────── Garage workshop ─────────────────────────────

function garage(k: Kit): CoreAreas {
  const a = ANCHORS.garage;
  const y = k.h(a.x, a.z);
  const b = k.b;
  // Forecourt: concrete apron with darker tarmac bays, kerb edge and bay lines.
  b.add('rubber', rbox(26, 0.06, 16, 0.02), 0x6a6d72, T(a.x, y + 0.02, a.z + 1.5));
  b.add('rubber', rbox(19, 0.07, 4, 0.02), 0x9a978f, T(a.x, y + 0.02, a.z + 7.5));
  for (const [sx, len, zz] of [[-1, 16, 0], [1, 16, 0]] as const) b.add('matte', rbox(0.3, 0.2, len, 0.05), 0xb9b2a4, T(a.x + sx * 13, y, a.z + 1.5 + zz));
  for (const lx of [-9, -3, 3, 9]) b.add('paint', boxG(), 0xf1eee6, T(a.x + lx, y + 0.09, a.z + 1.5, 0, 0.18, 0.02, 7));
  b.add('paint', boxG(), 0xf1eee6, T(a.x, y + 0.09, a.z - 2.2, 0, 18.2, 0.02, 0.18));
  // Yellow hatch in front of each bay door.
  for (const bx of [-4.2, 4.2]) {
    for (let i = 0; i < 6; i++) b.add('paint', boxG(), 0xf2c14e, T(a.x + bx - 2.5 + i * 1.0, y + 0.1, a.z + 6.4, 0.6, 0.22, 0.02, 1.6));
  }

  const w = 18;
  const d = 9;
  const h = 5.2;
  const gx = a.x;
  const gz = a.z + 12.5;
  const m = T(gx, y, gz, Math.PI); // front (+Z local) faces the forecourt (−Z world)
  const wall = 0xebe3d3;
  const slate = 0x55626f;
  const red = 0xb8433a;
  box(b, 'matte', m, 0, -1.5, 0, w + 0.6, 1.65, d + 0.6, 0xa8a49c);
  box(b, 'rubber', m, 0, 0.1, 0, w, 0.05, d, 0x5d6066);
  // Lift markings on the bay floors.
  for (const bx of [-4.2, 4.2]) {
    for (const s of [-1, 1]) box(b, 'paint', m, bx + s * 1.3, 0.16, 0.2, 0.16, 0.01, 5, 0xf2c14e);
  }
  // Shell: back and side walls with a slate wainscot and a red band.
  b.add('matte', boxG(), wall, M(m, T(0, 0, -d / 2, 0, w, h, 0.3)), { aoY: y, aoH: 1.2, ao: 0.25 });
  for (const s of [-1, 1]) b.add('matte', boxG(), wall, M(m, T((s * w) / 2, 0, 0, 0, 0.3, h, d)), { aoY: y, aoH: 1.2, ao: 0.25 });
  box(b, 'paint', m, 0, 0, -d / 2 - 0.02, w + 0.36, 1.1, 0.32, slate);
  for (const s of [-1, 1]) box(b, 'paint', m, (s * w) / 2, 0, 0, 0.36, 1.1, d + 0.36, slate);
  box(b, 'paint', m, 0, h - 1.0, -d / 2 - 0.03, w + 0.38, 0.35, 0.32, red);
  for (const s of [-1, 1]) box(b, 'paint', m, (s * w) / 2, h - 1.0, 0, 0.38, 0.35, d + 0.38, red);
  // Side windows.
  for (const s of [-1, 1]) {
    for (const t of [-2, 2]) {
      const wm = M(m, T(s * (w / 2 + 0.16), 1.9, t, (s * Math.PI) / 2));
      b.add('paint', rbox(1.6, 1.3, 0.12, 0.03), 0xf4f1ea, M(wm, T(0, -0.08, 0)));
      b.add('window', boxG(), new THREE.Color(0.7, 0, 0), M(wm, T(0, 0, 0.05, 0, 1.36, 1.1, 0.05)));
    }
  }
  // Front: slate piers, red sign fascia, roller doors rolled up into drums (open bays).
  for (const px of [-w / 2 + 0.6, 0, w / 2 - 0.6]) b.add('paint', rbox(1.2, h, 0.5, 0.05), slate, M(m, T(px, 0, d / 2 - 0.15)));
  box(b, 'paint', m, 0, 3.9, d / 2 - 0.15, w, h - 3.9, 0.42, red);
  box(b, 'paint', m, 0, 3.85, d / 2 + 0.07, w, 0.1, 0.06, 0xf4f1ea);
  box(b, 'paint', m, 0, h - 0.06, d / 2 + 0.07, w, 0.1, 0.06, 0xf4f1ea);
  for (const px of [-w / 4, w / 4]) {
    b.add('metal', cylG(14), 0xb5bcc2, M(m, T(px - (w / 2 - 1.3) / 2, 3.62, d / 2 - 0.55, 0, 0.26, w / 2 - 1.3, 0.26, 0, -Math.PI / 2)));
    box(b, 'paint', m, px, 3.35, d / 2 - 0.42, w / 2 - 1.3, 0.12, 0.1, 0xc9ced3);
  }
  // Flat roof with parapet and trim.
  const rm = M(m, T(0, h, 0));
  box(b, 'paint', rm, 0, 0, 0, w + 0.6, 0.25, d + 0.6, 0x56606b);
  for (const [px, pz, pw, pd] of [[0, d / 2 + 0.2, w + 0.7, 0.3], [0, -d / 2 - 0.2, w + 0.7, 0.3], [w / 2 + 0.2, 0, 0.3, d + 0.7], [-w / 2 - 0.2, 0, 0.3, d + 0.7]]) {
    box(b, 'paint', rm, px, 0, pz, pw, 0.55, pd, 0xf4f1ea);
  }
  // Roof sign: a big car + wrench icon board on a frame (reads from the plaza road).
  const sm = M(m, T(0, h + 0.5, d / 2 - 1.2));
  for (const sx of [-1.6, 1.6]) box(b, 'metal', sm, sx, 0, 0, 0.12, 0.7, 0.12, C.iron);
  b.add('paint', rbox(4.6, 1.6, 0.18, 0.08), 0xf4f1ea, M(sm, T(0, 0.6, 0)));
  b.add('paint', rbox(4.3, 1.35, 0.06, 0.06), 0x2f3b52, M(sm, T(0, 0.72, 0.08)));
  icon(b, M(sm, T(-0.85, 1.4, 0.08, 0, 1.7, 1.7, 1)), 'car', 0xf4f1ea);
  icon(b, M(sm, T(1.2, 1.4, 0.08, 0, 1.6, 1.6, 1)), 'wrench', 0xf2c14e);
  // Fascia: white badge with the car icon over each bay.
  for (const px of [-w / 4, w / 4]) {
    const fm = M(m, T(px, 4.0, d / 2 + 0.1));
    b.add('paint', rbox(2.0, 0.9, 0.1, 0.06), 0xf4f1ea, fm);
    icon(b, M(fm, T(0, 0.45, 0.05, 0, 1.2, 1.2, 1)), px < 0 ? 'car' : 'wrench', 0x2f3b52);
  }

  // ── Interior ──
  // Left bay: two-post lift.
  for (const s of [-1, 1]) {
    box(b, 'paint', m, -w / 4 + s * 2.1, 0.12, -0.8, 0.35, 3.3, 0.35, 0xf2c14e);
    box(b, 'metal', m, -w / 4 + s * 1.3, 0.55, -0.8, 1.5, 0.1, 0.25, 0x3a3f45);
    box(b, 'metal', m, -w / 4 + s * 1.3, 0.55, 0.6, 1.5, 0.1, 0.25, 0x3a3f45);
  }
  box(b, 'paint', m, -w / 4, 3.3, -0.8, 4.6, 0.25, 0.3, 0xf2c14e);
  // Back wall: pegboard with tools, red tool chest, workbench with vise, tyre rack.
  const back = -d / 2 + 0.2;
  b.add('paint', rbox(5, 1.8, 0.06, 0.02), 0xd9cdb6, M(m, T(w / 4, 1.3, back)));
  for (let i = 0; i < 9; i++) {
    const tx = w / 4 - 2.1 + i * 0.52;
    box(b, 'metal', m, tx, 1.55 + (i % 3) * 0.32, back + 0.05, 0.08, 0.5 - (i % 2) * 0.15, 0.04, i % 3 === 0 ? 0xb8433a : 0x3a3f45);
  }
  box(b, 'paint', m, w / 4, 0.12, back + 0.45, 4.6, 0.85, 0.8, 0x6a4630);
  box(b, 'paint', m, w / 4, 0.95, back + 0.45, 4.8, 0.08, 0.9, 0x9b6b43);
  box(b, 'metal', m, w / 4 + 1.6, 1.03, back + 0.5, 0.3, 0.22, 0.25, 0x2f5d7c);
  // Red roll cabinet with drawer lines.
  const cab = M(m, T(w / 2 - 1.2, 0.12, -1.6, -Math.PI / 2));
  b.add('gloss', rbox(1.5, 1.1, 0.6, 0.04), 0xc8433a, cab);
  for (let i = 0; i < 4; i++) box(b, 'metal', cab, 0, 0.2 + i * 0.24, 0.31, 1.2, 0.03, 0.02, 0xd0d0d0);
  // Tyre rack against the left wall.
  const rack = M(m, T(-w / 2 + 0.7, 0.12, -1.0, Math.PI / 2));
  for (const sx of [-1.4, 1.4]) box(b, 'metal', rack, sx, 0, 0, 0.08, 2.2, 0.5, C.iron);
  for (const ry of [0.55, 1.6]) {
    box(b, 'metal', rack, 0, ry - 0.08, 0, 2.9, 0.06, 0.5, C.iron);
    for (let i = 0; i < 4; i++) b.add('rubber', torusG(0.16, 12, Math.PI * 2, 0.28, 5), 0x2a2a2c, M(rack, T(-1.05 + i * 0.7, ry + 0.38, 0, 0, 1, 1, 1, Math.PI / 2)));
  }
  // Ceiling lights (bright strips).
  for (const px of [-w / 4, w / 4]) b.add('glow', boxG(), C.bulb, M(m, T(px, h - 0.45, 0, 0, 2.8, 0.08, 0.3)));

  // Colliders.
  k.col.box(m, 0, h / 2, -d / 2, w / 2, h / 2, 0.2);
  for (const s of [-1, 1]) k.col.box(m, (s * w) / 2, h / 2, 0, 0.2, h / 2, d / 2);
  for (const px of [-w / 2 + 0.6, 0, w / 2 - 0.6]) k.col.box(m, px, h / 2, d / 2 - 0.15, 0.6, h / 2, 0.2);
  k.col.box(m, 0, (h + 3.9) / 2 - 0.3, d / 2 - 0.15, w / 2, (h - 3.9) / 2 + 0.3, 0.3);
  k.col.box(rm, 0, 0.15, 0, (w + 0.6) / 2, 0.2, (d + 0.6) / 2);
  k.col.box(m, w / 4, 0.55, back + 0.45, 2.4, 0.5, 0.45);
  k.col.box(m, w / 2 - 1.2, 0.6, -1.6, 0.3, 0.6, 0.75);
  k.col.box(m, -w / 2 + 0.7, 1.1, -1.0, 0.3, 1.1, 1.5);
  for (const s of [-1, 1]) k.col.box(m, -w / 4 + s * 2.1, 1.7, -0.8, 0.2, 1.6, 0.2);

  // ── Office annex on the east side (world −X of the building) with a door and awning ──
  const om = M(m, T(w / 2 + 2.3, 0, 0.8));
  box(b, 'matte', om, 0, -1, 0, 4.4, 1.15, 6.8, 0xa8a49c);
  b.add('matte', boxG(), 0xf2e6cf, M(om, T(0, 0, 0, 0, 4.0, 3.4, 6.4)), { aoY: y, aoH: 1, ao: 0.25 });
  box(b, 'paint', om, 0, 0, 0, 4.15, 0.9, 6.55, slate);
  box(b, 'paint', om, 0, 3.4, 0, 4.4, 0.3, 6.8, 0xf4f1ea);
  // Big shop window and door on its front (+Z local).
  b.add('paint', rbox(2.4, 1.6, 0.12, 0.03), 0xf4f1ea, M(om, T(-0.5, 1.0, 3.22)));
  b.add('window', boxG(), new THREE.Color(0.9, 0, 0), M(om, T(-0.5, 1.08, 3.28, 0, 2.2, 1.4, 0.04)));
  b.add('paint', rbox(1.0, 2.2, 0.12, 0.03), 0x2f5d7c, M(om, T(1.3, 0, 3.22)));
  b.add('gloss', sphereG(0), 0xd9b34a, M(om, T(0.95, 1.05, 3.32, 0, 0.05, 0.05, 0.05)));
  for (let i = 0; i < 7; i++) {
    b.add('cloth', boxG(), i % 2 ? 0xf4efe6 : red, M(om, T(-1.8 + i * 0.6, 2.75, 3.6, 0, 0.6, 0.06, 1.0, 0.35)));
  }
  k.col.box(om, 0, 1.75, 0, 2.0, 1.75, 3.2);

  // ── Forecourt props (all outside the anchor circle) ──
  const tyres = (x: number, z: number, n: number): void => {
    const ty = k.h(x, z);
    for (let i = 0; i < n; i++) b.add('rubber', torusG(0.42, 12, Math.PI * 2, 1, 5), 0x2a2a2c, T(x, ty + 0.2 + i * 0.36, z, i, 0.55, 1.4, 0.55));
    b.add('metal', cylG(12), 0x8e959c, T(x, ty + 0.06, z, 0, 0.3, n * 0.36 + 0.2, 0.3));
    k.col.cyl(x, ty, z, n * 0.18 + 0.1, 0.75);
  };
  tyres(a.x - 11.5, a.z + 7, 4);
  tyres(a.x - 11.8, a.z + 5.2, 2);
  tyres(a.x - 10.2, a.z + 6.2, 3);
  barrel(k, a.x + 11.4, a.z + 7.4, 0x2f5d7c);
  barrel(k, a.x + 12.2, a.z + 6.6, 0xb8433a);
  barrel(k, a.x + 11.1, a.z + 6.3, 0x3b6b45);
  crate(k, a.x + 11.8, a.z + 4.6, 0.9, 0.3);
  crate(k, a.x + 11.8, a.z + 4.6, 0.6, 0.9, y + 0.9);
  // Air pump post with a coiled hose.
  const px = a.x + 8.8;
  const pz = a.z + 8.6;
  const py = k.h(px, pz);
  b.add('gloss', rbox(0.55, 1.5, 0.4, 0.06), 0x2f5d7c, T(px, py, pz, Math.PI), { aoY: py, aoH: 0.4 });
  b.add('paint', rbox(0.44, 0.44, 0.06, 0.04), 0xf4f1ea, T(px, py + 0.85, pz - 0.2, Math.PI));
  b.add('rubber', torusG(0.035, 16, Math.PI * 2, 0.22), 0x1e1e20, T(px + 0.3, py + 0.75, pz, 0, 1, 1, 1, 0, Math.PI / 2));
  k.col.box(T(px, py, pz), 0, 0.75, 0, 0.3, 0.75, 0.22);
  for (const [cx, cz] of [[-9.6, -4.6], [-10.4, -3.8], [9.8, -4.4]]) cone(b, a.x + cx, k.h(a.x + cx, a.z + cz) + 0.02, a.z + cz);
  // (The lamp at the forecourt's road corner went: the race cuts across the grass there.)
  lamp(k, a.x + 12.5, a.z + 1.5);
  lamp(k, a.x - 13.6, a.z + 6.5);
  // Planters along the building front between the piers' outer ends.
  planter(k, a.x - 12.5, a.z + 1.2, 2.4, 0.9, Math.PI / 2, 11);
  planter(k, a.x + 12.5, a.z + 1.2, 2.4, 0.9, Math.PI / 2, 12);
  bench(k, a.x + 16.4, a.z + 10.8, Math.PI);
  // Pylon sign by the road: tall pole with a double-sided icon box.
  // (Set back from the east road: the race line runs along that verge.)
  const sx = a.x - 15.5;
  const sz = a.z - 3;
  const sy = k.h(sx, sz);
  b.add('metal', cylG(10), slate, T(sx, sy, sz, 0, 0.14, 4.4, 0.14));
  b.add('matte', cylG(10), C.stoneDark, T(sx, sy, sz, 0, 0.35, 0.3, 0.35));
  const pm = T(sx, sy + 4.2, sz, Math.PI / 2 - 0.3);
  b.add('paint', rbox(2.2, 1.5, 0.35, 0.08), red, pm);
  b.add('paint', rbox(1.9, 1.2, 0.38, 0.06), 0xf4f1ea, M(pm, T(0, 0.15, 0)));
  for (const f of [1, -1]) icon(b, M(pm, T(0, 0.75, f * 0.15, f > 0 ? 0 : Math.PI, 1.5, 1.5, 1)), 'car', 0x2f3b52);
  k.col.cyl(sx, sy, sz, 2.2, 0.2);
  // Low hedges framing the forecourt sides.
  shrubBed(k, a.x - 15.6, a.z + 3, 7, Math.PI / 2, 21);
  shrubBed(k, a.x + 15.6, a.z + 2, 6, Math.PI / 2, 22);

  const trees: ManualTree[] = [
    { x: a.x - 16, z: a.z + 15, kind: 'oak' },
    { x: a.x + 17, z: a.z + 17, kind: 'oak', scale: 0.9 },
    { x: a.x + 20, z: a.z + 6, kind: 'bush', scale: 1.2 },
    { x: a.x - 19, z: a.z + 9, kind: 'bush', scale: 1.1 },
    { x: a.x - 18.5, z: a.z - 4, kind: 'rock', scale: 0.7 },
  ];
  const keepouts: Keepout[] = [
    { x: gx, z: gz, hx: w / 2 + 6, hz: d / 2 + 1.5 },
    { x: a.x, z: a.z + 1.5, hx: 13.5, hz: 8.5, paved: true },
  ];
  return { trees, keepouts };
}

// ───────────────────────────── Balloon launch field ─────────────────────────────

/** Distance from (x, z) to the nearest road edge (raw road polylines; negative = on the road). */
function roadEdge(x: number, z: number): number {
  let best = Infinity;
  for (const r of ROADS) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, az] = r.points[i];
      const [bx, bz] = r.points[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - r.width / 2);
    }
  }
  return best;
}

function balloonField(k: Kit): CoreAreas {
  const a = ANCHORS.balloon;
  const y = k.h(a.x, a.z);
  const b = k.b;
  // Mown launch circle with a darker edge band, then painted markings.
  groundDisc(k, a.x, a.z, 0, 15.5, 0.05, mown(a.x, a.z, 0.5, 2.2, 0x88b64c, 0x5a8a34), 12, 80);
  groundDisc(k, a.x, a.z, 15.5, 16.3, 0.05, () => 0xb59a72, 1, 80);
  const white = (): number => 0xf3efe4;
  groundDisc(k, a.x, a.z, 9.0, 9.7, 0.09, white, 1, 80);
  groundDisc(k, a.x, a.z, 2.2, 2.8, 0.09, white, 1, 40);
  // Radial ticks and a yellow centre cross.
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const r = i % 3 === 0 ? 11.4 : 10.6;
    const len = i % 3 === 0 ? 2.6 : 1.0;
    const g = new THREE.PlaneGeometry(0.35, len).rotateX(-Math.PI / 2);
    b.add('road', g, 0xf3efe4, T(a.x + Math.cos(ang) * r, y + 0.1, a.z + Math.sin(ang) * r, -ang + Math.PI / 2));
    g.dispose();
  }
  for (const r of [0, Math.PI / 2]) {
    const g = new THREE.PlaneGeometry(0.4, 3.2).rotateX(-Math.PI / 2);
    b.add('road', g, 0xf2c14e, T(a.x, y + 0.1, a.z, r + Math.PI / 4));
    g.dispose();
  }
  // Flag poles around the circle with bunting strung between neighbours.
  const cols = [0xc8433a, 0xf2c14e, 0x2f5d7c, 0xf4efe6, 0x3b6b45];
  const poles: (THREE.Vector3 | null)[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + 0.25;
    const px = a.x + Math.cos(ang) * 17.2;
    const pz = a.z + Math.sin(ang) * 17.2;
    // The loop and east roads skirt the field: no pole on or next to them (race line, cars).
    if (roadEdge(px, pz) < 1.5) {
      poles.push(null);
      continue;
    }
    flagpole(k, px, pz, 6.6, cols[i % cols.length], 1.3);
    poles.push(new THREE.Vector3(px, k.h(px, pz) + 6.1, pz));
  }
  for (let i = 0; i < n; i++) {
    const p = poles[i];
    const q = poles[(i + 1) % n];
    // Skip the span across the entrance (the one facing the road) and spans over a road.
    if (i === 5 || !p || !q) continue;
    bunting(b, p, q, [0xc8433a, 0xf4efe6, 0x2f5d7c, 0xf2c14e], 0.8);
  }
  // Windsock on a striped mast.
  const wx = a.x + 19.5;
  const wz = a.z + 7;
  const wy = k.h(wx, wz);
  for (let i = 0; i < 6; i++) b.add('paint', cylG(10), i % 2 ? 0xf4efe6 : 0xc8433a, T(wx, wy + i * 1.1, wz, 0, 0.09, 1.1, 0.09));
  b.add('matte', cylG(10), C.stoneDark, T(wx, wy, wz, 0, 0.35, 0.3, 0.35));
  b.add('metal', torusG(0.04, 16, Math.PI * 2, 0.45), C.iron, T(wx, wy + 6.4, wz, 0, 1, 1, 1, Math.PI / 2 - 0.9));
  for (let i = 0; i < 4; i++) {
    b.add('cloth', cylG(12, 0.82, true), i % 2 ? 0xf4efe6 : 0xf07a28, M(T(wx, wy + 6.4, wz, -0.9), T(0, 0, 0.05 + i * 0.5, 0, 0.42 * (1 - i * 0.12), 0.5, 0.42 * (1 - i * 0.12), Math.PI / 2 - 0.2)));
  }
  k.col.cyl(wx, wy, wz, 3.4, 0.12);

  // Kiosk: striped awning, counter hatch, balloon icon on the roof (no text).
  // West of the loop road (it used to stand on it), its hatch facing the road and the field.
  const hx = a.x - 27;
  const hz = a.z + 2.5;
  const hy = k.h(hx, hz);
  const hm = T(hx, hy, hz, Math.PI / 2 + 0.25);
  box(b, 'matte', hm, 0, -0.6, 0, 3.6, 0.7, 2.9, 0xa8a49c);
  b.add('paint', rbox(3.2, 2.5, 2.6, 0.06), 0xf2e6cf, hm, { aoY: hy, aoH: 0.6 });
  box(b, 'paint', hm, 0, 0, 0, 3.24, 0.7, 2.64, 0x2f5d7c);
  box(b, 'paint', hm, 0, 1.15, 1.31, 2.2, 0.95, 0.02, 0x30251e);
  box(b, 'paint', hm, 0, 1.05, 1.42, 2.5, 0.1, 0.35, 0x9b6b43);
  for (let i = 0; i < 6; i++) b.add('cloth', boxG(), i % 2 ? 0xf4efe6 : 0xc8433a, M(hm, T(-1.4 + i * 0.56, 2.25, 1.65, 0, 0.56, 0.05, 1.0, 0.4)));
  box(b, 'paint', hm, 0, 2.5, 0, 3.5, 0.18, 2.9, 0xf4efe6);
  // Roof icon board.
  const im = M(hm, T(0, 2.68, 0));
  b.add('paint', rbox(1.4, 1.2, 0.12, 0.06), 0x2f5d7c, im);
  for (const f of [1, -1]) icon(b, M(im, T(0, 0.6, f * 0.06, f > 0 ? 0 : Math.PI, 1.3, 1.3, 1)), 'balloon');
  k.col.box(hm, 0, 1.3, 0, 1.6, 1.3, 1.35);
  // Burner gas bottles in a cage, sandbags, crates, a picnic table.
  const gm = T(hx - 1.2, k.h(hx - 1.2, hz - 4.2), hz - 4.2, 0.4);
  for (let i = 0; i < 4; i++) b.add('gloss', cylG(12), 0xd8d8d8, M(gm, T(-0.6 + i * 0.4, 0, 0, 0, 0.17, 1.1, 0.17)));
  for (let i = 0; i < 4; i++) b.add('gloss', sphereG(1), 0xd8d8d8, M(gm, T(-0.6 + i * 0.4, 1.1, 0, 0, 0.17, 0.12, 0.17)));
  for (const sx of [-0.85, 0.85]) box(b, 'metal', gm, sx, 0, 0, 0.06, 1.3, 0.6, 0x3b6b45);
  box(b, 'metal', gm, 0, 1.25, 0, 1.76, 0.06, 0.6, 0x3b6b45);
  k.col.box(gm, 0, 0.65, 0, 0.9, 0.65, 0.3);
  sandbags(k, hx - 0.8, hz + 3.6, 5, 0.3);
  sandbags(k, a.x + 13, a.z - 15, 5, -0.8);
  crate(k, hx - 3.0, hz + 1.6, 1.0, 0.4);
  crate(k, hx - 3.4, hz + 2.8, 0.8, 0.9);
  crate(k, hx - 3.1, hz + 2.1, 0.6, 0.2, k.h(hx - 3.0, hz + 1.6) + 1.0);
  barrel(k, a.x + 17, a.z - 11, 0x2f5d7c);
  bench(k, a.x - 6, a.z + 20.5, Math.PI);
  bench(k, a.x + 4, a.z + 21, Math.PI);
  // Bench and lamp off the loop road (they stood on its edge), on its far verge facing the field.
  bench(k, a.x - 23.2, a.z - 6.5, Math.PI / 2);
  shrubBed(k, a.x - 1, a.z + 22.6, 7, 0, 31);
  lamp(k, a.x - 23.2, a.z - 9.2);
  lamp(k, a.x + 14.5, a.z - 14.5);

  const trees: ManualTree[] = [
    { x: a.x - 25, z: a.z - 4, kind: 'oak', scale: 1.1 },
    { x: a.x - 24, z: a.z + 16, kind: 'oak', scale: 0.95 },
    { x: a.x + 24, z: a.z + 18, kind: 'oak', scale: 1.05 },
    { x: a.x + 10, z: a.z + 25, kind: 'pine', scale: 1.1 },
    { x: a.x - 22, z: a.z + 21, kind: 'bush', scale: 1.2 },
    { x: a.x + 22, z: a.z - 6, kind: 'bush', scale: 1.1 },
  ];
  return {
    trees,
    keepouts: [{ x: a.x, z: a.z, r: 16.5, mown: true }, { x: a.x, z: a.z, r: 15 }, { x: hx - 1.5, z: hz, r: 5.5 }, { x: a.x - 23.2, z: a.z - 7.8, r: 2.5 }],
  };
}

// ───────────────────────────── Landing meadow ─────────────────────────────

function landingField(k: Kit): CoreAreas {
  const a = ANCHORS.landingRings;
  const b = k.b;
  // Mown landing target in the middle (flat paint only; the rings are built above it by others).
  groundDisc(k, a.x, a.z, 0, 21, 0.05, mown(a.x, a.z, -0.3, 2.6, 0x86b44a, 0x5c8e36), 12, 80);
  const white = (): number => 0xf3efe4;
  for (const [r0, r1] of [[19.4, 20.1], [12.4, 13.0], [6.0, 6.6]]) groundDisc(k, a.x, a.z, r0, r1, 0.09, white, 1, 72);
  groundDisc(k, a.x, a.z, 0, 1.6, 0.09, () => 0xc8433a, 2, 32);
  // Low post-and-rail fence ring with two openings (west towards the road, east to the beach).
  const R = 26;
  const ring = (a0: number, a1: number): [number, number][] => {
    const pts: [number, number][] = [];
    const steps = Math.ceil(((a1 - a0) * R) / 4);
    for (let i = 0; i <= steps; i++) {
      const ang = a0 + ((a1 - a0) * i) / steps;
      pts.push([a.x + Math.cos(ang) * R, a.z + Math.sin(ang) * R]);
    }
    return pts;
  };
  const rail = { post: 0xd9cdb6, rail: 0xefe7d6, height: 0.9 };
  fence(k, ring(Math.PI + 0.32, Math.PI * 2 - 0.25), rail);
  fence(k, ring(0.25, Math.PI - 0.32), rail);
  // Flags at the openings and round bales scattered just outside the target.
  for (const ang of [Math.PI + 0.42, Math.PI - 0.42, 0.35, -0.35]) {
    flagpole(k, a.x + Math.cos(ang) * (R - 1.2), a.z + Math.sin(ang) * (R - 1.2), 4.6, ang > 0 && ang < 1 ? 0xf2c14e : 0xc8433a, 1.2);
  }
  const bales: [number, number, number][] = [
    [0.9, 23, 0.3], [1.15, 23.2, 1.4], [2.3, 22.8, 0.9], [3.9, 23, 2.1], [4.15, 22.6, 0.4], [5.3, 23.1, 1.7], [-0.7, 23.4, 0.6],
  ];
  for (const [ang, r, yaw] of bales) hayBale(k, a.x + Math.cos(ang) * r, a.z + Math.sin(ang) * r, yaw);
  // Square bales stacked by the west opening.
  const sbx = a.x - 22;
  const sbz = a.z + 9;
  for (let i = 0; i < 5; i++) {
    const row = i < 3 ? 0 : 1;
    const ox = (row === 0 ? i - 1 : i - 3.5) * 1.15;
    const by = k.h(sbx, sbz) + row * 0.55;
    const bm = T(sbx + ox * Math.cos(0.4), by, sbz + ox * Math.sin(0.4), -0.4);
    b.add('matte', rbox(1.1, 0.55, 0.6, 0.05), 0xe0c070, bm, { aoY: k.h(sbx, sbz), aoH: 0.5 });
    for (const t of [-0.25, 0.25]) box(b, 'paint', bm, t, 0, 0, 0.03, 0.56, 0.62, 0xb08a3a);
  }
  k.col.box(T(sbx, k.h(sbx, sbz), sbz, -0.4), 0, 0.55, 0, 1.75, 0.55, 0.35);
  bench(k, a.x - 30, a.z - 6, -Math.PI / 2);
  bench(k, a.x - 30, a.z + 3, -Math.PI / 2);
  const trees: ManualTree[] = [
    { x: a.x - 31, z: a.z - 16, kind: 'oak', scale: 1.15 },
    { x: a.x - 32, z: a.z + 16, kind: 'oak' },
    { x: a.x + 6, z: a.z - 31, kind: 'pine', scale: 1.1 },
  ];
  return { trees, keepouts: [{ x: a.x, z: a.z, r: 21.5, mown: true }, { x: a.x, z: a.z, r: R + 1.5 }] };
}

export function buildCoreAreas(k: Kit): CoreAreas {
  const out: CoreAreas = { trees: [], keepouts: [] };
  for (const r of [garage(k), balloonField(k), landingField(k)]) {
    out.trees.push(...r.trees);
    out.keepouts.push(...r.keepouts);
  }
  return out;
}

