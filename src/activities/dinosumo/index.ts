/**
 * Dino Sumo: everyone wears a wobbly inflatable dinosaur suit on a round inflatable mat. Bump the
 * friends out of the pool-noodle ring (they roll away giggling and waddle back) and swing your
 * tail (Space) to pop the water balloons overhead. E at the booth → friends load (first time) →
 * 3-2-1 → a 45-second round → result card (stars, gems) → E again, R leaves.
 *
 * Glasses twist (two kinds): some water balloons are weak-eye only (VisionLayer.WeakOnly, never in
 * the main scene, popped with a burst drawn on the layer); they soak everybody else and score
 * triple ("find"). And a weak-eye beat ring pulses round your dino: swing your tail when it hugs
 * the dino for a super swing ("time it").
 */
import * as THREE from 'three';
import { CAMERA } from '../../config';
import { VisionLayer } from '../../types';
import type { ExternalController, GameContext, GameSystem, InputState } from '../../types';
import { createGlowMaterial, createLayerMaterial } from '../../vision';
import { localToWorld, rng, worldToLocal } from '../bubbleball/bodies';
import { acquireFriendPool, releaseFriendPool } from '../bubbleball/friends';
import type { Friend } from '../bubbleball/friends';
import { createRoundHud } from '../bubbleball/roundHud';
import { resolveSite } from '../bubbleball/site';
import { createTicket } from '../bubbleball/ticket';
import { stickToWorld } from '../skydive/flight';
import { ThrillConfetti } from '../thrillConfetti';
import { createBalloons } from './balloons';
import { SET, createRingModel } from './ring';
import { createSuits } from './suits';
import { OUT, SUMO, beatPhase, createSumo, isPerfect, playerRank, stepSumo, sumoPrize, sumoStars } from './sumo';
import type { SumoEvent, SumoInput, SumoState } from './sumo';

const FRIEND_SCALE = 0.9;
const BODY_CENTRE = 0.85;
/** Suit belly centre above the feet (tumbles pivot here). */
const SUIT_CY = 0.8;

type Phase = 'idle' | 'loading' | 'round' | 'result';

export interface DinoSumoTestApi {
  phase(): Phase;
  state(): { points: number[]; clock: number; phase: string; weakPops: number; px: number; pz: number } | null;
  booth(): [number, number, number];
  start(): void;
  setClock(seconds: number): void;
  /** Slot kinds now (idle display or the live round). */
  balloons(): { kind: string; x: number; y: number; z: number }[];
  world(x: number, y: number, z: number): [number, number, number];
  triangles(): number;
  /** Show/hide only this game's weak-eye objects (channel tests). */
  layer(visible: boolean): void;
}

declare global {
  interface Window {
    __rgDinoSumo?: DinoSumoTestApi;
  }
}

export function createDinoSumo(ctx: GameContext): GameSystem {
  const inside = (lx: number, lz: number): boolean => Math.hypot(lx, lz) <= SET.deck;
  const site = resolveSite(ctx, 'dinoRing', inside, Math.ceil(SET.deck));
  const boothW = localToWorld(SET.booth.x, SET.booth.z, site.yaw);
  const boothGround = ctx.world.heightAt(site.x + boothW.x, site.z + boothW.z);
  const model = createRingModel({ skirt: site.deckY - site.groundY, boothDy: boothGround - site.deckY, site });
  ctx.scene.add(model.group);
  const ring = model.group;

  // ── Colliders: the round deck, the four posts and the booth ──
  const colliders: ReturnType<GameContext['physics']['addStaticBox']>[] = [];
  const skirt = site.deckY - site.groundY + 0.5;
  colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(site.x, site.deckY - skirt / 2, site.z), skirt / 2, SET.deck));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const w = localToWorld(Math.sin(a) * SET.postR, Math.cos(a) * SET.postR, site.yaw);
    colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(site.x + w.x, site.deckY + SET.ropeY / 2, site.z + w.z), SET.ropeY / 2, 0.2));
  }
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), site.yaw);
  colliders.push(ctx.physics.addStaticBox(new THREE.Vector3(site.x + boothW.x, boothGround + 0.6, site.z + boothW.z), new THREE.Vector3(1.15, 0.6, 0.6), yawQ));

  // ── Moving pieces ──
  const suits = createSuits(4);
  suits.setVisible(false);
  ring.add(suits.group);
  const actors = new THREE.Group();
  actors.name = 'dinosumo-actors';
  ring.add(actors);
  let rand = rng(5);
  const balloons = createBalloons(ctx.vision, 12, () => rand());
  ring.add(balloons.group);
  const confetti = new ThrillConfetti();
  ctx.scene.add(confetti.group);
  // Weak-eye beat ring round the hero: shrinks in once per beat, bright in the "now!" window.
  const beatGroup = new THREE.Group();
  beatGroup.name = 'dinosumo-beat-ring';
  const beatGeo = new THREE.TorusGeometry(1, 0.05, 8, 56).rotateX(Math.PI / 2);
  const beatGlowGeo = new THREE.TorusGeometry(1, 0.16, 8, 56).rotateX(Math.PI / 2);
  const beatDim = createLayerMaterial(0.55);
  const beatHot = createLayerMaterial(1);
  const beatGlowMat = createGlowMaterial({ level: 1, coreOpacity: 0.35, rimPower: 1.3, pulse: 0 });
  const beatMesh = new THREE.Mesh(beatGeo, beatDim);
  const beatGlow = new THREE.Mesh(beatGlowGeo, beatGlowMat);
  beatGroup.add(beatMesh, beatGlow);
  beatGroup.visible = false;
  ctx.vision.add(beatGroup, VisionLayer.WeakOnly);
  let layerOn = true;
  const hud = createRoundHud(ctx.uiRoot, 'dinosumo-hud');
  const ticket = createTicket(ctx, 'dinoSumo');
  const pool = acquireFriendPool();

  // ── State ──
  let phase: Phase = 'idle';
  let round: SumoState | null = null;
  /** Balloons hanging while nobody plays (plain and weak-eye ones, so the set looks alive). */
  const idle = createSumo();
  let friends: Friend[] = [];
  let time = 0;
  let resultT = 0;
  let lastCount = -1;
  let loadToken = 0;
  let wasTumbling = false;
  let camYaw = 0;
  const drip = [0, 0, 0, 0];
  /** Wobble: the suit's top lags behind (a tilt spring per dino, ring space). */
  const wob = [0, 1, 2, 3].map(() => ({ x: 0, z: 0, vx: 0, vz: 0, pvx: 0, pvz: 0 }));
  /** Seconds left of a giggle (after popping back up, and at the end). */
  const laugh = [0, 0, 0, 0];
  const events: SumoEvent[] = [];
  const human: SumoInput = { x: 0, z: 0, sprint: false, swing: false };
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpQ2 = new THREE.Quaternion();
  const upY = new THREE.Vector3(0, 1, 0);
  const axisX = new THREE.Vector3(1, 0, 0);
  const player = ctx.player;

  const toWorld = (lx: number, y: number, lz: number, out: THREE.Vector3): THREE.Vector3 => {
    const w = localToWorld(lx, lz, site.yaw);
    return out.set(site.x + w.x, site.deckY + y, site.z + w.z);
  };

  /** Advance the wobble springs from each dino's change in speed (the top lags, then boings). */
  function updateWobble(dt: number): void {
    if (!round || dt <= 0) return;
    round.dinos.forEach((d, i) => {
      const w = wob[i];
      const b = d.body;
      const ax = (b.vx - w.pvx) / dt;
      const az = (b.vz - w.pvz) / dt;
      w.pvx = b.vx;
      w.pvz = b.vz;
      // Lean into a charge, lag behind any other push; clamp the kick so hits wobble, not spin.
      const lead = d.swing > 0 ? 0.45 : 0;
      const tx = Math.max(-0.6, Math.min(0.6, -ax * 0.035)) + d.dashX * lead;
      const tz = Math.max(-0.6, Math.min(0.6, -az * 0.035)) + d.dashZ * lead;
      w.vx += ((tx - w.x) * 140 - w.vx * 7) * dt;
      w.vz += ((tz - w.z) * 140 - w.vz * 7) * dt;
      w.x = Math.max(-0.7, Math.min(0.7, w.x + w.vx * dt));
      w.z = Math.max(-0.7, Math.min(0.7, w.z + w.vz * dt));
      laugh[i] = Math.max(0, laugh[i] - dt);
    });
  }

  /** Wobble tilt (ring space) as a quaternion: the top leans toward (w.x, w.z). */
  const tiltQ = (i: number, out: THREE.Quaternion): THREE.Quaternion => {
    const w = wob[i];
    const a = Math.hypot(w.x, w.z);
    if (a < 1e-4) return out.identity();
    return out.setFromAxisAngle(tmpV.set(w.z / a, 0, -w.x / a), a);
  };
  const rollOf = (state: string, stateT: number): number => (state === 'rolling' ? Math.min(1, stateT / OUT.roll) * Math.PI * 3 : 0);

  function standBesideBooth(): void {
    const w = localToWorld(SET.booth.x, SET.booth.z - 2.2, site.yaw);
    const x = site.x + w.x;
    const z = site.z + w.z;
    player.position.set(x, ctx.world.heightAt(x, z) + 0.05, z);
    player.yaw = site.yaw + Math.PI;
  }

  function placeSuitsAndFriends(dt: number): void {
    if (!round) return;
    round.dinos.forEach((d, i) => {
      const b = d.body;
      const tumble = rollOf(d.state, d.stateT);
      const l = Math.hypot(b.x, b.z) || 1;
      const w = wob[i];
      const wa = Math.hypot(w.x, w.z);
      // Either the tumble (rolling out) or the wobble tilt (same pose fields).
      const roll = tumble !== 0 ? tumble : wa;
      const rx = tumble !== 0 ? b.x / l : wa > 1e-4 ? w.x / wa : 1;
      const rz = tumble !== 0 ? b.z / l : wa > 1e-4 ? w.z / wa : 0;
      suits.set(i, { x: b.x, y: b.y, z: b.z, yaw: d.yaw, spin: 0, roll, rollX: rx, rollZ: rz, squash: d.squash }, dt, time);
      if (i === 0) return;
      const f = friends[i - 1];
      if (!f) return;
      const o = f.object;
      tmpQ.setFromAxisAngle(upY, d.yaw);
      if (tumble !== 0) {
        tmpQ2.setFromAxisAngle(tmpV.set(b.z / l, 0, -b.x / l), tumble);
        tmpQ.premultiply(tmpQ2);
      } else tmpQ.premultiply(tiltQ(i, tmpQ2));
      o.quaternion.copy(tmpQ);
      tmpV.set(0, -SUIT_CY, 0).applyQuaternion(tmpQ);
      o.position.set(b.x + tmpV.x, b.y + SUIT_CY + tmpV.y, b.z + tmpV.z);
      const speed = Math.hypot(b.vx, b.vz);
      f.play(
        d.state === 'rolling'
          ? 'fall'
          : d.state === 'waddle'
            ? 'walk'
            : laugh[i] > 0 || (phase === 'result' && playerRank(round as SumoState) !== 1 && i === bestFriend())
              ? 'cheer'
              : speed > 0.6
                ? 'run'
                : 'idle',
      );
    });
  }

  function bestFriend(): number {
    if (!round) return -1;
    let best = 1;
    for (let i = 2; i < round.dinos.length; i++) if (round.dinos[i].points > round.dinos[best].points) best = i;
    return best;
  }

  function placePlayer(): void {
    if (!round) return;
    const d = round.dinos[0];
    const b = d.body;
    toWorld(b.x, b.y, b.z, player.position);
    const roll = rollOf(d.state, d.stateT);
    if (roll !== 0) {
      // Tumble outward, pivoting on the belly.
      player.yaw = site.yaw + Math.atan2(b.x, b.z);
      player.position.y += SUIT_CY - BODY_CENTRE;
      player.setVisualRotation(tmpQ.setFromAxisAngle(axisX, roll));
      player.setAnimation('fall');
      wasTumbling = true;
    } else {
      if (wasTumbling) {
        player.setVisualRotation(null);
        wasTumbling = false;
      }
      player.yaw = site.yaw + d.yaw;
      // Wobble with the suit: the tilt in the hero's own frame (pitch forward, roll sideways).
      const w = wob[0];
      const fx = Math.sin(d.yaw);
      const fz = Math.cos(d.yaw);
      player.setTilt(w.x * fx + w.z * fz, -(w.x * fz - w.z * fx));
      const speed = Math.hypot(b.vx, b.vz);
      player.setAnimation(phase === 'result' ? (playerRank(round) === 1 ? 'cheer' : 'wave') : d.state === 'waddle' ? 'walk' : speed > 0.6 ? 'run' : 'idle');
    }
    if (phase === 'result') {
      // Celebration: the camera swings round in front of the hero.
      ctx.cameraRig.setOverride({ distance: 6, height: 2.8, fov: CAMERA.fov, lookAhead: 0, yawOffset: Math.PI });
      return;
    }
    // Camera behind the hero, looking across the ring through its centre.
    const l = Math.hypot(b.x, b.z);
    if (l > 0.8) camYaw = Math.atan2(-b.x, -b.z);
    let off = site.yaw + camYaw - player.yaw;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    ctx.cameraRig.setOverride({ distance: 7.4, height: 3.9, fov: CAMERA.fov + 4, lookAhead: 0.2, yawOffset: off });
  }

  function handleEvents(): void {
    if (!round) return;
    for (const e of events) {
      switch (e.kind) {
        case 'bump':
          ctx.audio.play('boing', { pitch: 0.7 + Math.min(0.5, e.speed / 10), volume: Math.min(1, 0.3 + e.speed / 8) });
          if (e.a === 0 || e.b === 0) ctx.cameraRig.shake(Math.min(0.4, e.speed / 14));
          break;
        case 'swing':
          // Belly charge: a whoosh and a springy stretch.
          ctx.audio.play('whoosh', { pitch: 1.2 + rand() * 0.2, volume: e.dino === 0 ? 0.9 : 0.4 });
          break;
        case 'tailHit':
          ctx.audio.play('bigBoing', { pitch: 0.8 + rand() * 0.3, volume: 0.9 });
          ctx.audio.play('bump', { pitch: 0.7, volume: 0.6 });
          if (e.from === 0 || e.to === 0) ctx.cameraRig.shake(e.from === 0 ? 0.35 : 0.25);
          break;
        case 'bonk':
          ctx.audio.play('bigBoing', { pitch: 0.65, volume: 1 });
          ctx.audio.play('boing', { pitch: 1.4, volume: 0.7 });
          if (e.a === 0 || e.b === 0) ctx.cameraRig.shake(0.4);
          break;
        case 'out': {
          const b = round.dinos[e.dino].body;
          ctx.audio.play('boing', { pitch: 1.5, volume: 0.9 });
          ctx.audio.play('whoosh', { pitch: 0.8, volume: 0.6 });
          // Ring-out = a point: the crowd horn toots for it.
          if (e.by >= 0) ctx.audio.play('horn', { pitch: e.by === 0 ? 1.1 : 0.85, volume: e.by === 0 ? 0.8 : 0.4 });
          confetti.burst(toWorld(b.x, 1.2, b.z, tmpV), e.by === 0 ? 90 : 25);
          if (e.by === 0) {
            hud.splash('dino', 1);
            ctx.events.emit('stunt', { kind: 'bumper', value: 1, stars: 1 });
          }
          if (e.dino === 0) ctx.cameraRig.shake(0.45);
          break;
        }
        case 'back':
          // Pops back up laughing.
          laugh[e.dino] = 1.1;
          ctx.audio.play('squeak', { pitch: 1.4 + rand() * 0.3, volume: 0.5 });
          break;
        case 'pop': {
          const slot = round.balloons[e.slot];
          balloons.pop(slot, e.weak);
          ctx.audio.play('splash', { pitch: e.weak ? 0.8 : 1.2, volume: e.weak ? 1 : 0.7 });
          // Splash every dino it soaked (both-eye splashes on the dinos, after the pop). A weak
          // balloon's own burst is drawn on the layer by `balloons.pop`.
          if (!e.weak) balloons.splash.burst(slot.x, slot.y, slot.z, 18, 2.2, 0.07);
          round.dinos.forEach((d, j) => {
            if (j !== e.dino && d.wet > 0 && drip[j] <= 0.2) {
              balloons.splash.burst(d.body.x, 2.1, d.body.z, e.weak ? 22 : 12, 2.4, 0.08);
              drip[j] = e.weak ? 1.6 : 1;
            }
          });
          if (e.weak) ctx.audio.play('star', { pitch: 1.3 });
          if (e.dino === 0) {
            hud.splash('splash', 0);
            ctx.events.emit('stunt', { kind: 'bumper', value: e.weak ? 3 : 1, stars: e.weak ? 2 : 1 });
            ctx.cameraRig.shake(e.weak ? 0.3 : 0.15);
          }
          break;
        }
        case 'perfect':
          hud.splash('charge', 0);
          ctx.audio.play('star', { pitch: 1.6 });
          ctx.cameraRig.shake(0.25);
          ctx.events.emit('stunt', { kind: 'bumper', value: 1, stars: 1 });
          break;
        case 'start':
          ctx.audio.play('start');
          hud.count(0, 'dino');
          break;
        case 'over':
          finishRound();
          break;
        default:
          break;
      }
    }
  }

  function finishRound(): void {
    if (!round) return;
    phase = 'result';
    resultT = 0;
    const rank = playerRank(round);
    const stars = sumoStars(rank);
    const gems = sumoPrize(stars, round.weakPops + round.perfects);
    const paid = ticket.prize(gems);
    const me = round.dinos[0].points;
    ctx.events.emit('stunt', { kind: 'bumper', value: me, stars });
    ctx.events.emit('stamp:earned', { id: 'dinoRing' });
    ctx.events.emit('ui:toast', { icon: 'check', text: `${me}` });
    ctx.audio.play(stars >= 3 ? 'fanfare' : 'star');
    ctx.audio.play('horn', { pitch: stars >= 3 ? 1.15 : 0.9 });
    if (stars >= 3) {
      const p = round.dinos[0].body;
      confetti.burst(toWorld(0, 3, 0, tmpV), 180);
      confetti.burst(toWorld(p.x, 2.4, p.z, tmpV), 120);
    }
    // Everybody pops up laughing at the end.
    laugh.fill(3);
    hud.chip(null, false);
    hud.result(stars, paid, ctx.input.state.device);
  }

  function startRound(): void {
    round = createSumo(SUMO.seconds);
    rand = rng(ctx.testMode ? 9 : (Date.now() & 0xffff) + 3);
    phase = 'round';
    lastCount = -1;
    camYaw = 0;
    drip.fill(0);
    laugh.fill(0);
    for (const w of wob) w.x = w.z = w.vx = w.vz = w.pvx = w.pvz = 0;
    hud.hideResult();
    suits.setVisible(true);
    balloons.splash.clear();
    placeSuitsAndFriends(0);
  }

  function cleanup(): void {
    phase = 'idle';
    round = null;
    loadToken++;
    for (const f of friends) f.object.removeFromParent();
    friends = [];
    suits.setVisible(false);
    beatGroup.visible = false;
    hud.hide();
    ctx.cameraRig.setOverride(null);
    wasTumbling = false;
  }

  function begin(): void {
    phase = 'loading';
    const token = ++loadToken;
    player.setExternalController(controller);
    void pool.get(3, player.characterId).then((list) => {
      if (token !== loadToken || phase !== 'loading') return;
      friends = list;
      for (const f of friends) {
        f.object.scale.setScalar(FRIEND_SCALE);
        actors.add(f.object);
      }
      startRound();
    });
  }

  const controller: ExternalController = {
    update(dt: number, input: Readonly<InputState>): boolean {
      if (input.respawnPressed || input.flopPressed) {
        cleanup();
        standBesideBooth();
        return false;
      }
      if (phase === 'loading') {
        player.setAnimation('wave');
        ctx.cameraRig.setOverride({ distance: 7, height: 3, yawOffset: Math.PI });
        return true;
      }
      if (!round) return false;
      if (phase === 'result') {
        resultT += dt;
        stepSumo(round, dt, { rand, input: { x: 0, z: 0, sprint: false, swing: false } }, events);
        placePlayer();
        if (input.usePressed && resultT > 0.6) {
          if (ticket.pay()) startRound();
          return true;
        }
        if ((input.jumpPressed && resultT > 1.2) || resultT > 14) {
          cleanup();
          standBesideBooth();
          return false;
        }
        return true;
      }
      const w = stickToWorld(input.moveX, input.moveY, ctx.cameraRig.yaw);
      const l = worldToLocal(w.x, w.z, site.yaw);
      const len = Math.hypot(l.x, l.z);
      human.x = len > 1 ? l.x / len : l.x;
      human.z = len > 1 ? l.z / len : l.z;
      human.sprint = input.sprint;
      human.swing = input.jumpPressed;
      stepSumo(round, dt, { rand, input: human }, events);
      if (round.phase === 'countdown') {
        const n = Math.ceil(SUMO.countdown - round.phaseT);
        if (n !== lastCount && n > 0 && n <= 3) {
          lastCount = n;
          hud.count(n, 'dino');
          ctx.audio.play('tick');
        }
      }
      handleEvents();
      placePlayer();
      return true;
    },
    onRelease() {
      if (phase !== 'idle') cleanup();
      // Hand back on foot with no leftover ride velocity (the hop to the booth is one frame).
      player.launch(new THREE.Vector3(0, 0, 0));
    },
  };

  const removeInteract = ctx.interactions.add({
    id: 'dinosumo',
    position: () => model.booth,
    radius: 3,
    icon: 'dragon',
    enabled: () => phase === 'idle' && player.mode === 'walk',
    onUse() {
      if (phase !== 'idle' || player.mode !== 'walk') return;
      if (!ticket.pay()) return;
      ctx.audio.play('click');
      begin();
    },
  });

  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'title' && phase !== 'idle') {
      if (player.mode === 'external') player.setExternalController(null);
      cleanup();
    }
  });

  if (ctx.testMode && typeof window !== 'undefined') {
    window.__rgDinoSumo = {
      phase: () => phase,
      state: () =>
        round && {
          points: round.dinos.map((d) => d.points),
          clock: round.clock,
          phase: round.phase,
          weakPops: round.weakPops,
          px: round.dinos[0].body.x,
          pz: round.dinos[0].body.z,
        },
      booth: () => [model.booth.x, model.booth.y, model.booth.z],
      start: () => {
        // Same rule as E at the booth: never take the player from another ride.
        if (phase === 'idle' && player.mode === 'walk') begin();
      },
      setClock: (s) => {
        if (round) round.clock = s;
      },
      balloons: () => (round ?? idle).balloons.map((b) => ({ kind: b.kind, x: b.x, y: b.y, z: b.z })),
      world: (x, y, z) => toWorld(x, y, z, new THREE.Vector3()).toArray() as [number, number, number],
      triangles: () => model.triangles,
      layer: (v) => {
        balloons.layer.visible = v;
        layerOn = v;
        placeBeat();
      },
    };
  }

  function placeBeat(): void {
    const d = round?.dinos[0];
    const show = !!round && layerOn && phase === 'round' && round.phase === 'play' && d?.state === 'ok';
    beatGroup.visible = show;
    if (!show || !round || !d) return;
    const hot = isPerfect(round.beat);
    const r = 2.3 - 1.35 * beatPhase(round.beat);
    toWorld(d.body.x, 0.12, d.body.z, beatGroup.position);
    beatGroup.rotation.y = site.yaw;
    beatGroup.scale.set(r, hot ? 2 : 1, r);
    beatMesh.material = hot ? beatHot : beatDim;
    beatGlow.visible = hot;
  }

  /** Is the player close enough for the idle set to animate? */
  const near = (): boolean => player.position.distanceToSquared(ring.position) < 60 * 60;

  return {
    update(dt) {
      time += dt;
      confetti.update(dt);
      if (phase === 'idle' && !near()) return;
      const slots = (round ?? idle).balloons;
      balloons.update(slots, model.ropeY, ring.matrixWorld, dt, time);
      if (phase === 'idle') return;
      placeBeat();
      if (round) {
        updateWobble(dt);
        placeSuitsAndFriends(dt);
        // Drips while wet.
        round.dinos.forEach((d, j) => {
          if (drip[j] <= 0) return;
          drip[j] -= dt;
          if (Math.floor((drip[j] + dt) * 8) !== Math.floor(drip[j] * 8)) balloons.splash.burst(d.body.x, 1.9 + d.body.y, d.body.z, 2, 0.8, 0.05);
        });
        const me = round.dinos[0].points;
        const best = round.dinos[bestFriend()]?.points ?? 0;
        hud.board({ icon: 'dino', value: me }, { icon: 'crown', value: best }, round.clock, SUMO.seconds);
        // The charge key stays on screen all round (pictogram + key), dimmed while recharging.
        if (phase === 'round') hud.chip(round.phase === 'play' ? 'charge' : null, ctx.input.state.device === 'gamepad', round.dinos[0].swingCd > 0);
      }
      for (const f of friends) f.update(dt);
    },
    dispose() {
      offPhase();
      removeInteract();
      if (phase !== 'idle' && player.mode === 'external') player.setExternalController(null);
      cleanup();
      for (const c of colliders) ctx.physics.removeCollider(c);
      model.group.removeFromParent();
      model.dispose();
      suits.dispose();
      balloons.dispose();
      ctx.vision.remove(beatGroup);
      beatGeo.dispose();
      beatGlowGeo.dispose();
      beatDim.dispose();
      beatHot.dispose();
      beatGlowMat.dispose();
      confetti.group.removeFromParent();
      confetti.dispose();
      hud.dispose();
      ticket.dispose();
      releaseFriendPool();
      if (ctx.testMode && typeof window !== 'undefined') delete window.__rgDinoSumo;
    },
  };
}
