import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PhysicsApi } from '../../src/types';
import { buildTerrain, sampleHeight } from '../../src/world/terrain';
import { Batcher } from '../../src/world/batch';
import { Colliders, type Kit } from '../../src/world/props';
import { buildContent } from '../../src/world/content';
import { ANCHORS } from '../../src/world/layout';
import { FINGERPOSTS, GLASSES_WAY } from '../../src/world/wayfinding';

/** Clear space every chest needs all round (its lock symbol and the camera need room). */
const CLEAR = 3;

describe('chest spots', () => {
  it(`have ≥ ${CLEAR} m clear all round from posts, beacons, boards, benches, lamps and attraction sites`, () => {
    // Small static colliders (benches, lamps, bins, stakes): footprint ≤ 1.5 m half extent.
    const small: { name: string; x: number; z: number; r: number }[] = [];
    const fake = {
      addStaticBox: (c: THREE.Vector3, hh: THREE.Vector3) => {
        // Bounding circle of the box footprint (its rotation does not matter for that).
        const r = Math.hypot(hh.x, hh.z);
        if (Math.max(hh.x, hh.z) <= 1.5 && hh.y > 0.2) small.push({ name: `box ${c.x.toFixed(1)},${c.z.toFixed(1)}`, x: c.x, z: c.z, r });
      },
      addStaticCylinder: (c: THREE.Vector3, hh: number, r: number) => {
        if (r <= 1.5 && hh > 0.2) small.push({ name: `cyl ${c.x.toFixed(1)},${c.z.toFixed(1)}`, x: c.x, z: c.z, r });
      },
      addStaticSphere: () => undefined,
    } as unknown as PhysicsApi; // only the static-collider methods are used while building
    const terrain = buildTerrain();
    const h = (x: number, z: number): number => sampleHeight(terrain, x, z);
    const kit: Kit = { b: new Batcher(), col: new Colliders(fake), h };
    const content = buildContent(kit, terrain, () => undefined);

    const obstacles: { name: string; x: number; z: number; r: number }[] = [
      ...small,
      // Fingerposts: the arms reach out ~2.9 m (plaza) / ~2.1 m (junction), 2.2 m+ up.
      ...FINGERPOSTS.map((p) => ({ name: `post ${p.x},${p.z}`, x: p.x, z: p.z, r: (p.rows ? 2.9 : 2.5) * p.scale })),
      ...content.wayfinding.placed.filter((p) => p.kind !== 'post').map((p) => ({ name: `${p.kind} ${p.name}`, x: p.x, z: p.z, r: Math.max(p.r, p.hw ?? 0) })),
      ...Object.entries(ANCHORS)
        .filter(([n]) => n !== 'spawn')
        .map(([n, a]) => ({ name: `site ${n}`, x: a.x, z: a.z, r: a.radius })),
      ...GLASSES_WAY.map((g) => ({ name: `site ${g.id}`, x: g.x, z: g.z, r: g.r })),
    ];
    expect(small.length).toBeGreaterThan(50);
    const bad: string[] = [];
    content.chestSpots.forEach((s, i) => {
      for (const o of obstacles) {
        const gap = Math.hypot(o.x - s.x, o.z - s.z) - o.r;
        if (gap < CLEAR) bad.push(`chest ${i} (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) → ${o.name}: ${gap.toFixed(2)} m`);
      }
    });
    expect(bad).toEqual([]);
  });
});
