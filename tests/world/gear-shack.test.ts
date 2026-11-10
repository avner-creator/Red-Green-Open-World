import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PhysicsApi } from '../../src/types';
import { buildTerrain, sampleHeight } from '../../src/world/terrain';
import { ANCHORS, ROADS, VILLAGE_Y } from '../../src/world/layout';
import { FINGERPOSTS } from '../../src/world/wayfinding';
import { PLAZA } from '../../src/world/village';
import { Batcher } from '../../src/world/batch';
import { Colliders } from '../../src/world/props';
import { buildContent } from '../../src/world/content';
import { buildGearShack, SHACK, shackFootprint } from '../../src/world/gear-shack';

const a = ANCHORS.gearShack;
const sp = ANCHORS.spawn;
/** Local (x, z) of the kiosk frame → world (x, z). +Z local = counter side. */
const toWorld = (lx: number, lz: number): [number, number] => [
  a.x + lx * Math.cos(a.yaw) + lz * Math.sin(a.yaw),
  a.z - lx * Math.sin(a.yaw) + lz * Math.cos(a.yaw),
];

interface Box { c: THREE.Vector3; h: THREE.Vector3; q: THREE.Quaternion }
function recorder(): { physics: PhysicsApi; boxes: Box[]; cyls: { c: THREE.Vector3; hh: number; r: number }[] } {
  const boxes: Box[] = [];
  const cyls: { c: THREE.Vector3; hh: number; r: number }[] = [];
  const physics = {
    addStaticBox: (c: THREE.Vector3, h: THREE.Vector3, q?: THREE.Quaternion) => void boxes.push({ c: c.clone(), h: h.clone(), q: (q ?? new THREE.Quaternion()).clone() }),
    addStaticCylinder: (c: THREE.Vector3, hh: number, r: number) => void cyls.push({ c: c.clone(), hh, r }),
    addStaticSphere: () => undefined,
  } as unknown as PhysicsApi; // only the static-collider methods are used while building
  return { physics, boxes, cyls };
}
function inside(p: THREE.Vector3, boxes: Box[], cyls: { c: THREE.Vector3; hh: number; r: number }[], pad: number): boolean {
  for (const b of boxes) {
    const l = p.clone().sub(b.c).applyQuaternion(b.q.clone().invert());
    if (Math.abs(l.x) < b.h.x + pad && Math.abs(l.y) < b.h.y + pad && Math.abs(l.z) < b.h.z + pad) return true;
  }
  for (const c of cyls) {
    if (Math.hypot(p.x - c.c.x, p.z - c.c.z) < c.r + pad && Math.abs(p.y - c.c.y) < c.hh + pad) return true;
  }
  return false;
}

describe('gear shack', () => {
  const terrain = buildTerrain();
  const h = (x: number, z: number): number => sampleHeight(terrain, x, z);
  // Build the static world once (it is the slow part) and record its colliders.
  const rec = recorder();
  const content = buildContent({ b: new Batcher(), col: new Colliders(rec.physics), h }, terrain, () => undefined);

  it('stands on flat plaza land, a short walk from spawn and clear of the fountain', () => {
    expect(a.onLand).toBe(true);
    expect(Math.abs(h(a.x, a.z) - VILLAGE_Y)).toBeLessThan(0.05);
    const fromPlaza = Math.hypot(a.x - PLAZA.x, a.z - PLAZA.z);
    expect(fromPlaza + a.radius).toBeLessThan(PLAZA.r);
    expect(fromPlaza - a.radius).toBeGreaterThan(4.4); // fountain basin r 4.3
    const fromSpawn = Math.hypot(a.x - sp.x, a.z - sp.z);
    expect(fromSpawn).toBeGreaterThan(8);
    expect(fromSpawn).toBeLessThan(16);
    // The counter faces the plaza centre.
    const toCentre = Math.atan2(PLAZA.x - a.x, PLAZA.z - a.z);
    expect(Math.abs(Math.atan2(Math.sin(toCentre - a.yaw), Math.cos(toCentre - a.yaw)))).toBeLessThan(0.3);
  });

  it('keeps gem and chest spots out of its footprint and standing area', () => {
    const [sx, sz] = toWorld(0, SHACK.standZ);
    for (const s of [...content.gemSpots, ...content.chestSpots]) {
      expect(Math.hypot(s.x - a.x, s.z - a.z)).toBeGreaterThan(a.radius);
      expect(Math.hypot(s.x - sx, s.z - sz)).toBeGreaterThan(1.5);
    }
  });

  it('has a solid stall body and a flat, free standing area in front of the counter', () => {
    const y = h(a.x, a.z);
    // Inside the stall: blocked.
    for (const [lx, lz] of [[0, 0], [1.5, -0.8], [-1.5, 0.8]]) {
      const [x, z] = toWorld(lx, lz);
      expect(inside(new THREE.Vector3(x, y + 1, z), rec.boxes, rec.cyls, 0)).toBe(true);
    }
    // In front of the counter (where the E prompt goes): free for a player-sized capsule, and flat.
    for (let lx = -1.2; lx <= 1.2; lx += 0.4) {
      for (let lz = SHACK.zFront + 0.5; lz <= SHACK.standZ + 1.0; lz += 0.25) {
        const [x, z] = toWorld(lx, lz);
        for (const dy of [0.3, 1.0, 1.7]) expect(inside(new THREE.Vector3(x, h(x, z) + dy, z), rec.boxes, rec.cyls, 0.35)).toBe(false);
        expect(Math.abs(h(x, z) - y)).toBeLessThan(0.05);
      }
    }
  });

  it('fits the triangle budget', () => {
    const b = new Batcher();
    buildGearShack({ b, col: new Colliders(recorder().physics), h });
    expect(b.triangles).toBeLessThan(6200);
  });

  it('stays out of the walking lines from spawn to the roads, the fingerpost and the park route (≥ 2.5 m)', () => {
    const segDist = (px: number, pz: number, s: readonly number[]): number => {
      const [ax, az, bx, bz] = s;
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(px - ax - t * dx, pz - az - t * dz);
    };
    const segs: { name: string; s: number[] }[] = [];
    // The e2e island walk from spawn to the trampoline.
    const route = [[sp.x, sp.z], [10, -4], [14, -8], [28, -14], [42, -18]];
    for (let i = 0; i < route.length - 1; i++) segs.push({ name: `route ${i}`, s: [...route[i], ...route[i + 1]] });
    // Every road that starts at the plaza: spawn → its entrance, and its first leg.
    for (const r of ROADS) {
      const [p0, p1] = r.points;
      if (Math.hypot(p0[0] - PLAZA.x, p0[1] - PLAZA.z) > PLAZA.r) continue;
      segs.push({ name: `spawn→${r.id}`, s: [sp.x, sp.z, p0[0], p0[1]] }, { name: `${r.id} leg`, s: [p0[0], p0[1], p1[0], p1[1]] });
    }
    for (const f of FINGERPOSTS) if (Math.hypot(f.x - PLAZA.x, f.z - PLAZA.z) < PLAZA.r) segs.push({ name: 'spawn→fingerpost', s: [sp.x, sp.z, f.x, f.z] });
    expect(segs.length).toBeGreaterThanOrEqual(10);
    const fp = shackFootprint(a.x, a.z, a.yaw);
    const samples: [number, number, number][] = fp.circles.map(([x, z, r]) => [x, z, r]);
    for (let i = 0; i < 4; i++) {
      const [p, q] = [fp.poly[i], fp.poly[(i + 1) % 4]];
      for (let k = 0; k <= 40; k++) samples.push([p[0] + ((q[0] - p[0]) * k) / 40, p[1] + ((q[1] - p[1]) * k) / 40, 0]);
    }
    const bad: string[] = [];
    for (const { name, s } of segs) {
      const d = Math.min(...samples.map(([x, z, r]) => segDist(x, z, s) - r));
      if (d < 2.5) bad.push(`${name}: ${d.toFixed(2)} m`);
    }
    expect(bad).toEqual([]);
  });
});
