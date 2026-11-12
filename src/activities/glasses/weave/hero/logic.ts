/**
 * Pure "lucky moment" rules of the hero helpers (no three, no DOM): unit-tested in
 * `tests/activities/glasses-weave-hero.test.ts`.
 *
 * Every 20–40 s of play (counted only while a helper is showing) one helper sparkles for a short
 * window (1.5 / 1.0 / 0.7 s by tier): the skill ring (only while the skill is ready and has not
 * been used for `calm` s) or the combo number (only while the combo is ×2 or more). Acting in the
 * window (skill fired / gem collected) is a hit; acting within `late` s after it closed is a miss;
 * anything else is no result. Acting sooner than `react` s after the sparkle started cannot be a
 * reaction to it: it spoils the window (no result), so a child who spams the skill gains nothing.
 *
 * Firing the skill makes it "not ready" in the same frame, and the game may notice that before it
 * hears `player:skill` (QA8 M4). So when a helper goes away mid-sparkle the window is held for
 * `grace` s: an act in that time still counts as acting in the window; only after it is cancelled.
 */
import type { GlassesTier } from '../../../../types';

export type SparkKind = 'skill' | 'combo';

export const HERO_LUCK = {
  /** Seconds of play (with a helper showing) between two sparkles. */
  gapMin: 20,
  gapMax: 40,
  /** Sparkle window (s) by tier. */
  window: { 1: 1.5, 2: 1.0, 3: 0.7 } as Readonly<Record<GlassesTier, number>>,
  /** Acting sooner than this after the sparkle starts is not a reaction: the window is spoiled. */
  react: 0.25,
  /** Acting within this many seconds after a window closed is a miss. */
  late: 1.5,
  /** A skill sparkle waits until the skill has been unused for this long (s). */
  calm: 3,
  /** A sparkle whose helper went away still takes an act for this long (s) before it is cancelled. */
  grace: 0.4,
  /** Gems for a hit. */
  gems: 2,
  /** Hits in a row to go up a tier (a miss goes down one). */
  hitsToRise: 2,
} as const;

export interface Spark {
  kind: SparkKind;
  /** Seconds since it started. */
  age: number;
  /** Window length (s). */
  len: number;
  tier: GlassesTier;
}

export type ActResult = { grade: 'hit' | 'miss'; kind: SparkKind; tier: GlassesTier } | null;

export class HeroLuck {
  tier: GlassesTier = 1;
  hitsInRow = 0;
  /** Seconds (with a helper showing) until the next sparkle. */
  nextIn: number;
  spark: Spark | null = null;
  /** The window that just closed: acting on it within `left` s is a miss. */
  late: { kind: SparkKind; left: number; tier: GlassesTier } | null = null;
  /** A sparkle whose helper just went away: an act within `left` s still counts in its window. */
  gone: { spark: Spark; left: number } | null = null;
  /** Seconds since the skill was last fired. */
  sinceSkill = Infinity;
  /** Counters (debug / tests). */
  opened = 0;
  spoiled = 0;
  cancelled = 0;

  constructor(private readonly rng: () => number) {
    this.nextIn = this.gap();
  }

  private gap(): number {
    return HERO_LUCK.gapMin + (HERO_LUCK.gapMax - HERO_LUCK.gapMin) * this.rng();
  }

  reset(): void {
    this.tier = 1;
    this.hitsInRow = 0;
    this.spark = null;
    this.late = null;
    this.gone = null;
    this.sinceSkill = Infinity;
    this.nextIn = this.gap();
    this.opened = this.spoiled = this.cancelled = 0;
  }

  /** Which sparkles could start now (the part passes what its helpers show). */
  canSpark(showing: Readonly<Record<SparkKind, boolean>>): SparkKind[] {
    const out: SparkKind[] = [];
    if (showing.skill && this.sinceSkill >= HERO_LUCK.calm) out.push('skill');
    if (showing.combo) out.push('combo');
    return out;
  }

  /** Start a sparkle now (scheduler or test hook). */
  open(kind: SparkKind, age = 0): Spark {
    this.spark = { kind, age, len: HERO_LUCK.window[this.tier], tier: this.tier };
    this.late = null;
    this.gone = null;
    this.opened++;
    return this.spark;
  }

  /**
   * Advance `dt` seconds. `showing` = which helpers are on screen and able to sparkle (skill ring
   * with the skill ready; combo number at ×2 or more). Returns what changed this step.
   */
  update(dt: number, showing: Readonly<Record<SparkKind, boolean>>): 'opened' | 'closed' | 'cancelled' | null {
    this.sinceSkill += dt;
    if (this.late) {
      this.late.left -= dt;
      if (this.late.left <= 0) this.late = null;
    }
    if (this.gone) {
      this.gone.left -= dt;
      if (this.gone.left > 0) return null;
      // The helper went away (vehicle, ride, combo ran out) and nobody acted: no result either way.
      this.gone = null;
      this.cancelled++;
      return 'cancelled';
    }
    const s = this.spark;
    if (s) {
      if (!showing[s.kind]) {
        // Held for a moment: firing the skill itself makes the ring go away (see the file comment).
        this.spark = null;
        this.gone = { spark: s, left: HERO_LUCK.grace };
        return null;
      }
      s.age += dt;
      if (s.age >= s.len) {
        this.spark = null;
        this.late = { kind: s.kind, left: HERO_LUCK.late, tier: s.tier };
        return 'closed';
      }
      return null;
    }
    if (!showing.skill && !showing.combo) return null;
    this.nextIn = Math.max(0, this.nextIn - dt);
    if (this.nextIn > 0) return null;
    const kinds = this.canSpark(showing);
    if (kinds.length === 0) return null; // wait (the countdown stays at 0) until one can sparkle
    const kind = kinds.length === 1 ? kinds[0] : kinds[Math.min(kinds.length - 1, Math.floor(this.rng() * kinds.length))];
    this.open(kind);
    this.nextIn = this.gap();
    return 'opened';
  }

  /** The child acted: fired the skill (`'skill'`) or collected a gem (`'combo'`). */
  act(kind: SparkKind): ActResult {
    if (kind === 'skill') this.sinceSkill = 0;
    const s = this.spark && this.spark.kind === kind ? this.spark : this.gone && this.gone.spark.kind === kind ? this.gone.spark : null;
    if (s) {
      this.spark = null;
      this.gone = null;
      if (s.age < HERO_LUCK.react) {
        this.spoiled++;
        return null;
      }
      this.grade(true);
      return { grade: 'hit', kind, tier: s.tier };
    }
    const l = this.late;
    if (l && l.kind === kind) {
      this.late = null;
      this.grade(false);
      return { grade: 'miss', kind, tier: l.tier };
    }
    return null;
  }

  private grade(hit: boolean): void {
    if (hit) {
      this.hitsInRow++;
      if (this.hitsInRow >= HERO_LUCK.hitsToRise) {
        this.hitsInRow = 0;
        if (this.tier < 3) this.tier = (this.tier + 1) as GlassesTier;
      }
    } else {
      this.hitsInRow = 0;
      if (this.tier > 1) this.tier = (this.tier - 1) as GlassesTier;
    }
  }
}
