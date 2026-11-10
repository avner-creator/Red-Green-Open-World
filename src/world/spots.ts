/** Gem and chest spots (pure). The first 15 gems are in/near the plaza and Bouncy Park. */
import { ANCHORS, CANYON, DECK_Y } from './layout';
import type { ProcessedRoad } from './terrain';
import { LOTS, lotDims } from './village-data';

export interface Spot {
  x: number;
  y: number;
  z: number;
  tag: string;
}
export interface ChestSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

type HeightFn = (x: number, z: number) => number;

const FLOAT = 1.2;

/** Walk from a land point towards the sea until the ground drops below `h`. */
export function findShore(height: HeightFn, x0: number, z0: number, x1: number, z1: number, h: number): [number, number] {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(len / 0.5);
  let px = x0;
  let pz = z0;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const z = z0 + ((z1 - z0) * i) / steps;
    if (height(x, z) < h) return [px, pz];
    px = x;
    pz = z;
  }
  return [px, pz];
}

function roadPoint(roads: readonly ProcessedRoad[], id: string, f: number): [number, number] {
  const r = roads.find((q) => q.def.id === id);
  if (!r) throw new Error(`road ${id}`);
  const p = r.pts[Math.min(r.pts.length - 1, Math.round(f * (r.pts.length - 1)))];
  return [p.x, p.z];
}

export function buildGemSpots(height: HeightFn, roads: readonly ProcessedRoad[]): Spot[] {
  const spots: Spot[] = [];
  const ground = (x: number, z: number, tag: string, extra = 0): void => {
    spots.push({ x, y: height(x, z) + FLOAT + extra, z, tag });
  };
  const roof = (id: string): void => {
    const l = LOTS.find((q) => q.id === id);
    if (!l) throw new Error(id);
    spots.push({ x: l.x, y: lotDims(l).roofTop + FLOAT, z: l.z, tag: 'rooftop' });
  };
  const tr = ANCHORS.trampoline;
  const trY = height(tr.x, tr.z);
  const column = (dy: number): void => {
    spots.push({ x: tr.x, y: trY + dy, z: tr.z, tag: 'trampoline' });
  };

  // ── First 15: plaza, rooftops, trampoline ──
  ground(0, -2, 'plaza', 3.4); // on top of the fountain
  ground(7, 4, 'plaza');
  ground(-7, 4, 'plaza');
  ground(15, -9, 'plaza');
  ground(-14, -13, 'plaza');
  ground(0, -20, 'plaza');
  ground(3.5, -33, 'plaza');
  ground(-3.5, -45, 'plaza');
  ground(24, -14, 'plaza');
  roof('bakery');
  roof('toyshop');
  roof('hall');
  column(10);
  column(20);
  column(30);
  // ── The rest ──
  column(40);
  roof('bluehouse');
  roof('flat');
  roof('cafe');

  // Skydive trail: from 170 m above the balloon down towards the landing rings.
  const b = ANCHORS.balloon;
  const r = ANCHORS.landingRings;
  const top = height(b.x, b.z) + 170;
  const bottom = height(r.x, r.z) + 24;
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const x = b.x + (r.x - b.x) * t + Math.sin(t * 5) * 6 * (1 - t);
    const z = b.z + (r.z - b.z) * t + Math.cos(t * 4) * 5 * (1 - t);
    spots.push({ x, y: top + (bottom - top) * Math.pow(t, 0.85), z, tag: 'skydive' });
  }

  // Bungee fall line beside the platform, then along the canyon floor.
  const fallX = ANCHORS.bungee.x - 6;
  for (const dy of [6, 12, 18, 24]) spots.push({ x: fallX, y: DECK_Y - dy, z: CANYON.z, tag: 'bridge' });
  ground(6, CANYON.z + 2, 'bridge');
  ground(-32, CANYON.z - 1, 'bridge');

  // Beaches: walk from inland to the sea and stop where the sand is.
  const beach = (x0: number, z0: number, x1: number, z1: number): void => {
    const [x, z] = findShore(height, x0, z0, x1, z1, 0.9);
    ground(x, z, 'beach');
  };
  beach(20, 120, 30, 200);
  beach(-40, 120, -70, 200);
  beach(60, 110, 110, 190);
  beach(130, 50, 200, 70);
  beach(-96, -4, -118, -50);

  // Ranch paddock and barn roof.
  ground(-84, 36, 'ranch');
  ground(-64, 52, 'ranch');
  ground(-66, 33, 'ranch');
  spots.push({ x: ANCHORS.ranch.x - 27, y: height(ANCHORS.ranch.x - 27, ANCHORS.ranch.z) + 10.6, z: ANCHORS.ranch.z, tag: 'ranch' });

  // Lighthouse: two on the headland, one on the gallery, one above the lantern.
  const lh = ANCHORS.lighthouse;
  const lhY = height(lh.x, lh.z);
  ground(lh.x + 9, lh.z + 2, 'lighthouse');
  ground(lh.x - 3, lh.z + 10, 'lighthouse');
  spots.push({ x: lh.x + 2.4, y: lhY + 13.6 + FLOAT, z: lh.z + 0.8, tag: 'lighthouse' });
  spots.push({ x: lh.x, y: lhY + 21, z: lh.z, tag: 'lighthouse' });

  // Silly Zone ring.
  const s = ANCHORS.sillyZone;
  for (const a of [0.3, 1.9, 3.5, 5.0]) ground(s.x + Math.cos(a) * 19, s.z + Math.sin(a) * 19, 'silly');

  // Roads (for cars and horses).
  const roadSpots: [string, number][] = [
    ['east', 0.3], ['east', 0.62], ['east', 0.9], ['south', 0.5], ['loop', 0.45], ['west', 0.55], ['ridge', 0.35], ['ridge', 0.72], ['beach', 0.6],
  ];
  for (const [id, f] of roadSpots) {
    const [x, z] = roadPoint(roads, id, f);
    ground(x, z, 'road');
  }

  // Secrets.
  ground(-36, CANYON.z + 3, 'secret');
  ground(30, -142, 'secret');
  ground(34, 41, 'secret');
  ground(-50, -28, 'secret');
  return spots;
}

export function buildChestSpots(height: HeightFn): ChestSpot[] {
  const at = (x: number, z: number, yaw: number): ChestSpot => ({ x, y: height(x, z), z, yaw });
  const [bx, bz] = findShore(height, -94, -2, -118, -50, 1.6);
  return [
    at(11, 13, -0.6),
    at(-58, 62, Math.PI),
    at(-52, -140, -Math.PI / 2),
    at(bx, bz, 0.8),
    at(102, 74, -Math.PI / 2),
    at(28, 106, -Math.PI / 2),
  ];
}
