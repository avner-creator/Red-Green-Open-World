/**
 * Gear: things to wear (outfits, paints, trails, emotes). Registers the catalog with the economy
 * and keeps the player and the buggy matching the saved profile.
 */
import type { GameContext, GameSystem } from '../../types';
import { createApplier } from './applier';
import type { WornSlot } from './look';
import { GEAR_CATALOG } from './catalog';
import { createEmotes } from './emotes';
import { createTrails } from './trails';

export { GEAR_CATALOG } from './catalog';

/** Test hook (`window.__rgGear`, only with `?test=1`). */
export interface GearTestApi {
  /** Item ids attached to the player per slot. */
  attached(): Record<WornSlot, string | null>;
  /** Colour hex the first buggy is painted in, or null if there is none. */
  carColor(): number | null;
  /** Active trail kind (sparkle | bubbles | rainbow) or null. */
  trail(): string | null;
  /** Trail particles alive right now (the rainbow ribbon is not counted). */
  particles(): number;
  /** Path samples in the rainbow ribbon right now. */
  ribbonSamples(): number;
  /** Emote playing right now, or null. */
  emote(): string | null;
  /** Play an emote now (equipped one when omitted); false if it cannot start. */
  playEmote(itemId?: string): boolean;
}

declare global {
  interface Window {
    __rgGear?: GearTestApi;
  }
}

export function createGear(ctx: GameContext): GameSystem {
  ctx.economy.registerItems(GEAR_CATALOG);

  const applier = createApplier(ctx);
  const trails = createTrails(ctx);
  const emotes = createEmotes(ctx);
  applier.sync(false);

  const offs = [
    ctx.events.on('item:equipped', () => applier.sync(true)),
    ctx.events.on('profile:reset', () => applier.sync(false)),
    ctx.events.on('session:phase', (e) => {
      if (e.phase === 'title' || (e.phase === 'playing' && e.previous === 'title')) applier.sync(false);
    }),
  ];

  if (ctx.testMode) {
    window.__rgGear = {
      attached: () => applier.attached(),
      carColor: () => applier.carColor(),
      trail: () => trails.active(),
      particles: () => trails.particleCount(),
      ribbonSamples: () => trails.ribbonSamples(),
      emote: () => emotes.playing(),
      playEmote: (id) => emotes.play(id),
    };
  }

  return {
    update(dt) {
      applier.update(dt);
      trails.update(dt);
      emotes.update(dt);
    },
    dispose() {
      for (const off of offs) off();
      applier.dispose();
      trails.dispose();
      emotes.dispose();
      if (window.__rgGear) delete window.__rgGear;
    },
  };
}
