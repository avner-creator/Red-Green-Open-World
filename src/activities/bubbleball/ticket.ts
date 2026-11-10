/**
 * Ride tickets and prizes for the bumper games, coded defensively: the economy (`ctx.profile`,
 * Stream C) may not be on this build yet. Without it every game is free and prizes are just
 * toasts. With it: the first play of each game per session is free, then a 3-gem ticket; a child
 * with too few gems gets a "need more gems" toast (gems are everywhere on the island, so nobody is
 * locked out of everything).
 */
import type { GameContext } from '../../types';

export const TICKET_PRICE = 3;

/** The subset of the economy's ProfileApi used here. */
export interface WalletLike {
  readonly wallet: number;
  earn(amount: number, reason: 'mission'): void;
  spend(amount: number, reason: 'ticket'): boolean;
}

export function walletOf(ctx: GameContext): WalletLike | null {
  const p = (ctx as unknown as { profile?: Partial<WalletLike> }).profile;
  if (!p || typeof p.earn !== 'function' || typeof p.spend !== 'function') return null;
  return p as WalletLike;
}

export interface Ticket {
  /** Try to pay for one play. True = go. */
  pay(): boolean;
  /** Pay a prize. */
  prize(gems: number): void;
  /** New session: the next play is free again. */
  reset(): void;
  dispose(): void;
  readonly freeLeft: boolean;
}

export function createTicket(ctx: GameContext): Ticket {
  let free = true;
  const off = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') free = true;
  });
  return {
    get freeLeft() {
      return free;
    },
    pay() {
      if (free) {
        free = false;
        return true;
      }
      const w = walletOf(ctx);
      if (!w) return true;
      if (w.spend(TICKET_PRICE, 'ticket')) return true;
      ctx.events.emit('ui:toast', { icon: 'gem', text: `${TICKET_PRICE - Math.max(0, Math.floor(w.wallet))}+` });
      ctx.audio.play('click', { pitch: 0.7 });
      return false;
    },
    prize(gems) {
      if (gems <= 0) return;
      const w = walletOf(ctx);
      if (w) w.earn(gems, 'mission');
    },
    reset() {
      free = true;
    },
    dispose() {
      off();
    },
  };
}
