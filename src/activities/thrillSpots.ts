/**
 * Gem-worthy positions for the gem system (mega gems later): trampoline apex heights 15/30/45 m,
 * points along the rocket arc, and above each bounce pad. Filled when the thrills are built; this
 * module creates no gems itself.
 */
import type * as THREE from 'three';

export interface ThrillSpot {
  /** Absolute world position the item should float at. */
  position: THREE.Vector3;
  /** e.g. `trampoline30`, `rocket2`, `pad1`. */
  tag: string;
}

/** Live array: cleared and refilled by `createThrills`. */
export const thrillSpots: ThrillSpot[] = [];
