/**
 * Where line-up sits in its site: the layout is turned to face where children arrive (the end of
 * the world's stepping-stone trail, `site.arrival`) with the shared layout search (gates'
 * `chooseLayout`): from the pad the default camera must see open sky ahead (the bubbles) and the
 * booth's lamps; from the arrival the marquee, lamps and pad must be in clear view. The booth
 * stands beside the pad on the side with the fewer problems (left first); the bubbles keep to the
 * other side (see `findSpots`). Also: where the ONE play prompt floats (`lineupPrompt`).
 */
import type { GameContext } from '../../../types';
import { MARQUEE, PAD_TOP } from '../booth/geometry';
import { ASPECTS, padCamera, pickPromptSpot, screenRect } from '../booth/view';
import type { V3 } from '../booth/types';
import { chooseLayout } from '../gates/layout';
import type { Layout, LayoutSpec } from '../gates/layout';
import type { GlassesSite } from '../sites';
import { LINEUP, lineupBooth } from './constants';

/** The play's focus from the pad (layout-local): the middle of the bubbles' sky. */
export const LINEUP_LOOK = { x: 0, z: LINEUP.pad.z - 9 } as const;

/** Frame-local footprint points of the marquee for a side (centre, poles, counter). */
export function boothFootprint(side: -1 | 1): { x: number; z: number }[] {
  const m = lineupBooth(side).marquee;
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);
  const pt = (lx: number, lz: number): { x: number; z: number } => ({ x: m.x + lx * c + lz * s, z: m.z - lx * s + lz * c });
  return [pt(0, -0.3), pt(-1.6, 0.1), pt(1.6, 0.1), pt(-1.6, -0.6), pt(1.6, -0.6), pt(0, 0.5)];
}

export function lineupLayoutSpec(site: Pick<GlassesSite, 'radius' | 'arrival'>, side: -1 | 1): LayoutSpec {
  const m = lineupBooth(side).marquee;
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);
  const mq = (lx: number, lz: number): { x: number; z: number } => ({ x: m.x + lx * c + lz * s, z: m.z - lx * s + lz * c });
  const P = LINEUP.pad;
  return {
    hero: { x: P.x, z: P.z },
    // Open sky ahead of the pad (where the bubbles float) and the booth's lamp row.
    targets: [
      { x: 0, z: P.z - 8.5, y: 2.4 },
      { x: -3, z: P.z - 8, y: 2.4 },
      { x: 3, z: P.z - 8, y: 2.4 },
      { x: 0, z: P.z - 10.5, y: 3.0 },
      ...[-0.5, 0.5].map((lx) => ({ ...mq(lx, 0), y: MARQUEE.lampY })),
    ],
    footprint: [...boothFootprint(side), { x: P.x - P.radius, z: P.z }, { x: P.x + P.radius, z: P.z }, { x: P.x, z: P.z + P.radius }],
    radius: site.radius + 0.4,
    foreground: 1.5,
    arrival: site.arrival,
    arrivalTargets: [
      { ...mq(0, 0.2), y: MARQUEE.lampY },
      { ...mq(0, 0.2), y: MARQUEE.bannerY },
      { ...mq(0.8 * side, 0.2), y: MARQUEE.boardY },
      { x: P.x, z: P.z, y: 0.5 },
    ],
  };
}

/** The layout and the booth's side (the one with fewer problems; left first). */
export function chooseLineupLayout(ctx: Pick<GameContext, 'world' | 'physics' | 'scene' | 'player' | 'camera'>, site: GlassesSite): { lay: Layout; side: -1 | 1 } {
  const left = chooseLayout(ctx, site, lineupLayoutSpec(site, -1), { refreshDecor: true });
  if (left.problems <= 0) return { lay: left, side: -1 };
  const right = chooseLayout(ctx, site, lineupLayoutSpec(site, 1));
  return right.problems < left.problems ? { lay: right, side: 1 } : { lay: left, side: -1 };
}

/**
 * The play prompt (the Use button of the device in use): beside the hero on the booth's side,
 * BELOW the band where bubbles float (so it never covers one), in the central safe area of the
 * default pad camera, off the hero and off the ✓ / ✗ spot. Layout-local; `ground(x, z)` = ground
 * height relative to the site's y. Picked once: it never depends on the answer.
 */
export function lineupPrompt(side: -1 | 1, ground: (x: number, z: number) => number): { at: V3; fits: boolean } {
  const P = LINEUP.pad;
  const padY = ground(P.x, P.z);
  const pad = { x: P.x, y: padY + PAD_TOP, z: P.z };
  const size = LINEUP.promptSize + 0.3;
  const below = (p: V3): boolean =>
    ASPECTS.every((aspect) => {
      const r = screenRect(p, size, padCamera(pad, LINEUP_LOOK, aspect));
      return !!r && r.y0 >= LINEUP.spots.screen.y1;
    });
  const cands: V3[] = [];
  for (const z of [P.z - 1.2, P.z - 2, P.z - 0.6, P.z - 2.8]) {
    for (const x of [1.7, 2.1, 1.4, 2.5]) {
      for (const h of [1.4, 1.1, 1.7, 2.0]) {
        const p = { x: side * x, y: ground(side * x, z) + h, z };
        if (below(p)) cands.push(p);
      }
    }
  }
  if (!cands.length) cands.push({ x: side * 1.7, y: padY + 1.4, z: P.z - 1.2 });
  const popAt = { x: P.x - side * LINEUP.popSide, y: padY + LINEUP.popY, z: P.z + 0.4 };
  return pickPromptSpot(cands, { pad, look: LINEUP_LOOK, size, keepClear: [{ p: popAt, size: 1.2 }] });
}
