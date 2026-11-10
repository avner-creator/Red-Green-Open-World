/**
 * Where the four secret paths and the two vaults go (pure: only needs a height function, so unit
 * tests can check them against the real terrain). Positions come from the world's layout data.
 */
import { ANCHORS } from '../../world/layout';
import { findShore } from '../../world/spots';
import { LOTS, lotDims } from '../../world/village-data';
import { STONE, helixStones, stonesAlong } from './pathLogic';
import type { Stone } from './pathLogic';
import { fromDoorLocal } from './doorLogic';

export type HeightFn = (x: number, z: number) => number;

export interface Pedestal {
  x: number;
  /** Walkable top of the pedestal. */
  y: number;
  z: number;
  /** Top radius. */
  r: number;
  /** Floats in the air (glowing underside) rather than standing on something. */
  floating: boolean;
  /** Length of the support post below the top (for one sitting on a roof peak); 0 = none. */
  post: number;
}

export interface RouteDef {
  id: 'rooftops' | 'trampoline' | 'lake' | 'lighthouse';
  stones: Stone[];
  pedestal: Pedestal;
  /** Ground point where the path begins (weak-eye arrows lead here from the nearest road). */
  start: { x: number; z: number };
  /**
   * Hops `i → i+1` that are not jumps but a walk across a real surface (the flat roof). Each entry
   * names the surface's walkable top so tests can check both ends are a step from it.
   */
  walks: { hop: number; top: number; minX: number; maxX: number; minZ: number; maxZ: number }[];
}

export interface VaultDef {
  id: 'cliff' | 'village';
  /** Door base centre (on the ground); `yaw` faces out of the door like anchors (+Z of yaw). */
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const PED_R = 1.6;

function lot(id: string): (typeof LOTS)[number] {
  const l = LOTS.find((q) => q.id === id);
  if (!l) throw new Error(`lot ${id}`);
  return l;
}

/** Rooftops: climb the back of the flat-roofed house, cross its roof, then hop the street to the blue house. */
function rooftops(h: HeightFn): RouteDef {
  const flat = lot('flat');
  const blue = lot('bluehouse');
  const fd = lotDims(flat);
  const bd = lotDims(blue);
  // The flat house faces −X: its back wall is at x + d/2, its front (street side) at x − d/2.
  const back = flat.x + flat.d / 2;
  const front = flat.x - flat.d / 2;
  const g = h(back + 1.8, flat.z + 5.5);
  const parapetTop = fd.wallTop + 0.6;
  // Leg A runs along the back wall going north, leg B doubles back further out and higher.
  const climbA = stonesAlong(
    [
      { x: back + 1.8, y: g + 0.55, z: flat.z + 5.6 },
      { x: back + 1.8, y: g + 3.5, z: flat.z - 4.9 },
    ],
    { jitter: 0.12, seed: 3 },
  );
  const climbB = stonesAlong(
    [
      { x: back + 4.4, y: g + 4.25, z: flat.z - 4.9 },
      { x: back + 4.4, y: g + 6.5, z: flat.z - 1.2 },
      { x: back + 1.9, y: parapetTop + 0.25, z: flat.z + 1.0 },
    ],
    { jitter: 0.12, seed: 5 },
  );
  // Across the street, from the front parapet to the blue house's hip-roof peak.
  const ped: Pedestal = { x: blue.x, y: bd.roofTop + 1.15, z: blue.z, r: PED_R, floating: false, post: 1.15 };
  const cross = stonesAlong(
    [
      { x: front - 1.1, y: parapetTop + 0.3, z: flat.z },
      { x: ped.x + PED_R + STONE.radius + 0.9, y: ped.y + 0.15, z: ped.z + 0.3 },
    ],
    { arc: 0.5, jitter: 0.2, seed: 7 },
  );
  const hop = climbA.length + climbB.length - 1;
  // The roof inside the parapet (the house is rotated: its width runs along Z).
  const roof = { hop, top: fd.roofTop, minX: front + 0.25, maxX: back - 0.25, minZ: flat.z - flat.w / 2 + 0.25, maxZ: flat.z + flat.w / 2 - 0.25 };
  return { id: 'rooftops', stones: [...climbA, ...climbB, ...cross], pedestal: ped, start: { x: back + 1.8, z: flat.z + 7.5 }, walks: [roof] };
}

/** A spiral beside the giant trampoline (on its road side) to a floating pedestal 12 m up. */
function trampoline(h: HeightFn): RouteDef {
  const t = ANCHORS.trampoline;
  const cx = t.x - 16;
  const cz = t.z - 5;
  const g = h(cx, cz);
  const R = 3.4;
  const stones = helixStones(cx, cz, g + 0.55, g + 11.4, R, { startAngle: Math.PI * 0.5, dir: 1 });
  const ped: Pedestal = { x: cx, y: g + 12.1, z: cz, r: PED_R, floating: true, post: 0 };
  return { id: 'trampoline', stones, pedestal: ped, start: { x: cx, z: cz + R + 1.5 }, walks: [] };
}

/** From the beach path's end, out over the bay to the floating lake platform. */
function lake(h: HeightFn): RouteDef {
  const p = ANCHORS.lakePlatform;
  const top = p.y ?? 0.75;
  // Approach the open (ladder) side, a little off the ladder: platform-local (1.7, 5.3).
  const off = fromDoorLocal(p.yaw, 1.7, 5.3);
  const ax = p.x + off.x;
  const az = p.z + off.z;
  const [sx, sz] = findShore(h, -96, -4, ax, az, 0.9);
  const R = STONE.radius;
  const gy = Math.max(0.9, h(sx, sz), h(sx + R, sz), h(sx - R, sz), h(sx, sz + R), h(sx, sz - R));
  const stones = stonesAlong(
    [
      { x: sx, y: gy + 0.5, z: sz },
      { x: ax, y: top + 0.5, z: az },
    ],
    { arc: 1.4, jitter: 0.45, seed: 11 },
  );
  const pc = fromDoorLocal(p.yaw, 0.3, 1.9);
  const ped: Pedestal = { x: p.x + pc.x, y: top + 0.4, z: p.z + pc.z, r: 1.3, floating: false, post: 0 };
  // Start a few metres inland of the first stone.
  const dx = sx - ax;
  const dz = sz - az;
  const l = Math.hypot(dx, dz) || 1;
  return { id: 'lake', stones, pedestal: ped, start: { x: sx + (dx / l) * 2.5, z: sz + (dz / l) * 2.5 }, walks: [] };
}

/** Up and around the lighthouse, past the gallery, to a pedestal floating over the lantern. */
function lighthouse(h: HeightFn): RouteDef {
  const a = ANCHORS.lighthouse;
  const y = h(a.x, a.z);
  const gallery = y + 1.1 + 13.2;
  const r0 = 4.9;
  const r1 = 3.3;
  // Start on the east side (where the north path arrives), climb counter-clockwise seen from above.
  const yTop = gallery + 4.75;
  const pinchFrom = (gallery + 1.6 - (y + 0.55)) / (yTop - (y + 0.55));
  const radius = (t: number): number => (t <= pinchFrom ? r0 : r0 + (r1 - r0) * Math.min(1, (t - pinchFrom) / (1 - pinchFrom)));
  const stones = helixStones(a.x, a.z, y + 0.55, yTop, radius, { startAngle: 0.15, dir: -1 });
  const ped: Pedestal = { x: a.x, y: gallery + 5.35, z: a.z, r: PED_R, floating: true, post: 0 };
  return { id: 'lighthouse', stones, pedestal: ped, start: { x: a.x + r0 + 2.2, z: a.z + 0.7 }, walks: [] };
}

export function buildRoutes(h: HeightFn): RouteDef[] {
  return [rooftops(h), trampoline(h), lake(h), lighthouse(h)];
}

/**
 * Vault doors in rock faces: one at the foot of the cliff under the rocket-pad plateau (facing the
 * landing rings), one in the hill at the north end of the village street.
 */
export function buildVaults(h: HeightFn): VaultDef[] {
  const defs: { id: VaultDef['id']; x: number; z: number; yaw: number }[] = [
    // Cliff foot at (100, 21); the door stands 4.6 m out from it on the flat.
    { id: 'cliff', x: 100 + Math.sin(1.6) * 4.6, z: 21 + Math.cos(1.6) * 4.6, yaw: 1.6 },
    { id: 'village', x: -22, z: -64 + 4.6, yaw: 0 },
  ];
  return defs.map((d) => ({ ...d, y: h(d.x, d.z) }));
}
