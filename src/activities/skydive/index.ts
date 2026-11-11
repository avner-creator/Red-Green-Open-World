/**
 * Hot-air balloon skydive: E at the basket → ride up to BALLOON.topHeight → jump (Space, or
 * automatically) → belly-down freefall with camera-relative steering through the skydive gem
 * trail → parachute (Space, or automatically at BALLOON.autoChuteHeight) → glide through the hoops
 * → soft touchdown on the landing rings. The balloon then floats back down to its pad.
 * The ride is an ExternalController; the pure flight maths live in flight.ts.
 */
import * as THREE from 'three';
import { BALLOON, CAMERA } from '../../config';
import type { ExternalController, GameContext, InputState } from '../../types';
import { BALLOON_DIMS, createBalloonModel } from './balloonModel';
import { createCanopyModel } from './canopyModel';
import { createPadModel } from './padModel';
import {
  SKY,
  ascentHeight,
  easeInOut,
  follow,
  freefallAssistSteer,
  glideStars,
  nextBelow,
  ringStars,
  shouldOpenChute,
  stepCanopy,
  stepFreefall,
  stickToWorld,
  updateAssist,
} from './flight';
import type { CanopyState, V3 } from './flight';
import { createWindStreaks } from './fx';
import { createActionPrompt } from './prompt';
import { HOOPS, createLandingRings } from './rings';
import { segmentSphereHit } from '../gemLogic';

export type RidePhase = 'idle' | 'board' | 'ascent' | 'top' | 'freefall' | 'canopy' | 'landed';
type BalloonPhase = 'parked' | 'carrying' | 'return';

export interface Skydive {
  update(dt: number): void;
  readonly phase: RidePhase;
  dispose(): void;
}

const DECK = { radius: 2.4, height: 0.14 } as const;
const BELLY_PITCH = 1.3;

/** Read-only ride view for glasses add-ons (src/activities/glasses/weave/chute). */
export interface SkydiveView { readonly phase: RidePhase; readonly heightAboveGround: number; readonly fallTime: number }
const views = new WeakMap<GameContext, SkydiveView>();
export const getSkydiveView = (ctx: GameContext): SkydiveView | null => views.get(ctx) ?? null;

export function createSkydive(ctx: GameContext): Skydive {
  const anchor = ctx.world.anchors.balloon;
  const pad = anchor.position.clone();
  pad.y = ctx.world.heightAt(pad.x, pad.z);
  const floorY = pad.y + DECK.height + 0.1;
  const ringAnchor = ctx.world.anchors.landingRings.position;
  const toRings = new THREE.Vector2(ringAnchor.x - pad.x, ringAnchor.z - pad.z);

  // Drift target at the top: right above the first (highest) skydive gem, else a little along the
  // route to the rings.
  const trail = ctx.world.gemSpots.filter((s) => s.tag === 'skydive').map((s) => s.position);
  /** The trail highest first: hands-off freefall drifts from gem to gem. */
  const trailDown = [...trail].sort((a, b) => b.y - a.y);
  const highest = trail.reduce<THREE.Vector3 | null>((best, p) => (!best || p.y > best.y ? p : best), null);
  const drift = new THREE.Vector2(pad.x, pad.z).addScaledVector(toRings.clone().normalize(), 6);
  if (highest && Math.hypot(highest.x - pad.x, highest.z - pad.z) < 30) drift.set(highest.x, highest.z);

  // ── Scene objects ──
  const model = createBalloonModel();
  model.root.position.set(pad.x, floorY, pad.z);
  model.root.rotation.y = Math.atan2(toRings.x, toRings.y);
  ctx.scene.add(model.root);

  // Deck + tether ropes (2 draws, see padModel).
  const padModel = createPadModel({
    radius: DECK.radius,
    height: DECK.height,
    yaw: model.root.rotation.y,
    ropeTopY: BALLOON_DIMS.throatY - 0.9 + floorY - pad.y,
    groundAt: (x, z) => ctx.world.heightAt(pad.x + x, pad.z + z) - pad.y,
  });
  const padGroup = padModel.group;
  padGroup.position.copy(pad);
  ctx.scene.add(padGroup);
  const tethers = padModel.tethers;

  // Colliders: the deck (walkable) and the basket while it is parked.
  const deckCollider = ctx.physics.addStaticCylinder(new THREE.Vector3(pad.x, pad.y + DECK.height / 2, pad.z), DECK.height / 2, DECK.radius);
  const basketHalf = new THREE.Vector3(BALLOON_DIMS.basketHalf, BALLOON_DIMS.basketHeight / 2, BALLOON_DIMS.basketHalf);
  const basketQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), model.root.rotation.y);
  let basketCollider: ReturnType<GameContext['physics']['addStaticBox']> | null = null;
  const addBasketCollider = (): void => {
    if (basketCollider) return;
    basketCollider = ctx.physics.addStaticBox(new THREE.Vector3(pad.x, floorY + BALLOON_DIMS.basketHeight / 2 - 0.1, pad.z), basketHalf, basketQ);
  };
  const removeBasketCollider = (): void => {
    if (!basketCollider) return;
    ctx.physics.removeCollider(basketCollider);
    basketCollider = null;
  };
  addBasketCollider();

  const canopy = createCanopyModel();
  canopy.root.visible = false;
  canopy.root.rotation.order = 'YXZ';
  ctx.scene.add(canopy.root);
  const streaks = createWindStreaks(ctx.scene);
  const rings = createLandingRings(ctx, toRings);
  const prompt = createActionPrompt(ctx.uiRoot);

  // ── State ──
  let ride: RidePhase = 'idle';
  let balloon: BalloonPhase = 'parked';
  let balloonT = 0; // seconds in the current balloon motion
  let returnFrom = new THREE.Vector3();
  const balloonPos = new THREE.Vector3(pad.x, floorY, pad.z);
  let phaseT = 0;
  let time = 0;
  let driven = false;
  let burner = 0;
  let burnTimer = 0;
  const boardFrom = new THREE.Vector3();
  const pos: V3 = { x: 0, y: 0, z: 0 };
  const vel: V3 = { x: 0, y: 0, z: 0 };
  const canopyState: CanopyState = { yaw: 0, turn: 0 };
  let fallT = 0;
  let agl = 0;
  views.set(ctx, { get phase() { return ride; }, get heightAboveGround() { return agl; }, get fallTime() { return fallT; } });
  let pitch = 0;
  let pitchV = 0;
  let bank = 0;
  let yawRate = 0;
  let canopyOpenT = 0;
  let glideDist = 0;
  const prevChest = new THREE.Vector3();
  const curChest = new THREE.Vector3();
  const velVec = new THREE.Vector3();
  const homeXZ = { x: ringAnchor.x, z: ringAnchor.z };
  const ringTarget: V3 = { x: ringAnchor.x, y: ctx.world.heightAt(ringAnchor.x, ringAnchor.z), z: ringAnchor.z };

  const surfaceBelow = (x: number, y: number, z: number): { y: number; water: boolean } => {
    const terrain = ctx.world.heightAt(x, z);
    const water = ctx.world.waterLevel;
    let top = Math.max(terrain, water);
    if (y - top < 12) {
      const hit = ctx.physics.raycast(new THREE.Vector3(x, y + 1.5, z), new THREE.Vector3(0, -1, 0), 16);
      if (hit && hit.point.y > top) top = hit.point.y;
    }
    return { y: top, water: !ctx.world.isLand(x, z) && top <= water + 0.01 };
  };

  // ── Balloon motion ──
  function placeBalloon(dt: number): void {
    const sway = balloon === 'parked' ? 1 : 0.6;
    model.envelope.rotation.set(Math.sin(time * 0.7) * 0.018 * sway, 0, Math.sin(time * 0.53 + 1) * 0.022 * sway);
    model.basket.rotation.set(balloon === 'parked' ? 0 : Math.sin(time * 0.9) * 0.02, 0, balloon === 'parked' ? 0 : Math.sin(time * 0.75 + 2) * 0.025);
    model.root.position.copy(balloonPos);
    tethers.visible = balloon === 'parked';
    // Burner: roaring bursts while climbing, short puffs on the way down, pilot light when parked.
    let want = 0;
    if (balloon === 'carrying' && (ride === 'ascent' || ride === 'board')) {
      burnTimer += dt;
      const cyc = burnTimer % 2.2;
      want = cyc < 1.5 ? 1 : 0;
      if (cyc < dt && ride === 'ascent') ctx.audio.play('whoosh', { pitch: 0.55, volume: 0.9 });
    } else if (balloon === 'return') {
      burnTimer += dt;
      want = burnTimer % 4 < 0.6 ? 0.7 : 0;
    }
    burner += (want - burner) * follow(want > burner ? 14 : 6, dt);
    model.setBurner(burner, time);
  }

  function advanceBalloon(dt: number): void {
    balloonT += dt;
    if (balloon === 'carrying') {
      const t = ride === 'board' ? 0 : Math.min(balloonT, BALLOON.ascentSeconds);
      const k = easeInOut(t / BALLOON.ascentSeconds);
      balloonPos.set(pad.x + (drift.x - pad.x) * k, floorY + ascentHeight(t), pad.z + (drift.y - pad.z) * k);
      // Gentle bob at the top.
      if (ride === 'top') balloonPos.y += Math.sin(phaseT * 1.3) * 0.15;
    } else if (balloon === 'return') {
      const k = easeInOut(balloonT / SKY.returnSeconds);
      balloonPos.set(returnFrom.x + (pad.x - returnFrom.x) * k, returnFrom.y + (floorY - returnFrom.y) * k, returnFrom.z + (pad.z - returnFrom.z) * k);
      if (k >= 1) {
        balloon = 'parked';
        balloonPos.set(pad.x, floorY, pad.z);
        addBasketCollider();
      }
    }
    placeBalloon(dt);
  }

  function startReturn(): void {
    if (balloon !== 'carrying') return;
    balloon = 'return';
    balloonT = 0;
    burnTimer = 0;
    returnFrom = balloonPos.clone();
  }

  function parkNow(): void {
    balloon = 'parked';
    balloonT = 0;
    balloonPos.set(pad.x, floorY, pad.z);
    addBasketCollider();
    placeBalloon(0);
  }

  // ── Rider ──
  const player = ctx.player;

  /** Belly-down / swing pose: tilts the body about its centre, so pickups stay on the body. */
  function setPose(pitchX: number, roll: number): void {
    player.setTilt(pitchX, roll);
  }

  function cleanup(): void {
    ride = 'idle';
    prompt.hide();
    streaks.hide();
    canopy.root.visible = false;
    ctx.audio.setLoop('wind', 0);
    ctx.cameraRig.setOverride(null);
    player.setTilt(0, 0);
    pitch = 0;
    pitchV = 0;
    bank = 0;
  }

  function enterPhase(p: RidePhase): void {
    ride = p;
    phaseT = 0;
  }

  function jump(): void {
    enterPhase('freefall');
    startReturn();
    fallT = 0;
    canopyState.assist = 1;
    canopyState.idle = SKY.assistReturnDelay;
    // Face the next part of the trail (or the rings) and hop over the rim.
    const yaw = Math.atan2(ringAnchor.x - balloonPos.x, ringAnchor.z - balloonPos.z);
    player.yaw = yaw;
    pos.x = balloonPos.x;
    pos.y = balloonPos.y + 0.2;
    pos.z = balloonPos.z;
    vel.x = Math.sin(yaw) * SKY.hopForward;
    vel.y = SKY.hopUp;
    vel.z = Math.cos(yaw) * SKY.hopForward;
    pitch = 0.3;
    pitchV = 0;
    ctx.audio.play('jump');
    ctx.audio.play('whoosh', { pitch: 1.2, volume: 0.6 });
    player.setAnimation('fall');
  }

  function openChute(): void {
    enterPhase('canopy');
    canopyOpenT = 0;
    canopyState.yaw = player.yaw;
    canopyState.turn = 0;
    glideDist = 0;
    pitchV = -3.5; // the jolt swings the body upright with a little overshoot
    canopy.root.visible = true;
    ctx.audio.play('chute');
    ctx.cameraRig.shake(0.45);
    player.setAnimation('jump');
    prompt.hide();
  }

  function touchdown(surfaceY: number, water: boolean): boolean {
    pos.y = surfaceY;
    if (water) {
      // Normal splash/respawn: hand back to the walk controller just above the water.
      return false;
    }
    enterPhase('landed');
    player.setAnimation('cheer');
    ctx.audio.play('land');
    ctx.cameraRig.shake(0.15);
    const dist = Math.hypot(pos.x - ringAnchor.x, pos.z - ringAnchor.z);
    const stars = ringStars(dist);
    if (stars > 0) {
      ctx.events.emit('stunt', { kind: 'bullseye', value: stars, stars });
      ctx.audio.play('star');
    }
    const glide = Math.round(glideDist);
    if (glide >= SKY.glideStars[0]) {
      ctx.events.emit('stunt', { kind: 'longGlide', value: glide, stars: glideStars(glide) });
      ctx.events.emit('ui:toast', { icon: 'parachute', text: `${glide} m` });
    }
    return true;
  }

  function checkHoops(): void {
    curChest.set(pos.x, pos.y + 0.85, pos.z);
    rings.hoops.forEach((h, i) => {
      if (h.collected) return;
      if (segmentSphereHit(prevChest, curChest, h.center, HOOPS.pickup)) {
        rings.collect(i);
        ctx.audio.play('gem', { pitch: 1.1 + i * 0.1 });
        ctx.audio.play('whoosh', { pitch: 1.4, volume: 0.5 });
        ctx.events.emit('stunt', { kind: 'bullseye', value: 0, stars: 1 });
      }
    });
    prevChest.copy(curChest);
  }

  function respawnAtPad(): void {
    const side = model.root.rotation.y + Math.PI;
    const x = pad.x + Math.sin(side) * (DECK.radius + 1.6);
    const z = pad.z + Math.cos(side) * (DECK.radius + 1.6);
    player.teleport(new THREE.Vector3(x, ctx.world.heightAt(x, z) + 0.05, z), side + Math.PI);
    ctx.events.emit('player:respawn', {});
  }

  const controller: ExternalController = {
    update(dt: number, input: Readonly<InputState>): boolean {
      phaseT += dt;
      if (input.respawnPressed) {
        if (balloon === 'carrying') startReturn();
        respawnAtPad();
        return false;
      }
      const ascentFrac = Math.min(1, (balloonPos.y - floorY) / BALLOON.topHeight);
      switch (ride) {
        case 'board': {
          advanceBalloon(dt);
          driven = true;
          const k = Math.min(1, phaseT / SKY.boardSeconds);
          player.position.lerpVectors(boardFrom, balloonPos, easeInOut(k));
          player.position.y += Math.sin(Math.PI * k) * 1.3;
          player.setAnimation('jump');
          ctx.cameraRig.setOverride({ distance: 9, height: 4 });
          if (k >= 1) {
            enterPhase('ascent');
            balloonT = 0;
            burnTimer = 0;
            player.setAnimation('wave');
          }
          return true;
        }
        case 'ascent': {
          advanceBalloon(dt);
          driven = true;
          player.position.copy(balloonPos);
          if (phaseT > 2.5) player.setAnimation('idle');
          // Slow reveal orbit round the island; it eases in with the climb and out near the top.
          const orbit = SKY.ascentOrbitRate * Math.sin(Math.PI * Math.min(1, balloonT / BALLOON.ascentSeconds));
          // Wide reveal mid-climb, then back in so the hero stays big on screen at the top.
          const reveal = Math.sin(Math.PI * Math.min(1, ascentFrac / 0.85));
          ctx.cameraRig.setOverride({ distance: 9 + 15 * reveal - 2 * ascentFrac, height: 4 + 8 * reveal - 0.6 * ascentFrac, fov: CAMERA.fov + 6 * ascentFrac, orbitRate: orbit });
          ctx.audio.setLoop('wind', 0.12 + 0.2 * ascentFrac, 0.7);
          if (balloonT >= BALLOON.ascentSeconds) {
            enterPhase('top');
            player.setAnimation('wave');
          }
          return true;
        }
        case 'top': {
          advanceBalloon(dt);
          driven = true;
          player.position.copy(balloonPos);
          ctx.audio.setLoop('wind', 0.3, 0.7);
          // Swing round behind the rider (facing the rings) so the jump and steering line up.
          ctx.cameraRig.setOverride({ distance: 7, height: 3.4, fov: CAMERA.fov + 6, yawOffset: 0 });
          prompt.show('jump', input.device === 'gamepad', phaseT / SKY.autoJumpSeconds);
          if ((input.jumpPressed && phaseT > 0.3) || phaseT >= SKY.autoJumpSeconds) {
            prompt.hide();
            jump();
            prevChest.set(pos.x, pos.y + 0.85, pos.z);
          }
          return true;
        }
        case 'freefall': {
          fallT += dt;
          const steer = stickToWorld(input.moveX, input.moveY, ctx.cameraRig.yaw);
          // Hands-off: drift gently along the gem trail (blended out by any stick input).
          const w = updateAssist(canopyState, Math.hypot(steer.x, steer.z), dt);
          if (w > 0) {
            const assist = freefallAssistSteer(pos, vel, nextBelow(trailDown, pos.y + 0.85) ?? ringTarget);
            steer.x += assist.x * w;
            steer.z += assist.z * w;
          }
          stepFreefall(pos, vel, steer, dt);
          const surf = surfaceBelow(pos.x, pos.y, pos.z);
          agl = pos.y - surf.y;
          // Face the direction of travel; bank into turns.
          const hs = Math.hypot(vel.x, vel.z);
          let rate = 0;
          if (hs > 3) {
            const want = Math.atan2(vel.x, vel.z);
            let d = (want - player.yaw) % (Math.PI * 2);
            if (d > Math.PI) d -= Math.PI * 2;
            if (d < -Math.PI) d += Math.PI * 2;
            rate = d * 3;
            player.yaw += rate * dt;
          }
          yawRate += (rate - yawRate) * follow(6, dt);
          bank += (Math.max(-0.7, Math.min(0.7, -yawRate * 0.35)) - bank) * follow(5, dt);
          pitch += (BELLY_PITCH - pitch) * follow(3, dt);
          setPose(pitch + Math.sin(time * 9) * 0.03, bank + Math.sin(time * 7.3) * 0.04);
          player.position.set(pos.x, pos.y, pos.z);
          player.setAnimation('fall');
          const speed = Math.hypot(vel.x, vel.y, vel.z);
          const sf = Math.min(1, speed / SKY.terminal);
          // Hero framing: behind and above (~40° down) so the spread-eagle pose reads, with the
          // trail ahead, the island below and the horizon at the top of the frame.
          ctx.cameraRig.setOverride({ distance: 4.6, height: 3.9, fov: CAMERA.fov + 6 + 6 * sf, lookAhead: 0.3, yawOffset: 0 });
          ctx.audio.setLoop('wind', 0.25 + 0.75 * sf, 0.8 + 0.6 * sf);
          streaks.update(dt, player.position, velVec.set(vel.x, vel.y, vel.z), sf);
          if (fallT > SKY.chuteLockout) prompt.show('chute', input.device === 'gamepad', null);
          checkHoops();
          if (agl <= 0) return touchdown(surf.y, surf.water);
          if (shouldOpenChute(agl, fallT, input.jumpPressed)) openChute();
          return true;
        }
        case 'canopy': {
          canopyOpenT += dt;
          const steer = stickToWorld(input.moveX, input.moveY, ctx.cameraRig.yaw);
          const surfNow = surfaceBelow(pos.x, pos.y, pos.z);
          stepCanopy(pos, vel, canopyState, steer, homeXZ, pos.y - surfNow.y, dt);
          glideDist += Math.hypot(vel.x, vel.z) * dt;
          player.yaw = canopyState.yaw;
          // Jolt: spring from belly-down to upright with an overshoot, then a gentle pendulum.
          pitchV += (-40 * pitch - 5 * pitchV) * dt;
          pitch += pitchV * dt;
          bank += (Math.max(-0.45, Math.min(0.45, -canopyState.turn * 0.4)) - bank) * follow(3, dt);
          setPose(pitch + Math.sin(time * 1.7) * 0.03, bank);
          player.position.set(pos.x, pos.y, pos.z);
          // Canopy: inflate with an overshoot, hang above the shoulders, swing with turns.
          const k = Math.min(1, canopyOpenT / 0.7);
          const inflate = 1 + Math.sin(k * Math.PI) * 0.12 * (1 - k);
          canopy.root.visible = true;
          canopy.root.position.set(pos.x, pos.y + 1.45, pos.z);
          canopy.root.rotation.set(-0.12 + Math.sin(time * 1.3) * 0.02, player.yaw, -bank * 0.6);
          canopy.root.scale.set(0.15 + 0.85 * easeInOut(k) * inflate, 0.35 + 0.65 * easeInOut(k), 0.3 + 0.7 * easeInOut(k));
          ctx.cameraRig.setOverride({ distance: 15, height: 0.6, fov: CAMERA.fov + 10 });
          const sf = Math.min(1, Math.hypot(vel.x, vel.y, vel.z) / SKY.terminal);
          ctx.audio.setLoop('wind', 0.12 + 0.6 * sf, 0.7 + 0.3 * sf);
          streaks.update(dt, player.position, velVec.set(vel.x, vel.y, vel.z), Math.max(0, sf - 0.3));
          checkHoops();
          const surf = surfaceBelow(pos.x, pos.y, pos.z);
          if (pos.y <= surf.y) return touchdown(surf.y, surf.water);
          return true;
        }
        case 'landed': {
          const hop = phaseT < 0.4 ? Math.sin((Math.PI * phaseT) / 0.4) * 0.35 : 0;
          player.position.set(pos.x, pos.y + hop, pos.z);
          pitch += (0 - pitch) * follow(10, dt);
          bank += (0 - bank) * follow(10, dt);
          setPose(pitch, bank);
          player.setAnimation('cheer');
          // Canopy collapses behind the rider.
          const k = Math.min(1, phaseT / 0.9);
          canopy.root.rotation.x = -0.12 - 1.35 * easeInOut(k);
          canopy.root.scale.y = Math.max(0.05, 1 - 0.8 * k);
          if (k >= 1) canopy.root.visible = false;
          streaks.hide();
          ctx.audio.setLoop('wind', 0);
          ctx.cameraRig.setOverride({ distance: 7.5, height: 2.6 });
          return phaseT < SKY.landedSeconds;
        }
        default:
          return false;
      }
    },
    onRelease() {
      if (balloon === 'carrying') startReturn();
      cleanup();
      // Hand back on the ground with no leftover ride velocity.
      player.launch(new THREE.Vector3(0, 0, 0));
    },
  };

  const removeInteract = ctx.interactions.add({
    id: 'balloon',
    position: () => new THREE.Vector3(balloonPos.x, balloonPos.y + 1, balloonPos.z),
    radius: 3.3,
    icon: 'balloon',
    enabled: () => ride === 'idle' && balloon === 'parked',
    onUse() {
      if (ride !== 'idle' || balloon !== 'parked') return;
      if (!ctx.economy.payTicket('balloon')) return;
      boardFrom.copy(player.position);
      removeBasketCollider();
      rings.reset();
      balloon = 'carrying';
      balloonT = 0;
      burnTimer = 0;
      enterPhase('board');
      player.yaw = model.root.rotation.y;
      player.setExternalController(controller);
      ctx.audio.play('jump');
    },
  });

  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase !== 'playing') {
      ctx.audio.setLoop('wind', 0);
      prompt.hide();
    }
    if (e.phase === 'title') {
      // The player's own respawn releases the ride; make sure the balloon is home too.
      if (ride !== 'idle') player.setExternalController(null);
      cleanup();
      parkNow();
      rings.reset();
    }
  });

  placeBalloon(0);

  return {
    get phase() {
      return ride;
    },
    update(dt) {
      time += dt;
      if (!driven && balloon !== 'parked') advanceBalloon(dt);
      else if (!driven) placeBalloon(dt);
      driven = false;
      rings.update(dt);
    },
    dispose() {
      views.delete(ctx);
      offPhase();
      removeInteract();
      if (ride !== 'idle') player.setExternalController(null);
      cleanup();
      removeBasketCollider();
      ctx.physics.removeCollider(deckCollider);
      model.dispose();
      canopy.dispose();
      streaks.dispose();
      rings.dispose();
      prompt.dispose();
      padModel.dispose();
    },
  };
}
