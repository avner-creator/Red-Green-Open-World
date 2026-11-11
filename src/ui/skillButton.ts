/**
 * The skill on screen while playing: a HUD chip (bottom-right: pictogram + key cap, dims during the
 * cooldown, pulses when ready) and the state hook for the touch Skill button.
 */
import type { PowerId } from '../core/skills-powers';
import type { GameContext } from '../types';
import { powerPicto } from './characterSelectPowers';
import { injectCharacterCss } from './characterSelectCss';
import { controlKeys } from './controlGlyphs';
import { h } from './dom';

interface SkillView {
  update(): void;
}

/** Tracks the player's skill and applies ready / cooldown / active to an element. */
function bindSkillState(ctx: GameContext, host: HTMLElement, ring: HTMLElement, slot: HTMLElement, onSkill?: () => void): SkillView {
  let id: string | null = null;
  let maxCd = 0.5;
  let cls = '';
  let frac = -1;
  return {
    update() {
      const sk = ctx.player.skill;
      // The chosen super power's picture (an extra power runs beside the classic skill `sk.id`).
      const shown = sk.power ?? sk.id;
      if (shown !== id) {
        id = shown;
        slot.replaceChildren(powerPicto(shown as PowerId, true));
        maxCd = 0.5;
        onSkill?.();
      }
      maxCd = Math.max(maxCd, sk.cooldown);
      const next = sk.active ? 'act' : sk.ready ? 'ready' : 'cd';
      if (next !== cls) {
        if (cls) host.classList.remove(cls);
        host.classList.add(next);
        cls = next;
      }
      const f = sk.ready || sk.active ? 1 : Math.round((1 - sk.cooldown / maxCd) * 50) / 50;
      if (f !== frac) {
        frac = f;
        ring.style.setProperty('--p', String(f));
      }
      host.dataset.skill = sk.id;
      host.dataset.power = shown;
    },
  };
}

export interface SkillChip {
  update(): void;
}

export function createSkillChip(ctx: GameContext): SkillChip {
  injectCharacterCss();
  const ring = h('span', 'cdring');
  const slot = h('span', 'slot', { style: 'display:contents' });
  const key = h('span', 'key');
  const el = h('div', 'skchip', { 'data-testid': 'skill-chip' }, ring, slot, key);
  ctx.uiRoot.append(el);
  let device = ctx.input.state.device;
  const drawKey = (): void => key.replaceChildren(controlKeys('skill', device));
  drawKey();
  const view = bindSkillState(ctx, el, ring, slot);
  return {
    update() {
      view.update();
      if (ctx.input.state.device !== device) {
        device = ctx.input.state.device;
        drawKey();
      }
    },
  };
}

/** Fill and drive the touch Skill button (created by the touch HUD). */
export function bindTouchSkill(ctx: GameContext, button: HTMLElement, slot: HTMLElement): SkillView {
  injectCharacterCss();
  slot.style.display = 'contents';
  const ring = h('span', 'cdring');
  button.prepend(ring);
  return bindSkillState(ctx, button, ring, slot);
}
