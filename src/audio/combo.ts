/** Pure gem-combo logic (time injected in seconds, no WebAudio). */

/** Rising arpeggio for combo steps: C6 E6 G6 C7 E7 (MIDI). */
export const COMBO_NOTES: readonly number[] = [84, 88, 91, 96, 100];
export const COMBO_WINDOW = 3;
export const COMBO_MAX_STEPS = COMBO_NOTES.length;

export interface ComboHit {
  /** 0-based step in the current combo, capped at COMBO_MAX_STEPS - 1. */
  step: number;
  /** How many gems in a row so far (uncapped). */
  chain: number;
  /** True the moment the combo reaches its top step. */
  maxed: boolean;
}

/** Gems collected within `window` seconds of each other build a combo, up to `maxSteps`. */
export class GemCombo {
  private last = -Infinity;
  private chain = 0;
  constructor(
    private readonly window = COMBO_WINDOW,
    private readonly maxSteps = COMBO_MAX_STEPS,
  ) {}

  hit(now: number): ComboHit {
    this.chain = now - this.last <= this.window && now >= this.last ? this.chain + 1 : 1;
    this.last = now;
    const step = Math.min(this.chain, this.maxSteps) - 1;
    return { step, chain: this.chain, maxed: this.chain === this.maxSteps };
  }

  reset(): void {
    this.last = -Infinity;
    this.chain = 0;
  }
}

/** Notes of the rising run for a combo step: every note up to and including the step's. */
export function comboArpeggio(step: number): number[] {
  const s = Math.min(Math.max(Math.floor(step), 0), COMBO_NOTES.length - 1);
  return COMBO_NOTES.slice(0, s + 1);
}

/**
 * A "big" gem earns the fat ka-ching: the last gem of the map, every 5th gem, or the moment a
 * combo reaches its top step.
 */
export function isBigGem(count: number, total: number, hit: ComboHit): boolean {
  if (total > 0 && count >= total) return true;
  if (count > 0 && count % 5 === 0) return true;
  return hit.maxed;
}
