/**
 * Line-up (kind `lineUp`): "magic ring bubbles", on the booth kit (../booth/README.md).
 *
 * A game booth stands beside the glowing walk-in start pad. Step on the pad (or press Use on it)
 * → 3-2-1-GO → a soap bubble only the STRONG eye sees floats 8–13 m ahead (two at tier 3). A
 * magic ring only the WEAK eye sees sits at a fixed offset from the screen centre and moves with
 * the camera: steer it over the bubble and tap Use (the booth's prompt shows the device's button).
 * Bubble inside the ring → it pops, ✓, a bright lamp; not inside → the oldest bubble floats away,
 * ✗, a dim lamp; a bubble left alone for 12 s floats away too (✗). 5 bubbles a round; 3 pops or
 * more win the prize. After every tap and every time-out the ring jumps to a new offset (5°–14°
 * from the centre, any direction but down), so without the weak eye the only option is a blind
 * guess (≤ 8 % a tap, tests/activities/glasses-lineup.test.ts).
 *
 * Red-green rule: bubbles never react to the ring before a tap; the ring never reacts to anything
 * the strong eye can see; the ✓ / ✗ pops above the pad, never at a bubble. Draw calls: booth 1 +
 * bubbles 1 + ring 1, and during a round the kit's fx 2 = 5.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../types';
import type { GlassesTier, Interactable } from '../../../types';
import { withChallenge } from '../../../vision/toolkit';
import { deviceFor, deviceUv } from '../booth/cells';
import type { DeviceId } from '../booth/cells';
import { setSlotUv } from '../booth/geometry';
import type { Mechanic, MechanicEnv } from '../types';
import { aimForReticle, angleBetween, reticleDirection, tolerance } from './aim';
import type { V3 } from './aim';
import { LINEUP, LINEUP_RULES, lineupBooth } from './constants';
import { LINEUP_DEMO } from './demo';
import { LineupGame } from './game';
import { chooseBoothSide } from './layout';
import { createBubbles, createHoop } from './visuals';

const DEG = Math.PI / 180;

export function create(env: MechanicEnv): Mechanic {
  const { ctx } = env;
  const site = env.site;
  const B = LINEUP.bubble;

  // ── the booth (beside the pad, on the side with clear ground) ──
  const side = chooseBoothSide(ctx, site);
  const spec = lineupBooth(side);
  /** Facing from the pad towards the bubbles (local −Z), player-yaw convention. */
  const padYaw = site.yaw + Math.PI;

  // ── layers ──
  const bubbles = createBubbles(B.slots);
  env.add(bubbles.mesh, VisionLayer.StrongOnly);
  const hoop = createHoop();
  env.add(hoop.mesh, VisionLayer.WeakOnly);

  // ── state ──
  let spots: THREE.Vector3[] | null = null;
  const slot = Array.from({ length: B.slots }, () => ({ spot: -1, base: new THREE.Vector3(), pos: new THREE.Vector3(), phase: 0, radius: 0.5 }));
  let onPad = false;
  let active = false;
  let time = 0;
  let burst = 0;
  // Test hooks.
  let aimMode: 'none' | 'reticle' | 'centre' = 'none';
  let aimTarget = -1;
  let forcedPad: boolean | null = null;
  /** The device whose button the play prompt shows ('' = the kit's own picture is up). */
  let promptDevice: DeviceId | '' = '';
  let lastResult: { tier: GlassesTier; hit: boolean } | null = null;
  const ringPos = new THREE.Vector3();
  let ringRadius = 0.5;
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  const game = new LineupGame(env.rng, {
    result: (_tier, hit) => {
      lastResult = { tier: kit.tier(), hit };
      kit.report(hit, popAt);
    },
    spawned: (i) => placeBubble(i),
    popped: () => {
      burst = 1;
      ctx.audio.play('boing', { pitch: 1.8, volume: 0.7 });
    },
    missed: (_i, why) => {
      if (why === 'press') ctx.audio.play('whoosh', { volume: 0.3, pitch: 1.6 });
    },
  });

  const kit = env.booth({
    spec,
    demo: LINEUP_DEMO,
    rules: LINEUP_RULES,
    hooks: {
      onTry(_i, tier) {
        game.open(tier);
        promptDevice = '';
      },
      onIdle() {
        game.close();
        promptDevice = '';
      },
    },
  });

  const padC = kit.booth.build.padCenter;
  const padPos = kit.toWorld({ x: padC.x, y: padC.y, z: padC.z });
  const eye = new THREE.Vector3(padPos.x, padPos.y + 1.6, padPos.z);
  /** The ✓ / ✗ pops above the hero's head on the pad (frame-local). */
  const popAt = { x: padC.x, y: padC.y + LINEUP.popY, z: padC.z };

  // ── spots: open sky / far background behind every bubble, not towards the booth ──
  const raycaster = new THREE.Raycaster();
  function sceneBlocked(from: THREE.Vector3, dir: THREE.Vector3, far: number): boolean {
    raycaster.set(from, dir);
    raycaster.near = 0;
    raycaster.far = far;
    raycaster.camera = ctx.camera;
    for (const h of raycaster.intersectObjects(ctx.scene.children, true)) {
      let skip = false;
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) {
        if (!o.visible || o === ctx.player.object || /^(sky|water)/i.test(o.name)) {
          skip = true;
          break;
        }
      }
      if (!skip) return true;
    }
    return false;
  }

  function findSpots(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    const S = LINEUP.spots;
    const dir = new THREE.Vector3();
    for (const d of S.distances) {
      for (const a of S.angles) {
        // Positive angles are to the child's left: keep the booth's side to small angles.
        if (-side * a > S.boothSideMax) continue;
        for (const h of S.heights) {
          const yaw = padYaw + a * DEG;
          const p = new THREE.Vector3(padPos.x + Math.sin(yaw) * d, padPos.y + h, padPos.z + Math.cos(yaw) * d);
          if (env.groundAt(p.x, p.z) > p.y - S.clearance) continue;
          dir.subVectors(p, eye);
          const len = dir.length();
          dir.normalize();
          if (ctx.physics.raycast(eye, dir, len + S.behind)) continue;
          let under = false;
          for (let t = 0.3; t <= 1 + S.behind / len; t += 0.1) {
            const q = tmp.copy(eye).addScaledVector(dir, len * t);
            if (env.groundAt(q.x, q.z) > q.y - 0.6) under = true;
          }
          if (under) continue;
          if (sceneBlocked(eye, dir, len + S.behind)) continue;
          out.push(p);
        }
      }
    }
    if (out.length < B.slots + 1) {
      for (const a of [-10, 0, 10, 5]) {
        const yaw = padYaw + a * DEG;
        out.push(new THREE.Vector3(padPos.x + Math.sin(yaw) * 9, padPos.y + 5.5, padPos.z + Math.cos(yaw) * 9));
      }
    }
    return out;
  }

  const dirFromEye = (p: THREE.Vector3): V3 => ({ x: p.x - eye.x, y: p.y - eye.y, z: p.z - eye.z });

  function placeBubble(i: number): void {
    if (!spots) spots = findSpots();
    const all = spots;
    const s = slot[i];
    const others = game.bubbles.map((b, j) => (j !== i && (b.state === 'wait' || b.state === 'in' || b.state === 'live') ? slot[j].base : null)).filter((v): v is THREE.Vector3 => !!v);
    const free = all
      .map((_, k) => k)
      .filter((k) => k !== s.spot && others.every((o) => angleBetween(dirFromEye(o), dirFromEye(all[k])) >= LINEUP.spots.spacingDeg * DEG));
    const pool = free.length > 0 ? free : all.map((_, k) => k);
    s.spot = pool[Math.min(pool.length - 1, Math.floor(env.rng() * pool.length))];
    s.base.copy(all[s.spot]);
    s.pos.copy(s.base);
    s.phase = env.rng() * Math.PI * 2;
    // Sized to sit inside the ring (seen from the camera, a few metres behind the pad).
    const dist = s.base.distanceTo(eye) + LINEUP.cameraBack;
    s.radius = dist * Math.tan(tolerance(game.bubbles[i].tier)) * B.ofRing;
  }

  const isOnPad = (): boolean => {
    if (forcedPad !== null) return forcedPad;
    return ctx.player.mode === 'walk' && kit.onPad();
  };

  /** Where the camera looks (or the test aimer's direction). */
  function forward(): V3 {
    ctx.camera.getWorldDirection(fwd);
    if (aimMode === 'none') return fwd;
    const live = game.bubbles.map((b, i) => (b.state === 'live' ? i : -1)).filter((i) => i >= 0);
    const idx = live.includes(aimTarget) ? aimTarget : (live[0] ?? -1);
    if (idx < 0) return fwd;
    const to = tmp.subVectors(slot[idx].pos, ctx.camera.position).normalize();
    return aimMode === 'centre' ? { x: to.x, y: to.y, z: to.z } : aimForReticle(to, game.offset());
  }

  /** The live bubble inside the ring right now, or −1. */
  function inside(): number {
    const r = reticleDirection(forward(), game.offset());
    let best = -1;
    let bestA = Infinity;
    game.bubbles.forEach((b, i) => {
      if (b.state !== 'live') return;
      const a = angleBetween(r, tmp.subVectors(slot[i].pos, ctx.camera.position));
      if (a <= tolerance(b.tier) && a < bestA) {
        best = i;
        bestA = a;
      }
    });
    return best;
  }

  const playing = (): boolean => kit.phase() === 'play' && onPad;

  function press(): void {
    if (!playing()) return;
    if (game.press(inside()) === 'ignored') ctx.audio.play('click', { volume: 0.4 });
  }

  // The tap: Use on the pad while a try is open (the kit's own start prompt is off then).
  const tap: Interactable = {
    id: 'glasses-lineup-pad',
    position: () => tmp.set(padPos.x, padPos.y + 0.9, padPos.z),
    radius: LINEUP.pad.radius + 0.2,
    icon: 'hand',
    enabled: () => active && kit.phase() === 'play' && isOnPad(),
    onUse: press,
  };
  const offTap = ctx.interactions.add(tap);

  /**
   * During a try the booth's prompt shows the button of the device in use (key E, gamepad X, a
   * tapping hand): the kit draws its 'press' picture on every new try, then this swaps the
   * prompt quad's UVs to the device's button cell of the same atlas (no extra draw call).
   */
  function showDeviceButton(): void {
    if (kit.phase() !== 'play') return;
    const dev = deviceFor(ctx.input.state.device);
    if (dev === promptDevice) return;
    const s = kit.booth.build.slots.get('prompt');
    if (!s) return;
    setSlotUv(kit.booth.mesh.geometry.getAttribute('uv') as THREE.BufferAttribute, s, deviceUv(dev));
    promptDevice = dev;
  }

  function layout(): void {
    for (let i = 0; i < slot.length; i++) {
      const s = slot[i];
      const b = game.bubbles[i];
      const bob = Math.sin(time * 1.1 + s.phase) * B.bob;
      const sway = Math.sin(time * 0.37 + s.phase * 1.3) * 0.2;
      s.pos.set(s.base.x + sway * Math.cos(padYaw), s.base.y + bob + (b.state === 'drift' ? b.t * 2.2 : 0), s.base.z - sway * Math.sin(padYaw));
    }
    const cam = ctx.camera.position;
    const r = reticleDirection(forward(), game.offset());
    // The ring sits at the distance of the bubble nearest to it (by angle), sized to its tolerance.
    let dist = 10;
    let tier: GlassesTier = game.tier;
    let bestA = Infinity;
    game.bubbles.forEach((b, i) => {
      if (b.state !== 'live' && b.state !== 'in') return;
      const to = tmp.subVectors(slot[i].pos, cam);
      const a = angleBetween(r, to);
      if (a < bestA) {
        bestA = a;
        dist = to.length();
        tier = b.tier;
      }
    });
    ringPos.set(cam.x + r.x * dist, cam.y + r.y * dist, cam.z + r.z * dist);
    ringRadius = dist * Math.tan(tolerance(tier));
    hoop.place(ringPos, ringRadius);
    hoop.setCharge(1);
    hoop.setBurst(burst > 0 ? 1 - burst : 0);
    const look = withChallenge(tier, env.challenge());
    hoop.setLook(look.level, Math.max(0.75, look.opacity));
    // The ring shows while a round is on and the hero stands on the pad.
    const roundOn = kit.phase() !== 'idle' && kit.phase() !== 'cooldown';
    hoop.setFade(onPad && roundOn ? 1 : 0);
    hoop.commit();

    for (let i = 0; i < slot.length; i++) {
      const b = game.bubbles[i];
      let pop = 0;
      let alpha = 0;
      if (b.state === 'in') alpha = Math.min(1, b.t / B.spawnIn);
      else if (b.state === 'live') alpha = 1;
      else if (b.state === 'pop') pop = Math.min(0.999, Math.max(0.001, b.t / B.popSeconds));
      else if (b.state === 'drift') alpha = Math.max(0, 1 - b.t / B.driftSeconds);
      bubbles.set(i, slot[i].pos, slot[i].radius, pop, alpha);
    }
    bubbles.setFade(onPad ? 1 : 0);
    bubbles.commit();
  }

  function reset(): void {
    game.reset();
    kit.reset();
    onPad = false;
    burst = 0;
    time = 0;
    lastResult = null;
    promptDevice = '';
    layout();
  }

  reset();

  return {
    id: env.id,
    kind: env.kind,
    reset,
    setActive(on) {
      active = on;
      kit.setActive(on);
      if (!on) {
        game.clear();
        onPad = false;
        aimMode = 'none';
        forcedPad = null;
        layout();
      }
    },
    update(dt) {
      time += dt;
      kit.update(dt);
      onPad = isOnPad();
      // Off the pad everything waits (no time-outs, no taps); the animations still run.
      game.step(dt, playing());
      showDeviceButton();
      burst = Math.max(0, burst - dt * 2.2);
      hoop.update(dt);
      layout();
    },
    dispose() {
      offTap();
      kit.dispose();
      for (const o of [bubbles.mesh, hoop.mesh]) env.remove(o);
      bubbles.dispose();
      hoop.dispose();
    },
    debug: () => {
      const o = game.offset();
      const k = kit.debug();
      return {
        active,
        onPad,
        phase: kit.phase(),
        pad: [padPos.x, padPos.y, padPos.z],
        padYaw,
        side,
        tier: kit.tier(),
        roundTier: game.tier,
        wanted: game.wanted(),
        offset: { thetaDeg: o.theta / DEG, phiDeg: o.phi / DEG },
        aim: aimMode,
        spots: spots?.length ?? 0,
        bubbles: game.bubbles.map((b, i) => ({ state: b.state, age: b.age, tier: b.tier, pos: [slot[i].pos.x, slot[i].pos.y, slot[i].pos.z], radius: slot[i].radius })),
        ring: [ringPos.x, ringPos.y, ringPos.z],
        ringRadius,
        inside: inside(),
        presses: game.presses,
        pops: game.pops,
        misses: game.misses,
        gems: kit.round.totalGems,
        lastResult,
        promptDevice,
        kit: k,
        /** The booth's marquee (world, on the ground). */
        booth: (() => {
          const b = kit.booth.build.marqueeBox;
          const w = kit.toWorld({ x: (b.min.x + b.max.x) / 2, y: 0, z: (b.min.z + b.max.z) / 2 });
          return { x: w.x, y: env.groundAt(w.x, w.z), z: w.z };
        })(),
        /** A spot 2.6 m behind the pad (towards the approach), on the ground. */
        padBack: (() => {
          const w = kit.toWorld({ x: padC.x, y: 0, z: padC.z + 2.6 });
          return { x: w.x, y: env.groundAt(w.x, w.z), z: w.z };
        })(),
      };
    },
    force(params) {
      if (params.play) kit.forcePlay(typeof params.tier === 'number' ? (Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier) : undefined);
      if (params.start) kit.start();
      if (typeof params.pin === 'number') kit.pin(params.pin);
      if (Array.isArray(params.offset) && params.offset.length === 2) {
        const [t, p] = params.offset as number[];
        game.setOffset({ theta: t * DEG, phi: p * DEG });
      }
      if (params.aim === 'none' || params.aim === 'reticle' || params.aim === 'centre') aimMode = params.aim;
      if (typeof params.target === 'number') aimTarget = Math.round(params.target);
      if (params.onPad === null) forcedPad = null;
      else if (typeof params.onPad === 'boolean') forcedPad = params.onPad;
      if (params.live === true) {
        // The open try's bubbles live at once (skips the spawn-in).
        onPad = isOnPad();
        game.bubbles.forEach((b, i) => {
          if (b.state === 'wait' || b.state === 'in') {
            b.state = 'live';
            b.t = 0;
            if (slot[i].spot < 0) placeBubble(i);
          }
        });
      }
      if (typeof params.age === 'number') for (const b of game.bubbles) if (b.state === 'live') b.age = params.age;
      showDeviceButton();
      layout();
    },
    drawObjects: () => env.tracked(),
  };
}
