/**
 * Touch emote button: a small round button on the left edge, above the joystick's resting place.
 * It lives inside the touch HUD (so it shows only in touch mode while playing) and is hidden while
 * driving, riding or in the air, or when no emote can be played. A tap emits `emote:play`; with no
 * emote equipped the gear side plays the free starter wave.
 */
import type { GameContext } from '../types';
import { h } from './dom';
import { icon } from './icons';

export interface TouchEmote {
  update(): void;
}

export function createTouchEmote(ctx: GameContext): TouchEmote {
  const btn = h('button', 'tbtn emote', { type: 'button', 'aria-label': 'Emote', 'data-testid': 'touch-emote', tabindex: '-1' }, icon('emote'));
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.classList.add('down');
    ctx.events.emit('emote:play', {});
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) btn.addEventListener(ev, () => btn.classList.remove('down'));
  let host: Element | null = null;
  let shown: boolean | null = null;
  return {
    update() {
      if (!host) {
        host = ctx.uiRoot.querySelector('[data-testid="touch-hud"]');
        if (!host) return;
        host.append(btn);
      }
      const p = ctx.profile;
      const has = !!p.equipped('emote') || p.owns('emote-wave');
      const on = has && ctx.player?.mode === 'walk' && ctx.player.vehicle === null;
      if (on !== shown) {
        shown = on;
        btn.classList.toggle('off', !on);
      }
    },
  };
}
