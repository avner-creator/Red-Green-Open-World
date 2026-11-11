/**
 * What a round really paid: every wallet gain from the moment the ticket is settled until the
 * result card goes away (the prize, plus whatever the round set off at the same time: a Fun Pass
 * stamp prize, a finished mission, gems picked up on the way). The result card shows this total, so
 * the number on the card always equals the change in the wallet. Shared by the foam course and the
 * sky rides.
 */
import type { EventBus } from '../../types';

export class PrizeTally {
  /** Gems gained since `start()`. */
  total = 0;
  /** The prize the round itself paid (the rest came from stamps, missions or pickups). */
  prize = 0;
  private off: (() => void) | null = null;
  private listener: ((total: number) => void) | null = null;

  constructor(private readonly events: EventBus) {}

  /** Start counting (call right after the ticket is paid, so the ticket is not counted). */
  start(): void {
    this.stop();
    this.total = 0;
    this.prize = 0;
    this.off = this.events.on('wallet:changed', (e) => {
      if (e.delta <= 0) return;
      this.total += e.delta;
      this.listener?.(this.total);
    });
  }

  /** Called with the new total whenever a gain lands while counting. */
  onChange(fn: ((total: number) => void) | null): void {
    this.listener = fn;
  }

  /** Remember which part of the total is the round's own prize (for the card's breakdown). */
  notePrize(gems: number): void {
    this.prize += gems;
  }

  /** The part that came from elsewhere (stamp prize, mission bonus, pickups). */
  get bonus(): number {
    return Math.max(0, this.total - this.prize);
  }

  stop(): void {
    this.off?.();
    this.off = null;
  }

  get counting(): boolean {
    return this.off !== null;
  }
}
