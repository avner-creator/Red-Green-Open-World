/**
 * Buggy race at the start gantry by the garage: E at the race booth (or stop your buggy on the
 * grid) → 3-2-1 start lamps → three laps of the road loop against two friends in their own buggies
 * → podium celebration → result card with stars and gems, replay or exit (R always leaves safely).
 *
 * Glasses twist: the boost pads and the glowing best racing line live ONLY on the WeakOnly vision
 * layer; three pads in a row give a rocket surge. Checkpoint arches, lamps, chevrons and the HUD
 * are both-eye. First race per session is free, then a 3-gem ticket; with too few gems the race is
 * a practice run (no prize) so nobody is locked out.
 */
import * as THREE from 'three';
import type { BuggyHooks, VehiclePublic, VehiclesPublic } from '../../core/vehicles/types';
import type { ExternalController, GameContext } from '../../types';
import { ThrillConfetti } from '../thrillConfetti';
import { getWallet } from '../workshop/wallet';
import { BoostChain, prizeFor, racePrice, standings, stepRival } from './ai';
import { GRID, RACE, RIVALS } from './config';
import { createCorridor, lineAt, safeLine, steerClear, type Corridor } from './corridor';
import { createRaceGlow, type RaceGlow } from './glow';
import { createRaceHud } from './hud';
import { createRivalCar, pickFriends, placeRival, type RivalCar } from './rivals';
import { createRaceSite } from './site';
import { Progress, boostPadDistances, buildTrack, checkpointDistances, leftOf, racingLine } from './track';

export type RacePhase = 'idle' | 'countdown' | 'racing' | 'finishing' | 'podium' | 'result';

export interface Race {
  update(dt: number): void;
  readonly phase: RacePhase;
  dispose(): void;
}

/** `window.__rgRace` in test mode. */
export interface RaceTestApi {
  start(): boolean;
  readonly phase: RacePhase;
  setLaps(n: number): void;
  /** Drive the player's buggy along the racing line (test only). */
  autopilot(on: boolean): void;
  replay(): void;
  exit(): void;
  state(): {
    phase: RacePhase;
    lap: number;
    place: number;
    progress: number;
    length: number;
    rivals: number[];
    surges: number;
    padsHit: number;
    prize: boolean;
    result: { place: number; stars: number; gems: number } | null;
  };
  /** Pad centres for channel tests. */
  pads(): { x: number; y: number; z: number; dx: number; dz: number }[];
  /** Corridor debug: safe/ideal lateral and blocked laterals at lap distance `s`. */
  lineInfo(s: number): { safe: number; ideal: number; blocked: number[]; x: number; z: number };
  /** A grid spot behind the line looking down the track (x, y, z, yaw). */
  gridView(): [number, number, number, number];
}

declare global {
  interface Window {
    __rgRace?: RaceTestApi;
  }
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export function createRace(ctx: GameContext): Race {
  const track = buildTrack();
  const L = track.length;
  const line = racingLine(track);
  let cps = checkpointDistances(L, RACE.checkpoints);
  const padDist = boostPadDistances(track, 5);
  const heightAt = (x: number, z: number): number => ctx.world.heightAt(x, z);
  const site = createRaceSite(ctx.scene, track, heightAt, cps, ctx.physics);
  // Built at the first race (the physics world must have stepped before it can be probed).
  let glow: RaceGlow | null = null;
  let corridor: Corridor | null = null;
  let safe: number[] = [];
  const idealAt = (s: number): number => lineAt(line, L, s);
  const safeAt = (s: number): number => (safe.length ? lineAt(safe, L, s) : idealAt(s));
  const down = new THREE.Vector3(0, -1, 0);
  const rayO = new THREE.Vector3();
  const rayD = new THREE.Vector3();
  function probeCorridor(): Corridor {
    const c = createCorridor(L);
    const nl = c.lats.length;
    for (let i = 0; i < c.count; i++) {
      const p = track.at(i * c.ds);
      const q = track.at((i + 1) * c.ds);
      const lp = leftOf(p.dx, p.dz);
      const lq = leftOf(q.dx, q.dz);
      for (let j = 0; j < nl; j++) {
        const lat = c.lats[j];
        const x = p.x + lp.x * lat;
        const z = p.z + lp.z * lat;
        const g = heightAt(x, z);
        // Anything solid between knee and roof height (stalls, benches, signs, rocks)…
        let hit = ctx.physics.raycast(rayO.set(x, g + 3.5, z), down, 3.2) !== null;
        if (!hit) {
          // …or a thin post between this sample and the next.
          const x2 = q.x + lq.x * lat;
          const z2 = q.z + lq.z * lat;
          rayD.set(x2 - x, heightAt(x2, z2) - g, z2 - z);
          const len = rayD.length();
          if (len > 1e-3) hit = ctx.physics.raycast(rayO.set(x, g + 0.6, z), rayD.divideScalar(len), len) !== null;
        }
        if (hit) c.blocked[i * nl + j] = 1;
      }
    }
    return c;
  }
  function ensureBuilt(): void {
    if (glow) return;
    const c = probeCorridor();
    corridor = c;
    safe = safeLine(c, idealAt);
    glow = createRaceGlow(ctx.vision, track, safeAt, padDist, heightAt);
    // Checkpoint arches where they stand clear of props, straddling the safe line.
    const nl = c.lats.length;
    const blockedUnder = (s: number, centre: number): number => {
      const i = Math.round(s / c.ds);
      let n = 0;
      for (let k = -1; k <= 1; k++) {
        const ii = (((i + k) % c.count) + c.count) % c.count;
        for (let j = 0; j < nl; j++) if (c.blocked[ii * nl + j] && Math.abs(c.lats[j] - centre) <= 5.8) n++;
      }
      return n;
    };
    cps = cps.map((target, k) => {
      if (k === 0) return target;
      let best = target;
      let bestScore = Infinity;
      for (let d = -18; d <= 18; d++) {
        const sc = blockedUnder(target + d, safeAt(target + d)) * 100 + Math.abs(d);
        if (sc < bestScore) {
          bestScore = sc;
          best = target + d;
        }
      }
      return ((best % L) + L) % L;
    });
    site.setCheckpoints(cps.map((s, k) => ({ s, lateral: k === 0 ? 0 : safeAt(s) })));
  }
  let framesSeen = 0;
  const hud = createRaceHud(ctx.uiRoot);
  const confetti = new ThrillConfetti();
  ctx.scene.add(confetti.group);
  const wallet = getWallet(ctx);
  const car = ctx.vehicles.all.find((v) => v.kind === 'car') as VehiclePublic | undefined;
  const hooks: BuggyHooks | undefined = car?.buggy;
  const vehicles = ctx.vehicles as VehiclesPublic;

  const gridPose = (slot: number): { pos: THREE.Vector3; yaw: number } => {
    const [ds, lat] = GRID[slot];
    const p = track.at(ds);
    const l = leftOf(p.dx, p.dz);
    const x = p.x + l.x * lat;
    const z = p.z + l.z * lat;
    return { pos: new THREE.Vector3(x, heightAt(x, z), z), yaw: Math.atan2(p.dx, p.dz) };
  };

  let phase: RacePhase = 'idle';
  let phaseT = 0;
  let raceT = 0;
  let laps: number = RACE.laps;
  let rivals: RivalCar[] = [];
  let progress = new Progress(L, 0);
  let playerProg = 0;
  let playerFinish: number | null = null;
  let cpPassed = 0;
  let pace = 0;
  let prize = true;
  let racesThisSession = 0;
  let surges = 0;
  let padsHit = 0;
  const padLastLap = padDist.map(() => -99);
  const chain = new BoostChain(Math.max(1, padDist.length));
  let lastLamp = 0;
  let result: { place: number; stars: number; gems: number } | null = null;
  let finalOrder: string[] = [];
  let pendingReplay = false;
  let autopilot = false;
  let gridStill = 0;
  let lastRivalFinish: number | null = null;

  // ── Podium controller (player stands on their step; result card input) ──
  const podiumCtl: ExternalController = {
    update(dt, input) {
      const step = site.podiumSteps[Math.max(0, Math.min(2, (result?.place ?? 3) - 1))];
      ctx.player.position.copy(step);
      ctx.player.yaw = site.podiumYaw;
      ctx.player.setAnimation(result && result.place === 1 ? 'cheer' : phaseT % 3 < 1.5 ? 'wave' : 'cheer');
      void dt;
      if (phase === 'result' && phaseT > 0.4) {
        if (input.usePressed || input.jumpPressed) pendingReplay = true;
        else if (input.respawnPressed) exitRace = true;
      }
      return !(pendingReplay || exitRace);
    },
    onRelease() {
      ctx.cameraRig.setOverride(null);
      if (phase === 'podium' || phase === 'result') {
        if (!pendingReplay) {
          // Step down in front of the podium.
          const front = site.podiumSteps[0].clone();
          const off = new THREE.Vector3(Math.sin(site.podiumYaw), 0, Math.cos(site.podiumYaw)).multiplyScalar(2.2);
          front.add(off);
          front.y = heightAt(front.x, front.z) + 0.05;
          ctx.player.teleport(front, site.podiumYaw);
          if (!ctx.testMode) ctx.input.capturePointer(); // (headless lock changes would pause tests at random)
        }
        cleanup();
      }
    },
  };
  let exitRace = false;

  function removeRivals(): void {
    for (const r of rivals) {
      confetti.burst(r.position.clone().setY(r.position.y + 0.8), 18);
      r.dispose();
    }
    rivals = [];
  }

  function cleanup(): void {
    removeRivals();
    glow?.setVisible(false);
    hud.show(false);
    hud.result(null, false);
    hud.lost(null);
    site.setLamps(0);
    site.showPodium(false);
    if (hooks) hooks.hold = false;
    if (autopilot) ctx.input.inject(null);
    if (phase === 'countdown') ctx.cameraRig.setOverride(null);
    phase = 'idle';
    phaseT = 0;
    exitRace = false;
  }

  function abort(): void {
    if (phase === 'idle') return;
    if (ctx.player.mode === 'external' && (phase === 'podium' || phase === 'result')) {
      exitRace = true;
      return;
    }
    cleanup();
    ctx.events.emit('ui:toast', { icon: 'exit' });
  }

  function begin(): boolean {
    if (phase !== 'idle' || !car || !hooks || ctx.session.state.phase !== 'playing') return false;
    ensureBuilt();
    const driving = ctx.player.vehicle === car;
    if (!driving && ctx.player.mode !== 'walk') return false;
    // Ticket: first race per session free; then 3 gems, or a practice run without a prize.
    // Through the economy when there is one (ticket:paid / ticket:denied); else the session wallet.
    const economy = (ctx as Partial<GameContext>).economy;
    if (economy) {
      const price = economy.ticketPrice('race');
      prize = economy.rideTicket('race') !== 'practice';
      if (!prize) ctx.events.emit('ui:toast', { icon: 'gem', text: `+${Math.max(1, price - wallet.gems)}` });
    } else {
      const price = racePrice(racesThisSession);
      prize = true;
      if (price > 0 && !wallet.spend(price, 'ticket')) {
        prize = false;
        ctx.events.emit('ui:toast', { icon: 'gem', text: `+${Math.max(1, price - wallet.gems)}` });
      }
    }
    racesThisSession++;
    const g = gridPose(0);
    car.teleport(g.pos, g.yaw);
    if (!driving && !vehicles.board?.(car.id)) return false;
    hooks.hold = true;
    const friends = pickFriends(ctx.player.characterId);
    rivals = RIVALS.map((t, i) => createRivalCar(ctx, track, t, GRID[i + 1][0], GRID[i + 1][1], friends[i % friends.length]));
    progress = new Progress(L, GRID[0][0]);
    playerProg = GRID[0][0];
    playerFinish = null;
    lastRivalFinish = null;
    cpPassed = 0;
    pace = 0;
    surges = 0;
    padsHit = 0;
    padLastLap.fill(-99);
    chain.reset();
    result = null;
    phase = 'countdown';
    phaseT = 0;
    raceT = 0;
    lastLamp = 0;
    hud.show(true);
    hud.chain(0);
    hud.status(1, laps, 1);
    glow?.setVisible(true);
    site.setLamps(0);
    // Countdown framing: a little higher and further back, so the lamps and the gantry show.
    ctx.cameraRig.setOverride({ distance: 7, height: 2.6, fov: 56, lookAhead: 0 });
    ctx.audio.play('click');
    return true;
  }

  const removeBooth = ctx.interactions.add({
    id: 'race-booth',
    position: () => site.boothPrompt,
    radius: 3,
    icon: 'car',
    enabled: () => phase === 'idle',
    onUse: () => {
      begin();
    },
  });

  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'title' || e.phase === 'ended') abort();
    if (e.phase === 'playing' && e.previous === 'title') racesThisSession = 0;
  });

  function finishRace(): void {
    // Final order: finished racers by time, then by progress.
    const list = [
      { id: 'player', progress: playerProg, finishedAt: playerFinish },
      ...rivals.map((r, i) => ({ id: `friend${i}`, progress: r.state.progress, finishedAt: r.state.finishedAt })),
    ];
    const order = standings(list);
    finalOrder = order.map((o) => o.id);
    const place = finalOrder.indexOf('player') + 1;
    const p = prizeFor(place);
    result = { place, stars: p.stars, gems: prize ? p.gems : 0 };
    if (prize) wallet.earn(p.gems);
    ctx.events.emit('stunt', { kind: 'race', value: place, stars: p.stars });
    ctx.events.emit('stamp:earned', { id: 'raceStart' });
    ctx.events.emit('ui:toast', { icon: 'car', text: place === 1 ? '1st' : place === 2 ? '2nd' : '3rd' });
    phase = 'finishing';
    phaseT = 0;
    hud.lost(null);
    ctx.audio.play(place === 1 ? 'fanfare' : 'star');
  }

  function toPodium(): void {
    if (!car || !hooks) return;
    phase = 'podium';
    phaseT = 0;
    // Park the buggy on the grid for the next go; friends hop out onto their steps.
    const g = gridPose(0);
    ctx.player.setExternalController(podiumCtl);
    car.teleport(g.pos, g.yaw);
    hooks.hold = false;
    site.showPodium(true);
    hud.bar(false);
    hud.lost(null);
    rivals.forEach((r, i) => {
      const placeIdx = finalOrder.indexOf(`friend${i}`);
      const d = r.driver;
      if (!d) return;
      d.object.removeFromParent();
      ctx.scene.add(d.object);
      d.object.position.copy(site.podiumSteps[Math.max(0, Math.min(2, placeIdx))]);
      d.object.rotation.set(0, site.podiumYaw, 0);
      d.play(placeIdx === 0 ? 'cheer' : 'wave', 1, 0.2);
    });
    for (const s of site.podiumSteps) confetti.burst(s.clone().setY(s.y + 2.2), 60);
    ctx.cameraRig.setOverride({ distance: 7.5, height: 1.6, fov: 52, orbitRate: 0.25, lookAhead: 0 });
    ctx.audio.play('fanfare');
  }

  const toNext = new THREE.Vector3();
  function updateRacing(dt: number): void {
    if (!car || !hooks) return;
    raceT += dt;
    if (ctx.player.vehicle !== car) {
      abort();
      return;
    }
    const pr = track.project(car.position.x, car.position.z);
    playerProg = progress.update(pr.s, pr.dist);
    pace += (car.speed - pace) * (1 - Math.exp(-dt / 2.5));
    const view = { length: L, laps, playerProgress: playerProg, playerLateral: pr.lateral, playerSpeed: pace, time: raceT, curvature: (s: number) => track.curvatureNear(s, 4) };
    for (const r of rivals) {
      stepRival(r.state, r.tuning, view, dt);
      if (corridor) r.state.lateral = steerClear(corridor, r.state.progress, r.state.lateral, safeAt(r.state.progress), dt);
      if (r.state.finishedAt !== null) lastRivalFinish = Math.max(lastRivalFinish ?? 0, r.state.finishedAt);
      // Bumped by the player: a comic hop and wiggle (the physics pushes the buggies apart).
      if (r.hop <= 0 && r.position.distanceTo(car.position) < 2.75) {
        r.hop = 0.7;
        r.state.bumped = 1;
        ctx.audio.play('boing', { pitch: 1.2 });
        ctx.cameraRig.shake(0.2);
      }
      placeRival(r, track, ctx, dt);
    }
    // Checkpoints (arches) and laps.
    const C = cps.length;
    const nextCp = cpPassed + 1;
    const nextAt = Math.floor(nextCp / C) * L + cps[nextCp % C];
    if (playerProg >= nextAt) {
      cpPassed = nextCp;
      site.bounceArch(nextCp % C);
      if (nextCp % C === 0) ctx.audio.play('star', { pitch: 1.2 });
      else ctx.audio.play('boing', { pitch: 1.6, volume: 0.6 });
    }
    // Boost pads (weak-eye only).
    glow?.pads.forEach((p, i) => {
      const dx = car.position.x - p.x;
      const dz = car.position.z - p.z;
      const along = dx * p.dx + dz * p.dz;
      const lf = leftOf(p.dx, p.dz);
      const across = dx * lf.x + dz * lf.z;
      if (Math.abs(along) > RACE.padHalf.along || Math.abs(across) > RACE.padHalf.across) return;
      const lapKey = Math.floor((playerProg - p.s + L / 2) / L);
      if (padLastLap[i] === lapKey) return;
      padLastLap[i] = lapKey;
      padsHit++;
      hooks.boost(RACE.pad.extra, RACE.pad.seconds, RACE.pad.kick);
      glow?.flashPad(i);
      const n = chain.hit(i, raceT);
      ctx.audio.play('whoosh', { pitch: 1.5, volume: 0.8 });
      if (n >= 3) {
        surges++;
        hooks.boost(RACE.surge.extra, RACE.surge.seconds, RACE.surge.kick);
        ctx.audio.play('whoosh', { pitch: 0.8, volume: 1 });
        ctx.cameraRig.shake(0.35);
        ctx.events.emit('stunt', { kind: 'launch', value: 3, stars: 1 });
        hud.chain(3, true);
      } else hud.chain(n);
    });
    // Standings + HUD.
    const list = [{ id: 'player', progress: playerProg, finishedAt: playerFinish }, ...rivals.map((r, i) => ({ id: `f${i}`, progress: r.state.progress, finishedAt: r.state.finishedAt }))];
    const place = standings(list).findIndex((x) => x.id === 'player') + 1;
    hud.status(Math.floor(Math.max(0, playerProg) / L) + 1, laps, place);
    // Lost: an arrow back towards the next arch.
    if (pr.dist > 12) {
      const target = track.at(cps[(cpPassed + 1) % C]);
      toNext.set(target.x - car.position.x, 0, target.z - car.position.z);
      const want = Math.atan2(toNext.x, toNext.z);
      hud.lost(-wrapAngle(want - ctx.cameraRig.yaw));
    } else hud.lost(null);
    // Finish.
    if (playerFinish === null && playerProg >= laps * L) {
      playerFinish = raceT;
      finishRace();
      return;
    }
    const friendsDone = rivals.every((r) => r.state.finishedAt !== null);
    if (raceT > RACE.maxSeconds || (friendsDone && lastRivalFinish !== null && raceT - lastRivalFinish > RACE.afterFriends)) finishRace();
  }

  let stuckT = 0;
  let reverseT = 0;
  function updateAutopilot(): void {
    if (!autopilot || !car || !hooks || ctx.player.vehicle !== car) return;
    const pr = track.project(car.position.x, car.position.z);
    const look = 4 + car.speed * 0.25;
    const ahead = track.at(pr.s + look);
    const l = leftOf(ahead.dx, ahead.dz);
    const lat = safeAt(pr.s + look);
    const want = Math.atan2(ahead.x + l.x * lat - car.position.x, ahead.z + l.z * lat - car.position.z);
    const diff = wrapAngle(want - hooks.heading());
    let steer = Math.max(-1, Math.min(1, -diff * 1.8));
    // Brake for corners: the cornering speed of the tightest bend in the next ~20 m.
    let k = 0;
    for (let d = 2; d <= 20; d += 3) k = Math.max(k, track.curvatureNear(pr.s + d, 3));
    const target = Math.min(15, Math.sqrt(4.5 / Math.max(1e-3, k)), Math.abs(diff) > 0.5 ? 6 : 99);
    let throttle = car.speed > target + 1.5 ? -0.7 : car.speed > target ? 0 : 1;
    // Pinned against something: back up for a moment, steering the other way.
    if (phase === 'racing' && car.speed < 0.8 && throttle > 0) stuckT += 1 / 60;
    else if (car.speed > 2) stuckT = 0;
    if (stuckT > 0.8) {
      reverseT = 1.1;
      stuckT = 0;
    }
    if (reverseT > 0) {
      reverseT -= 1 / 60;
      throttle = -1;
      steer = -steer;
    }
    ctx.input.inject({ moveX: steer, moveY: phase === 'countdown' ? 0 : throttle });
  }

  hud.onReplay = () => {
    if (phase === 'result') pendingReplay = true;
  };
  hud.onExit = () => {
    if (phase === 'result') exitRace = true;
  };

  if (ctx.testMode) {
    window.__rgRace = {
      start: () => begin(),
      get phase() {
        return phase;
      },
      setLaps(n) {
        laps = Math.max(1, Math.round(n));
      },
      autopilot(on) {
        autopilot = on;
        if (!on) ctx.input.inject(null);
      },
      replay() {
        if (phase === 'result') pendingReplay = true;
      },
      exit() {
        if (phase === 'result' || phase === 'podium') exitRace = true;
        else abort();
      },
      state: () => ({
        phase,
        lap: Math.floor(Math.max(0, playerProg) / L) + 1,
        place: result?.place ?? 0,
        progress: playerProg,
        length: L,
        rivals: rivals.map((r) => r.state.progress),
        surges,
        padsHit,
        prize,
        result,
      }),
      pads: () => (glow?.pads ?? []).map((p) => ({ x: p.x, y: p.y, z: p.z, dx: p.dx, dz: p.dz })),
      lineInfo(s) {
        ensureBuilt();
        const c = corridor!;
        const i = Math.round(s / c.ds) % c.count;
        const blocked = c.lats.filter((_, j) => c.blocked[i * c.lats.length + j]);
        const p = track.at(s);
        return { safe: safeAt(s), ideal: idealAt(s), blocked, x: p.x, z: p.z };
      },
      gridView() {
        const g = gridPose(0);
        return [g.pos.x, g.pos.y, g.pos.z, g.yaw];
      },
    };
  }

  return {
    get phase() {
      return phase;
    },
    update(dt) {
      // Probe the lap a few frames after boot (the physics world has stepped by then).
      if (!glow && ++framesSeen > 3) ensureBuilt();
      if (pendingReplay && ctx.player.mode === 'walk') {
        pendingReplay = false;
        cleanup();
        begin();
      }
      if (ctx.session.state.phase !== 'playing') return;
      // Idle and far away: nothing to do.
      if (phase === 'idle' && ctx.player.position.distanceTo(site.boothPrompt) > RACE.wakeDistance) return;
      if (phase !== 'idle') phaseT += dt;
      site.update(dt);
      glow?.update(dt);
      confetti.update(dt);
      updateAutopilot();
      switch (phase) {
        case 'idle': {
          // Drive-in start: stop the buggy on the grid for a moment.
          if (car && ctx.player.vehicle === car) {
            const pr = track.project(car.position.x, car.position.z);
            const onGrid = (pr.s > L - 14 || pr.s < 1) && Math.abs(pr.lateral) < 4;
            gridStill = onGrid && car.speed < 1 ? gridStill + dt : 0;
            if (gridStill > 1.2) {
              gridStill = 0;
              begin();
            }
          }
          break;
        }
        case 'countdown': {
          if (car && ctx.player.vehicle !== car) {
            abort();
            break;
          }
          for (const r of rivals) placeRival(r, track, ctx, dt);
          const n = Math.min(3, Math.floor(phaseT / (RACE.countdown / 3)) + 1);
          if (n !== lastLamp) {
            lastLamp = n;
            site.setLamps(n);
            hud.countdown(4 - n);
            ctx.audio.play('tick');
          }
          if (phaseT >= RACE.countdown) {
            site.setLamps(4);
            hud.countdown('go');
            ctx.audio.play('start');
            if (hooks) hooks.hold = false;
            ctx.cameraRig.setOverride(null);
            phase = 'racing';
            phaseT = 0;
          }
          break;
        }
        case 'racing':
          if (phaseT > 1) {
            hud.countdown(null);
            site.setLamps(0);
          }
          updateRacing(dt);
          break;
        case 'finishing':
          for (const r of rivals) {
            stepRival(r.state, r.tuning, { length: L, laps, playerProgress: playerProg, playerLateral: 0, playerSpeed: pace, time: raceT, curvature: (s) => track.curvatureNear(s, 4) }, dt);
            placeRival(r, track, ctx, dt);
          }
          if (hooks && phaseT > 0.5) hooks.hold = true;
          if (phaseT > 1.4) toPodium();
          break;
        case 'podium':
          for (const r of rivals) r.driver?.update(dt);
          if (phaseT > RACE.podiumSeconds && result) {
            phase = 'result';
            phaseT = 0;
            hud.result({ ...result, practice: !prize }, ctx.input.state.device === 'gamepad');
            ctx.input.releasePointer();
          }
          break;
        case 'result':
          for (const r of rivals) r.driver?.update(dt);
          break;
      }
    },
    dispose() {
      if (phase !== 'idle') cleanup();
      removeBooth();
      offPhase();
      site.dispose();
      glow?.dispose();
      hud.dispose();
      confetti.group.removeFromParent();
      confetti.dispose();
      if (ctx.testMode) delete window.__rgRace;
    },
  };
}
