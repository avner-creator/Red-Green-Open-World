/**
 * Rewards and results for glasses play.
 *
 * `pay` pays through the gem economy when it exists (`ctx.profile.earn(amount, 'mission')`, added
 * by the economy stream; coded defensively without importing its types) and always gives the
 * feedback: a HUD toast (gem icon, "+N") and a cheerful non-positional sound. It never spawns a
 * both-eye effect in the world: a sparkle at the spot of a weak-eye object that is still there
 * would show it to the strong eye. Mechanics draw their own celebration ON their layer.
 */
import type { EventBus, GameContext, GlassesKind, GlassesTier, SfxName } from '../../types';

/** What the framework needs from the context (a structural subset, so tests can fake it). */
export type RewardCtx = Pick<GameContext, 'events'> & { audio: { play(name: SfxName, opts?: { volume?: number; pitch?: number }): void } };

interface ProfileLike {
  earn(amount: number, reason: string): unknown;
}

function profileOf(ctx: object): ProfileLike | null {
  const p = (ctx as { profile?: unknown }).profile;
  if (p && typeof p === 'object' && typeof (p as { earn?: unknown }).earn === 'function') return p as ProfileLike;
  return null;
}

/** Pay `gems` (rounded, ≥ 0). Returns true if an economy took the payment. */
export function pay(ctx: RewardCtx, gems: number): boolean {
  const n = Math.max(0, Math.round(gems));
  if (n === 0) return false;
  let paid = false;
  const profile = profileOf(ctx);
  if (profile) {
    try {
      profile.earn(n, 'mission');
      paid = true;
    } catch (e) {
      console.warn('glasses: profile.earn failed', e);
    }
  }
  ctx.events.emit('ui:toast', { icon: 'gem', text: `+${n}` });
  ctx.audio.play('star', { pitch: 1.15 });
  return paid;
}

/** Report a glasses-play hit or miss (scoring, the grown-up summary, the auto-challenge staircase). */
export function result(events: Pick<EventBus, 'emit'>, mechanic: string, kind: GlassesKind, tier: GlassesTier, hit: boolean): void {
  events.emit('glasses:result', { mechanic, kind, tier, hit });
}
