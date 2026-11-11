/**
 * Rewards and results for glasses play.
 *
 * `pay` pays into the player's wallet (`ctx.profile.earn(amount, 'mission')`) and always gives the
 * feedback: a HUD toast (gem icon, "+N") and a cheerful non-positional sound. It never spawns a
 * both-eye effect in the world: a sparkle at the spot of a weak-eye object that is still there
 * would show it to the strong eye. Mechanics draw their own celebration ON their layer.
 */
import type { EventBus, GameContext, GlassesKind, GlassesTier, ProfileApi, SfxName } from '../../types';

/** What the framework needs from the context (a structural subset, so tests can fake it). */
export type RewardCtx = Pick<GameContext, 'events'> & {
  /** Optional only so unit tests can leave it out; the game always has one. */
  profile?: Pick<ProfileApi, 'earn'>;
  audio: { play(name: SfxName, opts?: { volume?: number; pitch?: number }): void };
};

/** Pay `gems` (rounded, ≥ 0). Returns true if the wallet took the payment. */
export function pay(ctx: RewardCtx, gems: number): boolean {
  const n = Math.max(0, Math.round(gems));
  if (n === 0) return false;
  let paid = false;
  const profile = ctx.profile;
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
