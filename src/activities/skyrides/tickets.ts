/**
 * Gems as money for the sky rides, coded defensively: the economy (`ctx.profile`) may not be on
 * main yet. First ride of each kind per session is free, then a 3-gem ticket; prizes are paid with
 * `profile.earn`. Without a profile every ride is free and prizes are just stars and toasts.
 */
import type { GameContext, TicketKind, TicketOutcome } from '../../types';

/** The part of the economy profile we use (see the economy stream's ProfileApi). */
export interface WalletLike {
  readonly wallet: number;
  earn(amount: number, reason: 'gem' | 'mission'): void;
  spend(amount: number, reason: 'ticket'): boolean;
}

export function walletOf(ctx: GameContext): WalletLike | null {
  const p = (ctx as unknown as { profile?: Partial<WalletLike> }).profile;
  if (!p || typeof p.earn !== 'function' || typeof p.spend !== 'function') return null;
  return p as WalletLike;
}

export const TICKET_PRICE = 3;

/**
 * Tickets through the economy (`ctx.economy.rideTicket`): first ride of each kind per session free,
 * then 3 gems; a child who cannot pay rides anyway as practice (no contest prize).
 */
export class RideTickets {
  private outcome: TicketOutcome = 'free';

  constructor(
    private readonly ctx: GameContext,
    private readonly kind: TicketKind,
  ) {}

  /** Price of the next ride (0 = free). */
  get price(): number {
    const e = (this.ctx as Partial<GameContext>).economy;
    return e ? e.ticketPrice(this.kind) : 0;
  }

  /** True while the current ride is a practice ride (no prize). */
  get practice(): boolean {
    return this.outcome === 'practice';
  }

  /** Pay for a ride. Always true: nobody is locked out (practice ride instead). */
  pay(): boolean {
    const e = (this.ctx as Partial<GameContext>).economy;
    this.outcome = e ? e.rideTicket(this.kind) : 'free';
    if (this.outcome === 'practice') this.ctx.audio.play('click', { pitch: 0.7 });
    return true;
  }

  /** New session (the economy resets its own free-ride count). */
  reset(): void {
    this.outcome = 'free';
  }
}

/** Pay a prize into the wallet (if there is one). */
export function payPrize(ctx: GameContext, gems: number, reason: 'gem' | 'mission' = 'mission'): void {
  if (gems <= 0) return;
  walletOf(ctx)?.earn(gems, reason);
}
