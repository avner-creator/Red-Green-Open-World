/**
 * Line-up targets (kind `lineUp`): "magic-glasses bubble popping".
 *
 * Stand on the both-eye aim pad. Bubbles only the STRONG eye sees float 8–13 m ahead; a reticle
 * only the WEAK eye sees follows the camera aim with a slowly orbiting offset (4°–7° from the
 * screen centre, ./aim.ts). Hold the reticle on a bubble for a second (a weak-eye arc fills) and
 * it pops: gems, confetti at the pad. A bubble left alone for 15 s on the pad drifts away (a miss).
 * Neither eye alone can do it: the strong eye has no reticle, the weak eye has no bubbles, and the
 * screen centre never works.
 *
 * Red-green rule: bubbles never react to the reticle before the pop (no hover, no sound), the
 * reticle never reacts to anything the strong eye could see. Draw calls: board 1 + pad 1 +
 * bubbles 1 + reticle 1 + progress arc 1 + confetti 1 (while flying) = 6.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../types';
import type { GlassesTier } from '../../../types';
import { createReticle, createRing, withChallenge } from '../../../vision/toolkit';
import { GlassesConfetti } from '../oddone/confetti';
import type { Mechanic, MechanicEnv } from '../types';
import { aimForReticle, angleBetween, holdStep, nextTier, orbitAt, orbitSpeed, reticleDirection, tolerance, AIM } from './aim';
import type { Offset, TierState, V3 } from './aim';
import { LINEUP } from './constants';
import { createBubbles, createPad } from './visuals';

type BubbleState = 'empty' | 'wait' | 'in' | 'live' | 'pop' | 'drift';

interface Bubble {
  state: BubbleState;
  /** Seconds in the current state. */
  t: number;
  /** Seconds alive on the pad (lifetime). */
  age: number;
  spot: number;
  tier: GlassesTier;
  base: THREE.Vector3;
  pos: THREE.Vector3;
  phase: number;
}

const DEG = Math.PI / 180;

export function create(env: MechanicEnv): Mechanic {
  const { ctx } = env;
  const site = env.site;
  const B = LINEUP.bubble;

  // ── the pad (both eyes) ──
  const padXZ = env.local(LINEUP.pad.x, LINEUP.pad.z);
  let padY = env.groundAt(padXZ.x, padXZ.z);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    padY = Math.max(padY, env.groundAt(padXZ.x + Math.cos(a) * LINEUP.pad.radius, padXZ.z + Math.sin(a) * LINEUP.pad.radius));
  }
  const padPos = new THREE.Vector3(padXZ.x, padY + LINEUP.pad.lift, padXZ.z);
  /** Facing from the pad towards the bubbles (local −Z), player-yaw convention. */
  const padYaw = site.yaw + Math.PI;
  const pad = createPad();
  pad.mesh.position.copy(padPos);
  pad.mesh.rotation.y = site.yaw;
  env.add(pad.mesh, VisionLayer.Both);

  // ── layers ──
  const bubbles = createBubbles(B.count);
  env.add(bubbles.mesh, VisionLayer.StrongOnly);
  const reticle = createReticle({ radius: LINEUP.reticleRadius, thickness: 0.07, tickGap: 0.07, tickLength: 0.2, pulse: 0.25, pulseSpeed: 1.4 });
  env.add(reticle.object, VisionLayer.WeakOnly);
  const arc = createRing({ radius: LINEUP.arcRadius, thickness: 0.1, progress: 0, trackAlpha: 0 });
  env.add(arc.object, VisionLayer.WeakOnly);
  const confetti = new GlassesConfetti(56, 23);
  env.add(confetti.mesh, VisionLayer.Both);

  // ── state ──
  let spots: THREE.Vector3[] | null = null;
  const list: Bubble[] = Array.from({ length: B.count }, () => ({
    state: 'empty' as BubbleState,
    t: 0,
    age: 0,
    spot: -1,
    tier: 1 as GlassesTier,
    base: new THREE.Vector3(),
    pos: new THREE.Vector3(),
    phase: 0,
  }));
  let ladder: TierState = { tier: 1, streak: 0 };
  let clock = 0;
  let time = 0;
  let onPad = false;
  let hold = 0;
  let target = -1;
  let arcFlash = 0;
  let pops = 0;
  let misses = 0;
  let gems = 0;
  // Test hooks.
  let forcedOffset: Offset | null = null;
  let aimMode: 'none' | 'reticle' | 'centre' = 'none';
  let aimTarget = -1;
  let forcedPad: boolean | null = null;
  const reticlePos = new THREE.Vector3();
  let offset: Offset = orbitAt(0);
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  // ── spots: open sky / far background behind every bubble ──
  const raycaster = new THREE.Raycaster();
  function sceneBlocked(from: THREE.Vector3, dir: THREE.Vector3, far: number): boolean {
    raycaster.set(from, dir);
    raycaster.near = 0;
    raycaster.far = far;
    raycaster.camera = ctx.camera;
    const hits = raycaster.intersectObjects(ctx.scene.children, true);
    for (const h of hits) {
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
    const eye = new THREE.Vector3(padPos.x, padPos.y + 1.6, padPos.z);
    const out: THREE.Vector3[] = [];
    const S = LINEUP.spots;
    const dir = new THREE.Vector3();
    for (const d of S.distances) {
      for (const a of S.angles) {
        for (const h of S.heights) {
          const yaw = padYaw + a * DEG;
          const p = new THREE.Vector3(padPos.x + Math.sin(yaw) * d, padPos.y + h, padPos.z + Math.cos(yaw) * d);
          if (env.groundAt(p.x, p.z) > p.y - S.clearance) continue;
          dir.subVectors(p, eye);
          const len = dir.length();
          dir.normalize();
          if (ctx.physics.raycast(eye, dir, len + S.behind)) continue;
          // Terrain along the sightline and behind the bubble.
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
    if (out.length < B.count + 1) {
      // Fallback (should not happen at a valid site): high up, straight ahead.
      for (const a of [-20, 0, 20, 10]) {
        const yaw = padYaw + a * DEG;
        out.push(new THREE.Vector3(padPos.x + Math.sin(yaw) * 9, padPos.y + 5.5, padPos.z + Math.cos(yaw) * 9));
      }
    }
    return out;
  }

  const radiusOf = (tier: GlassesTier): number => B.radius * withChallenge(tier, env.challenge()).size;

  function spawn(b: Bubble, delay: number): void {
    if (!spots) spots = findSpots();
    const used = list.filter((o) => o !== b && o.state !== 'empty').map((o) => o.base);
    const free = spots.map((_, i) => i).filter((i) => i !== b.spot && used.every((u) => u.distanceTo(spots![i]) >= LINEUP.spots.spacing));
    const pool = free.length > 0 ? free : spots.map((_, i) => i);
    b.spot = pool[Math.min(pool.length - 1, Math.floor(env.rng() * pool.length))];
    b.base.copy(spots[b.spot]);
    b.pos.copy(b.base);
    b.phase = env.rng() * Math.PI * 2;
    b.tier = ladder.tier;
    b.age = 0;
    b.t = 0;
    b.state = delay > 0 ? 'wait' : 'in';
    if (delay > 0) b.t = -delay;
  }

  function clearBubbles(): void {
    for (const b of list) {
      b.state = 'empty';
      b.t = 0;
      b.age = 0;
      b.spot = -1;
    }
    hold = 0;
    target = -1;
  }

  function popBubble(i: number): void {
    const b = list[i];
    b.state = 'pop';
    b.t = 0;
    hold = 0;
    target = -1;
    arcFlash = 1;
    pops++;
    const n = LINEUP.gems[b.tier];
    gems += n;
    env.result(b.tier, true);
    ladder = nextTier(ladder, true);
    ctx.audio.play('boing', { pitch: 1.7, volume: 0.8 });
    env.pay(n);
    // Both-eye celebration AFTER the pop, at the pad (never at the bubble).
    confetti.burst(tmp.set(padPos.x, padPos.y + 0.4, padPos.z), 34, 0.9);
  }

  function missBubble(i: number): void {
    const b = list[i];
    b.state = 'drift';
    b.t = 0;
    if (target === i) {
      hold = 0;
      target = -1;
    }
    misses++;
    env.result(b.tier, false);
    ladder = nextTier(ladder, false);
    ctx.audio.play('whoosh', { volume: 0.35, pitch: 1.3 });
  }

  const isOnPad = (): boolean => {
    if (forcedPad !== null) return forcedPad;
    const p = ctx.player.position;
    if (ctx.player.mode !== 'walk') return false;
    return Math.hypot(p.x - padPos.x, p.z - padPos.z) <= LINEUP.pad.radius && Math.abs(p.y - padPos.y) <= LINEUP.padHeight;
  };

  function simulate(dt: number): void {
    time += dt;
    const was = onPad;
    onPad = isOnPad();
    if (onPad && !was) {
      // Step on: bring bubbles (fresh ones only where none are waiting).
      let k = 0;
      for (const b of list) if (b.state === 'empty') spawn(b, k++ * B.stagger);
    }
    if (!onPad) {
      hold = 0;
      target = -1;
      return;
    }
    clock += dt * orbitSpeed(ladder.tier);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      b.t += dt;
      switch (b.state) {
        case 'wait':
          if (b.t >= 0) {
            b.state = 'in';
            b.t = 0;
          }
          break;
        case 'in':
          b.age += dt;
          if (b.t >= B.spawnIn) {
            b.state = 'live';
            b.t = 0;
          }
          break;
        case 'live':
          b.age += dt;
          if (b.age >= B.lifetime) missBubble(i);
          break;
        case 'pop':
          if (b.t >= B.popSeconds) spawn(b, B.respawnDelay);
          break;
        case 'drift':
          if (b.t >= B.driftSeconds) spawn(b, B.respawnDelay);
          break;
        default:
          break;
      }
    }
    arcFlash = Math.max(0, arcFlash - dt * 2.5);
  }

  /** Bubble positions (bobbing), reticle placement and the hold, for the current camera. */
  function aimAndLayout(dt: number): void {
    for (const b of list) {
      const bob = Math.sin(time * 1.1 + b.phase) * B.bob;
      const sway = Math.sin(time * 0.37 + b.phase * 1.3) * 0.25;
      b.pos.set(b.base.x + sway * Math.cos(padYaw), b.base.y + bob + (b.state === 'drift' ? b.t * 2.2 : 0), b.base.z - sway * Math.sin(padYaw));
    }
    const cam = ctx.camera.position;
    offset = forcedOffset ?? orbitAt(clock);
    ctx.camera.getWorldDirection(fwd);
    let forward: V3 = fwd;
    if (aimMode !== 'none') {
      const idx = aimTarget >= 0 && list[aimTarget]?.state === 'live' ? aimTarget : list.findIndex((b) => b.state === 'live');
      if (idx >= 0) {
        const to = tmp.subVectors(list[idx].pos, cam).normalize();
        forward = aimMode === 'centre' ? { x: to.x, y: to.y, z: to.z } : aimForReticle(to, offset);
      }
    }
    const r = reticleDirection(forward, offset);
    // Nearest bubble to the reticle (by angle): its distance places the reticle, and it is the one being held.
    let best = -1;
    let bestA = Infinity;
    let dist = 10;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.state !== 'live' && b.state !== 'in') continue;
      const to = tmp.subVectors(b.pos, cam);
      const d = to.length();
      const a = angleBetween(r, to);
      if (a < bestA) {
        bestA = a;
        best = i;
        dist = d;
      }
    }
    if (onPad && dt > 0) {
      const live = best >= 0 && list[best].state === 'live';
      const on = live && bestA <= tolerance(list[best].tier);
      if (on && best !== target) {
        target = best;
        hold = 0;
      }
      hold = holdStep(hold, on && best === target, dt);
      if (hold <= 0 && !on) target = -1;
      if (target >= 0 && hold >= AIM.holdSeconds) popBubble(target);
    }
    reticlePos.set(cam.x + r.x * dist, cam.y + r.y * dist, cam.z + r.z * dist);
    const scale = dist / 10;
    reticle.object.position.copy(reticlePos);
    reticle.object.scale.setScalar(scale);
    arc.object.position.copy(reticlePos);
    arc.object.scale.setScalar(scale * (1 + 0.35 * arcFlash));

    // Looks: reticle by the current tier; bubbles always full strength (strong eye).
    const look = withChallenge(ladder.tier, env.challenge());
    reticle.set({ level: look.level, opacity: look.opacity });
    arc.set({ level: look.level, opacity: look.opacity });
    reticle.setFade(onPad ? 1 : 0);
    const prog = arcFlash > 0 ? 1 : Math.min(1, hold / AIM.holdSeconds);
    arc.setProgress(prog);
    arc.setFade(onPad && prog > 0 ? (arcFlash > 0 ? arcFlash : 1) : 0);

    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const radius = radiusOf(b.tier);
      let pop = 0;
      let alpha = 0;
      if (b.state === 'in') alpha = Math.min(1, b.t / B.spawnIn);
      else if (b.state === 'live') alpha = 1;
      else if (b.state === 'pop') {
        alpha = 1;
        pop = Math.min(0.999, b.t / B.popSeconds);
      } else if (b.state === 'drift') alpha = Math.max(0, 1 - b.t / B.driftSeconds);
      bubbles.set(i, b.pos, radius, pop, alpha);
    }
    bubbles.setFade(onPad ? 1 : 0);
    bubbles.commit();
    pad.setGlow(onPad ? 1 : 0);
  }

  return {
    id: env.id,
    kind: env.kind,
    reset() {
      clearBubbles();
      ladder = { tier: 1, streak: 0 };
      clock = 0;
      time = 0;
      onPad = false;
      pops = 0;
      misses = 0;
      gems = 0;
      arcFlash = 0;
      confetti.clear();
      aimAndLayout(0);
    },
    setActive(on) {
      if (!on) {
        clearBubbles();
        onPad = false;
        arcFlash = 0;
        confetti.clear();
        aimMode = 'none';
        forcedOffset = null;
        forcedPad = null;
        aimAndLayout(0);
      }
    },
    update(dt) {
      simulate(dt);
      aimAndLayout(dt);
      confetti.update(dt);
    },
    dispose() {
      for (const o of [pad.mesh, bubbles.mesh, reticle.object, arc.object, confetti.mesh]) env.remove(o);
      pad.dispose();
      bubbles.dispose();
      reticle.dispose();
      arc.dispose();
      confetti.dispose();
    },
    debug: () => ({
      active: env.isActive(),
      onPad,
      pad: [padPos.x, padPos.y, padPos.z],
      padYaw,
      tier: ladder.tier,
      streak: ladder.streak,
      hold,
      target,
      offset: { thetaDeg: offset.theta / DEG, phiDeg: offset.phi / DEG },
      aim: aimMode,
      spots: spots?.length ?? 0,
      bubbles: list.map((b) => ({ state: b.state, age: b.age, tier: b.tier, pos: [b.pos.x, b.pos.y, b.pos.z] })),
      reticle: [reticlePos.x, reticlePos.y, reticlePos.z],
      pops,
      misses,
      gems,
    }),
    force(params) {
      if (params.offset === null) forcedOffset = null;
      else if (Array.isArray(params.offset) && params.offset.length === 2) {
        const [t, p] = params.offset as number[];
        forcedOffset = { theta: t * DEG, phi: p * DEG };
      }
      if (params.aim === 'none' || params.aim === 'reticle' || params.aim === 'centre') aimMode = params.aim;
      if (typeof params.target === 'number') aimTarget = Math.round(params.target);
      if (params.onPad === null) forcedPad = null;
      else if (typeof params.onPad === 'boolean') forcedPad = params.onPad;
      if (params.tier === 1 || params.tier === 2 || params.tier === 3) {
        ladder = { tier: params.tier, streak: 0 };
        for (const b of list) b.tier = params.tier;
      }
      if (params.live === true) {
        // Every bubble live at once (skips the spawn-in), keeping their spots.
        onPad = isOnPad();
        for (const b of list) {
          if (b.state === 'empty' || b.state === 'wait' || b.state === 'pop' || b.state === 'drift') spawn(b, 0);
          b.state = 'live';
          b.t = 0;
        }
      }
      if (typeof params.age === 'number') for (const b of list) if (b.state === 'live') b.age = params.age;
      hold = typeof params.hold === 'number' ? params.hold : hold;
      aimAndLayout(0);
    },
    drawObjects: () => env.tracked(),
  };
}
