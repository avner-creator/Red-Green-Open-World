/**
 * Scoops station DOM: a bar of big picture tiles (click, tap, or drag a tile off the bar onto the
 * cone; the bar moves to the top on touch screens, clear of the touch buttons), a stage strip, a scoop meter, key hints for the current device, the friend's recipe card,
 * the "need more gems" note, the result card and the active-effect chips. No reading needed.
 * White/yellow on dark with thick outlines (R-only and G-only readable).
 */
import type { Recipe, Stage, Tile, EffectId } from './logic';
import { SCOOPS, STAGES } from './logic';
import { CHECK_SVG, EXIT_SVG, GEM_SVG, STAR_SVG, effectSvg, recipeSvg, stageSvg, tileSvg } from './pictos';

export interface UiTile {
  tile: Tile;
  enabled: boolean;
}

export interface UiModel {
  stage: Stage;
  tiles: UiTile[];
  selected: number;
  scoops: number;
  device: 'keyboard' | 'gamepad' | 'touch';
  recipe: Recipe | null;
  recipeColor: string;
  /** Card parts already right. */
  recipeOk: boolean;
}

export interface UiHandlers {
  /** A tile was tapped/clicked/dropped: select it and use it. */
  onTile(index: number): void;
  onExit(): void;
}

export interface ScoopsUi {
  show(on: boolean): void;
  render(m: UiModel): void;
  /** Little shake on the selected tile (full / not allowed). */
  nope(): void;
  showNeed(gems: number): void;
  showResult(r: { stars: number; gems: number | null; recipe: boolean; secret: boolean }): void;
  setEffects(list: { id: EffectId; remaining: number }[]): void;
  readonly el: HTMLElement;
  dispose(): void;
}

const CSS = `
.rg-scoops{position:absolute;inset:0;pointer-events:none;font:900 3.2vmin/1 ui-rounded,"Nunito","Trebuchet MS",system-ui,sans-serif;color:#fff;z-index:6}
.rg-scoops .sc-station{position:absolute;inset:0;opacity:0;transition:opacity .25s}
.rg-scoops .sc-station.sc-on{opacity:1}
.rg-scoops .sc-bar{position:absolute;left:50%;bottom:2.4vmin;transform:translateX(-50%);display:flex;gap:1.1vmin;align-items:flex-end;pointer-events:auto;
  padding:1.3vmin 1.6vmin;border-radius:3vmin;background:rgba(16,20,42,.82);border:.5vmin solid #fff;box-shadow:0 .8vmin 0 rgba(0,0,0,.55);touch-action:none}
.rg-scoops .sc-tile{width:9.4vmin;height:9.4vmin;border-radius:2.4vmin;background:#2a2f55;border:.55vmin solid #000;box-shadow:0 0 0 .35vmin #fff;
  display:grid;place-items:center;cursor:pointer;transition:transform .12s,background .12s;padding:0;position:relative;touch-action:none}
.rg-scoops .sc-tile svg{width:86%;height:86%;overflow:visible;pointer-events:none}
.rg-scoops .sc-tile.sc-sel{transform:translateY(-1.8vmin) scale(1.16);background:#ffd93b;box-shadow:0 0 0 .55vmin #fff,0 1vmin 0 .4vmin #000}
.rg-scoops .sc-tile.sc-off{opacity:.35;filter:grayscale(1)}
.rg-scoops .sc-tile.sc-nope{animation:rg-sc-nope .3s}
.rg-scoops .sc-tile.sc-next{background:#3a7a4a}
.rg-scoops .sc-tile.sc-next.sc-sel{background:#7ee08a}
.rg-scoops .sc-tile.sc-jar::after{content:"";position:absolute;inset:-.9vmin;border-radius:3vmin;border:.4vmin dashed rgba(255,255,255,.6);pointer-events:none}
.rg-scoops .sc-exit{position:absolute;right:2.4vmin;bottom:24vmin;width:10vmin;height:10vmin;border-radius:50%;background:#10142a;border:.6vmin solid #fff;
  display:grid;place-items:center;pointer-events:auto;cursor:pointer;box-shadow:0 .7vmin 0 #000;padding:0}
.rg-scoops .sc-exit svg{width:76%;height:76%}
.rg-scoops .sc-stages{position:absolute;left:50%;top:16vmin;transform:translateX(-50%);display:flex;gap:1.4vmin;align-items:center}
.rg-scoops .sc-stg{width:7.5vmin;height:7.5vmin;border-radius:50%;background:#10142a;border:.5vmin solid #000;box-shadow:0 0 0 .35vmin #888;display:grid;place-items:center;position:relative;opacity:.55}
.rg-scoops .sc-stg svg{width:78%;height:78%}
.rg-scoops .sc-stg.sc-done{opacity:1;box-shadow:0 0 0 .35vmin #fff}
.rg-scoops .sc-stg.sc-done::after{content:"";position:absolute;right:-1vmin;bottom:-1vmin;width:3.6vmin;height:3.6vmin;background:url('data:image/svg+xml;utf8,${encodeURIComponent(CHECK_SVG)}') center/contain no-repeat}
.rg-scoops .sc-stg.sc-cur{opacity:1;transform:scale(1.25);background:#ffd93b;box-shadow:0 0 0 .45vmin #fff,0 .6vmin 0 .3vmin #000}
.rg-scoops .sc-meter{position:absolute;left:50%;bottom:17.5vmin;transform:translateX(-50%);display:flex;gap:1vmin}
.rg-scoops .sc-meter i{width:3.4vmin;height:3.4vmin;border-radius:50%;border:.45vmin solid #fff;background:#10142a;box-shadow:0 .4vmin 0 #000}
.rg-scoops .sc-meter i.sc-on{background:#ffd93b;border-color:#000;box-shadow:0 0 0 .35vmin #fff}
.rg-scoops .sc-keys{position:absolute;left:2.4vmin;bottom:2.4vmin;display:flex;flex-direction:column;gap:1.1vmin}
.rg-scoops .sc-key{display:flex;align-items:center;gap:.8vmin}
.rg-scoops .sc-cap{min-width:5.6vmin;height:5.6vmin;padding:0 1vmin;border-radius:1.2vmin;background:linear-gradient(180deg,#ffe97a,#ffd93b 55%,#f2b400);border:.45vmin solid #000;
  box-shadow:0 0 0 .3vmin #fff,0 .7vmin 0 .3vmin #000;display:grid;place-items:center;color:#15110a;font-size:3vmin}
.rg-scoops .sc-cap.sc-pad{border-radius:50%;min-width:5.6vmin;padding:0}
.rg-scoops .sc-act{width:5.6vmin;height:5.6vmin}
.rg-scoops .sc-act svg{width:100%;height:100%}
.rg-scoops .sc-card{position:absolute;right:3.4vmin;top:25vmin;width:17vmin;padding:1.4vmin;border-radius:2.4vmin;background:#fff8ee;border:.55vmin solid #000;
  box-shadow:0 0 0 .4vmin #fff,0 1vmin 0 .4vmin #000;transform:rotate(3deg);display:flex;flex-direction:column;align-items:center;gap:.8vmin}
.rg-scoops .sc-card .sc-face{width:6vmin;height:6vmin;border-radius:50%;border:.5vmin solid #000;position:absolute;left:-2.6vmin;top:-2.6vmin}
.rg-scoops .sc-card .sc-pic{width:13vmin;height:22vmin;display:grid;place-items:end center}
.rg-scoops .sc-card .sc-pic svg{max-width:100%;max-height:100%}
.rg-scoops .sc-card .sc-prize{display:flex;align-items:center;gap:.6vmin;color:#15110a;font-size:3.4vmin}
.rg-scoops .sc-card .sc-prize svg{width:5vmin;height:5vmin}
.rg-scoops .sc-card .sc-ok{position:absolute;right:-2.2vmin;bottom:-2.2vmin;width:7vmin;height:7vmin;opacity:0;transform:scale(.4);transition:all .25s}
.rg-scoops .sc-card.sc-match .sc-ok{opacity:1;transform:scale(1)}
.rg-scoops .sc-need,.rg-scoops .sc-result{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%) scale(.6);opacity:0;transition:all .25s;
  display:flex;align-items:center;gap:1.4vmin;padding:2vmin 3vmin;border-radius:3vmin;background:rgba(16,20,42,.9);border:.6vmin solid #fff;box-shadow:0 1vmin 0 #000;font-size:6vmin}
.rg-scoops .sc-need.sc-on,.rg-scoops .sc-result.sc-on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.rg-scoops .sc-need svg,.rg-scoops .sc-result svg{width:9vmin;height:9vmin}
.rg-scoops .sc-result .sc-stars{display:flex;gap:.6vmin}
.rg-scoops .sc-result .sc-stars svg.sc-dim{opacity:.25;filter:grayscale(1)}
.rg-scoops .sc-num{color:#ffd93b;-webkit-text-stroke:.5vmin #000;paint-order:stroke fill}
.rg-scoops .sc-fx{position:absolute;left:2.4vmin;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:1.4vmin}
.rg-scoops .sc-fxc{width:9vmin;height:9vmin;border-radius:50%;background:#10142a;border:.5vmin solid #fff;box-shadow:0 .6vmin 0 #000;display:grid;place-items:center;position:relative}
.rg-scoops .sc-fxc svg.sc-ic{width:70%;height:70%}
.rg-scoops .sc-fxc svg.sc-ring{position:absolute;inset:-1.2vmin;width:calc(100% + 2.4vmin);height:calc(100% + 2.4vmin);transform:rotate(-90deg)}
.rg-scoops .sc-fxc svg.sc-ring circle{fill:none;stroke:#ffd93b;stroke-width:7;stroke-linecap:round}
.rg-scoops .sc-ghost{position:fixed;width:9.4vmin;height:9.4vmin;pointer-events:none;transform:translate(-50%,-50%) scale(1.1);opacity:.9;display:none;z-index:7}
.rg-scoops .sc-ghost svg{width:100%;height:100%}
/* Touch: the corners belong to the joystick and the action buttons. */
.rg-scoops.sc-touch .sc-bar{top:25vmin;bottom:auto}
.rg-scoops.sc-touch .sc-meter{top:39vmin;bottom:auto}
.rg-scoops.sc-touch .sc-exit{right:auto;left:2.4vmin;bottom:auto;top:38vmin}
@keyframes rg-sc-nope{0%,100%{translate:0}25%{translate:-1vmin}75%{translate:1vmin}}
`;

const KEYS = {
  keyboard: { select: ['A', 'D'], add: '␣', next: 'E', exit: 'R' },
  gamepad: { select: ['L'], add: 'A', next: 'X', exit: 'Y' },
} as const;

const ARROWS = `<svg viewBox="0 0 48 48"><path d="M4 24 l12 -11 v22z M44 24 l-12 -11 v22z" fill="#fff" stroke="#111" stroke-width="2.6" stroke-linejoin="round"/></svg>`;
const PLUS = `<svg viewBox="0 0 48 48"><path d="M19 6 h10 v13 h13 v10 h-13 v13 h-10 v-13 h-13 v-10 h13z" fill="#fff" stroke="#111" stroke-width="2.6" stroke-linejoin="round"/></svg>`;
const NEXT = `<svg viewBox="0 0 48 48"><path d="M8 20 h18 v-9 l15 13 l-15 13 v-9 h-18z" fill="#fff" stroke="#111" stroke-width="2.6" stroke-linejoin="round"/></svg>`;

const h = (tag: string, cls: string, html = ''): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export function createScoopsUi(root: HTMLElement, handlers: UiHandlers): ScoopsUi {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = h('div', 'rg-scoops');
  el.setAttribute('data-testid', 'scoops-ui');
  const station = h('div', 'sc-station');
  const stages = h('div', 'sc-stages');
  const stageEls = STAGES.map((s) => {
    const e = h('div', 'sc-stg', stageSvg(s));
    stages.appendChild(e);
    return e;
  });
  const meter = h('div', 'sc-meter');
  const meterDots = Array.from({ length: SCOOPS.maxScoops }, () => {
    const i = document.createElement('i');
    meter.appendChild(i);
    return i;
  });
  const bar = h('div', 'sc-bar');
  bar.setAttribute('data-testid', 'scoops-tiles');
  const keys = h('div', 'sc-keys');
  const exit = h('button', 'sc-exit', EXIT_SVG) as HTMLButtonElement;
  exit.setAttribute('data-testid', 'scoops-exit');
  exit.setAttribute('aria-label', 'exit');
  const card = h('div', 'sc-card');
  card.setAttribute('data-testid', 'scoops-recipe');
  const face = h('div', 'sc-face');
  const pic = h('div', 'sc-pic');
  const prize = h('div', 'sc-prize', `${GEM_SVG}<span class="sc-num">+${SCOOPS.prizeRecipe}</span>`);
  const ok = h('div', 'sc-ok', CHECK_SVG);
  card.append(face, pic, prize, ok);
  station.append(stages, meter, bar, keys, exit, card);
  const need = h('div', 'sc-need');
  need.setAttribute('data-testid', 'scoops-need');
  const result = h('div', 'sc-result');
  result.setAttribute('data-testid', 'scoops-result');
  const fx = h('div', 'sc-fx');
  const ghost = h('div', 'sc-ghost');
  el.append(station, need, result, fx, ghost);
  root.appendChild(el);

  let tileEls: HTMLButtonElement[] = [];
  let tileKey = '';
  let keysKey = '';
  let recipeKey = '';
  let needTimer = 0;
  let resultTimer = 0;
  let fxKey = '';

  // Pointer: tap a tile, or drag it up off the bar and let go (drops it on the cone).
  let drag: { index: number; id: number; x: number; y: number; moved: boolean } | null = null;
  const tileAt = (target: EventTarget | null): number => {
    const t = (target as HTMLElement | null)?.closest?.('.sc-tile') as HTMLButtonElement | null;
    return t ? tileEls.indexOf(t) : -1;
  };
  bar.addEventListener('pointerdown', (e) => {
    const i = tileAt(e.target);
    if (i < 0) return;
    e.preventDefault();
    drag = { index: i, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    try {
      bar.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events in tests */
    }
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 12) drag.moved = true;
    if (drag.moved) {
      ghost.style.display = 'block';
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      ghost.innerHTML = tileEls[drag.index]?.innerHTML ?? '';
    }
  });
  const end = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    ghost.style.display = 'none';
    // A tap adds; a drag adds when it is let go off the bar (onto the cone), else it is cancelled.
    const r = bar.getBoundingClientRect();
    const onBar = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!d.moved || !onBar) handlers.onTile(d.index);
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', () => {
    drag = null;
    ghost.style.display = 'none';
  });
  exit.addEventListener('click', (e) => {
    e.preventDefault();
    handlers.onExit();
  });

  const renderKeys = (device: UiModel['device'], stage: Stage): void => {
    const key = `${device}|${stage}`;
    if (key === keysKey) return;
    keysKey = key;
    if (device === 'touch') {
      keys.innerHTML = '';
      return;
    }
    const k = KEYS[device];
    const cap = (s: string): string => `<span class="sc-cap${device === 'gamepad' ? ' sc-pad' : ''}">${s}</span>`;
    const row = (caps: string, icon: string): string => `<div class="sc-key">${caps}<span class="sc-act">${icon}</span></div>`;
    keys.innerHTML =
      row(k.select.map(cap).join(''), ARROWS) + row(cap(k.add), PLUS) + (stage === 'cone' ? '' : row(cap(k.next), NEXT)) + row(cap(k.exit), EXIT_SVG);
  };

  return {
    el,
    show(on) {
      station.classList.toggle('sc-on', on);
      if (!on) {
        drag = null;
        ghost.style.display = 'none';
      }
    },
    render(m) {
      const key = `${m.stage}|${m.tiles.length}`;
      if (key !== tileKey) {
        tileKey = key;
        bar.innerHTML = '';
        tileEls = m.tiles.map((t, i) => {
          const b = h('button', `sc-tile${t.tile.kind === 'next' ? ' sc-next' : ''}${t.tile.kind === 'jar' ? ' sc-jar' : ''}`, tileSvg(t.tile, m.stage === 'toppings')) as HTMLButtonElement;
          b.setAttribute('data-testid', `scoops-tile-${i}`);
          b.tabIndex = -1;
          bar.appendChild(b);
          return b;
        });
      }
      tileEls.forEach((b, i) => {
        b.classList.toggle('sc-sel', i === m.selected);
        b.classList.toggle('sc-off', !m.tiles[i]?.enabled);
      });
      const si = STAGES.indexOf(m.stage);
      stageEls.forEach((e, i) => {
        e.classList.toggle('sc-cur', i === si);
        e.classList.toggle('sc-done', i < si);
      });
      meter.style.display = m.stage === 'scoops' ? 'flex' : 'none';
      meterDots.forEach((d, i) => d.classList.toggle('sc-on', i < m.scoops));
      bar.style.display = m.tiles.length ? 'flex' : 'none';
      el.classList.toggle('sc-touch', m.device === 'touch');
      renderKeys(m.device, m.stage);
      const rk = m.recipe ? JSON.stringify(m.recipe) : '';
      if (rk !== recipeKey) {
        recipeKey = rk;
        pic.innerHTML = m.recipe ? recipeSvg(m.recipe) : '';
        face.style.background = m.recipeColor;
      }
      card.style.display = m.recipe ? 'flex' : 'none';
      card.classList.toggle('sc-match', m.recipeOk);
    },
    nope() {
      const b = tileEls.find((t) => t.classList.contains('sc-sel'));
      if (!b) return;
      b.classList.remove('sc-nope');
      void b.offsetWidth;
      b.classList.add('sc-nope');
    },
    showNeed(gems) {
      need.innerHTML = `${GEM_SVG}<span class="sc-num">+${gems}</span>`;
      need.classList.add('sc-on');
      clearTimeout(needTimer);
      needTimer = window.setTimeout(() => need.classList.remove('sc-on'), 2200);
    },
    showResult(r) {
      const stars = [0, 1, 2].map((i) => STAR_SVG.replace('<svg', `<svg class="${i < r.stars ? '' : 'sc-dim'}"`)).join('');
      result.innerHTML = `<div class="sc-stars">${stars}</div>${r.gems !== null ? `${GEM_SVG}<span class="sc-num">+${r.gems}</span>` : ''}`;
      result.classList.add('sc-on');
      clearTimeout(resultTimer);
      resultTimer = window.setTimeout(() => result.classList.remove('sc-on'), 2600);
    },
    setEffects(list) {
      const key = list.map((e) => `${e.id}:${Math.ceil(e.remaining * 4)}`).join(',');
      if (key === fxKey) return;
      const idsChanged = list.map((e) => e.id).join() !== fxKey.split(',').map((s) => s.split(':')[0]).filter(Boolean).join();
      fxKey = key;
      if (idsChanged) {
        fx.innerHTML = list
          .map(
            (e) =>
              `<div class="sc-fxc" data-fx="${e.id}">${effectSvg(e.id).replace('<svg', '<svg class="sc-ic"')}<svg class="sc-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg></div>`,
          )
          .join('');
      }
      for (const e of list) {
        const c = fx.querySelector(`[data-fx="${e.id}"] circle`) as SVGCircleElement | null;
        c?.setAttribute('stroke-dashoffset', String(100 - (100 * e.remaining) / SCOOPS.effectSeconds));
      }
    },
    dispose() {
      clearTimeout(needTimer);
      clearTimeout(resultTimer);
      el.remove();
      style.remove();
    },
  };
}
