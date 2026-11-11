/**
 * Silly Zone "Wobble Park" at `anchors.sillyZone`: a soft, comic physics playground with a game on
 * top.
 * - The game, "Boop them all!": stand on the glowing start pad (or press E there), 3-2-1, then bop
 *   every tube person with a bobbing arrow before the clock runs out. Bopped ones turn to face you,
 *   flail, honk and go bright. Each round is seeded (which ones light up, sweeper speed and spin,
 *   pillow timing); fixed seeds in `?test=1`. Ticket via the economy (first play free), prize gems,
 *   a `stamp:earned` for the Fun Pass and a `bigAir` stunt.
 * - Wobbly inflatable tube people (solid: you bump into them, they flail and bounce you back).
 * - A spinning sweeper bar to hop over, two wrecking pillows that boop you into a tumble.
 * - Spinning bumper mushrooms, a giant beach ball, a FLOP button, a see-saw catapult.
 * Nothing breaks and nobody is hurt: every hit is a soft, bounded boing. Gem-worthy positions are
 * exported as `sillySpots`.
 */
import * as THREE from 'three';
import { PLAYER } from '../../config';
import type { GameContext, TicketKind } from '../../types';
import type RAPIER from '@dimforge/rapier3d-compat';
import { fixedStepHooks } from '../../core/physics';
import { getStuntGate } from '../stuntGate';
import { ThrillConfetti } from '../thrillConfetti';
import { Kit, disposeTree } from '../bungee/kit';
import {
  SILLY,
  airTime,
  arcLaunch,
  bumperImpulse,
  bumperTopBounce,
  createTube,
  onBumperTop,
  stepTube,
  touchesBumper,
  whackTube,
} from './logic';
import type { TubeState } from './logic';
import { BOOP, BoopRound, TEST_SEED, distToBar, pillowBoop, pillowOffset, rng, sweeperBoop, sweeperHits } from './game';
import type { RoundEvent } from './game';
import {
  CAPSULE,
  PILLOW_PARTS,
  SEESAW,
  SWEEPER_PARTS,
  addFloorDressing,
  addGantry,
  addSweeperHub,
  addTubeBases,
  createBallMesh,
  createCapsules,
  createFaces,
  createFlopButton,
  createMarkers,
  createMushrooms,
  createSeesaw,
  moving,
  paintTube,
} from './models';
import { createBoard } from './board';
import { createBoopHud } from './hud';

export interface SillySpot {
  position: THREE.Vector3;
  tag: string;
}

/** Live array: cleared and refilled when the Silly Zone is built. */
export const sillySpots: SillySpot[] = [];

/**
 * Ticket kind for "Boop them all!". `TicketKind` has no 'silly' yet (wanted diff in src/types.ts);
 * the economy rules treat any kind generically (first play free, then the attraction price).
 */
const SILLY_TICKET = ('silly' as string) as TicketKind;

/** Test hook (`window.__rgSilly`, only with `?test=1`). */
export interface SillyTestApi {
  ball(): [number, number, number];
  ballHome(): [number, number, number];
  flopButton(): [number, number, number];
  mushrooms(): [number, number, number][];
  seesawCup(): [number, number, number];
  tubes(): [number, number, number][];
  /** Tip bend (radians) of each tube. */
  tubeBend(): number[];
  resetBall(): void;
  /** Start pad centre (stand on it to start a round). */
  startPad(): [number, number, number];
  sweeperHub(): [number, number, number];
  /** Sweeper bar direction angle in the XZ plane (u = (cos a, sin a)). */
  sweeperAngle(): number;
  /** Pillow centres. */
  pillows(): [number, number, number][];
  /** Gantry leg feet and board posts (solid, for walk-into tests). */
  solids(): { name: string; at: [number, number, number]; radius: number }[];
  round(): { phase: string; booped: number; total: number; targets: number[]; timeLeft: number; practice: boolean; result: unknown };
  /** Start a round now (as if the pad was held). */
  startRound(): void;
}

declare global {
  interface Window {
    __rgSilly?: SillyTestApi;
  }
}

export interface Silly {
  update(dt: number): void;
  dispose(): void;
}

type SeesawPhase = 'ready' | 'armed' | 'slam' | 'reset';

/** Tube people (zone-local x, z): five on the north arc, three on the south side. */
const TUBE_LOCAL: [number, number][] = [
  ...[50, 70, 90, 110, 130].map((d): [number, number] => [Math.cos((d * Math.PI) / 180) * 11, Math.sin((d * Math.PI) / 180) * 11]),
  [10.3, -3.8],
  [5, -8.7],
  [-1.6, -7.6],
];
const TUBE_SOLID = { radius: 0.5, halfHeight: 1.4 } as const;
const PAD_LOCAL = { x: 0, z: -12.2, r: 1.3 } as const;
const GANTRY = { x: 0, z: 7.4, halfSpan: 3.6, height: 4.4, pivotDrop: 0.1, pillowX: 1.8 } as const;

export function createSilly(ctx: GameContext): Silly {
  sillySpots.length = 0;
  const R = ctx.physics.rapier;
  const player = ctx.player;
  const a = ctx.world.anchors.sillyZone;
  const S = new THREE.Vector3(a.position.x, ctx.world.heightAt(a.position.x, a.position.z), a.position.z);
  const at = (dx: number, dz: number): THREE.Vector3 => new THREE.Vector3(S.x + dx, ctx.world.heightAt(S.x + dx, S.z + dz), S.z + dz);
  const root = new THREE.Group();
  root.name = 'silly-zone';
  ctx.scene.add(root);
  const confetti = new ThrillConfetti();
  moving(confetti.group);
  root.add(confetti.group);
  const colliders: RAPIER.Collider[] = [];
  /** Every static part goes in here (2 draws). */
  const kit = new Kit();

  // ── Layout (inside the 16 m anchor radius) ──
  const flopPos = at(-5, -9);
  const ballHome = at(-5.5, -4);
  const mushroomPos = [-6, -2, 2, 6].map((dz) => at(-10.5, dz));
  const tubePos = TUBE_LOCAL.map(([x, z]) => at(x, z));
  const tubeHome = tubePos.map((p) => Math.atan2(S.x - p.x, S.z - p.z));
  const tubeYaw = [...tubeHome];
  const seesawC = at(10, 3);
  const hub = at(0, 0);
  const padPos = at(PAD_LOCAL.x, PAD_LOCAL.z);
  const gantryAt = at(GANTRY.x, GANTRY.z);

  addFloorDressing(kit, mushroomPos);

  // ── Beach ball ──
  const ballMesh = createBallMesh();
  root.add(ballMesh);
  const r = SILLY.ball.radius;
  const vol = (4 / 3) * Math.PI * r * r * r;
  const ballBody = ctx.physics.world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(ballHome.x, ballHome.y + r, ballHome.z)
      .setLinearDamping(0.25)
      .setAngularDamping(0.5)
      .setCcdEnabled(true),
  );
  const ballCollider = ctx.physics.world.createCollider(
    R.ColliderDesc.ball(r).setDensity(SILLY.ball.mass / vol).setRestitution(0.72).setFriction(0.9),
    ballBody,
  );
  let ballSquash = 0;
  let ballSquashV = 0;
  let ballCooldown = 0;
  let ballAway = 0;
  const ballPos = new THREE.Vector3();
  const steps = fixedStepHooks(ctx.physics);
  const prevP = new THREE.Vector3();
  const curP = new THREE.Vector3();
  const prevQ = new THREE.Quaternion();
  const curQ = new THREE.Quaternion();
  const snapPose = (): void => {
    const t = ballBody.translation();
    const q = ballBody.rotation();
    curP.set(t.x, t.y, t.z);
    curQ.set(q.x, q.y, q.z, q.w);
    prevP.copy(curP);
    prevQ.copy(curQ);
  };
  snapPose();
  const offStep = steps.onAfterStep(() => {
    prevP.copy(curP);
    prevQ.copy(curQ);
    const t = ballBody.translation();
    const q = ballBody.rotation();
    curP.set(t.x, t.y, t.z);
    curQ.set(q.x, q.y, q.z, q.w);
  });

  function resetBall(): void {
    ballBody.setTranslation({ x: ballHome.x, y: ballHome.y + r + 0.05, z: ballHome.z }, true);
    ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    ballBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    ballAway = 0;
    snapPose();
  }

  // ── Bumper mushrooms ──
  const mush = createMushrooms(mushroomPos, kit);
  root.add(mush.light, mush.dark);
  for (const p of mushroomPos) colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(p.x, p.y + 0.6, p.z), 0.6, 0.5));
  const mushSpin = mushroomPos.map((_, i) => (i % 2 ? -1 : 1) * (0.8 + 0.4 * ((i * 7) % 3) / 2));
  const mushYaw = mushroomPos.map(() => 0);
  const mushSquash = mushroomPos.map(() => ({ s: 0, v: 0 }));
  let bumperCooldown = 0;

  // ── Capsules: tube people, sweeper bar, pillows ──
  const caps = createCapsules(tubePos.length);
  root.add(caps.mesh);
  const faces = createFaces(tubePos.length);
  root.add(faces);
  const markers = createMarkers(tubePos.length);
  root.add(markers);
  addTubeBases(kit, tubePos, tubeHome);
  for (const p of tubePos) colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(p.x, p.y + TUBE_SOLID.halfHeight, p.z), TUBE_SOLID.halfHeight, TUBE_SOLID.radius));
  const tubeStates: TubeState[] = tubePos.map((_, i) => createTube(i * 1.7 + 0.4));
  const tubeInside = tubePos.map(() => false);
  const tubeTip = tubePos.map(() => 0);
  const tubeCool = tubePos.map(() => 0);
  const tubeHappy = tubePos.map(() => false);
  /** Seconds left of a big happy flail after a bop. */
  const tubeParty = tubePos.map(() => 0);
  tubePos.forEach((_, i) => paintTube(caps, i, false));

  // ── Sweeper bar ──
  addSweeperHub(kit, hub);
  colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(hub.x, hub.y + 0.6, hub.z), 0.6, 0.7));
  let sweepRot = 0;
  let sweepDir: 1 | -1 = 1;
  let sweepSpeed = 0.6;
  let sweepCool = 0;

  // ── Wrecking pillows on a gantry ──
  addGantry(kit, { at: gantryAt, halfSpan: GANTRY.halfSpan, height: GANTRY.height });
  for (const sx of [-1, 1]) {
    colliders.push(ctx.physics.addStaticBox(new THREE.Vector3(gantryAt.x + sx * GANTRY.halfSpan, gantryAt.y + 1.1, gantryAt.z), new THREE.Vector3(0.2, 1.1, 1.2)));
  }
  const pivotY = gantryAt.y + GANTRY.height - GANTRY.pivotDrop;
  const pillowPivots = [-1, 1].map((s) => new THREE.Vector3(gantryAt.x + s * GANTRY.pillowX, pivotY, gantryAt.z));
  let pillowPeriod: [number, number] = [2.8, 3.0];
  let pillowPhase: [number, number] = [0, Math.PI * 0.7];
  const pillowPos = pillowPivots.map((p) => p.clone());
  const pillowVz = [0, 0];
  let pillowCool = 0;

  // ── FLOP button ──
  const flopCap = createFlopButton(flopPos, kit);
  root.add(flopCap);
  let flopArmed = true;
  let flopT = 0;
  let flopPress = 0;

  // ── See-saw ──
  const seesaw = createSeesaw(seesawC, kit);
  const seesawRoot = new THREE.Group();
  seesawRoot.position.copy(seesawC);
  seesawRoot.add(seesaw.plank, seesaw.jelly);
  root.add(seesawRoot);
  colliders.push(ctx.physics.addStaticBox(new THREE.Vector3(seesawC.x, seesawC.y + 0.4, seesawC.z), new THREE.Vector3(0.6, 0.4, 0.6)));
  colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(seesawC.x + SEESAW.half + 0.2, seesawC.y + SEESAW.pedestal / 2, seesawC.z + 1.7), SEESAW.pedestal / 2, 0.6));
  const restTilt = Math.asin((SEESAW.pivotY - 0.12) / SEESAW.half);
  let tilt = restTilt;
  let seesawPhase: SeesawPhase = 'ready';
  let seesawT = 0;
  let seesawArmed = true;
  const cup = new THREE.Vector3(seesawC.x - SEESAW.half + 0.55, seesawC.y, seesawC.z);
  const pedestalTop = new THREE.Vector3(SEESAW.half + 0.2, SEESAW.pedestal, 1.7);
  const stompLocal = new THREE.Vector3();
  let jellySquash = 0;
  let jellySquashV = 0;

  // ── Picture board + start pad ──
  const boardPos = at(3.5, -11.6);
  const board = createBoard({ board: boardPos, boardYaw: Math.PI, pad: padPos, padRadius: PAD_LOCAL.r }, kit);
  root.add(board.mesh);
  const boardPosts = [-1, 1].map((s) => new THREE.Vector3(boardPos.x - s * (1.75 + 0.05), boardPos.y, boardPos.z + 0.06));
  for (const p of boardPosts) colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(p.x, p.y + 1.5, p.z), 1.5, 0.14));

  // All the static parts: two draws.
  const statics = kit.build('silly-static');
  root.add(statics);

  // Tumble after a launch or a boop (visual only; cleared on landing).
  let flipT = -1;
  let flipDur = 1;
  let flipAxis: 'x' | 'z' = 'x';
  const flipQ = new THREE.Quaternion();
  const flipE = new THREE.Euler();
  const tumble = (dur: number, axis: 'x' | 'z'): void => {
    flipT = 0;
    flipDur = dur;
    flipAxis = axis;
  };

  // ── Gem-worthy spots ──
  for (const [i, p] of mushroomPos.entries()) sillySpots.push({ position: new THREE.Vector3(p.x, p.y + SILLY.bumper.top + 3, p.z), tag: `sillyMushroom${i + 1}` });
  sillySpots.push({ position: new THREE.Vector3(ballHome.x, ballHome.y + 2 * r + 3.2, ballHome.z), tag: 'sillyBall' });
  {
    const v = arcLaunch(-1, 0, SILLY.seesaw.distance, SILLY.seesaw.apex, PLAYER.gravity);
    const t = airTime(v.y, PLAYER.gravity) / 2;
    sillySpots.push({ position: new THREE.Vector3(cup.x + v.x * t, cup.y + SILLY.seesaw.apex + 0.3 + PLAYER.height / 2, cup.z), tag: 'sillySeesaw' });
  }
  sillySpots.push({ position: new THREE.Vector3(flopPos.x, flopPos.y + 1.2, flopPos.z), tag: 'sillyFlop' });
  for (let i = 0; i + 1 < 5; i += 2) {
    const m = tubePos[i].clone().lerp(tubePos[i + 1], 0.5);
    sillySpots.push({ position: new THREE.Vector3(m.x, m.y + 1.2, m.z), tag: `sillyTubes${i / 2 + 1}` });
  }

  // ── The game ──
  const round = new BoopRound(tubePos.length);
  const hud = createBoopHud(ctx.uiRoot);
  let roundNo = 0;
  let padHold = 0;
  let goShown = 0;
  /** Random wobble gusts (seeded in test mode so frames repeat). */
  const gustRng = ctx.testMode ? rng(TEST_SEED) : Math.random;
  let gustIn = 3;

  // ── Helpers ──
  const pv = new THREE.Vector3();
  const walking = (): boolean => player.mode === 'walk';
  const launch = (v: { x: number; y: number; z: number }): void => {
    player.launch(pv.set(v.x, v.y, v.z));
  };

  function startRound(): void {
    if (round.phase === 'countdown' || round.phase === 'play') return;
    const economy = (ctx as Partial<GameContext>).economy;
    const practice = economy ? economy.rideTicket(SILLY_TICKET) === 'practice' : false;
    roundNo++;
    const seed = ctx.testMode ? TEST_SEED + roundNo : Math.floor(Math.random() * 2 ** 31);
    handle(round.start(seed, practice));
    const plan = round.plan;
    if (plan) {
      sweepDir = plan.sweeperDir;
      pillowPeriod = plan.pillowPeriod;
      pillowPhase = plan.pillowPhase;
    }
    tubePos.forEach((_, i) => {
      tubeHappy[i] = false;
      paintTube(caps, i, false);
    });
    hud.result(null);
    hud.show(true);
    padHold = 0;
    ctx.audio.play('click');
  }

  function endRound(): void {
    round.cancel();
    hud.show(false);
    hud.count(null);
    hud.result(null);
    goShown = 0;
  }

  function celebrate(): void {
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      confetti.burst(new THREE.Vector3(player.position.x + Math.cos(ang) * 2, player.position.y + 2.5, player.position.z + Math.sin(ang) * 2), 70);
    }
    // Every tube person cheers.
    tubePos.forEach((_, i) => {
      tubeParty[i] = 2.5;
      whackTube(tubeStates[i], 0, 1, 3);
    });
  }

  function handle(events: RoundEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'count':
          hud.count(e.n);
          ctx.audio.play('tick', { pitch: 1 + (3 - e.n) * 0.12 });
          break;
        case 'go':
          hud.count('go');
          goShown = 0.8;
          ctx.audio.play('start');
          break;
        case 'boop':
          hud.pop();
          ctx.audio.play('star', { pitch: 1 + e.booped * 0.08 });
          break;
        case 'end': {
          const res = e.result;
          hud.count(null);
          hud.result(res);
          const prof = (ctx as Partial<GameContext>).profile;
          if (res.prize > 0 && prof) prof.earn(res.prize, 'mission');
          if (res.stars > 0) ctx.events.emit('stunt', { kind: 'bigAir', value: res.booped, stars: res.stars });
          ctx.events.emit('stamp:earned', { id: 'sillyZone' });
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rg:attraction-done', { detail: { id: 'sillyZone', win: res.win, stars: res.stars, booped: res.booped } }));
          if (res.win) {
            ctx.audio.play('fanfare');
            celebrate();
          } else {
            ctx.audio.play('horn', { pitch: 0.7, volume: 0.6 });
            ctx.audio.play('boing', { pitch: 0.5 });
          }
          break;
        }
      }
    }
  }

  function updateRound(dt: number): void {
    // Start pad: stand on it (on foot, on the ground) for a moment.
    const p = player.position;
    const onPad = walking() && Math.hypot(p.x - padPos.x, p.z - padPos.z) < PAD_LOCAL.r && Math.abs(p.y - padPos.y) < 0.8;
    const idle = round.phase === 'idle' || round.phase === 'done';
    if (onPad && idle) {
      padHold += dt;
      if (padHold >= BOOP.startHold) startRound();
    } else if (!onPad) padHold = 0;
    board.setGlow(idle ? 0.5 + 0.5 * Math.sin(time * 4) : 0);
    // Leaving the zone ends a round quietly.
    if ((round.phase === 'countdown' || round.phase === 'play') && Math.hypot(p.x - S.x, p.z - S.z) > BOOP.leaveRadius) endRound();
    const wasDone = round.phase === 'done';
    handle(round.update(dt));
    if (wasDone && round.phase === 'idle') {
      hud.show(false);
      hud.result(null);
    }
    if (goShown > 0) {
      goShown -= dt;
      if (goShown <= 0) hud.count(null);
    }
    if (round.phase !== 'idle') hud.set(round.booped.size, round.total, round.timeLeft);
    // Sweeper speed follows the round (faster with every bop); a lazy spin between rounds.
    const want = round.phase === 'play' ? round.sweeperSpeed() : 0.55;
    sweepSpeed += (want - sweepSpeed) * Math.min(1, dt * 1.5);
    // Random wobble gusts: one tube person gets a shove now and then.
    gustIn -= dt;
    if (gustIn <= 0) {
      gustIn = 2.5 + gustRng() * 4;
      const i = Math.floor(gustRng() * tubePos.length);
      const ang = gustRng() * Math.PI * 2;
      whackTube(tubeStates[i], Math.cos(ang), Math.sin(ang), 2 + gustRng() * 2);
    }
  }

  function updateBall(dt: number): void {
    const t = ballBody.translation();
    ballPos.set(t.x, t.y, t.z);
    const far = Math.hypot(t.x - ballHome.x, t.z - ballHome.z);
    const inWater = t.y < ctx.world.waterLevel + 0.4 || !Number.isFinite(t.y);
    const nearPlayer = player.position.distanceTo(ballPos) < 10;
    ballAway = far > 22 && !nearPlayer ? ballAway + dt : 0;
    if (inWater || far > 70 || ballAway > 12) {
      resetBall();
      confetti.burst(new THREE.Vector3(ballHome.x, ballHome.y + r * 2, ballHome.z), 40);
      ctx.audio.play('boing', { pitch: 1.4, volume: 0.5 });
    }
    ballCooldown = Math.max(0, ballCooldown - dt);
    // The sweeper bar knocks the ball along too.
    {
      const lx = t.x - hub.x;
      const lz = t.z - hub.z;
      const hit = distToBar(lx, lz, -sweepRot, BOOP.sweeper.length);
      if (hit.d < r + BOOP.sweeper.halfWidth && t.y - hub.y < r + 0.7 && Math.hypot(lx, lz) > 0.8) {
        const v = sweeperBoop(lx, lz, sweepDir * sweepSpeed);
        const k = SILLY.ball.mass * 0.35 * dt * 60 * 0.1;
        ballBody.applyImpulse({ x: v.x * k, y: 0.5 * k, z: v.z * k }, true);
      }
    }
    if (walking()) {
      const p = player.position;
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const dh = Math.hypot(dx, dz);
      const top = t.y + r;
      if (ballCooldown <= 0 && dh < r * 0.75 && p.y > top - 0.55 && p.y < top + 0.4 && player.velocity.y <= 0.5) {
        launch({ x: player.velocity.x * 0.6, y: SILLY.ball.bounce, z: player.velocity.z * 0.6 });
        ballBody.applyImpulse({ x: 0, y: -SILLY.ball.mass * 4, z: 0 }, true);
        ballSquashV -= 9;
        ballCooldown = 0.4;
        ctx.audio.play('boing', { pitch: 0.8 });
      } else if (dh < r + PLAYER.radius + 0.25 && p.y < t.y + 0.2 && dh > 1e-3) {
        const nx = dx / dh;
        const nz = dz / dh;
        const into = player.velocity.x * nx + player.velocity.z * nz;
        if (into > 0.5) {
          const k = SILLY.ball.mass * into * 1.6 * dt;
          ballBody.applyImpulse({ x: nx * k, y: k * 0.15, z: nz * k }, true);
        }
      }
    }
    ballSquashV += (-120 * ballSquash - 9 * ballSquashV) * dt;
    ballSquash += ballSquashV * dt;
    const al = steps.alpha;
    ballMesh.position.lerpVectors(prevP, curP, al);
    ballMesh.position.y += ballSquash * r * 0.5;
    ballMesh.quaternion.slerpQuaternions(prevQ, curQ, al);
    const sq = Math.max(-0.35, Math.min(0.35, ballSquash));
    ballMesh.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
  }

  function updateMushrooms(dt: number): void {
    bumperCooldown = Math.max(0, bumperCooldown - dt);
    const p = player.position;
    mushroomPos.forEach((m, i) => {
      const sq = mushSquash[i];
      mushYaw[i] += mushSpin[i] * 2.4 * dt;
      sq.v += (-160 * sq.s - 10 * sq.v) * dt;
      sq.s += sq.v * dt;
      mush.pose(i, mushYaw[i], sq.s);
      if (!walking() || bumperCooldown > 0) return;
      const rx = p.x - m.x;
      const rz = p.z - m.z;
      const dh = Math.hypot(rx, rz);
      const y = p.y - m.y;
      if (onBumperTop(dh, y, player.velocity.y)) {
        launch(bumperTopBounce(rx, rz, mushSpin[i]));
        sq.v += 6;
        bumperCooldown = SILLY.bumper.cooldown;
        ctx.audio.play('boing', { pitch: 1.1 + i * 0.08 });
      } else if (touchesBumper(dh, y, PLAYER.radius)) {
        launch(bumperImpulse(rx, rz, mushSpin[i], player.velocity));
        sq.v += 4;
        bumperCooldown = SILLY.bumper.cooldown;
        ctx.audio.play('boing', { pitch: 1.3 + i * 0.1, volume: 0.8 });
        ctx.cameraRig.shake(0.15);
      }
    });
  }

  const tubeQ = new THREE.Quaternion();
  const segQ = new THREE.Quaternion();
  const e = new THREE.Euler();
  const joint = new THREE.Vector3();
  const off = new THREE.Vector3();
  const mtx = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const centre = new THREE.Vector3();
  const armQ = new THREE.Quaternion();
  const sh = new THREE.Vector3();
  const o = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const armScale = new THREE.Vector3(0.12 / CAPSULE.radius, 0.5 / (CAPSULE.length + 2 * CAPSULE.radius), 0.12 / CAPSULE.radius);
  const zero = new THREE.Vector3(0, 0, 0);
  let time = 0;

  function bopTube(ti: number, dx: number, dz: number): void {
    // dx, dz: unit vector from the player towards the tube (world).
    const s = tubeStates[ti];
    const yaw = tubeYaw[ti];
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const sp = Math.hypot(player.velocity.x, player.velocity.z);
    whackTube(s, cy * dx - sy * dz, sy * dx + cy * dz, 3.5 + sp * 0.5);
    tubeCool[ti] = 0.6;
    tubeParty[ti] = Math.max(tubeParty[ti], 1.2);
    ctx.audio.play('horn', { pitch: 1.5 + (ti % 4) * 0.12, volume: 0.45 });
    ctx.audio.play('squeak', { pitch: 1 + (ti % 3) * 0.15, volume: 0.7 });
    // A soft bounce back (only on foot: never takes the player from a ride).
    if (walking()) launch({ x: -dx * 5.5, y: 4.2, z: -dz * 5.5 });
    const events = round.boop(ti);
    if (events.length) {
      tubeHappy[ti] = true;
      paintTube(caps, ti, true);
      const head = tubePos[ti];
      confetti.burst(new THREE.Vector3(head.x, head.y + 3.6, head.z), 60);
      handle(events);
    }
  }

  function updateTubes(dt: number): void {
    const segs = SILLY.tube.segments;
    const L = SILLY.tube.segLen;
    const p = player.position;
    tubePos.forEach((base, ti) => {
      const s = tubeStates[ti];
      tubeCool[ti] = Math.max(0, tubeCool[ti] - dt);
      tubeParty[ti] = Math.max(0, tubeParty[ti] - dt);
      const dx = base.x - p.x;
      const dz = base.z - p.z;
      const dh = Math.hypot(dx, dz);
      // Bopped (and partying) tube people turn to look at you; the rest face the middle.
      const look = tubeHappy[ti] || tubeParty[ti] > 0 ? Math.atan2(-dx, -dz) : tubeHome[ti];
      let dy = look - tubeYaw[ti];
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      tubeYaw[ti] += dy * Math.min(1, dt * 5);
      const yaw = tubeYaw[ti];
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      let push = 0;
      let lx = 0;
      let lz = 0;
      const inside = dh < SILLY.tube.pushRadius && p.y < base.y + 3.5 && p.y > base.y - 1;
      if (inside && dh > 1e-3) {
        push = 1 - dh / SILLY.tube.pushRadius;
        const wx = dx / dh;
        const wz = dz / dh;
        lx = cy * wx - sy * wz;
        lz = sy * wx + cy * wz;
        if (!tubeInside[ti]) whackTube(s, lx, lz, 1.2);
        // Contact: a bop.
        if (dh < TUBE_SOLID.radius + PLAYER.radius + 0.4 && tubeCool[ti] <= 0) bopTube(ti, wx, wz);
      }
      tubeInside[ti] = inside;
      const party = tubeParty[ti] > 0 ? 2.2 : 1;
      const tip = stepTube(s, (time + ti * 3.1) * party, dt, push, lx, lz);
      tubeTip[ti] = Math.hypot(tip.ax, tip.az);
      tubeQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      joint.set(base.x, base.y + 0.45, base.z);
      for (let i = 0; i < segs; i++) {
        e.set(s.ax[i], 0, s.az[i]);
        tubeQ.multiply(segQ.setFromEuler(e));
        off.set(0, L / 2, 0).applyQuaternion(tubeQ);
        centre.copy(joint).add(off);
        caps.mesh.setMatrixAt(caps.tubeBody + ti * segs + i, mtx.compose(centre, tubeQ, one));
        joint.addScaledVector(off, 2);
        if (i === 3) {
          for (let side = 0; side < 2; side++) {
            const sgn = side ? 1 : -1;
            const ang = s.arm[side] + (tubeParty[ti] > 0 ? 0.6 * Math.sin(time * 14 + side * 2) : 0);
            armQ.copy(tubeQ).multiply(segQ.setFromEuler(e.set(0.3 * Math.sin(time * 3 + side), 0, -sgn * (0.4 + ang))));
            sh.set(sgn * 0.3, -0.05, 0).applyQuaternion(tubeQ).add(joint);
            for (let k = 0; k < 2; k++) {
              o.set(0, 0.27, 0).applyQuaternion(armQ);
              caps.mesh.setMatrixAt(caps.tubeArms + ti * 4 + side * 2 + k, mtx.compose(tmp.copy(sh).add(o), armQ, armScale));
              sh.addScaledVector(o, 2);
              armQ.multiply(segQ.setFromEuler(e.set(0, 0, -sgn * ang * 0.6)));
            }
          }
        }
        if (i === segs - 1) {
          // Face: two eyes with pupils and a round "O" mouth (bigger when bopped).
          for (let side = 0; side < 2; side++) {
            const sgn = side ? 1 : -1;
            tmp.set(sgn * 0.13, 0.12, 0.29).applyQuaternion(tubeQ).add(centre);
            faces.setMatrixAt(ti * 5 + side, mtx.compose(tmp, tubeQ, o.setScalar(0.11)));
            tmp.set(sgn * 0.13, 0.12 + Math.sin(time * 4 + ti) * 0.02, 0.38).applyQuaternion(tubeQ).add(centre);
            faces.setMatrixAt(ti * 5 + 2 + side, mtx.compose(tmp, tubeQ, o.setScalar(0.055)));
          }
          const big = tubeParty[ti] > 0 ? 1.6 : 1;
          tmp.set(0, -0.08, 0.31).applyQuaternion(tubeQ).add(centre);
          faces.setMatrixAt(ti * 5 + 4, mtx.compose(tmp, tubeQ, o.set(0.09 * big, 0.07 * big, 0.04)));
          // Marker: a bobbing arrow over a lit tube person (during the 3-2-1 too, so you can plan).
          const lit = round.isTarget(ti) && !round.booped.has(ti);
          tmp.set(centre.x, base.y + 4.6 + Math.sin(time * 5 + ti) * 0.25, centre.z);
          markers.setMatrixAt(ti, mtx.compose(tmp, segQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, time * 2), lit ? one : zero));
        }
      }
    });
    caps.mesh.instanceMatrix.needsUpdate = true;
    faces.instanceMatrix.needsUpdate = true;
    markers.instanceMatrix.needsUpdate = true;
  }

  const barQ = new THREE.Quaternion();
  const barTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const barScale = new THREE.Vector3();
  function updateSweeper(dt: number): void {
    sweepRot += sweepDir * sweepSpeed * dt;
    sweepCool = Math.max(0, sweepCool - dt);
    const sw = BOOP.sweeper;
    const segLen = (2 * sw.length) / SWEEPER_PARTS;
    const full = CAPSULE.length + 2 * CAPSULE.radius;
    barQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, sweepRot).multiply(barTilt);
    const ux = Math.cos(sweepRot);
    const uz = -Math.sin(sweepRot);
    const y = hub.y + 0.34;
    barScale.set(sw.halfWidth / CAPSULE.radius, segLen / full, sw.halfWidth / CAPSULE.radius);
    for (let i = 0; i < SWEEPER_PARTS; i++) {
      const t = -sw.length + (i + 0.5) * segLen;
      caps.mesh.setMatrixAt(caps.sweeper + i, mtx.compose(tmp.set(hub.x + ux * t, y, hub.z + uz * t), barQ, barScale));
    }
    for (let k = 0; k < 2; k++) {
      const t = (k ? 1 : -1) * (sw.length + 0.1);
      caps.mesh.setMatrixAt(caps.sweeper + SWEEPER_PARTS + k, mtx.compose(tmp.set(hub.x + ux * t, y + 0.05, hub.z + uz * t), barQ, o.set(1.25, 0.55, 1.25)));
    }
    const p = player.position;
    const lx = p.x - hub.x;
    const lz = p.z - hub.z;
    if (walking() && sweepCool <= 0 && sweeperHits(lx, lz, p.y - hub.y, -sweepRot, PLAYER.radius)) {
      launch(sweeperBoop(lx, lz, sweepDir * sweepSpeed));
      tumble(0.9, 'z');
      sweepCool = 0.8;
      ctx.audio.play('bigBoing', { pitch: 1.3, volume: 0.8 });
      ctx.audio.play('squeak', { pitch: 0.8 });
      ctx.cameraRig.shake(0.2);
    }
  }

  const ropeQ = new THREE.Quaternion();
  const pillowQ = new THREE.Quaternion();
  const ropeScale = new THREE.Vector3();
  const pillowScale = new THREE.Vector3(0.75 / CAPSULE.radius, 1.9 / (CAPSULE.length + 2 * CAPSULE.radius), 0.6 / CAPSULE.radius);
  const xAxis = new THREE.Vector3(1, 0, 0);
  function updatePillows(dt: number): void {
    pillowCool = Math.max(0, pillowCool - dt);
    const full = CAPSULE.length + 2 * CAPSULE.radius;
    const pl = BOOP.pillow;
    pillowPivots.forEach((pv0, i) => {
      const off2 = pillowOffset(time, pillowPeriod[i], pillowPhase[i]);
      const ang = Math.atan2(off2.z, -off2.y);
      pillowPos[i].set(pv0.x, pv0.y + off2.y, pv0.z + off2.z);
      pillowVz[i] = off2.vz;
      ropeQ.setFromAxisAngle(xAxis, -ang);
      ropeScale.set(0.05 / CAPSULE.radius, pl.rope / full, 0.05 / CAPSULE.radius);
      caps.mesh.setMatrixAt(caps.pillows + i, mtx.compose(tmp.set(pv0.x, pv0.y + off2.y / 2, pv0.z + off2.z / 2), ropeQ, ropeScale));
      pillowQ.copy(ropeQ).multiply(barTilt);
      caps.mesh.setMatrixAt(caps.pillows + 2 + i, mtx.compose(pillowPos[i], pillowQ, pillowScale));
    });
    void PILLOW_PARTS;
    if (!walking() || pillowCool > 0) return;
    const p = player.position;
    for (let i = 0; i < 2; i++) {
      const c = pillowPos[i];
      const dx = p.x - c.x;
      const dy = p.y + 0.85 - c.y;
      const dz = p.z - c.z;
      // The pillow is wide along X: an ellipsoid test.
      const d = Math.hypot(dx / 1.5, dy / 1.0, dz / 1.0);
      if (d < 1 + PLAYER.radius * 0.8) {
        const v = pillowBoop(dz, pillowVz[i]);
        launch({ x: Math.sign(dx) * 1.5, y: v.y, z: v.z });
        tumble(1.0, 'x');
        pillowCool = 0.8;
        ctx.audio.play('bigBoing', { pitch: 0.8, volume: 0.9 });
        ctx.audio.play('squeak', { pitch: 1.3 });
        ctx.cameraRig.shake(0.25);
        break;
      }
    }
  }

  function updateFlop(dt: number): void {
    flopT += dt;
    const p = player.position;
    const dh = Math.hypot(p.x - flopPos.x, p.z - flopPos.z);
    const on = dh < SILLY.flop.radius && p.y < flopPos.y + 0.8 && p.y > flopPos.y - 0.5;
    if (!on && dh > SILLY.flop.radius + 0.5) flopArmed = true;
    if (on && walking() && player.grounded && (flopArmed || flopT > SILLY.flop.rearmAfter)) {
      flopArmed = false;
      flopT = 0;
      flopPress = 1;
      player.flop();
      confetti.burst(new THREE.Vector3(flopPos.x, flopPos.y + 0.6, flopPos.z), 110);
      ctx.audio.play('boing', { pitch: 0.6 });
      ctx.audio.play('star', { volume: 0.6 });
      ctx.cameraRig.shake(0.25);
    }
    const want = on ? 1 : 0;
    flopPress += (want - flopPress) * Math.min(1, dt * (want ? 18 : 5));
    const sy = 1 - 0.5 * flopPress;
    flopCap.scale.y = sy;
    flopCap.position.y = flopPos.y + 0.06 + 0.12 * sy;
  }

  function updateSeesaw(dt: number): void {
    seesawT += dt;
    const p = player.position;
    const inCup = Math.hypot(p.x - cup.x, p.z - cup.z) < 0.85 && p.y < cup.y + 0.8 && p.y > cup.y - 0.5;
    if (!inCup) seesawArmed = true;
    const jellyHome = pedestalTop;
    const stompAt = (tl: number): THREE.Vector3 =>
      stompLocal.set(Math.cos(tl) * (SEESAW.half - 0.6), SEESAW.pivotY + Math.sin(tl) * (SEESAW.half - 0.6) + 0.15, 0);
    switch (seesawPhase) {
      case 'ready': {
        tilt += (restTilt - tilt) * Math.min(1, dt * 6);
        seesaw.jelly.position.copy(jellyHome);
        if (inCup && seesawArmed && walking() && player.grounded) {
          seesawPhase = 'armed';
          seesawT = 0;
          seesawArmed = false;
          jellySquashV -= 6;
          ctx.audio.play('click');
        }
        break;
      }
      case 'armed': {
        const k = Math.min(1, seesawT / SILLY.seesaw.armDelay);
        const to = stompAt(restTilt);
        seesaw.jelly.position.lerpVectors(jellyHome, to, k);
        seesaw.jelly.position.y += Math.sin(Math.PI * k) * 1.6;
        if (k >= 1) {
          seesawPhase = 'slam';
          seesawT = 0;
          jellySquashV -= 10;
          ctx.audio.play('bigBoing', { pitch: 1.2, volume: 0.8 });
          if (inCup && walking()) {
            const dir = new THREE.Vector3(-1, 0, 0);
            const v = arcLaunch(dir.x, dir.z, SILLY.seesaw.distance, SILLY.seesaw.apex, PLAYER.gravity);
            player.yaw = Math.atan2(dir.x, dir.z);
            launch(v);
            tumble(airTime(v.y, PLAYER.gravity), 'x');
            ctx.audio.play('whoosh', { pitch: 1.4, volume: 0.6 });
            getStuntGate(ctx).stunt({ kind: 'launch', value: SILLY.seesaw.distance, stars: 1 });
          }
        }
        break;
      }
      case 'slam': {
        tilt += (-restTilt - tilt) * Math.min(1, dt * 30);
        seesaw.jelly.position.copy(stompAt(tilt));
        if (seesawT > 1.3) {
          seesawPhase = 'reset';
          seesawT = 0;
        }
        break;
      }
      case 'reset': {
        const k = Math.min(1, seesawT / 0.7);
        seesaw.jelly.position.lerpVectors(stompAt(tilt), jellyHome, k);
        seesaw.jelly.position.y += Math.sin(Math.PI * k) * 1.2;
        tilt += (restTilt - tilt) * Math.min(1, dt * 3);
        if (k >= 1) {
          seesawPhase = 'ready';
          jellySquashV -= 5;
        }
        break;
      }
    }
    seesaw.plank.rotation.z = tilt;
    jellySquashV += (-140 * jellySquash - 7 * jellySquashV) * dt;
    jellySquash += jellySquashV * dt;
    const js = Math.max(-0.4, Math.min(0.4, jellySquash * 0.1));
    seesaw.jellyBody.scale.set(1 - js * 0.6, 1 + js, 1 - js * 0.6);
    seesaw.jelly.rotation.y = -Math.PI / 2 + Math.sin(time * 1.3) * 0.15;
  }

  function updateTumble(dt: number): void {
    if (flipT < 0) return;
    flipT += dt;
    if (!walking() || (flipT > 0.15 && player.grounded) || flipT > flipDur + 0.6) {
      flipT = -1;
      if (walking()) player.setVisualRotation(null);
      return;
    }
    const k = Math.min(1, flipT / (flipDur * 0.9));
    const ang = Math.PI * 2 * (k * k * (3 - 2 * k));
    flipE.set(flipAxis === 'x' ? ang : 0, 0, flipAxis === 'z' ? ang : 0);
    player.setVisualRotation(flipQ.setFromEuler(flipE));
  }

  const offPhase = ctx.events.on('session:phase', (ev) => {
    if (ev.phase !== 'playing' && ev.phase !== 'paused') endRound();
    if (ev.phase === 'playing' && ev.previous === 'title') {
      resetBall();
      seesawPhase = 'ready';
      tilt = restTilt;
      flopArmed = true;
      endRound();
      tubePos.forEach((_, i) => {
        tubeHappy[i] = false;
        paintTube(caps, i, false);
      });
    }
  });
  const offRespawn = ctx.events.on('player:respawn', () => {
    if (round.phase === 'countdown' || round.phase === 'play') endRound();
  });

  // E at the start pad starts a round too (for kids who press buttons).
  const padPrompt = new THREE.Vector3(padPos.x, padPos.y + 1, padPos.z);
  const removeInteract = ctx.interactions.add({
    id: 'silly-boop',
    position: () => padPrompt,
    radius: 2.2,
    icon: 'hand',
    enabled: () => (round.phase === 'idle' || round.phase === 'done') && player.mode === 'walk',
    onUse: () => startRound(),
  });

  if (ctx.testMode && typeof window !== 'undefined') {
    const arr = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z];
    window.__rgSilly = {
      ball: () => arr(ballBody.translation()),
      ballHome: () => arr(ballHome),
      flopButton: () => arr(flopPos),
      mushrooms: () => mushroomPos.map(arr),
      seesawCup: () => arr(cup),
      tubes: () => tubePos.map(arr),
      tubeBend: () => [...tubeTip],
      resetBall,
      startPad: () => arr(padPos),
      sweeperHub: () => arr(hub),
      sweeperAngle: () => -sweepRot,
      pillows: () => pillowPos.map(arr),
      solids: () => [
        ...tubePos.map((p, i) => ({ name: `tube${i}`, at: arr(p), radius: TUBE_SOLID.radius })),
        ...mushroomPos.map((p, i) => ({ name: `mushroom${i}`, at: arr(p), radius: 0.5 })),
        { name: 'hub', at: arr(hub), radius: 0.7 },
        { name: 'seesaw', at: arr(seesawC), radius: 0.6 },
        { name: 'pedestal', at: arr(new THREE.Vector3(seesawC.x + SEESAW.half + 0.2, seesawC.y, seesawC.z + 1.7)), radius: 0.6 },
        ...[-1, 1].map((s) => ({ name: `gantry${s}`, at: arr(new THREE.Vector3(gantryAt.x + s * GANTRY.halfSpan, gantryAt.y, gantryAt.z)), radius: 0.2 })),
        ...boardPosts.map((p, i) => ({ name: `post${i}`, at: arr(p), radius: 0.14 })),
      ],
      round: () => ({
        phase: round.phase,
        booped: round.booped.size,
        total: round.total,
        targets: [...(round.plan?.targets ?? [])],
        timeLeft: round.timeLeft,
        practice: round.practice,
        result: round.result,
      }),
      startRound,
    };
  }

  // Pose everything once so the zone looks right before the first playing frame.
  updateTubes(0);
  updateSweeper(0);
  updatePillows(0);
  updateBall(0);
  mushroomPos.forEach((_, i) => mush.pose(i, 0, 0));
  seesaw.plank.rotation.z = tilt;
  seesaw.jelly.position.copy(pedestalTop);

  return {
    update(dt) {
      time += dt;
      updateRound(dt);
      updateBall(dt);
      updateMushrooms(dt);
      updateTubes(dt);
      updateSweeper(dt);
      updatePillows(dt);
      updateFlop(dt);
      updateSeesaw(dt);
      updateTumble(dt);
      confetti.update(dt);
    },
    dispose() {
      offPhase();
      offRespawn();
      offStep();
      removeInteract();
      hud.dispose();
      for (const c of colliders) ctx.physics.removeCollider(c);
      ctx.physics.world.removeCollider(ballCollider, false);
      ctx.physics.world.removeRigidBody(ballBody);
      confetti.dispose();
      disposeTree(root);
      sillySpots.length = 0;
      if (ctx.testMode && typeof window !== 'undefined') delete window.__rgSilly;
    },
  };
}
