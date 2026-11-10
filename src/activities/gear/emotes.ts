/**
 * Shop emotes. The emote input (C/G, D-pad Up, touch button) is read by the player, whose
 * `emote()` asks this module first through `setEmoteHandler`: with a shop emote equipped it plays
 * here for about two seconds, otherwise the character's signature emote plays as before.
 * `emote:play` still plays an emote on request. A short ExternalController holds the player in
 * place and plays the animation; moving or jumping hands control straight back. A character with
 * no good clip for an emote does its signature emote instead.
 */
import * as THREE from 'three';
import type { ExternalController, GameContext } from '../../types';
import { Confetti } from '../chests/confetti';
import { emoteKind } from './catalog';
import type { EmoteKind } from './catalog';
import { EMOTES, EMOTE_SECONDS, canStartEmote, emoteAnimFor, emoteCancelled } from './emoteLogic';

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

  /** True while the explicit-request fallback calls the signature emote (skip the handler). */
  let signatureOnly = false;

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
    const anim = emoteAnimFor(ctx.player.characterId, kind);
    if (!anim) return false;
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
    ctx.player.setAnimation(anim);
    ctx.audio.play(spec.sfx, { pitch: spec.sfxPitch, volume: spec.sfxVolume });
    tmp.copy(ctx.player.position);
    tmp.y += 1.6;
    confetti.burst(tmp, spec.puff);
    return true;
  }

  // The emote button: the equipped shop emote, if any and if this character can do it.
  ctx.player.setEmoteHandler?.(() => {
    if (signatureOnly) return false;
    const id = ctx.profile.equipped('emote');
    return id !== null && play(id, true);
  });
  const off = ctx.events.on('emote:play', (e) => {
    if (play(e.itemId, false) || active) return;
    // No clip for it on this character: its signature emote instead.
    if (ctx.session.state.phase !== 'playing') return;
    signatureOnly = true;
    try {
      ctx.player.emote();
    } finally {
      signatureOnly = false;
    }
  });

  return {
    update(dt) {
      confetti.update(dt);
    },
    play,
    playing: () => active?.kind ?? null,
    dispose() {
      ctx.player.setEmoteHandler?.(null);
      off();
      if (active) ctx.player.setExternalController(null);
      ctx.scene.remove(confetti.group);
      confetti.dispose();
    },
  };
}
