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
import { createBoothAtlas, createBoothMaterial } from './booth';
import type { BoothAtlas } from './booth';
import { createBoothKit } from './booth/kit';
import type { BoothKit } from './booth/kit';
import { cameraSafe } from './camera';
import type { Board } from './board';
import { BOARD, GLASSES } from './constants';
import { FarIdle, hashString, seededRng } from './idle';
import { MECHANICS } from './mechanics';
import type { MechanicDef } from './mechanics';
import { createGlassesAtlas } from './pictos';
import { pay, result } from './rewards';
import { boardOf, FIXED_SITES, groundProblem, nearestRoadPoint, searchSite, siteToWorld, staticProblems } from './sites';
import type { FixedSite, GlassesSite, SiteWorld, XZ } from './sites';
import { IDENTITY_CHALLENGE } from './types';
import type { Mechanic, MechanicEnv } from './types';
import { createWeave } from './weave';
import type { WeaveTestApi } from './weave';

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
  /** Why the startup probe found the fixed site blocked (null when `valid`). */
  problem: string | null;
  board: { x: number; z: number };
  /** Where children arrive (the road end of the world's stepping-stone trail). */
  arrival: { x: number; z: number } | null;
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
  /** Draw calls of the site's board or booth mesh alone (1). */
  signDraws(id: string): number;
  /** True when the site runs the booth kit. */
  isBooth(id: string): boolean;
  /** Booth kit test hooks: the pad camera spot, jump into a try (no countdown), cancel the round. */
  boothPadView(id: string): { x: number; y: number; z: number; yaw: number } | null;
  boothPlay(id: string): void;
  boothCancel(id: string): void;
  boothDebug(id: string): Record<string, unknown> | null;
  /** Paint the booth's pad with brightness k (null = normal): diffing two frames finds its visible pixels. */
  boothPadProbe(id: string, k: number | null): void;
  /** Every object the six mini-games may draw (boards, booths, tracked objects), for draw counts. */
  objects(): THREE.Object3D[];
  active(id: string): boolean;
  /** Screen rectangle (CSS px) of the site's board for the current camera, or null if behind it. */
  boardRect(id: string): { x0: number; y0: number; x1: number; y1: number } | null;
  /**
   * DEV: run the site search (every rule + live probes) from `start`, facing `faceTo`, keeping
   * clear of the other fixed sites. Returns a `FIXED_SITES` row to freeze, or null.
   */
  search(id: string, start: XZ, faceTo: XZ | null, playRadius?: number, stats?: boolean): (FixedSite & { stats?: Record<string, number> }) | null | Record<string, number>;
  /** DEV: build mechanic `id` at a trial site (board included), return its debug(), tear it down. */
  trySite(id: string, row: { x: number; z: number; yaw: number; slot: number }): Record<string, unknown>;
  /** DEV: what is wrong with a site centre right now (static rules, ground, board views by slot). */
  probe(x: number, z: number, yaw: number, playRadius?: number): { problems: string[]; ground: string | null; views: boolean[] };
  /** DEV: what (if anything) blocks the straight line from `a` to `b`: a collider, a prop mesh or a merged batch (canopies included). */
  sight(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): string | null;
  /** Phase 2 weave parts (./weave). */
  weave?: WeaveTestApi;
}

declare global {
  interface Window {
    __rgGlasses?: GlassesTestApi;
  }
}

type SiteState = GlassesSite & { valid: boolean; problem: string | null };

interface Entry {
  def: MechanicDef;
  site: SiteState;
  /** The old pictogram board (null for a booth game). */
  board: Board | null;
  /** The booth kit (booth games). */
  kit: BoothKit | null;
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

export function createGlasses(ctx: GameContext, table: readonly FixedSite[] = FIXED_SITES): GameSystem {
  const entries: Entry[] = [];
  let built = false;
  let atlas: THREE.Texture | null = null;
  let boardMat: THREE.Material | null = null;
  let boothAtlas: BoothAtlas | null = null;
  let boothMat: THREE.Material | null = null;
  /** The site's sign: its board's mesh, or its booth's mesh. */
  const signOf = (e: Entry): THREE.Mesh | null => e.kit?.booth.mesh ?? e.board?.mesh ?? null;
  /** Where the sign stands (world XZ) and the way it faces: the board, or the booth's marquee. */
  const signSpot = (e: Entry): { x: number; z: number; yaw: number } => {
    if (!e.kit) return { x: e.site.board.x, z: e.site.board.z, yaw: e.site.yaw };
    const b = e.kit.booth.build.marqueeBox;
    const c = e.kit.booth.mesh.localToWorld(new THREE.Vector3((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2));
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(e.kit.booth.mesh.quaternion);
    return { x: c.x, z: c.z, yaw: Math.atan2(f.x, f.z) };
  };
  const tmp = new THREE.Vector3();

  /** Runtime collider probe: anything solid above the ground or across the circle. */
  function blocked(x: number, z: number, r: number): boolean {
    return blockReason(x, z, r) !== null;
  }

  /** Why the circle is not free (for warnings and the dev probe), or null. */
  function blockReason(x: number, z: number, r: number): string | null {
    const h = ctx.world.heightAt(x, z);
    for (const rr of [0, r * 0.5, r]) {
      const steps = rr === 0 ? 1 : 8;
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const sx = x + Math.cos(a) * rr;
        const sz = z + Math.sin(a) * rr;
        const gy = ctx.world.heightAt(sx, sz);
        const hit = ctx.physics.raycast(tmp.set(sx, gy + 40, sz), DOWN, 80);
        if (hit && hit.point.y > gy + 0.5) return `collider above ground at (${sx.toFixed(1)}, ${sz.toFixed(1)}) +${(hit.point.y - gy).toFixed(1)} m`;
      }
    }
    // The play area itself (the rim beyond it only needs to be free of buildings: down rays above).
    for (const y of [0.45, 1.2, 2.2]) if (!discClear(x, z, (r - 1.5) * 0.6, h + y)) return `wall or trunk in the play area at +${y} m`;
    // Visual-only things have no collider (tree canopies, low fences, bushes): probe the main
    // scene's meshes too. Only reached by candidates that passed every cheaper rule.
    for (let k = 0; k < 5; k++) {
      const a = (k / 4) * Math.PI * 2;
      const sx = k === 4 ? x : x + Math.cos(a) * r * 0.6;
      const sz = k === 4 ? z : z + Math.sin(a) * r * 0.6;
      const gy = ctx.world.heightAt(sx, sz);
      const m = sceneHitName(tmp2.set(sx, gy + 14, sz), DOWN, 14 - 0.9);
      if (m) return `mesh ${m} overhead at (${sx.toFixed(1)}, ${sz.toFixed(1)})`;
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const m = sceneHitName(tmp2.set(x, h + 0.75, z), dir.set(Math.cos(a), 0, Math.sin(a)), (r - 1.5) * 0.75);
      if (m) return `mesh ${m} in the circle`;
    }
    return null;
  }

  /**
   * No wall, fence or trunk crosses the disc (x, z, r) at height `y`: parallel scanline rays 0.4 m
   * apart (thinner than any trunk collider), so nothing slips between them.
   */
  function discClear(x: number, z: number, r: number, y: number): boolean {
    const east = new THREE.Vector3(1, 0, 0);
    for (let o = -r + 0.2; o < r; o += 0.4) {
      const half = Math.sqrt(Math.max(0, r * r - o * o));
      const hit = ctx.physics.raycast(tmp.set(x - half, y, z + o), east, 2 * half);
      // Ground (a near-vertical normal either way: a ray entering rising terrain sees it from below)
      // is not an obstacle; fences, walls and trunks are.
      if (hit && Math.abs(hit.normal.y) < 0.7) return false;
    }
    return true;
  }

  /** No trunk/wall within `half` metres of the ground path from (ex, ez) to (bx, bz), at trunk height. */
  function corridorClear(ex: number, ez: number, bx: number, bz: number, half = 2.5): boolean {
    const gx = bx - ex;
    const gz = bz - ez;
    const glen = Math.hypot(gx, gz);
    if (glen < 1e-6) return true;
    const px = -gz / glen;
    const pz = gx / glen;
    const side = new THREE.Vector3(px, 0, pz);
    for (let t = 0.4; t < glen - 1; t += 0.4) {
      const cx = ex + (gx / glen) * t;
      const cz = ez + (gz / glen) * t;
      const hit = ctx.physics.raycast(tmp2.set(cx - px * half, ctx.world.heightAt(cx, cz) + 1.2, cz - pz * half), side, half * 2);
      if (hit && Math.abs(hit.normal.y) < 0.7) return false;
    }
    return true;
  }

  /** No prop mesh (canopies included, merged batches too) between an eye and the panel's centre, ends and badge. */
  function panelClear(x: number, z: number, eyeH: number, site: GlassesSite): boolean {
    const by = ctx.world.heightAt(site.board.x, site.board.z);
    const eye = new THREE.Vector3(x, ctx.world.heightAt(x, z) + eyeH, z);
    const ex = Math.cos(site.yaw);
    const ez = -Math.sin(site.yaw);
    const to = new THREE.Vector3();
    for (const [k, h] of [[0, BOARD.panelY], [-2.2, BOARD.panelY], [2.2, BOARD.panelY], [0, BOARD.topperY]] as const) {
      to.set(site.board.x + ex * k, by + h, site.board.z + ez * k).sub(eye);
      const len = to.length();
      to.normalize();
      if (sceneHit(eye, to, len - 0.6) || sceneHit(eye, to, len - 0.6, true)) return false;
    }
    return true;
  }

  /** Nothing at all (terrain included) between an eye at (x, z, ground + `eyeH`) and the board's panel. */
  function sightClear(x: number, z: number, eyeH: number, site: GlassesSite): boolean {
    const by = ctx.world.heightAt(site.board.x, site.board.z) + BOARD.panelY;
    const from = new THREE.Vector3(x, ctx.world.heightAt(x, z) + eyeH, z);
    const d = new THREE.Vector3(site.board.x, by, site.board.z).sub(from);
    const len = d.length();
    return !ctx.physics.raycast(from, d, len - 0.6);
  }

  /**
   * Clear view of the board from the approach (12 m and 22 m out, eye height): direct sightlines
   * to the panel and the badge, then a band of trunk-height cross rays along the way. Canopies
   * have no collider and far trees are not in the scene's instance buffers, but every tree has a
   * trunk collider: a trunk within 3.5 m of the near sightline means its canopy is in the way.
   */
  function view(x: number, z: number, yaw: number, b: { x: number; z: number }): boolean {
    const by = ctx.world.heightAt(b.x, b.z);
    const eye = new THREE.Vector3();
    const to = new THREE.Vector3();
    const wall = (fx: number, fy: number, fz: number, dx: number, dy: number, dz: number, len: number): boolean => {
      const hit = ctx.physics.raycast(eye.set(fx, fy, fz), to.set(dx, dy, dz), len);
      return !!hit && Math.abs(hit.normal.y) < 0.7;
    };
    // Around the board itself (a trunk there means a canopy over or in front of it).
    if (!discClear(b.x, b.z, 3.5, by + 1.2)) return false;
    for (const d of [12, 22]) {
      const ex = x + Math.sin(yaw) * d;
      const ez = z + Math.cos(yaw) * d;
      const ey = Math.max(ctx.world.heightAt(ex, ez), ctx.world.waterLevel) + 1.7;
      for (const ty of [BOARD.panelY, BOARD.topperY]) {
        const dx = b.x - ex;
        const dy = by + ty - ey;
        const dz = b.z - ez;
        const len = Math.hypot(dx, dy, dz);
        if (wall(ex, ey, ez, dx / len, dy / len, dz / len, len - 0.4)) return false;
        eye.set(ex, ey, ez);
        if (sceneHit(eye, to.set(dx, dy, dz).normalize(), len - 0.6)) return false;
      }
      if (d <= 12 && !corridorClear(ex, ez, b.x, b.z, 3.5)) return false; // the far viewpoint only needs the direct sightlines
    }
    // Last, the costly one: the big merged batches (decor trees and props without colliders live
    // there) along the near sightlines. Capped so a crowded area cannot stall the boot.
    if (heavyBudget > 0) {
      heavyBudget--;
      const ex = x + Math.sin(yaw) * 12;
      const ez = z + Math.cos(yaw) * 12;
      const ey = Math.max(ctx.world.heightAt(ex, ez), ctx.world.waterLevel) + 1.7;
      for (const ty of [BOARD.panelY, BOARD.topperY]) {
        eye.set(ex, ey, ez);
        to.set(b.x, by + ty, b.z).sub(eye);
        const len = to.length();
        if (sceneHit(eye, to.normalize(), len - 0.6, true)) return false;
      }
    }
    return true;
  }
  let heavyBudget = 0;

  // Main-scene props for visual-only probes (no terrain, roads or paving: those are the ground).
  const raycaster = new THREE.Raycaster();
  raycaster.camera = ctx.camera;
  raycaster.params.Points = { threshold: 0 };
  raycaster.params.Line = { threshold: 0 };
  const tmp2 = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let props: THREE.Object3D[] | null = null;
  const batches: THREE.Object3D[] = [];
  const propList = (): THREE.Object3D[] => {
    if (props) return props;
    const list: THREE.Object3D[] = [];
    props = list;
    ctx.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !o.visible || /^(terrain|road|paving|water|sky)/i.test(o.name)) return;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible || p === ctx.player.object) return;
      // Big merged static batches (chunks of the village, park…) cost milliseconds per ray: their
      // solid parts have colliders, so the physics probes cover them. Keep single props and instances.
      if (!(m as THREE.InstancedMesh).isInstancedMesh) {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const bs = m.geometry.boundingSphere;
        if (!bs || bs.radius * m.matrixWorld.getMaxScaleOnAxis() > 25) {
          if (bs && bs.radius * m.matrixWorld.getMaxScaleOnAxis() < 150) batches.push(o);
          return;
        }
      }
      list.push(o);
    });
    return props;
  };
  /** First visible prop mesh (or, with `heavy`, merged batch) along the ray that is not at ground level. */
  function sceneHit(origin: THREE.Vector3, direction: THREE.Vector3, far: number, heavy = false): boolean {
    return sceneHitName(origin, direction, far, heavy) !== null;
  }
  /** Name of the first such mesh (or null). Our own boards and mechanic objects never count. */
  function sceneHitName(origin: THREE.Vector3, direction: THREE.Vector3, far: number, heavy = false): string | null {
    raycaster.set(origin, direction);
    raycaster.near = 0;
    raycaster.far = far;
    const list = propList();
    for (const hh of raycaster.intersectObjects(heavy ? batches : list, false)) {
      if (hh.point.y < ctx.world.heightAt(hh.point.x, hh.point.z) + 0.3) continue;
      if (ours(hh.object)) continue;
      return hh.object.name || hh.object.type;
    }
    return null;
  }
  const ours = (o: THREE.Object3D): boolean => {
    for (const e of entries) {
      if (o === signOf(e)) return true;
      for (const t of e.objects.keys()) {
        let hit = false;
        t.traverse((c) => {
          if (c === o) hit = true;
        });
        if (hit) return true;
      }
    }
    return false;
  };

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

  /** The live world with the runtime probes (site checks and the dev search). */
  function probeWorld(): SiteWorld {
    heavyBudget = 40;
    return {
      heightAt: (x, z) => ctx.world.heightAt(x, z),
      isLand: (x, z) => ctx.world.isLand(x, z),
      waterLevel: ctx.world.waterLevel,
      anchors: ctx.world.anchors as unknown as SiteWorld['anchors'],
      gemSpots: ctx.world.gemSpots,
      chestSpots: ctx.world.chestSpots,
      roads: ROADS,
      half: ctx.world.size / 2,
      blocked,
      view,
    };
  }

  function build(): void {
    if (built) return;
    built = true;
    const sites = table.map((f, index) => {
      const board = boardOf(f);
      const site: SiteState = {
        id: f.id, index, x: f.x, y: ctx.world.heightAt(f.x, f.z), z: f.z, yaw: f.yaw, radius: GLASSES.siteRadius, near: f.near, board, valid: true, problem: null,
        arrival: nearestRoadPoint(ROADS, f.x, f.z),
      };
      // Fixed means fixed: a site that something now stands on is reported, never moved.
      const problem = groundProblem(probeWorld(), f.x, f.z);
      if (problem) {
        site.valid = false;
        const why = problem === 'blocked' ? blockReason(f.x, f.z, GLASSES.siteRadius + 1.5) : null;
        site.problem = why ? `${problem}: ${why}` : problem;
        // Test mode reports it through `__rgGlasses.sites()` (the framework spec names the site and
        // the blocker); the console stays clean so unrelated specs are not failed by it.
        if (!ctx.testMode) console.warn(`glasses: fixed site ${f.id} at (${f.x}, ${f.z}) is ${site.problem}; leaving it where it is`);
      }
      return site;
    });
    atlas = createGlassesAtlas();
    boardMat = createBoardMaterial(atlas);
    boothAtlas = createBoothAtlas();
    boothMat = createBoothMaterial(boothAtlas.texture);
    for (const site of sites) {
      const def = MECHANICS.find((m) => m.id === site.id);
      if (!def) continue;
      entries.push(makeEntry(def, site));
    }
  }

  /** Board + mechanic for one site. */
  function makeEntry(def: MechanicDef, site: SiteState): Entry {
    if (!boardMat) throw new Error('glasses: board material missing');
    const board = def.booth ? null : createBoard(ctx, boardMat, { x: site.board.x, y: ctx.world.heightAt(site.board.x, site.board.z), z: site.board.z, yaw: site.yaw }, def.pictos);
    const objects = new Map<THREE.Object3D, VisionLayer>();
    const idle = new FarIdle();
    // The entry is completed right below; the env closes over it.
    const entry = { def, site, board, kit: null, idle, objects } as Entry;
    const env: MechanicEnv = {
      ctx,
      id: def.id,
      kind: def.kind,
      site,
      rng: seededRng(hashString(def.id)),
      local: (x, z) => siteToWorld(site, x, z),
      groundAt: (x, z) => ctx.world.heightAt(x, z),
      board: (pictos) => entry.board?.setPictos(pictos),
      booth(setup) {
        if (entry.kit) throw new Error(`glasses: ${def.id} already has a booth`);
        if (!boothAtlas || !boothMat) throw new Error('glasses: booth atlas missing');
        if (entry.board) {
          entry.board.dispose();
          entry.board = null;
        }
        const slot = site.index >= 0 ? site.index : Math.max(0, MECHANICS.indexOf(def));
        boothAtlas.drawDemo(slot, setup.demo);
        entry.kit = createBoothKit(
          { ctx, site, add: env.add, remove: env.remove, pay: env.pay, result: env.result, material: boothMat, slot, isActive: () => idle.active },
          setup,
        );
        return entry.kit;
      },
      pay: (gems) => {
        pay(ctx, gems);
      },
      result: (tier, hit) => result(ctx.events, def.id, def.kind, tier, hit),
      challenge: () => ctx.vision.challenge?.() ?? IDENTITY_CHALLENGE,
      add(object, layer) {
        if (objects.has(object)) env.remove(object);
        objects.set(cameraSafe(object), layer);
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
    return entry;
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
        return entries.map(({ site: s }) => ({ id: s.id, x: s.x, y: s.y, z: s.z, yaw: s.yaw, radius: s.radius, near: s.near, valid: s.valid, problem: s.problem, board: { ...s.board }, arrival: s.arrival ? { ...s.arrival } : null }));
      },
      goto(id) {
        const e0 = byId(id);
        const spot = signSpot(e0);
        // The board's place (the booth's marquee for a booth game) for every check below.
        const site = { ...e0.site, board: { x: spot.x, z: spot.z }, yaw: e0.kit ? e0.site.yaw : spot.yaw };
        // Aim between the site centre and its board so both are in view.
        const aim = { x: site.x * 0.55 + site.board.x * 0.45, z: site.z * 0.55 + site.board.z * 0.45 };
        let best: { x: number; z: number } | null = null;
        const boardY = ctx.world.heightAt(site.board.x, site.board.z);
        outer: for (const half of [4, 3, 2, 0]) {
          for (const d of [GLASSES.viewDistance, 14, 10, 17, 8, 20]) {
            for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]) {
              const yaw = site.yaw + off;
              const c = { x: site.x + Math.sin(yaw) * d, z: site.z + Math.cos(yaw) * d };
              if (!ctx.world.isLand(c.x, c.z) || ctx.world.heightAt(c.x, c.z) < ctx.world.waterLevel + 0.5) continue;
              if (blocked(c.x, c.z, 0.7)) continue;
              // The camera sits ~5 m behind the player: keep both sightlines to the board clear.
              const k = 5 / Math.hypot(c.x - aim.x, c.z - aim.z);
              const back = { x: c.x + (c.x - aim.x) * k, z: c.z + (c.z - aim.z) * k };
              if (half > 0 && (!corridorClear(c.x, c.z, site.board.x, site.board.z, half) || !corridorClear(back.x, back.z, site.board.x, site.board.z, half))) continue;
              if (!sightClear(c.x, c.z, 1.7, site) || !sightClear(back.x, back.z, 3.2, site)) continue;
              // Not far below the board (the camera would look at its posts), and no prop or
              // canopy between the camera and any part of the panel.
              if (half > 0 && ctx.world.heightAt(c.x, c.z) < boardY - 1.5) continue;
              if (half > 0 && !panelClear(back.x, back.z, 3.2, site)) continue;
              best = c;
              break outer;
            }
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
        const sign = signOf(e);
        let n = sign ? countDraws(sign) : 0;
        for (const o of e.mech.drawObjects()) n += countDraws(o);
        return n;
      },
      signDraws(id) {
        const sign = signOf(byId(id));
        return sign ? countDraws(sign) : 0;
      },
      isBooth: (id) => !!byId(id).kit,
      boothPadView: (id) => byId(id).kit?.padView() ?? null,
      boothPlay: (id) => byId(id).kit?.forcePlay(),
      boothCancel: (id) => byId(id).kit?.cancel(),
      boothDebug: (id) => byId(id).kit?.debug() ?? null,
      boothPadProbe: (id, k) => byId(id).kit?.booth.probePad(k),
      objects() {
        build();
        const out: THREE.Object3D[] = [];
        for (const e of entries) {
          const sign = signOf(e);
          if (sign) out.push(sign);
          out.push(...e.objects.keys());
        }
        return out;
      },
      active: (id) => byId(id).idle.active,
      search(id, start, faceTo, playRadius, wantStats) {
        const others = table.some((f) => f.id === id) ? table.filter((f) => f.id !== id) : [];
        const st: Record<string, number> = {};
        const row = searchSite(probeWorld(), start, { id, near: '?', faceTo: faceTo ?? undefined, others, playRadius, stats: st });
        return row ?? (wantStats ? st : null);
      },
      trySite(id, row) {
        build();
        const def = MECHANICS.find((m) => m.id === id);
        if (!def) throw new Error(`glasses: unknown mechanic ${id}`);
        const f: FixedSite = { id, near: '?', ...row };
        const site = { id, index: -1, x: f.x, y: ctx.world.heightAt(f.x, f.z), z: f.z, yaw: f.yaw, radius: GLASSES.siteRadius, near: '?', board: boardOf(f), valid: true, problem: null };
        const e = makeEntry(def, site);
        e.idle.active = true;
        setActive(e, true);
        e.mech.update(1 / 60);
        const out = e.mech.debug();
        setActive(e, false);
        e.mech.dispose();
        for (const o of e.objects.keys()) ctx.vision.remove(o);
        e.board?.dispose();
        return out;
      },
      probe(x, z, yaw, playRadius) {
        const w = probeWorld();
        const others = table.filter((f) => Math.hypot(f.x - x, f.z - z) > 0.5);
        return {
          problems: staticProblems(w, x, z, { playRadius, others }),
          ground: groundProblem(w, x, z) && `${groundProblem(w, x, z)}: ${blockReason(x, z, GLASSES.siteRadius + 1.5) ?? ''}`,
          views: [0, 1, 2].map((slot) => view(x, z, yaw, boardOf({ id: '', x, z, yaw, slot, near: '' }))),
        };
      },
      sight(a, b) {
        const from = new THREE.Vector3(a.x, a.y, a.z);
        const d = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
        const len = d.length();
        if (len < 0.5) return null;
        d.normalize();
        const hit = ctx.physics.raycast(from, d, len - 0.3);
        if (hit) return `collider at (${hit.point.x.toFixed(1)}, ${hit.point.y.toFixed(1)}, ${hit.point.z.toFixed(1)})`;
        return sceneHitName(from, d, len - 0.3) ?? sceneHitName(from, d, len - 0.3, true);
      },
      boardRect(id) {
        const e = byId(id);
        const mesh = signOf(e);
        if (!mesh) return null;
        const geo = mesh.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        // A booth's mesh spans the whole play; its "board" is the marquee.
        const bb = e.kit ? e.kit.booth.build.marqueeBox : (geo.boundingBox as THREE.Box3);
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

  const weave = createWeave(ctx, { countDraws });

  return {
    update(dt) {
      update(dt);
      weave.update(dt);
    },
    dispose() {
      weave.dispose?.();
      offPhase();
      for (const e of entries) {
        e.mech.dispose();
        for (const o of e.objects.keys()) ctx.vision.remove(o);
        e.objects.clear();
        e.board?.dispose();
      }
      entries.length = 0;
      boardMat?.dispose();
      atlas?.dispose();
      boothMat?.dispose();
      boothAtlas?.dispose();
      if (ctx.testMode) delete window.__rgGlasses;
    },
  };
}
