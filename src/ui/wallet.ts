/** Wallet chip: gem icon + rolling number, "+N"/"−N" pops at the counter, a friendly shake. */
import type { GameContext } from '../types';
import { h, retrigger } from './dom';
import { deltaText, rollToward } from './econ';
import type { PopKind } from './econ';
import { icon } from './icons';
import type { UiIconName } from './icons';

export interface WalletChip {
  el: HTMLElement;
  /** Roll the shown number toward the profile wallet. */
  update(dt: number): void;
  /** Jump straight to the current wallet (no roll). */
  snap(): void;
  pop(delta: number, kind: PopKind): void;
  /** Turn the newest pop into a mega-gem pop (when the mega flag arrives after the wallet change). */
  promoteMega(): void;
  shake(): void;
}

const POP_ICON: Partial<Record<PopKind, UiIconName>> = {
  mega: 'megaGem',
  bonus: 'mission',
  jackpot: 'jackpot',
  ticket: 'ticket',
  shop: 'shop',
};

/** Pops of the same kind this close together merge into one growing number (combo chains). */
const MERGE_MS = 380;

export function createWalletChip(ctx: GameContext, cls: string, testid: string): WalletChip {
  const num = h('span', 't n', {}, '0');
  const pops = h('div', 'pops');
  const el = h('div', `wallet ${cls}`.trim(), { 'data-testid': testid }, h('span', 'gemic', {}, icon('gem')), num, pops);
  let shown = ctx.profile.wallet;
  let target = shown;
  num.textContent = String(shown);
  let last: { el: HTMLElement; kind: PopKind; value: number; at: number; text: HTMLElement; timer: number } | null = null;

  const set = (v: number): void => {
    if (v === shown) return;
    const up = v > shown;
    shown = v;
    num.textContent = String(v);
    num.classList.toggle('up', up);
    num.classList.toggle('down', !up);
  };

  return {
    el,
    update(dt) {
      target = ctx.profile.wallet;
      if (shown !== target) set(rollToward(shown, target, Math.max(dt, 1 / 60)));
      else num.classList.remove('up', 'down');
    },
    snap() {
      target = ctx.profile.wallet;
      shown = target;
      num.textContent = String(shown);
      num.classList.remove('up', 'down');
    },
    pop(delta, kind) {
      const now = performance.now();
      if (last && last.kind === kind && (kind === 'gem' || kind === 'mega') && now - last.at < MERGE_MS && last.el.isConnected) {
        last.value += delta;
        last.at = now;
        last.text.textContent = deltaText(last.value);
        // Restart the float so a long combo chain keeps its number on screen.
        last.el.style.animation = 'none';
        void last.el.offsetWidth;
        last.el.style.animation = '';
        window.clearTimeout(last.timer);
        const p = last.el;
        last.timer = window.setTimeout(() => p.remove(), 2600);
        retrigger(last.el, 'again');
        retrigger(el, kind === 'mega' ? 'bump-big' : 'bump');
        return;
      }
      const text = h('span', 't v', {}, kind === 'free' ? '' : deltaText(delta));
      const ic = kind === 'free' ? 'star' : POP_ICON[kind];
      const p = h(
        'div',
        `pop k-${kind} ${delta < 0 ? 'neg' : 'pos'}`,
        { 'data-testid': 'wallet-pop', 'data-kind': kind },
        ic ? icon(ic) : null,
        kind === 'free' ? icon('ticket') : null,
        text,
        kind === 'mega' || kind === 'jackpot' || kind === 'bonus' ? h('span', 'rays') : null,
      );
      while (pops.children.length > 3) pops.firstElementChild?.remove();
      // Pops that are still flying sit side by side in the lane under the wallet, never stacked.
      let x = 0;
      for (const c of pops.children) x = Math.max(x, (c as HTMLElement).offsetLeft + (c as HTMLElement).offsetWidth);
      p.style.left = `${x > 0 ? x + 6 : 0}px`;
      pops.append(p);
      p.addEventListener('animationend', (e) => {
        if (e.target === p && e.animationName === 'rg-popfly') p.remove();
      });
      const timer = window.setTimeout(() => p.remove(), 2600);
      last = { el: p, kind, value: delta, at: now, text, timer };
      retrigger(el, kind === 'mega' || kind === 'jackpot' ? 'bump-big' : 'bump');
    },
    promoteMega() {
      if (!last || !last.el.isConnected || last.kind === 'mega') return;
      last.kind = 'mega';
      last.el.classList.replace('k-gem', 'k-mega');
      last.el.dataset.kind = 'mega';
      last.el.prepend(icon('megaGem'));
      last.el.append(h('span', 'rays'));
      retrigger(last.el, 'again');
      retrigger(el, 'bump-big');
    },
    shake() {
      retrigger(el, 'shake');
    },
  };
}
