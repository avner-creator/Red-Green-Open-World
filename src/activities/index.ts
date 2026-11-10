/**
 * Activities. Each attraction folder has a `register.ts` (default export `(ctx) => GameSystem |
 * Promise<GameSystem>`, optional `export const order`); this file discovers them, so a new stream adds no line here.
 * Order (lower first, then folder name): rides 10-99 move the player, pickups 100-199 see the final
 * position, dressing 200+. The top-level modules (thrills, gems) are listed explicitly below.
 */
import type { GameContext, GameSystem } from '../types';
import { createGems } from './gems';
import { createThrills } from './thrills';

export { setLaunchGate } from './rocket';
export { thrillSpots } from './thrillSpots';
export { bungeeSpots } from './bungee';
export { sillySpots } from './silly';
export { secretRewardSpots } from './secrets';

export interface RegisterModule {
  default: (ctx: GameContext) => GameSystem | Promise<GameSystem>;
  order?: number;
}

interface Entry {
  name: string;
  order: number;
  create: (ctx: GameContext) => GameSystem | Promise<GameSystem>;
}

/** Every `./<folder>/register.ts`, eagerly imported by Vite (and Vitest). */
const discovered = import.meta.glob<RegisterModule>('./*/register.ts', { eager: true });

/** Registration order: `order` (default 100), then folder name. Exported for tests. */
export function activityEntries(mods: Record<string, RegisterModule> = discovered): Entry[] {
  const entries: Entry[] = [
    // Trampoline, bounce pads, rocket pads: they only run while playing.
    {
      name: 'thrills',
      order: 10,
      create: (ctx) => {
        const t = createThrills(ctx);
        return {
          update: (dt) => {
            if (ctx.session.state.phase === 'playing') t.update(dt);
          },
          dispose: () => t.dispose(),
        };
      },
    },
    { name: 'gems', order: 100, create: (ctx) => createGems(ctx) },
  ];
  for (const [path, mod] of Object.entries(mods)) {
    const name = /^\.\/([^/]+)\//.exec(path)?.[1] ?? path;
    entries.push({ name, order: mod.order ?? 100, create: mod.default });
  }
  return entries.sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function createActivities(ctx: GameContext): Promise<GameSystem & { names: string[] }> {
  const entries = activityEntries();
  const systems: GameSystem[] = [];
  for (const e of entries) systems.push(await e.create(ctx));
  return {
    names: entries.map((e) => e.name),
    update(dt) {
      // Rides first (they may start/finish a flight and pose the avatar), then the pickup checks
      // see the player's final position for this frame.
      for (const s of systems) s.update(dt);
    },
    dispose() {
      for (const s of systems) s.dispose?.();
    },
  };
}
