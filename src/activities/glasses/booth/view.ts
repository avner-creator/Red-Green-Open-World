/**
 * What the child sees from the start pad (pure; unit-tested). The game's default camera stands
 * `CAM_BACK` behind the hero and `CAM_UP` above the feet, looking at the hero's head (pivot 1.45 m).
 * With it a mini-game can ask "where does my ONE prompt sit in clear view from the pad?":
 *
 *  - `padCamera(pad, look)`: the default camera of a hero on the pad facing `look`;
 *  - `screenRect(p, size, cam, aspect)`: a billboard's screen rectangle (0..1, y down);
 *  - `PROMPT_SAFE`: the central area the HUD never covers (wallet, compass, timer, Fun Pass chip
 *    and the radio top; wardrobe and skill buttons right; touch controls bottom-left and
 *    bottom-right; the hero bottom-centre). Measured on the HUD at 640×360 and 1280×720; the e2e
 *    specs check the real HUD rectangles too;
 *  - `pickPromptSpot(candidates, …)`: the first candidate whose rectangle lies in the safe area for
 *    every aspect and keeps clear of the things that must stay visible (symbols, the sign …).
 *
 * The prompt's place may depend on the layout, never on the answer.
 */
import * as THREE from 'three';
import { CAMERA } from '../../../config';
import type { V3 } from './types';

export const PAD_PIVOT = 1.45;
const ARM = Math.atan2(CAMERA.height, CAMERA.distance);
export const PAD_CAM_BACK = CAMERA.distance * Math.cos(ARM);
export const PAD_CAM_UP = PAD_PIVOT + CAMERA.distance * Math.sin(ARM);

/** Central screen area (0..1, y down) that no HUD element covers, at 16:9 and 4:3. */
export const PROMPT_SAFE = { x0: 0.24, x1: 0.76, y0: 0.2, y1: 0.66 } as const;
/** The hero's own box from the pad camera (the prompt must not sit on the hero). */
export const HERO_BOX = { x0: 0.42, x1: 0.58, y0: 0.42, y1: 1 } as const;
export const ASPECTS = [16 / 9, 4 / 3] as const;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The default camera of a hero standing on `pad` (feet, frame-local) facing the point `look`. */
export function padCamera(pad: V3, look: { x: number; z: number }, aspect = 16 / 9): THREE.PerspectiveCamera {
  const dx = look.x - pad.x;
  const dz = look.z - pad.z;
  const l = Math.hypot(dx, dz) || 1;
  const cam = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 0.1, 500);
  cam.position.set(pad.x - (dx / l) * PAD_CAM_BACK, pad.y + PAD_CAM_UP, pad.z - (dz / l) * PAD_CAM_BACK);
  cam.lookAt(pad.x, pad.y + PAD_PIVOT, pad.z);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

const v = new THREE.Vector3();

/** Screen point (0..1, y down) of a frame-local point; null when behind the camera. */
export function screenPoint(p: V3, cam: THREE.Camera): { x: number; y: number } | null {
  v.set(p.x, p.y, p.z).applyMatrix4(cam.matrixWorldInverse);
  if (v.z > -0.1) return null;
  v.applyMatrix4((cam as THREE.PerspectiveCamera).projectionMatrix);
  return { x: v.x * 0.5 + 0.5, y: 0.5 - v.y * 0.5 };
}

/** Screen rectangle of a camera-facing square of edge `size` m centred on `p`. */
export function screenRect(p: V3, size: number, cam: THREE.PerspectiveCamera): Rect | null {
  const e = cam.matrixWorld.elements;
  const rx = e[0];
  const ry = e[1];
  const rz = e[2];
  const ux = e[4];
  const uy = e[5];
  const uz = e[6];
  let r: Rect | null = null;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const h = size / 2;
    const q = screenPoint({ x: p.x + (rx * a + ux * b) * h, y: p.y + (ry * a + uy * b) * h, z: p.z + (rz * a + uz * b) * h }, cam);
    if (!q) return null;
    r = r ? { x0: Math.min(r.x0, q.x), y0: Math.min(r.y0, q.y), x1: Math.max(r.x1, q.x), y1: Math.max(r.y1, q.y) } : { x0: q.x, y0: q.y, x1: q.x, y1: q.y };
  }
  return r;
}

export const inside = (r: Rect, s: Rect): boolean => r.x0 >= s.x0 && r.x1 <= s.x1 && r.y0 >= s.y0 && r.y1 <= s.y1;
export const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export interface PromptSpotOptions {
  /** The pad (feet, frame-local) and the point the hero faces from it (the play's focus). */
  pad: V3;
  look: { x: number; z: number };
  /** Prompt edge length (m). */
  size: number;
  /** Things that must stay visible: frame-local centre and size (m) of each (a symbol, the sign …). */
  keepClear?: readonly { p: V3; size: number }[];
  aspects?: readonly number[];
}

/** Does a prompt at `p` sit in clear view from the pad (safe area, off the hero and the keep-clear things)? */
export function promptFits(p: V3, o: PromptSpotOptions): boolean {
  for (const aspect of o.aspects ?? ASPECTS) {
    const cam = padCamera(o.pad, o.look, aspect);
    const r = screenRect(p, o.size, cam);
    if (!r || !inside(r, PROMPT_SAFE) || overlaps(r, HERO_BOX)) return false;
    for (const k of o.keepClear ?? []) {
      const kr = screenRect(k.p, k.size, cam);
      if (kr && overlaps(r, kr)) return false;
    }
  }
  return true;
}

/** The first candidate that fits (see `promptFits`); else the one nearest the safe area's centre. */
export function pickPromptSpot(candidates: readonly V3[], o: PromptSpotOptions): { at: V3; fits: boolean } {
  for (const c of candidates) if (promptFits(c, o)) return { at: c, fits: true };
  let best = candidates[0];
  let bestD = Infinity;
  const cam = padCamera(o.pad, o.look);
  for (const c of candidates) {
    const q = screenPoint(c, cam);
    const d = q ? Math.hypot(q.x - 0.5, q.y - 0.43) : Infinity;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { at: best, fits: false };
}

// ───────────────────────────── demo legibility ─────────────────────────────

/** Rule of thumb (README "Demo legibility"): at 8 m on a 640×360 screen. */
export const DEMO_RULE = { distance: 8, viewportH: 360, minPanelPx: 85, minHeroPx: 26, minHeroUnits: 33, maxThings: 9 } as const;

/** Pixels per metre at `distance` for a `viewportH` px tall view with the game's vertical FOV. */
export function pxPerMetre(distance: number, viewportH: number): number {
  return viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2)) * distance);
}
