/**
 * Icon compass strip (top centre of the HUD): pictograms for the attractions placed by bearing
 * relative to the camera. Both-eye only: it reads anchors, never gems, keys or locks.
 */
import type { AnchorName, GameContext } from '../types';
import { h } from './dom';
import { pictogram } from './wayIcons';
import type { PictoName } from './wayIcons';
import { distanceDots, relativeBearing } from './compassMath';
import { layoutMarkers, pickFocus } from './compassLayout';

/** Attractions shown on the strip, in draw order. */
export const COMPASS_TARGETS: readonly { anchor: AnchorName; icon: PictoName }[] = [
  { anchor: 'trampoline', icon: 'wTrampoline' },
  { anchor: 'bouncePads', icon: 'wPads' },
  { anchor: 'garage', icon: 'wCar' },
  { anchor: 'balloon', icon: 'wBalloon' },
  { anchor: 'landingRings', icon: 'wTarget' },
  { anchor: 'launchPads', icon: 'wRocket' },
  { anchor: 'gearShack', icon: 'shop' },
];

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
      pictogram(t.icon),
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
      const prevIdx = shown.findIndex((c) => c.m.anchor === prevFocus);
      const focusIdx = shown.length ? pickFocus(shown, prevIdx) : -1;
      prevFocus = focusIdx >= 0 ? shown[focusIdx].m.anchor : null;
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
