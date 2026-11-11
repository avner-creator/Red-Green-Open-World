/**
 * The spawn's forward run lane stays clear: the first thing a child (and the character e2e test)
 * does is run, jump and fire a skill straight ahead from spawn (the panda's dash covers ~7 m).
 * Scenery placed near spawn (the island map board, the plaza fingerpost, benches, lamps) must stand
 * beside the lane, not in it. Also keeps the map board off the island walk from spawn to the park
 * road (tests/e2e/player.spec.ts), in the spawn view and not in front of any gem.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PhysicsApi } from '../../src/types';
import { buildTerrain, sampleHeight } from '../../src/world/terrain';
import { ANCHORS } from '../../src/world/layout';
import { Batcher } from '../../src/world/batch';
import { Colliders } from '../../src/world/props';
import { buildContent } from '../../src/world/content';
import { BOARD_R, MAP_BOARD } from '../../src/world/fill/mapboard';
import { CAMERA } from '../../src/config';

const sp = ANCHORS.spawn;
/** Lane: from spawn along the spawn yaw, this long (m) and this wide each side of its centre line. */
const LANE = { length: 16, half: 1.5 } as const;

interface Box { c: THREE.Vector3; h: THREE.Vector3; q: THREE.Quaternion }
interface Cyl { c: THREE.Vector3; hh: number; r: number }

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

describe('spawn run lane', () => {
  const terrain = buildTerrain();
  const h = (x: number, z: number): number => sampleHeight(terrain, x, z);
  const boxes: Box[] = [];
  const cyls: Cyl[] = [];
  const physics = {
    addStaticBox: (c: THREE.Vector3, hh: THREE.Vector3, q?: THREE.Quaternion) => void boxes.push({ c: c.clone(), h: hh.clone(), q: (q ?? new THREE.Quaternion()).clone() }),
    addStaticCylinder: (c: THREE.Vector3, hh: number, r: number) => void cyls.push({ c: c.clone(), hh, r }),
    addStaticSphere: () => undefined,
  } as unknown as PhysicsApi; // only the static-collider methods are used while building
  const content = buildContent({ b: new Batcher(), col: new Colliders(physics), h }, terrain, () => undefined);
  const fx = Math.sin(sp.yaw);
  const fz = Math.cos(sp.yaw);

  it(`has no solid collider within ${LANE.half} m of the line ${LANE.length} m ahead of spawn (knee to head height)`, () => {
    const hits: string[] = [];
    for (let s = 0; s <= LANE.length; s += 0.25) {
      for (let l = -LANE.half; l <= LANE.half + 1e-6; l += 0.25) {
        const x = sp.x + fx * s + fz * l;
        const z = sp.z + fz * s - fx * l;
        for (const dy of [0.5, 1.0, 1.6]) {
          const p = new THREE.Vector3(x, h(x, z) + dy, z);
          for (const b of boxes) {
            const q = p.clone().sub(b.c).applyQuaternion(b.q.clone().invert());
            if (Math.abs(q.x) < b.h.x && Math.abs(q.y) < b.h.y && Math.abs(q.z) < b.h.z) hits.push(`box at ${b.c.x.toFixed(1)},${b.c.z.toFixed(1)} (s ${s}, l ${l})`);
          }
          for (const c of cyls) {
            if (Math.hypot(p.x - c.c.x, p.z - c.c.z) < c.r && Math.abs(p.y - c.c.y) < c.hh) hits.push(`cyl at ${c.c.x.toFixed(1)},${c.c.z.toFixed(1)} (s ${s}, l ${l})`);
          }
        }
      }
    }
    expect([...new Set(hits.map((m) => m.replace(/ \(.*/, '')))]).toEqual([]);
  });

  it('keeps the map board beside the lane and the island walk, in the spawn view and hiding no gem', () => {
    const board = content.fill.placed.find((p) => p.kind === 'board' && p.name === 'map');
    expect(board).toBeDefined();
    const b = board!;
    // The board as a segment across its face (half-length BOARD_R covers the posts and collider).
    const yaw = Math.atan2(MAP_BOARD.faceX - b.x, MAP_BOARD.faceZ - b.z);
    const ends = [-1, 1].map((s) => [b.x + Math.cos(yaw) * BOARD_R * s, b.z - Math.sin(yaw) * BOARD_R * s] as const);
    const pts = Array.from({ length: 21 }, (_, i) => [ends[0][0] + ((ends[1][0] - ends[0][0]) * i) / 20, ends[0][1] + ((ends[1][1] - ends[0][1]) * i) / 20] as const);
    const minTo = (ax: number, az: number, bx: number, bz: number): number => Math.min(...pts.map(([x, z]) => segDist(x, z, ax, az, bx, bz)));
    expect(minTo(sp.x, sp.z, sp.x + fx * LANE.length, sp.z + fz * LANE.length)).toBeGreaterThanOrEqual(LANE.half);
    // Off the island walk spawn → (10, -4) → park road (player.spec) by ≥ 1 m.
    expect(Math.min(minTo(sp.x, sp.z, 10, -4), minTo(10, -4, 14, -8))).toBeGreaterThanOrEqual(1);
    // Ahead of spawn and within 30° of the default camera's line of sight (5.5 m behind the hero).
    const ahead = (b.x - sp.x) * fx + (b.z - sp.z) * fz;
    const side = (b.x - sp.x) * fz - (b.z - sp.z) * fx;
    expect(ahead).toBeGreaterThan(4);
    expect(Math.abs(Math.atan2(side, ahead + CAMERA.distance))).toBeLessThan(THREE.MathUtils.degToRad(30));
    // It hides no gem from that camera: the line of sight to each gem passes ≥ 0.5 m from the board.
    const cam = [sp.x - fx * CAMERA.distance, sp.z - fz * CAMERA.distance] as const;
    for (const g of content.gemSpots) {
      if (Math.hypot(g.x - cam[0], g.z - cam[1]) > 40) continue;
      expect(minTo(cam[0], cam[1], g.x, g.z), `gem ${g.tag} at ${g.x.toFixed(1)}, ${g.z.toFixed(1)}`).toBeGreaterThanOrEqual(0.5);
    }
    // Its face turned at most 30° away from that camera, so the pictures stay readable.
    const toCam = Math.atan2(sp.x - fx * CAMERA.distance - b.x, sp.z - fz * CAMERA.distance - b.z);
    const off = Math.abs(Math.atan2(Math.sin(yaw - toCam), Math.cos(yaw - toCam)));
    expect(off).toBeLessThan(THREE.MathUtils.degToRad(30));
  });
});
