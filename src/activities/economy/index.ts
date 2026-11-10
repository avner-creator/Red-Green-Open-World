/**
 * Economy: gems as money (shop catalog, buying, equipping, ride tickets, combo, missions) and the
 * Gear Shack kiosk interaction. The rules live in `rules.ts` (pure); this wrapper plugs them into
 * the game context.
 */
import type { EconomyApi, GameContext, GameSystem } from '../../types';
import { setLaunchGate } from '../rocket';
import { createKiosk } from './kiosk';
import { mulberry32 } from './missions';
import { createEconomyRules, type GemPickupSink } from './rules';

/** The economy object: the public API plus what the gem code uses to pay out pickups. */
export type Economy = EconomyApi & GameSystem & GemPickupSink;

/** Fixed seed so test mode always draws the same three missions. */
const TEST_MISSION_SEED = 20260101;

export function createEconomy(ctx: GameContext): Economy {
  const rules = createEconomyRules(ctx.events, ctx.profile, {
    rand: ctx.testMode ? mulberry32(TEST_MISSION_SEED) : undefined,
    play: (name) => ctx.audio.play(name),
  });
  const kiosk = createKiosk(ctx);
  // Rocket pads charge a ticket once per real launch (the pad calls the gate only when a launch
  // would start, then the player hops off, so a denial is reported once per approach).
  setLaunchGate(() => rules.payTicket('rocketPad'));
  const disposeRules = rules.dispose;
  rules.dispose = () => {
    kiosk.dispose();
    setLaunchGate(null);
    disposeRules();
  };
  return rules;
}
