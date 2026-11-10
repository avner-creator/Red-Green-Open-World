import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { AnchorName, PhysicsApi } from '../../src/types';
import { buildTerrain, sampleHeight, type TerrainData } from '../../src/world/terrain';
import { Batcher } from '../../src/world/batch';
import { Colliders, type Kit } from '../../src/world/props';
import { ANCHORS, BRIDGE, DECK_Y } from '../../src/world/layout';
import { buildOuterAreas, type OuterAreas } from '../../src/world/outer';
import { PADDOCK } from '../../src/world/outer/ranch';
import { LH } from '../../src/world/outer/lighthouse';
import { PIER } from '../../src/world/outer/lake';
import { roadEdgeDistance } from '../../src/world/wayfinding';

interface Shape {
  c: THREE.Vector3;
  /** Horizontal footprint radius (bounding). */
  r: number;
  /** Half height. */
  hh: number;
  thin: boolean;
}

let t: TerrainData;
let outer: OuterAreas;
const shapes: Shape[] = [];
const h = (x: number, z: number): number => sampleHeight(t, x, z);

beforeAll(() => {
  t = buildTerrain();
  const fake = {
    addStaticBox: (c: THREE.Vector3, he: THREE.Vector3) =>
      void shapes.push({ c: c.clone(), r: Math.hypot(he.x, he.z), hh: he.y, thin: Math.min(he.x, he.z) < 0.2 }),
    addStaticCylinder: (c: THREE.Vector3, hh: number, r: number) => void shapes.push({ c: c.clone(), r, hh, thin: false }),
    addStaticSphere: (c: THREE.Vector3, r: number) => void shapes.push({ c: c.clone(), r, hh: r, thin: false }),
  } as unknown as PhysicsApi; // only the static-collider methods are used while building
  const kit: Kit = { b: new Batcher(), col: new Colliders(fake), h };
  outer = buildOuterAreas(kit, t.roads);
});

const onBridge = (x: number, z: number): boolean => Math.abs(x - BRIDGE.x) < 9 && z < BRIDGE.z0 + 4 && z > BRIDGE.z1 - 4;
const onPier = (x: number, z: number): boolean => x > PIER.x - PIER.head / 2 - 3 && x < PIER.x + PIER.head / 2 + 3 && z < PIER.z0 + 1 && z > PIER.z1 - 4;

describe('outer areas', () => {
  it('keep the clear radius of every activity anchor empty (ranch: only the old paddock fence)', () => {
    const bad: string[] = [];
    const names: AnchorName[] = ['ranch', 'bungee', 'bungeeLanding', 'sillyZone', 'lakePlatform', 'balloon', 'landingRings', 'garage', 'trampoline', 'bouncePads', 'launchPads', 'spawn'];
    for (const n of names) {
      const a = ANCHORS[n];
      const ay = a.y ?? h(a.x, a.z);
      for (const s of shapes) {
        const d = Math.hypot(s.c.x - a.x, s.c.z - a.z) - s.r;
        if (d >= a.radius) continue;
        // Only things that stand in the anchor's space count (not a bridge deck far above/below).
        if (Math.abs(s.c.y - ay) > s.hh + 4) continue;
        if (n === 'ranch') {
          const lx = Math.abs(s.c.x - a.x);
          const lz = Math.abs(s.c.z - a.z);
          if (s.thin && (Math.abs(lz - PADDOCK.hz) < 0.3 || Math.abs(lx - PADDOCK.hx) < 0.3)) continue;
        }
        if (n === 'bungee' && onBridge(s.c.x, s.c.z)) continue;
        bad.push(`${n}: collider at (${s.c.x.toFixed(1)}, ${s.c.y.toFixed(1)}, ${s.c.z.toFixed(1)}) r ${s.r.toFixed(2)} is ${d.toFixed(2)} m from the centre`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('put nothing solid on a road (except the bridge itself)', () => {
    const bad: string[] = [];
    for (const s of shapes) {
      if (onBridge(s.c.x, s.c.z)) continue;
      // The lighthouse path ends at the plinth (it leads you there).
      if (Math.hypot(s.c.x - ANCHORS.lighthouse.x, s.c.z - ANCHORS.lighthouse.z) < LH.plinthR + 0.1) continue;
      const g = h(s.c.x, s.c.z);
      if (s.c.y - s.hh > g + 2.5) continue; // overhead (arch beams, roofs)
      const e = roadEdgeDistance(t.roads, s.c.x, s.c.z) + 0.05 - s.r;
      if (e < 0) bad.push(`collider at (${s.c.x.toFixed(1)}, ${s.c.z.toFixed(1)}) r ${s.r.toFixed(2)} is ${(-e).toFixed(2)} m onto a road`);
    }
    expect(bad).toEqual([]);
  });

  it('stand on land (except the pier, its moored boats and the river stepping stones)', () => {
    const bad: string[] = [];
    for (const s of shapes) {
      if (onPier(s.c.x, s.c.z) || onBridge(s.c.x, s.c.z)) continue;
      if (Math.abs(s.c.z + 108) < 6 && s.c.x < -48) continue; // stepping stones where the river meets the bay
      const g = h(s.c.x, s.c.z);
      if (g < -0.25) bad.push(`collider at (${s.c.x.toFixed(1)}, ${s.c.z.toFixed(1)}) stands in water (ground ${g.toFixed(2)})`);
    }
    expect(bad).toEqual([]);
  });

  it('scatter trees and rocks stay outside anchor radii', () => {
    const bad: string[] = [];
    for (const tr of outer.trees) {
      for (const [n, a] of Object.entries(ANCHORS)) {
        const d = Math.hypot(tr.x - a.x, tr.z - a.z);
        if (d < a.radius + 1) bad.push(`${tr.kind} at (${tr.x}, ${tr.z}) inside ${n}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the lighthouse walkway climbs gently to the gallery with headroom and stays inside the stone spiral', () => {
    const w = outer.walkway;
    const lh = ANCHORS.lighthouse;
    const base = h(lh.x, lh.z) + LH.plinthTop;
    const deck = base + LH.towerH + 0.25;
    expect(w.length).toBeGreaterThan(60);
    for (let i = 1; i < w.length; i++) {
      const run = Math.hypot(w[i].x - w[i - 1].x, w[i].z - w[i - 1].z);
      const rise = w[i].y - w[i - 1].y;
      expect(rise).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.atan2(rise, run) * (180 / Math.PI)).toBeLessThan(20);
    }
    // Ends level with the gallery deck.
    expect(Math.abs(w[w.length - 1].y - deck)).toBeLessThan(0.01);
    for (const p of w) {
      const towerR = LH.r0 - ((LH.r0 - LH.r1) * Math.min(1, Math.max(0, p.y - base))) / LH.towerH;
      expect(p.r0).toBeGreaterThan(towerR);
      expect(p.r1).toBeLessThan(4.05); // stepping stones' inner edge is at 4.1 m
      // Headroom: any walkway piece above this point (same direction) is ≥ 2.2 m higher.
      const ang = Math.atan2(p.z - lh.z, p.x - lh.x);
      for (const q of w) {
        if (q.y <= p.y + 0.01) continue;
        const qa = Math.atan2(q.z - lh.z, q.x - lh.x);
        if (Math.abs(Math.atan2(Math.sin(qa - ang), Math.cos(qa - ang))) > 0.12) continue;
        if (q.r1 < p.r0 || q.r0 > p.r1) continue;
        expect(q.y - p.y, `above (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`).toBeGreaterThan(2.2);
      }
    }
    // Overhead of the gallery: only the swung-out top part may be within 2.4 m below the deck.
    for (const p of w) if (p.y > deck - 2.4 && p.y < deck - 0.01) expect(p.r0).toBeGreaterThan(LH.galleryR);
  });

  it('the river keeps clear of the bungee landing and flows downhill to the bay', () => {
    const L = ANCHORS.bungeeLanding;
    for (const p of outer.riverLine) expect(Math.hypot(p.x - L.x, p.z - L.z) - p.hw, `${p.x}, ${p.z}`).toBeGreaterThan(L.radius);
    const last = outer.riverLine[outer.riverLine.length - 1];
    expect(h(last.x, last.z)).toBeLessThan(0.2);
    expect(outer.riverLine[0].x).toBeGreaterThan(last.x);
  });

  it('the bungee platform keeps its west end open and sits at deck height', () => {
    // Nothing solid stands west of the platform's end above the deck (the springboard attaches there).
    const endX = BRIDGE.x - BRIDGE.width / 2 - 3.8;
    const gz = ANCHORS.bungee.z;
    const blockers = shapes.filter((s) => s.c.x < endX + 0.25 && Math.abs(s.c.z - gz) < 1.5 && s.c.y > DECK_Y - 0.2 && s.c.y < DECK_Y + 4);
    expect(blockers.map((s) => `${s.c.x.toFixed(2)},${s.c.y.toFixed(2)},${s.c.z.toFixed(2)}`)).toEqual([]);
  });
});
