import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PhysicsApi } from '../../src/types';
import { buildTerrain, sampleHeight } from '../../src/world/terrain';
import { Batcher } from '../../src/world/batch';
import { Colliders, type Kit } from '../../src/world/props';
import { buildContent } from '../../src/world/content';
import { buildScatter } from '../../src/world/scatter';
import { createMaterials } from '../../src/world/materials';

type Shape =
  | { kind: 'box'; c: THREE.Vector3; h: THREE.Vector3; q: THREE.Quaternion }
  | { kind: 'cyl'; c: THREE.Vector3; hh: number; r: number }
  | { kind: 'sphere'; c: THREE.Vector3; r: number };

/** Signed distance from p to a collider (negative inside). */
function dist(s: Shape, p: THREE.Vector3): number {
  if (s.kind === 'sphere') return p.distanceTo(s.c) - s.r;
  if (s.kind === 'cyl') {
    const rad = Math.hypot(p.x - s.c.x, p.z - s.c.z) - s.r;
    const ver = Math.abs(p.y - s.c.y) - s.hh;
    if (rad < 0 && ver < 0) return Math.max(rad, ver);
    return Math.hypot(Math.max(rad, 0), Math.max(ver, 0));
  }
  const l = p.clone().sub(s.c).applyQuaternion(s.q.clone().invert());
  const d = new THREE.Vector3(Math.abs(l.x) - s.h.x, Math.abs(l.y) - s.h.y, Math.abs(l.z) - s.h.z);
  if (d.x < 0 && d.y < 0 && d.z < 0) return Math.max(d.x, d.y, d.z);
  return new THREE.Vector3(Math.max(d.x, 0), Math.max(d.y, 0), Math.max(d.z, 0)).length();
}

describe('gem and chest spots', () => {
  it('are clear of every static collider the world creates (≥ 0.8 m)', () => {
    const shapes: Shape[] = [];
    const fake = {
      addStaticBox: (c: THREE.Vector3, h: THREE.Vector3, q?: THREE.Quaternion) => void shapes.push({ kind: 'box', c: c.clone(), h: h.clone(), q: (q ?? new THREE.Quaternion()).clone() }),
      addStaticCylinder: (c: THREE.Vector3, hh: number, r: number) => void shapes.push({ kind: 'cyl', c: c.clone(), hh, r }),
      addStaticSphere: (c: THREE.Vector3, r: number) => void shapes.push({ kind: 'sphere', c: c.clone(), r }),
    } as unknown as PhysicsApi; // only the static-collider methods are used while building
    const terrain = buildTerrain();
    const h = (x: number, z: number): number => sampleHeight(terrain, x, z);
    const kit: Kit = { b: new Batcher(), col: new Colliders(fake), h };
    const content = buildContent(kit, terrain, (m) => {
      // Mesh colliders (pitched roofs): use their world bounding box.
      m.geometry.computeBoundingBox();
      const bb = (m.geometry.boundingBox as THREE.Box3).clone().applyMatrix4(m.matrixWorld);
      shapes.push({ kind: 'box', c: bb.getCenter(new THREE.Vector3()), h: bb.getSize(new THREE.Vector3()).multiplyScalar(0.5), q: new THREE.Quaternion() });
    });
    buildScatter(terrain, createMaterials(), kit.col, content.trees, content.keepouts, (_x, _z, out) => out.setRGB(0.3, 0.5, 0.2));
    expect(shapes.length).toBeGreaterThan(500);
    const bad: string[] = [];
    const spots = [
      ...content.gemSpots.map((s, i) => ({ name: `gem ${i} (${s.tag})`, p: new THREE.Vector3(s.x, s.y, s.z) })),
      // A chest's spot is its base on the ground: test a point half a metre up.
      ...content.chestSpots.map((s, i) => ({ name: `chest ${i}`, p: new THREE.Vector3(s.x, s.y + 0.5, s.z) })),
    ];
    for (const { name, p } of spots) {
      let worst = Infinity;
      for (const s of shapes) worst = Math.min(worst, dist(s, p));
      if (worst < 0.8) bad.push(`${name} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}): ${worst.toFixed(2)} m`);
    }
    expect(bad).toEqual([]);
  });
});
