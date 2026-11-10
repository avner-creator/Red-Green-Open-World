/**
 * STUB (orchestrator scaffold). The activities-designer replaces this whole folder.
 * Keep the exported name and signature: `createActivities`.
 */
import * as THREE from 'three';
import { VisionLayer } from '../types';
import type { GameContext, GameSystem } from '../types';

export async function createActivities(ctx: GameContext): Promise<GameSystem> {
  // Stub: static weak-eye gems so the vision pipeline has something to show.
  const geo = new THREE.OctahedronGeometry(0.5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const spot of ctx.world.gemSpots) {
    const gem = new THREE.Mesh(geo, mat);
    gem.position.copy(spot.position);
    ctx.vision.add(gem, VisionLayer.WeakOnly);
  }
  ctx.session.setTotals({ gems: ctx.world.gemSpots.length });
  return { update() {} };
}
