/**
 * Small DOM pieces for chests and secrets (inside ctx.uiRoot, styled like the main HUD: white and
 * yellow on near-black with black outlines, so they read in the red-only and green-only channel):
 *
 *  - a key chip under the left HUD column while the hero carries a chest key (key icon, and ×N for
 *    more than one), with a bounce when a key is picked up;
 *  - a one-second "what is it for" pictogram card in the middle of the screen: `key → chest`,
 *    `gem → hat + balloon`, `chest → hat`… No words.
 *
 * Neither ever shows a position, so nothing here can point the strong eye at a weak-eye object.
 */
import { icon } from '../../ui/icons';
import type { UiIconName } from '../../ui/icons';

const CSS = `
.rg .ch-key{position:absolute;left:calc(var(--u)*3);top:calc(var(--u)*45);display:none;align-items:center;gap:calc(var(--u)*.8);
  padding:calc(var(--u)*.7) calc(var(--u)*1.6);background:var(--panel);border:calc(var(--u)*.5) solid #000;border-radius:calc(var(--u)*2.4);
  box-shadow:0 0 0 calc(var(--u)*.4) var(--y),0 0 calc(var(--u)*2) rgba(255,217,59,.55);z-index:5;pointer-events:none}
.rg .ch-key.on{display:flex}
.rg .ch-key .ic{font-size:calc(var(--u)*5.2);color:var(--y)}
.rg .ch-key .ic+.ic{font-size:calc(var(--u)*3.6);color:#fff}
.rg .ch-key b{font-size:1.3em;-webkit-text-stroke:calc(var(--u)*.5) #000;paint-order:stroke fill;display:none}
.rg .ch-key.many b{display:inline}
.rg .ch-key.pop{animation:ch-pop .6s cubic-bezier(.2,1.8,.4,1)}
@keyframes ch-pop{0%{transform:scale(.2)}60%{transform:scale(1.35)}100%{transform:scale(1)}}
.rg .ch-picto{position:absolute;left:50%;top:30%;display:none;align-items:center;gap:calc(var(--u)*1.4);transform:translate(-50%,-50%);
  padding:calc(var(--u)*1.2) calc(var(--u)*2.4);background:var(--panel);border:calc(var(--u)*.6) solid #000;border-radius:calc(var(--u)*3);
  box-shadow:0 0 0 calc(var(--u)*.5) #fff,0 calc(var(--u)*1) 0 calc(var(--u)*.5) #000;z-index:7;pointer-events:none}
.rg .ch-picto.on{display:flex;animation:ch-in 1.5s ease-out forwards}
.rg .ch-picto .ic{font-size:calc(var(--u)*7.5)}
.rg .ch-picto .ic.y{color:var(--y)}
.rg .ch-picto .ar{font-size:calc(var(--u)*5)}
.rg .ch-picto .ar .ic{font-size:inherit}
.rg .ch-picto .pl{font-size:calc(var(--u)*4.5);-webkit-text-stroke:calc(var(--u)*.6) #000;paint-order:stroke fill}
@keyframes ch-in{0%{opacity:0;transform:translate(-50%,-30%) scale(.4)}14%{opacity:1;transform:translate(-50%,-50%) scale(1.12)}22%{transform:translate(-50%,-50%) scale(1)}
  82%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-90%) scale(.85)}}
`;

/** Arrow glyph as an inline SVG (no text). */
function arrowEl(): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'ar';
  s.innerHTML =
    '<span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 9.500h12V4l8 8-8 8v-5.500H2z" style="fill:#fff;stroke:#000;stroke-width:2.2;stroke-linejoin:round;paint-order:stroke fill"/></svg></span>';
  return s;
}

export interface PictoStep {
  icon: UiIconName;
  yellow?: boolean;
}

export interface ChestHud {
  /** Number of chest keys the hero carries now (0 hides the chip). */
  setKeys(n: number): void;
  /** Show `a → b (+ c…)` for about 1.5 s. */
  flash(from: PictoStep, to: PictoStep[]): void;
  /** Which pictogram is showing (test hook), e.g. `key>chest`, or '' when none. */
  readonly showing: string;
  dispose(): void;
}

let styleRefs = 0;
let styleEl: HTMLStyleElement | null = null;

export function createChestHud(root: HTMLElement): ChestHud {
  if (styleRefs++ === 0) {
    styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }
  const chip = document.createElement('div');
  chip.className = 'ch-key';
  chip.append(icon('key'), icon('chest'));
  const count = document.createElement('b');
  chip.append(count);
  const card = document.createElement('div');
  card.className = 'ch-picto';
  root.append(chip, card);
  let keys = 0;
  let showing = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    setKeys(n) {
      if (n === keys) return;
      chip.classList.toggle('on', n > 0);
      chip.classList.toggle('many', n > 1);
      count.textContent = `×${n}`;
      if (n > keys) {
        chip.classList.remove('pop');
        void chip.offsetWidth; // restart the animation
        chip.classList.add('pop');
      }
      keys = n;
    },
    flash(from, to) {
      card.replaceChildren(icon(from.icon, from.yellow === false ? '' : 'y'), arrowEl());
      to.forEach((s, i) => {
        if (i > 0) {
          const p = document.createElement('span');
          p.className = 'pl';
          p.textContent = '+';
          card.append(p);
        }
        card.append(icon(s.icon, s.yellow ? 'y' : ''));
      });
      showing = `${from.icon}>${to.map((s) => s.icon).join('+')}`;
      card.classList.remove('on');
      void card.offsetWidth;
      card.classList.add('on');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        card.classList.remove('on');
        showing = '';
        timer = null;
      }, 1600);
    },
    get showing() {
      return showing;
    },
    dispose() {
      if (timer) clearTimeout(timer);
      chip.remove();
      card.remove();
      if (--styleRefs === 0 && styleEl) {
        styleEl.remove();
        styleEl = null;
      }
    },
  };
}
