/** A valid no-op mechanic (the framework already builds the board). Mechanic folders start from this. */
import type { Mechanic, MechanicEnv } from './types';

export function createStubMechanic(env: MechanicEnv): Mechanic {
  let active = false;
  return {
    id: env.id,
    kind: env.kind,
    reset() {},
    setActive(on) {
      active = on;
    },
    update() {},
    dispose() {},
    debug: () => ({ stub: true, active }),
    drawObjects: () => env.tracked(),
  };
}
