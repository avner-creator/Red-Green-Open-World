/**
 * Glow-flies (kind `follow`), on the booth kit (../booth/README.md): a game booth stands beside a
 * glowing walk-in start pad at the edge of a little meadow with a both-eye glow jar. Step on the
 * pad (or press Use on it) → 3-2-1-GO → weak-eye fireflies come out over the meadow for a timed
 * round (35 s). Run and jump right through one to catch it → a sparkle burst on the weak layer, ✓
 * above the hero, a bright lamp, a bead in the jar. Catch 5 before the time runs out (the unlit
 * lamps blink faster and faster, the last seconds tick); 3 or more win the prize. A fly that gets
 * away while the hero was within 3 m reports a miss (no lamp); nothing is reported for flies the
 * child never came near.
 *
 * Draw calls: booth (1) + jar/meadow (1) + flies (1, only during a round) + bursts (1, only while
 * one plays), and during a round the kit's fx (2) ≤ 6.
 */
import * as THREE from 'three';
import { MARQUEE } from '../booth/geometry';
import { PLAYER } from '../../../config';
import { VisionLayer } from '../../../types';
import type { GlassesTier } from '../../../types';
import { withChallenge } from '../../../vision/toolkit/tiers';
import { ROADS } from '../../../world/layout'; // read-only pure data: flies stay off the roads
import { seededRng } from '../idle';
import { roadClearance, siteToWorld } from '../sites';
import type { Mechanic, MechanicEnv } from '../types';
import { FLIES, FLY_CAMERA } from './constants';
import { GLOWFLIES_DEMO } from './demo';
import { createGlowInstances } from './fx';
import { buildJar } from './jar';
import { choosePatchLayout } from './layout';
import { Swarm } from './logic';
import type { PatchShape, V3 } from './logic';
import { blinkOn, FLY_BOOTH, FLY_PAD, FLY_PROMPT_SIZE, FLY_ROUND, FLY_RULES, flyArrivalTargets, flyBoothCentre, flyBoothFootprint, flyPrompt } from './round';

/** World XZ → site-local (inverse of `siteToWorld`). */
export function toLocal(site: { x: number; z: number; yaw: number }, wx: number, wz: number): { x: number; z: number } {
  const dx = wx - site.x;
  const dz = wz - site.z;
  const c = Math.cos(site.yaw);
  const s = Math.sin(site.yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

/** The patch in its layout frame (hero on the pad at the approach edge looks along −Z): view targets, jar. */
export const PATCH_LAYOUT = {
  hero: { x: FLY_PAD.x, z: FLY_PAD.z },
  targets: [
    { x: 0, z: 0, y: 1.7 },
    { x: -3, z: -1.5, y: 1.7 },
    { x: 3, z: -1.5, y: 1.7 },
    { x: 0, z: -4, y: 2 },
    // The booth's lamp row.
    { x: FLY_BOOTH.marquee.x, z: FLY_BOOTH.marquee.z, y: MARQUEE.lampY },
  ],
  jar: { x: 2.4, z: 3.2 },
} as const;

interface Burst {
  t: number;
  p: V3;
}

/**
 * Where flies may roam (site-local): within `roamRadius` of the patch centre and `maxFromSite`
 * of the site centre, over land, off roads, with nothing solid standing there. Probed once on a
 * 0.5 m grid (cheap lookups when a fly respawns).
 */
function roamGrid(ctx: MechanicEnv['ctx'], env: MechanicEnv, c: { x: number; z: number }): (x: number, z: number) => boolean {
  const R = FLIES.roamRadius + 1;
  const step = 0.5;
  const n = Math.ceil((2 * R) / step) + 1;
  const ok = new Uint8Array(n * n);
  const down = new THREE.Vector3(0, -1, 0);
  const o = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = c.x - R + i * step;
      const z = c.z - R + j * step;
      if (Math.hypot(x - c.x, z - c.z) > R || Math.hypot(x, z) > FLIES.maxFromSite) continue;
      const w = env.local(x, z);
      if (!ctx.world.isLand(w.x, w.z)) continue;
      const gy = ctx.world.heightAt(w.x, w.z);
      if (gy < ctx.world.waterLevel + 0.3 || roadClearance(ROADS, w.x, w.z) < 0.5) continue;
      const hit = ctx.physics.raycast(o.set(w.x, gy + 12, w.z), down, 14);
      if (hit && hit.point.y > gy + 0.5) continue;
      ok[i * n + j] = 1;
    }
  }
  return (x, z) => {
    const i = Math.round((x - (c.x - R)) / step);
    const j = Math.round((z - (c.z - R)) / step);
    return i >= 0 && j >= 0 && i < n && j < n && ok[i * n + j] === 1;
  };
}

export function create(env: MechanicEnv): Mechanic {
  const { ctx, site } = env;
  // Shift/turn the patch so a child on the pad sees the meadow and the booth, all inside the site.
  const layout = choosePatchLayout(ctx, site, PATCH_LAYOUT.hero.z, PATCH_LAYOUT.targets, flyBoothFootprint(), { at: site.arrival, targets: flyArrivalTargets() });
  const centreW = { x: layout.x, z: layout.z };
  const centre = toLocal(site, centreW.x, centreW.z);
  const inLayout = (x: number, z: number): { x: number; z: number } => {
    const w = siteToWorld(layout, x, z);
    return toLocal(site, w.x, w.z);
  };
  const jar = inLayout(PATCH_LAYOUT.jar.x, PATCH_LAYOUT.jar.z);
  const boothC = inLayout(flyBoothCentre().x, flyBoothCentre().z);
  const padL = inLayout(FLY_PAD.x, FLY_PAD.z);
  const roam = roamGrid(ctx, env, centre);
  const patch: PatchShape = {
    cx: centre.x,
    cz: centre.z,
    radius: FLIES.roamRadius,
    allowed: roam,
    avoid: [
      { x: boothC.x, z: boothC.z, r: FLIES.boothClear },
      { x: jar.x, z: jar.z, r: FLIES.jarClear },
    ],
  };

  // ── both-eye: jar on its stump + meadow flowers (one mesh) ──
  const jarMesh = buildJar({
    jar,
    avoid: [...patch.avoid, { x: jar.x, z: jar.z, r: 1.4 }, { x: padL.x, z: padL.z, r: FLY_PAD.r + 0.6 }],
    centre,
    patchRadius: FLIES.patchRadius,
    notches: FLIES.jarNotches,
    heightAt: (x, z) => {
      const w = env.local(x, z);
      return env.groundAt(w.x, w.z) - site.y;
    },
  });
  jarMesh.mesh.position.set(site.x, site.y, site.z);
  jarMesh.mesh.rotation.y = site.yaw;
  jarMesh.mesh.updateMatrixWorld(true);
  env.add(jarMesh.mesh, VisionLayer.Both);
  const jarWorld = env.local(jar.x, jar.z);
  const jarGround = env.groundAt(jarWorld.x, jarWorld.z);
  const collider = ctx.physics.addStaticCylinder(new THREE.Vector3(jarWorld.x, jarGround + 0.8, jarWorld.z), 0.8, 0.6);

  // ── weak eye: flies and their catch bursts ──
  const flies = createGlowInstances(FLIES.maxCount, 'fly', 'glowflies-flies');
  const bursts = createGlowInstances(FLIES.maxBursts * FLIES.burstParticles, 'spark', 'glowflies-bursts');
  const weak = new THREE.Group();
  weak.name = 'glowflies-weak';
  weak.add(flies.mesh, bursts.mesh);
  env.add(weak, VisionLayer.WeakOnly);

  let seed = 0;
  /** The flies of the round in play (null between rounds: no flies out). */
  let swarm: Swarm | null = null;
  let roundTier: GlassesTier = 1;
  let caught = 0;
  let totalCaught = 0;
  let nearMisses = 0;
  let time = 0;
  let active = false;
  let havePrev = false;
  let tickAt = 0;
  /** Test hook: the seed the next round's flies use (else drawn from the mechanic's rng). */
  let nextSeed: number | null = null;
  const prev = { x: 0, y: 0, z: 0 };
  const chest = { x: 0, y: 0, z: 0 };
  let burstList: Burst[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tmp: V3 = { x: 0, y: 0, z: 0 };
  const headW = new THREE.Vector3();

  function makeSwarm(sd: number, tier: GlassesTier): Swarm {
    seed = sd >>> 0;
    return new Swarm({ rng: seededRng(seed), patch, toWorld: (x, z) => env.local(x, z), groundAt: (x, z) => env.groundAt(x, z), tier });
  }

  /** GO: the flies come out (a new seeded swarm at the round's tier), the jar empties, the clock runs. */
  function startFlies(tier: GlassesTier): void {
    roundTier = tier;
    swarm = makeSwarm(nextSeed ?? Math.floor(env.rng() * 2 ** 31), tier);
    caught = 0;
    tickAt = Math.ceil(FLY_ROUND.hurry);
    jarMesh.setFill(0);
    havePrev = false;
  }

  function stopFlies(): void {
    swarm = null;
  }

  // The ONE play prompt ("catch!") in front of the booth's picture board side, in clear view from the
  // pad camera (central safe area, off the hero): picked once from the layout.
  const groundL = (x: number, z: number): number => {
    const w = siteToWorld(layout, x, z);
    return env.groundAt(w.x, w.z) - site.y;
  };
  const promptPick = flyPrompt(groundL);
  const kit = env.booth({
    frame: { x: layout.x, z: layout.z, yaw: layout.yaw },
    spec: { ...FLY_BOOTH, playPromptAt: promptPick.at, playPromptSize: FLY_PROMPT_SIZE },
    // From the pad the hero faces the middle of the meadow.
    look: { x: 0, z: 0 },
    demo: GLOWFLIES_DEMO,
    rules: FLY_RULES,
    hooks: {
      onTry(i, tier) {
        if (i === 0) startFlies(tier);
      },
      onIdle() {
        // Time up (or cancelled): the lamps never earned go dark; the flies go home.
        for (let i = kit.round.results.length; i < FLY_RULES.tries; i++) kit.booth.setLamp(i, 'off');
        if (swarm && caught < FLY_RULES.tries) ctx.audio.play('whoosh', { volume: 0.4, pitch: 0.8 });
        stopFlies();
        releaseCamera();
      },
    },
  });

  function dropTransient(): void {
    burstList = [];
    havePrev = false;
  }

  function draw(): void {
    flies.setTime(time);
    bursts.setTime(time);
    const mods = env.challenge();
    let n = 0;
    if (swarm) {
      const preset = withChallenge(roundTier, mods);
      for (const f of swarm.flies) {
        let alpha = 0;
        let size = 0;
        if (f.state !== 'gone') {
          swarm.position(f, tmp);
          const born = Math.min(1, f.age / 0.6); // fade in when (re)spawned
          const leaving = f.state === 'leaving' ? 1 - Math.min(1, f.timer / FLIES.leaveSeconds) : 1;
          alpha = preset.opacity * born * leaving;
          size = FLIES.size * preset.size;
        }
        m.compose(p.set(tmp.x, tmp.y, tmp.z), q.identity(), s.setScalar(Math.max(size, 1e-4)));
        flies.set(n++, m, preset.level, alpha, f.slot * 1.7);
      }
    }
    flies.commit(n);

    let k = 0;
    for (const b of burstList) {
      const t = b.t / FLIES.burstSeconds;
      const ease = 1 - (1 - t) * (1 - t);
      // Central flash + a ring of sparks flying out.
      m.compose(p.set(b.p.x, b.p.y, b.p.z), q.identity(), s.setScalar(0.6 + ease * 1.8));
      bursts.set(k++, m, 1, (1 - t) * 0.8);
      for (let j = 0; j < FLIES.burstParticles - 1; j++) {
        const a = (j / (FLIES.burstParticles - 1)) * Math.PI * 2;
        const up = j % 2 === 0 ? 0.8 : -0.2;
        p.set(b.p.x + Math.cos(a) * ease * 1.5, b.p.y + up * ease * 1.1 - ease * ease * 0.4, b.p.z + Math.sin(a) * ease * 1.5);
        m.compose(p, q.identity(), s.setScalar(0.38 * (1 - t * 0.7)));
        bursts.set(k++, m, 1, 1 - t);
      }
    }
    bursts.commit(k);
  }

  // ── the round camera: while the flies are out the camera is pulled back, lower and a little
  // wider, so the flies over the meadow sit well inside the picture, not at its top edge. Held
  // only while the round is in play and the hero walks; released the moment it ends (the kit's
  // celebration camera takes over), the child leaves, rides, respawns or the session changes. ──
  let camHeld = false;
  function releaseCamera(): void {
    if (!camHeld) return;
    camHeld = false;
    ctx.cameraRig.setOverride(null);
  }
  function holdCamera(): void {
    if (active && swarm && kit.phase() === 'play' && ctx.player.mode === 'walk') {
      ctx.cameraRig.setOverride(FLY_CAMERA);
      camHeld = true;
    } else releaseCamera();
  }
  const offSession = ctx.events.on('session:phase', () => releaseCamera());

  /** The unlit lamps blink, faster as the time runs out; the last seconds tick. */
  function clockLook(): void {
    const phase = kit.phase();
    if (!swarm || (phase !== 'play' && phase !== 'beat')) return;
    const done = kit.round.results.length;
    const left = kit.round.timeLeft;
    const on = blinkOn(left, FLY_ROUND.time - left);
    for (let i = done; i < FLY_RULES.tries; i++) kit.booth.setLamp(i, on ? 'chase' : 'off');
    if (left <= tickAt && tickAt > 0) {
      ctx.audio.play('tick', { pitch: 1 + (FLY_ROUND.hurry - tickAt) * 0.05, volume: 0.6 });
      tickAt--;
    }
  }

  function update(dt: number): void {
    time += dt;
    kit.update(dt);
    const pp = ctx.player.position;
    chest.x = pp.x;
    chest.y = pp.y + PLAYER.height / 2;
    chest.z = pp.z;
    if (!havePrev) Object.assign(prev, chest);
    const maxStep = FLIES.maxSpeed * Math.max(dt, 1 / 60) + FLIES.slack;
    const from = Math.hypot(chest.x - prev.x, chest.y - prev.y, chest.z - prev.z) > maxStep ? chest : prev;
    const inside = Math.hypot(pp.x - centreW.x, pp.z - centreW.z) <= FLIES.insideRadius;

    if (swarm && kit.phase() === 'play') {
      // ✓ / ✗ pop above the hero's head (never at a fly: a caught one is gone, a lost one leaving).
      headW.set(pp.x, pp.y + PLAYER.height + 0.7, pp.z);
      for (const { at } of swarm.catchAlong(from, chest)) {
        if (burstList.length >= FLIES.maxBursts) burstList.shift();
        burstList.push({ t: 0, p: at });
        caught++;
        totalCaught++;
        jarMesh.setFill(caught);
        jarMesh.gulp();
        // A timed round: every catch lights the next lamp; the 5th ends the round.
        kit.report(true, kit.toLocal(headW));
        if (!swarm) break;
      }
      for (const ev of swarm?.update(dt, inside, chest) ?? []) {
        if (ev.type === 'miss') {
          // It got away while the hero was near: a miss with no lamp (lamps count catches).
          nearMisses++;
          kit.note(false, kit.toLocal(headW));
        }
      }
      clockLook();
    }
    holdCamera();

    Object.assign(prev, chest);
    havePrev = true;

    for (const b of burstList) b.t += dt;
    burstList = burstList.filter((b) => b.t < FLIES.burstSeconds);
    jarMesh.update(dt);
    draw();
  }

  function reset(): void {
    releaseCamera();
    stopFlies();
    caught = 0;
    totalCaught = 0;
    nearMisses = 0;
    nextSeed = null;
    jarMesh.setFill(0);
    dropTransient();
    kit.reset();
    draw();
  }

  reset();

  const groundPt = (lx: number, lz: number): { x: number; y: number; z: number } => {
    const w = siteToWorld(layout, lx, lz);
    return { x: w.x, y: env.groundAt(w.x, w.z), z: w.z };
  };

  return {
    id: env.id,
    kind: env.kind,
    reset,
    setActive(on) {
      active = on;
      if (!on) releaseCamera();
      kit.setActive(on);
      dropTransient();
      if (!on) {
        stopFlies();
        // Nothing lingers while far: bursts are gone, the jar stands still.
        jarMesh.update(10);
      }
      draw();
    },
    update,
    dispose() {
      releaseCamera();
      offSession();
      kit.dispose();
      env.remove(weak);
      env.remove(jarMesh.mesh);
      ctx.physics.removeCollider(collider);
      flies.dispose();
      bursts.dispose();
      jarMesh.dispose();
    },
    debug() {
      const pad = groundPt(FLY_PAD.x, FLY_PAD.z);
      const view = siteToWorld(layout, FLY_PAD.x, FLY_PAD.z + 2.4);
      return {
        active,
        phase: kit.phase(),
        tier: kit.tier(),
        roundTier,
        seed,
        caught,
        totalCaught,
        nearMisses,
        left: kit.round.timeLeft,
        camHeld,
        promptFits: promptPick.fits,
        time,
        out: swarm !== null,
        bursts: burstList.length,
        gems: kit.round.totalGems,
        kit: kit.debug(),
        jar: { x: jarWorld.x, z: jarWorld.z },
        inside: Math.hypot(ctx.player.position.x - centreW.x, ctx.player.position.z - centreW.z) <= FLIES.insideRadius,
        centre: centreW,
        yaw: layout.yaw,
        pad,
        /** Just behind the pad (default camera looks along this yaw over the meadow). */
        view: { x: view.x, z: view.z, yaw: layout.yaw + Math.PI },
        padBack: groundPt(FLY_PAD.x, FLY_PAD.z + 2.4),
        booth: groundPt(flyBoothCentre().x, flyBoothCentre().z),
        layoutProblems: layout.problems,
        flies: (swarm?.flies ?? []).map((f) => {
          const at = (swarm as Swarm).position(f);
          return { slot: f.slot, tier: f.tier, state: f.state, age: f.age, life: f.life, x: at.x, y: at.y, z: at.z };
        }),
      };
    },
    force(params) {
      if (typeof params.seed === 'number') {
        nextSeed = params.seed;
        if (swarm) {
          swarm = makeSwarm(params.seed, roundTier);
          dropTransient();
        }
      }
      if (params.play) kit.forcePlay(typeof params.tier === 'number' ? (Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier) : undefined);
      if (params.start) kit.start();
      if (typeof params.pin === 'number') kit.pin(params.pin);
      // Seconds left in a timed round (the machine's clock jumps there).
      if (typeof params.left === 'number' && kit.phase() === 'play') kit.round.t = Math.max(0, FLY_ROUND.time - params.left);
      // Every alive fly this close to the end of its life (seconds); the next update decides.
      if (typeof params.lifeLeft === 'number' && swarm) for (const f of swarm.flies) if (f.state === 'alive') f.age = Math.max(0, f.life - params.lifeLeft);
      if (typeof params.time === 'number') time = params.time;
      draw();
    },
    drawObjects: () => env.tracked(),
  };
}
