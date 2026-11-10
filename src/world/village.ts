/** Starter Village: fountain plaza (spawn), main street with houses, sidewalks and street furniture. */
import * as THREE from 'three';
import { M, T } from './batch';
import { C, bench, bunting, lamp, planter, signpost, type Kit } from './props';
import { cylG, coneG, discG, sphereG, torusG, rbox, blobG, flagG } from './shapes';
import { house, type HouseOpts } from './house';
import { LOTS } from './village-data';
import { ANCHORS, VILLAGE_Y } from './layout';
import type { ManualTree } from './scatter';

export const PLAZA = { x: 0, z: -2, r: 21 } as const;

const dir = (fx: number, fz: number, tx: number, tz: number): number => Math.atan2(tx - fx, tz - fz);

/** Flat paving made of concentric coloured rings (paving material adds the stone pattern). */
function ringBand(k: Kit, x: number, z: number, y: number, r0: number, r1: number, color: number, seg = 64): void {
  const g = r0 > 0 ? new THREE.RingGeometry(r0, r1, seg, 1) : new THREE.CircleGeometry(r1, seg);
  g.rotateX(-Math.PI / 2);
  k.b.add('paving', g, color, T(x, y, z));
  g.dispose();
}

function fountain(k: Kit): void {
  const { x, z } = PLAZA;
  const y = VILLAGE_Y;
  const b = k.b;
  // Basin: outer wall + rim + water.
  b.add('matte', cylG(40), 0xd6ccb8, T(x, y, z, 0, 4.3, 0.5, 4.3), { aoY: y, aoH: 0.5, ao: 0.3 });
  b.add('paint', torusG(0.26, 64, Math.PI * 2, 4.2), 0xe9e1cf, T(x, y + 0.62, z));
  b.add('gloss', discG(40), 0x4f9fae, T(x, y + 0.5, z, 0, 4.05, 0.07, 4.05));
  // Ripple rings (bright) on the water.
  for (const r of [2.7, 3.3]) b.add('gloss', torusG(0.04, 48, Math.PI * 2, r), 0xcfeff2, T(x, y + 0.57, z, 0, 1, 0.3, 1));
  // Pedestal, lower bowl, column, upper bowl, finial.
  b.add('matte', cylG(16, 0.8), 0xd6ccb8, T(x, y + 0.5, z, 0, 0.75, 1.3, 0.75));
  b.add('paint', cylG(32, 1), 0xe9e1cf, T(x, y + 1.8, z, 0, 2.0, 0.22, 2.0));
  b.add('paint', coneG(32), 0xd6ccb8, T(x, y + 2.02, z, 0, 2.0, -0.55, 2.0));
  b.add('gloss', discG(32), 0x5aaab8, T(x, y + 1.98, z, 0, 1.82, 0.06, 1.82));
  b.add('matte', cylG(12, 0.7), 0xd6ccb8, T(x, y + 2.0, z, 0, 0.32, 1.1, 0.32));
  b.add('paint', cylG(24), 0xe9e1cf, T(x, y + 3.05, z, 0, 0.85, 0.16, 0.85));
  b.add('gloss', sphereG(2), 0xe0b84a, T(x, y + 3.45, z, 0, 0.32, 0.32, 0.32));
  // Falling water streams from the lower bowl.
  // A thin curtain of water falling from the lower bowl.
  b.add('gloss', cylG(40, 1.95 / 2.25, true), 0xc4ebf0, T(x, y + 0.57, z, 0, 2.25, 1.23, 2.25));
  k.col.cyl(x, y, z, 0.42, 4.4);
  k.col.cyl(x, y, z, 1.6, 0.9);
  k.col.cyl(x, y + 1.8, z, 0.14, 2.0);
}

export function buildVillage(k: Kit, opts: HouseOpts): ManualTree[] {
  const trees: ManualTree[] = [];
  const y = VILLAGE_Y;
  const { x: px, z: pz, r: pr } = PLAZA;

  // ── Plaza paving ──
  ringBand(k, px, pz, y + 0.07, 0, 5.2, 0xc9bfae);
  ringBand(k, px, pz, y + 0.07, 5.2, 6.0, 0xa39a8b);
  ringBand(k, px, pz, y + 0.07, 6.0, 12.5, 0xd9cfbd);
  ringBand(k, px, pz, y + 0.07, 12.5, 13.3, 0xaba293);
  ringBand(k, px, pz, y + 0.07, 13.3, pr, 0xd2c8b5);
  // Curb ring.
  k.b.add('matte', torusG(0.18, 128, Math.PI * 2, pr), 0x9d9485, T(px, y + 0.02, pz));
  // Radial dark stone spokes (a compass rose) in the inner ring.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const g = new THREE.PlaneGeometry(0.5, 6.4).rotateX(-Math.PI / 2);
    k.b.add('paving', g, 0xaba293, T(px + Math.cos(a) * 9.25, y + 0.075, pz + Math.sin(a) * 9.25, -a + Math.PI / 2));
    g.dispose();
  }
  fountain(k);

  // ── Main street: sidewalks + curbs on both sides ──
  for (const s of [-1, 1]) {
    const cx = s * 6;
    k.b.add('paving', rbox(4, 0.18, 40, 0.04), 0xddd4c2, T(cx, y, -38.5));
    k.b.add('matte', rbox(0.3, 0.22, 40, 0.05), 0xa39a8b, T(s * 4.1, y, -38.5));
    k.col.box(T(cx, y, -38.5), 0, 0.09, 0, 2, 0.09, 20);
  }
  // Street lamps and planters along the street.
  for (let i = 0; i < 4; i++) {
    const zz = -22 - i * 11.5;
    lamp(k, -4.6, zz, Math.PI / 2);
    lamp(k, 4.6, zz - 5.5, -Math.PI / 2);
  }
  planter(k, -6.4, -31.5, 2.6, 0.9, 0, 3);
  planter(k, 6.4, -42.5, 2.6, 0.9, 0, 4);
  planter(k, -6.4, -54, 2.6, 0.9, 0, 5);
  bench(k, 6.6, -30.5, -Math.PI / 2);
  bench(k, -6.6, -43, Math.PI / 2);

  // Café tables with umbrellas in front of the bakery and the café.
  const umbrella = (x: number, z: number, color: number): void => {
    const yy = k.h(x, z);
    k.b.add('metal', cylG(12), C.iron, T(x, yy, z, 0, 0.35, 0.05, 0.35));
    k.b.add('metal', cylG(6), C.iron, T(x, yy, z, 0, 0.04, 2.3, 0.04));
    k.b.add('paint', cylG(16), 0xf3eee4, T(x, yy + 0.72, z, 0, 0.45, 0.04, 0.45));
    k.b.add('paint', coneG(16), color, T(x, yy + 1.98, z, 0, 1.25, 0.5, 1.25));
    k.b.add('paint', cylG(16, 1, true), 0xf6f1e6, T(x, yy + 1.86, z, 0, 1.25, 0.14, 1.25));
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + 0.4;
      k.b.add('metal', cylG(8), C.iron, T(x + Math.cos(a) * 0.8, yy, z + Math.sin(a) * 0.8, 0, 0.2, 0.45, 0.2));
    }
    k.col.cyl(x, yy, z, 0.4, 0.5);
  };
  umbrella(-6.2, -24, 0xc83c3c);
  umbrella(-12, 14, 0xe0a030);
  umbrella(-15.5, 11.5, 0x2f7fa8);

  // ── Houses ──
  LOTS.forEach((lot, i) => house(k, lot, opts, 100 + i * 17));

  // ── Plaza furniture ──
  const benchAngles = [-132, -50, -2, 70, 114, -168];
  for (const a of benchAngles) {
    // (angles avoid the five road entrances: −90, −23, 40, 90, 150 degrees)
    const r = THREE.MathUtils.degToRad(a);
    const bx = px + Math.cos(r) * 15.2;
    const bz = pz + Math.sin(r) * 15.2;
    bench(k, bx, bz, dir(bx, bz, px, pz));
  }
  // (−5° and 60° gave way to Scoops' light poles and the Carnival Island post; −152° moved to
  // −145° to clear the Foam Lava gate.)
  for (const a of [-145, -110, -70, 124, 174]) {
    const r = THREE.MathUtils.degToRad(a);
    lamp(k, px + Math.cos(r) * 17.5, pz + Math.sin(r) * 17.5);
  }
  // Big round planters with plaza trees.
  for (const a of [-122, -58, 110, 160]) {
    const r = THREE.MathUtils.degToRad(a);
    const tx = px + Math.cos(r) * 19.5;
    const tz = pz + Math.sin(r) * 19.5;
    k.b.add('matte', cylG(24), 0xcfc5b2, T(tx, y, tz, 0, 1.6, 0.6, 1.6), { aoY: y, aoH: 0.4, ao: 0.3 });
    k.b.add('matte', cylG(24), C.soil, T(tx, y + 0.55, tz, 0, 1.45, 0.08, 1.45));
    k.col.cyl(tx, y, tz, 0.3, 1.6);
    trees.push({ x: tx, z: tz, y: y + 0.6, kind: 'oak', scale: 0.85 });
  }
  // Flower beds around the inner ring.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    const fx = px + Math.cos(a) * 5.6;
    const fz = pz + Math.sin(a) * 5.6;
    k.b.add('matte', blobG(500 + i, 1, 0.2), i % 2 ? 0x5e9a3a : 0x4c8a32, T(fx, y + 0.18, fz, a, 0.45, 0.32, 0.45));
    k.b.add('paint', sphereG(0), [0xfff0b0, 0xf2a0b8, 0xffffff, 0xf07a50][i % 4], T(fx, y + 0.5, fz, 0, 0.09, 0.09, 0.09));
  }

  // Signposts with icons (no text): one by the plaza's west side, one at the street end.
  const sp = ANCHORS;
  // (The big fingerpost at the spawn is built by wayfinding.ts.)
  signpost(k, -11, 6, [
    { yaw: dir(-11, 6, sp.ranch.x, sp.ranch.z), icon: 'horse', color: 0x7a5232 },
    { yaw: dir(-11, 6, sp.sillyZone.x, sp.sillyZone.z), icon: 'star', color: 0x6a3f7c },
    { yaw: dir(-11, 6, 0, -100), icon: 'bridge', color: 0x2f5d7c },
  ]);
  signpost(k, 6.8, -58, [
    { yaw: dir(6.8, -58, 0, -106), icon: 'bridge', color: 0x2f5d7c },
    { yaw: dir(6.8, -58, sp.lighthouse.x, sp.lighthouse.z), icon: 'lighthouse', color: 0x7a3b30 },
  ]);

  // Banner flags on the town hall.
  for (const s of [-1, 1]) {
    const m = T(-20.2, y + 5.2, -4 + s * 3.2, Math.PI / 2);
    k.b.add('metal', cylG(6), C.iron, M(m, T(0, 0, 0, 0, 0.04, 0.04, 1.4, Math.PI / 2)));
    k.b.add('cloth', flagG(), s > 0 ? 0x2f5d7c : 0xb8433a, M(m, T(0, 0, 1.2, -Math.PI / 2, 1.2, 0.9, 1, 0, 0)));
  }
  // Festive bunting strung across the main street between the facades.
  const flags = [0xc8433a, 0xf4efe6, 0x2f5d7c, 0xf2c14e, 0x3b6b45, 0xf4efe6];
  for (const [zl, zr] of [[-23, -27], [-36, -33], [-47, -51]]) {
    bunting(k.b, new THREE.Vector3(-8.7, y + 5.4, zl), new THREE.Vector3(8.7, y + 5.4, zr), flags, 0.9);
  }
  // Planters at the street corners.
  planter(k, -9, -15.5, 3, 1.1, 0, 7);
  planter(k, 9, -15.5, 3, 1.1, 0, 8);
  // Trees on the ridge slope that closes the view at the end of the street.
  trees.push(
    { x: -14, z: -70, kind: 'oak', scale: 1.1 },
    { x: 2, z: -69, kind: 'oak', scale: 0.95 },
    { x: -5, z: -75, kind: 'pine', scale: 1.05 },
    { x: 10, z: -73, kind: 'pine', scale: 1.1 },
    { x: -24, z: -76, kind: 'pine' },
  );
  return trees;
}
