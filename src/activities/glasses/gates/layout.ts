/**
 * Where the play layout sits inside its site, chosen once at build time so the child sees the
 * play with the game's DEFAULT third-person camera: from the spot where the hero plays, the
 * camera (behind the hero, `CAMERA.distance` back at the base pitch) must have a clear view of
 * every key point (no tree canopy, trunk, wall or the pictogram board in between), and the
 * pictogram board must stay out of the view cone.
 *
 * Candidates shift and turn the layout within the site radius; the cheap checks (radius, land,
 * colliders, board in view) run for all of them, the costly scene-mesh rays (canopies have no
 * colliders) only for the best few, in order. Deterministic: the world is.
 */
import * as THREE from 'three';
import { CAMERA } from '../../../config';
import type { GameContext } from '../../../types';
import { siteFrame } from './kit';

/** Height of the camera's orbit pivot above the feet (core camera tuning, mirrored here). */
const PIVOT = 1.45;
/** Default camera offset behind the hero: horizontal distance and height above the feet. */
export const CAM_BACK = CAMERA.distance * Math.cos(Math.atan2(CAMERA.height, CAMERA.distance));
export const CAM_UP = PIVOT + CAMERA.distance * Math.sin(Math.atan2(CAMERA.height, CAMERA.distance));

export interface LayoutSpec {
  /** Where the hero stands to play (layout-local x, z); the camera looks along layout −Z. */
  hero: { x: number; z: number };
  /** Points that must be in clear view (layout-local x, z, height above the ground there). */
  targets: readonly { x: number; z: number; y: number }[];
  /** Footprint points that must stay inside the site and on clear land (layout-local). */
  footprint: readonly { x: number; z: number }[];
  /** Max distance of the footprint from the site centre. */
  radius: number;
}

export interface Layout {
  x: number;
  z: number;
  yaw: number;
  /** Shift (site-local) and turn of the chosen candidate, and its remaining problems (0 = clean). */
  shift: { x: number; z: number };
  turn: number;
  problems: number;
}

type Site = { x: number; y: number; z: number; yaw: number; radius: number; board: { x: number; z: number } };

/** Half the horizontal field of view at a 16:9 canvas, plus a margin (radians). */
const HALF_HFOV = Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2)) * (16 / 9)) + 0.05;
/** Board panel half width (3 pictograms). */
const BOARD_HALF = 2.8;
/** A trunk this close to the camera's sightline means its canopy is in the picture. */
const TRUNK_CLEAR = 3.0;

export function chooseLayout(ctx: Pick<GameContext, 'world' | 'physics' | 'scene' | 'player' | 'camera'>, site: Site, spec: LayoutSpec): Layout {
  const sf = siteFrame(site);
  const boardLocal = sf.toLocal(site.board.x, site.board.z);
  const side = boardLocal.x > 1 ? 1 : boardLocal.x < -1 ? -1 : 1;
  // Candidates in order of preference: small moves first, away from the board first.
  const shifts: { x: number; z: number }[] = [];
  for (const dz of [-0.6, -1.0, -0.2, -1.5]) for (const dx of [-0.8, 0, -1.6, 0.8]) shifts.push({ x: dx * side, z: dz });
  const turns = [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75].map((t) => t * side);
  const cands: { shift: { x: number; z: number }; turn: number; rank: number }[] = [];
  shifts.forEach((s, i) => turns.forEach((t, j) => cands.push({ shift: s, turn: t, rank: i + j * 1.5 })));
  cands.sort((a, b) => a.rank - b.rank);

  const down = new THREE.Vector3(0, -1, 0);
  const o = new THREE.Vector3();
  const d = new THREE.Vector3();
  const blockedAt = (x: number, z: number): boolean => {
    const gy = ctx.world.heightAt(x, z);
    const hit = ctx.physics.raycast(o.set(x, gy + 30, z), down, 40);
    return !!hit && hit.point.y > gy + 0.4;
  };
  const physicsClear = (a: THREE.Vector3, b: THREE.Vector3): boolean => {
    d.subVectors(b, a);
    const len = d.length();
    if (len < 0.4) return true;
    return !ctx.physics.raycast(o.copy(a), d.normalize(), len - 0.35);
  };

  const side3 = new THREE.Vector3();
  /** Horizontal cross rays at trunk height every 0.4 m from (ax, az) to 1.5 m past (bx, bz). */
  const corridorClear = (ax: number, az: number, bx: number, bz: number): boolean => {
    const gx = bx - ax;
    const gz = bz - az;
    const len = Math.hypot(gx, gz);
    if (len < 1e-6) return true;
    const ux = gx / len;
    const uz = gz / len;
    side3.set(-uz, 0, ux);
    for (let t = 0.8; t <= len + 1.5; t += 0.4) {
      const cx = ax + ux * t;
      const cz = az + uz * t;
      const y = ctx.world.heightAt(cx, cz) + 1.2;
      const hit = ctx.physics.raycast(o.set(cx + uz * TRUNK_CLEAR, y, cz - ux * TRUNK_CLEAR), side3, TRUNK_CLEAR * 2);
      if (hit && hit.normal.y < 0.7) return false;
    }
    return true;
  };

  interface Eval {
    layout: Layout;
    cam: THREE.Vector3;
    pivot: THREE.Vector3;
    targets: THREE.Vector3[];
    problems: number;
  }

  const evaluate = (c: (typeof cands)[number]): Eval => {
    const at = sf.toWorld(c.shift.x, c.shift.z);
    const L = { x: at.x, z: at.z, yaw: site.yaw + c.turn };
    const lf = siteFrame(L);
    let problems = 0;
    for (const p of spec.footprint) {
      const w = lf.toWorld(p.x, p.z);
      const sl = sf.toLocal(w.x, w.z);
      if (Math.hypot(sl.x, sl.z) > spec.radius) problems += 10;
      else if (!ctx.world.isLand(w.x, w.z) || ctx.world.heightAt(w.x, w.z) < ctx.world.waterLevel + 0.5) problems += 10;
      else if (blockedAt(w.x, w.z)) problems += 10;
    }
    const hw = lf.toWorld(spec.hero.x, spec.hero.z);
    const hy = ctx.world.heightAt(hw.x, hw.z);
    const cw = lf.toWorld(spec.hero.x, spec.hero.z + CAM_BACK);
    const cam = new THREE.Vector3(cw.x, hy + CAM_UP, cw.z);
    const pivot = new THREE.Vector3(hw.x, hy + PIVOT, hw.z);
    if (ctx.world.heightAt(cw.x, cw.z) > cam.y - 0.5) problems += 5; // camera in a hillside
    // The board out of the view cone (its centre and both ends), or behind the camera.
    const fwd = Math.atan2(-Math.sin(L.yaw), -Math.cos(L.yaw));
    const bx = Math.cos(site.yaw);
    const bz = -Math.sin(site.yaw);
    for (const k of [-1, 0, 1]) {
      const px = site.board.x + bx * BOARD_HALF * k - cam.x;
      const pz = site.board.z + bz * BOARD_HALF * k - cam.z;
      const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(px, pz) - fwd), Math.cos(Math.atan2(px, pz) - fwd)));
      if (ang < HALF_HFOV && Math.hypot(px, pz) < 25) problems += 2;
    }
    const targets = spec.targets.map((t) => {
      const w = lf.toWorld(t.x, t.z);
      return new THREE.Vector3(w.x, ctx.world.heightAt(w.x, w.z) + t.y, w.z);
    });
    if (!physicsClear(pivot, cam)) problems += 3;
    // Far decor trees are only streamed into the scene near the player, but every tree has a
    // trunk collider: a trunk (or a wall, or the board) within TRUNK_CLEAR of the line from the
    // hero to just behind the camera means its canopy hangs in the view.
    if (!corridorClear(hw.x, hw.z, cw.x, cw.z)) problems += 4;
    for (const t of targets) if (!physicsClear(cam, t)) problems += 3;
    return { layout: { ...L, shift: c.shift, turn: c.turn, problems }, cam, pivot, targets, problems };
  };

  // Scene meshes (canopies, decor) for the costly check.
  const raycaster = new THREE.Raycaster();
  raycaster.camera = ctx.camera;
  raycaster.params.Points = { threshold: 0 };
  raycaster.params.Line = { threshold: 0 };
  let meshes: THREE.Object3D[] | null = null;
  const meshList = (): THREE.Object3D[] => {
    if (meshes) return meshes;
    const list: THREE.Object3D[] = [];
    ctx.scene.updateMatrixWorld();
    ctx.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh || /^(terrain|road|paving|water|sky)/i.test(obj.name)) return;
      for (let p: THREE.Object3D | null = obj; p; p = p.parent) if (!p.visible || p === ctx.player.object) return;
      if (!(m as THREE.InstancedMesh).isInstancedMesh) {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const bs = m.geometry.boundingSphere;
        if (!bs || bs.radius * m.matrixWorld.getMaxScaleOnAxis() > 150) return;
      }
      list.push(obj);
    });
    meshes = list;
    return list;
  };
  const sceneClear = (a: THREE.Vector3, b: THREE.Vector3): boolean => {
    d.subVectors(b, a);
    const len = d.length();
    raycaster.set(a, d.normalize());
    raycaster.near = 0;
    raycaster.far = Math.max(0, len - 0.4);
    for (const h of raycaster.intersectObjects(meshList(), false)) {
      // Grass and ground clutter is not "in the way".
      if (h.point.y < ctx.world.heightAt(h.point.x, h.point.z) + 0.7) continue;
      return false;
    }
    return true;
  };

  const evals = cands.map(evaluate).sort((a, b) => a.problems - b.problems);
  let best: Eval | null = null;
  let bestScore = Infinity;
  for (const e of evals.slice(0, 10)) {
    let p = e.problems;
    if (!sceneClear(e.pivot, e.cam)) p += 3;
    for (const t of e.targets) if (!sceneClear(e.cam, t)) p += 3;
    if (p < bestScore) {
      best = e;
      bestScore = p;
    }
    if (p === 0) break;
  }
  const chosen = best ?? evals[0];
  return { ...chosen.layout, problems: bestScore === Infinity ? chosen.problems : bestScore };
}
