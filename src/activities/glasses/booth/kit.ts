/**
 * The booth kit's wiring: one booth (./booth.ts), the round machine (./round.ts), the transient
 * fx (./fx.ts), the start pad (Use through `ctx.interactions`; walk-in pads also start by
 * stepping on), the device pictogram (`ctx.input.state.device`), sounds, rewards and results.
 * The framework builds it when a mini-game calls `env.booth(setup)`; the mini-game forwards its
 * `update` / `setActive` / `reset` / `dispose` and calls `report(hit, at)` once per try.
 */
import * as THREE from 'three';
import type { GameContext, GlassesTier, Interactable } from '../../../types';
import { deviceFor } from './cells';
import type { PromptId } from './cells';
import { createBoothController } from './booth';
import type { BoothController } from './booth';
import { BoothFx } from './fx';
import { RoundMachine } from './round';
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
  /** Report the current try (ignored outside `play`). `at` = frame-local point for the ✓ / ✗ pop. */
  report(hit: boolean, at?: V3): void;
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
  /** Test hooks: start a round now; jump into try 0 (no countdown); pin animation clocks. */
  start(): void;
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
  const round = new RoundMachine(setup.rules);
  const spec = setup.spec;
  const padR = spec.pad.r ?? 0.95;
  const pad = booth.build.padCenter;
  const idlePrompt: PromptId | null = spec.pad.walkIn ? 'stepPad' : null;
  let fxIn = false;
  let wasOnPad = true;
  let active = false;
  let devicePicked = '';
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
    booth.setPrompt(idlePrompt);
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
          booth.setPrompt(spec.playPrompt, spec.playPromptAt ? new THREE.Vector3(spec.playPromptAt.x, spec.playPromptAt.y, spec.playPromptAt.z) : undefined);
          break;
        case 'result':
          // (handled in report(): it knows where the pop goes)
          break;
        case 'wait': {
          booth.setPad('wait');
          const w = setup.waitPromptAt?.();
          booth.setPrompt('backToPad', w ? new THREE.Vector3(w.x, w.y, w.z) : undefined);
          break;
        }
        case 'end':
          setup.hooks.onIdle();
          booth.setPrompt(null);
          booth.setPad('busy');
          if (e.gems > 0) {
            booth.setLampMode('chase');
            ctx.audio.play('fanfare');
            const top = marqueeTop();
            fx.confettiAt(top, 100, 6.5);
            fx.burst(top, 3.2);
          } else {
            ctx.audio.play('boing', { volume: 0.5, pitch: 0.6 });
          }
          break;
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

  const offRespawn = ctx.events.on('player:respawn', () => {
    if (round.busy) handle(round.cancel('respawn'));
  });

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
    report(hit, at) {
      const ev = round.report(hit);
      const r = ev.find((x): x is Extract<RoundEvent, { type: 'result' }> => x.type === 'result');
      if (!r) return;
      d.result(r.tier, hit);
      booth.setLamp(r.index, hit ? 'hit' : 'miss');
      booth.setPrompt(null);
      const p = at ? toWorld(at) : toWorld({ x: pad.x, y: pad.y + 2.2, z: pad.z });
      fx.pop(hit, p);
      if (hit) {
        ctx.audio.play('gem', { pitch: 1 + 0.14 * Math.min(5, r.streak - 1) });
        fx.confettiAt(p, 36, 4);
      } else {
        ctx.audio.play('boing', { volume: 0.55, pitch: 0.78 });
      }
      setup.hooks.onResult?.(r.index, hit);
    },
    onPad,
    tier: () => round.tier,
    phase: () => round.phase,
    toWorld,
    toLocal,
    update(dt) {
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
      head.copy(ctx.player.position).add(tmp.set(0, 1.5, 0));
      if (fxIn) {
        fx.update(dt, ctx.camera);
        if (round.phase === 'idle' && !fx.busy) fxOn(false);
      }
      ctx.camera.getWorldPosition(tmp);
      booth.update(dt, tmp);
    },
    setActive(on) {
      active = on;
      if (!on) {
        if (round.busy) handle(round.cancel('far'));
        fxOn(false);
      } else {
        wasOnPad = onPad();
      }
    },
    reset() {
      round.reset();
      fxOn(false);
      setup.hooks.onIdle();
      attract();
      wasOnPad = true;
    },
    dispose() {
      offUse();
      offRespawn();
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
      fxIn,
      fx: fx.live(),
      booth: booth.debug(),
    }),
  };
  return kit;
}
