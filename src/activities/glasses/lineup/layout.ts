/**
 * Which side of the pad the line-up booth stands on: the side whose marquee footprint is on dry,
 * clear, fairly flat land (left first). The bubbles keep to the other side (see `findSpots`), so
 * the open sky ahead of the pad stays free of the booth.
 */
import * as THREE from 'three';
import type { GameContext } from '../../../types';
import { siteToWorld } from '../sites';
import { lineupBooth } from './constants';

type Site = { x: number; z: number; yaw: number };

/** Frame-local footprint points of the marquee for a side (centre, poles, counter). */
export function boothFootprint(side: -1 | 1): { x: number; z: number }[] {
  const m = lineupBooth(side).marquee;
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);
  const pt = (lx: number, lz: number): { x: number; z: number } => ({ x: m.x + lx * c + lz * s, z: m.z - lx * s + lz * c });
  return [pt(0, -0.3), pt(-1.6, 0.1), pt(1.6, 0.1), pt(-1.6, -0.6), pt(1.6, -0.6), pt(0, 0.5)];
}

export function chooseBoothSide(ctx: Pick<GameContext, 'world' | 'physics'>, site: Site): -1 | 1 {
  const down = new THREE.Vector3(0, -1, 0);
  const o = new THREE.Vector3();
  const problems = (side: -1 | 1): number => {
    let p = 0;
    const ys: number[] = [];
    for (const l of boothFootprint(side)) {
      const w = siteToWorld(site, l.x, l.z);
      const gy = ctx.world.heightAt(w.x, w.z);
      ys.push(gy);
      if (!ctx.world.isLand(w.x, w.z) || gy < ctx.world.waterLevel + 0.3) p += 3;
      const hit = ctx.physics.raycast(o.set(w.x, gy + 20, w.z), down, 30);
      if (hit && hit.point.y > gy + 0.4) p += 2;
    }
    if (Math.max(...ys) - Math.min(...ys) > 1.2) p += 1;
    return p;
  };
  return problems(1) < problems(-1) ? 1 : -1;
}
