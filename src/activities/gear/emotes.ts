/**
 * Emotes: press G (or an `emote:play` event) to play the equipped emote for about two seconds.
 * A short ExternalController holds the player in place and plays the animation; moving or jumping
 * hands control straight back.
 */
import * as THREE from 'three';
import type { ExternalController, GameContext } from '../../types';
import { Confetti } from '../chests/confetti';
import { emoteKind } from './catalog';
import type { EmoteKind } from './catalog';
import { EMOTES, EMOTE_SECONDS, canStartEmote, emoteCancelled } from './emoteLogic';

export interface Emotes {
  update(dt: number): void;
  /** Play an emote (the equipped one when `itemId` is omitted). Returns false if it cannot start now. */
  play(itemId?: string, fromKey?: boolean): boolean;
  playing(): EmoteKind | null;
  dispose(): void;
}

export function createEmotes(ctx: GameContext): Emotes {
  const confetti = new Confetti();
  ctx.scene.add(confetti.group);
  let active: { kind: EmoteKind; controller: ExternalController } | null = null;
  const tmp = new THREE.Vector3();

  function play(itemId?: string, fromKey = false): boolean {
    if (active) return false;
    const kind = emoteKind(itemId ?? ctx.profile.equipped('emote') ?? 'emote-wave') ?? 'wave';
    const ok = canStartEmote({
      phase: ctx.session.state.phase,
      mode: ctx.player.mode,
      grounded: ctx.player.grounded,
      hasVehicle: ctx.player.vehicle !== null,
      menuOpen: ctx.ui?.menuOpen ?? false,
      fromKey,
    });
    if (!ok) return false;
    const spec = EMOTES[kind];
    let t = 0;
    const controller: ExternalController = {
      update(dt, input) {
        t += dt;
        if (t >= EMOTE_SECONDS || emoteCancelled(input)) return false;
        return true;
      },
      onRelease() {
        if (active?.controller === controller) active = null;
      },
    };
    active = { kind, controller };
    ctx.player.setExternalController(controller);
    ctx.player.setAnimation(spec.anim);
    ctx.audio.play(spec.sfx, { pitch: spec.sfxPitch, volume: spec.sfxVolume });
    tmp.copy(ctx.player.position);
    tmp.y += 1.6;
    confetti.burst(tmp, spec.puff);
    return true;
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyG' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    play(undefined, true);
  };
  window.addEventListener('keydown', onKey);
  const off = ctx.events.on('emote:play', (e) => {
    play(e.itemId, false);
  });

  return {
    update(dt) {
      confetti.update(dt);
    },
    play,
    playing: () => active?.kind ?? null,
    dispose() {
      window.removeEventListener('keydown', onKey);
      off();
      if (active) ctx.player.setExternalController(null);
      ctx.scene.remove(confetti.group);
      confetti.dispose();
    },
  };
}
