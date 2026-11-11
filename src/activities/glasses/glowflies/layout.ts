/**
 * Where the glow-fly patch sits in its site: the patch centre is shifted and the viewing
 * direction turned so that a child at the patch edge on the approach side, with the game's
 * DEFAULT camera behind them, sees the meadow — not the pictogram board, a trunk or a hillside.
 * Deterministic (the world is). Returns the layout frame: the hero stands at layout (0, heroBack)
 * and looks along layout −Z; the patch centre is the layout origin.
 */
import * as THREE from 'three';
import { CAMERA } from '../../../config';
import type { GameContext } from '../../../types';
import { CAM_BACK, CAM_UP } from '../gates/layout';
import { siteToWorld } from '../sites';

export interface PatchLayout {
  x: number;
  z: number;
  yaw: number;
  problems: number;
}

type Site = { x: number; z: number; yaw: number; board: { x: number; z: number } };

/** Half the horizontal field of view at 16:9, plus a margin. */
const HALF_HFOV = Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2)) * (16 / 9)) + 0.12;
const BOARD_HALF = 2.8;

export function choosePatchLayout(ctx: Pick<GameContext, 'world' | 'physics'>, site: Site, heroBack: number, targets: readonly { x: number; z: number; y: number }[]): PatchLayout {
  const down = new THREE.Vector3(0, -1, 0);
  const o = new THREE.Vector3();
  const d = new THREE.Vector3();
  const blocked = (x: number, z: number): boolean => {
    if (!ctx.world.isLand(x, z) || ctx.world.heightAt(x, z) < ctx.world.waterLevel + 0.5) return true;
    const gy = ctx.world.heightAt(x, z);
    const hit = ctx.physics.raycast(o.set(x, gy + 20, z), down, 30);
    return !!hit && hit.point.y > gy + 0.4;
  };
  const clear = (a: THREE.Vector3, b: THREE.Vector3): boolean => {
    d.subVectors(b, a);
    const len = d.length();
    return len < 0.4 || !ctx.physics.raycast(o.copy(a), d.normalize(), len - 0.35);
  };
  const bx = Math.cos(site.yaw);
  const bz = -Math.sin(site.yaw);

  let best: PatchLayout | null = null;
  let bestScore = Infinity;
  const shifts: [number, number][] = [];
  for (const sz of [0, -1.5, -3]) for (const sx of [0, 1.5, -1.5, 3, -3]) shifts.push([sx, sz]);
  const turns = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9];
  shifts.forEach(([sx, sz], si) =>
    turns.forEach((t, ti) => {
      const c = siteToWorld(site, sx, sz);
      const L = { x: c.x, z: c.z, yaw: site.yaw + t };
      let p = 0;
      const hero = siteToWorld(L, 0, heroBack);
      const cam2 = siteToWorld(L, 0, heroBack + CAM_BACK);
      const hy = ctx.world.heightAt(hero.x, hero.z);
      if (blocked(hero.x, hero.z)) p += 10;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const w = siteToWorld(L, Math.cos(a) * 3.5, Math.sin(a) * 3.5);
        if (blocked(w.x, w.z)) p += 4;
      }
      const cam = new THREE.Vector3(cam2.x, hy + CAM_UP, cam2.z);
      if (ctx.world.heightAt(cam2.x, cam2.z) > cam.y - 0.6) p += 5;
      if (!clear(new THREE.Vector3(hero.x, hy + 1.45, hero.z), cam)) p += 4;
      // The board out of the view cone (centre and both ends).
      const fwd = L.yaw + Math.PI;
      for (const k of [-1, 0, 1]) {
        const px = site.board.x + bx * BOARD_HALF * k - cam.x;
        const pz = site.board.z + bz * BOARD_HALF * k - cam.z;
        const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(px, pz) - fwd), Math.cos(Math.atan2(px, pz) - fwd)));
        if (ang < HALF_HFOV && Math.hypot(px, pz) < 30) p += 3;
      }
      for (const t2 of targets) {
        const w = siteToWorld(L, t2.x, t2.z);
        if (!clear(cam, new THREE.Vector3(w.x, ctx.world.heightAt(w.x, w.z) + t2.y, w.z))) p += 2;
      }
      const score = p * 100 + si + ti * 1.5;
      if (score < bestScore) {
        bestScore = score;
        best = { ...L, problems: p };
      }
    }),
  );
  return best ?? { x: site.x, z: site.z, yaw: site.yaw, problems: -1 };
}
