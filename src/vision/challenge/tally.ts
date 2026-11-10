/**
 * Pure per-session aggregator for the grown-up summary: hits and misses per mechanic + tier.
 */
import type { GlassesKind, GlassesTally, GlassesTier } from '../../types';

export interface GlassesResult {
  mechanic: string;
  kind: GlassesKind;
  tier: GlassesTier;
  hit: boolean;
}

export class SessionTally {
  private readonly rowsByKey = new Map<string, GlassesTally>();

  record(r: GlassesResult): void {
    const tier: GlassesTier = r.tier === 2 || r.tier === 3 ? r.tier : 1;
    const key = `${r.mechanic}\u0000${tier}`;
    let row = this.rowsByKey.get(key);
    if (!row) {
      row = { mechanic: r.mechanic, kind: r.kind, tier, hits: 0, misses: 0 };
      this.rowsByKey.set(key, row);
    }
    if (r.hit) row.hits += 1;
    else row.misses += 1;
  }

  /** Copies of the rows, in the order they first appeared. */
  rows(): GlassesTally[] {
    return [...this.rowsByKey.values()].map((r) => ({ ...r }));
  }

  clear(): void {
    this.rowsByKey.clear();
  }
}
