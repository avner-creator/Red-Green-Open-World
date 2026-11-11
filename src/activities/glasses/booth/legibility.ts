/**
 * Demo legibility audit (pure; runs in node, no canvas): draws every frame of a `BoothDemo` into a
 * recording kit and a no-op 2D context, and reports per frame how tall the biggest hero is (in
 * the panel's 100 units) and how many kit pictures were drawn. With the booth's picture board
 * size that gives the hero's height in pixels at 8 m on a 640×360 screen (`DEMO_RULE`).
 */
import { DEMO_KIT } from './draw';
import type { DemoKit } from './draw';
import { MARQUEE } from './geometry';
import type { BoothDemo } from './types';
import { DEMO_RULE, pxPerMetre } from './view';

/** Height of the kit hero in units at scale 1 (head top to feet, standing). */
export const HERO_UNITS = 46;

export interface DemoAudit {
  frames: { heroUnits: number; things: number }[];
  /** The demo panel's edge and the biggest hero (where one appears) in px at 8 m, 640×360. */
  panelPx: number;
  minHeroPx: number;
  maxThings: number;
  ok: boolean;
  problems: string[];
}

/** A 2D context that accepts every call and property and draws nothing. */
function nullContext(): CanvasRenderingContext2D {
  const target: Record<string | symbol, unknown> = {};
  const handler: ProxyHandler<Record<string | symbol, unknown>> = {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 10 });
      return () => undefined;
    },
    set(t, k, val) {
      t[k] = val;
      return true;
    },
  };
  return new Proxy(target, handler) as unknown as CanvasRenderingContext2D;
}

const SHAPES: (keyof DemoKit)[] = ['hero', 'arrow', 'gem', 'mark', 'sparkle', 'star', 'check', 'cross', 'arch', 'button', 'hand', 'footprints'];

export function auditDemo(demo: BoothDemo, panelM: number = MARQUEE.demo): DemoAudit {
  const frames: DemoAudit['frames'] = [];
  for (let f = 0; f < demo.frames; f++) {
    let heroUnits = 0;
    let things = 0;
    const kit = { ...DEMO_KIT } as Record<string, unknown>;
    for (const k of SHAPES) {
      kit[k] = (...a: unknown[]) => {
        things++;
        // hero(c, x, y, s, …): height 46·s units.
        if (k === 'hero') heroUnits = Math.max(heroUnits, HERO_UNITS * Math.abs(Number(a[3]) || 0));
      };
    }
    demo.draw(nullContext(), f, 100, kit as unknown as DemoKit);
    frames.push({ heroUnits, things });
  }
  const ppm = pxPerMetre(DEMO_RULE.distance, DEMO_RULE.viewportH);
  const panelPx = panelM * ppm;
  const heroes = frames.filter((x) => x.heroUnits > 0);
  const minHeroUnits = heroes.length ? Math.min(...heroes.map((x) => x.heroUnits)) : 0;
  const minHeroPx = (minHeroUnits / 100) * panelPx;
  const maxThings = Math.max(0, ...frames.map((x) => x.things));
  const problems: string[] = [];
  if (panelPx < DEMO_RULE.minPanelPx) problems.push(`panel ${panelPx.toFixed(0)} px < ${DEMO_RULE.minPanelPx}`);
  if (!heroes.length) problems.push('no hero in any frame');
  else if (minHeroUnits < DEMO_RULE.minHeroUnits) problems.push(`hero ${minHeroUnits.toFixed(0)} units (${minHeroPx.toFixed(0)} px) < ${DEMO_RULE.minHeroUnits} units`);
  if (heroes.length && minHeroPx < DEMO_RULE.minHeroPx) problems.push(`hero ${minHeroPx.toFixed(0)} px < ${DEMO_RULE.minHeroPx} px at ${DEMO_RULE.distance} m`);
  if (maxThings > DEMO_RULE.maxThings) problems.push(`${maxThings} pictures in one frame > ${DEMO_RULE.maxThings}`);
  return { frames, panelPx, minHeroPx, maxThings, ok: problems.length === 0, problems };
}
