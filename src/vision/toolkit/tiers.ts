/**
 * Tier presets for weak-eye objects (pure). Tier 1 = big, bright, slow; tier 3 = small, faint,
 * fast, worth more. Feed `size` to object scale, `level`/`opacity` to the toolkit options,
 * `speed` to animation/movement and `reward` to the payout.
 */
import type { ChallengeModifiers, GlassesTier } from '../../types';

export interface TierPreset {
  /** Size multiplier (1 = the mechanic's base size). */
  size: number;
  /** Grey "pop" level 0..1 for toolkit materials. */
  level: number;
  /** Coverage multiplier 0..1 for toolkit materials. */
  opacity: number;
  /** Speed multiplier for movement / animation / timing. */
  speed: number;
  /** Reward multiplier (gems). */
  reward: number;
}

export const TIERS: Readonly<Record<GlassesTier, Readonly<TierPreset>>> = {
  1: { size: 1, level: 1, opacity: 1, speed: 1, reward: 1 },
  2: { size: 0.75, level: 0.8, opacity: 0.8, speed: 1.35, reward: 2 },
  3: { size: 0.55, level: 0.6, opacity: 0.62, speed: 1.75, reward: 3 },
};

/** Smallest size factor the challenge may apply (keeps objects findable). */
export const MIN_SIZE_SCALE = 0.4;

/**
 * The tier preset with the session's challenge modifiers applied. Only `sizeScale` is applied
 * here (brightness and the other eye's contrast are applied globally by the compositor). The
 * result is never larger or brighter than the preset.
 */
export function withChallenge(tier: GlassesTier, mods?: Readonly<Partial<ChallengeModifiers>> | null): TierPreset {
  const p = TIERS[tier];
  const raw = mods?.sizeScale;
  const k = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(1, Math.max(MIN_SIZE_SCALE, raw)) : 1;
  return { size: p.size * k, level: p.level, opacity: p.opacity, speed: p.speed, reward: p.reward };
}

/** Clamp any number to a valid tier. */
export function toTier(n: number): GlassesTier {
  return n >= 3 ? 3 : n >= 2 ? 2 : 1;
}
