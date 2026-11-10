/**
 * Foam Lava course (Carnival Island): a timed backyard obstacle run over foam "lava" against a
 * friend. E at the booth → 3-2-1-GO → run (an ExternalController drives the hero through the
 * course sim) → finish → medal, stars, gems → replay or leave. Falling in = a foamy flop, a
 * bubble beard for 10 s and a respawn at the last checkpoint. R always leaves safely.
 *
 * Glasses twist: the secret shortcut tiles and the safe stepping stones are WeakOnly (vision
 * layer) with real colliders; nothing in the main scene, HUD or sound points at them.
 *
 * Site: `ctx.world.anchors.foamCourse` when the world defines it (position = middle of the
 * start/finish line, yaw = the direction the course runs); otherwise the flat backyard strip west
 * of the village houses (see docs/streams/foam-lava.md).
 */
import * as THREE from 'three';
import { cameraRelative } from '../../core/motion-math';
import { VisionLayer } from '../../types';
import type { Anchor, ExternalController, GameContext, GameSystem, InputState, PlayerAnim, SfxName } from '../../types';
import { ThrillConfetti } from '../thrillConfetti';
import { Autopilot, MAIN_PLAN, SHORTCUT_PLAN } from './autopilot';
import { buildCourse } from './build';
import { createFriend } from './friend';
import { BOOTH, CHUTE, COURSE_CENTRE, FOAM_Y, SOLIDS, START } from './layout';
import { solidBottom, CourseSim } from './sim';
import type { SimEvent, SimInput } from './sim';
import { MEDALS, TICKET, ghostAt, ghostTime, ghostTimeline, medalFor, prizeFor, starsFor } from './scoring';
import type { Medal } from './scoring';
import { createFoamUi } from './ui';

/**
 * Default site when the world has no `foamCourse` anchor: course origin (world x, z), the
 * direction the course runs, and `mirror` (course +x maps to world −x side) so the start camera
 * stays clear of the village trees behind the entrance.
 */
export const DEFAULT_SITE = { x: -25.5, z: -18.5, yaw: Math.PI, mirror: true } as const;

const COUNTDOWN = 3;
/** Seconds the result card stays before leaving on its own. */
const RESULT_TIMEOUT = 14;
/** Course work only happens while the hero is this close to the course centre (m). */
const NEAR = 70;
const FIXED = 1 / 60;

type Phase = 'idle' | 'countdown' | 'run' | 'result';

/** Minimal view of the economy profile (Stream C); absent until that branch is merged. */
interface ProfileLike {
  readonly wallet: number;
  earn(amount: number, reason: string): void;
  spend(amount: number, reason: string): boolean;
}

export interface FoamLavaTestApi {
  phase(): Phase;
  sim: CourseSim;
  /** Start a run as if E was pressed at the booth. */
  start(): void;
  /** Drive the hero with the bot ('main' / 'shortcut'), or null for the real input. */
  autopilot(plan: 'main' | 'shortcut' | null): void;
  /** Course frame → world. */
  toWorld(x: number, y: number, z: number): [number, number, number];
  /** Where the E prompt is (world). */
  booth(): [number, number, number];
  lastResult(): { time: number; medal: Medal; prize: number; beatFriend: boolean } | null;
  friendReady(): boolean;
  /** Show/hide only this course's weak-eye objects (channel test control). */
  setWeakVisible(on: boolean): void;
}

declare global {
  interface Window {
    __rgFoam?: FoamLavaTestApi;
  }
}

export function createFoamLava(ctx: GameContext): GameSystem {
  // ───────────── Site ─────────────
  const anchor = (ctx.world.anchors as Partial<Record<string, Anchor>>).foamCourse;
  const yaw = anchor ? anchor.yaw : DEFAULT_SITE.yaw;
  const ox = anchor ? anchor.position.x : DEFAULT_SITE.x;
  const oz = anchor ? anchor.position.z : DEFAULT_SITE.z;
  const oy = anchor ? anchor.position.y : ctx.world.heightAt(ox, oz);
  /** −1 when the course is mirrored sideways (default site), else 1. */
  const m = !anchor && DEFAULT_SITE.mirror ? -1 : 1;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const toWorld = (x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 =>
    out.set(ox + m * x * cosY + z * sinY, oy + y, oz - m * x * sinY + z * cosY);
  const toLocalDir = (wx: number, wz: number): { x: number; z: number } => ({ x: m * (wx * cosY - wz * sinY), z: wx * sinY + wz * cosY });
  const centre = toWorld(COURSE_CENTRE.x, 0, COURSE_CENTRE.z);

  // ───────────── Visuals ─────────────
  const vis = buildCourse(ctx.scene);
  vis.root.position.set(ox, oy, oz);
  vis.root.rotation.y = yaw;
  vis.root.scale.x = m;
  vis.weakRoot.position.copy(vis.root.position);
  vis.weakRoot.rotation.y = yaw;
  vis.weakRoot.scale.x = m;
  // A mirrored course would show the sign's pictures back to front: mirror the sign once more.
  const sign = vis.root.getObjectByName('foam-lava-sign');
  if (sign) sign.scale.x = m;
  vis.root.updateMatrixWorld(true);
  vis.weakRoot.updateMatrixWorld(true);
  ctx.vision.add(vis.weakRoot, VisionLayer.WeakOnly);
  const confetti = new ThrillConfetti();
  let confettiT = 0;

  // ───────────── Colliders (so the course is solid when walking around outside a run) ─────────────
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const colliders = SOLIDS.map((s) => {
    const bottom = Math.max(-0.6, solidBottom(s));
    if (s.kind === 'chute') {
      const len = CHUTE.z1 - CHUTE.z0;
      const ang = Math.atan2(CHUTE.high - CHUTE.low, len);
      const q = yawQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -ang));
      return ctx.physics.addStaticBox(toWorld(s.x, s.top - 0.06, s.z), new THREE.Vector3(s.hx ?? 1, 0.06, Math.hypot(len, CHUTE.high - CHUTE.low) / 2), q);
    }
    const half = (s.top - bottom) / 2;
    const c = toWorld(s.x, bottom + half, s.z);
    if (s.shape === 'box') return ctx.physics.addStaticBox(c, new THREE.Vector3(s.hx ?? 0.5, half, s.hz ?? 0.5), yawQ);
    return ctx.physics.addStaticCylinder(c, half, s.r ?? 0.5);
  });

  // ───────────── State ─────────────
  const sim = new CourseSim();
  sim.groundAt = (x, z) => {
    const w = toWorld(x, 0, z);
    return ctx.world.heightAt(w.x, w.z) - oy;
  };
  vis.update(sim, 0, true); // place every instance once (correct culling bounds from the start)
  const ghostKeys = ghostTimeline();
  // Gold-pace track for the weak-eye sparkle: the bot's clean main-route run, recorded once and
  // played back slowed so it reaches the finish exactly at the gold time.
  let paceTrack: { x: number; y: number; z: number }[] | null = null;
  let paceScale = 1;
  const recordPace = (): void => {
    const bot = new CourseSim();
    bot.reset(START.hero, START.yaw);
    bot.running = true;
    const pilot = new Autopilot(MAIN_PLAN);
    const track: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < 60 * 40 && bot.mode !== 'done'; i++) {
      bot.step(FIXED, pilot.input(bot));
      if (i % 3 === 0) track.push({ x: bot.p.x, y: bot.p.y + 1.1, z: bot.p.z });
    }
    track.push({ x: bot.p.x, y: bot.p.y + 1.1, z: bot.p.z });
    paceTrack = track;
    paceScale = bot.time / MEDALS.gold;
  };
  const paceAt = (t: number): { x: number; y: number; z: number } | null => {
    if (!paceTrack) return null;
    const f = (t * paceScale) / (FIXED * 3);
    if (f >= paceTrack.length - 1) return null;
    const i = Math.floor(f);
    const k = f - i;
    const a = paceTrack[i];
    const b = paceTrack[i + 1];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
  };
  const friendTime = ghostTime(ghostKeys);
  const ui = createFoamUi(ctx.uiRoot);
  const friend = createFriend(vis.root);
  let phase: Phase = 'idle';
  let phaseT = 0;
  let runs = 0;
  let freeUsed = false;
  let practice = false;
  let bot: Autopilot | null = null;
  let botPlan: 'main' | 'shortcut' | null = null;
  let last: { time: number; medal: Medal; prize: number; beatFriend: boolean } | null = null;
  let beardRemove: (() => void) | null = null;
  let beardObj: THREE.Object3D | null = null;
  let beardT = 0;
  let stretch = 0;
  let lastCount: number | 'go' | null = null;
  let pendingExit = false;
  const profile = (): ProfileLike | null => (ctx as unknown as { profile?: ProfileLike }).profile ?? null;

  const sfx = (name: SfxName, volume = 1, pitch = 1): void => ctx.audio.play(name, { volume, pitch });

  // Bubble beard: a puffy cluster of foam balls on the face (both-eye, white with soft shading).
  const beardGeo = new THREE.IcosahedronGeometry(1, 1);
  const beardMat = new THREE.MeshStandardMaterial({ color: 0xfff4f7, roughness: 0.6 });
  function makeBeard(): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'bubble-beard';
    const spots: [number, number, number, number][] = [
      [0, -0.12, 0.06, 0.13], [-0.11, -0.08, 0.04, 0.1], [0.11, -0.08, 0.04, 0.1], [-0.06, -0.22, 0.05, 0.1],
      [0.06, -0.22, 0.05, 0.1], [0, -0.31, 0.03, 0.08], [-0.17, 0.0, 0.0, 0.07], [0.17, 0.0, 0.0, 0.07],
    ];
    for (const [x, y, z, r] of spots) {
      const m = new THREE.Mesh(beardGeo, beardMat);
      m.position.set(x, y, z);
      m.scale.setScalar(r);
      group.add(m);
    }
    return group;
  }
  function setBeard(on: boolean): void {
    if (on && !beardRemove) {
      beardObj = makeBeard();
      beardObj.scale.setScalar(0.01);
      beardRemove = ctx.player.attach('face', beardObj);
    } else if (!on && beardRemove) {
      beardRemove();
      beardRemove = null;
      beardObj = null;
    }
  }

  // ───────────── Booth interaction ─────────────
  const boothPos = toWorld(BOOTH.use.x, 0, BOOTH.use.z);
  boothPos.y = ctx.world.heightAt(boothPos.x, boothPos.z) + 1.2;
  const removeInteract = ctx.interactions.add({
    id: 'foam-lava',
    position: () => boothPos,
    radius: 2.8,
    icon: 'clock',
    enabled: () => phase === 'idle' && ctx.session.state.phase === 'playing' && ctx.player.mode === 'walk',
    onUse: () => begin(),
  });

  function heroWorld(): void {
    toWorld(sim.p.x, sim.p.y, sim.p.z, ctx.player.position);
    ctx.player.yaw = m * sim.yaw + yaw;
  }

  function begin(): void {
    if (phase !== 'idle' && phase !== 'result') return;
    // Ticket: first run each session is free, then 3 gems; with too few gems it is a practice run.
    const prof = profile();
    practice = false;
    if (freeUsed && prof) {
      if (!prof.spend(TICKET, 'ticket')) practice = true;
    }
    freeUsed = true;
    runs++;
    phase = 'countdown';
    phaseT = 0;
    lastCount = null;
    sim.reset(START.hero, START.yaw);
    sim.running = false;
    if (!paceTrack) recordPace();
    vis.setCheckpoint(0, true);
    ui.result(null, ctx.input.state.device);
    ui.price(null);
    ui.showHud(true, friend.color);
    ui.hud(0, 0, 0);
    if (ctx.player.mode !== 'external') ctx.player.setExternalController(controller);
    // Countdown: look at the hero and the friend from the front, then swing behind at GO.
    ctx.cameraRig.setOverride({ distance: 6, height: 2.2, yawOffset: Math.PI * 0.82 });
    heroWorld();
    friend.setVisible(true);
    void friend.prepare(ctx.player.characterId, runs - 1).then(() => {
      ui.showHud(phase !== 'idle', friend.color);
      friend.setVisible(phase !== 'idle');
    });
    sfx('click');
  }

  function leave(teleport: boolean): void {
    const wasActive = phase !== 'idle';
    phase = 'idle';
    sim.running = false;
    ui.showHud(false);
    ui.countdown(null);
    ui.result(null, ctx.input.state.device);
    friend.setVisible(false);
    vis.setCheckpoint(0, false);
    ctx.cameraRig.setOverride(null);
    // Teleport once the ride has let go (inside the controller the player would turn the jump
    // into a huge velocity).
    if (wasActive && teleport) pendingExit = true;
  }

  function exitToBooth(): void {
    const p = toWorld(BOOTH.use.x, 0, BOOTH.use.z - 0.8);
    p.y = ctx.world.heightAt(p.x, p.z) + 0.05;
    ctx.player.teleport(p, yaw + Math.PI);
  }

  function finishRun(time: number): void {
    const medal = medalFor(time);
    const beatFriend = time < friendTime;
    const stars = starsFor(medal);
    const prof = profile();
    const prize = !practice && prof ? prizeFor(medal, beatFriend) : 0;
    if (prize > 0 && prof) prof.earn(prize, 'mission');
    last = { time, medal, prize, beatFriend };
    phase = 'result';
    phaseT = 0;
    ctx.events.emit('stunt', { kind: 'bullseye', value: stars, stars });
    ctx.events.emit('ui:toast', { icon: 'check', text: `${(Math.floor(time * 10) / 10).toFixed(1)}` });
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rg:attraction-done', { detail: { id: 'foamLava', medal, time, stars, beatFriend } }));
    sfx('fanfare');
    vis.celebrate();
    const burstAt = toWorld(sim.p.x, sim.p.y + 2, sim.p.z);
    if (!confetti.group.parent) ctx.scene.add(confetti.group);
    confetti.burst(burstAt, 140);
    confettiT = 4;
    // Face the pit and take the bow: the camera looks back at the hero from over the foam (always
    // open space, whatever stands behind the finish deck).
    sim.yaw = 0;
    ctx.cameraRig.setOverride({ distance: 5.2, height: 1.9, yawOffset: Math.PI });
    ui.result({ time, medal, stars, friendTime, beatFriend, prize, friendColor: friend.color }, ctx.input.state.device);
  }

  function handle(ev: SimEvent): void {
    switch (ev.type) {
      case 'jump':
        sfx('jump', 0.8);
        break;
      case 'land':
        if (ev.speed > 2) {
          const soft = ev.kind === 'float' || ev.kind === 'plank' || ev.kind === 'block';
          sfx(soft ? 'boing' : 'land', Math.min(1, 0.4 + ev.speed / 10), soft ? 1.2 : 1);
          stretch = -Math.min(0.35, ev.speed * 0.04);
          if (ev.kind === 'float') vis.spray(sim.p.x, FOAM_Y + 0.2, sim.p.z, 5);
        }
        break;
      case 'bounce':
        sfx('bigBoing', 0.9, 1.1);
        stretch = 0.45;
        ctx.cameraRig.shake(0.15);
        break;
      case 'slide':
        sfx('whoosh', 0.8, 1.2);
        break;
      case 'slideEnd':
        vis.spray(sim.p.x, sim.p.y + 0.1, sim.p.z, 8);
        break;
      case 'grab':
        sfx('whoosh', 0.7, 0.8);
        break;
      case 'release':
        sfx('jump', 0.8, 0.9);
        break;
      case 'puff': {
        const c = toWorld(-5.5, 1.2, 15);
        const d = ctx.player.position.distanceTo(c);
        if (d < 30) sfx('whoosh', Math.max(0.15, 0.6 - d / 60), 0.7);
        break;
      }
      case 'puffHit':
        sfx('boing', 1, 0.8);
        ctx.cameraRig.shake(0.3);
        stretch = 0.3;
        break;
      case 'splash':
        sfx('splash', 1);
        sfx('flop', 0.7);
        vis.splash(ev.x, ev.z, 1);
        ctx.cameraRig.shake(0.35);
        beardT = 10;
        setBeard(true);
        break;
      case 'respawn':
        sfx('boing', 0.7, 1.5);
        vis.spray(sim.p.x, sim.p.y + 0.3, sim.p.z, 6);
        stretch = 0.4;
        break;
      case 'checkpoint':
        sfx('star', 0.8);
        vis.setCheckpoint(ev.cp, true);
        break;
      case 'finish':
        finishRun(ev.time);
        break;
    }
  }

  function inputToSim(input: Readonly<InputState>): SimInput {
    const w = cameraRelative(input.moveX, input.moveY, ctx.cameraRig.yaw);
    const l = toLocalDir(w.x, w.z);
    return { mx: l.x, mz: l.z, sprint: input.sprint, jumpPressed: input.jumpPressed };
  }

  function heroAnim(): PlayerAnim {
    if (phase === 'result') return 'cheer';
    switch (sim.mode) {
      case 'splash':
        return 'flop';
      case 'swing':
        return 'jump';
      case 'slide':
        return 'fall';
      case 'done':
        return 'cheer';
      default: {
        if (!sim.grounded) return sim.v.y > 0 ? 'jump' : 'fall';
        const hs = Math.hypot(sim.v.x, sim.v.z);
        return hs > 4.5 ? 'run' : hs > 0.6 ? 'walk' : 'idle';
      }
    }
  }

  const controller: ExternalController = {
    update(dt, input) {
      if (phase === 'idle') return false;
      if (ctx.session.state.phase !== 'playing') return true;
      phaseT += dt;
      const click = ui.takeClick();
      // R always leaves safely (gamepad Y too).
      if (input.respawnPressed || (phase === 'result' && (click === 'exit' || input.flopPressed))) {
        leave(true);
        return false;
      }
      if (phase === 'countdown') {
        const left = COUNTDOWN - phaseT;
        const n: number | 'go' = left > 0 ? Math.ceil(left) : 'go';
        if (n !== lastCount) {
          lastCount = n;
          ui.countdown(n);
          sfx(n === 'go' ? 'start' : 'tick', 0.9);
        }
        sim.step(dt, { mx: 0, mz: 0, sprint: false, jumpPressed: false });
        if (left <= 0) {
          phase = 'run';
          phaseT = 0;
          sim.running = true;
          ctx.cameraRig.setOverride({ distance: 6.2, height: 2.8, yawOffset: 0 });
          bot = botPlan ? new Autopilot(botPlan === 'main' ? MAIN_PLAN : SHORTCUT_PLAN) : null;
        }
      } else if (phase === 'run') {
        if (phaseT > 0.8) ui.countdown(null);
        const real = inputToSim(input);
        const n = Math.max(1, Math.ceil(dt / FIXED - 1e-6));
        for (let i = 0; i < n && phase === 'run'; i++) {
          const si = bot ? bot.input(sim) : i === 0 ? real : { ...real, jumpPressed: false };
          const evs = sim.step(dt / n, si);
          for (const ev of evs) {
            handle(ev);
            if (ev.type === 'respawn' && bot) bot.resync(sim);
          }
        }
      } else if (phase === 'result') {
        sim.step(dt, { mx: 0, mz: 0, sprint: false, jumpPressed: false });
        if (phaseT > 0.6 && (input.jumpPressed || input.usePressed || click === 'replay')) {
          begin();
          return true;
        }
        if (click === 'exit' || phaseT > RESULT_TIMEOUT || (phaseT > 1.2 && Math.hypot(input.moveX, input.moveY) > 0.6)) {
          leave(true);
          return false;
        }
      }
      heroWorld();
      // Poses: belly slide, rope swing lean, squash and stretch.
      if (sim.mode === 'slide') ctx.player.setTilt(1.25, 0);
      else if (sim.mode === 'swing') ctx.player.setTilt(0, -m * sim.rope.theta * 0.8);
      else ctx.player.setTilt(0, 0);
      stretch += (0 - stretch) * Math.min(1, dt * 9);
      ctx.player.setVisualStretch(stretch);
      ctx.player.setAnimation(heroAnim());
      return true;
    },
    onRelease() {
      if (phase !== 'idle') leave(false);
    },
  };

  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase !== 'playing' && e.phase !== 'paused' && phase !== 'idle') {
      ctx.player.setExternalController(null);
      leave(false);
    }
    if (e.phase === 'title') freeUsed = false;
  });
  const offStart = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') freeUsed = false;
  });

  if (ctx.testMode && typeof window !== 'undefined') {
    window.__rgFoam = {
      phase: () => phase,
      sim,
      start: () => begin(),
      autopilot: (plan) => {
        botPlan = plan;
        bot = plan && phase === 'run' ? new Autopilot(plan === 'main' ? MAIN_PLAN : SHORTCUT_PLAN) : bot;
        if (!plan) bot = null;
      },
      toWorld: (x, y, z) => toWorld(x, y, z).toArray() as [number, number, number],
      booth: () => boothPos.toArray() as [number, number, number],
      lastResult: () => last,
      friendReady: () => friend.id !== null,
      setWeakVisible: (on) => {
        vis.weakRoot.visible = on;
      },
    };
  }

  let wadeT = 0;
  return {
    update(dt) {
      if (pendingExit && ctx.player.mode !== 'external') {
        pendingExit = false;
        exitToBooth();
      }
      const near = phase !== 'idle' || ctx.player.position.distanceTo(centre) < NEAR;
      // Beard timer (also after the run ends).
      if (beardT > 0) {
        beardT -= dt;
        if (beardObj) {
          const grow = Math.min(1, (10 - beardT) * 4);
          const shrink = Math.min(1, beardT * 2);
          beardObj.scale.setScalar(Math.max(0.01, Math.min(grow, shrink)) * (1 + 0.06 * Math.sin(beardT * 9)));
        }
        if (beardT <= 0) setBeard(false);
      }
      if (confettiT > 0) {
        confettiT -= dt;
        confetti.update(dt);
        if (confettiT <= 0) {
          confetti.clear();
          confetti.group.removeFromParent();
        }
      }
      if (!near) return;
      if (phase === 'idle' && ctx.session.state.phase === 'playing') sim.stepWorld(dt);
      vis.update(sim, dt, near);
      // Friend.
      if (phase === 'countdown') {
        const f = START.friend;
        friend.idle(f.x, 1.0, f.z, 0, phaseT < 1.5 ? 'wave' : 'idle', dt);
      } else if (phase === 'run' || phase === 'result') {
        friend.pose(ghostAt(ghostKeys, sim.time + (phase === 'result' ? phaseT : 0)), dt);
      }
      vis.setPace(phase === 'run' ? paceAt(sim.time) : phase === 'countdown' ? paceAt(0) : null);
      if (phase === 'run') {
        const fp = ghostAt(ghostKeys, sim.time);
        ui.hud(sim.time, sim.progress(), fp.done ? 1 : Math.min(0.99, sim.time / friendTime));
      }
      // Price chip next to the booth prompt.
      if (phase === 'idle' && ctx.session.state.phase === 'playing' && ctx.player.position.distanceTo(boothPos) < 3.2) {
        ui.price(!freeUsed ? 'free' : TICKET);
      } else ui.price(null);
      // Wading through the foam outside a run: little foam kicks.
      if (phase === 'idle' && ctx.player.mode === 'walk') {
        const lp = toLocalDir(ctx.player.position.x - ox, ctx.player.position.z - oz);
        const ly = ctx.player.position.y - oy;
        if (sim.inPit(lp.x, lp.z) && ly < FOAM_Y && Math.hypot(ctx.player.velocity.x, ctx.player.velocity.z) > 1) {
          wadeT -= dt;
          if (wadeT <= 0) {
            wadeT = 0.18;
            vis.spray(lp.x, FOAM_Y, lp.z, 2);
          }
        }
      }
    },
    dispose() {
      if (phase !== 'idle') ctx.player.setExternalController(null);
      leave(false);
      setBeard(false);
      removeInteract();
      offPhase();
      offStart();
      for (const c of colliders) ctx.physics.removeCollider(c);
      ctx.vision.remove(vis.weakRoot);
      vis.dispose();
      friend.dispose();
      ui.dispose();
      confetti.group.removeFromParent();
      confetti.dispose();
      beardGeo.dispose();
      beardMat.dispose();
      if (ctx.testMode && typeof window !== 'undefined') delete window.__rgFoam;
    },
  };
}
