/**
 * Gems as money for the sky rides, coded defensively: the economy (`ctx.profile`) may not be on
 * main yet. First ride of each kind per session is free, then a 3-gem ticket; prizes are paid with
 * `profile.earn`. Without a profile every ride is free and prizes are just stars and toasts.
 */
import type { GameContext } from '../../types';
import { ticketPrice } from './contestLogic';

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

export class RideTickets {
  private rides = 0;

  constructor(private readonly ctx: GameContext) {}

  /** Price of the next ride (0 = free). */
  get price(): number {
    return walletOf(this.ctx) ? ticketPrice(this.rides, TICKET_PRICE) : 0;
  }

  /** Try to pay for a ride. true = go. On false a toast says how many more gems are needed. */
  pay(): boolean {
    const w = walletOf(this.ctx);
    const price = this.price;
    if (!w || price === 0) {
      this.rides++;
      return true;
    }
    if (w.spend(price, 'ticket')) {
      this.rides++;
      return true;
    }
    const need = Math.max(1, price - Math.floor(w.wallet));
    this.ctx.events.emit('ui:toast', { icon: 'lock', text: `+${need}` });
    this.ctx.audio.play('click', { pitch: 0.7 });
    return false;
  }

  /** New session: the first ride is free again. */
  reset(): void {
    this.rides = 0;
  }
}

/** Pay a prize into the wallet (if there is one). */
export function payPrize(ctx: GameContext, gems: number, reason: 'gem' | 'mission' = 'mission'): void {
  if (gems <= 0) return;
  walletOf(ctx)?.earn(gems, reason);
}
