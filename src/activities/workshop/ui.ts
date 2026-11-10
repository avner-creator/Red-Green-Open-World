/**
 * Workshop menu (DOM, both-eye): a row of big upgrade cards along the bottom with a picture, the
 * price in gems (or a tick when fitted), the key that fires it, plus Drive and Exit cards; the
 * wallet top-left. No reading needed. Bright shapes with black outlines on dark panels, so it reads
 * in R-only and G-only; the selected card is marked by a thick white ring and a lift (not hue).
 * Mouse / touch click the cards; keys, gamepad and touch sticks go through `ctx.input.state` in
 * the workshop controller.
 */
import { iconSvg } from '../../ui/icons';
import { UPGRADES, type UpgradeId, type UpgradeKey } from './upgrades';

const PICTO: Record<UpgradeId, string> = {
  musicalHorns:
    '<path d="M2 9.5h4l7-5v15l-7-5H2z"/><path class="w" d="M16 8.5q2 3.5 0 7M19 6q3.6 6 0 12"/>',
  duckOrnament:
    '<path d="M3 13c0 4.5 3.5 7.5 9 7.5s9-2.5 9-6.5c0-2.5-2-3.5-4-3 .8-1.4 .7-4.5-2-6s-6-.5-6.6 2.3c-.4 2 .6 3.4 1.2 4.2C7 12 5 11 3 13z"/><path class="k" d="M13 6.4l3.4-.6.2 2.4-3.4-.4z"/><circle class="k" cx="11" cy="6.6" r="1"/>',
  springBumper:
    '<path class="o" d="M2 12h3l2-5 3 10 3-10 3 10 2-5h1"/><path class="w" d="M2 12h3l2-5 3 10 3-10 3 10 2-5h1"/><rect x="19" y="5" width="4" height="14" rx="2"/>',
  bubbleExhaust:
    '<circle cx="8" cy="15" r="5.5"/><circle cx="17" cy="8" r="4"/><circle cx="18.5" cy="17.5" r="2.6"/><circle class="k" cx="6.3" cy="13" r="1.4"/><circle class="k" cx="15.8" cy="6.6" r="1"/>',
  confettiCannon:
    '<path d="M3 20l3.5 1.5 9-11.5-5-3.5z"/><circle cx="5" cy="20.5" r="2.2"/><rect x="15" y="1.5" width="3" height="3" rx=".6" transform="rotate(20 16.5 3)"/><rect x="19.5" y="6" width="3" height="3" rx=".6" transform="rotate(-25 21 7.5)"/><circle cx="21" cy="13" r="1.6"/><circle cx="12" cy="2.8" r="1.4"/>',
  monsterWheels:
    '<circle cx="12" cy="12" r="10.5"/><circle class="k" cx="12" cy="12" r="5.6"/><circle cx="12" cy="12" r="2.4"/><path class="l" d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2 2M17.4 17.4l2 2M4.6 19.4l2-2M17.4 6.6l2-2"/>',
  rocketBoost: '',
};

const KEY_ICON: Record<Exclude<UpgradeKey, null>, string> = { skill: 'Q', horn: 'F', hop: '␣' };
const PAD_ICON: Record<Exclude<UpgradeKey, null>, string> = { skill: 'LB', horn: 'B', hop: 'A' };

const CSS = `
.rg-ws{position:absolute;inset:0;pointer-events:none;font:900 3.4vmin/1 ui-rounded,"Nunito","Trebuchet MS",system-ui,sans-serif;color:#fff;opacity:0;transition:opacity .2s}
.rg-ws.on{opacity:1}
.rg-ws svg{fill:currentColor;stroke:#000;stroke-width:1.3;stroke-linejoin:round;paint-order:stroke fill;overflow:visible}
.rg-ws svg .l{fill:none;stroke:#000;stroke-width:1.1}
.rg-ws svg .k{fill:#10142a;stroke:none}
.rg-ws svg .o{fill:none;stroke:#000;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}
.rg-ws svg .w{fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.rg-ws .wallet{position:absolute;left:2.5vmin;top:2.5vmin;display:flex;align-items:center;gap:1.2vmin;padding:1.2vmin 2.4vmin 1.2vmin 1.4vmin;border-radius:5vmin;background:#10142a;border:.6vmin solid #fff;box-shadow:0 .8vmin 0 #000;font-size:5vmin}
.rg-ws .wallet svg{width:6vmin;height:6vmin;color:#7ff0ff}
.rg-ws .wallet.bump{animation:rg-ws-pop .35s}
.rg-ws .row{position:absolute;left:50%;bottom:2.5vmin;transform:translateX(-50%);display:flex;gap:1.3vmin;pointer-events:auto;max-width:96vw}
.rg-ws .card{all:unset;box-sizing:border-box;position:relative;width:11.2vmin;height:15.5vmin;border-radius:2.4vmin;background:#10142a;border:.55vmin solid #000;
  box-shadow:0 0 0 .4vmin #6d7385,0 .9vmin 0 .4vmin #000;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;cursor:pointer;transition:transform .12s}
.rg-ws .card .pic{width:8vmin;height:8vmin;margin-top:1.3vmin;color:#ffd93b}
.rg-ws .card .pic svg{width:100%;height:100%}
.rg-ws .card.sel{transform:translateY(-1.8vmin) scale(1.08);box-shadow:0 0 0 .75vmin #fff,0 1.2vmin 0 .75vmin #000;z-index:2}
.rg-ws .card .price{margin-top:auto;margin-bottom:1vmin;display:flex;align-items:center;gap:.4vmin;font-size:3.6vmin;color:#fff}
.rg-ws .card .price svg{width:3.6vmin;height:3.6vmin;color:#7ff0ff}
.rg-ws .card.poor .price{color:#9aa0b2}
.rg-ws .card.poor .pic{opacity:.55}
.rg-ws .card .tick{margin-top:auto;margin-bottom:.9vmin;width:4.6vmin;height:4.6vmin;border-radius:50%;border:.5vmin solid #fff;background:#10142a;display:grid;place-items:center}
.rg-ws .card .tick svg{width:3.4vmin;height:3.4vmin;color:#fff}
.rg-ws .card.off .tick{background:transparent;border-style:dashed}
.rg-ws .card.off .tick svg{display:none}
.rg-ws .card.on{background:#2b3557}
.rg-ws .card .key{position:absolute;right:-1vmin;top:-1vmin;min-width:4.2vmin;height:4.2vmin;padding:0 .6vmin;box-sizing:border-box;border-radius:1vmin;background:#ffd93b;color:#15110a;border:.45vmin solid #000;display:grid;place-items:center;font-size:2.8vmin}
.rg-ws .card.act .pic{color:#fff;margin-top:3.4vmin}
.rg-ws .card.act.drive{background:#30406e}
.rg-ws .need{position:absolute;left:50%;top:-6vmin;transform:translateX(-50%);white-space:nowrap;display:flex;align-items:center;gap:.4vmin;padding:.6vmin 1.4vmin;border-radius:3vmin;background:#fff;color:#10142a;border:.45vmin solid #000;font-size:3.4vmin;opacity:0;pointer-events:none}
.rg-ws .need svg{width:3.4vmin;height:3.4vmin;color:#0d6f86}
.rg-ws .card.shake{animation:rg-ws-shake .4s}
.rg-ws .card.shake .need{animation:rg-ws-need 1.6s}
.rg-ws .card.pop{animation:rg-ws-pop .45s}
@keyframes rg-ws-shake{20%{translate:-1.2vmin 0}40%{translate:1.2vmin 0}60%{translate:-.8vmin 0}80%{translate:.6vmin 0}}
@keyframes rg-ws-need{0%,85%{opacity:1}100%{opacity:0}}
@keyframes rg-ws-pop{40%{scale:1.22}100%{scale:1}}
`;

export type CardKind = UpgradeId | 'drive' | 'exit';

export interface CardView {
  owned: boolean;
  fitted: boolean;
  affordable: boolean;
  /** Gems still needed (shown on a refused buy). */
  short: number;
}

export interface WorkshopUi {
  readonly cards: readonly CardKind[];
  show(on: boolean): void;
  select(index: number): void;
  render(wallet: number, view: (id: UpgradeId) => CardView, gamepad?: boolean): void;
  /** Feedback animations. */
  shake(id: UpgradeId, short: number): void;
  pop(id: UpgradeId): void;
  onClick: ((index: number) => void) | null;
  dispose(): void;
}

let styleInstalled = false;

export function createWorkshopUi(root: HTMLElement): WorkshopUi {
  if (!styleInstalled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styleInstalled = true;
  }
  const el = document.createElement('div');
  el.className = 'rg-ws';
  el.setAttribute('data-testid', 'workshop');
  el.style.display = 'none';
  const wallet = document.createElement('div');
  wallet.className = 'wallet';
  wallet.setAttribute('data-testid', 'workshop-wallet');
  wallet.innerHTML = `<svg viewBox="0 0 24 24">${iconSvg('gem').replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg><span>0</span>`;
  const walletNum = wallet.querySelector('span') as HTMLSpanElement;
  const row = document.createElement('div');
  row.className = 'row';
  el.append(wallet, row);
  root.appendChild(el);

  const inner = (name: Parameters<typeof iconSvg>[0]): string => iconSvg(name).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  const cards: CardKind[] = [...UPGRADES.map((u) => u.id), 'drive', 'exit'];
  const els: HTMLButtonElement[] = [];
  const api: WorkshopUi = {
    cards,
    show(on) {
      el.style.display = on ? '' : 'none';
      // Next frame so the fade runs.
      requestAnimationFrame(() => el.classList.toggle('on', on));
      if (!on) el.classList.remove('on');
    },
    select(index) {
      els.forEach((c, i) => c.classList.toggle('sel', i === index));
    },
    render(gems, view, gamepad = false) {
      walletNum.textContent = String(gems);
      UPGRADES.forEach((u, i) => {
        const c = els[i];
        const k = c.querySelector('.key');
        if (k && u.key) k.textContent = (gamepad ? PAD_ICON : KEY_ICON)[u.key];
        const v = view(u.id);
        c.classList.toggle('owned', v.owned);
        c.classList.toggle('on', v.fitted);
        c.classList.toggle('off', v.owned && !v.fitted);
        c.classList.toggle('poor', !v.owned && !v.affordable);
        c.dataset.state = v.fitted ? 'fitted' : v.owned ? 'owned' : 'shop';
        (c.querySelector('.price') as HTMLElement).style.display = v.owned ? 'none' : '';
        (c.querySelector('.tick') as HTMLElement).style.display = v.owned ? '' : 'none';
      });
    },
    shake(id, short) {
      const c = els[cards.indexOf(id)];
      if (!c) return;
      (c.querySelector('.need span') as HTMLElement).textContent = `+${short}`;
      c.classList.remove('shake');
      void c.offsetWidth;
      c.classList.add('shake');
    },
    pop(id) {
      const c = els[cards.indexOf(id)];
      if (!c) return;
      c.classList.remove('pop');
      void c.offsetWidth;
      c.classList.add('pop');
      wallet.classList.remove('bump');
      void wallet.offsetWidth;
      wallet.classList.add('bump');
    },
    onClick: null,
    dispose() {
      el.remove();
    },
  };

  cards.forEach((kind, i) => {
    const c = document.createElement('button');
    c.className = 'card';
    c.setAttribute('data-testid', `ws-card-${kind}`);
    if (kind === 'drive' || kind === 'exit') {
      c.classList.add('act', kind);
      c.innerHTML = `<div class="pic"><svg viewBox="0 0 24 24">${inner(kind === 'drive' ? 'car' : 'exit')}</svg></div>`;
    } else {
      const def = UPGRADES.find((u) => u.id === kind);
      const pic = kind === 'rocketBoost' ? inner('rocket') : PICTO[kind];
      c.innerHTML =
        `<div class="pic"><svg viewBox="0 0 24 24">${pic}</svg></div>` +
        `<div class="price"><svg viewBox="0 0 24 24">${inner('gem')}</svg><span>${def?.price ?? 0}</span></div>` +
        `<div class="tick"><svg viewBox="0 0 24 24">${inner('check')}</svg></div>` +
        `<div class="need"><svg viewBox="0 0 24 24">${inner('gem')}</svg><span>+0</span></div>` +
        (def?.key ? `<div class="key">${KEY_ICON[def.key]}</div>` : '');
    }
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      api.onClick?.(i);
    });
    els.push(c);
    row.appendChild(c);
  });
  return api;
}
