/**
 * Ride tickets and prizes for the bumper games, through the economy (`ctx.economy.rideTicket`):
 * the first play of each game per session is free, then a 3-gem ticket. A child with too few gems
 * still plays a practice round (no prize; the economy emits `ticket:denied` so the HUD and Pip can
 * say why). Without an economy (unit tests, old builds) every game is free and prizes are skipped.
 */
import type { GameContext, TicketKind, TicketOutcome } from '../../types';

export interface Ticket {
  /** Pay for one play. Always true: a child who cannot pay plays a practice round. */
  pay(): boolean;
  /** Pay a prize (nothing in a practice round). Returns the gems actually paid. */
  prize(gems: number): number;
  /** Kept for callers; the economy resets the free play at each new session. */
  reset(): void;
  dispose(): void;
  /** The outcome of the last `pay()`. */
  readonly last: TicketOutcome;
  /** True when the last `pay()` started a practice round (no prize). */
  readonly practice: boolean;
  /**
   * Everything the wallet gained since the last `pay()` (the prize plus any mission, Fun Pass or
   * glasses bonus paid during the round), so the result card shows exactly what the wallet got.
   */
  gained(): number;
}

export function createTicket(ctx: GameContext, kind: TicketKind): Ticket {
  let last: TicketOutcome = 'free';
  let start = 0;
  const wallet = (): number => (ctx as Partial<GameContext>).profile?.wallet ?? 0;
  return {
    get last() {
      return last;
    },
    get practice() {
      return last === 'practice';
    },
    gained() {
      return Math.max(0, wallet() - start);
    },
    pay() {
      const economy = (ctx as Partial<GameContext>).economy;
      last = economy ? economy.rideTicket(kind) : 'free';
      if (last === 'practice') ctx.audio.play('click', { pitch: 0.7 });
      start = wallet();
      return true;
    },
    prize(gems) {
      const profile = (ctx as Partial<GameContext>).profile;
      if (gems <= 0 || last === 'practice' || !profile) return 0;
      profile.earn(gems, 'mission');
      return gems;
    },
    reset() {
      last = 'free';
      start = wallet();
    },
    dispose() {
      /* nothing held */
    },
  };
}
