/**
 * Economy: gems as money (shop catalog, buying, equipping, ride tickets; combo and missions next).
 * The rules live in `rules.ts` (pure); this wrapper plugs them into the game context.
 */
import type { EconomyApi, GameContext, GameSystem } from '../../types';
import { createEconomyRules } from './rules';

export function createEconomy(ctx: GameContext): EconomyApi & GameSystem {
  return createEconomyRules(ctx.events, ctx.profile);
}
