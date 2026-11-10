import { beforeAll, describe, expect, it } from 'vitest';
import type { PhysicsApi } from '../../src/types';
import { buildTerrain, sampleHeight, type TerrainData } from '../../src/world/terrain';
import { Batcher } from '../../src/world/batch';
import { Colliders, type Kit } from '../../src/world/props';
import { buildContent, type Content } from '../../src/world/content';
import { ANCHORS, LAUNCH_NET } from '../../src/world/layout';
import { ATTRACTIONS, FINGERPOSTS, roadEdgeDistance } from '../../src/world/wayfinding';
import { PICTO_RECTS, ATLAS_SIZE, ATLAS_H, type PictoId } from '../../src/world/pictograms';

let t: TerrainData;
let content: Content;
const h = (x: number, z: number): number => sampleHeight(t, x, z);

beforeAll(() => {
  t = buildTerrain();
  const noop = (): void => undefined;
  const fake = { addStaticBox: noop, addStaticCylinder: noop, addStaticSphere: noop } as unknown as PhysicsApi; // static colliders only
  const kit: Kit = { b: new Batcher(), col: new Colliders(fake), h };
  content = buildContent(kit, t, noop);
});

const angleDiff = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('wayfinding', () => {
  it('fingerpost arms point within 5° of their attraction', () => {
    const arms = content.wayfinding.arms;
    expect(arms.length).toBe(FINGERPOSTS.reduce((n, p) => n + p.targets.length, 0));
    for (const a of arms) {
      const t2 = ANCHORS[a.target];
      const want = Math.atan2(t2.x - a.x, t2.z - a.z);
      expect(angleDiff(a.yaw, want) * (180 / Math.PI), `${a.target} from ${a.x},${a.z}`).toBeLessThan(5);
    }
  });

  it('the two plaza fingerposts together have an arm for every attraction with a beacon', () => {
    const targets = [...FINGERPOSTS[0].targets, ...FINGERPOSTS[1].targets];
    for (const att of ATTRACTIONS) expect(targets).toContain(att.anchor);
    // The Carnival Island post: arms in a row point at least 40° apart, so no two arms overlap.
    for (const p of FINGERPOSTS.slice(1, 2)) {
      for (const row of p.rows ?? []) {
        const yaws = row.map((t) => Math.atan2(ANCHORS[t].x - p.x, ANCHORS[t].z - p.z));
        for (let i = 0; i < yaws.length; i++) for (let j = i + 1; j < yaws.length; j++) expect(angleDiff(yaws[i], yaws[j]) * (180 / Math.PI), row.join()).toBeGreaterThan(40);
      }
      expect(p.rows?.flat().sort()).toEqual([...p.targets].sort());
    }
  });

  it('boards, beacons and posts stand outside every anchor clear radius and off the roads', () => {
    const bad: string[] = [];
    for (const p of content.wayfinding.placed) {
      // Boards are long: test points along their width (local X = (cos yaw, −sin yaw)).
      const hw = p.hw ?? 0;
      const cy = Math.cos(p.yaw ?? 0);
      const sy = Math.sin(p.yaw ?? 0);
      for (const u of hw ? [-hw, -hw / 2, 0, hw / 2, hw] : [0]) {
        const x = p.x + cy * u;
        const z = p.z - sy * u;
        for (const [name, a] of Object.entries(ANCHORS)) {
          const d = Math.hypot(x - a.x, z - a.z) - p.r;
          if (d < a.radius) bad.push(`${p.kind} ${p.name} inside ${name} (${d.toFixed(1)} < ${a.radius})`);
        }
        const e = roadEdgeDistance(t.roads, x, z) - p.r;
        if (e < 0.3) bad.push(`${p.kind} ${p.name} on a road (${e.toFixed(2)} m)`);
        if (Math.hypot(x - LAUNCH_NET.x, z - LAUNCH_NET.z) - p.r < LAUNCH_NET.radius + 1) bad.push(`${p.kind} ${p.name} on the landing net`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every attraction has a beacon and (except the rings) a how-to board', () => {
    const placed = content.wayfinding.placed;
    for (const att of ATTRACTIONS) {
      expect(placed.some((p) => p.kind === 'beacon' && p.name === att.anchor), att.anchor).toBe(true);
      if (att.panels.length) expect(placed.some((p) => p.kind === 'board' && p.name === att.anchor), att.anchor).toBe(true);
    }
    expect(content.wayfinding.beacons).toHaveLength(ATTRACTIONS.length);
  });

  it('rocket pads sit next to Bouncy Park with a ~60 m flight to a flat landing spot', () => {
    const l = ANCHORS.launchPads;
    const bp = ANCHORS.bouncePads;
    expect(Math.hypot(l.x - bp.x, l.z - bp.z)).toBeLessThan(40);
    const dist = Math.hypot(LAUNCH_NET.x - l.x, LAUNCH_NET.z - l.z);
    expect(dist).toBeGreaterThan(50);
    expect(dist).toBeLessThan(66);
    expect(angleDiff(l.yaw, Math.atan2(LAUNCH_NET.x - l.x, LAUNCH_NET.z - l.z))).toBeLessThan(0.05);
    const c = h(LAUNCH_NET.x, LAUNCH_NET.z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      expect(Math.abs(h(LAUNCH_NET.x + Math.cos(a) * LAUNCH_NET.radius, LAUNCH_NET.z + Math.sin(a) * LAUNCH_NET.radius) - c)).toBeLessThan(0.2);
    }
  });

  it('pictogram atlas cells are inside the atlas and do not overlap', () => {
    const rects = Object.entries(PICTO_RECTS) as [PictoId, readonly [number, number, number]][];
    for (const [id, [x, y, s]] of rects) {
      expect(x >= 0 && y >= 0 && x + s <= ATLAS_SIZE && y + s <= ATLAS_H, id).toBe(true);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const [, [ax, ay, as]] = rects[i];
        const [, [bx, by, bs]] = rects[j];
        const overlap = ax < bx + bs && bx < ax + as && ay < by + bs && by < ay + as;
        expect(overlap, `${rects[i][0]} / ${rects[j][0]}`).toBe(false);
      }
    }
  });
});
