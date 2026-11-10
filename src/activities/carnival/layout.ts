/**
 * Carnival row layout (pure data). Everything is built in the SITE frame: origin on the ground in
 * the middle of the midway, +Z = the side the booths face (towards the player), booths stand along
 * the X axis. Each booth has its own BOOTH frame: origin at the front edge of the counter, +Z
 * towards the player, so the player stands at about (0, 0, STAND_Z).
 */
import type { Anchor } from '../../types';

export type GameId = 'balloonPop' | 'ringToss' | 'duckPond' | 'strengthBell' | 'glowDodge';

export const GAME_IDS: readonly GameId[] = ['balloonPop', 'ringToss', 'duckPond', 'strengthBell', 'glowDodge'];

/**
 * Fallback site while the world has no `carnivalRow` anchor: the flat strip behind the east-side
 * village houses (y = 18), booths facing west towards the backs of the houses, between the main
 * street and Bouncy Park. Checked clear of trees, roads, gem spots and other anchors.
 */
export const FALLBACK_SITE = { x: 21, z: -42, yaw: -Math.PI / 2, radius: 17 } as const;

/** Booth slots along the row (site x), from the plaza end (south, +x) to the north end. */
export const BOOTH_X: Readonly<Record<GameId, number>> = {
  balloonPop: 12,
  ringToss: 6,
  duckPond: 0,
  strengthBell: -6,
  glowDodge: -12,
};

/** Booth width along the row and depth behind the counter (m). */
export const BOOTH_W = 5;
export const BOOTH_D = 4.6;
/** Site z of the counter fronts. */
export const BOOTH_FRONT_Z = -2.5;
/** Where the player stands in the booth frame (z), facing −Z (into the booth). */
export const STAND_Z = 1.1;
/** Friends stand left and right of the player (booth frame). */
export const FRIEND_SPOTS: readonly (readonly [number, number])[] = [
  [-1.75, 1.0],
  [1.75, 1.0],
];
/** Prize shelf (site frame) at the north end of the row, facing +X along the midway. */
export const SHELF = { x: -16.2, z: -3.2, yaw: Math.PI / 2, slots: 15 } as const;
/** Entrance arch over the midway at the plaza end. */
export const ARCH_X = 15.2;
/** Midway half-width towards the houses (site z from BOOTH_FRONT_Z to MIDWAY_Z1). */
export const MIDWAY_Z1 = 3.6;
/** The whole row stands on a raised boardwalk this high (keeps meadow grass out of the booths). */
export const DECK_H = 0.38;
/** Boardwalk extent in site x. */
export const DECK_X0 = -16.2;
export const DECK_X1 = 16.9;
/** Beyond this distance (m) from the site origin nothing animates. */
export const ACTIVE_RANGE = 48;

export interface SiteSpec {
  x: number;
  z: number;
  yaw: number;
  radius: number;
  /** True when the world provided a `carnivalRow` anchor. */
  fromAnchor: boolean;
}

/** The site: the world's `carnivalRow` anchor if it exists, else the fallback strip. */
export function resolveSite(anchors: Readonly<Record<string, Anchor | undefined>>): SiteSpec {
  const a = anchors.carnivalRow;
  if (a) return { x: a.position.x, z: a.position.z, yaw: a.yaw, radius: a.radius, fromAnchor: true };
  return { ...FALLBACK_SITE, fromAnchor: false };
}

/** Site-frame point → world x/z (rotation about +Y by `yaw`, like three's Object3D). */
export function siteToWorld(site: Pick<SiteSpec, 'x' | 'z' | 'yaw'>, lx: number, lz: number): [number, number] {
  const c = Math.cos(site.yaw);
  const s = Math.sin(site.yaw);
  return [site.x + lx * c + lz * s, site.z - lx * s + lz * c];
}

/** Site-frame point of a booth-frame point. */
export function boothToSite(game: GameId, bx: number, bz: number): [number, number] {
  return [BOOTH_X[game] + bx, BOOTH_FRONT_Z + bz];
}
