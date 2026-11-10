/**
 * Deterministic placement of the six glasses-play sites. Pure: everything about the world is
 * injected (`SiteWorld`), so the finder runs in unit tests on a fake island.
 *
 * Each site starts from a preferred point and walks a fixed golden-angle spiral outwards until a
 * candidate passes every rule (land, height above water, gentle slope, clear of every anchor and
 * its target, of gem/chest spots, of roads, of colliders and of the sites placed before it).
 */
import type { RoadDef } from '../../world/layout';
import { GLASSES } from './constants';

export interface XZ {
  x: number;
  z: number;
}

/** The anchor fields the finder reads (structurally compatible with `Anchor`). */
export interface SiteAnchor {
  position: { x: number; y: number; z: number };
  radius: number;
  target?: { x: number; y: number; z: number };
  targetRadius?: number;
}

export interface SiteWorld {
  heightAt(x: number, z: number): number;
  isLand(x: number, z: number): boolean;
  waterLevel: number;
  /** ALL anchors (iterated dynamically: other streams add more). Must include `spawn`. */
  anchors: Readonly<Record<string, SiteAnchor>>;
  gemSpots: readonly { position: XZ }[];
  chestSpots: readonly { position: XZ }[];
  roads: readonly Pick<RoadDef, 'width' | 'points'>[];
  /** Runtime probe: true if something solid stands inside the circle (colliders). */
  blocked?(x: number, z: number, radius: number): boolean;
  /** Runtime probe: true if a board at `board` for a site at (x, z) facing `yaw` is in clear view from the approach. */
  view?(x: number, z: number, yaw: number, board: XZ): boolean;
  /** Called before each site's search (lets runtime probes reset per-site budgets). */
  beginSite?(index: number): void;
}

/**
 * Where a site would like to be.
 *  - `plaza`: `distance` metres from the spawn anchor at `angle` (radians, atan2(dx, dz) convention).
 *  - `near`: just outside an anchor, on the side facing the spawn (the approach), rotated by
 *    `angle` radians around it. `anchors` are tried in order until one has a valid spot.
 */
export type SitePrefer =
  | { kind: 'plaza'; angle: number; distance: number }
  | { kind: 'near'; anchors: readonly string[]; angle: number; gap: number };

export interface SitePlan {
  id: string;
  prefer: SitePrefer;
}

export interface GlassesSite {
  id: string;
  index: number;
  /** Centre on the ground. */
  x: number;
  y: number;
  z: number;
  /** Facing the approach: local +Z of the site points towards the spawn (where kids come from). */
  yaw: number;
  radius: number;
  /** Anchor name the site belongs to ('spawn' for the plaza ones). */
  near: string;
  /** Where the pictogram board stands (on the approach edge of the site, facing `yaw`; see `BOARD_SLOTS`). */
  board: XZ;
}

/** Order = registry order of the mechanics (one site each). */
export const SITE_PLANS: readonly SitePlan[] = [
  // Plaza: ahead of the spawn (it faces east) and to both sides.
  { id: 'glowflies', prefer: { kind: 'plaza', angle: 1.25, distance: 22 } },
  { id: 'oddone', prefer: { kind: 'plaza', angle: 2.6, distance: 22 } },
  { id: 'lineup', prefer: { kind: 'plaza', angle: -2.4, distance: 22 } },
  // Beside the approaches to the attractions.
  { id: 'toys', prefer: { kind: 'near', anchors: ['garage', 'launchPads'], angle: 0.5, gap: 6 } },
  { id: 'gates', prefer: { kind: 'near', anchors: ['trampoline', 'bouncePads'], angle: 0.3, gap: 6 } },
  // The balloon field is ringed by roads on its plaza side: this lands by the road that leads to it.
  { id: 'dotsigns', prefer: { kind: 'near', anchors: ['balloon', 'launchPads', 'landingRings'], angle: -0.4, gap: 6 } },
];

// ───────────────────────────── geometry helpers ─────────────────────────────

/** Distance from point p to segment ab in the XZ plane. */
export function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Distance from (x, z) to the nearest road edge (negative inside a road). */
export function roadClearance(roads: SiteWorld['roads'], x: number, z: number): number {
  let best = Infinity;
  for (const r of roads) {
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1];
      const b = r.points[i];
      best = Math.min(best, segmentDistance(x, z, a[0], a[1], b[0], b[1]) - r.width / 2);
    }
  }
  return best;
}

/** Facing yaw (atan2(dx, dz)) from `from` towards `to`. */
export const yawTowards = (from: XZ, to: XZ): number => Math.atan2(to.x - from.x, to.z - from.z);

/** Site-local (x right, z towards the approach) → world XZ. */
export function siteToWorld(site: Pick<GlassesSite, 'x' | 'z' | 'yaw'>, lx: number, lz: number): XZ {
  const c = Math.cos(site.yaw);
  const s = Math.sin(site.yaw);
  return { x: site.x + lx * c + lz * s, z: site.z - lx * s + lz * c };
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Candidate `i` of the fixed spiral around (cx, cz): i = 0 is the point itself. */
export function spiralPoint(cx: number, cz: number, i: number, step = GLASSES.searchStep): XZ {
  const r = step * Math.sqrt(i);
  const a = i * GOLDEN;
  return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
}

// ───────────────────────────── rules ─────────────────────────────

/** Board spots tried in order, site-local (x right, z towards the approach), as fractions of the radius. */
export const BOARD_SLOTS: readonly (readonly [number, number])[] = [
  [-0.5, 0.75],
  [0.5, 0.75],
  [0, 0.95],
];

export type Reject = 'land' | 'water' | 'slope' | 'anchor' | 'spot' | 'road' | 'site' | 'band' | 'blocked' | 'view' | null;

export interface CheckOptions {
  radius: number;
  /** Placed sites so far. */
  others: readonly XZ[];
  /** Distance band around a centre point. */
  band: { cx: number; cz: number; min: number; max: number };
}

/** First rule a candidate breaks, or null if it is a valid site centre. Cheap rules first; `blocked` last. */
export function checkSite(world: SiteWorld, x: number, z: number, o: CheckOptions, out?: { slot: number }): Reject {
  const dBand = Math.hypot(x - o.band.cx, z - o.band.cz);
  if (dBand < o.band.min || dBand > o.band.max) return 'band';
  const R = o.radius;
  for (const p of o.others) if (Math.hypot(x - p.x, z - p.z) < Math.max(GLASSES.siteSpacing, 2 * R + 1)) return 'site';
  for (const a of Object.values(world.anchors)) {
    if (Math.hypot(x - a.position.x, z - a.position.z) < a.radius + R + GLASSES.anchorMargin) return 'anchor';
    if (a.target && Math.hypot(x - a.target.x, z - a.target.z) < (a.targetRadius ?? 0) + R + GLASSES.anchorMargin) return 'anchor';
  }
  for (const s of world.gemSpots) if (Math.hypot(x - s.position.x, z - s.position.z) < R + GLASSES.spotClear) return 'spot';
  for (const s of world.chestSpots) if (Math.hypot(x - s.position.x, z - s.position.z) < R + GLASSES.spotClear) return 'spot';
  if (roadClearance(world.roads, x, z) < R + GLASSES.roadMargin) return 'road';
  if (!world.isLand(x, z)) return 'land';
  const h = world.heightAt(x, z);
  if (h < world.waterLevel + GLASSES.minAboveWater) return 'water';
  // Rim samples (plus a little beyond, where the board stands): land, dry and gentle.
  for (const rr of [R * 0.6, R + 1.5]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const sx = x + Math.cos(a) * rr;
      const sz = z + Math.sin(a) * rr;
      if (!world.isLand(sx, sz)) return 'land';
      const sh = world.heightAt(sx, sz);
      if (sh < world.waterLevel + GLASSES.minAboveWater) return 'water';
      if (Math.abs(sh - h) > GLASSES.maxRise * (rr / R)) return 'slope';
    }
  }
  // The board (≈ 5.5 m wide, front-left) reaches ≈ R + 1.3 from the centre.
  if (world.blocked?.(x, z, R + 1.5)) return 'blocked';
  const spawn = world.anchors.spawn?.position ?? { x: 0, z: 0 };
  const yaw = yawTowards({ x, z }, spawn);
  for (let i = 0; i < BOARD_SLOTS.length; i++) {
    const board = siteToWorld({ x, z, yaw }, BOARD_SLOTS[i][0] * R, BOARD_SLOTS[i][1] * R);
    if (!world.view || world.view(x, z, yaw, board)) {
      if (out) out.slot = i;
      return null;
    }
  }
  return 'view';
}

type Start = { start: XZ; band: CheckOptions['band']; near: string };

/** Search starts for a plan: one for a plaza site, one per existing anchor (in order) for a near site. */
function preferredPoints(world: SiteWorld, plan: SitePlan): Start[] {
  const spawn = world.anchors.spawn?.position ?? { x: 0, y: 0, z: 0 };
  const p = plan.prefer;
  if (p.kind === 'plaza') {
    return [{
      start: { x: spawn.x + Math.sin(p.angle) * p.distance, z: spawn.z + Math.cos(p.angle) * p.distance },
      band: { cx: spawn.x, cz: spawn.z, min: GLASSES.plazaMin, max: GLASSES.plazaMax },
      near: 'spawn',
    }];
  }
  const starts = p.anchors.filter((n) => world.anchors[n]).map((name): Start => {
    const a = world.anchors[name];
    const dist = a.radius + GLASSES.siteRadius + GLASSES.anchorMargin + p.gap;
    const toward = yawTowards(a.position, spawn) + p.angle;
    return {
      start: { x: a.position.x + Math.sin(toward) * dist, z: a.position.z + Math.cos(toward) * dist },
      band: { cx: a.position.x, cz: a.position.z, min: 0, max: GLASSES.nearMax },
      near: name,
    };
  });
  return starts.length ? starts : [{ start: { x: spawn.x, z: spawn.z }, band: { cx: spawn.x, cz: spawn.z, min: 0, max: GLASSES.plazaMax }, near: 'spawn' }];
}

/**
 * Find every site in plan order. A site that finds no valid spot falls back to its preferred point
 * snapped to the nearest land candidate (so the game never breaks); `valid` reports that.
 */
export function findSites(world: SiteWorld, plans: readonly SitePlan[] = SITE_PLANS, radius: number = GLASSES.siteRadius): (GlassesSite & { valid: boolean })[] {
  const out: (GlassesSite & { valid: boolean })[] = [];
  const spawn = world.anchors.spawn?.position ?? { x: 0, y: 0, z: 0 };
  plans.forEach((plan, index) => {
    world.beginSite?.(index);
    const starts = preferredPoints(world, plan);
    let found: XZ | null = null;
    let near = starts[0].near;
    const pick = { slot: 0 };
    for (const st of starts) {
      for (let i = 0; i < GLASSES.searchCount && !found; i++) {
        const c = spiralPoint(st.start.x, st.start.z, i);
        if (checkSite(world, c.x, c.z, { radius, others: out, band: st.band }, pick) === null) found = c;
      }
      if (found) {
        near = st.near;
        break;
      }
    }
    const valid = found !== null;
    const at = found ?? starts[0].start;
    const yaw = yawTowards(at, spawn);
    const site: GlassesSite & { valid: boolean } = {
      id: plan.id,
      index,
      x: at.x,
      y: world.heightAt(at.x, at.z),
      z: at.z,
      yaw,
      radius,
      near,
      board: { x: 0, z: 0 },
      valid,
    };
    site.board = siteToWorld(site, BOARD_SLOTS[pick.slot][0] * radius, BOARD_SLOTS[pick.slot][1] * radius);
    out.push(site);
  });
  return out;
}
