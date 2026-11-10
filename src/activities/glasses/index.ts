/**
 * Glasses play: six small "magic glasses" mini-games at sites near the plaza and beside the
 * attractions. This module is the shared framework:
 *   - finds the sites (./sites.ts) once the physics world is ready (first update),
 *   - builds each site's wordless pictogram board (./board.ts, one draw call each),
 *   - creates the mechanics from the registry (./mechanics.ts) with a `MechanicEnv` (./types.ts),
 *   - resets them when a session starts,
 *   - far-idle: a mechanic is active (layer objects attached, `update` called) only while the
 *     player is near its site (hysteresis), and only while the session is `playing`,
 *   - the test API `window.__rgGlasses` (only with `?test=1`).
 * Created LAST by src/activities/index.ts so every other activity's colliders already exist.
 */
import * as THREE from 'three';
import { ROADS } from '../../world/layout'; // read-only pure data: keeps sites off the roads
import { VisionLayer } from '../../types';
import type { GameContext, GameSystem } from '../../types';
import { createBoard, createBoardMaterial } from './board';
import type { Board } from './board';
import { GLASSES } from './constants';
import { FarIdle, hashString, seededRng } from './idle';
import { MECHANICS } from './mechanics';
import type { MechanicDef } from './mechanics';
import { createGlassesAtlas } from './pictos';
import { pay, result } from './rewards';
import { findSites, siteToWorld, SITE_PLANS } from './sites';
import type { GlassesSite, SitePlan, SiteWorld } from './sites';
import { IDENTITY_CHALLENGE } from './types';
import type { Mechanic, MechanicEnv } from './types';

export type { Mechanic, MechanicEnv } from './types';

export interface GlassesSiteInfo {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  radius: number;
  near: string;
  valid: boolean;
  board: { x: number; z: number };
}

/** `window.__rgGlasses` (test mode only). */
export interface GlassesTestApi {
  sites(): GlassesSiteInfo[];
  /** Teleport the player to a good viewing spot on the approach side, facing the site. */
  goto(id: string): { x: number; y: number; z: number; yaw: number };
  debug(id: string): Record<string, unknown>;
  force(id: string, params: Record<string, unknown>): void;
  reset(id: string): void;
  /** Draw calls of the mechanic's visible objects plus its board. */
  draws(id: string): number;
  active(id: string): boolean;
  /** Screen rectangle (CSS px) of the site's board for the current camera, or null if behind it. */
  boardRect(id: string): { x0: number; y0: number; x1: number; y1: number } | null;
}

declare global {
  interface Window {
    __rgGlasses?: GlassesTestApi;
  }
}

interface Entry {
  def: MechanicDef;
  site: GlassesSite & { valid: boolean };
  board: Board;
  mech: Mechanic;
  idle: FarIdle;
  /** Tracked objects and their layer. */
  objects: Map<THREE.Object3D, VisionLayer>;
}

const DOWN = new THREE.Vector3(0, -1, 0);

/** Count draw calls under `root` (visible meshes; an InstancedMesh counts once, empty ones not). */
export function countDraws(root: THREE.Object3D): number {
  let n = 0;
  if (!root.visible) return 0;
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh & { isInstancedMesh?: boolean; count?: number; isSprite?: boolean; isLine?: boolean; isPoints?: boolean };
    if (!(m.isMesh || m.isSprite || m.isLine || m.isPoints)) return;
    if (m.isInstancedMesh && (m.count ?? 0) <= 0) return;
    n += Array.isArray(m.material) ? m.material.length : 1;
  });
  return n;
}

export function createGlasses(ctx: GameContext, plans: readonly SitePlan[] = SITE_PLANS): GameSystem {
  const entries: Entry[] = [];
  let built = false;
  let atlas: THREE.Texture | null = null;
  let boardMat: THREE.Material | null = null;
  const tmp = new THREE.Vector3();

  /** Runtime collider probe: anything solid above the ground or across the circle. */
  function blocked(x: number, z: number, r: number): boolean {
    const h = ctx.world.heightAt(x, z);
    for (const rr of [0, r * 0.5, r]) {
      const steps = rr === 0 ? 1 : 8;
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const sx = x + Math.cos(a) * rr;
        const sz = z + Math.sin(a) * rr;
        const gy = ctx.world.heightAt(sx, sz);
        const hit = ctx.physics.raycast(tmp.set(sx, gy + 40, sz), DOWN, 80);
        if (hit && hit.point.y > gy + 0.5) return true;
      }
    }
    for (const y of [1, 2.2]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const hit = ctx.physics.raycast(tmp.set(x, h + y, z), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), r);
        if (hit) return true;
      }
    }
    return false;
  }

  function attach(e: Entry, on: boolean): void {
    for (const [o, layer] of e.objects) {
      if (layer === VisionLayer.Both) continue;
      if (on) ctx.vision.add(o, layer);
      else ctx.vision.remove(o);
    }
  }

  function setActive(e: Entry, on: boolean): void {
    if (on) {
      attach(e, true);
      e.mech.setActive(true);
    } else {
      e.mech.setActive(false);
      attach(e, false);
    }
  }

  function build(): void {
    if (built) return;
    built = true;
    const a = ctx.world.anchors as unknown as SiteWorld['anchors'];
    const world: SiteWorld = {
      heightAt: (x, z) => ctx.world.heightAt(x, z),
      isLand: (x, z) => ctx.world.isLand(x, z),
      waterLevel: ctx.world.waterLevel,
      anchors: a,
      gemSpots: ctx.world.gemSpots,
      chestSpots: ctx.world.chestSpots,
      roads: ROADS,
      blocked,
    };
    const sites = findSites(world, plans);
    atlas = createGlassesAtlas();
    boardMat = createBoardMaterial(atlas);
    for (const site of sites) {
      const def = MECHANICS.find((m) => m.id === site.id);
      if (!def) continue;
      if (!site.valid) console.warn(`glasses: no valid site for ${site.id}; using its preferred point`);
      const board = createBoard(ctx, boardMat, { x: site.board.x, y: ctx.world.heightAt(site.board.x, site.board.z), z: site.board.z, yaw: site.yaw }, def.pictos);
      const objects = new Map<THREE.Object3D, VisionLayer>();
      const idle = new FarIdle();
      // The entry is completed right below; the env closes over it.
      const entry = { def, site, board, idle, objects } as Entry;
      const env: MechanicEnv = {
        ctx,
        id: def.id,
        kind: def.kind,
        site,
        rng: seededRng(hashString(def.id)),
        local: (x, z) => siteToWorld(site, x, z),
        groundAt: (x, z) => ctx.world.heightAt(x, z),
        board: (pictos) => board.setPictos(pictos),
        pay: (gems) => {
          pay(ctx, gems);
        },
        result: (tier, hit) => result(ctx.events, def.id, def.kind, tier, hit),
        challenge: () => ctx.vision.challenge?.() ?? IDENTITY_CHALLENGE,
        add(object, layer) {
          if (objects.has(object)) env.remove(object);
          objects.set(object, layer);
          if (layer === VisionLayer.Both || idle.active) ctx.vision.add(object, layer);
          return object;
        },
        remove(object) {
          if (!objects.has(object)) return;
          objects.delete(object);
          ctx.vision.remove(object);
        },
        tracked: () => [...objects.keys()],
        isActive: () => idle.active,
      };
      entry.mech = def.create(env);
      entries.push(entry);
    }
  }

  const byId = (id: string): Entry => {
    build();
    const e = entries.find((x) => x.def.id === id);
    if (!e) throw new Error(`glasses: unknown mechanic ${id}`);
    return e;
  };

  const offPhase = ctx.events.on('session:phase', (ev) => {
    if (ev.phase === 'playing' && ev.previous === 'title') {
      build();
      for (const e of entries) e.mech.reset();
    } else if (ev.phase === 'title') {
      for (const e of entries) {
        if (!e.idle.active) continue;
        e.idle.reset();
        setActive(e, false);
      }
    }
  });

  function update(dt: number): void {
    build();
    if (ctx.session.state.phase !== 'playing') return;
    const p = ctx.player.position;
    for (const e of entries) {
      if (e.idle.update(Math.hypot(p.x - e.site.x, p.z - e.site.z))) setActive(e, e.idle.active);
      if (e.idle.active) e.mech.update(dt);
    }
  }

  if (ctx.testMode) {
    window.__rgGlasses = {
      sites: () => {
        build();
        return entries.map(({ site: s }) => ({ id: s.id, x: s.x, y: s.y, z: s.z, yaw: s.yaw, radius: s.radius, near: s.near, valid: s.valid, board: { ...s.board } }));
      },
      goto(id) {
        const { site } = byId(id);
        // Aim between the site centre and its board so both are in view.
        const aim = { x: site.x * 0.55 + site.board.x * 0.45, z: site.z * 0.55 + site.board.z * 0.45 };
        let best: { x: number; z: number } | null = null;
        outer: for (const d of [GLASSES.viewDistance, 12, 18, 10]) {
          for (const off of [0, 0.35, -0.35, 0.7, -0.7]) {
            const yaw = site.yaw + off;
            const c = { x: site.x + Math.sin(yaw) * d, z: site.z + Math.cos(yaw) * d };
            if (!ctx.world.isLand(c.x, c.z) || ctx.world.heightAt(c.x, c.z) < ctx.world.waterLevel + 0.5) continue;
            if (blocked(c.x, c.z, 0.7)) continue;
            best = c;
            break outer;
          }
        }
        const at = best ?? { x: site.x + Math.sin(site.yaw) * GLASSES.viewDistance, z: site.z + Math.cos(site.yaw) * GLASSES.viewDistance };
        const y = ctx.world.heightAt(at.x, at.z) + 0.05;
        const yaw = Math.atan2(aim.x - at.x, aim.z - at.z);
        ctx.player.teleport(new THREE.Vector3(at.x, y, at.z), yaw);
        return { x: at.x, y, z: at.z, yaw };
      },
      debug: (id) => byId(id).mech.debug(),
      force: (id, params) => byId(id).mech.force?.(params),
      reset: (id) => byId(id).mech.reset(),
      draws(id) {
        const e = byId(id);
        let n = countDraws(e.board.mesh);
        for (const o of e.mech.drawObjects()) n += countDraws(o);
        return n;
      },
      active: (id) => byId(id).idle.active,
      boardRect(id) {
        const mesh = byId(id).board.mesh;
        const geo = mesh.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox as THREE.Box3;
        const cam = ctx.camera;
        cam.updateMatrixWorld();
        mesh.updateMatrixWorld();
        const w = ctx.canvas.clientWidth;
        const h = ctx.canvas.clientHeight;
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (let i = 0; i < 8; i++) {
          tmp.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(mesh.matrixWorld);
          tmp.applyMatrix4(cam.matrixWorldInverse);
          if (tmp.z > -0.1) return null;
          tmp.applyMatrix4(cam.projectionMatrix);
          const sx = (tmp.x * 0.5 + 0.5) * w;
          const sy = (0.5 - tmp.y * 0.5) * h;
          x0 = Math.min(x0, sx);
          y0 = Math.min(y0, sy);
          x1 = Math.max(x1, sx);
          y1 = Math.max(y1, sy);
        }
        return { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(w, x1), y1: Math.min(h, y1) };
      },
    };
  }

  return {
    update,
    dispose() {
      offPhase();
      for (const e of entries) {
        e.mech.dispose();
        for (const o of e.objects.keys()) ctx.vision.remove(o);
        e.objects.clear();
        e.board.dispose();
      }
      entries.length = 0;
      boardMat?.dispose();
      atlas?.dispose();
      if (ctx.testMode) delete window.__rgGlasses;
    },
  };
}
