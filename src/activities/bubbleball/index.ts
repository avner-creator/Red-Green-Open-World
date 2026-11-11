/**
 * Bubble Ball: the hero and five friends each wear a giant see-through bubble and play 3-a-side
 * soccer with a huge light ball on a raised inflatable pitch. E at the booth → friends load (first
 * time only) → 3-2-1 → a 60-second match with bumps, flips and goal parties → result card (stars and
 * a gem prize) → E plays again, R leaves. The player is an ExternalController for the whole visit.
 *
 * Glasses twist: bonus hoops that pop up in mid-air and drift slowly from side to side are
 * weak-eye only (VisionLayer.WeakOnly): find and follow one, then roll the ball through it. The
 * ball sparkles (also weak-eye only) and your team's next goal counts double. The friends can't
 * see the hoops, so they never aim for them.
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { CAMERA } from '../../config';
import { GROUP_VEHICLE, groups } from '../../core/physics';
import { VisionLayer } from '../../types';
import type { ExternalController, GameContext, GameSystem, InputState } from '../../types';
import { stickToWorld } from '../skydive/flight';
import { ThrillConfetti } from '../thrillConfetti';
import { ARENA, PAL, createArenaModel, gateSpan } from './arena';
import { follow, localToWorld, rng, worldToLocal } from './bodies';
import { acquireFriendPool, releaseFriendPool } from './friends';
import type { Friend } from './friends';
import { createRoundHud } from './roundHud';
import { resolveSite } from './site';
import { createKickabout, resetKickabout, stepKickabout, KICKABOUT } from './kickabout';
import type { Walker } from './kickabout';
import { BALL, BUBBLE, FLIP, MATCH, PITCH, RING, createMatch, matchPrize, matchStars, pitchWalls, stepMatch } from './soccer';
import type { HumanInput, MatchEvent, MatchState } from './soccer';
import { createTicket } from './ticket';
import { createBallMesh, createBonusRing, createBubbles, createChargeSparkle } from './visuals';

/** Bubble centre above the feet and its radius (the hero's legs poke out underneath). */
const BUB_CY = 1.12;
/** The match camera: a raised three-quarter view from the near touchline. */
const BROADCAST = { angle: 0.6, swing: 0.3, distance: 11.5, height: 7.2 } as const;
const FRIEND_SCALE = 0.9;
/** Player capsule centre above the feet (setVisualRotation pivots there). */
const BODY_CENTRE = 0.85;

type Phase = 'idle' | 'loading' | 'match' | 'result';

export interface BubbleBallTestApi {
  phase(): Phase;
  match(): {
    home: number;
    away: number;
    clock: number;
    phase: string;
    charged: number;
    ring: { x: number; z: number } | null;
    /** Player and ball, pitch space. */
    px: number;
    pz: number;
    bx: number;
    bz: number;
  } | null;
  booth(): [number, number, number];
  start(): void;
  /** Put a bonus ring at pitch (x, z) now (test: channel separation). */
  ring(x: number, z: number): void;
  /** Charge the ball now (sparkle on). */
  charge(): void;
  /** Seconds left in the match. */
  setClock(seconds: number): void;
  /** World position of a pitch-space point on the deck. */
  world(x: number, y: number, z: number): [number, number, number];
  friendsLoaded(): number;
  triangles(): number;
  /** The ball now (match ball, or the kickabout ball between matches), pitch space. */
  ball(): { x: number; y: number; z: number; vx: number; vz: number };
  /** Put the kickabout ball at rest at pitch (x, z) (between matches only). */
  placeBall(x: number, z: number): void;
  /** Pitch-space position of a world point (feet y relative to the deck top). */
  local(x: number, y: number, z: number): [number, number, number];
  /** Show/hide only this game's weak-eye objects (channel tests). */
  layer(visible: boolean): void;
}

declare global {
  interface Window {
    __rgBubbleBall?: BubbleBallTestApi;
  }
}

export function createBubbleBall(ctx: GameContext): GameSystem {
  const inside = (lx: number, lz: number): boolean => Math.abs(lx) <= ARENA.hx && Math.abs(lz) <= ARENA.hz;
  const site = resolveSite(ctx, 'bubbleArena', inside, Math.ceil(ARENA.hx));
  const boothLocal = localToWorld(ARENA.booth.x, ARENA.booth.z, site.yaw);
  const boothGround = ctx.world.heightAt(site.x + boothLocal.x, site.z + boothLocal.z);
  const model = createArenaModel({ skirt: site.deckY - site.groundY, boothDy: boothGround - site.deckY, site });
  ctx.scene.add(model.group);
  const arena = model.group;

  // ── Colliders: the deck, the puffy walls (so walkers can't wander onto the pitch) and the booth ──
  const colliders: ReturnType<GameContext['physics']['addStaticBox']>[] = [];
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), site.yaw);
  const box = (lx: number, y: number, lz: number, hx: number, hy: number, hz: number): void => {
    const w = localToWorld(lx, lz, site.yaw);
    colliders.push(ctx.physics.addStaticBox(new THREE.Vector3(site.x + w.x, y, site.z + w.z), new THREE.Vector3(hx, hy, hz), yawQ));
  };
  const skirt = site.deckY - site.groundY + 0.5;
  box(0, site.deckY - skirt / 2, 0, ARENA.hx, skirt / 2, ARENA.hz);
  // Sidelines; the near one has the walk-in gate (no collider there) and a little ramp up to it.
  box(0, site.deckY + ARENA.wallH / 2, PITCH.hz + ARENA.wallR, PITCH.hx, ARENA.wallH / 2, ARENA.wallR);
  const gate = gateSpan();
  for (const [a, b] of [
    [-PITCH.hx, gate.x0 - 0.2],
    [gate.x1 + 0.2, PITCH.hx],
  ]) {
    box((a + b) / 2, site.deckY + ARENA.wallH / 2, -(PITCH.hz + ARENA.wallR), (b - a) / 2, ARENA.wallH / 2, ARENA.wallR);
  }
  const ramp = (() => {
    const gx = (gate.x0 + gate.x1) / 2;
    const run = 2.6;
    const footW = localToWorld(gx, -(ARENA.hz + run), site.yaw);
    const footY = ctx.world.heightAt(site.x + footW.x, site.z + footW.z);
    const rise = Math.max(0, site.deckY - footY);
    if (rise < 0.12) return null;
    const len = Math.hypot(run, rise);
    const tilt = Math.atan2(rise, run);
    const midW = localToWorld(gx, -(ARENA.hz + run / 2), site.yaw);
    const q = yawQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -tilt)); // high end (+Z) at the deck
    const centre = new THREE.Vector3(site.x + midW.x, (site.deckY + footY) / 2, site.z + midW.z).add(new THREE.Vector3(0, -0.12, 0).applyQuaternion(q));
    colliders.push(ctx.physics.addStaticBox(centre, new THREE.Vector3((gate.x1 - gate.x0) / 2, 0.12, len / 2), q));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(gate.x1 - gate.x0, 0.24, len), new THREE.MeshStandardMaterial({ color: PAL.navy, roughness: 0.8 }));
    mesh.name = 'bubbleball-ramp';
    mesh.position.copy(centre);
    mesh.quaternion.copy(q);
    mesh.receiveShadow = true;
    ctx.scene.add(mesh);
    return mesh;
  })();
  for (const s of [-1, 1]) box(s * (PITCH.hx + PITCH.goalDepth + 0.25), site.deckY + 1.2, 0, 0.25, 1.2, PITCH.hz);
  box(ARENA.booth.x, boothGround + 0.6, ARENA.booth.z, 1.15, 0.6, 0.6);

  // ── Moving pieces ──
  const bubbles = createBubbles(6);
  bubbles.setVisible(false);
  arena.add(bubbles.group);
  const actors = new THREE.Group();
  actors.name = 'bubbleball-actors';
  arena.add(actors);
  const ballView = createBallMesh(BALL.r);
  arena.add(ballView.mesh, ballView.proxy);
  ballView.mesh.position.set(0, BALL.r, 0);
  ballView.proxy.position.copy(ballView.mesh.position);
  const ringView = createBonusRing(RING.r);
  ctx.vision.add(ringView.object, VisionLayer.WeakOnly);
  const sparkle = createChargeSparkle();
  ctx.vision.add(sparkle.object, VisionLayer.WeakOnly);
  const confetti = new ThrillConfetti();
  ctx.scene.add(confetti.group);
  const hud = createRoundHud(ctx.uiRoot, 'bubbleball-hud');
  const ticket = createTicket(ctx, 'bubbleBall');
  const pool = acquireFriendPool();

  // ── The ball is a real thing between matches (playtest 3: "he would walk through it") ──
  // A kinematic Rapier sphere follows the ball so the walk controller is blocked by it, and the
  // kickabout sim shoves the ball out of the way first, so walking into it pushes it along.
  const R = ctx.physics.rapier;
  const ballBody: RAPIER.RigidBody = ctx.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
  // Vehicle group: the walker collides with it, camera rays ignore it (no zoom-in on the ball).
  const ballCollider = ctx.physics.world.createCollider(
    R.ColliderDesc.ball(BALL.r).setRestitution(0.8).setFriction(0.3).setCollisionGroups(groups(GROUP_VEHICLE, 0xffff)),
    ballBody,
  );
  const kick = createKickabout();
  const kickEvents: string[] = [];
  const walker: Walker = { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0 };
  let kickSfxT = 0;
  let ballSquash = 0;
  let ballSquashV = 0;
  /** Camera yaw offset (smoothed) that frames the ball and the goal. */
  let camOff = 0;
  /** Stars from goals, reported at the whistle. */
  let bonusStars = 0;

  // ── State ──
  let phase: Phase = 'idle';
  let match: MatchState | null = null;
  let friends: Friend[] = [];
  let time = 0;
  let resultT = 0;
  let lastCount = -1;
  let wasFlipping = false;
  let loadToken = 0;
  let layerOn = true;
  const events: MatchEvent[] = [];
  const walls = pitchWalls();
  let rand = rng(1);
  const human: HumanInput = { x: 0, z: 0, sprint: false, hop: false };
  /** Facing per agent (pitch space yaw); the home team faces +X. */
  const facing = [1, 1, 1, -1, -1, -1].map((s) => (s * Math.PI) / 2);
  const ballQ = new THREE.Quaternion();
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const axisX = new THREE.Vector3(1, 0, 0);
  const upY = new THREE.Vector3(0, 1, 0);
  /** World yaw of the pitch's +X (the player's attack direction). */
  const attackYaw = site.yaw + Math.PI / 2;
  const player = ctx.player;

  const toWorld = (lx: number, y: number, lz: number, out: THREE.Vector3): THREE.Vector3 => {
    const w = localToWorld(lx, lz, site.yaw);
    return out.set(site.x + w.x, site.deckY + y, site.z + w.z);
  };
  ballBody.setTranslation(toWorld(0, BALL.r, 0, new THREE.Vector3()), false);
  placeBall(0);

  /** Flip progress → rotation (forward somersault toward the push), eased. */
  const flipAngle = (flipT: number): number => {
    const k = 1 - flipT / FLIP.seconds;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    return e * Math.PI * 2;
  };

  function standBesideBooth(): void {
    const local = { x: ARENA.booth.x, z: ARENA.booth.z - 2.2 };
    const w = localToWorld(local.x, local.z, site.yaw);
    const x = site.x + w.x;
    const z = site.z + w.z;
    player.position.set(x, ctx.world.heightAt(x, z) + 0.05, z);
    player.yaw = site.yaw + Math.PI; // facing away from the arena
  }

  function placeFriends(): void {
    if (!match) return;
    for (let i = 1; i < 6; i++) {
      const f = friends[i - 1];
      if (!f) continue;
      const a = match.agents[i];
      const b = a.body;
      const speed = Math.hypot(b.vx, b.vz);
      if (a.flipT <= 0 && speed > 0.6) facing[i] = Math.atan2(b.vx, b.vz);
      const o = f.object;
      if (a.flipT > 0) {
        const yaw = Math.atan2(a.pushX, a.pushZ);
        tmpQ.setFromAxisAngle(upY, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(axisX, flipAngle(a.flipT)));
        o.quaternion.copy(tmpQ);
        // Rotate about the bubble centre, not the feet.
        tmpV.set(0, -BUB_CY, 0).applyQuaternion(tmpQ);
        o.position.set(b.x + tmpV.x, b.y + BUB_CY + tmpV.y, b.z + tmpV.z);
        f.play('fall');
      } else {
        o.quaternion.setFromAxisAngle(upY, facing[i]);
        o.position.set(b.x, b.y, b.z);
        f.play(a.cheer > 0 ? 'cheer' : b.y > 0.2 ? 'jump' : speed > 0.8 ? 'run' : 'idle', speed > 0.8 ? Math.min(1.4, 0.6 + speed / 6) : 1);
      }
    }
  }

  function placeBubbles(): void {
    if (!match) return;
    match.agents.forEach((a, i) => {
      const b = a.body;
      let q = tmpQ.setFromAxisAngle(upY, facing[i]);
      if (a.flipT > 0) {
        q = tmpQ.setFromAxisAngle(upY, Math.atan2(a.pushX, a.pushZ)).multiply(new THREE.Quaternion().setFromAxisAngle(axisX, flipAngle(a.flipT)));
      }
      tmpV.set(b.x, b.y + BUB_CY, b.z);
      bubbles.set(i, tmpV, q, BUBBLE.r, a.squash, a.team);
    });
  }

  function placeBall(dt: number): void {
    const ball = match?.ball ?? kick.ball;
    // Roll: rotate about (up × velocity) by distance / radius.
    const sp = Math.hypot(ball.vx, ball.vz);
    if (sp > 0.01) {
      tmpV2.set(ball.vz, 0, -ball.vx).normalize();
      ballQ.setFromAxisAngle(tmpV2, (sp * dt) / BALL.r);
      ballView.mesh.quaternion.premultiply(ballQ);
    }
    // Squash-and-stretch on kicks (a quick boing of the whole ball).
    ballSquashV += (-140 * ballSquash - 10 * ballSquashV) * dt;
    ballSquash += ballSquashV * dt;
    const sq = Math.max(-0.25, Math.min(0.25, ballSquash + (match ? 0 : kick.squash)));
    ballView.mesh.scale.setScalar(BALL.r * (1 + sq * 0.5));
    ballView.mesh.position.set(ball.x, ball.y + BALL.r * (1 + sq * 0.5), ball.z);
    ballView.proxy.position.copy(ballView.mesh.position);
    // The blocking collider follows the ball (off during a match: the player is in a bubble then).
    toWorld(ball.x, ball.y + BALL.r, ball.z, tmpV);
    ballBody.setNextKinematicTranslation(tmpV);
  }

  /** Free kickabout while no match is on: the walker shoves the ball, lands on it, scores. */
  function updateKickabout(dt: number): void {
    kickSfxT = Math.max(0, kickSfxT - dt);
    const p = player.position;
    const l = worldToLocal(p.x - site.x, p.z - site.z, site.yaw);
    const v = worldToLocal(player.velocity.x, player.velocity.z, site.yaw);
    walker.x = l.x;
    walker.z = l.z;
    walker.y = player.mode === 'walk' ? p.y - site.deckY : 99; // riding something: no contact
    walker.vx = v.x;
    walker.vz = v.z;
    walker.vy = player.velocity.y;
    kickEvents.length = 0;
    const r = stepKickabout(kick, walker, dt, walls, kickEvents);
    if (r.bounce && player.mode === 'walk') {
      player.launch(tmpV.set(player.velocity.x * 0.6, KICKABOUT.topBounce, player.velocity.z * 0.6));
      ctx.audio.play('bigBoing', { pitch: 1.2 });
    }
    if (r.kicked > 0 && kickSfxT <= 0) {
      ctx.audio.play('bump', { pitch: 0.9 + Math.min(0.5, r.kicked / 14), volume: Math.min(1, 0.4 + r.kicked / 10) });
      ctx.audio.play('boing', { pitch: 0.7 + r.kicked / 20, volume: 0.5 });
      kickSfxT = 0.25;
    }
    if (r.wall > 2.5) ctx.audio.play('boing', { pitch: 0.6, volume: Math.min(0.6, r.wall / 10) });
    if (r.goal) {
      // A little goal party even without a match: horn, confetti, and the ball pops back.
      ctx.audio.play('horn', { pitch: 1.1 });
      ctx.audio.play('fanfare', { volume: 0.6 });
      const gx = r.goal === 'home' ? PITCH.hx + PITCH.goalDepth * 0.5 : -(PITCH.hx + PITCH.goalDepth * 0.5);
      confetti.burst(toWorld(gx, 1.6, 0, tmpV), 80);
    }
    if (kickEvents.includes('reset')) ctx.audio.play('boing', { pitch: 1.5, volume: 0.5 });
  }

  function placeLayer(): void {
    if (!match || !layerOn) {
      ringView.hide();
      sparkle.hide();
      return;
    }
    const r = match.ring;
    if (r) {
      toWorld(r.x, RING.cy, r.z, tmpV);
      ringView.place(tmpV, site.yaw, Math.min(1, r.age / 0.45), r.alive ? 0 : r.popT, time);
    } else ringView.hide();
    if (match.charged > 0) {
      const b = match.ball;
      toWorld(b.x, b.y + BALL.r, b.z, tmpV);
      sparkle.place(tmpV, BALL.r, time, Math.min(1, match.charged / 1.5));
    } else sparkle.hide();
  }

  function handleEvents(): void {
    if (!match) return;
    for (const e of events) {
      switch (e.kind) {
        case 'bump':
          ctx.audio.play('boing', { pitch: 0.8 + Math.min(0.6, e.speed / 12), volume: Math.min(1, 0.3 + e.speed / 10) });
          if (e.a === 0 || e.b === 0) ctx.cameraRig.shake(Math.min(0.5, e.speed / 18));
          break;
        case 'flip':
          ctx.audio.play('bigBoing', { pitch: 1.1 + rand() * 0.3, volume: 0.8 });
          if (e.agent === 0) ctx.cameraRig.shake(0.4);
          break;
        case 'kick':
          ctx.audio.play('bump', { pitch: 0.9 + Math.min(0.5, e.speed / 14), volume: Math.min(1, 0.4 + e.speed / 10) });
          if (e.power) {
            // Power kick: a big boing, the ball squashes, the camera thumps.
            ctx.audio.play('bigBoing', { pitch: 0.8 + rand() * 0.2, volume: e.agent === 0 ? 1 : 0.6 });
            ballSquashV -= 9;
            if (e.agent === 0) ctx.cameraRig.shake(0.28);
          }
          break;
        case 'dash':
          ctx.audio.play('whoosh', { pitch: 1.3 + rand() * 0.2, volume: e.agent === 0 ? 0.9 : 0.35 });
          break;
        case 'wall':
          ctx.audio.play('boing', { pitch: 0.6, volume: Math.min(0.7, e.speed / 10) });
          break;
        case 'charge':
          // The hoop is gone now; the chime tells the weak eye "you did it" (no position hint left).
          ctx.audio.play('star', { pitch: 1.3 });
          ctx.audio.play('gem', { pitch: 1.4, volume: 0.7 });
          if (e.team === 'home') ctx.events.emit('glasses:result', { mechanic: 'bubbleRing', kind: 'follow', tier: 2, hit: true });
          break;
        case 'kickoff':
          ctx.audio.play('start');
          hud.count(0, 'ball');
          hud.practice(ticket.practice, false);
          break;
        case 'goal': {
          const home = e.team === 'home';
          // Goal party: horn, fanfare (or a friendly "oh no" boing), confetti, slow-mo, banner.
          ctx.audio.play('horn', { pitch: home ? 1 : 0.8, volume: 0.9 });
          ctx.audio.play(home ? 'fanfare' : 'boing', { pitch: home ? 1 : 0.7 });
          if (e.double) ctx.audio.play('star', { pitch: 1.5 });
          hud.splash(home ? 'light' : 'dark', e.points);
          ctx.cameraRig.shake(home ? 0.4 : 0.15);
          const gx = home ? PITCH.hx + PITCH.goalDepth * 0.5 : -(PITCH.hx + PITCH.goalDepth * 0.5);
          confetti.burst(toWorld(gx, 1.6, 0, tmpV), home ? 160 : 70);
          confetti.burst(toWorld(gx * 0.6, 3, home ? -3 : 3, tmpV), home ? 80 : 30);
          // Goal stars are reported at the whistle (no HUD pop-ups in the middle of a match).
          if (home) bonusStars += e.points;
          break;
        }
        case 'over':
          finishMatch();
          break;
        default:
          break;
      }
    }
  }

  function finishMatch(): void {
    if (!match) return;
    phase = 'result';
    resultT = 0;
    const { home, away } = match.score;
    const stars = matchStars(home, away);
    const gems = matchPrize(stars, match.doubles.home);
    const paid = ticket.prize(gems);
    ctx.events.emit('stunt', { kind: 'bumper', value: home, stars: stars + Math.min(6, bonusStars) });
    ctx.events.emit('stamp:earned', { id: 'bubbleArena' });
    ctx.events.emit('ui:toast', { icon: 'check', text: `${home} – ${away}` });
    ctx.audio.play(stars >= 3 ? 'fanfare' : 'star');
    ctx.audio.play('horn', { pitch: stars >= 3 ? 1.15 : 0.9 });
    if (stars >= 3) {
      const p = match.agents[0].body;
      confetti.burst(toWorld(0, 3, 0, tmpV), 200);
      confetti.burst(toWorld(p.x, 2.5, p.z, tmpV), 120);
    }
    hud.chip(null, false);
    // Exactly what the wallet got: the prize, plus a bonus line for missions / Fun Pass prizes.
    hud.result(stars, paid, ctx.input.state.device, { bonus: ticket.gained() - paid, practice: ticket.practice });
    for (const a of match.agents) a.cheer = a.team === (home >= away ? 'home' : 'away') ? 99 : 0;
  }

  function startMatch(): void {
    match = createMatch(MATCH.seconds);
    rand = rng(ctx.testMode ? 7 : (Date.now() & 0xffff) + 1);
    phase = 'match';
    lastCount = -1;
    bonusStars = 0;
    hud.hideResult();
    hud.practice(ticket.practice, true);
    bubbles.setVisible(true);
    ballCollider.setEnabled(false);
    camOff = 0;
    for (let i = 0; i < 6; i++) facing[i] = i < 3 ? Math.PI / 2 : -Math.PI / 2;
    placeBubbles();
    placeFriends();
  }

  function cleanup(): void {
    // The ball stays where the match left it (on the pitch floor), and is solid again.
    if (match) resetKickabout(kick, match.ball.x, match.ball.z);
    if (Math.abs(kick.ball.x) > PITCH.hx || Math.abs(kick.ball.z) > PITCH.hz - BALL.r) resetKickabout(kick);
    ballCollider.setEnabled(true);
    phase = 'idle';
    match = null;
    loadToken++;
    for (const f of friends) f.object.removeFromParent();
    friends = [];
    bubbles.setVisible(false);
    hud.hide();
    ringView.hide();
    sparkle.hide();
    ctx.cameraRig.setOverride(null);
    placeBall(0);
    wasFlipping = false;
  }

  function begin(): void {
    phase = 'loading';
    const token = ++loadToken;
    player.setExternalController(controller);
    void pool.get(5, player.characterId).then((list) => {
      if (token !== loadToken || phase !== 'loading') return;
      friends = list;
      for (const f of friends) {
        f.object.scale.setScalar(FRIEND_SCALE);
        actors.add(f.object);
      }
      startMatch();
    });
  }

  function placePlayer(dt: number): void {
    if (!match) return;
    const a = match.agents[0];
    const b = a.body;
    const speed = Math.hypot(b.vx, b.vz);
    if (a.flipT <= 0 && speed > 0.5) {
      const want = Math.atan2(b.vx, b.vz);
      let d = want - facing[0];
      d = Math.atan2(Math.sin(d), Math.cos(d));
      facing[0] += d * follow(14, dt);
    }
    toWorld(b.x, b.y, b.z, player.position);
    if (a.flipT > 0) {
      player.yaw = site.yaw + Math.atan2(a.pushX, a.pushZ);
      // Pivot the somersault on the bubble centre: raise the body centre up to it.
      player.position.y += BUB_CY - BODY_CENTRE;
      player.setVisualRotation(tmpQ.setFromAxisAngle(axisX, flipAngle(a.flipT)));
      player.setAnimation('fall');
      wasFlipping = true;
    } else {
      if (wasFlipping) {
        player.setVisualRotation(null);
        wasFlipping = false;
      }
      player.yaw = site.yaw + facing[0];
      player.setAnimation(a.cheer > 0 ? 'cheer' : b.y > 0.2 ? 'jump' : speed > 1 ? 'run' : 'idle');
    }
    if (phase === 'result') {
      // Celebration: the camera swings round to the pitch-centre side of the hero, looking out at
      // them (never from behind a goal net or a wall).
      const away = Math.hypot(b.x, b.z) > 1 ? site.yaw + Math.atan2(b.x, b.z) : attackYaw;
      let off = away - player.yaw;
      off = Math.atan2(Math.sin(off), Math.cos(off));
      ctx.cameraRig.setOverride({ distance: 6.2, height: 2.6, fov: CAMERA.fov, lookAhead: 0, yawOffset: off });
      return;
    }
    // Broadcast camera: raised, from the near (booth) touchline, three-quarter toward the goal to
    // attack, so the hero, the ball and the target goal are in the shot and no goal frame or net is
    // ever between the camera and the play. It turns a little to keep the ball in frame.
    const ball = match.ball;
    const base = BROADCAST.angle; // pitch space: 0 = looking +Z (across), +π/2 = looking +X (attack)
    const toBall = Math.atan2(ball.x - b.x, ball.z - b.z);
    let rel = toBall - base;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const near = Math.min(1, Math.hypot(ball.x - b.x, ball.z - b.z) / 6);
    const want = Math.max(-BROADCAST.swing, Math.min(BROADCAST.swing, rel * 0.35 * near));
    camOff += (want - camOff) * follow(1.6, dt);
    let off = site.yaw + base + camOff - player.yaw;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    ctx.cameraRig.setOverride({ distance: BROADCAST.distance, height: BROADCAST.height, fov: CAMERA.fov + 6, lookAhead: 0, yawOffset: off });
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
      if (!match) return false;
      if (phase === 'result') {
        resultT += dt;
        stepMatch(match, dt, { rand, input: { x: 0, z: 0, sprint: false, hop: false }, walls }, events);
        placePlayer(dt);
        if (input.usePressed && resultT > 0.6) {
          if (ticket.pay()) startMatch();
          return true;
        }
        if ((input.jumpPressed && resultT > 1.2) || resultT > 14) {
          cleanup();
          standBesideBooth();
          return false;
        }
        return true;
      }
      // Live match.
      const w = stickToWorld(input.moveX, input.moveY, ctx.cameraRig.yaw);
      const l = worldToLocal(w.x, w.z, site.yaw);
      const len = Math.hypot(l.x, l.z);
      human.x = len > 1 ? l.x / len : l.x;
      human.z = len > 1 ? l.z / len : l.z;
      human.sprint = input.sprint;
      human.hop = input.jumpPressed;
      // Slow-mo for the first moment after a goal (the confetti hangs in the air).
      const slow = match.phase === 'goal' && match.clock > 0 && match.phaseT < 0.5 ? 0.3 : 1;
      stepMatch(match, dt * slow, { rand, input: human, walls }, events);
      if (match.phase === 'countdown') {
        const n = Math.ceil(MATCH.countdown - match.phaseT);
        if (n !== lastCount && n > 0 && n <= 3) {
          lastCount = n;
          // Full 3-2-1 only at the start; after a goal it is a short "go".
          if (match.phaseT < MATCH.countdown - 1.25) {
            hud.count(n, 'ball');
            ctx.audio.play('tick');
          }
        }
      } else lastCount = -1;
      handleEvents();
      placePlayer(dt);
      return true;
    },
    onRelease() {
      if (phase !== 'idle') cleanup();
      // Hand back on foot with no leftover ride velocity (the hop to the booth is one frame).
      player.launch(new THREE.Vector3(0, 0, 0));
    },
  };

  const removeInteract = ctx.interactions.add({
    id: 'bubbleball',
    position: () => model.booth,
    radius: 3,
    icon: 'bubble',
    enabled: () => phase === 'idle' && player.mode === 'walk',
    onUse() {
      if (phase !== 'idle' || player.mode !== 'walk') return;
      if (!ticket.pay()) return;
      ctx.audio.play('click');
      begin();
    },
  });

  // Walk up to the ball on the pitch: E there starts a match too (walk in → 3-2-1).
  const ballPrompt = new THREE.Vector3();
  const onDeck = (): boolean => {
    const l = worldToLocal(player.position.x - site.x, player.position.z - site.z, site.yaw);
    return Math.abs(l.x) < PITCH.hx && Math.abs(l.z) < PITCH.hz && Math.abs(player.position.y - site.deckY) < 1.5;
  };
  const removeBallInteract = ctx.interactions.add({
    id: 'bubbleball-ball',
    position: () => toWorld(kick.ball.x, 2 * BALL.r + 0.7, kick.ball.z, ballPrompt),
    radius: 2.6,
    icon: 'bubble',
    enabled: () => phase === 'idle' && player.mode === 'walk' && kick.goalT < 0 && onDeck(),
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
    window.__rgBubbleBall = {
      phase: () => phase,
      match: () =>
        match && {
          home: match.score.home,
          away: match.score.away,
          clock: match.clock,
          phase: match.phase,
          charged: match.charged,
          ring: match.ring ? { x: match.ring.x, z: match.ring.z } : null,
          px: match.agents[0].body.x,
          pz: match.agents[0].body.z,
          bx: match.ball.x,
          bz: match.ball.z,
        },
      booth: () => [model.booth.x, model.booth.y, model.booth.z],
      start: () => {
        // Same rule as E at the booth: never take the player from another ride.
        if (phase === 'idle' && player.mode === 'walk') begin();
      },
      ring: (x, z) => {
        if (match) match.ring = { x, z, z0: z, age: 0, popT: 0, alive: true };
      },
      charge: () => {
        if (match) {
          match.charged = RING.chargeSeconds;
          match.chargedBy = 'home';
        }
      },
      setClock: (s) => {
        if (match) match.clock = s;
      },
      world: (x, y, z) => toWorld(x, y, z, new THREE.Vector3()).toArray() as [number, number, number],
      friendsLoaded: () => pool.loaded,
      triangles: () => model.triangles,
      ball: () => {
        const b = match?.ball ?? kick.ball;
        return { x: b.x, y: b.y, z: b.z, vx: b.vx, vz: b.vz };
      },
      placeBall: (x, z) => {
        if (match) return;
        resetKickabout(kick, x, z);
        placeBall(0);
        ballBody.setTranslation(toWorld(x, BALL.r, z, new THREE.Vector3()), true);
      },
      local: (x, y, z) => {
        const l = worldToLocal(x - site.x, z - site.z, site.yaw);
        return [l.x, y - site.deckY, l.z];
      },
      layer: (v) => {
        layerOn = v;
        placeLayer();
      },
    };
  }

  return {
    update(dt) {
      time += dt;
      confetti.update(dt);
      if (phase === 'idle') {
        // Kickabout only while someone is close (zero work otherwise).
        if (player.position.distanceToSquared(arena.position) < 30 * 30 || kick.goalT >= 0) {
          updateKickabout(dt);
          placeBall(dt);
        }
        return;
      }
      if (!match) placeBall(dt); // loading: the ball just sits there
      if (match) {
        placeFriends();
        placeBubbles();
        placeBall(dt);
        placeLayer();
        hud.board({ icon: 'light', value: match.score.home }, { icon: 'dark', value: match.score.away }, match.clock, MATCH.seconds);
        // The dash-kick key stays on screen all match (pictogram + key), dimmed while recharging.
        if (phase === 'match') hud.chip(match.phase === 'play' ? 'kick' : null, ctx.input.state.device === 'gamepad', match.agents[0].hopCd > 0);
      }
      for (const f of friends) f.update(dt);
    },
    dispose() {
      offPhase();
      removeInteract();
      removeBallInteract();
      ctx.physics.world.removeCollider(ballCollider, false);
      ctx.physics.world.removeRigidBody(ballBody);
      if (phase !== 'idle' && player.mode === 'external') player.setExternalController(null);
      cleanup();
      for (const c of colliders) ctx.physics.removeCollider(c);
      ctx.vision.remove(ringView.object);
      ctx.vision.remove(sparkle.object);
      model.group.removeFromParent();
      if (ramp) {
        ramp.removeFromParent();
        ramp.geometry.dispose();
        (ramp.material as THREE.Material).dispose();
      }
      model.dispose();
      bubbles.dispose();
      ballView.dispose();
      ringView.dispose();
      sparkle.dispose();
      confetti.group.removeFromParent();
      confetti.dispose();
      hud.dispose();
      ticket.dispose();
      releaseFriendPool();
      if (ctx.testMode && typeof window !== 'undefined') delete window.__rgBubbleBall;
    },
  };
}
