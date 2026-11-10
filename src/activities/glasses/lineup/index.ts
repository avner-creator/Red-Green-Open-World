/** Line-up targets: stub mechanic (replaced by its builder; this folder is that builder's only file area). */
import { createStubMechanic } from '../stub';
import type { Mechanic, MechanicEnv } from '../types';

export function create(env: MechanicEnv): Mechanic {
  return createStubMechanic(env);
}
