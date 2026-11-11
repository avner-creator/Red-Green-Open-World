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
import { GEMS } from '../config';
import type { Anchor, GameContext, GameSystem } from '../types';
import { CONTROL_MAP } from '../ui/controlMap';
import { createBuddyUi } from '../ui/buddy';
import type { Rect } from '../ui/buddy/place';
import { PipAnimator, defaultInput } from './anim';
import type { AnimInput, Face, Pose } from './anim';
import type { ChestHint, DirectorSink, DirectorView, RideView } from './director';
import { Director } from './director';
import { DialogueQueue, PRIORITY } from './dialogue';
import type { ActiveLine } from './dialogue';
import { currentGoal } from './goals';
import { buildPip } from './model';
import { classifyRide, externalKind, vehicleSpot } from './rides';
import type { ExternalKind } from './rides';
import { EXPLAIN, REACT, line } from './script';
import type { KeyNames } from './script';
import { sniffSpot } from './sniff';
import { Leader } from './guide';
import type { LeadOut } from './guide';
import { FOLLOW, angleDelta, arrive, catchUpSpeed, followSlot, forward, keepClear, right, shouldTeleport, teleportSpot, turnTowards, yawTo } from './steer';
import type { V2 } from './steer';
import { createBuddyStore } from './store';
import { GLASSES_ATTRACTIONS, type Attraction } from './types';
import { createVoice } from './voice';

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
  balloon: 8,
  launchPads: 10,
  gearShack: 4.5,
  bungee: 5,
  sillyZone: 14,
  ranch: 12,
  carnivalRow: 12,
  iceCream: 6,
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
  /** Every line Pip started saying, in order (text + id). */
  history(): { text: string; id: string }[];
  /** Leading state: where Pip leads (attraction id) and the hop state. */
  lead(): { to: string | null; state: string | null; rescues: number; guiding: boolean; done: string[] };
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
  const voice = createVoice({ settings: ctx.settings, events: ctx.events, testMode: ctx.testMode });
  const ui = createBuddyUi(ctx.uiRoot);
  const queue = new DialogueQueue();
  const rand = mulberry(ctx.testMode ? 7 : (Date.now() & 0xffff) + 1);
  const hintFn = chestHintFn();
  const raycaster = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, -1, 0) };

  // ───────── motion state ─────────
  const pos = new THREE.Vector3();
  let vel: V2 = { x: 0, z: 0 };
  let yaw = 0;
  let side = 1;
  let t = 0;
  const leader = new Leader((p) => ctx.world.isLand(p.x, p.z));
  let leadOut: LeadOut | null = null;
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
  let extKind: ExternalKind = 'other';
  let prevMode = ctx.player.mode;
  let prevHeroVy = 0;
  let onTramp = false;
  let wasSpeaking = false;
  let pipOnScreen = true;
  let carryingKey = false;
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

  const attractionPos = (a: Attraction): V2 | null => {
    if (a === 'garage') {
      const car = ctx.vehicles?.all.find((v) => v.kind === 'car');
      if (car) return { x: car.position.x, z: car.position.z };
    }
    const an = anchorOf(a);
    return an ? { x: an.position.x, z: an.position.z } : null;
  };

  const nearAttraction = (): Attraction | null => {
    const h = hero();
    for (const a of availableAttractions()) {
      const p = attractionPos(a);
      if (!p) continue;
      if (a === 'bungee' && Math.abs(ctx.player.position.y - ctx.world.anchors.bungee.position.y) > 5) continue;
      if (Math.hypot(p.x - h.x, p.z - h.z) < VISIT_RADIUS[a]) return a;
    }
    return null;
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
    return carryingKey ? 'findSide' : 'findKey';
  };

  // ───────── director sink ─────────
  const sink: DirectorSink = {
    say(l) {
      if (!talk) return;
      queue.say(l);
    },
    lead(target, opts) {
      leader.set(target, opts?.radius ?? 6, opts?.fetch ?? false);
      if (!target) leadOut = null;
      assistT = target && opts?.assist ? 6 : 0;
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
      if (name === 'gearShack') {
        const f = forward(a.yaw);
        return { x: a.position.x + f.x * 2.8, z: a.position.z + f.z * 2.8 };
      }
      if (name === 'trampoline') {
        const h = hero();
        const d = Math.hypot(h.x - a.position.x, h.z - a.position.z) || 1;
        const r = TRAMPOLINE_MAT + 1.2;
        return { x: a.position.x + ((h.x - a.position.x) / d) * r, z: a.position.z + ((h.z - a.position.z) / d) * r };
      }
      return { x: a.position.x, z: a.position.z };
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
    ui.show(a);
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
        director.onGlassesHit();
        voice.bark('yip');
      }
    }),
    on('shop:open', () => director.onShopOpen()),
    on('shop:purchased', () => director.onPurchased()),
    on('item:unlocked', (e) => {
      if (e.source !== 'starter') director.onUnlocked();
    }),
    on('ticket:paid', () => director.onTicketPaid()),
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
        queue.clear(PRIORITY.story);
        queue.skip();
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
    ride = classifyRide(ctx, extKind, canopy);
    let pose: Pose | null = null;
    switch (ride) {
      case 'vehicle': {
        if (!p.vehicle) break;
        yaw = vehicleSpot(p.vehicle, pos);
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
        if (talk) queue.say(line(REACT.landed, PRIORITY.react));
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
    } else if (onTramp && ta) {
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
    if (s.z <= 1 && s.x >= 0 && s.x <= w && s.y >= 0 && s.y <= hh) return { x: s.x, y: s.y, on: true };
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
      for (const gp of pads) if (gp?.buttons[13]?.pressed) down = true;
    } catch {
      /* no gamepads */
    }
    if (down && !padDown) ask();
    padDown = down;
  };

  if (ctx.testMode) {
    window.__rgBuddy = {
      pos: () => [pos.x, pos.y, pos.z],
      pose: () => inp.pose,
      director: () => ({ step: director.step, introT: director.introT, playT: director.playT }),
      line: () => queue.current?.line.text ?? null,
      ride: () => ride,
      history: () => history.slice(),
      lead: () => ({ to: director.leadTo, state: leadOut?.state ?? null, rescues: director.rescues, guiding: director.isGuiding, done: [...director.done] }),
    };
  }

  return {
    update(rawDt: number): void {
      const phase = ctx.session.state.phase;
      const dt = Math.min(0.1, Math.max(0, rawDt));
      if (phase === 'paused' || dt <= 0) return;
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

      if (playing) {
        pollPad();
        const st = ctx.input.state;
        const view: DirectorView = {
          pushing: Math.hypot(st.moveX, st.moveY) > 0.3,
          look: Math.abs(st.lookX) + Math.abs(st.lookY),
          hero: hero(),
          heroSpeed: heroSpeed(),
          onFoot: ctx.player.mode === 'walk',
          ride,
          nearAttraction: nearAttraction(),
          chestHint: chestHint(),
          keys: keyNames(),
          remaining: ctx.session.state.remaining,
          hasMissions: (ctx.economy?.missions.length ?? 0) > 0,
          busy: queue.busy,
        };
        director.update(dt, view);
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
      model.object.scale.setScalar(s);
      model.object.updateMatrixWorld(true);
      anim.update(dt, inp);

      if (playing) {
        ui.setDevice(ctx.input.state.device);
        const ps = queue.current ? pipScreen() : null;
        pipOnScreen = !queue.current || !!ps?.on;
        ui.update(queue.revealFraction(), ps, heroRect());
      }
    },
    dispose(): void {
      for (const off of offs) off();
      window.removeEventListener('keydown', onKey);
      ctx.scene.remove(model.object);
      model.dispose();
      voice.dispose();
      ui.dispose();
      if (ctx.testMode) delete window.__rgBuddy;
    },
  };
}
