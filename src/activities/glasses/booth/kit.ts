/**
 * The booth kit's wiring: one booth (./booth.ts), the round machine (./round.ts), the transient
 * fx (./fx.ts), the start pad (Use through `ctx.interactions`; walk-in pads also start by
 * stepping on), the device pictogram (`ctx.input.state.device`), sounds, rewards and results.
 * The framework builds it when a mini-game calls `env.booth(setup)`; the mini-game forwards its
 * `update` / `setActive` / `reset` / `dispose` and calls `report(hit, at)` once per try.
 */
import * as THREE from 'three';
import type { GameContext, GlassesTier, Interactable } from '../../../types';
import { FIXED_SITES } from '../sites';
import { deviceFor } from './cells';
import type { BoothPrompt } from './cells';
import { createBoothController } from './booth';
import type { BoothController } from './booth';
import { BoothFx } from './fx';
import { PAD_TOP } from './geometry';
import { RoundMachine } from './round';
import { PadTrail } from './trail';
import type { RoundEvent, RoundPhase } from './round';
import type { BoothSetup, V3 } from './types';
import { VisionLayer } from '../../../types';

/** What the kit needs from the framework (a subset of `MechanicEnv` plus the shared material). */
export interface BoothDeps {
  ctx: GameContext;
  site: { x: number; y: number; z: number; yaw: number };
  add<T extends THREE.Object3D>(object: T, layer: VisionLayer): T;
  remove(object: THREE.Object3D): void;
  pay(gems: number): void;
  result(tier: GlassesTier, hit: boolean): void;
  material: THREE.Material;
  /** The site's demo slot in the booth atlas (= site index). */
  slot: number;
  /** Is the site active (player near)? */
  isActive(): boolean;
}

export interface BoothKit {
  readonly booth: BoothController;
  readonly fx: BoothFx;
  readonly round: RoundMachine;
  /**
   * Report the current try (ignored outside `play`): lights its lamp, pops ✓ / ✗ at `at`
   * (frame-local; default above the pad), sound, `glasses:result`. `tier`: this try's own tier
   * (a per-try staircase); default the round's.
   */
  report(hit: boolean, at?: V3, tier?: GlassesTier): void;
  /**
   * A result that lights no lamp and does not move the round on (e.g. a firefly that got away in
   * a timed round): ✓ / ✗ pop, sound and `glasses:result` only. Works in any phase.
   */
  note(hit: boolean, at?: V3, tier?: GlassesTier): void;
  /** End the tries now (a timed round, or the game decides): celebration / no-prize with the hits so far. */
  finish(): void;
  /** Is the hero standing on the start pad? */
  onPad(): boolean;
  /** The round's tier (fixed during a round). */
  tier(): GlassesTier;
  phase(): RoundPhase;
  /** Frame-local → world point (y relative to the site's y → world y). */
  toWorld(p: V3, out?: THREE.Vector3): THREE.Vector3;
  /** World → frame-local (x, z) and y above the site's y. */
  toLocal(p: THREE.Vector3): V3;
  /** Forward from the mini-game. */
  update(dt: number): void;
  setActive(on: boolean): void;
  reset(): void;
  dispose(): void;
  /** The hero on the pad facing the play's focus (world feet point and yaw): the pad camera. */
  padView(): { x: number; y: number; z: number; yaw: number };
  /** Test hooks: start a round now; jump into try 0 (no countdown); pin animation clocks; cancel. */
  start(): void;
  cancel(): void;
  forcePlay(tier?: GlassesTier): void;
  pin(t: number): void;
  debug(): Record<string, unknown>;
}

export function createBoothKit(d: BoothDeps, setup: BoothSetup): BoothKit {
  const { ctx, site } = d;
  const frame = setup.frame ?? { x: site.x, z: site.z, yaw: site.yaw };
  const cos = Math.cos(frame.yaw);
  const sin = Math.sin(frame.yaw);
  const toWorldXZ = (x: number, z: number): { x: number; z: number } => ({ x: frame.x + x * cos + z * sin, z: frame.z - x * sin + z * cos });
  const ground = setup.ground ?? ((x: number, z: number): number => {
    const w = toWorldXZ(x, z);
    return ctx.world.heightAt(w.x, w.z) - site.y;
  });
  const booth = createBoothController(d.material, {
    spec: setup.spec,
    slot: d.slot,
    frames: setup.demo.frames,
    fps: setup.demo.fps,
    hold: setup.demo.hold,
    ground,
    extra: setup.extra,
  });
  booth.mesh.position.set(frame.x, site.y, frame.z);
  booth.mesh.rotation.y = frame.yaw;
  booth.mesh.updateMatrixWorld(true);
  ctx.scene.add(booth.mesh);

  // ── colliders (poles, counter + board) ──
  const colliders = booth.build.colliders.map((c) => {
    const w = toWorldXZ(c.center.x, c.center.z);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), frame.yaw + c.yaw);
    return ctx.physics.addStaticBox(new THREE.Vector3(w.x, site.y + c.center.y, w.z), c.half.clone(), q);
  });

  const fx = new BoothFx(d.material);
  // "Back to the pad": arrows on the ground from the child to the pad while a round waits.
  const trail = new PadTrail();
  let trailIn = false;
  let nudged = false;
  const round = new RoundMachine(setup.rules);
  const spec = setup.spec;
  const padR = spec.pad.r ?? 0.95;
  const pad = booth.build.padCenter;
  const idlePrompt: BoothPrompt | null = spec.pad.walkIn ? 'stepPad' : null;
  let fxIn = false;
  let wasOnPad = true;
  let active = false;
  let devicePicked = '';
  /** The pad and the decals are put on the real surface on the first update (colliders exist then). */
  let settled = false;
  let padCollider: ReturnType<typeof ctx.physics.addStaticCylinder> | null = null;
  const DOWN = new THREE.Vector3(0, -1, 0);
  const probe = new THREE.Vector3();
  /** Walkable surface under a frame-local point (frame-local y), or null (water, on a prop). */
  function surface(x: number, z: number): number | null {
    const w = toWorldXZ(x, z);
    const g = ctx.world.heightAt(w.x, w.z);
    if (!ctx.world.isLand(w.x, w.z) || g < ctx.world.waterLevel) return null;
    const hit = ctx.physics.raycast(probe.set(w.x, g + 3, w.z), DOWN, 6);
    if (hit && hit.point.y > g + 0.5) return null; // on a prop: leave it
    return Math.max(g, hit ? hit.point.y : g) - site.y;
  }
  function settle(): void {
    if (settled) return;
    settled = true;
    booth.settle(surface);
    // The drum is solid (the hero steps up onto it); added after the probe so it is not hit.
    const w = toWorldXZ(pad.x, pad.z);
    const half = (PAD_TOP + 0.3) / 2;
    padCollider = ctx.physics.addStaticCylinder(new THREE.Vector3(w.x, site.y + pad.y + PAD_TOP - half, w.z), half, padR + 0.14);
  }

  // ── the celebration camera: turned to the booth for the celebration, then released ──
  /** Longest the camera is held (s); look input, vehicles, respawn, pause or leaving release it at once. */
  const CAM_HOLD_MAX = 4.2;
  let camHeld = false;
  let camT = 0;
  const camFocus = new THREE.Vector3();
  function camRelease(): void {
    if (!camHeld) return;
    camHeld = false;
    ctx.cameraRig.setOverride(null);
  }
  function camHold(): void {
    if (ctx.player.mode !== 'walk') return;
    const c = typeof setup.celebrateAt === 'function' ? setup.celebrateAt() : setup.celebrateAt;
    if (c) toWorld(c, camFocus);
    else booth.mesh.localToWorld(camFocus.copy(booth.build.boardFront));
    camHeld = true;
    camT = 0;
  }
  function camStep(dt: number): void {
    if (!camHeld) return;
    camT += dt;
    const look = Math.abs(ctx.input.state.lookX) + Math.abs(ctx.input.state.lookY);
    if (look > 0.004 || ctx.player.mode !== 'walk' || camT > CAM_HOLD_MAX || (round.phase !== 'celebrate' && round.phase !== 'prize')) {
      camRelease();
      return;
    }
    const p = ctx.player.position;
    const yaw = Math.atan2(camFocus.x - p.x, camFocus.z - p.z);
    let off = yaw - ctx.player.yaw;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    // Pulled back, a flatter look: the booth stands tall and beyond the play from where the child ends.
    ctx.cameraRig.setOverride({ yawOffset: off, distance: 7, height: 1.7 });
  }
  /**
   * While a round waits for the child and they stand still, the nudge swings the camera round
   * behind them to look back at the pad from above: the ground arrows from their feet to the pad
   * fill the view (QA6 m3). Any look or move input gives the camera back at once.
   */
  const WAIT_CAM_HOLD = 3;
  let waitCamT = 0;
  let waitCamOn = false;
  const waitFocus = new THREE.Vector3();
  function waitCamStep(dt: number): void {
    const inp = ctx.input.state;
    const busy = Math.abs(inp.lookX) + Math.abs(inp.lookY) > 0.004 || Math.abs(inp.moveX) + Math.abs(inp.moveY) > 0.1;
    if (busy || round.phase !== 'wait' || ctx.player.mode !== 'walk') waitCamT = 0;
    waitCamT = Math.max(0, waitCamT - dt);
    if (waitCamT <= 0 || camHeld) {
      if (waitCamOn) {
        waitCamOn = false;
        ctx.cameraRig.setOverride(null);
      }
      return;
    }
    const p = ctx.player.position;
    const t = toWorld({ x: pad.x, y: pad.y, z: pad.z }, waitFocus);
    let off = Math.atan2(t.x - p.x, t.z - p.z) - ctx.player.yaw;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    waitCamOn = true;
    ctx.cameraRig.setOverride({ yawOffset: off, distance: 6.5, height: 4.4 });
  }
  const offPhase = ctx.events.on('session:phase', () => {
    camRelease();
    waitCamT = 0;
  });
  const head = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const toWorld = (p: V3, out = new THREE.Vector3()): THREE.Vector3 => {
    const w = toWorldXZ(p.x, p.z);
    return out.set(w.x, site.y + p.y, w.z);
  };
  const toLocal = (p: THREE.Vector3): V3 => {
    const dx = p.x - frame.x;
    const dz = p.z - frame.z;
    return { x: dx * cos - dz * sin, y: p.y - site.y, z: dx * sin + dz * cos };
  };

  function onPad(): boolean {
    const l = toLocal(ctx.player.position);
    return Math.hypot(l.x - pad.x, l.z - pad.z) < padR + 0.2 && Math.abs(l.y - pad.y) < 1.0;
  }

  function fxOn(on: boolean): void {
    if (on === fxIn) return;
    fxIn = on;
    if (on) {
      d.add(fx.mesh, VisionLayer.Both);
      d.add(fx.confetti.mesh, VisionLayer.Both);
    } else {
      fx.clear();
      d.remove(fx.mesh);
      d.remove(fx.confetti.mesh);
    }
  }

  function attract(): void {
    booth.setLampMode('attract');
    for (let i = 0; i < booth.lamps; i++) booth.setLamp(i, 'off');
    booth.setPad('attract');
    booth.showDevice(true);
    booth.setPrompt(idlePrompt, undefined, 1.3);
  }

  const marqueeTop = (): THREE.Vector3 => booth.mesh.localToWorld(booth.build.bannerAt.clone());
  const countdownWorld = (): THREE.Vector3 => booth.mesh.localToWorld(booth.build.countdownAt.clone());

  function handle(events: RoundEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'start':
          fxOn(true);
          booth.setLampMode('manual');
          for (let i = 0; i < booth.lamps; i++) booth.setLamp(i, 'off');
          booth.setPad('busy');
          booth.showDevice(false);
          booth.setPrompt(null);
          ctx.audio.play('click');
          break;
        case 'count':
          fx.digit(e.n, countdownWorld(), e.n > 0 ? round.rules.countStep : round.rules.goTime + 0.25);
          if (e.n > 0) ctx.audio.play('tick', { pitch: 1 + (3 - e.n) * 0.12 });
          else ctx.audio.play('start');
          break;
        case 'try':
          setup.hooks.onTry(e.index, e.tier);
          booth.setPad('busy');
          // The play prompt floats in front of the booth's picture board (or where the spec says).
          if (spec.playPromptAt) booth.setPrompt(spec.playPrompt, new THREE.Vector3(spec.playPromptAt.x, spec.playPromptAt.y, spec.playPromptAt.z), spec.playPromptSize ?? 1.25);
          else booth.setPrompt(spec.playPrompt, booth.build.boardFront, 1.45);
          break;
        case 'result':
          // (handled in report(): it knows where the pop goes)
          break;
        case 'wait': {
          booth.setPad('wait');
          trailOn(true);
          nudged = false;
          const w = setup.waitPromptAt?.();
          booth.setPrompt('backToPad', w ? new THREE.Vector3(w.x, w.y, w.z) : undefined);
          break;
        }
        case 'nudge':
          // Call the child back: a chime, a step toast, the trail's arrows grow and the camera
          // turns to show the way.
          nudged = true;
          waitCamT = WAIT_CAM_HOLD;
          ctx.audio.play('star', { volume: 0.7, pitch: 1.2 });
          ctx.events.emit('ui:toast', { icon: 'step' });
          // Pip: "Back to the pad!"
          ctx.events.emit('glasses:wait', { mechanic: FIXED_SITES[d.slot]?.id ?? 'booth' });
          break;
        case 'fetch':
          fetchToPad();
          break;
        case 'end': {
          setup.hooks.onIdle();
          booth.setPrompt(null);
          booth.setPad('busy');
          // Turn the camera to the booth: the lamps, the celebration and the prize happen in view.
          camHold();
          if (e.gems > 0) {
            booth.setLampMode('chase');
            ctx.audio.play('fanfare');
            // Above the lamps (they stay in view) and right in front of the child, where the
            // camera now looks.
            const top = booth.mesh.localToWorld(booth.build.topAt.clone());
            fx.confettiAt(top, 70, 6.5);
            fx.burst(top, 2.2);
            const near = nearChild();
            fx.confettiAt(near, 90, 5);
            fx.burst(near, 1.6);
          } else {
            ctx.audio.play('boing', { volume: 0.5, pitch: 0.6 });
          }
          break;
        }
        case 'prizeFly': {
          booth.setLampMode('chase');
          const from = marqueeTop();
          let k = 0;
          fx.gems(e.gems, from, head, round.rules.prizeTime, () => ctx.audio.play('gem', { pitch: 1 + 0.06 * k++, volume: 0.7 }));
          break;
        }
        case 'pay':
          d.pay(e.gems);
          break;
        case 'cancel':
          setup.hooks.onIdle();
          fx.clear();
          camRelease();
          attract();
          break;
        case 'idle':
          attract();
          wasOnPad = onPad();
          break;
        default:
          break;
      }
    }
  }

  function trailOn(on: boolean): void {
    if (on === trailIn) return;
    trailIn = on;
    if (on) {
      trail.reset();
      d.add(trail.mesh, VisionLayer.Both);
    } else d.remove(trail.mesh);
  }

  const trailPath: { x: number; z: number }[] = [];
  /** World x/z waypoints: the child → (the mini-game's waypoints) → the pad. */
  function waitPathWorld(): { x: number; z: number }[] {
    const me = toLocal(ctx.player.position);
    const via = setup.waitPath?.(me) ?? [];
    trailPath.length = 0;
    for (const p of [me, ...via, { x: pad.x, y: pad.y, z: pad.z }]) trailPath.push(toWorldXZ(p.x, p.z));
    return trailPath;
  }

  /**
   * The child has not come back: a comic boing pops the hero back onto the pad (the next try
   * starts there), never a lost round. Not while riding or mid-flop (then the round ends kindly).
   */
  function fetchToPad(): void {
    if (ctx.player.mode !== 'walk') return;
    const v = kit.padView();
    fx.burst(head.copy(ctx.player.position).add(tmp.set(0, 1, 0)), 1.6);
    ctx.audio.play('boing', { volume: 0.8, pitch: 1.3 });
    ctx.player.teleport(new THREE.Vector3(v.x, v.y + PAD_TOP + 0.05, v.z), v.yaw);
    fx.burst(toWorld({ x: pad.x, y: pad.y + PAD_TOP + 1, z: pad.z }), 1.8);
  }

  const offRespawn = ctx.events.on('player:respawn', () => {
    camRelease();
    if (round.busy) handle(round.cancel('respawn'));
  });

  /** A point 1.8 m from the child towards the celebration, at head height + 0.8 (in view). */
  function nearChild(): THREE.Vector3 {
    const p = ctx.player.position;
    const dx = camFocus.x - p.x;
    const dz = camFocus.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    const k = Math.min(1.8, l * 0.5) / l;
    return new THREE.Vector3(p.x + dx * k, p.y + 2.3, p.z + dz * k);
  }

  function pop(hit: boolean, at: V3 | undefined, streak: number): void {
    const p = at ? toWorld(at) : toWorld({ x: pad.x, y: pad.y + 2.2, z: pad.z });
    fx.pop(hit, p);
    if (hit) {
      ctx.audio.play('gem', { pitch: 1 + 0.14 * Math.min(5, Math.max(0, streak - 1)) });
      fx.confettiAt(p, 36, 4);
    } else {
      ctx.audio.play('boing', { volume: 0.55, pitch: 0.78 });
    }
  }

  const target: Interactable = {
    id: `glasses-booth-${d.slot}`,
    position: () => booth.mesh.localToWorld(new THREE.Vector3(pad.x, pad.y + 0.9, pad.z)),
    radius: padR + 1.1,
    icon: 'flag',
    enabled: () => active && round.phase === 'idle',
    onUse: () => kit.start(),
  };
  const offUse = ctx.interactions.add(target);

  attract();

  const kit: BoothKit = {
    booth,
    fx,
    round,
    report(hit, at, tier) {
      const ev = round.report(hit, tier);
      const r = ev.find((x): x is Extract<RoundEvent, { type: 'result' }> => x.type === 'result');
      if (!r) return;
      d.result(r.tier, hit);
      booth.setLamp(r.index, hit ? 'hit' : 'miss');
      // Untimed: the prompt goes while the result shows; timed: the play goes on.
      if (round.rules.time === undefined) booth.setPrompt(null);
      pop(hit, at, r.streak);
      setup.hooks.onResult?.(r.index, hit);
      handle(ev.filter((x) => x.type !== 'result'));
    },
    note(hit, at, tier) {
      d.result(tier ?? round.tier, hit);
      fxOn(true);
      pop(hit, at, hit ? 1 : 0);
    },
    finish() {
      handle(round.end());
    },
    onPad,
    tier: () => round.tier,
    phase: () => round.phase,
    toWorld,
    toLocal,
    update(dt) {
      settle();
      const dev = deviceFor(ctx.input.state.device);
      if (dev !== devicePicked) {
        devicePicked = dev;
        booth.setDevice(dev);
      }
      const on = onPad();
      if (spec.pad.walkIn && round.phase === 'idle' && on && !wasOnPad) kit.start();
      wasOnPad = on;
      if (round.cancellable || round.phase === 'celebrate' || round.phase === 'prize') {
        const leave = round.rules.leaveRadius;
        if (Math.hypot(ctx.player.position.x - site.x, ctx.player.position.z - site.z) > leave) handle(round.cancel('left'));
      }
      handle(round.step(dt, on));
      if (round.phase !== 'wait') trailOn(false);
      else trail.update(dt, waitPathWorld(), (x, z) => ctx.world.heightAt(x, z), nudged, padR + 0.35);
      head.copy(ctx.player.position).add(tmp.set(0, 1.5, 0));
      if (fxIn) {
        fx.update(dt, ctx.camera);
        if (round.phase === 'idle' && !fx.busy) fxOn(false);
      }
      camStep(dt);
      waitCamStep(dt);
      ctx.camera.getWorldPosition(tmp);
      booth.update(dt, tmp);
    },
    setActive(on) {
      active = on;
      if (!on) {
        camRelease();
        waitCamT = 0;
        waitCamStep(0);
        if (round.busy) handle(round.cancel('far'));
        fxOn(false);
        trailOn(false);
      } else {
        wasOnPad = onPad();
      }
    },
    reset() {
      camRelease();
      round.reset();
      fxOn(false);
      trailOn(false);
      setup.hooks.onIdle();
      attract();
      wasOnPad = true;
    },
    dispose() {
      camRelease();
      waitCamT = 0;
      waitCamStep(0);
      trailOn(false);
      trail.dispose();
      offUse();
      offRespawn();
      offPhase();
      if (padCollider) ctx.physics.removeCollider(padCollider);
      fxOn(false);
      ctx.scene.remove(booth.mesh);
      booth.dispose();
      fx.dispose();
      for (const c of colliders) ctx.physics.removeCollider(c);
    },
    start() {
      if (!active || round.phase !== 'idle') return;
      handle(round.start());
    },
    cancel() {
      handle(round.cancel('test'));
    },
    padView() {
      settle();
      const p = toWorld({ x: pad.x, y: pad.y + 0.02, z: pad.z });
      const look = setup.look ?? { x: 0, z: 0 };
      const l = toWorldXZ(look.x, look.z);
      return { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(l.x - p.x, l.z - p.z) };
    },
    forcePlay(tier) {
      if (round.busy) round.cancel('force');
      fxOn(true);
      booth.setLampMode('manual');
      for (let i = 0; i < booth.lamps; i++) booth.setLamp(i, 'off');
      booth.showDevice(false);
      booth.setPrompt(null);
      handle(round.forcePlay(tier));
    },
    pin(t) {
      booth.pin(t);
    },
    debug: () => ({
      phase: round.phase,
      tier: round.tier,
      index: round.index,
      results: [...round.results],
      hits: round.hits,
      roundGems: round.gems,
      rounds: round.rounds,
      totalGems: round.totalGems,
      onPad: onPad(),
      trail: trailIn ? trail.mesh.count : 0,
      camHeld,
      settled,
      fxIn,
      fx: fx.live(),
      booth: booth.debug(),
      /** The prompt in world space now (centre at rest, edge length), for the HUD / screen checks. */
      promptWorld: (() => {
        const p = booth.prompt();
        const w = booth.mesh.localToWorld(p.at.clone());
        return p.id ? { id: p.id, x: w.x, y: w.y, z: w.z, size: p.size } : null;
      })(),
    }),
  };
  return kit;
}
