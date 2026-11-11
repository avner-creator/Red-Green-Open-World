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
  /**
   * Optional: points whose sightlines from the default camera must also be clear of tree
   * CANOPIES (canopies have no colliders: every trunk within `CANOPY_R` of a sightline counts as
   * a blocker), e.g. the four corners of a sign.
   */
  canopyTargets?: readonly { x: number; z: number; y: number }[];
  /**
   * Optional: alternative hero spots on the approach (layout-local); at least one of them must see
   * `canopyTargets` clearly (camera behind the hero, looking at the targets' centre).
   */
  views?: readonly { x: number; z: number }[];
  /** Optional: no ground prop (bush, rock) on the hero spot or within this many metres of the line camera → hero (default 1.5). */
  foreground?: number;
}

export interface ChooseOptions {
  /**
   * Refresh the world's streamed decor (trees, bushes, rocks) around the site before the scene
   * checks: the scatter only fills its instance buffers for what the camera sees, so the camera
   * is briefly put above the site, the world updated once, and everything put back.
   */
  refreshDecor?: boolean;
}

export interface Layout {
  x: number;
  z: number;
  yaw: number;
  /** Shift (site-local) and turn of the chosen candidate, and its remaining problems (0 = clean). */
  shift: { x: number; z: number };
  turn: number;
  problems: number;
  /** What is still wrong with the chosen candidate (debug), and how long the search took (ms). */
  notes?: string[];
  /** The clearest of `spec.views` for this layout (layout-local), if any were given. */
  view?: { x: number; z: number };
  ms?: number;
}

type Site = { x: number; y: number; z: number; yaw: number; radius: number; board: { x: number; z: number } };

/** Half the horizontal field of view at a 16:9 canvas, plus a margin (radians). */
const HALF_HFOV = Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2)) * (16 / 9)) + 0.05;
/** Board panel half width (3 pictograms). */
const BOARD_HALF = 2.8;
/** Height band of the board's panel above its ground (panel ≈ 1.9–3.9 m, plus a margin). */
const BOARD_LOW = 1.7;
const BOARD_HIGH = 4.2;
/** A trunk this close to the camera's sightline means its canopy is in the picture. */
const TRUNK_CLEAR = 3.0;
/** Canopy reach around a detected trunk. */
export const CANOPY_R = 3.5;

export function chooseLayout(ctx: Pick<GameContext, 'world' | 'physics' | 'scene' | 'player' | 'camera'>, site: Site, spec: LayoutSpec, opts: ChooseOptions = {}): Layout {
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
  // The pictogram board is built just before the mechanic, in the same frame: its colliders are
  // not in the physics query pipeline until the next physics step, so it is tested by geometry.
  const bnx = Math.sin(site.yaw);
  const bnz = Math.cos(site.yaw);
  const boardY = ctx.world.heightAt(site.board.x, site.board.z);
  const crossesBoard = (a: THREE.Vector3, b: THREE.Vector3): boolean => {
    const da = (a.x - site.board.x) * bnx + (a.z - site.board.z) * bnz;
    const db = (b.x - site.board.x) * bnx + (b.z - site.board.z) * bnz;
    if ((da > 0 && db > 0) || (da < 0 && db < 0) || da === db) return false;
    const t = da / (da - db);
    const x = a.x + (b.x - a.x) * t - site.board.x;
    const z = a.z + (b.z - a.z) * t - site.board.z;
    const y = a.y + (b.y - a.y) * t - boardY;
    return Math.abs(x * bnz - z * bnx) < BOARD_HALF && y > BOARD_LOW && y < BOARD_HIGH;
  };
  const physicsClear = (a: THREE.Vector3, b: THREE.Vector3): boolean => {
    d.subVectors(b, a);
    const len = d.length();
    if (len < 0.4) return true;
    if (crossesBoard(a, b)) return false;
    return !ctx.physics.raycast(o.copy(a), d.normalize(), len - 0.35);
  };

  const side3 = new THREE.Vector3();
  /** Horizontal cross rays at trunk height every 0.4 m from (ax, az) to `past` m past (bx, bz). */
  const corridorClear = (ax: number, az: number, bx: number, bz: number, half = TRUNK_CLEAR, past = 1.5): boolean => {
    const gx = bx - ax;
    const gz = bz - az;
    const len = Math.hypot(gx, gz);
    if (len < 1e-6) return true;
    const ux = gx / len;
    const uz = gz / len;
    side3.set(-uz, 0, ux);
    for (let t = 0.8; t <= len + past; t += 0.4) {
      const cx = ax + ux * t;
      const cz = az + uz * t;
      const y = ctx.world.heightAt(cx, cz) + 1.2;
      const hit = ctx.physics.raycast(o.set(cx + uz * half, y, cz - ux * half), side3, half * 2);
      if (hit && hit.normal.y < 0.7) return false;
    }
    return true;
  };

  interface Eval {
    layout: Layout;
    cam: THREE.Vector3;
    pivot: THREE.Vector3;
    targets: THREE.Vector3[];
    /** Default cameras of the alternative approach views (with their cheap penalty), and the canopy targets (world). */
    views: { cam: THREE.Vector3; pen: number; why: string[]; spot: { x: number; z: number } }[];
    canopy: THREE.Vector3[];
    problems: number;
    notes: string[];
  }

  const evaluate = (c: (typeof cands)[number]): Eval => {
    const at = sf.toWorld(c.shift.x, c.shift.z);
    const L = { x: at.x, z: at.z, yaw: site.yaw + c.turn };
    const lf = siteFrame(L);
    let problems = 0;
    const notes: string[] = [];
    const bad = (n: string, k: number): void => {
      problems += k;
      notes.push(n);
    };
    for (const p of spec.footprint) {
      const w = lf.toWorld(p.x, p.z);
      const sl = sf.toLocal(w.x, w.z);
      if (Math.hypot(sl.x, sl.z) > spec.radius) bad('outside', 10);
      else if (!ctx.world.isLand(w.x, w.z) || ctx.world.heightAt(w.x, w.z) < ctx.world.waterLevel + 0.5) bad('water', 10);
      else if (blockedAt(w.x, w.z)) bad('blocked', 10);
    }
    const hw = lf.toWorld(spec.hero.x, spec.hero.z);
    const hy = ctx.world.heightAt(hw.x, hw.z);
    const cw = lf.toWorld(spec.hero.x, spec.hero.z + CAM_BACK);
    const cam = new THREE.Vector3(cw.x, hy + CAM_UP, cw.z);
    const pivot = new THREE.Vector3(hw.x, hy + PIVOT, hw.z);
    if (ctx.world.heightAt(cw.x, cw.z) > cam.y - 0.5) bad('camera in hill', 5); // camera in a hillside
    // The board out of the view cone (its centre and both ends), or behind the camera.
    const fwd = Math.atan2(-Math.sin(L.yaw), -Math.cos(L.yaw));
    const bx = Math.cos(site.yaw);
    const bz = -Math.sin(site.yaw);
    const boardInView = (from: THREE.Vector3, tag: string): void => {
      for (const k of [-1, 0, 1]) {
        const px = site.board.x + bx * BOARD_HALF * k - from.x;
        const pz = site.board.z + bz * BOARD_HALF * k - from.z;
        const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(px, pz) - fwd), Math.cos(Math.atan2(px, pz) - fwd)));
        if (ang < HALF_HFOV && Math.hypot(px, pz) < 25) bad(`board in view ${tag}`, 2);
      }
    };
    boardInView(cam, 'play');
    const targets = spec.targets.map((t) => {
      const w = lf.toWorld(t.x, t.z);
      return new THREE.Vector3(w.x, ctx.world.heightAt(w.x, w.z) + t.y, w.z);
    });
    if (!physicsClear(pivot, cam)) bad('camera blocked', 3);
    // Far decor trees are only streamed into the scene near the player, but every tree has a
    // trunk collider: a trunk (or a wall, or the board) within TRUNK_CLEAR of the line from the
    // hero to just behind the camera means its canopy hangs in the view.
    if (!corridorClear(hw.x, hw.z, cw.x, cw.z)) bad('trunk near camera', 4);
    targets.forEach((t, i) => {
      if (!physicsClear(cam, t)) bad(`target ${i} blocked`, 3);
    });
    const toWorld3 = (t: { x: number; z: number; y: number }): THREE.Vector3 => {
      const w = lf.toWorld(t.x, t.z);
      return new THREE.Vector3(w.x, ctx.world.heightAt(w.x, w.z) + t.y, w.z);
    };
    const canopy = (spec.canopyTargets ?? []).map(toWorld3);
    // Approach views are alternatives: the layout needs one of them clear. The camera sits behind
    // the hero on the line from the sign's centre (the hero faces the sign).
    const sc = spec.canopyTargets?.length ? spec.canopyTargets.reduce((acc, t) => ({ x: acc.x + t.x / spec.canopyTargets!.length, z: acc.z + t.z / spec.canopyTargets!.length }), { x: 0, z: 0 }) : { x: 0, z: 0 };
    const views = (spec.views ?? []).map((v, i) => {
      const len = Math.hypot(v.x - sc.x, v.z - sc.z) || 1;
      const vh = lf.toWorld(v.x, v.z);
      const vw = lf.toWorld(v.x + ((v.x - sc.x) / len) * CAM_BACK, v.z + ((v.z - sc.z) / len) * CAM_BACK);
      const vy = ctx.world.heightAt(vh.x, vh.z);
      const vcam = new THREE.Vector3(vw.x, vy + CAM_UP, vw.z);
      const why: string[] = [];
      let pen = 0;
      if (!ctx.world.isLand(vh.x, vh.z) || blockedAt(vh.x, vh.z)) {
        pen += 3;
        why.push(`view ${i} spot`);
      }
      // The approach camera must not be pulled in by a collider, nor see the sign through the board.
      if (!physicsClear(new THREE.Vector3(vh.x, vy + PIVOT, vh.z), vcam)) {
        pen += 2;
        why.push(`view ${i} camera blocked`);
      }
      if (!corridorClear(vh.x, vh.z, vw.x, vw.z)) {
        pen += 2;
        why.push(`view ${i} trunk near camera`);
      }
      for (const t of spec.canopyTargets ?? []) {
        const tw = lf.toWorld(t.x, t.z);
        if (!physicsClear(vcam, new THREE.Vector3(tw.x, ctx.world.heightAt(tw.x, tw.z) + t.y, tw.z))) {
          pen += 2;
          why.push(`view ${i} corner blocked`);
        }
      }
      return { cam: vcam, pen, why, spot: { x: v.x, z: v.z } };
    });
    if (views.length) problems += Math.min(...views.map((v) => v.pen));
    return { layout: { ...L, shift: c.shift, turn: c.turn, problems }, cam, pivot, targets, views, canopy, problems, notes };
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
      // Glasses boards and mechanics have colliders (physics probes); grass is not in the way.
      if (!m.isMesh || /^(terrain|road|paving|water|sky|grass|flower|glasses:)/i.test(obj.name)) return;
      for (let p: THREE.Object3D | null = obj; p; p = p.parent) if (!p.visible || p === ctx.player.object) return;
      if (!(m as THREE.InstancedMesh).isInstancedMesh) {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const bs = m.geometry.boundingSphere;
        // Big merged batches (village, park…) cost milliseconds per ray and their solid parts have
        // colliders: the physics probes cover them. Decor (trees, bushes, rocks) is instanced.
        if (!bs || bs.radius * m.matrixWorld.getMaxScaleOnAxis() > 25) return;
      }
      list.push(obj);
    });
    meshes = list;
    return list;
  };
  let lastHit = '';
  const sceneClear = (a: THREE.Vector3, b: THREE.Vector3, minAbove = 0.7, stop = 0.4): boolean => {
    d.subVectors(b, a);
    const len = d.length();
    raycaster.set(a, d.normalize());
    raycaster.near = 0;
    raycaster.far = Math.max(0, len - stop);
    for (const h of raycaster.intersectObjects(meshList(), false)) {
      // Grass and ground clutter is not "in the way".
      if (h.point.y < ctx.world.heightAt(h.point.x, h.point.z) + minAbove) continue;
      lastHit = h.object.name || h.object.type;
      return false;
    }
    return true;
  };

  const fg = spec.foreground ?? 1.5;
  const a3 = new THREE.Vector3();
  const b3 = new THREE.Vector3();
  /** Costly checks: canopies (trunk reach + scene meshes) and ground props in the foreground. */
  const costly = (e: Eval, notes: string[] = [], picked: { view?: { x: number; z: number } } = {}): number => {
    let p = 0;
    const note = (n: string, k: number): void => {
      p += k;
      notes.push(n.startsWith('canopy trunk') ? n : `${n} (${lastHit})`);
    };
    if (!sceneClear(e.pivot, e.cam)) note('scene hero-cam', 3);
    e.targets.forEach((t, i) => {
      if (!sceneClear(e.cam, t)) note(`scene target ${i}`, 3);
    });
    const canopyPen = (cam: THREE.Vector3, tag: string, out: string[]): number => {
      let q = 0;
      e.canopy.forEach((t, i) => {
        if (!sceneClear(cam, t, 0.7, 0.6)) {
          q += 3;
          out.push(`canopy scene ${tag} corner ${i} (${lastHit})`);
        }
        if (!corridorClear(cam.x, cam.z, t.x, t.z, CANOPY_R, -1.2)) {
          q += 2;
          out.push(`canopy trunk ${tag} corner ${i}`);
        }
      });
      return q;
    };
    const mainNotes: string[] = [];
    p += canopyPen(e.cam, 'play', mainNotes);
    notes.push(...mainNotes);
    if (e.views.length) {
      // The cheap view penalty is already in e.problems (its minimum); replace it by the best total.
      const minCheap = Math.min(...e.views.map((v) => v.pen));
      let bestV = Infinity;
      let bestNotes: string[] = [];
      for (const v of [...e.views].sort((a, b) => a.pen - b.pen)) {
        if (v.pen >= bestV) break;
        const vn: string[] = [];
        const tot = v.pen + canopyPen(v.cam, 'view', vn);
        if (tot < bestV) {
          bestV = tot;
          bestNotes = [...v.why, ...vn];
          picked.view = v.spot;
        }
        if (tot === 0) break;
      }
      p += bestV - minCheap;
      notes.push(...bestNotes);
    }
    // Foreground: nothing standing on the hero spot or within `fg` of the line camera → hero.
    const hx = e.pivot.x;
    const hz = e.pivot.z;
    const gy = ctx.world.heightAt(hx, hz);
    if (!sceneClear(a3.set(hx, gy + 3, hz), b3.set(hx, gy, hz), 0.3, 0)) note('prop on hero spot', 3);
    const dx = e.cam.x - hx;
    const dz = e.cam.z - hz;
    const len = Math.hypot(dx, dz) || 1;
    for (const off of [-fg, -fg / 2, 0, fg / 2, fg]) {
      const ox = (-dz / len) * off;
      const oz = (dx / len) * off;
      for (const y of [0.45, 0.95]) {
        const ay = ctx.world.heightAt(e.cam.x + ox, e.cam.z + oz) + y;
        const by = ctx.world.heightAt(hx + ox, hz + oz) + y;
        if (!sceneClear(a3.set(e.cam.x + ox, ay, e.cam.z + oz), b3.set(hx + ox, by, hz + oz), 0.3, 0)) {
          note(`foreground ${off}`, 3);
          break;
        }
      }
    }
    return p;
  };

  const evals = cands.map(evaluate).sort((a, b) => a.problems - b.problems);
  let best: Eval | null = null;
  let bestScore = Infinity;
  const cam = ctx.camera;
  const saved = opts.refreshDecor ? { p: cam.position.clone(), q: cam.quaternion.clone() } : null;
  const resetInstanced = (): void => {
    for (const m of meshList()) if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).boundingSphere = null;
  };
  if (saved) {
    cam.position.set(site.x, site.y + 36, site.z + 0.01);
    cam.lookAt(site.x, site.y, site.z);
    cam.updateMatrixWorld();
    ctx.world.update(0);
    resetInstanced();
  }
  const t0 = performance.now();
  let bestNotes: string[] = [];
  let bestView: { x: number; z: number } | undefined;
  try {
    for (const e of evals.slice(0, 30)) {
      if (e.problems >= bestScore) break; // sorted: nothing later can win
      const notes: string[] = [];
      const picked: { view?: { x: number; z: number } } = {};
      const p = e.problems + costly(e, notes, picked);
      if (p < bestScore) {
        best = e;
        bestScore = p;
        bestNotes = [...e.notes.filter((n) => !n.startsWith('view ')), ...notes];
        bestView = picked.view;
      }
      if (p === 0) break;
    }
  } finally {
    if (saved) {
      cam.position.copy(saved.p);
      cam.quaternion.copy(saved.q);
      cam.updateMatrixWorld();
      ctx.world.update(0);
      resetInstanced();
    }
  }
  const chosen = best ?? evals[0];
  return {
    ...chosen.layout,
    problems: bestScore === Infinity ? chosen.problems : bestScore,
    notes: best ? bestNotes : chosen.notes,
    view: bestView,
    ms: Math.round(performance.now() - t0),
  };
}
