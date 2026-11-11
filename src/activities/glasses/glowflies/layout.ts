/**
 * Where the glow-fly patch sits in its site: the patch centre is shifted and the viewing
 * direction turned so that a child on the start pad at the patch edge on the approach side, with
 * the game's DEFAULT camera behind them, sees the meadow and the booth's lamps — not a trunk or a
 * hillside — and the booth's footprint stays inside the site on clear land. Deterministic (the
 * world is). Returns the layout frame: the hero stands at layout (0, heroBack) and looks along
 * layout −Z; the patch centre is the layout origin.
 */
import * as THREE from 'three';
import type { GameContext } from '../../../types';
import { CAM_BACK, CAM_UP } from '../gates/layout';
import { siteToWorld } from '../sites';

export interface PatchLayout {
  x: number;
  z: number;
  yaw: number;
  problems: number;
}

type Site = { x: number; z: number; yaw: number; radius: number };

export function choosePatchLayout(
  ctx: Pick<GameContext, 'world' | 'physics'>,
  site: Site,
  heroBack: number,
  targets: readonly { x: number; z: number; y: number }[],
  footprint: readonly { x: number; z: number }[] = [],
  arrival?: { at: { x: number; z: number } | null | undefined; targets: readonly { x: number; z: number; y: number }[] },
): PatchLayout {
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

  let best: PatchLayout | null = null;
  let bestScore = Infinity;
  const shifts: [number, number][] = [];
  for (const sz of [0, -1.5, -3]) for (const sx of [0, 1.5, -1.5, 3, -3]) shifts.push([sx, sz]);
  // With an arrival point the turns centre on facing it (clamped: the site keeps its rough heading).
  const arrivalYaw = arrival?.at ? Math.atan2(arrival.at.x - site.x, arrival.at.z - site.z) : null;
  const base = arrivalYaw === null ? 0 : Math.max(-0.9, Math.min(0.9, Math.atan2(Math.sin(arrivalYaw - site.yaw), Math.cos(arrivalYaw - site.yaw))));
  const turns = (arrivalYaw === null ? [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9] : [0, 0.2, -0.2, 0.4, -0.4, 0.6, -0.6]).map((t) => base + t);
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
      // The booth and the pad stay inside the site, on clear land.
      for (const f of footprint) {
        const w = siteToWorld(L, f.x, f.z);
        if (Math.hypot(w.x - site.x, w.z - site.z) > site.radius + 0.4) p += 20;
        else if (blocked(w.x, w.z)) p += 4;
      }
      for (const t2 of targets) {
        const w = siteToWorld(L, t2.x, t2.z);
        if (!clear(cam, new THREE.Vector3(w.x, ctx.world.heightAt(w.x, w.z) + t2.y, w.z))) p += 2;
      }
      // A meadow that rises steeply ahead of the pad puts the flies at the top of the picture.
      const rise = ctx.world.heightAt(c.x, c.z) - hy;
      if (rise > 0.8) p += Math.floor((rise - 0.8) / 0.5) + 1;
      // From where children arrive (12 m and 30 m out): the booth and the pad in clear view.
      if (arrivalYaw !== null && arrival) {
        for (const dd of [12, 30]) {
          const ex = site.x + Math.sin(arrivalYaw) * dd;
          const ez = site.z + Math.cos(arrivalYaw) * dd;
          if (!ctx.world.isLand(ex, ez)) continue;
          const eye = new THREE.Vector3(ex, Math.max(ctx.world.heightAt(ex, ez), ctx.world.waterLevel) + 2.6, ez);
          for (const t2 of arrival.targets) {
            const w = siteToWorld(L, t2.x, t2.z);
            if (!clear(eye, new THREE.Vector3(w.x, ctx.world.heightAt(w.x, w.z) + t2.y, w.z))) p += dd <= 12 ? 2 : 1;
          }
        }
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
