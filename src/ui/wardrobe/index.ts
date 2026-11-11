/**
 * Wardrobe entry points: the HUD hanger button (with its "new!" badge), the I key / gamepad D-pad
 * left, and `openWardrobe()` for other screens (the hero select's `csel-wardrobe` mount calls it).
 */
import type { GameContext } from '../../types';
import { h, retrigger } from '../dom';
import { cap, padButton } from '../glyphs';
import { icon } from '../icons';
import { badgeIds } from './logic';
import type { SeenStore } from './seen';

export { createDressingRoom } from './screen';
export type { DressingRoom } from './screen';
export { createSeenStore } from './seen';

let opener: (() => void) | null = null;

/** Open the dressing room from anywhere (title, hero select, pause…). No-op before the UI exists. */
export function openWardrobe(): void {
  opener?.();
}

/** The UI registers how to open the dressing room from a menu. */
export function setWardrobeOpener(fn: (() => void) | null): void {
  opener = fn;
}

/** True when the hero may change clothes right now in play: on foot, not on a ride or in a car. */
export function canDressNow(ctx: GameContext): boolean {
  return ctx.session.state.phase === 'playing' && ctx.player.mode === 'walk' && !ctx.player.vehicle;
}

export interface WardrobeButton {
  el: HTMLButtonElement;
  update(dt: number): void;
}

/** The big round HUD button: a hanger with a hat; a bouncing "!" when something new is waiting. */
export function createWardrobeButton(ctx: GameContext, seen: SeenStore, open: () => void): WardrobeButton {
  const badge = h('span', 'wb-new', { 'data-testid': 'hud-wardrobe-new', 'aria-hidden': 'true' }, h('span', 't', {}, '!'));
  const key = h('span', 'wb-key');
  const el = h(
    'button',
    'b wbtn',
    { type: 'button', 'aria-label': 'Wardrobe', 'data-testid': 'hud-wardrobe' },
    h('span', 'wb-ic', {}, icon('hanger')),
    badge,
    key,
  );
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!canDressNow(ctx)) {
      retrigger(el, 'shake');
      ctx.audio.play('bump');
      return;
    }
    open();
  });
  let check = 0;
  let device = '';
  let wasNew = false;
  return {
    el,
    update(dt) {
      // Greyed out on rides and in vehicles (still tappable: it shakes "not now"). One clean
      // disabled look (QA6 m11): just the grey hanger, no "new!" badge and no key cap; the badge
      // comes back (with its pop) once the hero is on foot again.
      const can = canDressNow(ctx);
      const flip = el.classList.contains('off') === can;
      el.classList.toggle('off', !can);
      check -= dt;
      if (check > 0 && !flip) return;
      check = 0.25;
      const fresh = can && badgeIds(ctx.economy.catalog, (id) => ctx.profile.owns(id), ctx.profile.wallet, seen.ids).length > 0;
      badge.classList.toggle('on', fresh);
      if (fresh && !wasNew) retrigger(el, 'pop');
      wasNew = fresh;
      const d = ctx.input.state.device;
      if (d !== device) {
        device = d;
        key.replaceChildren();
        if (d === 'keyboard') key.append(cap('I'));
        else if (d === 'gamepad') key.append(padButton('←'));
      }
    },
  };
}
