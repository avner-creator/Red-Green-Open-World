/**
 * Where Pip goes while the hero rides something: on the buggy's rear deck, in the balloon basket,
 * paddling beside the hero in freefall, clinging to the hero's back under the canopy.
 */
import * as THREE from 'three';
import type { AnchorName, GameContext, VehicleApi } from '../types';
import type { RideView } from './director';

export type ExternalKind = 'balloon' | 'rocket' | 'bungee' | 'silly' | 'other';

/** Which attraction an external controller most likely belongs to (nearest anchor at take-over). */
export function externalKind(ctx: GameContext, at: THREE.Vector3): ExternalKind {
  const near = (name: AnchorName, r: number): boolean => {
    const a = ctx.world.anchors[name];
    return !!a && Math.hypot(a.position.x - at.x, a.position.z - at.z) < r;
  };
  if (near('balloon', 16)) return 'balloon';
  if (near('launchPads', 16)) return 'rocket';
  if (near('bungee', 8)) return 'bungee';
  if (near('sillyZone', 20)) return 'silly';
  return 'other';
}

export function classifyRide(ctx: GameContext, kind: ExternalKind, canopy: THREE.Object3D | null): RideView {
  const p = ctx.player;
  if ((p.mode === 'driving' || p.mode === 'riding') && p.vehicle) return 'vehicle';
  if (p.mode !== 'external') return 'none';
  if (canopy?.visible) return 'canopy';
  if (p.velocity.y < -9) return 'freefall';
  if (kind === 'balloon') return 'basket';
  return 'other';
}

const seatCache = new WeakMap<THREE.Object3D, { parent: THREE.Object3D; local: THREE.Vector3 }>();

/** Pip's spot on a vehicle (world space) and the vehicle's heading. */
export function vehicleSpot(v: VehicleApi, out: THREE.Vector3): number {
  let s = seatCache.get(v.object);
  if (!s) {
    const seat = v.object.getObjectByName('buggy-seat');
    if (v.kind === 'car' && seat?.parent) s = { parent: seat.parent, local: new THREE.Vector3(0, 0.43, -1.04) };
    else s = { parent: v.object, local: new THREE.Vector3(0, 1.32, -0.55) };
    seatCache.set(v.object, s);
  }
  s.parent.updateWorldMatrix(true, false);
  out.copy(s.local).applyMatrix4(s.parent.matrixWorld);
  const e = s.parent.matrixWorld.elements;
  // Heading of the parent's +Z axis.
  return Math.atan2(e[8], e[10]);
}
