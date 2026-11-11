/**
 * Icon compass strip (top centre of the HUD): pictograms for the attractions placed by bearing
 * relative to the camera. Both-eye only: it reads anchors, never gems, keys or locks.
 */
import type { AnchorName, GameContext } from '../types';
import { COMPASS_ATTRACTIONS } from '../world/attractions';
import { drawPictogram, type IconId } from '../world/pictograms';
import { h } from './dom';
import { pictogram } from './wayIcons';
import type { PictoName } from './wayIcons';
import { distanceDots, relativeBearing } from './compassMath';
import { layoutMarkers, pickFocus } from './compassLayout';

/** HUD icons for the world pictograms that have one; the rest draw the world sign's own pictogram. */
const HUD_ICON: Partial<Record<IconId, PictoName>> = {
  iTrampoline: 'wTrampoline', iBounce: 'wPads', iCar: 'wCar', iBalloon: 'wBalloon', iTarget: 'wTarget', iRocket: 'wRocket',
  iHorse: 'horse', iBungee: 'bungee', iSilly: 'flop',
};
/** Landmarks with a beacon but no activity of their own stay off the strip. */
const NOT_ON_STRIP: ReadonlySet<AnchorName> = new Set<AnchorName>(['lakePlatform', 'lighthouse']);

/** Attractions shown on the strip, in draw order: the world's attraction list plus the Gear Shack. */
export const COMPASS_TARGETS: readonly { anchor: AnchorName; icon: PictoName | IconId }[] = [
  ...COMPASS_ATTRACTIONS.filter((a) => !NOT_ON_STRIP.has(a.anchor)).map((a) => ({ anchor: a.anchor, icon: HUD_ICON[a.icon] ?? a.icon })),
  { anchor: 'gearShack', icon: 'shop' },
];

/** With many attractions, only the nearest few (plus the focus) get a full marker; the rest are ticks. */
const FULL_MARKERS = 6;

const WORLD_ICONS: ReadonlySet<string> = new Set(COMPASS_ATTRACTIONS.map((a) => a.icon));

function markerIcon(name: PictoName | IconId): HTMLElement {
  if (!WORLD_ICONS.has(name)) return pictogram(name as PictoName);
  // A world pictogram (round badge) drawn on a small canvas: the same picture as the signs.
  const el = h('span', 'ic wpic');
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  if (c) drawPictogram(c, name as IconId, 0, 0, 64);
  el.append(cv);
  return el;
}

/** Closer than this the marker hides (you are already there). */
const ARRIVED = 7;
const NS = 'http://www.w3.org/2000/svg';

function arrow(side: 'l' | 'r'): HTMLElement {
  const el = h('span', `arr ${side}`);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M2 1L8.5 5L2 9z');
  p.setAttribute('fill', '#ffd93b');
  p.setAttribute('stroke', '#000');
  p.setAttribute('stroke-width', '1.8');
  p.setAttribute('stroke-linejoin', 'round');
  p.setAttribute('paint-order', 'stroke');
  svg.append(p);
  el.append(svg);
  return el;
}

interface Marker {
  anchor: AnchorName;
  el: HTMLElement;
  dots: HTMLElement[];
  left: string;
  cls: string;
  nDots: number;
  arrL: HTMLElement;
  arrR: HTMLElement;
  arrow: number;
}

export interface Compass {
  el: HTMLElement;
  update(): void;
}

export function createCompass(ctx: GameContext): Compass {
  const el = h('div', 'wf-compass', { 'data-testid': 'compass' });
  const markers: Marker[] = COMPASS_TARGETS.map((t) => {
    const dots = [0, 1, 2, 3, 4].map(() => h('i'));
    const arrL = arrow('l');
    const arrR = arrow('r');
    const m = h(
      'div',
      'wf-m hidden',
      { 'data-testid': 'compass-marker', 'data-anchor': t.anchor },
      markerIcon(t.icon),
      arrL,
      arrR,
      h('span', 'dots', {}, ...dots),
    );
    el.append(m);
    return { anchor: t.anchor, el: m, dots, left: '', cls: 'hidden', nDots: 0, arrL, arrR, arrow: 9 };
  });

  // Strip half width in HUD units (1 unit = the CSS --u); re-measured when the window resizes.
  let halfU = 24;
  const measure = (): void => {
    const w = el.clientWidth;
    const hgt = el.clientHeight;
    // The strip is 6.4 units tall with a 0.5 unit border each side, so the padding box is 5.4.
    if (w > 0 && hgt > 0) halfU = w / (hgt / 5.4) / 2;
  };
  window.addEventListener('resize', measure);
  let measured = false;
  let prevFocus: AnchorName | null = null;

  return {
    el,
    update(): void {
      const anchors = ctx.world?.anchors;
      const player = ctx.player?.position;
      const yaw = ctx.cameraRig?.yaw;
      if (!anchors || !player || yaw === undefined) return;
      if (!measured) {
        measure();
        measured = el.clientWidth > 0;
      }
      const shown: { m: Marker; dist: number; rel: number }[] = [];
      for (const m of markers) {
        const a = anchors[m.anchor];
        const dist = a ? Math.hypot(a.position.x - player.x, a.position.z - player.z) : 0;
        if (a && dist > ARRIVED) shown.push({ m, dist, rel: relativeBearing(yaw, player, a.position) });
        else if (m.cls !== 'hidden') {
          m.cls = 'hidden';
          m.el.className = 'wf-m hidden';
        }
      }
      const prevIdx0 = shown.findIndex((c) => c.m.anchor === prevFocus);
      const focus0 = shown.length ? pickFocus(shown, prevIdx0) : -1;
      prevFocus = focus0 >= 0 ? shown[focus0].m.anchor : null;
      // Crowded strip: the nearest FULL_MARKERS plus the focus keep a marker; the rest become ticks
      // at their bearing (no layout, never overlapping a marker's icon).
      if (shown.length > FULL_MARKERS + 1) {
        const keep = new Set([...shown].sort((a, b) => a.dist - b.dist).slice(0, FULL_MARKERS));
        if (focus0 >= 0) keep.add(shown[focus0]);
        for (const c of shown) {
          if (keep.has(c)) continue;
          const left = `calc(50% + ${(Math.max(-1, Math.min(1, c.rel / (Math.PI / 2))) * (halfU - 1)).toFixed(2)} * var(--u))`;
          if (left !== c.m.left) {
            c.m.left = left;
            c.m.el.style.left = left;
          }
          if (c.m.cls !== 'tick') {
            c.m.cls = 'tick';
            c.m.el.className = 'wf-m tick';
            c.m.arrow = 9;
            c.m.arrL.style.display = 'none';
            c.m.arrR.style.display = 'none';
          }
        }
        for (let i = shown.length - 1; i >= 0; i--) if (!keep.has(shown[i])) shown.splice(i, 1);
      }
      const focusIdx = shown.findIndex((c) => c.m.anchor === prevFocus);
      const placed = layoutMarkers(shown.map((c, i) => ({ rel: c.rel, focus: i === focusIdx })), halfU);
      shown.forEach((c, i) => {
        const m = c.m;
        const p = placed[i];
        const left = `calc(50% + ${p.x.toFixed(2)} * var(--u))`;
        if (left !== m.left) {
          m.left = left;
          m.el.style.left = left;
        }
        const cls = `${i === focusIdx ? 'hl' : p.size === 'sm' ? 'sm' : ''}${p.clamped ? ' cl' : ''}`;
        if (cls !== m.cls) {
          m.cls = cls;
          m.el.className = `wf-m ${cls}`.trim();
          m.el.dataset.clamped = p.clamped ? '1' : '0';
        }
        if (p.arrow !== m.arrow) {
          m.arrow = p.arrow;
          m.arrL.style.display = p.arrow < 0 ? 'block' : 'none';
          m.arrR.style.display = p.arrow > 0 ? 'block' : 'none';
        }
        if (i === focusIdx) {
          const n = distanceDots(c.dist);
          if (n !== m.nDots) {
            m.nDots = n;
            m.dots.forEach((d, k) => d.classList.toggle('f', k < n));
            m.el.dataset.dots = String(n);
          }
        }
      });
    },
  };
}
