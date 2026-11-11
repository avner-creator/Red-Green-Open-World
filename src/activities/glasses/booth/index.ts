/** The booth kit: every glasses mini-game's marquee, start pad, demo, lamps, rounds and feedback. See ./README.md. */
export { createBoothAtlas } from './atlas';
export type { BoothAtlas } from './atlas';
export { createBoothController, createBoothMaterial } from './booth';
export type { BoothController, LampMode, PadMode } from './booth';
export * from './cells';
export { DEMO_KIT } from './draw';
export type { DemoKit, HeroPose } from './draw';
export { BoothFx } from './fx';
export { buildBoothGeometry, MARQUEE } from './geometry';
export { createBoothKit } from './kit';
export type { BoothDeps, BoothKit } from './kit';
export { PICK3_PRIZE, prizeFor, RoundMachine, stepTier } from './round';
export type { RoundEvent, RoundPhase } from './round';
export { simulate } from './sim';
export type * from './types';
