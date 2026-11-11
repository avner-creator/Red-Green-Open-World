/**
 * Economy: gems as money (shop catalog, buying, equipping, ride tickets, combo, missions) and the
 * Gear Shack kiosk interaction. The rules live in `rules.ts` (pure); this wrapper plugs them into
 * the game context.
 */
import type { EconomyApi, GameContext, GameSystem } from '../../types';
import { setLaunchGate } from '../rocket';
import { wireCharacters } from './characters';
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
  // Rocket pads charge a ticket once per launch, like every attraction: a child who cannot pay
  // still flies a practice launch (no stunt prize; `ticket:denied` still tells the HUD why).
  setLaunchGate(() => rules.rideTicket('rocketPad'));
  const unwireCharacters = wireCharacters(ctx, rules);
  const disposeRules = rules.dispose;
  rules.dispose = () => {
    unwireCharacters();
    kiosk.dispose();
    setLaunchGate(null);
    disposeRules();
  };
  return rules;
}
