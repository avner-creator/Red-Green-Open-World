/**
 * Rocket pads: step on a chunky pad, squash for 0.6 s with a rising whoosh, then get flung about
 * 60 m in a high arc onto a big inflatable landing net (soft double bounce, confetti, stunt).
 * The arc is solved from PLAYER.gravity for each pad, so it lands on the net from wherever the pad
 * sits. A "launch gate" hook lets the economy charge a ticket: while it returns false the pad just
 * does a friendly locked wobble.
 */
import * as THREE from 'three';
import type { GameContext, TicketOutcome } from '../types';
import { PLAYER } from '../config';
import { arcPoint, solveLaunch } from './ballistics';
import { launchStars } from './bounceLogic';
import { NET, ROCKET } from './constants';
import type { Arc, ArrivalInfo, Flight, FlightHooks } from './flight';
import type { ThrillConfetti } from './thrillConfetti';
import { buildNet, buildRocketPad } from './rocketModels';
import type { NetModel, RocketPadModel } from './rocketModels';
import { findNetSite } from './rocketSite';
import type { NetSite, SiteWorld } from './rocketSite';
import { getStuntGate } from './stuntGate';
import { thrillSpots } from './thrillSpots';

/** true/'free'/'paid' = launch; 'practice' = launch without the prize (no stunt); false = wobble. */
export type LaunchGate = () => boolean | TicketOutcome;
let gate: LaunchGate = () => true;
/** This launch is a practice ride (could not pay): no landing stunt. */
let practice = false;

/** Ticket hook: when set and it returns false, rocket pads wobble instead of launching. */
export function setLaunchGate(fn: LaunchGate | null): void {
  gate = fn ?? (() => true);
}

export interface RocketInfo {
  /** Net centre (world), the surface height players land on, and the search result. */
  net: { x: number; z: number; landY: number; radius: number; shortened: boolean; distance: number };
  pads: { x: number; y: number; z: number }[];
}

export interface RocketPads {
  update(dt: number): void;
  /** Trigger pad `index` as if stepped on (tests). */
  launchFrom(index: number): void;
  readonly info: RocketInfo;
  dispose(): void;
}

interface PadState {
  x: number;
  y: number;
  z: number;
  model: RocketPadModel;
  /** Wind-up progress 0..1 (squash) and the locked wobble timer. */
  squash: number;
  wobble: number;
  arrow: number;
  collider: ReturnType<GameContext['physics']['addStaticCylinder']>;
}

export function createRocketPads(ctx: GameContext, flight: Flight, confetti: ThrillConfetti): RocketPads {
  const world = ctx.world;
  const anchor = world.anchors.launchPads;
  const ax = anchor.position.x;
  const az = anchor.position.z;
  const sin = Math.sin(anchor.yaw);
  const cos = Math.cos(anchor.yaw);

  // 1. Find the net: flat, dry, clear land along the anchor's direction.
  const keepClear = Object.entries(world.anchors)
    .filter(([name]) => name !== 'launchPads')
    .map(([, a]) => ({ x: a.position.x, z: a.position.z, radius: a.radius }));
  const probe = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const siteWorld: SiteWorld = {
    heightAt: (x, z) => world.heightAt(x, z),
    isLand: (x, z) => world.isLand(x, z),
    blocked(x, z) {
      // A solid prop (tree, building) taller than the ground here makes the spot unusable.
      const g = world.heightAt(x, z);
      const hit = ctx.physics.raycast(probe.set(x, g + 40, z), down, 80);
      return !!hit && hit.point.y > g + 0.6;
    },
    keepClear,
  };
  const padCentre = { x: ax + sin * -2, z: az + cos * -2 };
  // The world reserves a cleared landing spot (anchor.target); search only when it has none.
  const target = anchor.target;
  const found: NetSite | null = target
    ? {
        x: target.x,
        z: target.z,
        groundY: world.heightAt(target.x, target.z),
        distance: Math.hypot(target.x - padCentre.x, target.z - padCentre.z),
        heading: Math.atan2(target.x - padCentre.x, target.z - padCentre.z),
        shortened: false,
      }
    : findNetSite(siteWorld, padCentre, anchor.yaw);
  // The net fits inside the reserved spot (scaled down from NET.radius when needed).
  const netRadius = Math.min(NET.radius, anchor.targetRadius ?? NET.radius);
  // No flat landing anywhere: fall back to 20 m straight ahead (reported through `info`).
  const site: NetSite = found ?? {
    x: padCentre.x + sin * 20,
    z: padCentre.z + cos * 20,
    groundY: world.heightAt(padCentre.x + sin * 20, padCentre.z + cos * 20),
    distance: 20,
    heading: anchor.yaw,
    shortened: true,
  };
  const netLandY = site.groundY + NET.height - 0.1;

  const root = new THREE.Group();
  root.name = 'rocketPads';
  ctx.scene.add(root);
  const disposables: { dispose(): void }[] = [];
  const colliders: PadState['collider'][] = [];

  // 2. The net.
  const net: NetModel = buildNet();
  net.group.position.set(site.x, site.groundY, site.z);
  net.group.rotation.y = site.heading + Math.PI; // pole on the side facing the pads
  net.group.scale.set(netRadius / NET.radius, 1, netRadius / NET.radius);
  root.add(net.group);
  disposables.push(net);
  const netHalf = (netLandY - site.groundY + 0.4) / 2;
  colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(site.x, netLandY - netHalf, site.z), netHalf, netRadius));

  // 3. The pads, side by side across the anchor's local X, all facing the net.
  const pads: PadState[] = [];
  for (let i = 0; i < ROCKET.count; i++) {
    const lx = (i - (ROCKET.count - 1) / 2) * ROCKET.spacing;
    const x = ax + lx * cos + -2 * sin;
    const z = az - lx * sin + -2 * cos;
    const gy = world.heightAt(x, z) + 0.06; // sits on the paved slab
    const model = buildRocketPad();
    model.group.position.set(x, gy, z);
    model.group.rotation.y = Math.atan2(site.x - x, site.z - z);
    root.add(model.group);
    disposables.push(model);
    const collider = ctx.physics.addStaticCylinder(new THREE.Vector3(x, gy + ROCKET.padTop / 2, z), ROCKET.padTop / 2, ROCKET.padRadius);
    colliders.push(collider);
    pads.push({ x, y: gy + ROCKET.padTop, z, model, squash: 0, wobble: 0, arrow: i * 1.3, collider });
  }

  // 4. Launch logic.
  let active = -1;
  let launched = false;
  let cooldown = 0;
  let prevPad = -1;
  let launchFrom0 = { x: 0, z: 0 };
  let netSquash = 0;
  let bounceNo = 0;
  let flameT = 0;
  let clock = 0;
  const tmp = new THREE.Vector3();

  function arcFor(i: number): Arc {
    const p = pads[i];
    const d = Math.hypot(site.x - p.x, site.z - p.z);
    const sol = solveLaunch(site.x - p.x, netLandY - p.y, site.z - p.z, ROCKET.apexBase + ROCKET.apexPerMetre * d);
    return { vx: sol.vx, vy: sol.vy, vz: sol.vz, endY: netLandY, dwell: ROCKET.windup, dip: 0.3 };
  }

  const rising = [0, 0.3, 0.6, 0.85];
  let nextWhoosh = 0;

  const hooks: FlightHooks = {
    onDwell(t) {
      const p = pads[active];
      if (!p) return;
      p.squash = Math.min(1, t);
      while (nextWhoosh < rising.length && t >= rising[nextWhoosh]) {
        ctx.audio.play('whoosh', { volume: 0.5 + 0.12 * nextWhoosh, pitch: 0.55 + 0.35 * nextWhoosh });
        ctx.cameraRig.shake(0.1 + 0.08 * nextWhoosh);
        nextWhoosh++;
      }
      flameT = Math.max(flameT, t * 0.6);
      if (t >= 1 && !launched) {
        launched = true;
        p.squash = 0;
        flameT = 1.4;
        ctx.audio.play('bigBoing', { pitch: 0.8 });
        ctx.audio.play('whoosh', { volume: 1, pitch: 1.3 });
        ctx.cameraRig.shake(0.5);
        confetti.burst(tmp.set(p.x, p.y + 0.5, p.z), 50);
        flight.visual.stretch = -0.5;
        flight.visual.kick(30);
      }
    },
    camera(f) {
      if (!launched) return { distance: 4.8, height: 1.8, fov: 56 };
      const k = Math.min(1, f.speed / 38);
      return { distance: 11 + k * 7, height: 4 + k * 5, fov: 66 + k * 22 };
    },
    onArrive(info: ArrivalInfo, f: Flight) {
      const apexUp = ROCKET.netBounces[bounceNo];
      if (bounceNo === 0) {
        const dist = Math.hypot(info.pos.x - launchFrom0.x, info.pos.z - launchFrom0.z);
        if (!practice) ctx.events.emit('stunt', { kind: 'launch', value: dist, stars: launchStars(info.rotations, info.upright) });
        ctx.events.emit('stamp:earned', { id: 'launchPads' });
        ctx.audio.play('bigBoing', { pitch: 0.95 });
        ctx.cameraRig.shake(0.45);
        confetti.burst(tmp.set(info.pos.x, info.pos.y + 0.8, info.pos.z), 170);
        if (!info.upright) f.flopAtEnd = true;
        netSquash = 1;
      } else {
        ctx.audio.play('boing', { pitch: 1.2 });
        netSquash = 0.5;
      }
      f.visual.stretch = -0.45;
      f.visual.kick(12);
      bounceNo++;
      if (apexUp === undefined) return null; // settled on the net: back to walking
      return { vx: 0, vy: Math.sqrt(2 * 22 * apexUp), vz: 0, endY: netLandY, dwell: 0.1, dip: 0.35 };
    },
    onEnd() {
      active = -1;
      for (const p of pads) p.squash = 0;
    },
  };

  function launchFrom(i: number): void {
    const p = pads[i];
    if (!p || flight.active || ctx.player.mode !== 'walk' || cooldown > 0) return;
    cooldown = ROCKET.cooldown;
    const ticket = gate();
    if (ticket === false) {
      // Locked: friendly wobble and a little hop back off the pad.
      p.wobble = ROCKET.wobble;
      ctx.audio.play('boing', { pitch: 0.7 });
      getStuntGate(ctx).toast({ icon: 'lock' });
      const away = Math.atan2(ctx.player.position.x - p.x, ctx.player.position.z - p.z);
      ctx.player.launch(tmp.set(Math.sin(away) * 3, 5.5, Math.cos(away) * 3));
      return;
    }
    practice = ticket === 'practice';
    active = i;
    launched = false;
    bounceNo = 0;
    nextWhoosh = 0;
    launchFrom0 = { x: p.x, z: p.z };
    ctx.player.position.set(p.x, p.y, p.z);
    ctx.player.yaw = Math.atan2(site.x - p.x, site.z - p.z);
    flight.begin('rocket', arcFor(i), hooks);
    if (!flight.active) active = -1;
  }

  function padUnderPlayer(): number {
    const pos = ctx.player.position;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      const d = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (d < ROCKET.padRadius - 0.1 && Math.abs(pos.y - p.y) < 0.7) return i;
      // The pad top is higher than the walk step, so running into its side also counts as
      // stepping on (launchFrom puts the player on top for the wind-up).
      if (d < ROCKET.padRadius + PLAYER.radius + 0.15 && pos.y > p.y - ROCKET.padTop - 0.3 && pos.y < p.y + 0.7) return i;
    }
    return -1;
  }

  function update(dt: number): void {
    clock += dt;
    cooldown = Math.max(0, cooldown - dt);
    const idx = padUnderPlayer();
    // Stepping on (standing, not flopping, not already flying) triggers the pad once.
    const here = ctx.player.grounded && ctx.player.mode === 'walk' && !flight.active ? idx : -1;
    if (here >= 0 && here !== prevPad) launchFrom(here);
    prevPad = here;

    // Pad animation: squash in the wind-up, pop on launch, wobble when locked, bobbing arrow.
    flameT = Math.max(0, flameT - dt * 1.5);
    pads.forEach((p, i) => {
      p.arrow += dt;
      p.model.arrow.position.y = 3.6 + Math.sin(p.arrow * 2.4) * 0.28;
      p.model.arrow.rotation.y = Math.sin(p.arrow * 1.7) * 0.08;
      let squash = p.squash;
      let shake = 0;
      if (p.wobble > 0) {
        p.wobble = Math.max(0, p.wobble - dt);
        const k = p.wobble / ROCKET.wobble;
        squash = 0.35 * Math.abs(Math.sin((1 - k) * 18)) * k;
        shake = Math.sin((1 - k) * 40) * 0.07 * k;
      } else if (i === active && !launched) {
        shake = Math.sin(p.squash * 90) * 0.05 * p.squash;
      }
      p.model.plate.position.y = ROCKET.padTop - 0.14 - squash * 0.3;
      p.model.plate.position.x = shake;
      for (const s of p.model.springs) s.scale.y = 1 - squash * 0.45;
      const on = i === active && flameT > 0.05;
      for (const fl of p.model.flames) {
        fl.visible = on;
        if (on) fl.scale.setScalar(0.4 + flameT * 0.9 + Math.sin(p.arrow * 40) * 0.08);
      }
    });

    // Net squash + flag flutter.
    netSquash *= Math.exp(-6 * dt);
    net.dome.scale.y = 1 - 0.28 * netSquash * Math.cos(netSquash * 6);
    net.flag.rotation.y = Math.sin(clock * 4) * 0.25;
    net.flag.rotation.z = Math.sin(clock * 6) * 0.05;
  }

  // Gem-worthy spots along the arc of the middle pad.
  {
    const mid = Math.floor(ROCKET.count / 2);
    const arc = arcFor(mid);
    const p = pads[mid];
    const sol = solveLaunch(site.x - p.x, netLandY - p.y, site.z - p.z, ROCKET.apexBase + ROCKET.apexPerMetre * Math.hypot(site.x - p.x, site.z - p.z));
    for (const [k, f] of [0.2, 0.4, 0.5, 0.6, 0.8].entries()) {
      const pt = arcPoint(p, { vx: arc.vx, vy: arc.vy, vz: arc.vz }, sol.time * f);
      thrillSpots.push({ position: new THREE.Vector3(pt.x, pt.y, pt.z), tag: `rocket${k}` });
    }
  }

  const info: RocketInfo = {
    net: { x: site.x, z: site.z, landY: netLandY, radius: netRadius, shortened: site.shortened, distance: site.distance },
    pads: pads.map((p) => ({ x: p.x, y: p.y, z: p.z })),
  };

  return {
    update,
    launchFrom,
    info,
    dispose() {
      for (const c of colliders) ctx.physics.removeCollider(c);
      root.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
