/**
 * Bungee bridge: E at the platform on the bridge deck → the cord clips to your ankles and you
 * step out onto the springboard → the board bobs (Space at the top of a bob = deeper dive; it
 * dives by itself after a few seconds) → swan dive towards −X → the cord catches you with a
 * spring-damper (2–3 big boings, the first rebound nearly back to the deck) while the stick sweeps
 * you round the fall line → the cord lowers you gently onto the landing mat on the shore. A winch
 * post there hauls you back up to the deck. R cancels safely onto the deck.
 *
 * The ride is an ExternalController (never taken from another ride: it only starts in walk mode);
 * the camera override is set only inside the controller and cleared on release.
 * Pure maths live in cord.ts. Gem-worthy points along the fall line are exported as `bungeeSpots`.
 */
import * as THREE from 'three';
import { CAMERA } from '../../config';
import type { ExternalController, GameContext, InputState } from '../../types';
import { createActionPrompt } from '../skydive/prompt';
import { follow, stickToWorld } from '../skydive/flight';
import { getStuntGate } from '../stuntGate';
import {
  BODY_HALF,
  CORD,
  depthStars,
  diveVelocity,
  hangTilt,
  hermite,
  planCord,
  plannedClearance,
  pumpPower,
  smooth01,
  stepCord,
  unwrapNear,
} from './cord';
import type { CordPlan, CordState, V3 } from './cord';
import { CordMesh } from './cordMesh';
import { createLandingModel, createPlatformModel } from './model';
import type { LandingModel, PlatformModel } from './model';
import { disposeTree } from './kit';

export type BungeePhase = 'idle' | 'attach' | 'windup' | 'fall' | 'lower' | 'landed' | 'winch';

/** A gem-worthy position (absolute, body-centre height) along the bungee fall line. */
export interface BungeeSpot {
  position: THREE.Vector3;
  tag: string;
}

/** Live array: cleared and refilled when the bungee is built (first playing frame). */
export const bungeeSpots: BungeeSpot[] = [];

/** Test hook (`window.__rgBungee`, only with `?test=1`). */
export interface BungeeTestApi {
  phase(): BungeePhase;
  /** Null until the first playing frame builds the platform. */
  info(): { board: [number, number, number]; anchor: [number, number, number]; landing: [number, number, number]; winch: [number, number, number]; deck: number; ground: number } | null;
  /** The last jump: deepest head height above the ground, depth below the deck, stars, guard hits. */
  last(): { minClearance: number; depth: number; stars: number; guarded: number; power: number } | null;
}

declare global {
  interface Window {
    __rgBungee?: BungeeTestApi;
  }
}

export interface Bungee {
  update(dt: number): void;
  dispose(): void;
}

const YAW_WEST = -Math.PI / 2;
const TIMES = { attach: 1.0, windupMax: 4, lower: 5, landed: 1.5, retract: 1.6, winchClip: 0.6, winchRise: 3.4, winchHop: 0.9 } as const;
const REACH = 1.7;
/** Camera yaw offset for the side-on view (from the south-west, looking north-east along the cord). */
const SIDE = -Math.PI / 2 - 0.35;

interface Built {
  platform: PlatformModel;
  landing: LandingModel;
  deck: number;
  edgeX: number;
  z: number;
  halfWidth: number;
  anchor: THREE.Vector3;
  /** Feet spot at the board tip. */
  tip: THREE.Vector3;
  /** Safe deck spot (cancel / winch arrival). */
  deckSpot: THREE.Vector3;
  landingSpot: THREE.Vector3;
  colliders: ReturnType<GameContext['physics']['addStaticBox']>[];
  gateCollider: ReturnType<GameContext['physics']['addStaticBox']> | null;
  removeInteract: () => void;
  removeWinch: () => void;
}

export function createBungee(ctx: GameContext): Bungee {
  bungeeSpots.length = 0;
  const player = ctx.player;
  const prompt = createActionPrompt(ctx.uiRoot);
  const cord = new CordMesh();
  ctx.scene.add(cord.mesh);

  let built: Built | null = null;
  let phase: BungeePhase = 'idle';
  let phaseT = 0;
  let power = 0.5;
  let plan: CordPlan = { rest: 12, k: 4, lowestCentre: 0 };
  const sim: CordState = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
  let stripes = 24;
  let visRest = 6;
  let bottoms = 0;
  let prevVy = 0;
  let minHead = Infinity;
  let guardHits = 0;
  let starsGiven = false;
  let lastJump: ReturnType<BungeeTestApi['last']> = null;
  let pitch = 0;
  let pitchV = 0;
  let roll = 0;
  let rollV = 0;
  let upright = 0; // 0 = hanging head-down, 1 = upright (harness at the back)
  const lowerFrom = new THREE.Vector3();
  const lowerV: V3 = { x: 0, y: 0, z: 0 };
  const attachFrom = new THREE.Vector3();
  const last = new THREE.Vector3();
  let hasLast = false;
  let retract = 1; // 0 → 1 while the free cord end flies back to the hook
  const retractFrom = new THREE.Vector3();
  const cordEnd = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tiltE = new THREE.Euler(0, 0, 0, 'XYZ');
  const yawQ = new THREE.Quaternion();
  const tiltQ = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let gateOpen = 0;
  let boardFlex = 0;
  let pulleySpin = 0;
  let cameraOwned = false;

  const ground = (x: number, z: number): number => Math.max(ctx.world.heightAt(x, z), ctx.world.waterLevel);

  // ── Build (first playing frame: the deck-edge search raycasts the bridge, whose colliders are
  // only queryable after the first physics step) ──
  function build(): Built {
    const a = ctx.world.anchors.bungee;
    const deck = a.position.y;
    const z = a.position.z;
    const down = new THREE.Vector3(0, -1, 0);
    // Walk west from the anchor along the deck until the deck ends.
    let edgeX = a.position.x - 1.75;
    for (let x = a.position.x; x > a.position.x - 8; x -= 0.05) {
      const hit = ctx.physics.raycast(new THREE.Vector3(x, deck + 0.6, z), down, 1.4);
      if (!hit || hit.point.y < deck - 0.4) {
        edgeX = x + 0.05;
        break;
      }
    }
    const halfWidth = 1.65;
    const anchor = new THREE.Vector3(edgeX - REACH - 0.65, deck + 4.4, z);
    const platform = createPlatformModel({ deck, edgeX, z, reach: REACH, halfWidth, anchor: anchor.clone().setY(deck + 4.7) });
    ctx.scene.add(platform.root);
    const landingAnchor = ctx.world.anchors.bungeeLanding.position;
    const lg = ctx.world.heightAt(landingAnchor.x, landingAnchor.z);
    const toBridge = new THREE.Vector2(a.position.x - landingAnchor.x, a.position.z - landingAnchor.z).normalize();
    const landing = createLandingModel(landingAnchor, lg, toBridge);
    ctx.scene.add(landing.root);

    const colliders = [
      // Board (walkable), side rails.
      ctx.physics.addStaticBox(new THREE.Vector3(edgeX - REACH / 2, deck - 0.15, z), new THREE.Vector3(REACH / 2, 0.15, halfWidth)),
      ctx.physics.addStaticBox(new THREE.Vector3(edgeX - REACH / 2, deck + 0.6, z - halfWidth - 0.12), new THREE.Vector3(REACH / 2 + 0.1, 0.6, 0.08)),
      ctx.physics.addStaticBox(new THREE.Vector3(edgeX - REACH / 2, deck + 0.6, z + halfWidth + 0.12), new THREE.Vector3(REACH / 2 + 0.1, 0.6, 0.08)),
      ctx.physics.addStaticCylinder(new THREE.Vector3(landingAnchor.x, lg + 0.16, landingAnchor.z), 0.16, 2.6),
    ];
    const tip = new THREE.Vector3(edgeX - REACH + 0.45, deck, z);
    const deckSpot = new THREE.Vector3(edgeX + 2.2, deck + 0.05, z);
    const landingSpot = new THREE.Vector3(landingAnchor.x, landing.top, landingAnchor.z);

    const b: Built = {
      platform,
      landing,
      deck,
      edgeX,
      z,
      halfWidth,
      anchor,
      tip,
      deckSpot,
      landingSpot,
      colliders,
      gateCollider: null,
      removeInteract: () => {},
      removeWinch: () => {},
    };
    setGate(b, true);
    b.removeInteract = ctx.interactions.add({
      id: 'bungee',
      position: () => tmp.set(edgeX + 1.2, deck + 1, z),
      radius: 3,
      icon: 'bungee',
      enabled: () => phase === 'idle' && retract >= 1 && player.mode === 'walk',
      onUse: () => startRide('attach'),
    });
    b.removeWinch = ctx.interactions.add({
      id: 'bungee-winch',
      position: () => landing.winch,
      radius: 3.2,
      icon: 'bungee',
      enabled: () => phase === 'idle' && retract >= 1 && player.mode === 'walk',
      onUse: () => startRide('winch'),
    });
    fillSpots(b);
    return b;
  }

  /** Gate closed = a collider across the board tip; open = removed (only during the ride). */
  function setGate(b: Built, closed: boolean): void {
    if (closed && !b.gateCollider) {
      b.gateCollider = ctx.physics.addStaticBox(new THREE.Vector3(b.edgeX - REACH + 0.05, b.deck + 0.6, b.z), new THREE.Vector3(0.08, 0.6, b.halfWidth));
    } else if (!closed && b.gateCollider) {
      ctx.physics.removeCollider(b.gateCollider);
      b.gateCollider = null;
    }
  }

  /** Sample the hands-off ride once to place gem-worthy spots on the real fall line. */
  function fillSpots(b: Built): void {
    bungeeSpots.length = 0;
    const p = 0.6;
    const start: V3 = { x: b.tip.x, y: b.deck + BODY_HALF, z: b.z };
    const vel = diveVelocity(YAW_WEST, p);
    const pl = planCord(b.anchor, start, vel, swingGround(b), plannedClearance(p));
    const s: CordState = { pos: { ...start }, vel: { ...vel } };
    const wanted = [8, 15, 22];
    let next = 0;
    let bottomDone = false;
    let pv = vel.y;
    for (let i = 0; i < 60 * 8; i++) {
      stepCord(s, b.anchor, pl, { x: 0, z: 0 }, ground, 1 / 60);
      if (next < wanted.length && s.pos.y <= b.deck - wanted[next]) {
        bungeeSpots.push({ position: new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z), tag: `bungeeFall${next + 1}` });
        next++;
      }
      if (!bottomDone && pv < 0 && s.vel.y >= 0) {
        bottomDone = true;
        // The deepest point, plus two to the sides at the same depth (reach them by steering).
        bungeeSpots.push({ position: new THREE.Vector3(s.pos.x, s.pos.y + 0.6, s.pos.z), tag: 'bungeeBottom' });
        bungeeSpots.push({ position: new THREE.Vector3(s.pos.x - 1, s.pos.y + 2.5, s.pos.z + 3.2), tag: 'bungeeSwingN' });
        bungeeSpots.push({ position: new THREE.Vector3(s.pos.x - 1, s.pos.y + 2.5, s.pos.z - 3.2), tag: 'bungeeSwingS' });
      }
      pv = s.vel.y;
    }
  }

  /** Highest ground inside the swing box (plans the cord for the worst case). */
  function swingGround(b: Built): number {
    let g = -Infinity;
    for (let dx = -CORD.boxWest - 1; dx <= CORD.boxEast + 1; dx += 1) {
      for (let dz = -CORD.boxSide - 1; dz <= CORD.boxSide + 1; dz += 1) g = Math.max(g, ground(b.anchor.x + dx, b.anchor.z + dz));
    }
    const hit = ctx.physics.raycast(tmp.copy(b.anchor).setY(b.anchor.y - 0.6), new THREE.Vector3(0, -1, 0), 80);
    if (hit) g = Math.max(g, hit.point.y);
    return g;
  }

  // ── Ride ──
  function enter(p: BungeePhase): void {
    phase = p;
    phaseT = 0;
  }

  function startRide(kind: 'attach' | 'winch'): void {
    const b = built;
    // Never take the player from another ride, vehicle or flop.
    if (!b || phase !== 'idle' || player.mode !== 'walk') return;
    attachFrom.copy(player.position);
    enter(kind);
    pitch = pitchV = roll = rollV = 0;
    upright = kind === 'winch' ? 1 : 0;
    retract = 1;
    player.setExternalController(controller);
    if ((player.mode as string) !== 'external') {
      enter('idle');
      return;
    }
    hasLast = false;
    ctx.audio.play('click');
    if (kind === 'attach') {
      setGate(b, false);
      player.yaw = YAW_WEST;
    }
  }

  function setCamera(o: Parameters<GameContext['cameraRig']['setOverride']>[0]): void {
    ctx.cameraRig.setOverride(o);
    cameraOwned = true;
  }

  function releaseCamera(): void {
    if (!cameraOwned) return;
    ctx.cameraRig.setOverride(null);
    cameraOwned = false;
  }

  /** Body centre → player feet position, and the cord attach point on the body. */
  function placeBody(c: V3): void {
    player.position.set(c.x, c.y - BODY_HALF, c.z);
    last.copy(player.position);
    hasLast = true;
  }

  function attachPoint(out: THREE.Vector3): THREE.Vector3 {
    // Feet when hanging head-down; the upper back when upright (harness).
    tiltE.set(pitch, 0, roll);
    tiltQ.setFromEuler(tiltE);
    yawQ.setFromAxisAngle(up, player.yaw);
    const ly = -BODY_HALF * (1 - upright) + 0.35 * upright;
    const lz = -0.22 * upright;
    out.set(0, ly, lz).applyQuaternion(tiltQ).applyQuaternion(yawQ);
    out.x += player.position.x;
    out.y += player.position.y + BODY_HALF;
    out.z += player.position.z;
    return out;
  }

  function poseSpring(targetPitch: number, targetRoll: number, dt: number, stiff = 26, damp = 8): void {
    pitchV += (stiff * (targetPitch - pitch) - damp * pitchV) * dt;
    pitch += pitchV * dt;
    rollV += (stiff * (targetRoll - roll) - damp * rollV) * dt;
    roll += rollV * dt;
    player.setTilt(pitch, roll);
  }

  function dive(b: Built): void {
    enter('fall');
    const start: V3 = { x: player.position.x, y: player.position.y + BODY_HALF, z: player.position.z };
    const vel = diveVelocity(YAW_WEST, power);
    plan = planCord(b.anchor, start, vel, swingGround(b), plannedClearance(power));
    sim.pos = { ...start };
    sim.vel = { ...vel };
    stripes = Math.round(plan.rest / 0.55);
    visRest = plan.rest;
    bottoms = 0;
    prevVy = vel.y;
    minHead = Infinity;
    guardHits = 0;
    starsGiven = false;
    pitchV = 2.5; // tip forward into the swan dive
    player.setVisualStretch(0);
    ctx.audio.play('jump');
    ctx.audio.play('whoosh', { pitch: 1.3, volume: 0.7 });
    prompt.hide();
  }

  function finishJump(b: Built): void {
    const depth = b.deck - (minHead + swingGroundCache);
    const maxDepth = b.deck - swingGroundCache - CORD.minClearance;
    const stars = depthStars(depth, maxDepth);
    lastJump = { minClearance: minHead, depth, stars, guarded: guardHits, power };
    if (starsGiven) return;
    starsGiven = true;
    if (stars > 0) {
      getStuntGate(ctx).stunt({ kind: 'bungee', value: Math.round(depth), stars });
      ctx.audio.play('star');
    }
  }
  let swingGroundCache = 0;

  const controller: ExternalController = {
    update(dt: number, input: Readonly<InputState>): boolean {
      const b = built;
      if (!b) return false;
      // Someone moved the player under us (teleport, test hook): give control back.
      if (hasLast && player.position.distanceToSquared(last) > 4) {
        hasLast = false;
        return false;
      }
      phaseT += dt;
      if (input.respawnPressed) {
        // Cancel safely: back onto the deck (or the shore mat if we were winching from there).
        const spot = phase === 'winch' && phaseT < TIMES.winchClip ? b.landingSpot : b.deckSpot;
        player.teleport(spot.clone().setY(spot.y + 0.05), phase === 'winch' && phaseT < TIMES.winchClip ? 0 : -YAW_WEST);
        ctx.events.emit('player:respawn', {});
        return false;
      }
      switch (phase) {
        case 'attach': {
          const k = smooth01(phaseT / TIMES.attach);
          player.position.lerpVectors(attachFrom, b.tip, k);
          player.position.y = b.deck + Math.sin(Math.PI * Math.min(1, phaseT / 0.5)) * 0.25 * (phaseT < 0.5 ? 1 : 0);
          player.yaw = YAW_WEST;
          player.setAnimation(k < 0.85 ? 'walk' : 'idle');
          last.copy(player.position);
          hasLast = true;
          setCamera({ distance: 6.5, height: 1.8, yawOffset: SIDE, fov: CAMERA.fov + 4 });
          if (phaseT >= TIMES.attach) enter('windup');
          return true;
        }
        case 'windup': {
          const pump = pumpPower(phaseT);
          boardFlex = 0.07 * (1 - pump) - 0.03 * pump;
          player.position.copy(b.tip);
          player.position.y = b.deck - (REACH - 0.45) * boardFlex + Math.max(0, pump - 0.75) * 0.9;
          player.setVisualStretch(-0.16 * (1 - pump) + 0.08 * pump);
          player.yaw = YAW_WEST;
          player.setAnimation(pump > 0.8 ? 'jump' : 'idle');
          last.copy(player.position);
          hasLast = true;
          prompt.show('jump', input.device === 'gamepad', pump);
          setCamera({ distance: 6.5, height: 1.6, yawOffset: SIDE, fov: CAMERA.fov + 6 });
          ctx.audio.setLoop('wind', 0.12, 0.7);
          const pressed = input.jumpPressed && phaseT > 0.25;
          if (pressed || phaseT >= TIMES.windupMax) {
            power = pressed ? pump : 0.55;
            swingGroundCache = swingGround(b);
            dive(b);
          }
          return true;
        }
        case 'fall': {
          boardFlex *= Math.exp(-6 * dt);
          const steer = stickToWorld(input.moveX, input.moveY, ctx.cameraRig.yaw);
          const r = stepCord(sim, b.anchor, plan, steer, ground, dt);
          if (r.guarded) guardHits++;
          placeBody(sim.pos);
          const head = sim.pos.y - BODY_HALF - ground(sim.pos.x, sim.pos.z);
          if (head < minHead) minHead = head;
          // Bottoms and peaks.
          if (prevVy < 0 && sim.vel.y >= 0) {
            bottoms++;
            cord.twang(0.35 / bottoms);
            ctx.cameraRig.shake(0.35 / bottoms);
            ctx.audio.play(bottoms === 1 ? 'bigBoing' : 'boing', { pitch: 0.75 + 0.1 * bottoms });
            ctx.audio.play('whoosh', { pitch: 1.6, volume: 0.45 });
            if (bottoms === 1) finishJump(b);
          }
          const peak = prevVy > 0 && sim.vel.y <= 0;
          prevVy = sim.vel.y;
          // Pose: line up with the cord, head down (the dive rotates forward into it).
          tmp.set(sim.pos.x - b.anchor.x, sim.pos.y - b.anchor.y, sim.pos.z - b.anchor.z).normalize();
          const t = hangTilt(tmp, player.yaw);
          poseSpring(unwrapNear(t.pitch, Math.PI), t.roll, dt);
          player.setAnimation(sim.vel.y > 2 ? 'jump' : 'fall');
          const speed = Math.hypot(sim.vel.x, sim.vel.y, sim.vel.z);
          const sf = Math.min(1, speed / 24);
          // Side-on from the south-west; above and looking down while plunging, level on the rebounds.
          const plunge = Math.max(0, Math.min(1, -sim.vel.y / 14));
          setCamera({ distance: 7.5 + 1.5 * sf, height: 1.5 + 4.5 * plunge, fov: CAMERA.fov + 12 + 8 * sf, yawOffset: SIDE - 0.25, lookAhead: 0.15 });
          ctx.audio.setLoop('wind', 0.2 + 0.8 * sf, 0.8 + 0.5 * sf);
          pulleySpin += (r.stretch > 0 ? 0 : speed) * dt * 3;
          // 2 boings, then lower from the next peak (or after a while, whatever happens).
          if ((peak && bottoms >= 2) || phaseT > 16) {
            if (!starsGiven) finishJump(b);
            enter('lower');
            lowerFrom.set(sim.pos.x, sim.pos.y, sim.pos.z);
            lowerV.x = sim.vel.x;
            lowerV.y = sim.vel.y;
            lowerV.z = sim.vel.z;
            ctx.audio.play('whoosh', { pitch: 0.8, volume: 0.4 });
          }
          return true;
        }
        case 'lower': {
          const to: V3 = { x: b.landingSpot.x, y: b.landingSpot.y + BODY_HALF, z: b.landingSpot.z };
          const p = hermite({ x: lowerFrom.x, y: lowerFrom.y, z: lowerFrom.z }, lowerV, to, TIMES.lower, phaseT);
          p.y = Math.max(p.y, ground(p.x, p.z) + BODY_HALF);
          placeBody(p);
          // Flip upright on the way down (a forward roll back to standing).
          const k = smooth01((phaseT - TIMES.lower * 0.45) / (TIMES.lower * 0.4));
          upright = k;
          tmp.set(p.x - b.anchor.x, p.y - b.anchor.y, p.z - b.anchor.z).normalize();
          const t = hangTilt(tmp, player.yaw);
          const hang = unwrapNear(t.pitch, Math.PI);
          poseSpring(hang + (Math.PI * 2 - hang) * k, t.roll * (1 - k), dt, 30, 9);
          visRest = Math.max(visRest, b.anchor.distanceTo(tmp.set(p.x, p.y, p.z)) * 0.92);
          player.setAnimation(k > 0.6 ? 'wave' : 'fall');
          const sf = Math.min(1, Math.hypot(lowerV.x, lowerV.y, lowerV.z) / 24) * (1 - phaseT / TIMES.lower);
          ctx.audio.setLoop('wind', 0.12 + 0.4 * sf, 0.7);
          setCamera({ distance: 9, height: 3, fov: CAMERA.fov + 8 * (1 - k), yawOffset: (SIDE - 0.25) * (1 - k) + 0.5 * k });
          if (phaseT >= TIMES.lower) {
            enter('landed');
            pitch = 0;
            roll = 0;
            pitchV = rollV = 0;
            player.setTilt(0, 0);
            upright = 1;
            ctx.audio.play('land');
            ctx.audio.setLoop('wind', 0);
            player.setAnimation('cheer');
            player.setVisualStretch(-0.25);
            getStuntGate(ctx).toast({ icon: 'bungee', text: `${Math.round(lastJump?.depth ?? 0)} m` });
          }
          return true;
        }
        case 'landed': {
          const hop = phaseT < 0.35 ? Math.sin((Math.PI * phaseT) / 0.35) * 0.3 : 0;
          player.position.copy(b.landingSpot);
          player.position.y += hop;
          last.copy(player.position);
          hasLast = true;
          player.setVisualStretch(phaseT < 0.3 ? -0.25 * (1 - phaseT / 0.3) : 0);
          player.setAnimation('cheer');
          setCamera({ distance: 7.5, height: 2.6, yawOffset: 0.5 });
          if (phaseT > 0.35 && retract >= 1) startRetract();
          return phaseT < TIMES.landed;
        }
        case 'winch': {
          // Clip on, rise up past the platform, then hop onto the deck.
          const clipT = TIMES.winchClip;
          const riseT = TIMES.winchRise;
          const hopT = TIMES.winchHop;
          upright = 1;
          player.yaw = Math.atan2(b.anchor.x - attachFrom.x, b.anchor.z - attachFrom.z);
          visRest = b.anchor.distanceTo(attachPoint(tmp)) * 0.95;
          stripes = Math.round(visRest / 0.55);
          if (phaseT < clipT) {
            player.position.copy(attachFrom);
            player.setAnimation('idle');
          } else if (phaseT < clipT + riseT) {
            const k = smooth01((phaseT - clipT) / riseT);
            const top = new THREE.Vector3(b.anchor.x + 0.4, b.deck + 1.2, b.z);
            player.position.lerpVectors(attachFrom, top, k);
            // Swing in under the arm on the way up.
            player.position.x += Math.sin(Math.PI * k) * -1.5;
            player.setAnimation('jump');
            pulleySpin -= dt * 10;
            ctx.audio.setLoop('wind', 0.1, 0.6);
          } else {
            const k = smooth01((phaseT - clipT - riseT) / hopT);
            const from = new THREE.Vector3(b.anchor.x + 0.4, b.deck + 1.2, b.z);
            player.position.lerpVectors(from, b.deckSpot, k);
            player.position.y += Math.sin(Math.PI * k) * 1.2;
            player.yaw = -YAW_WEST;
            player.setAnimation(k < 0.8 ? 'jump' : 'cheer');
            if (phaseT - dt < clipT + riseT) ctx.audio.play('jump');
          }
          last.copy(player.position);
          hasLast = true;
          setCamera({ distance: 8, height: 3, yawOffset: 0.4, fov: CAMERA.fov + 4 });
          if (phaseT >= clipT + riseT + hopT) {
            ctx.audio.play('land');
            ctx.audio.setLoop('wind', 0);
            startRetract();
            return false;
          }
          return true;
        }
        default:
          return false;
      }
    },
    onRelease() {
      const wasActive = phase !== 'idle';
      prompt.hide();
      ctx.audio.setLoop('wind', 0);
      releaseCamera();
      if (wasActive) {
        if (retract >= 1) startRetract();
        phase = 'idle';
        phaseT = 0;
      }
      pitch = pitchV = roll = rollV = 0;
      upright = 0;
      boardFlex = 0;
      if (built) setGate(built, true);
      // Hand back with no leftover ride velocity.
      player.launch(new THREE.Vector3(0, 0, 0));
    },
  };

  function startRetract(): void {
    if (!built) return;
    retractFrom.copy(cordEnd);
    retract = 0;
  }

  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase !== 'playing') {
      ctx.audio.setLoop('wind', 0);
      prompt.hide();
    }
    if (e.phase === 'title' && phase !== 'idle') player.setExternalController(null);
    if (e.phase === 'title' || (e.phase === 'playing' && e.previous === 'title')) retract = 1;
  });

  if (ctx.testMode && typeof window !== 'undefined') {
    const arr = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];
    window.__rgBungee = {
      phase: () => phase,
      info: () =>
        built
          ? {
              board: arr(built.tip),
              anchor: arr(built.anchor),
              landing: arr(built.landingSpot),
              winch: arr(built.landing.winch),
              deck: built.deck,
              ground: swingGround(built),
            }
          : null,
      last: () => lastJump,
    };
  }

  // ── Per-frame visuals (after the core controller) ──
  function drawCord(dt: number): void {
    const b = built;
    if (!b) return;
    const top = b.anchor;
    if (retract < 1) {
      drawRetract(dt);
    } else if (phase === 'idle') {
      // Hanging from the pulley to the hook on the post, with a gentle sag.
      cordEnd.copy(b.platform.hook);
      cord.update(top, cordEnd, top.distanceTo(cordEnd) * 1.25, 12, dt);
    } else if (phase === 'attach') {
      // Clipping on: the free end travels from the hook to the ankles.
      cordEnd.lerpVectors(b.platform.hook, attachPoint(tmp), smooth01(phaseT / (TIMES.attach * 0.7)));
      const d = top.distanceTo(cordEnd);
      cord.update(top, cordEnd, d * 1.2, Math.round(d / 0.55), dt);
    } else if (phase === 'windup') {
      attachPoint(cordEnd);
      cord.update(top, cordEnd, plan.rest, Math.round(plan.rest / 0.55), dt);
    } else {
      attachPoint(cordEnd);
      cord.update(top, cordEnd, visRest, stripes, dt);
    }
  }

  function drawRetract(dt: number): void {
    const b = built;
    if (!b) return;
    retract = Math.min(1, retract + dt / TIMES.retract);
    const k = smooth01(retract);
    cordEnd.lerpVectors(retractFrom, b.platform.hook, k);
    cordEnd.y += Math.sin(Math.PI * k) * 3;
    pulleySpin -= dt * 12 * (1 - k);
    const d = b.anchor.distanceTo(cordEnd);
    cord.update(b.anchor, cordEnd, d * (1 + 0.25 * k), Math.max(12, Math.round(d / 0.55)), dt);
  }

  return {
    update(dt) {
      built ??= build();
      const b = built;
      if (phase !== 'idle' && player.mode !== 'external') {
        // Control was taken away without our onRelease noticing (should not happen): tidy up.
        phase = 'idle';
        releaseCamera();
      }
      drawCord(dt);
      // Gate swings up for the dive; the board flexes.
      const wantGate = phase === 'attach' || phase === 'windup' || phase === 'fall' ? 1 : 0;
      gateOpen += (wantGate - gateOpen) * follow(6, dt);
      b.platform.gate.rotation.x = -gateOpen * 1.45;
      b.platform.board.rotation.z = boardFlex;
      b.platform.pulley.rotation.z = pulleySpin;
    },
    dispose() {
      offPhase();
      if (phase !== 'idle') player.setExternalController(null);
      releaseCamera();
      prompt.dispose();
      cord.dispose();
      if (built) {
        built.removeInteract();
        built.removeWinch();
        for (const c of built.colliders) ctx.physics.removeCollider(c);
        setGate(built, false);
        disposeTree(built.platform.root);
        disposeTree(built.landing.root);
        built = null;
      }
      bungeeSpots.length = 0;
      if (ctx.testMode && typeof window !== 'undefined') delete window.__rgBungee;
    },
  };
}
