/**
 * Pip, the hero's talking puppy buddy: companion, tutorial, hint system and storyteller.
 *
 *  - model.ts / anim.ts: the procedural puppy (2 skinned draws + a shadow proxy) and his poses.
 *  - this file: following, riding along, reactions to game events, input (T / Pip button /
 *    D-pad down to ask him), and the glue between the director, the dialogue queue, the voice and
 *    the bubble UI (src/ui/buddy).
 *  - director.ts: what he says and where he leads (opening tour, tips, nudges, goals).
 *
 * RULE: Pip never reveals a weak-eye object. He sniffs around when a gem is near (`gem:near`
 * carries no position), with a wander that ignores the gem (sniff.ts). He never faces or walks to
 * a gem, key or lock: he only leads to attraction anchors (guide.ts), and in the intro he puts
 * on his own magic glasses instead of showing a way.
 */
import * as THREE from 'three';
import { chestHintState } from '../activities/chests';
import { getRaceView } from '../activities/race';
import { GEMS, PLAYER } from '../config';
import { RAY_GROUPS } from '../core/physics';
import { GIFT_ITEM } from '../activities/gear/goofy';
import type { Anchor, GameContext, GameSystem } from '../types';
import { CONTROL_MAP } from '../ui/controlMap';
import { createBuddyUi } from '../ui/buddy';
import type { Rect } from '../ui/buddy/place';
import { PipAnimator, defaultInput } from './anim';
import type { AnimInput, Face, Pose } from './anim';
import type { ChestHint, DirectorSink, DirectorView, RideView } from './director';
import { Director } from './director';
import { DialogueQueue, PRIORITY, bubbleMode } from './dialogue';
import type { ActiveLine } from './dialogue';
import { currentGoal } from './goals';
import { buildPip } from './model';
import { RIDE_SCALE, SEAT_DROP, classifyRide, externalKind, vehicleSpot } from './rides';
import type { ExternalKind } from './rides';
import { EXPLAIN } from './script';
import type { HowToTopic, KeyNames } from './script';
import { topicOfPrompt } from './topics';
import { sniffSpot } from './sniff';
import { Leader, planPath } from './guide';
import { terrainClear, terrainRoute, type TerrainProbe } from './route';
import type { LeadOut } from './guide';
import { FOLLOW, angleDelta, arrive, catchUpSpeed, followSlot, forward, keepClear, right, shouldTeleport, teleportSpot, turnTowards, yawTo } from './steer';
import type { V2 } from './steer';
import { createBuddyStore } from './store';
import { GLASSES_ATTRACTIONS, type Attraction } from './types';
import { createVoice } from './voice';
import type { VoiceRequest } from './voice';

/** Keys that play the game: they never skip the intro (moving must not skip the tour). */
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
  'KeyE', 'KeyF', 'KeyR', 'KeyQ', 'KeyC', 'KeyG', 'KeyH', 'KeyT', 'Escape', 'F1', 'Tab', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
]);

/** Where each attraction "is" for first-visit tips and suggestions (radius in metres, horizontal). */
const VISIT_RADIUS: Record<Attraction, number> = {
  trampoline: 10.5,
  bouncePads: 9,
  garage: 4.5,
  balloon: 15,
  launchPads: 10,
  gearShack: 4.5,
  bungee: 5,
  sillyZone: 14,
  ranch: 12,
  carnivalRow: 12,
  iceCream: 8, // the parlour itself is ~6 m across: its front is the place (QA6 M3 dest check)
  bubbleArena: 13,
  dinoRing: 8,
  raceStart: 7,
  foamCourse: 8,
  airstrip: 12,
  dragonRoost: 8,
  glowflies: 7,
  oddone: 7,
  lineup: 7,
  toys: 7,
  gates: 7,
  dotsigns: 7,
};
const TRAMPOLINE_MAT = 9;
/** Pip is drawn this much bigger than his model (easier to see, more expressive). */
export const PIP_SCALE = 1.22;


type ChestHintFn = () => unknown;

/** `chestHintState()` from the chests module (object form: nearChestId / hasKey / wrongTries). */
function chestHintFn(): ChestHintFn | null {
  return chestHintState;
}

function mapChestHint(v: unknown): ChestHint | undefined {
  if (v === null) return null;
  if (typeof v === 'string') {
    if (/key/i.test(v) && !/has/i.test(v)) return 'findKey';
    if (/shape|lock|side|door|plate/i.test(v)) return 'shape';
    return null;
  }
  if (v && typeof v === 'object') {
    const o = v as { near?: boolean; hasKey?: boolean; open?: boolean };
    if (o.near === false || o.open === true) return null;
    if (typeof o.hasKey === 'boolean') return o.hasKey ? 'shape' : 'findKey'; // ring lock opens from any side
  }
  return undefined;
}

/** Tiny deterministic RNG (test mode must be reproducible). */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BuddyTestApi {
  pos(): [number, number, number];
  pose(): string;
  director(): { step: string; introT: number; playT: number };
  line(): string | null;
  ride(): RideView;
  /** Pip's current drawn scale (smaller on rides). */
  scale(): number;
  /** Every line Pip started saying, in order (text + id). */
  history(): { text: string; id: string }[];
  /** What Pip's voice was asked to say, in order (clip id + text + clip/speech). */
  voice(): VoiceRequest[];
  /** Leading state: where Pip leads (attraction id) and the hop state. */
  lead(): {
    to: string | null; dest: [number, number] | null; state: string | null; rescues: number; guiding: boolean; done: string[];
    /** Why the lead last re-planned or changed target (watchdog), re-plans of this lead, hop-frees, unreachable places. */
    why: string | null; replans: number; frees: number; freedAt: [number, number] | null; unreachable: string[];
    /** The attraction the hero stands at now. */
    at: string | null;
  };
  /** Same as pressing T / tapping Pip: Pip says what to do next (a bubble, deterministically). */
  ask(): void;
  /** Lead destinations as validated at the start of play (QA6 M3). */
  dests(): { name: string; raw: [number, number]; dest: [number, number]; moved: boolean; ok: boolean }[];
  /** Start an invitation lead to an attraction now (as after "Now you choose!"). */
  invite(name: string): boolean;
  /** Pip's planned way for the current lead (corner points), if any. */
  route(): [number, number][] | null;
  /** The way Pip would plan from (x, z) to a place's lead destination (corner points; null = none). */
  plan(x: number, z: number, name: string): [number, number][] | null;
}

declare global {
  interface Window {
    __rgBuddy?: BuddyTestApi;
  }
}

export function createBuddy(ctx: GameContext): GameSystem {
  const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  const forceIntro = params.get('buddyIntro') === '1';
  /** In test mode Pip only talks when a spec asks for it (other specs see a quiet Pip). */
  const talk = !ctx.testMode || forceIntro || params.get('buddy') === '1';
  const introAllowed = !ctx.testMode || forceIntro;

  const store = createBuddyStore(true);
  const model = buildPip();
  ctx.scene.add(model.object);
  const anim = new PipAnimator(model);
  const voice = createVoice({ settings: ctx.settings, events: ctx.events, testMode: ctx.testMode, audio: ctx.audio });
  const ui = createBuddyUi(ctx.uiRoot);
  const queue = new DialogueQueue();
  queue.clipSeconds = (l) => voice.clipSeconds(l.text);
  queue.talking = () => voice.talking();
  const rand = mulberry(ctx.testMode ? 7 : (Date.now() & 0xffff) + 1);
  const hintFn = chestHintFn();
  const raycaster = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, -1, 0) };

  // ───────── motion state ─────────
  const pos = new THREE.Vector3();
  let vel: V2 = { x: 0, z: 0 };
  let yaw = 0;
  let side = 1;
  let t = 0;
  const rayO = new THREE.Vector3();
  const rayD = new THREE.Vector3();
  /**
   * A hop is fine when it ends on land and nothing (a wall, a fence, a shop) is in the way: rays
   * at knee and chest height (a low rail fence stops the hero but not a chest-high ray; QA round 5).
   */
  /**
   * The hero's body swept along a straight walk (QA6 M3: "hero radius, rails included"): a ball of
   * the hero's radius at hip and head height (above the 0.45 m autostep), against fixed scenery
   * only (no terrain, no sensors, nothing that moves). Distance to the first hit, or Infinity.
   */
  const ROT = { x: 0, y: 0, z: 0, w: 1 };
  let heroBall: InstanceType<typeof ctx.physics.rapier.Ball> | null = null;
  const solid = (c: { isSensor(): boolean; shapeType(): number; parent(): { isFixed(): boolean } | null }): boolean => {
    if (c.isSensor() || c.shapeType() === ctx.physics.rapier.ShapeType.HeightField) return false;
    const b = c.parent();
    return !b || b.isFixed();
  };
  const sweep = (from: V2, to: V2): number => {
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    if (d < 1e-3) return Infinity;
    const R = ctx.physics.rapier;
    try {
      heroBall ??= new R.Ball(PLAYER.radius);
      const g0 = ctx.world.heightAt(from.x, from.z);
      const g1 = ctx.world.heightAt(to.x, to.z);
      let best = Infinity;
      for (const up of [0.82, 1.3]) {
        const hit = ctx.physics.world.castShape(
          { x: from.x, y: g0 + up, z: from.z }, ROT, { x: to.x - from.x, y: g1 - g0, z: to.z - from.z }, heroBall,
          0, 1, false, R.QueryFilterFlags.EXCLUDE_SENSORS, RAY_GROUPS, undefined, undefined, solid,
        );
        if (hit) best = Math.min(best, hit.time_of_impact * d);
      }
      return best;
    } catch {
      return Infinity;
    }
  };
  /** The hero's body fits here (no fixed scenery in a hero-sized ball at hip and head height). */
  const roomy = (p: V2): boolean => {
    const R = ctx.physics.rapier;
    try {
      heroBall ??= new R.Ball(PLAYER.radius);
      const g = ctx.world.heightAt(p.x, p.z);
      for (const up of [0.82, 1.3]) {
        if (ctx.physics.world.intersectionWithShape({ x: p.x, y: g + up, z: p.z }, ROT, heroBall, R.QueryFilterFlags.EXCLUDE_SENSORS, RAY_GROUPS, undefined, undefined, solid)) return false;
      }
      return true;
    } catch {
      return true;
    }
  };
  const walkable = (from: V2, to: V2, endSlack = 2.5): boolean => {
    if (!ctx.world.isLand(to.x, to.z)) return false;
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    if (d < 1) return true;
    if (sweep(from, to) <= d - endSlack) return false;
    const ux = (to.x - from.x) / d;
    const uz = (to.z - from.z) / d;
    const g0 = ctx.world.heightAt(from.x, from.z);
    const g1 = ctx.world.heightAt(to.x, to.z);
    for (const up of [0.45, 1]) {
      const y0 = g0 + up;
      const y1 = g1 + up;
      // Start right at `from` (the hero may stand against the fence; rays skip the player).
      rayO.set(from.x + ux * 0.15, y0 + ((y1 - y0) * 0.15) / d, from.z + uz * 0.15);
      rayD.set(to.x - rayO.x, y1 - rayO.y, to.z - rayO.z);
      const len = rayD.length();
      rayD.divideScalar(len || 1);
      try {
        const hit = ctx.physics.raycast(rayO, rayD, len);
        if (hit && hit.distance <= len - endSlack) return false;
      } catch {
        return true;
      }
    }
    return true;
  };
  // Planning round fences: strictly nothing in between, and not up or down a steep step.
  const clearRun = (from: V2, to: V2): boolean =>
    Math.abs(ctx.world.heightAt(to.x, to.z) - ctx.world.heightAt(from.x, from.z)) < 1.2 && walkable(from, to, 0.05);
  const leader = new Leader(walkable, clearRun);

  /**
   * Lead destinations, validated once at the start of play (QA6 M3) with the same planner Pip
   * leads with: the spot must fit the hero and be reachable from outside (a planned walk from a
   * ring 14 m out). A blocked anchor moves to the nearest reachable spot within the place's visit
   * radius. Every lead goes to `dests` (both-eye places only).
   */
  interface DestCheck { raw: V2; dest: V2; moved: boolean; ok: boolean; route?: number }
  const dests = new Map<Attraction, DestCheck>();
  const probe: TerrainProbe = { heightAt: (x, z) => ctx.world.heightAt(x, z), isLand: (x, z) => ctx.world.isLand(x, z), waterLevel: ctx.world.waterLevel };
  /** Where every lead destination must be walkable from (QA7 m14): the plaza, at spawn. */
  const plaza = (): V2 => {
    const s = ctx.world.anchors.spawn;
    return s ? { x: s.position.x, z: s.position.z } : { x: 0, z: 0 };
  };
  /**
   * A cliff in the straight way to a lead's destination (QA7 m14: the dragon roost's plateau): the
   * corners of the terrain route there (the destination itself, an anchor, is not included).
   */
  const viaFor = (target: V2 | null): V2[] | null => {
    if (!target) return null;
    const h = hero();
    return terrainClear(h, target, probe) ? null : (terrainRoute(h, target, probe)?.slice(0, -1) ?? null);
  };
  /** Terrain route corners from the plaza (null = no walkable way: a cliff top, an island). */
  const fromPlaza = (c: V2): V2[] | null => terrainRoute(plaza(), c, probe);
  const reachable = (c: V2): boolean => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const o = { x: c.x + Math.sin(a) * 14, z: c.z + Math.cos(a) * 14 };
      if (!ctx.world.isLand(o.x, o.z) || ctx.world.heightAt(o.x, o.z) < ctx.world.waterLevel + 0.2 || !roomy(o)) continue;
      if (planPath(o, c, clearRun, 2.5, 220)) return true;
    }
    return false;
  };
  const validateDest = (a: Attraction, raw: V2): DestCheck => {
    if (!ctx.world.isLand(raw.x, raw.z)) return { raw, dest: raw, moved: false, ok: true }; // decks (bungee): as built
    const rMax = Math.max(0, Math.min(6, VISIT_RADIUS[a] - 2));
    const yaw0 = anchorOf(a)?.yaw ?? 0;
    // Nearest first, but the front (the anchor's yaw: where its sign and entrance face) is
    // preferred: 2 m of extra distance per 30° round from it.
    const scored: { p: V2; s: number }[] = [{ p: raw, s: 0 }];
    for (const r of [1.5, 3, 4.5, 6]) {
      if (r > rMax) break;
      for (let k = -5; k <= 6; k++) {
        const ang = yaw0 + (k / 12) * Math.PI * 2;
        scored.push({ p: { x: raw.x + Math.sin(ang) * r, z: raw.z + Math.cos(ang) * r }, s: r + Math.abs(k) * 2 });
      }
    }
    const cands = scored.sort((a2, b2) => a2.s - b2.s).map((c) => c.p);
    // A clear spot that can be got to locally AND walked to from the plaza over the terrain (a
    // spot on top of a cliff next to the place is not: QA7 m14).
    let local: V2 | null = null;
    // (A place on a deck or bridge above the ground: the terrain cannot tell; as before.)
    const an = anchorOf(a);
    const deck = !!an && an.position.y - ctx.world.heightAt(raw.x, raw.z) > 2;
    for (const c of cands) {
      if (!ctx.world.isLand(c.x, c.z) || !roomy(c) || !reachable(c)) continue;
      local ??= c;
      if (deck) return { raw, dest: c, moved: c !== raw, ok: true };
      const r = fromPlaza(c);
      if (!r) continue;
      return { raw, dest: c, moved: c !== raw, ok: true, route: r.length };
    }
    return { raw, dest: local ?? raw, moved: !!local && local !== raw, ok: false };
  };
  /**
   * Seconds until the check runs (−1 = done): half a second into play, once the attraction sites
   * built for the session are in the physics world (a query before the first step misses them).
   */
  let validateIn = -1;
  const validateDests = (): void => {
    validateIn = -1;
    if (!dests.size) {
      for (const a of availableAttractions()) {
        if (a === 'trampoline') continue; // the mat edge facing the hero (computed per lead)
        const raw = rawAnchor(a);
        if (raw) dests.set(a, validateDest(a, raw));
      }
    }
    // No walkable way from the plaza: Pip never leads there (every session).
    for (const [a, c] of dests) if (!c.ok) director.unreachable.add(a);
  };

  /**
   * Nearest free spot to stand (QA round 5, M1: stuck on the Scoops counter): on land above the
   * water, on the bare ground (nothing on top of it), not steep, and no collider within 2 m
   * (a physics shape query). Rings outwards from the hero; on each ring the side towards `toward`
   * first. Null when nothing is free within 14 m.
   */
  const freeSpot = (toward: V2, goals: readonly V2[] = []): { x: number; y: number; z: number } | null => {
    const h = ctx.player.position;
    const R = ctx.physics.rapier;
    let shape: InstanceType<typeof R.Cylinder> | null = null;
    try {
      shape = new R.Cylinder(0.9, 2);
    } catch {
      shape = null;
    }
    const rot = { x: 0, y: 0, z: 0, w: 1 };
    const crowded = (x: number, y: number, z: number): boolean => {
      if (!shape) return false;
      try {
        const hit = ctx.physics.world.intersectionWithShape({ x, y: y + 1.1, z }, rot, shape, undefined, undefined, undefined, undefined, (c) => {
          if (c.isSensor() || c.shapeType() === R.ShapeType.HeightField) return false;
          const b = c.parent();
          return !b || b.isFixed();
        });
        return !!hit;
      } catch {
        return false;
      }
    };
    const base = Math.atan2(toward.x - h.x, toward.z - h.z);
    const N = 16;
    const free = (x: number, z: number): number | null => {
      if (!ctx.world.isLand(x, z)) return null;
      const gy = ctx.world.heightAt(x, z);
      if (gy < ctx.world.waterLevel + 0.2) return null;
      if (Math.abs(ctx.world.heightAt(x + 0.8, z) - ctx.world.heightAt(x - 0.8, z)) > 0.7) return null;
      if (Math.abs(ctx.world.heightAt(x, z + 0.8) - ctx.world.heightAt(x, z - 0.8)) > 0.7) return null;
      let top = gy;
      try {
        raycaster.origin.set(x, gy + 8, z);
        const hit = ctx.physics.raycast(raycaster.origin, raycaster.dir, 12);
        if (hit) top = hit.point.y;
      } catch {
        /* physics not ready */
      }
      if (Math.abs(top - gy) > 0.35) return null; // something stands there (a counter, a roof)
      if (crowded(x, gy, z)) return null;
      return gy;
    };
    // Pass per goal (the destination first): a free spot with a clear straight walk to it. Last
    // pass: any free spot (the nearest, towards the way out first).
    for (const goal of [...goals, null]) {
      if (goal && Math.hypot(goal.x - h.x, goal.z - h.z) > 60) continue;
      for (const r of [2.5, 3.5, 5, 6.5, 8, 10, 12, 14]) {
        for (let i = 0; i < N; i++) {
          // 0, +1, -1, +2, -2 … steps round from the way out.
          const k = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
          const a = base + (k * Math.PI * 2) / N;
          const x = h.x + Math.sin(a) * r;
          const z = h.z + Math.cos(a) * r;
          const gy = free(x, z);
          if (gy === null) continue;
          if (goal && !clearRun({ x, z }, goal)) continue;
          return { x, y: gy, z };
        }
      }
    }
    return null;
  };
  let leadOut: LeadOut | null = null;
  /** Where the last hop-free put the hero (tests). */
  let freedAt: V2 | null = null;
  /** Seconds left of the stuck-at-a-fence camera help. */
  let assistT = 0;
  let assistOn = false;
  let gogglesT = 0;
  let offscreenT = 0;
  let zoomT = 0;
  let danceT = 0;
  let lickT = 0;
  let lickPending = false;
  let sniffUntil = -1;
  let sniffCool = 0;
  let barkPulse = 0;
  let pant = 0;
  let cowerT = 0;
  let cheerT = 0;
  let popT = 1;
  let placeSoon = true;
  let attached = false;
  /** In a sky ride's back seat (`player.object.userData.pipSeat`). */
  let seated = false;
  /** Pip's size on the current ride (1 on foot): small on the buggy, horse and sky rides. */
  let rideScale = 1;
  let extKind: ExternalKind = 'other';
  let prevMode = ctx.player.mode;
  let prevHeroVy = 0;
  let onTramp = false;
  let wasSpeaking = false;
  let pipOnScreen = true;
  let carryingKey = false;
  let focusTopic: HowToTopic | null = null;
  let stampedGlasses = false;
  const openedChests = new Set<number>();
  let canopy: THREE.Object3D | null = null;
  let padDown = false;
  let ride: RideView = 'none';
  const inp: AnimInput = defaultInput();
  const lookV = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const headLocal = new THREE.Vector3(0, 0.62, 0.12);

  // ───────── helpers ─────────
  const hero = (): V2 => ({ x: ctx.player.position.x, z: ctx.player.position.z });
  const heroSpeed = (): number => Math.hypot(ctx.player.velocity.x, ctx.player.velocity.z);

  const groundAt = (x: number, z: number, from: number): number => {
    let y = ctx.world.heightAt(x, z);
    try {
      raycaster.origin.set(x, from, z);
      const hit = ctx.physics.raycast(raycaster.origin, raycaster.dir, 12);
      if (hit) y = Math.max(y, hit.point.y);
    } catch {
      /* physics not ready */
    }
    return Math.max(y, ctx.world.waterLevel - 0.22);
  };

  const keyNames = (): KeyNames => {
    const d = ctx.input.state.device;
    const pick = (id: 'use' | 'jump' | 'skill'): string => {
      if (d === 'touch') return '';
      const c = d === 'gamepad' ? CONTROL_MAP[id].pad[0][0] : CONTROL_MAP[id].keys[0][0];
      return c === '␣' ? 'Space' : c;
    };
    return { use: pick('use') || 'the hand', jump: pick('jump') || 'jump', skill: pick('skill') };
  };

  /** World anchor by Pip's id (glasses sites are non-enumerable extra anchors, not in AnchorName). */
  const anchorOf = (a: Attraction) => (ctx.world.anchors as unknown as Record<string, Anchor | undefined>)[a];

  const availableAttractions = (): Attraction[] => {
    const list: Attraction[] = [
      'trampoline', 'gearShack', 'balloon', 'launchPads', 'garage', 'bouncePads', 'bungee', 'sillyZone',
      'carnivalRow', 'iceCream', 'bubbleArena', 'dinoRing', 'raceStart', 'foamCourse', 'airstrip', 'dragonRoost',
    ];
    if (ctx.vehicles?.all.some((v) => v.kind === 'horse')) list.push('ranch');
    list.push(...GLASSES_ATTRACTIONS);
    return list.filter((a) => !!anchorOf(a));
  };

  /**
   * A glasses booth may publish where children should stand to start (in front of its start pad):
   * a `lead` point on its site anchor, or a scene object named `glasses:<id>:lead`. Pip's
   * destination then follows the booth wherever its layout puts it (QA7 M3: the dot-signs pad was
   * behind the booth from Pip's fixed point). Looked up at most every 2 s.
   */
  const boothLeads = new Map<Attraction, { at: number; p: V2 | null }>();
  const leadV = new THREE.Vector3();
  const boothLead = (name: Attraction): V2 | null => {
    if (!(GLASSES_ATTRACTIONS as readonly string[]).includes(name)) return null;
    const c = boothLeads.get(name);
    if (c && t - c.at < 2 && t >= c.at) return c.p;
    let p: V2 | null = null;
    const lead = (anchorOf(name) as (Anchor & { lead?: { x: number; z: number } }) | undefined)?.lead;
    if (lead) p = { x: lead.x, z: lead.z };
    else {
      const o = ctx.scene.getObjectByName(`glasses:${name}:lead`);
      if (o) {
        o.getWorldPosition(leadV);
        p = { x: leadV.x, z: leadV.z };
      }
    }
    boothLeads.set(name, { at: t, p });
    return p;
  };

  /** Where a lead to `a` goes before validation (the Gear Shack: in front of its counter). */
  const rawAnchor = (name: Attraction): V2 | null => {
    const a = anchorOf(name);
    if (!a) return null;
    const booth = boothLead(name);
    if (booth) return booth;
    if (name === 'gearShack') {
      const f = forward(a.yaw);
      return { x: a.position.x + f.x * 2.8, z: a.position.z + f.z * 2.8 };
    }
    return { x: a.position.x, z: a.position.z };
  };

  const attractionPos = (a: Attraction): V2 | null => {
    if (a === 'garage') {
      const car = ctx.vehicles?.all.find((v) => v.kind === 'car');
      if (car) return { x: car.position.x, z: car.position.z };
    }
    const an = anchorOf(a);
    return an ? { x: an.position.x, z: an.position.z } : null;
  };

  /** The place the hero is at: of overlapping circles, the one they are deepest in (QA6 M3). */
  const nearAttraction = (): Attraction | null => {
    const h = hero();
    let best: Attraction | null = null;
    let bestK = 1;
    for (const a of availableAttractions()) {
      const p = attractionPos(a);
      if (!p) continue;
      if (a === 'bungee' && Math.abs(ctx.player.position.y - ctx.world.anchors.bungee.position.y) > 5) continue;
      const k = Math.hypot(p.x - h.x, p.z - h.z) / VISIT_RADIUS[a];
      if (k < bestK) {
        bestK = k;
        best = a;
      }
    }
    return best;
  };

  const chestHint = (): ChestHint => {
    const h = hero();
    let near = -1;
    ctx.world.chestSpots.forEach((c, i) => {
      if (!openedChests.has(i) && Math.hypot(c.position.x - h.x, c.position.z - h.z) < 4.5) near = i;
    });
    if (hintFn) {
      try {
        const v = mapChestHint(hintFn());
        if (v !== undefined) return v;
      } catch {
        /* fall back */
      }
    }
    if (near < 0) return null;
    return carryingKey ? 'shape' : 'findKey'; // symbol ring: opens from any side
  };

  // ───────── director sink ─────────
  const sink: DirectorSink = {
    say(l) {
      if (!talk) return;
      queue.say(l);
    },
    lead(target, opts) {
      leader.set(target, opts?.radius ?? 6, opts?.fetch ?? false, viaFor(target));
      if (!target) leadOut = null;
      assistT = target && opts?.assist ? 6 : 0;
    },
    hop(toward) {
      const p = ctx.player;
      if (p.mode !== 'walk') return;
      // The path side of the fence (QA6 M3): a free spot from where a straight walk reaches the
      // lead's destination, else the far end of a clear leg of Pip's planned way, else the nearest.
      const dest = leader.dest ?? toward;
      const goals: V2[] = [dest, ...(leader.route ?? []).slice().reverse()];
      const spot = freeSpot(dest, goals);
      if (spot) {
        // Two rescues did not free the hero: pop them onto the nearest free ground, facing Pip,
        // with a little hop (a comic boing). Pip pops in beside them.
        const yawToPip = Math.atan2(pos.x - spot.x, pos.z - spot.z);
        p.teleport(new THREE.Vector3(spot.x, spot.y + 0.4, spot.z), yawToPip);
        p.launch(new THREE.Vector3(0, 4.5, 0));
        freedAt = { x: spot.x, z: spot.z };
        placeNearHero();
      } else {
        const dx = toward.x - p.position.x;
        const dz = toward.z - p.position.z;
        const d = Math.hypot(dx, dz) || 1;
        // Nothing free nearby: about 5 m towards the way out, 1.8 m high, over a low fence.
        p.launch(new THREE.Vector3((dx / d) * 6, 9, (dz / d) * 6));
      }
      voice.bark('yip');
      cheerT = Math.max(cheerT, 1);
    },
    glasses(seconds) {
      gogglesT = Math.max(gogglesT, seconds);
      cheerT = Math.max(cheerT, 1.2);
      voice.bark('sniff');
    },
    celebrate(big) {
      zoomT = Math.max(zoomT, big ? 2.4 : 1.3);
      pant = 1;
    },
    bark(kind) {
      voice.bark(kind);
      barkPulse = 1;
    },
    goal() {
      return currentGoal({
        missions: ctx.economy?.missions ?? [],
        visited: director.visited,
        attractions: availableAttractions(),
        chestsOpened: ctx.session.state.chests,
        earned: ctx.session.state.earned ?? 0,
      });
    },
    anchor(name) {
      const a = anchorOf(name);
      if (!a) return null;
      const v = dests.get(name);
      // A booth that published its start spot after the check (or moved it): that spot, as published.
      const booth = boothLead(name);
      if (booth && (!v || Math.hypot(v.raw.x - booth.x, v.raw.z - booth.z) > 0.25)) return booth;
      if (v) return { ...v.dest };
      if (name === 'trampoline') {
        const h = hero();
        const d = Math.hypot(h.x - a.position.x, h.z - a.position.z) || 1;
        const r = TRAMPOLINE_MAT - 1.5; // on the mat's edge: inside the visit radius
        return { x: a.position.x + ((h.x - a.position.x) / d) * r, z: a.position.z + ((h.z - a.position.z) / d) * r };
      }
      return rawAnchor(name);
    },
    places() {
      return availableAttractions()
        .map((name) => ({ name, p: attractionPos(name) }))
        .filter((x): x is { name: Attraction; p: V2 } => !!x.p)
        .map((x) => ({ name: x.name, x: x.p.x, z: x.p.z }));
    },
  };
  const director = new Director(sink, store, rand);

  const history: { text: string; id: string }[] = [];
  queue.onChange = (a: ActiveLine | null) => {
    ui.show(a, a ? bubbleMode(a.line, voice.audible(a.line.text)) : 'full');
    if (a) {
      if (ctx.testMode && history.length < 200) history.push({ text: a.line.text, id: a.line.id ?? '' });
      voice.speak(a.line.text, a.line.mood ?? 'happy');
      if (a.line.priority >= PRIORITY.tip) barkPulse = 0.6;
    } else voice.hush();
  };

  // ───────── input ─────────
  const ask = (): void => {
    if (ctx.session.state.phase !== 'playing' || ctx.ui?.menuOpen) return;
    const key = ui.hovered();
    director.ask(key ? (EXPLAIN[key] ?? null) : null);
    voice.bark('yip');
    barkPulse = 1;
  };
  ui.onAsk(ask);
  ui.onTapBubble(() => {
    if (!director.skip()) queue.skip();
  });
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || ctx.session.state.phase !== 'playing') return;
    if (e.code === 'KeyT') {
      ask();
      return;
    }
    if (director.introActive && !GAME_KEYS.has(e.code)) director.skip();
  };
  window.addEventListener('keydown', onKey);

  // ───────── events ─────────
  const offs: (() => void)[] = [];
  const on = ctx.events.on.bind(ctx.events);
  offs.push(
    on('gem:collected', (e) => {
      director.onGem(e);
      voice.bark(e.mega ? 'bark' : 'yip');
      barkPulse = 1;
      if (e.mega) zoomT = Math.max(zoomT, 2.6);
      else if ((e.combo ?? 1) >= 3) zoomT = Math.max(zoomT, 1.4);
      cheerT = Math.max(cheerT, 0.6);
    }),
    on('gem:near', (e) => {
      if (e.distance <= GEMS.nearRadius && sniffCool <= 0 && t > sniffUntil) {
        sniffUntil = t + 3.5;
        sniffCool = 9;
        voice.bark('sniff');
      }
    }),
    on('stunt', (e) => {
      director.onStunt(e);
      if (e.stars >= 2) cheerT = 1.4;
    }),
    on('chest:key', () => {
      carryingKey = true;
      director.onChestKey();
      voice.bark('yip');
      cheerT = 1;
    }),
    on('chest:opened', () => {
      carryingKey = false;
      const h = hero();
      let best = -1;
      let bestD = Infinity;
      ctx.world.chestSpots.forEach((c, i) => {
        const d = Math.hypot(c.position.x - h.x, c.position.z - h.z);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0) openedChests.add(best);
      director.onChestOpened();
      voice.bark('bark');
    }),
    on('player:flop', () => {
      lickPending = true;
      lickT = 0;
      director.onFlop();
      voice.bark('whine');
    }),
    on('player:dizzy', () => director.onDizzy()),
    on('player:skill', () => {
      director.onSkill();
      voice.bark('yip');
    }),
    on('player:emote', () => {
      danceT = 3;
      director.onEmote();
    }),
    on('glasses:result', (e) => {
      if (e.hit) {
        if (!stampedGlasses) {
          // A mini-game's first hit earns its Fun Pass stamp (derived by the pass).
          stampedGlasses = true;
          director.onStamp();
        }
        director.onGlassesHit();
        voice.bark('yip');
      }
    }),
    on('glasses:wait', () => director.onGlassesWait()),
    on('shop:open', () => director.onShopOpen()),
    on('shop:purchased', () => director.onPurchased()),
    on('item:unlocked', (e) => {
      if (e.itemId === GIFT_ITEM) director.onGift();
      if (e.source !== 'starter') director.onUnlocked();
    }),
    on('ticket:paid', (e) => director.onTicketPaid(e.free)),
    on('stamp:earned', () => director.onStamp()),
    on('interact:focus', (e) => {
      const id = e.target?.id ?? '';
      const horse = id.startsWith('vehicle:') && !!ctx.vehicles?.all.some((v) => `vehicle:${v.id}` === id && v.kind === 'horse');
      focusTopic = e.target ? topicOfPrompt(id, horse) : null;
    }),
    on('ticket:denied', (e) => director.onTicketDenied(e.price, e.wallet)),
    on('mission:completed', () => {
      director.onMissionCompleted();
      danceT = 2.4;
    }),
    on('mission:jackpot', () => director.onJackpot()),
    on('wallet:changed', (e) => {
      if (e.delta !== 0) director.onWalletChange();
    }),
    on('session:tick', (e) => director.onTick(e.remaining)),
    on('session:phase', (e) => {
      if (e.phase === 'playing' && e.previous !== 'paused') {
        placeSoon = true;
        carryingKey = false;
        openedChests.clear();
        focusTopic = null;
        stampedGlasses = false;
        queue.clear(PRIORITY.story);
        queue.skip();
        validateIn = 0.5;
        const fresh = introAllowed && !store.flags.intro && ctx.profile.data.lifetimeGems === 0;
        director.begin(fresh);
      }
      if (e.phase === 'title' || e.phase === 'ended') {
        director.end();
        queue.clear(PRIORITY.story);
        queue.skip();
      }
    }),
    on('profile:reset', () => store.reset()),
  );

  // ───────── per-frame motion ─────────
  const pop = (): void => {
    popT = 0;
  };

  const placeNearHero = (): void => {
    const h = hero();
    const s = teleportSpot(h, ctx.player.yaw, side);
    pos.set(s.x, groundAt(s.x, s.z, ctx.player.position.y + 2), s.z);
    vel = { x: 0, z: 0 };
    yaw = ctx.player.yaw;
    pop();
  };

  const updateRide = (dt: number): boolean => {
    const p = ctx.player;
    if (p.mode === 'external' && prevMode !== 'external') extKind = externalKind(ctx, p.position);
    if (!canopy) canopy = ctx.scene.getObjectByName('canopy') ?? null;
    // Sky rides (plane, dragon): Pip sits in the back seat they publish on the player, facing
    // forward; his bubble docks at the screen edge (pipScreen) until the ride lands.
    const seat = p.mode === 'external' ? (p.object.userData.pipSeat as THREE.Object3D | undefined) : undefined;
    seated = !!seat;
    if (seat) {
      seat.updateWorldMatrix(true, false);
      pos.setFromMatrixPosition(seat.matrixWorld);
      pos.y -= SEAT_DROP; // low in the back seat: only his head pokes out
      rideScale = RIDE_SCALE.seat;
      const e = seat.matrixWorld.elements;
      yaw = Math.atan2(e[8]!, e[10]!);
      inp.pose = 'sit';
      inp.wind = 0.6;
      inp.speed = 0;
      inp.hop = 0;
      inp.goggles = true;
      inp.look = null;
      vel = { x: 0, z: 0 };
      attached = true;
      ride = 'vehicle';
      void dt;
      return true;
    }
    ride = classifyRide(ctx, extKind, canopy);
    rideScale = 1;
    let pose: Pose | null = null;
    switch (ride) {
      case 'vehicle': {
        if (!p.vehicle) break;
        yaw = vehicleSpot(p.vehicle, pos);
        rideScale = p.vehicle.kind === 'car' ? RIDE_SCALE.car : RIDE_SCALE.horse;
        pose = 'ride';
        inp.wind = Math.min(1, Math.abs(p.vehicle.speed) / 10);
        inp.look = null;
        break;
      }
      case 'basket': {
        const r = right(p.yaw);
        pos.set(p.position.x + r.x * 0.5, p.position.y + 0.55, p.position.z + r.z * 0.5);
        yaw = p.yaw;
        pose = 'sit';
        inp.wind = 0.3;
        break;
      }
      case 'freefall': {
        const r = right(p.yaw);
        pos.set(p.position.x + r.x * 1.5, p.position.y + 0.35 + Math.sin(t * 2.2) * 0.12, p.position.z + r.z * 1.5);
        yaw = p.yaw;
        pose = 'belly';
        inp.wind = 1;
        break;
      }
      case 'canopy': {
        const f = forward(p.yaw);
        pos.set(p.position.x - f.x * 0.36, p.position.y + 0.92, p.position.z - f.z * 0.36);
        yaw = p.yaw;
        pose = 'cling';
        inp.wind = 0.5;
        break;
      }
      default:
        break;
    }
    if (pose) {
      attached = true;
      inp.pose = pose;
      inp.speed = 0;
      inp.goggles = ride === 'freefall' || ride === 'canopy';
      inp.hop = 0;
      vel = { x: 0, z: 0 };
      void dt;
      return true;
    }
    inp.goggles = false;
    inp.wind = 0;
    if (attached) {
      attached = false;
      placeNearHero();
    }
    return false;
  };

  const updateFoot = (dt: number): void => {
    const p = ctx.player;
    const h = hero();
    const hs = heroSpeed();
    const heroGround = ctx.world.heightAt(h.x, h.z);
    const heroHigh = p.mode === 'walk' && p.position.y - heroGround > 6;
    const inExternal = p.mode === 'external';

    // Trampoline: bounce at the edge and bark the count at each apex.
    const ta = ctx.world.anchors.trampoline;
    const dTramp = ta ? Math.hypot(h.x - ta.position.x, h.z - ta.position.z) : Infinity;
    const nowTramp = dTramp < TRAMPOLINE_MAT + 0.5 && p.mode === 'walk';
    const vy = p.velocity.y;
    if (nowTramp && prevHeroVy > 0.5 && vy <= 0.5 && p.position.y - heroGround > 2.2) director.onTrampolineApex();
    if (!nowTramp && onTramp) director.resetBounces();
    onTramp = nowTramp;
    prevHeroVy = vy;

    // Heights: cower while the hero is way up, cheer when they come down.
    if (heroHigh && !onTramp) cowerT += dt;
    else if (cowerT > 0) {
      if (cowerT > 1.2) {
        cheerT = 1.6;
        if (talk) director.onLanded();
      }
      cowerT = 0;
    }

    let target: V2;
    let maxSpeed: number;
    let pose: Pose = 'stand';
    let clear: number = FOLLOW.personal;
    const dHero = Math.hypot(pos.x - h.x, pos.z - h.z);
    leadOut = leader.active && p.mode === 'walk' ? leader.update(dt, { x: pos.x, z: pos.z }, h) : null;
    if (leadOut?.state === 'arrived') leadOut = null;
    if (leader.gaveUp) {
      // Watchdog: this place cannot be reached; the director picks the next-nearest one.
      director.leadFailed(leader.why ?? 'unreachable');
      leadOut = null;
    }
    // Talking but off screen (not leading): come back into view so the bubble sits on Pip.
    if (queue.current && !pipOnScreen && !leadOut) offscreenT += dt;
    else offscreenT = 0;
    const lead = leadOut;
    const sniffing = t < sniffUntil && !lead && !onTramp && p.mode === 'walk' && hs < 2.5 && dHero < 5;
    inp.look = lookV.set(p.position.x, p.position.y + 1.35, p.position.z);
    if (lickPending || lickT > 0) {
      // Run over after a flop, lick, then wag.
      const dir = dHero > 0.01 ? { x: (pos.x - h.x) / dHero, z: (pos.z - h.z) / dHero } : { x: 1, z: 0 };
      target = { x: h.x + dir.x * 0.6, z: h.z + dir.z * 0.6 };
      maxSpeed = 11;
      clear = 0.5;
      if (lickPending && dHero < 0.9) {
        lickPending = false;
        lickT = 1.6;
        voice.bark('lick');
      }
      if (lickT > 0) {
        lickT -= dt;
        pose = 'lick';
        if (lickT <= 0) cheerT = 1;
      }
      inp.look = lookV.set(p.position.x, p.position.y + 0.4, p.position.z);
    } else if (inExternal) {
      // Rockets, bungee, silly rides: wait on the ground and watch.
      target = { x: pos.x, z: pos.z };
      maxSpeed = 0;
      pose = p.position.y - groundAt(pos.x, pos.z, pos.y + 1) > 8 ? 'cower' : 'sit';
    } else if (onTramp && ta && !leadOut) {
      // (Never while leading on: the hero on the trampoline rim follows Pip, so Pip must go. B1.)
      const d = Math.hypot(pos.x - ta.position.x, pos.z - ta.position.z) || 1;
      const r = TRAMPOLINE_MAT + 0.9;
      target = { x: ta.position.x + ((pos.x - ta.position.x) / d) * r, z: ta.position.z + ((pos.z - ta.position.z) / d) * r };
      maxSpeed = catchUpSpeed(Math.hypot(target.x - pos.x, target.z - pos.z), 0);
    } else if (offscreenT > 0.3) {
      target = followSlot(h, p.yaw, hs, side);
      maxSpeed = 12;
    } else if (zoomT > 0) {
      const a = t * 3.4;
      target = { x: h.x + Math.sin(a) * 2.4, z: h.z + Math.cos(a) * 2.4 };
      maxSpeed = 10;
    } else if (leadOut) {
      // Leading: run a hop ahead, stop and look back (bark) until the hero is close, fetch them
      // if they do not come. Fetching is a sprint.
      target = leadOut.target;
      const far = Math.hypot(target.x - pos.x, target.z - pos.z);
      maxSpeed = leadOut.state === 'fetch' ? 12 : Math.max(7.5, catchUpSpeed(far, hs));
      clear = 0.6;
      if (leadOut.startedWaiting) {
        voice.bark('bark');
        barkPulse = 1;
        cheerT = Math.max(cheerT, 0.5);
      }
    } else if (sniffing) {
      target = sniffSpot(h, t, 1.3);
      maxSpeed = 2.4;
      pose = 'sniff';
      inp.look = null;
    } else {
      // Pick the side of the hero that the camera sees best (flip rarely).
      const camRight = right(ctx.cameraRig?.yaw ?? p.yaw);
      const hr = right(p.yaw);
      const dot = hr.x * camRight.x + hr.z * camRight.z;
      if (Math.abs(dot) > 0.5) side = dot > 0 ? 1 : -1;
      target = followSlot(h, p.yaw, hs, side);
      maxSpeed = catchUpSpeed(Math.hypot(target.x - pos.x, target.z - pos.z), hs);
    }
    if (cowerT > 0.3 && !lickT && !inExternal) pose = 'cower';
    if (danceT > 0 && pose === 'stand' && dHero < 4) {
      pose = 'dance';
      target = { x: pos.x, z: pos.z };
    }

    vel = arrive(pos, vel, target, dt, maxSpeed);
    let nx = pos.x + vel.x * dt;
    let nz = pos.z + vel.z * dt;
    const c = keepClear({ x: nx, z: nz }, h, clear);
    nx = c.x;
    nz = c.z;
    pos.x = nx;
    pos.z = nz;
    const gy = groundAt(pos.x, pos.z, Math.max(pos.y, p.position.y) + 1.6);
    pos.y += (gy - pos.y) * Math.min(1, dt * 18);
    if (Math.abs(gy - pos.y) > 1.5) pos.y = gy;

    const speed = Math.hypot(vel.x, vel.z);
    let wantYaw = yaw;
    if (speed > 0.35) wantYaw = Math.atan2(vel.x, vel.z);
    else if (pose !== 'dance') {
      // Standing still: face the hero, or the camera while talking (he talks to the player).
      const cam = ctx.camera.position;
      wantYaw = queue.current && !lead ? yawTo(pos, { x: cam.x, z: cam.z }) : yawTo(pos, h); // leading: looks back at the hero
    }
    if (pose === 'dance') wantYaw = yaw + dt * 5;
    const prevYaw = yaw;
    yaw = pose === 'dance' ? wantYaw : turnTowards(yaw, wantYaw, 9, dt);
    inp.turn = (yaw - prevYaw) / Math.max(dt, 1e-4);

    // Sit when the hero stands still next to him (or while waiting at a lead spot).
    if (pose === 'stand' && speed < 0.3 && hs < 0.3 && !lead && !onTramp && director.stillT > 1.2) pose = 'sit';
    inp.pose = pose;
    inp.speed = pose === 'sniff' ? Math.max(speed, 0.6) : speed;
    if (speed > 6) pant = Math.min(1, pant + dt * 0.5);

    // Hops: trampoline-edge bounces, cheers.
    let hop = 0;
    if (onTramp) hop = Math.abs(Math.sin(t * 5.2)) * 0.22;
    if (cheerT > 0) hop = Math.max(hop, Math.abs(Math.sin(t * 9)) * 0.16);
    if (danceT > 0) hop = Math.max(hop, Math.abs(Math.sin(t * 7)) * 0.08);
    inp.hop = hop;

    // Left far behind: pop back next to the hero.
    const limit = lead ? 60 : FOLLOW.teleportDist;
    if (!inExternal && shouldTeleport(pos, h, limit)) placeNearHero();
  };

  /**
   * Stuck at a fence while pushing forward: ease the camera (movement is camera-relative) towards
   * Pip's way so the same push walks the hero after him. Looking around cancels it at once.
   */
  const updateAssist = (dt: number): void => {
    const p = ctx.player;
    const looking = Math.abs(ctx.input.state.lookX) + Math.abs(ctx.input.state.lookY) > 1e-3;
    const want = assistT > 0 && p.mode === 'walk' && !looking && leader.active && !!ctx.cameraRig;
    assistT = Math.max(0, assistT - dt);
    if (looking) assistT = 0;
    if (want) {
      const to = leadOut?.state === 'fetch' || !leadOut ? leader.dest : leadOut.target;
      if (to) {
        const h = hero();
        if (Math.hypot(to.x - h.x, to.z - h.z) > 1) {
          ctx.cameraRig.setOverride({ yawOffset: angleDelta(p.yaw, yawTo(h, to)) });
          assistOn = true;
          return;
        }
      }
    }
    if (assistOn) {
      assistOn = false;
      ctx.cameraRig?.setOverride(null);
    }
  };

  const project = (world: THREE.Vector3): { x: number; y: number; z: number } => {
    tmp.copy(world).project(ctx.camera);
    const w = ctx.uiRoot.clientWidth || window.innerWidth;
    const hh = ctx.uiRoot.clientHeight || window.innerHeight;
    return { x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * hh, z: tmp.z };
  };

  const heroRect = (): Rect | null => {
    const p = ctx.player.position;
    const a = project(tmp.set(p.x, p.y, p.z));
    const b = project(lookV.set(p.x, p.y + 1.8, p.z));
    if (a.z > 1 || b.z > 1) return null;
    const hgt = Math.max(10, a.y - b.y);
    const w = hgt * 0.62;
    return { x: (a.x + b.x) / 2 - w / 2, y: b.y - hgt * 0.08, w, h: hgt * 1.08 };
  };

  /**
   * Pip's head on screen. Off screen: the point on the screen edge in his direction (`on` false),
   * so the bubble docks at that edge with its tail pointing towards him.
   */
  const pipScreen = (): { x: number; y: number; on: boolean } | null => {
    if (!model.object.visible) return null;
    const head = model.object.localToWorld(lookV.copy(headLocal));
    const s = project(head);
    const w = ctx.uiRoot.clientWidth || window.innerWidth;
    const hh = ctx.uiRoot.clientHeight || window.innerHeight;
    if (!seated && s.z <= 1 && s.x >= 0 && s.x <= w && s.y >= 0 && s.y <= hh) return { x: s.x, y: s.y, on: true };
    // Direction from the screen centre (behind the camera, the projection is mirrored).
    let dx = s.x - w / 2;
    let dy = s.y - hh / 2;
    if (s.z > 1) {
      dx = -dx;
      dy = Math.abs(dy) + hh;
    }
    const k = Math.min(Math.abs((w / 2 - 4) / (dx || 1e-6)), Math.abs((hh / 2 - 4) / (dy || 1e-6)));
    return { x: w / 2 + dx * k, y: hh / 2 + dy * k, on: false };
  };

  const faceFor = (): Face => {
    const cur = queue.current;
    if (cowerT > 0.3) return 'worried';
    if (lickPending) return 'worried';
    if (cur?.line.mood) return cur.line.mood;
    if (t < sniffUntil) return 'curious';
    if (zoomT > 0 || cheerT > 0 || danceT > 0) return 'excited';
    return 'happy';
  };

  const pollPad = (): void => {
    let down = false;
    try {
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of pads) {
        if (gp?.buttons[13]?.pressed) down = true;
        if (gp && (gp.buttons.some((b) => b.pressed) || gp.axes.some((a) => Math.abs(a) > 0.5))) inputSeen = true;
      }
    } catch {
      /* no gamepads */
    }
    if (down && !padDown) ask();
    padDown = down;
  };

  /** What the director sees this frame (no overlay: the caller adds it). */
  const directorView = (): DirectorView => {
    const st = ctx.input.state;
    const veh = ride === 'vehicle' ? ctx.player.vehicle : null;
    const racing = (getRaceView(ctx)?.phase ?? 'idle') !== 'idle';
    return {
      pushing: Math.hypot(st.moveX, st.moveY) > 0.3,
      look: Math.abs(st.lookX) + Math.abs(st.lookY),
      hero: hero(),
      // In a vehicle: its speed (parked or driving, QA7 M2).
      heroSpeed: veh ? Math.abs(veh.speed) : heroSpeed(),
      onFoot: ctx.player.mode === 'walk',
      ride,
      vehicle: veh ? (veh.kind === 'horse' ? 'horse' : 'car') : null,
      nearAttraction: nearAttraction(),
      topic: focusTopic,
      chestHint: chestHint(),
      keys: keyNames(),
      remaining: ctx.session.state.remaining,
      hasMissions: (ctx.economy?.missions.length ?? 0) > 0,
      busy: queue.busy,
      // A race drives the buggy for the child: a game too (no drive cues, no suggestions).
      inGame: ctx.player.mode === 'external' || racing,
      // Only the balloon skydive has a parachute (a trampoline bounce or bungee fall does not).
      chute: ctx.player.mode === 'external' && extKind === 'balloon',
    };
  };

  /**
   * QA8 m12: a non-pause menu open over play: the buggy workshop (play runs under it) or the
   * wardrobe / shop (play paused under it, the dressing room on top). Not the pause menu, not the
   * grown-up gate or settings (then the dressing room is not the top screen).
   */
  const overlayOpen = (): 'workshop' | 'wardrobe' | null => {
    const root = ctx.uiRoot;
    if (ctx.player.mode === 'external' && root.querySelector('[data-testid="workshop"].on')) return 'workshop';
    if (ctx.session.state.phase === 'paused' && root.querySelector('[data-screen="wardrobe"].on')) return 'wardrobe';
    return null;
  };

  /** Any key, click, wheel, touch or pad input since the last frame. */
  let inputSeen = false;
  const onAnyInput = (): void => {
    inputSeen = true;
  };
  for (const ev of ['keydown', 'pointerdown', 'wheel'] as const) window.addEventListener(ev, onAnyInput, { capture: true, passive: true });
  const takeInput = (): boolean => {
    const st = ctx.input.state;
    const seen = inputSeen || Math.hypot(st.moveX, st.moveY) > 0.3 || st.usePressed || st.jumpPressed;
    inputSeen = false;
    return seen;
  };

  if (ctx.testMode) {
    window.__rgBuddy = {
      pos: () => [pos.x, pos.y, pos.z],
      pose: () => inp.pose,
      director: () => ({ step: director.step, introT: director.introT, playT: director.playT }),
      line: () => queue.current?.line.text ?? null,
      ride: () => ride,
      scale: () => model.object.scale.x,
      history: () => history.slice(),
      ask: () => ask(),
      dests: () => [...dests].map(([name, c]) => ({ name, raw: [c.raw.x, c.raw.z], dest: [c.dest.x, c.dest.z], moved: c.moved, ok: c.ok })),
      invite: (name) => director.testInvite(name as Attraction),
      route: () => leader.route?.map((p) => [p.x, p.z] as [number, number]) ?? null,
      plan: (x, z, name) => {
        const d = sink.anchor(name as Attraction);
        return d ? (planPath({ x, z }, d, clearRun)?.map((p) => [p.x, p.z] as [number, number]) ?? null) : null;
      },
      voice: () => voice.requests.slice(),
      lead: () => ({
        to: director.leadTo,
        dest: leader.dest ? [leader.dest.x, leader.dest.z] : null,
        state: leadOut?.state ?? null,
        rescues: director.rescues,
        guiding: director.isGuiding,
        done: [...director.done],
        why: director.why ?? leader.why,
        replans: leader.replans,
        frees: director.frees,
        freedAt: freedAt ? [freedAt.x, freedAt.z] : null,
        unreachable: [...director.unreachable],
        at: nearAttraction(),
      }),
    };
  }

  return {
    update(rawDt: number): void {
      const phase = ctx.session.state.phase;
      const dt = Math.min(0.1, Math.max(0, rawDt));
      if (dt <= 0) return;
      if (phase === 'paused') {
        // The wardrobe / shop pauses play under it (QA8 m12): Pip may remind how to close it. Never
        // over the pause menu or the grown-up settings (those are not an overlay here).
        const ov = overlayOpen();
        ui.setOverlay(!!ov);
        if (ov) {
          pollPad();
          director.update(dt, { ...directorView(), overlay: ov, input: takeInput() });
          queue.update(dt);
          ui.setDevice(ctx.input.state.device);
          ui.update(dt, queue.revealFraction(), null, null);
        }
        return;
      }
      t += dt;
      const playing = phase === 'playing';
      if (placeSoon && ctx.player) {
        placeSoon = false;
        placeNearHero();
      }
      zoomT = Math.max(0, zoomT - dt);
      danceT = Math.max(0, danceT - dt);
      cheerT = Math.max(0, cheerT - dt);
      sniffCool = Math.max(0, sniffCool - dt);
      pant = Math.max(0, pant - dt * 0.12);
      popT = Math.min(1, popT + dt * 4);

      if (!updateRide(dt)) updateFoot(dt);
      prevMode = ctx.player.mode;
      gogglesT = Math.max(0, gogglesT - dt);
      if (gogglesT > 0) inp.goggles = true;
      if (playing) updateAssist(dt);
      if (playing && validateIn >= 0 && (validateIn -= dt) < 0) validateDests();

      if (playing) {
        pollPad();
        const ov = overlayOpen();
        ui.setOverlay(!!ov);
        director.update(dt, { ...directorView(), overlay: ov, input: takeInput() });
        queue.update(dt);
      }

      // Talking: little head bobs while the typewriter runs.
      const speaking = !!queue.current && queue.revealFraction() < 1;
      if (speaking && !wasSpeaking) barkPulse = Math.max(barkPulse, 0.5);
      wasSpeaking = speaking;
      inp.bark = Math.max(barkPulse, speaking ? 0.35 + 0.35 * Math.sin(t * 26) : 0);
      barkPulse = Math.max(0, barkPulse - dt * 5);
      inp.face = faceFor();
      inp.pant = Math.max(pant, inp.pose === 'sit' ? 0.35 : 0);
      inp.wag = inp.face === 'worried' ? 0.1 : zoomT > 0 || cheerT > 0 || speaking ? 1 : inp.pose === 'sniff' ? 0.8 : 0.55;
      inp.tilt = inp.pose === 'sit' && director.stillT > 4 ? Math.sin(Math.floor(t / 2.5) * 2.1) * 0.38 : inp.face === 'curious' ? 0.25 : 0;

      model.object.position.copy(pos);
      model.object.rotation.set(0, yaw, 0);
      const s = popT < 1 ? 0.4 + 0.6 * (1 - Math.pow(1 - popT, 3)) + Math.sin(popT * Math.PI) * 0.15 : 1;
      model.object.scale.setScalar(s * PIP_SCALE * rideScale);
      model.object.updateMatrixWorld(true);
      anim.update(dt, inp);

      if (playing) {
        ui.setDevice(ctx.input.state.device);
        // Every frame: a line that starts now is placed over where Pip is.
        const ps = pipScreen();
        pipOnScreen = !queue.current || !!ps?.on;
        ui.update(dt, queue.revealFraction(), ps, heroRect());
      }
    },
    dispose(): void {
      for (const off of offs) off();
      window.removeEventListener('keydown', onKey);
      for (const ev of ['keydown', 'pointerdown', 'wheel'] as const) window.removeEventListener(ev, onAnyInput, { capture: true });
      ctx.scene.remove(model.object);
      model.dispose();
      voice.dispose();
      ui.dispose();
      if (ctx.testMode) delete window.__rgBuddy;
    },
  };
}
