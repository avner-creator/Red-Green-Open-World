import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PhysicsApi, PlayerApi } from '../../src/types';
import { buildTerrain, sampleHeight, type TerrainData } from '../../src/world/terrain';
import { Batcher } from '../../src/world/batch';
import { Colliders, type Kit } from '../../src/world/props';
import { buildContent, type Content } from '../../src/world/content';
import { ANCHORS } from '../../src/world/layout';
import { ATTRACTIONS, GLASSES_WAY } from '../../src/world/attractions';
import { roadEdgeDistance } from '../../src/world/wayfinding';
import { FILL_ZONES, TRAILS } from '../../src/world/fill/zones';
import { createToysLive, MUSHROOM_BOUNCE } from '../../src/world/fill/toys-live';
import { U } from '../../src/world/materials';
import { buildRoutes, buildVaults } from '../../src/activities/secrets/routes';
import { PICTO_RECTS } from '../../src/world/pictograms';
import { BOARD_R, MAP_BOARD } from '../../src/world/fill/mapboard';

/** Distance from (x, z) to the map board's face line (its posts at ±BOARD_R), on the ground. */
function boardDist(b: { x: number; z: number }, x: number, z: number): number {
  const yaw = Math.atan2(MAP_BOARD.faceX - b.x, MAP_BOARD.faceZ - b.z);
  const tx = Math.cos(yaw);
  const tz = -Math.sin(yaw);
  const along = Math.max(-BOARD_R, Math.min(BOARD_R, (x - b.x) * tx + (z - b.z) * tz));
  return Math.hypot(x - (b.x + tx * along), z - (b.z + tz * along));
}

let t: TerrainData;
let content: Content;
let batcher: Batcher;
const h = (x: number, z: number): number => sampleHeight(t, x, z);

beforeAll(() => {
  t = buildTerrain();
  const fake = { addStaticBox() {}, addStaticCylinder() {}, addStaticSphere() {} } as unknown as PhysicsApi; // static colliders only
  batcher = new Batcher();
  const kit: Kit = { b: batcher, col: new Colliders(fake), h };
  content = buildContent(kit, t, () => undefined);
});

describe('island fill', () => {
  it('fills the empty corners: a landmark zone each, with toys, lights and arches', () => {
    const f = content.fill;
    const count = (kind: string): number => f.placed.filter((p) => p.kind === kind).length;
    expect(count('landmark')).toBeGreaterThanOrEqual(12);
    expect(count('arch')).toBeGreaterThanOrEqual(10);
    expect(count('light')).toBeGreaterThanOrEqual(25);
    expect(f.toys.length).toBeGreaterThanOrEqual(40);
    for (const kind of ['mushroom', 'duck', 'pinwheel', 'ball', 'spring']) expect(f.toys.some((q) => q.kind === kind), kind).toBe(true);
    expect(f.placed.some((p) => p.kind === 'board' && p.name === 'map')).toBe(true);
    // Every zone landmark stands within ~20 m of its zone centre and on dry land.
    for (const z of FILL_ZONES) {
      expect(h(z.x, z.z), z.id).toBeGreaterThan(0.5);
      expect(f.placed.some((p) => (p.kind === 'landmark' || p.kind === 'prop') && Math.hypot(p.x - z.x, p.z - z.z) < 20), z.id).toBe(true);
    }
  });

  it('keeps attraction circles, glasses sites, gem and chest spots and the secrets clear', () => {
    const bad: string[] = [];
    const routes = buildRoutes(h);
    const vaults = buildVaults(h);
    for (const p of content.fill.placed) {
      if (p.kind === 'arch' || p.kind === 'post') continue; // span a road / stand at a trail head (checked by the guard per pillar)
      for (const [name, a] of Object.entries(ANCHORS)) if (Math.hypot(p.x - a.x, p.z - a.z) < a.radius + p.r) bad.push(`${p.kind} ${p.name} in ${name}`);
      for (const g of GLASSES_WAY) if (Math.hypot(p.x - g.x, p.z - g.z) < g.r + p.r + 4) bad.push(`${p.kind} ${p.name} at glasses ${g.id}`);
      // (The map board is a thin slab: its gap is measured from its face line, posts included.)
      const gemDist = (gx: number, gz: number): number => (p.kind === 'board' ? boardDist(p, gx, gz) + p.r : Math.hypot(p.x - gx, p.z - gz));
      for (const s of content.gemSpots) if (gemDist(s.x, s.z) < p.r + 1.2) bad.push(`${p.kind} ${p.name} on gem ${s.tag}`);
      for (const c of content.chestSpots) if (Math.hypot(p.x - c.x, p.z - c.z) < p.r + 3) bad.push(`${p.kind} ${p.name} by a chest`);
      for (const r of routes) {
        for (const s of r.stones) if (Math.hypot(p.x - s.x, p.z - s.z) < p.r + 2) bad.push(`${p.kind} ${p.name} on secret ${r.id}`);
        if (Math.hypot(p.x - r.start.x, p.z - r.start.z) < p.r + 5) bad.push(`${p.kind} ${p.name} at secret start ${r.id}`);
      }
      for (const v of vaults) if (Math.hypot(p.x - v.x, p.z - v.z) < p.r + 6) bad.push(`${p.kind} ${p.name} at vault ${v.id}`);
    }
    expect(bad).toEqual([]);
  });

  it("keeps the toys mini-game's paw-trail meadow walkable", () => {
    const bad: string[] = [];
    for (const p of content.fill.placed) {
      // Meadow (x −65..−12, z 29..109): no solid fill prop reaches into it by more than 0.5 m
      // (thin lamps and trail-head posts allowed).
      const dx = Math.max(-65 - p.x, 0, p.x + 12);
      const dz = Math.max(29 - p.z, 0, p.z - 109);
      if (Math.hypot(dx, dz) < p.r - 0.5 && !/^(light|post)$/.test(p.kind)) bad.push(`${p.kind} ${p.name} in the toys meadow at ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
    }
    expect(bad).toEqual([]);
  });

  it('every toy stands on land and off the roads', () => {
    for (const q of content.fill.toys) {
      expect(h(q.x, q.z), `${q.kind} ${q.x},${q.z}`).toBeGreaterThan(0.5);
      expect(roadEdgeDistance(t.roads, q.x, q.z) - q.r, `${q.kind} ${q.x},${q.z}`).toBeGreaterThan(0.5);
    }
  });

  it('a trail leads from a road (or a pad) to every new zone and to the far attractions', () => {
    for (const z of FILL_ZONES) {
      const trail = TRAILS.find((q) => q.id === z.id);
      expect(trail, z.id).toBeDefined();
      const end = trail!.pts[trail!.pts.length - 1];
      expect(Math.hypot(end[0] - z.x, end[1] - z.z), z.id).toBeLessThan(26);
    }
    // Attractions whose centre is far from any road edge have a trail ending near them.
    for (const a of ATTRACTIONS) {
      const p = ANCHORS[a.anchor];
      // (The bungee platform is on the bridge deck: the bridge itself is the way there.)
      if (a.anchor === 'bungee' || roadEdgeDistance(t.roads, p.x, p.z) < p.radius + 6) continue;
      const near = TRAILS.some((q) => {
        const e = q.pts[q.pts.length - 1];
        return Math.hypot(e[0] - p.x, e[1] - p.z) < p.radius + 8;
      });
      expect(near, a.anchor).toBe(true);
    }
    expect(GLASSES_WAY.every((g) => g.trail)).toBe(true);
  });

  it('every new pictogram has an atlas cell', () => {
    for (const id of ['iWheel', 'iWindmill', 'iCastle', 'iLookout', 'iRainbow', 'iMushroom', 'iHere', 'iPicnic'] as const) expect(PICTO_RECTS[id], id).toBeDefined();
  });

  it('toys are one material: their triangles stay within budget', () => {
    expect(batcher.triangles).toBeLessThan(470_000);
  });
});

describe('toys at run time', () => {
  const makePlayer = (x: number, y: number, z: number, vy = -2): PlayerApi & { launched: THREE.Vector3[] } => {
    const launched: THREE.Vector3[] = [];
    return {
      position: new THREE.Vector3(x, y, z),
      velocity: new THREE.Vector3(1, vy, 0),
      mode: 'walk',
      grounded: false,
      vehicle: null,
      launch: (v: THREE.Vector3) => void launched.push(v.clone()),
      launched,
    } as unknown as PlayerApi & { launched: THREE.Vector3[] };
  };

  it('a mushroom cap bounces the hero up and wobbles; walking into a duck squeaks it', () => {
    const toys = content.fill.toys;
    const m = toys.find((q) => q.kind === 'mushroom');
    const d = toys.find((q) => q.kind === 'duck');
    expect(m && d).toBeTruthy();
    if (!m || !d) return;
    const played: string[] = [];
    const audio = { play: (n: string) => void played.push(n) };
    const player = makePlayer(m.x + 0.2, m.y + m.top + 0.05, m.z);
    const live = createToysLive(toys, { player, audio } as unknown as Parameters<typeof createToysLive>[1]);
    U.time.value = 10;
    live.update(1 / 60);
    expect(player.launched.length).toBe(1);
    expect(player.launched[0].y).toBeCloseTo(MUSHROOM_BOUNCE.up);
    expect(played).toContain('bigBoing');
    expect(U.bumps.value.some((b) => b.x === m.pivot[0] && b.z === m.pivot[2] && b.w === 10)).toBe(true);
    // Cooldown: no double bounce on the next frame.
    live.update(1 / 60);
    expect(player.launched.length).toBe(1);
    // The duck: walk into it from the side.
    player.position.set(d.x + d.r + 0.3, d.y + 0.1, d.z);
    live.update(1 / 60);
    expect(played).toContain('squeak');
    expect(live.stats().bumps).toBe(2);
  });

  it('a hero driving past only nudges toys (no launch)', () => {
    const toys = content.fill.toys;
    const m = toys.find((q) => q.kind === 'mushroom');
    if (!m) return;
    const player = makePlayer(0, 0, 0);
    (player as unknown as { vehicle: unknown }).vehicle = { position: new THREE.Vector3(m.x + 1.5, m.y + 0.5, m.z) };
    const live = createToysLive(toys, { player } as unknown as Parameters<typeof createToysLive>[1]);
    live.update(1 / 60);
    expect(player.launched.length).toBe(0);
    expect(live.stats().bumps).toBe(1);
  });
});
