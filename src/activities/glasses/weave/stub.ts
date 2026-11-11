/** A valid no-op weave part (never active, attaches nothing). Part folders start from this. */
import type { WeaveEnv, WeavePart } from './types';

export function createStubPart(env: WeaveEnv): WeavePart {
  return {
    id: env.id,
    kind: env.kind,
    reset() {},
    update() {},
    dispose() {},
    debug: () => ({ stub: true, active: false }),
    drawObjects: () => env.tracked(),
  };
}
