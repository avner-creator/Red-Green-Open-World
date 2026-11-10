/**
 * Keeps the thrill rides from spamming the screen: the HUD toasts every `stunt` event, so stunts of
 * one kind are merged (stars added, latest value) and released at most once per second, and extra
 * `ui:toast`s are dropped while a toast is still fresh. Scoring is unchanged: stars are only delayed
 * by up to a second, never lost.
 */
import type { GameContext, GameEvents } from '../types';

type Stunt = GameEvents['stunt'];
type Emit = <K extends 'stunt' | 'ui:toast'>(name: K, payload: GameEvents[K]) => void;

export const TOAST_INTERVAL = 1;

export class StuntGate {
  private sinceShown = TOAST_INTERVAL;
  private readonly pending = new Map<string, Stunt>();

  constructor(private readonly emit: Emit) {}

  /** Emit now when the last toast was over a second ago, otherwise merge into the pending one of the same kind. */
  stunt(e: Stunt): void {
    const old = this.pending.get(e.kind);
    if (old) {
      this.pending.set(e.kind, { ...e, value: Math.max(old.value, e.value), stars: old.stars + e.stars });
    } else if (this.sinceShown >= TOAST_INTERVAL) {
      this.sinceShown = 0;
      this.emit('stunt', e);
    } else {
      this.pending.set(e.kind, e);
    }
  }

  /** A plain toast, dropped while another is still fresh. */
  toast(e: GameEvents['ui:toast']): void {
    if (this.sinceShown < TOAST_INTERVAL) return;
    this.sinceShown = 0;
    this.emit('ui:toast', e);
  }

  update(dt: number): void {
    this.sinceShown += dt;
    if (this.sinceShown < TOAST_INTERVAL || this.pending.size === 0) return;
    const next = this.pending.entries().next();
    if (next.done) return;
    const [kind, e] = next.value;
    this.pending.delete(kind);
    this.sinceShown = 0;
    this.emit('stunt', e);
  }

  reset(): void {
    this.pending.clear();
    this.sinceShown = TOAST_INTERVAL;
  }
}

const gates = new WeakMap<GameContext, StuntGate>();

/** The one gate per game context. */
export function getStuntGate(ctx: GameContext): StuntGate {
  let g = gates.get(ctx);
  if (!g) {
    g = new StuntGate((name, payload) => ctx.events.emit(name, payload));
    gates.set(ctx, g);
  }
  return g;
}
