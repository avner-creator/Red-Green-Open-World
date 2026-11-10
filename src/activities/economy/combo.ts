/** Combo streak (pure): pickups within `window` seconds of each other build a multiplier. */

export interface ComboState {
  multiplier: number;
  streak: number;
  timeLeft: number;
}

export class ComboTracker {
  readonly state: ComboState = { multiplier: 1, streak: 0, timeLeft: 0 };

  constructor(
    private readonly window: number,
    private readonly max: number,
  ) {}

  /** A pickup happened: extend the streak and restart the window. Returns the multiplier to pay with. */
  hit(): number {
    const s = this.state;
    s.streak += 1;
    s.multiplier = Math.min(s.streak, this.max);
    s.timeLeft = this.window;
    return s.multiplier;
  }

  /** Advance time. Returns true when the streak just dropped back to x1. */
  update(dt: number): boolean {
    const s = this.state;
    if (s.streak === 0) return false;
    s.timeLeft = Math.max(0, s.timeLeft - dt);
    if (s.timeLeft > 0) return false;
    this.reset();
    return true;
  }

  reset(): void {
    const s = this.state;
    s.streak = 0;
    s.multiplier = 1;
    s.timeLeft = 0;
  }
}
