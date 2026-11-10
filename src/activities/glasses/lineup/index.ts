/**
 * Line-up (kind `lineUp`): "magic ring bubbles".
 *
 * Stand on the both-eye pad. A soap bubble only the STRONG eye sees floats 8–13 m ahead (two at
 * tier 3). A magic ring only the WEAK eye sees sits at a fixed offset from the screen centre and
 * moves with the camera: steer it over the bubble and press Use. Bubble inside the ring → it pops
 * (gems, confetti at the pad). Not inside → a soft "pfft", the oldest bubble floats away (a miss)
 * and the ring recharges for a few seconds. After every press and every time-out the ring jumps to
 * a new offset (5°–14° from the centre, any direction but down), so without the weak eye the only
 * option is a blind guess (≤ 8 % a press, proven in tests/activities/glasses-lineup.test.ts).
 *
 * Red-green rule: bubbles never react to the ring before a press; the ring never reacts to
 * anything the strong eye can see. Draw calls: board 1 + pad 1 + bubbles 1 + ring 1 +
 * confetti 1 (while flying) = 5.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../types';
import type { GlassesTier, Interactable } from '../../../types';
import { withChallenge } from '../../../vision/toolkit';
import { GlassesConfetti } from '../oddone/confetti';
import type { Mechanic, MechanicEnv } from '../types';
import { aimForReticle, angleBetween, reticleDirection, tolerance } from './aim';
import type { V3 } from './aim';
import { LINEUP } from './constants';
import { LineupGame } from './game';
import { createBubbles, createHoop, createPad } from './visuals';

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
  const bubbles = createBubbles(B.slots);
  env.add(bubbles.mesh, VisionLayer.StrongOnly);
  const hoop = createHoop();
  env.add(hoop.mesh, VisionLayer.WeakOnly);
  const confetti = new GlassesConfetti(48, 23);
  env.add(confetti.mesh, VisionLayer.Both);

  // ── state ──
  let spots: THREE.Vector3[] | null = null;
  const slot = Array.from({ length: B.slots }, () => ({ spot: -1, base: new THREE.Vector3(), pos: new THREE.Vector3(), phase: 0, radius: 0.5 }));
  let onPad = false;
  let time = 0;
  let burst = 0;
  // Test hooks.
  let aimMode: 'none' | 'reticle' | 'centre' = 'none';
  let aimTarget = -1;
  let forcedPad: boolean | null = null;
  const ringPos = new THREE.Vector3();
  let ringRadius = 0.5;
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const eye = new THREE.Vector3(padPos.x, padPos.y + 1.6, padPos.z);

  // ── spots: open sky / far background behind every bubble ──
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
      for (const a of [-20, 0, 20, 10]) {
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
    const others = game.bubbles.map((b, j) => (j !== i && b.state !== 'empty' ? slot[j].base : null)).filter((v): v is THREE.Vector3 => !!v);
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

  const game = new LineupGame(env.rng, {
    result: (tier, hit) => env.result(tier, hit),
    pay: (n) => env.pay(n),
    spawned: (i) => placeBubble(i),
    popped: () => {
      burst = 1;
      ctx.audio.play('boing', { pitch: 1.8, volume: 0.7 });
      // Both-eye celebration AFTER the pop, at the pad (never at the bubble).
      confetti.burst(tmp.set(padPos.x, padPos.y + 0.4, padPos.z), 30, 0.9);
    },
    missed: (_i, why) => {
      if (why === 'press') ctx.audio.play('whoosh', { volume: 0.3, pitch: 1.6 });
    },
  });

  const isOnPad = (): boolean => {
    if (forcedPad !== null) return forcedPad;
    const p = ctx.player.position;
    if (ctx.player.mode !== 'walk') return false;
    return Math.hypot(p.x - padPos.x, p.z - padPos.z) <= LINEUP.pad.radius && Math.abs(p.y - padPos.y) <= LINEUP.padHeight;
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

  function press(): void {
    if (!onPad) return;
    if (game.press(inside()) === 'ignored') ctx.audio.play('click', { volume: 0.4 });
  }

  // One prompt on the pad: the same whenever the hero stands on it.
  const promptAt = new THREE.Vector3(padPos.x, padPos.y + 0.9, padPos.z);
  const prompt: Interactable = {
    id: 'glasses-lineup-pad',
    position: () => promptAt,
    radius: LINEUP.pad.radius + 0.2,
    icon: 'hand',
    enabled: () => env.isActive() && isOnPad(),
    onUse: press,
  };
  const offPrompt = ctx.interactions.add(prompt);

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
    hoop.setCharge(game.charge());
    hoop.setBurst(burst > 0 ? 1 - burst : 0);
    const look = withChallenge(tier, env.challenge());
    hoop.setLook(look.level, Math.max(0.75, look.opacity));
    hoop.setFade(onPad ? 1 : 0);
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
    pad.setGlow(onPad ? 1 : 0);
  }

  function clearAll(): void {
    game.clear();
    onPad = false;
    burst = 0;
    confetti.clear();
  }

  return {
    id: env.id,
    kind: env.kind,
    reset() {
      clearAll();
      game.reset();
      time = 0;
      layout();
    },
    setActive(on) {
      if (!on) {
        clearAll();
        aimMode = 'none';
        forcedPad = null;
        layout();
      }
    },
    update(dt) {
      time += dt;
      const was = onPad;
      onPad = isOnPad();
      if (onPad && !was && game.bubbles.every((b) => b.state === 'empty')) game.fill(true);
      // Off the pad everything waits (no time-outs, no misses).
      if (onPad) game.step(dt);
      burst = Math.max(0, burst - dt * 2.2);
      hoop.update(dt);
      layout();
      confetti.update(dt);
    },
    dispose() {
      offPrompt();
      for (const o of [pad.mesh, bubbles.mesh, hoop.mesh, confetti.mesh]) env.remove(o);
      pad.dispose();
      bubbles.dispose();
      hoop.dispose();
      confetti.dispose();
    },
    debug: () => {
      const o = game.offset();
      return {
        active: env.isActive(),
        onPad,
        pad: [padPos.x, padPos.y, padPos.z],
        padYaw,
        tier: game.tier,
        streak: game.ladder.streak,
        wanted: game.wanted(),
        cooldown: game.cooldown,
        charge: game.charge(),
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
        gems: game.gems,
      };
    },
    force(params) {
      if (Array.isArray(params.offset) && params.offset.length === 2) {
        const [t, p] = params.offset as number[];
        game.setOffset({ theta: t * DEG, phi: p * DEG });
      }
      if (params.aim === 'none' || params.aim === 'reticle' || params.aim === 'centre') aimMode = params.aim;
      if (typeof params.target === 'number') aimTarget = Math.round(params.target);
      if (params.onPad === null) forcedPad = null;
      else if (typeof params.onPad === 'boolean') forcedPad = params.onPad;
      if (params.tier === 1 || params.tier === 2 || params.tier === 3) {
        game.ladder = { tier: params.tier, streak: 0 };
        for (const b of game.bubbles) b.tier = params.tier;
      }
      if (params.live === true) {
        // The wanted bubbles live at once (skips the spawn-in and the recharge).
        onPad = isOnPad();
        game.cooldown = 0;
        for (const b of game.bubbles) if (b.state === 'pop' || b.state === 'drift') b.state = 'empty';
        game.fill(true);
        game.bubbles.forEach((b, i) => {
          if (b.state === 'wait' || b.state === 'in') {
            b.state = 'live';
            b.t = 0;
            placeBubble(i);
          }
        });
      }
      if (typeof params.age === 'number') for (const b of game.bubbles) if (b.state === 'live') b.age = params.age;
      layout();
    },
    drawObjects: () => env.tracked(),
  };
}
