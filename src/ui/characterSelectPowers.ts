/**
 * Super-power picker for the hero-select screen: one big pictogram tile per power (tiny looping
 * demo), one press to choose. Free powers are ready; the others show a gem count to collect (the
 * lifetime total, never spent) with a progress bar. White / yellow / black only, so every tile
 * reads in the R-only and the G-only channel.
 */
import { skillPicto } from './skillPicto';
import { getPower, isNativePower, type ExtraPowerId, type PowerId, type PowerState } from '../core/skills-powers';
import { h } from './dom';
import { icon } from './icons';

const GROUND = '<rect class="gr" x="6" y="39" width="36" height="5" rx="2.5"/>';
const DOT = '<g class="dot"><circle cx="24" cy="33" r="5.5"/><circle class="k" cx="22.2" cy="32" r="1"/><circle class="k" cx="26.2" cy="32" r="1"/></g>';

const EXTRA_BODY: Record<ExtraPowerId, string> = {
  // Flames under the feet, hero rising.
  rocketBoots:
    GROUND +
    '<g class="dot"><path class="flame" d="M20 39l4 8 4-8z"/><circle cx="24" cy="33" r="5.5"/><circle class="k" cx="22.2" cy="32" r="1"/><circle class="k" cx="26.2" cy="32" r="1"/></g>',
  // A ball hero with bounce marks.
  bounceBall: `${GROUND}<path class="arc" d="M6 36q6-24 12 0q6-18 12 0q6-12 12 0"/>` + DOT,
  // Small hero grows big.
  giant: `${GROUND}<g class="grow"><circle cx="24" cy="27" r="11"/><circle class="k" cx="20.5" cy="25" r="1.8"/><circle class="k" cx="27.5" cy="25" r="1.8"/></g>`,
  // Striped slide trail.
  rainbowSlide: `${GROUND}<g class="bands"><rect x="4" y="34" width="8" height="4"/><rect class="dk" x="12" y="34" width="8" height="4"/><rect x="20" y="34" width="6" height="4"/></g>` + '<path class="arr" d="M38 26l7 6-7 6z"/>' + DOT,
  // Hero inside a bubble.
  bubbleShield: GROUND + DOT + '<circle class="bub" cx="24" cy="30" r="11"/>',
};

export const POWER_CSS = `
.rg .sk .flame{fill:#ffd93b;transform-box:fill-box;transform-origin:50% 0;animation:pw-flame .25s ease-in-out infinite alternate}
.rg .sk-rocketBoots .dot{animation:pw-rocket 2.2s ease-in-out infinite}
.rg .sk .arc{fill:none;stroke:#fff;stroke-width:2.2;stroke-dasharray:2 3;paint-order:normal}
.rg .sk-bounceBall .dot{animation:pw-ball 1.4s cubic-bezier(.4,0,.6,1) infinite}
.rg .sk .grow{transform-box:fill-box;transform-origin:50% 100%;animation:pw-grow 2s ease-in-out infinite}
.rg .sk .bands rect{fill:#ffd93b}
.rg .sk .bands rect.dk{fill:#000}
.rg .sk-rainbowSlide .dot{animation:sk-da 1.8s cubic-bezier(.5,0,.2,1) infinite}
.rg .sk .bub{fill:none;stroke:#fff;stroke-width:2.6;paint-order:normal;transform-box:fill-box;transform-origin:50% 50%;animation:pw-bub 1.6s ease-in-out infinite alternate}
.rg .sk.still *{animation:none!important}
@keyframes pw-flame{to{transform:scaleY(1.5)}}
@keyframes pw-rocket{0%,100%{transform:translateY(0)}50%{transform:translateY(-20px)}}
@keyframes pw-ball{0%,100%{transform:translateY(0) scale(1.2,.8)}10%{transform:translateY(-2px) scale(1)}50%{transform:translateY(-18px)}90%{transform:translateY(-2px)}}
@keyframes pw-grow{0%,30%{transform:scale(.5)}60%,90%{transform:scale(1.15)}}
@keyframes pw-bub{to{transform:scale(1.08)}}
.rg .csel .cs-right{flex:0 0 36%;max-width:calc(var(--u)*62)}
.rg .csel .cs-right .cs-skill{flex-direction:row;gap:calc(var(--u)*1.2)}
.rg .csel .cs-right .cs-tile{width:calc(var(--u)*10);height:calc(var(--u)*10);font-size:calc(var(--u)*8.5)}
.rg .cs-powers{display:grid;grid-template-columns:repeat(5,1fr);gap:calc(var(--u)*.6);width:100%}
.rg .cs-pw{position:relative;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.2);padding:calc(var(--u)*.5) calc(var(--u)*.2);min-width:0;
  border-radius:calc(var(--u)*1.4);border:calc(var(--u)*.35) solid #000;background:rgba(255,255,255,.12);color:#fff;font:inherit;cursor:pointer;pointer-events:auto;touch-action:manipulation}
.rg .cs-pw .sk{font-size:calc(var(--u)*5.4)}
.rg .cs-pw .pn{font-size:calc(var(--u)*1.35);font-weight:900;line-height:1.05;text-align:center;-webkit-text-stroke:calc(var(--u)*.2) #000;paint-order:stroke fill}
.rg .cs-pw.on{background:#fff;color:#000;box-shadow:0 0 0 calc(var(--u)*.45) #ffd93b,0 0 0 calc(var(--u)*.8) #000;transform:scale(1.08)}
.rg .cs-pw.on .pn{-webkit-text-stroke:0}
.rg .cs-pw:focus-visible{outline:calc(var(--u)*.5) solid #ffd93b}
.rg .cs-pw.lock{cursor:default;background:rgba(0,0,0,.35)}
.rg .cs-pw.lock .sk{opacity:.4}
.rg .cs-pw.lock .pn{display:none}
.rg .cs-pw .need{display:flex;align-items:center;gap:.1em;font-size:calc(var(--u)*1.5);font-weight:900;-webkit-text-stroke:calc(var(--u)*.2) #000;paint-order:stroke fill}
.rg .cs-pw .need .ic{width:1.1em;height:1.1em}
.rg .cs-pw .bar{width:80%;height:calc(var(--u)*.6);border-radius:calc(var(--u)*.4);background:rgba(255,255,255,.25);box-shadow:0 0 0 calc(var(--u)*.2) #000;overflow:hidden}
.rg .cs-pw .bar i{display:block;height:100%;width:var(--p);background:#ffd93b}
.rg .cs-pw .star{position:absolute;top:calc(var(--u)*-1);right:calc(var(--u)*-.8);font-size:calc(var(--u)*2.6);color:#ffd93b}
.rg .cs-ward{min-width:max(48px,calc(var(--u)*7));min-height:max(48px,calc(var(--u)*7));font-size:calc(var(--u)*2.6)}
.rg .cs-ward[data-ready="false"]{opacity:.75}
.rg .cs-ward.pop{animation:cs-card .32s cubic-bezier(.2,1.5,.4,1)}
`;

/** Pictogram for any power. */
export function powerPicto(id: PowerId, still = false): HTMLSpanElement {
  if (isNativePower(id)) return skillPicto(id, still);
  const el = document.createElement('span');
  el.className = `sk sk-${id}${still ? ' still' : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="0 0 48 48" focusable="false">${EXTRA_BODY[id]}</svg>`;
  return el;
}

/** One tile. `signature` marks the hero's own power with a star. */
export function powerTile(id: PowerId, state: PowerState, on: boolean, lifetime: number, signature: boolean, pick: () => void): HTMLElement {
  const def = getPower(id);
  const locked = state === 'locked';
  const tile = h(
    'button',
    `cs-pw${on ? ' on' : ''}${locked ? ' lock' : ''}`,
    { type: 'button', 'aria-label': def.name, 'aria-pressed': String(on), 'data-testid': `csel-power-${id}`, 'data-state': state },
    powerPicto(id, false),
    h('span', 'pn', {}, def.name.toUpperCase()),
  );
  if (signature) tile.append(h('span', 'star', {}, icon('star')));
  if (locked) {
    tile.append(
      h('span', 'need', {}, icon('gem'), `${Math.min(lifetime, def.earnAt)}/${def.earnAt}`),
      h('span', 'bar', {}, h('i', '', { style: `--p:${Math.round(Math.min(1, lifetime / def.earnAt) * 100)}%` })),
    );
  }
  tile.addEventListener('click', () => {
    if (!locked) pick();
  });
  return tile;
}
