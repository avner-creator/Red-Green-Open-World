/**
 * Buggy workshop catalog and pure rules (unit-tested): what each silly upgrade costs, what it does
 * to the buggy's tuning, and the card-row selection logic of the workshop menu.
 */
import type { BuggyTuning } from '../../core/vehicles/types';

export type UpgradeId = 'monsterWheels' | 'springBumper' | 'bubbleExhaust' | 'rocketBoost' | 'musicalHorns' | 'duckOrnament' | 'confettiCannon';

/** Which control fires the upgrade while driving (shown as a key glyph on its card), if any. */
export type UpgradeKey = 'skill' | 'horn' | 'hop' | null;

export interface UpgradeDef {
  id: UpgradeId;
  /** Price in gems. */
  price: number;
  /** Short name (shown small; the picture is what matters). */
  name: string;
  key: UpgradeKey;
}

/** In menu order: cheap and silly first, the big ones last. */
export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'musicalHorns', price: 4, name: 'Music horns', key: 'horn' },
  { id: 'duckOrnament', price: 5, name: 'Roof duck', key: null },
  { id: 'springBumper', price: 8, name: 'Spring bumper', key: null },
  { id: 'bubbleExhaust', price: 10, name: 'Bubble pipes', key: null },
  { id: 'confettiCannon', price: 12, name: 'Confetti cannon', key: 'hop' },
  { id: 'monsterWheels', price: 15, name: 'Monster wheels', key: null },
  { id: 'rocketBoost', price: 20, name: 'Rocket boost', key: 'skill' },
];

export const UPGRADE_IDS: readonly UpgradeId[] = UPGRADES.map((u) => u.id);

export function upgradeDef(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

/** Profile / storage item id for an upgrade (namespaced so it never clashes with shop gear). */
export const itemId = (id: UpgradeId): string => `buggy-${id}`;

/** Rocket boost: extra top speed (m/s), seconds, instant kick (m/s), cooldown (s). */
export const ROCKET = { extra: 7, seconds: 1.2, kick: 3.5, cooldown: 3.2 } as const;

/** Buggy tuning for a set of fitted upgrades (only the ones that change the handling). */
export function tuningFor(fitted: ReadonlySet<UpgradeId>): BuggyTuning {
  const t: BuggyTuning = { wheelScale: 1, hopScale: 1, bounceScale: 1, offroadAsRoad: false };
  if (fitted.has('monsterWheels')) {
    t.wheelScale = 1.36;
    t.hopScale = 1.4;
    t.bounceScale = 1.2;
    t.offroadAsRoad = true;
  }
  if (fitted.has('springBumper')) t.bounceScale *= 1.8;
  return t;
}

export type BuyOutcome = 'bought' | 'fitted' | 'removed' | 'tooPoor';

/**
 * What pressing a card does: buy it (if affordable), or fit / take off an owned one.
 * Pure: the caller applies the outcome.
 */
export function cardAction(owned: boolean, fitted: boolean, wallet: number, price: number): BuyOutcome {
  if (owned) return fitted ? 'removed' : 'fitted';
  return wallet >= price ? 'bought' : 'tooPoor';
}

/** Gems still needed for an item (0 when affordable). */
export function gemsShort(wallet: number, price: number): number {
  return Math.max(0, Math.ceil(price - wallet));
}

/**
 * Menu navigation with a stick or keys: moves one step per press, then repeats while held.
 * `x` is the stick value (−1..1). Returns the step (−1, 0, +1) for this frame.
 */
export class StickStepper {
  private held = 0;
  private wait = 0;
  constructor(private readonly first = 0.38, private readonly repeat = 0.16, private readonly dead = 0.5) {}
  step(x: number, dt: number): number {
    const dir = x > this.dead ? 1 : x < -this.dead ? -1 : 0;
    if (dir === 0) {
      this.held = 0;
      return 0;
    }
    if (dir !== this.held) {
      this.held = dir;
      this.wait = this.first;
      return dir;
    }
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = this.repeat;
      return dir;
    }
    return 0;
  }
}

/** Wrap an index into 0..n-1. */
export function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}
