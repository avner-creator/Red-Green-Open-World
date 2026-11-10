import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Anchor, AnchorName, PhysicsApi } from '../../src/types';
import { ECONOMY } from '../../src/config';
import { computeMegaSpots } from '../../src/activities/economy/megaSpots';
import { kioskPromptPosition } from '../../src/activities/economy/kiosk';
import { ANCHORS } from '../../src/world/layout';
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

const terrain = buildTerrain();
const heightAt = (x: number, z: number): number => sampleHeight(terrain, x, z);
const anchors = {} as Record<AnchorName, Anchor>;
for (const [name, a] of Object.entries(ANCHORS) as [AnchorName, (typeof ANCHORS)[AnchorName]][]) {
  anchors[name] = { position: new THREE.Vector3(a.x, a.y ?? heightAt(a.x, a.z), a.z), yaw: a.yaw, radius: a.radius };
}

describe('mega gem spots', () => {
  const spots = computeMegaSpots(anchors, heightAt);

  it('there are 8 to 14, in every themed group', () => {
    expect(spots.length).toBeGreaterThanOrEqual(8);
    expect(spots.length).toBeLessThanOrEqual(14);
    for (const tag of ['trampoline', 'pads', 'launch', 'road', 'skydive']) {
      expect(spots.some((s) => s.tag === tag), tag).toBe(true);
    }
  });

  it('follow the anchors (nothing hard-coded): moving the world moves the gems', () => {
    const moved = {} as Record<AnchorName, Anchor>;
    for (const k of Object.keys(anchors) as AnchorName[]) {
      moved[k] = { ...anchors[k], position: anchors[k].position.clone().add(new THREE.Vector3(5, 0, 7)) };
    }
    const b = computeMegaSpots(moved, (x, z) => heightAt(x - 5, z - 7));
    spots.forEach((s, i) => {
      expect(b[i].x - s.x).toBeCloseTo(5, 5);
      expect(b[i].z - s.z).toBeCloseTo(7, 5);
      expect(b[i].y).toBeCloseTo(s.y, 5);
    });
  });

  it('are above the terrain and on the island', () => {
    for (const s of spots) {
      expect(s.y - heightAt(s.x, s.z), `${s.tag} (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`).toBeGreaterThan(1.2);
      expect(heightAt(s.x, s.z)).toBeGreaterThan(0);
    }
  });

  it('are clear of every static world collider (>= 0.8 m) like the normal gems', () => {
    const shapes: Shape[] = [];
    const fake = {
      addStaticBox: (c: THREE.Vector3, h: THREE.Vector3, q?: THREE.Quaternion) => void shapes.push({ kind: 'box', c: c.clone(), h: h.clone(), q: (q ?? new THREE.Quaternion()).clone() }),
      addStaticCylinder: (c: THREE.Vector3, hh: number, r: number) => void shapes.push({ kind: 'cyl', c: c.clone(), hh, r }),
      addStaticSphere: (c: THREE.Vector3, r: number) => void shapes.push({ kind: 'sphere', c: c.clone(), r }),
    } as unknown as PhysicsApi;
    const kit: Kit = { b: new Batcher(), col: new Colliders(fake), h: heightAt };
    const content = buildContent(kit, terrain, (m) => {
      m.geometry.computeBoundingBox();
      const bb = (m.geometry.boundingBox as THREE.Box3).clone().applyMatrix4(m.matrixWorld);
      shapes.push({ kind: 'box', c: bb.getCenter(new THREE.Vector3()), h: bb.getSize(new THREE.Vector3()).multiplyScalar(0.5), q: new THREE.Quaternion() });
    });
    buildScatter(terrain, createMaterials(), kit.col, content.trees, content.keepouts, (_x, _z, out) => out.setRGB(0.3, 0.5, 0.2));
    const bad: string[] = [];
    for (const s of spots) {
      const p = new THREE.Vector3(s.x, s.y, s.z);
      let worst = Infinity;
      for (const sh of shapes) worst = Math.min(worst, dist(sh, p));
      if (worst < 0.8) bad.push(`${s.tag} at (${s.x.toFixed(1)}, ${s.y.toFixed(1)}, ${s.z.toFixed(1)}): ${worst.toFixed(2)} m`);
    }
    expect(bad).toEqual([]);
  });
});

describe('kiosk prompt', () => {
  it('floats on the +Z (counter) side of the anchor at about chest height', () => {
    const a = anchors.gearShack;
    const p = kioskPromptPosition(a);
    const front = new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    const off = new THREE.Vector3(p.x - a.position.x, 0, p.z - a.position.z);
    expect(off.dot(front)).toBeGreaterThan(0.5);
    expect(off.clone().sub(front.clone().multiplyScalar(off.dot(front))).length()).toBeLessThan(1e-6);
    expect(p.y - a.position.y).toBeGreaterThan(0.9);
    expect(p.y - a.position.y).toBeLessThan(1.5);
  });
});

describe('mega gem value', () => {
  it('is worth five normal gems', () => {
    expect(ECONOMY.megaGemValue).toBe(5 * ECONOMY.gemValue);
  });
});
