/**
 * Icon compass strip (top centre of the HUD): pictograms for the attractions placed by bearing
 * relative to the camera. Both-eye only: it reads anchors, never gems, keys or locks.
 */
import type { AnchorName, GameContext } from '../types';
import { h } from './dom';
import { icon } from './icons';
import type { UiIconName } from './icons';
import { distanceDots, pickHighlight, relativeBearing, stripPosition } from './compassMath';

/** Attractions shown on the strip, in draw order. */
export const COMPASS_TARGETS: readonly { anchor: AnchorName; icon: UiIconName }[] = [
  { anchor: 'trampoline', icon: 'trampoline' },
  { anchor: 'bouncePads', icon: 'bolt' },
  { anchor: 'garage', icon: 'car' },
  { anchor: 'balloon', icon: 'balloon' },
  { anchor: 'landingRings', icon: 'target' },
  { anchor: 'launchPads', icon: 'rocket' },
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
      icon(t.icon),
      arrL,
      arrR,
      h('span', 'dots', {}, ...dots),
    );
    el.append(m);
    return { anchor: t.anchor, el: m, dots, left: '', cls: '', nDots: 0, arrL, arrR };
  });

  return {
    el,
    update(): void {
      const anchors = ctx.world?.anchors;
      const player = ctx.player?.position;
      const yaw = ctx.cameraRig?.yaw;
      if (!anchors || !player || yaw === undefined) return;
      const info = markers.map((m) => {
        const a = anchors[m.anchor];
        if (!a) return null;
        const dist = Math.hypot(a.position.x - player.x, a.position.z - player.z);
        return { dist, rel: relativeBearing(yaw, player, a.position) };
      });
      const visible = info.map((c) => (c && c.dist > ARRIVED ? c : null));
      const list = visible.filter((c): c is { dist: number; rel: number } => c !== null);
      const hlIdx = list.length ? pickHighlight(list) : -1;
      const hl = hlIdx >= 0 ? list[hlIdx] : null;
      markers.forEach((m, i) => {
        const c = visible[i];
        if (!c) {
          if (m.cls !== 'hidden') {
            m.cls = 'hidden';
            m.el.className = 'wf-m hidden';
          }
          return;
        }
        const pos = stripPosition(c.rel);
        const left = `${(50 + pos.x * 50).toFixed(2)}%`;
        if (left !== m.left) {
          m.left = left;
          m.el.style.left = left;
        }
        const cls = `${c === hl ? 'hl' : ''}${pos.clamped ? ' cl' : ''}`;
        if (cls !== m.cls) {
          m.cls = cls;
          m.el.className = `wf-m ${cls}`.trim();
          m.el.dataset.clamped = pos.clamped ? '1' : '0';
        }
        // Arrow only on the outward side.
        m.arrL.style.display = pos.side < 0 ? 'block' : 'none';
        m.arrR.style.display = pos.side > 0 ? 'block' : 'none';
        if (c === hl) {
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
