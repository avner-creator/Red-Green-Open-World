/**
 * The floating lake platform, the Silly Zone play disc and the launch-pad mat. The bridge, ranch,
 * lighthouse, lake/beach and the Silly Zone's surroundings are dressed in `outer/`.
 */
import * as THREE from 'three';
import { M, T } from './batch';
import { box, type Kit } from './props';
import { boxG, cylG, flagG, rbox, sphereG, torusG } from './shapes';
import { ANCHORS } from './layout';
import type { Keepout, ManualTree } from './scatter';

export interface AreaResult {
  trees: ManualTree[];
  keepouts: Keepout[];
}

// ───────────────────────────── Lake platform ─────────────────────────────

function lakePlatform(k: Kit): void {
  const a = ANCHORS.lakePlatform;
  const top = a.y ?? 0.75;
  const b = k.b;
  const m = T(a.x, 0, a.z, a.yaw);
  box(b, 'paint', m, 0, top - 0.42, 0, 7, 0.36, 7, 0x5e4634);
  for (let i = 0; i < 12; i++) box(b, 'paint', m, 0, top - 0.07, -3.3 + i * 0.6, 6.9, 0.07, 0.54, [0xa67c56, 0x9b7350, 0x936d4b][i % 3]);
  for (const s of [-1, 1]) b.add('paint', cylG(16), 0xe6e1d6, M(m, T(s * 2.6, 0.05, -3.4, 0, 0.45, 6.8, 0.45, Math.PI / 2)));
  for (const [cx, cz] of [[-3.3, -3.3], [3.3, -3.3], [-3.3, 3.3], [3.3, 3.3]]) box(b, 'paint', m, cx, top - 0.1, cz, 0.22, 1.2, 0.22, 0x6a4630);
  for (const [x0, z0, x1, z1] of [[-3.3, -3.3, 3.3, -3.3], [3.3, -3.3, 3.3, 3.3], [-3.3, -3.3, -3.3, 3.3]]) {
    box(b, 'paint', m, (x0 + x1) / 2, top + 0.9, (z0 + z1) / 2, Math.abs(x1 - x0) + 0.1, 0.08, Math.abs(z1 - z0) + 0.1, 0xefe7d6);
  }
  // Ladder on the open side, life ring, flag.
  for (const s of [-0.4, 0.4]) box(b, 'metal', m, s, -1.2, 3.55, 0.06, top + 1.9, 0.06, 0xd0d0d0);
  for (let i = 0; i < 4; i++) box(b, 'metal', m, 0, -0.6 + i * 0.45, 3.55, 0.8, 0.05, 0.05, 0xd0d0d0);
  b.add('paint', torusG(0.12, 24), 0xf4efe6, M(m, T(-3.42, top + 0.45, 0, Math.PI / 2, 0.45, 0.45, 0.45, Math.PI / 2)));
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    box(b, 'paint', m, -3.45, top + 0.42 + Math.sin(ang) * 0.45, Math.cos(ang) * 0.45, 0.1, 0.14, 0.14, 0xc8433a);
  }
  const fm = M(m, T(2.8, top, -2.8));
  b.add('metal', cylG(8), 0xe8e6e0, M(fm, T(0, 0, 0, 0, 0.06, 4, 0.06)));
  b.add('cloth', flagG(), 0xf2c14e, M(fm, T(0.05, 3.9, 0, 0.4, 1.3, 0.8, 1)));
  k.col.box(m, 0, top - 0.3, 0, 3.5, 0.3, 3.5);
  for (const [x0, z0, x1, z1] of [[-3.3, -3.3, 3.3, -3.3], [3.3, -3.3, 3.3, 3.3], [-3.3, -3.3, -3.3, 3.3]]) {
    k.col.box(m, (x0 + x1) / 2, top + 0.5, (z0 + z1) / 2, Math.abs(x1 - x0) / 2 + 0.1, 0.5, Math.abs(z1 - z0) / 2 + 0.1);
  }
}

// ───────────────────────────── Silly Zone & launch pads ─────────────────────────────

function sillyZone(k: Kit): Keepout[] {
  const a = ANCHORS.sillyZone;
  const y = k.h(a.x, a.z) + 0.05;
  const r = 18;
  const sectors = 24;
  for (let s = 0; s < sectors; s++) {
    const g = new THREE.RingGeometry(2.4, r, 3, 1, (s / sectors) * Math.PI * 2, (Math.PI * 2) / sectors).rotateX(-Math.PI / 2);
    k.b.add('rubber', g, s % 2 ? 0xeee2c6 : 0x5b3f7c, T(a.x, y, a.z));
    g.dispose();
  }
  const c = new THREE.CircleGeometry(2.4, 24).rotateX(-Math.PI / 2);
  k.b.add('rubber', c, 0xf2c14e, T(a.x, y, a.z));
  c.dispose();
  k.b.add('rubber', torusG(0.35, 128, Math.PI * 2, r + 0.3), 0xf2c14e, T(a.x, y + 0.1, a.z));
  // Inflatable bollards around the edge.
  const cols = [0xd85a8c, 0x2f8fb0, 0xf2c14e, 0x8ac04a];
  for (let i = 0; i < 10; i++) {
    // The south-east one (≈ 17, 80) stood on the buggy race's lap: leave that gap open.
    if (i === 8) continue;
    const ang = (i / 10) * Math.PI * 2 + 0.15;
    const bx = a.x + Math.cos(ang) * (r + 2);
    const bz = a.z + Math.sin(ang) * (r + 2);
    const by = k.h(bx, bz);
    const col = cols[i % cols.length];
    k.b.add('gloss', cylG(16), col, T(bx, by, bz, 0, 0.55, 1.3, 0.55), { aoY: by, aoH: 0.4, ao: 0.3 });
    k.b.add('gloss', sphereG(2), col, T(bx, by + 1.3, bz, 0, 0.55, 0.55, 0.55));
    k.b.add('gloss', torusG(0.12, 20), 0xf4efe6, T(bx, by + 0.7, bz, 0, 0.56, 1, 0.56));
    k.col.cyl(bx, by, bz, 0.9, 0.55);
  }
  // Launch pads: slate mat with bright chevrons pointing along the anchor yaw.
  const l = ANCHORS.launchPads;
  const ly = k.h(l.x, l.z) + 0.05;
  const lm = T(l.x, ly, l.z, l.yaw);
  k.b.add('rubber', rbox(18, 0.06, 18, 0.03), 0x48586a, lm);
  for (let row = -1; row <= 1; row++) {
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        k.b.add('paint', boxG(), 0xf4efe6, M(lm, T(row * 5 + s * 0.9, 0.04, -4 + i * 3.2 + 0.6, s * 0.75, 0.45, 0.03, 2.6)));
      }
    }
  }
  return [{ x: a.x, z: a.z, r: r + 3.5, paved: true }, { x: l.x, z: l.z, hx: 9.5, hz: 9.5, paved: true }];
}

export function buildAreas(k: Kit): AreaResult {
  const keepouts: Keepout[] = [];
  lakePlatform(k);
  keepouts.push(...sillyZone(k));
  return { trees: [], keepouts };
}
