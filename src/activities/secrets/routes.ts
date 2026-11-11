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

/** Outer extents of a vault's crag (door-local): x ±halfW, z from `back` (negative) to 0.3. */
export interface Crag {
  halfW: number;
  back: number;
}

export interface VaultDef {
  id: 'cliff' | 'village';
  /** Door base centre (on the ground); `yaw` faces out of the door like anchors (+Z of yaw). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  crag: Crag;
}

const PED_R = 1.6;

function lot(id: string): (typeof LOTS)[number] {
  const l = LOTS.find((q) => q.id === id);
  if (!l) throw new Error(`lot ${id}`);
  return l;
}

/** Height of the village sidewalk slabs above the terrain (their colliders' top). */
const SIDEWALK_TOP = 0.18;

/**
 * Rooftops: zig-zag up the street front of the flat-roofed house (over its sidewalk, between the
 * bench and the planter), past its parapet, then hop the street to the blue house's roof peak.
 * The house's back yard is the carnival boardwalk now, so the climb stays on the street side.
 */
function rooftops(h: HeightFn): RouteDef {
  const flat = lot('flat');
  const blue = lot('bluehouse');
  const bd = lotDims(blue);
  // The flat house faces −X: its front (street side) wall is at x − d/2. Its width runs along Z.
  const front = flat.x - flat.d / 2;
  const north = flat.z - flat.w / 2;
  const south = flat.z + flat.w / 2;
  const xa = front - 1.25; // low leg, hugging the facade
  const xb = front - 3.3; // high leg, over the kerb side of the sidewalk
  const g = h(xa, flat.z) + SIDEWALK_TOP;
  // Leg A runs south along the facade (low), leg B doubles back north (higher), up near the parapet.
  const climbA = stonesAlong(
    [
      { x: xa, y: g + 0.55, z: north + 1.3 },
      { x: xa, y: g + 3.4, z: south - 1.4 },
    ],
    { jitter: 0.1, seed: 3 },
  );
  const climbB = stonesAlong(
    [
      { x: xb, y: g + 4.15, z: south - 1.6 },
      { x: xb, y: g + 6.4, z: north + 1.2 },
    ],
    { jitter: 0.1, seed: 5 },
  );
  // Across the street to the blue house's hip-roof peak.
  const ped: Pedestal = { x: blue.x, y: bd.roofTop + 1.15, z: blue.z, r: PED_R, floating: false, post: 1.15 };
  const last = climbB[climbB.length - 1];
  const cross = stonesAlong(
    [
      { x: last.x, y: last.y, z: last.z },
      { x: ped.x + PED_R + STONE.radius + 0.9, y: ped.y + 0.15, z: ped.z + 0.3 },
    ],
    { arc: 0.5, jitter: 0.2, seed: 7 },
  ).slice(1);
  // Start on the sidewalk beside the first stone (the planter is just north of it).
  return { id: 'rooftops', stones: [...climbA, ...climbB, ...cross], pedestal: ped, start: { x: xa - 1.6, z: north + 1.0 }, walks: [] };
}

/** A spiral beside the giant trampoline to a floating pedestal 12 m up. */
function trampoline(h: HeightFn): RouteDef {
  const t = ANCHORS.trampoline;
  // A clear lawn south of the mat (no trees or fences within ~7 m; checked by the e2e overlap test).
  const cx = t.x - 1;
  const cz = t.z + 17;
  const g = h(cx, cz);
  const R = 3.4;
  // Start on the mat side, away from the park paths, so the low stones are off any line a car takes.
  const stones = helixStones(cx, cz, g + 0.55, g + 11.4, R, { startAngle: -Math.PI * 0.5, dir: 1 });
  const ped: Pedestal = { x: cx, y: g + 12.1, z: cz, r: PED_R, floating: true, post: 0 };
  return { id: 'trampoline', stones, pedestal: ped, start: { x: cx, z: cz - R - 1.5 }, walks: [] };
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
  // Start on the south side (clear of where the north path ends, east), climbing round via the east.
  const yTop = gallery + 4.75;
  const pinchFrom = (gallery + 1.6 - (y + 0.55)) / (yTop - (y + 0.55));
  const radius = (t: number): number => (t <= pinchFrom ? r0 : r0 + (r1 - r0) * Math.min(1, (t - pinchFrom) / (1 - pinchFrom)));
  const stones = helixStones(a.x, a.z, y + 0.55, yTop, radius, { startAngle: Math.PI / 2, dir: -1 });
  const ped: Pedestal = { x: a.x, y: gallery + 5.35, z: a.z, r: PED_R, floating: true, post: 0 };
  return { id: 'lighthouse', stones, pedestal: ped, start: { x: a.x - 0.8, z: a.z + r0 + 2.2 }, walks: [] };
}

export function buildRoutes(h: HeightFn): RouteDef[] {
  return [rooftops(h), trampoline(h), lake(h), lighthouse(h)];
}

/** The full-size crag (door-local half width and back), and a slimmer one for a tight spot. */
export const CRAG_WIDE: Crag = { halfW: 6.4, back: -8.6 };
export const CRAG_SLIM: Crag = { halfW: 4.6, back: -6.6 };

/**
 * Vault doors in rock crags: one at the foot of the cliff under the rocket-pad plateau (facing the
 * landing rings), one on the meadow between the south road and the garage (facing the road).
 */
export function buildVaults(h: HeightFn): VaultDef[] {
  const defs: Omit<VaultDef, 'y'>[] = [
    // Cliff foot at (100, 21); the door stands 4.6 m out from it on the flat.
    { id: 'cliff', x: 100 + Math.sin(1.6) * 4.6, z: 21 + Math.cos(1.6) * 4.6, yaw: 1.6, crag: CRAG_WIDE },
    // Flat meadow west of the garage yard, door facing west to the south road (about 8 m away). A
    // slim crag keeps it off the garage lamp (east), the race's grass cut (south-west) and the
    // airstrip lights (west). It sat in the village's north hill until the foam course took that.
    { id: 'village', x: 13.2, z: 29.6, yaw: -Math.PI / 2, crag: CRAG_SLIM },
  ];
  return defs.map((d) => ({ ...d, y: h(d.x, d.z) }));
}
