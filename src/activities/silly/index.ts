/**
 * Silly Zone: a soft, comic physics playground at `anchors.sillyZone`.
 * - A giant beach ball (Rapier dynamic body): push it, bounce on it, roll it down the slope.
 * - Wobbly inflatable tube characters that flail and bend away when you run through them.
 * - A big round FLOP button: step on it → comic flop + confetti.
 * - A row of spinning bumper mushrooms that boing you sideways (or straight up off the top).
 * - A see-saw catapult: step in the cup, the jelly hops onto the far end and flips you a few metres.
 * Nothing breaks and nobody is hurt. Everything only reacts to a player in walk mode, so it never
 * takes the player from a ride. Gem-worthy positions are exported as `sillySpots`.
 */
import * as THREE from 'three';
import { PLAYER } from '../../config';
import type { GameContext } from '../../types';
import type RAPIER from '@dimforge/rapier3d-compat';
import { fixedStepHooks } from '../../core/physics';
import { getStuntGate } from '../stuntGate';
import { ThrillConfetti } from '../thrillConfetti';
import { disposeTree } from '../bungee/kit';
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
import { SEESAW, createBallMesh, createFloorDressing, createFlopButton, createMushrooms, createSeesaw, createTubes } from './models';

export interface SillySpot {
  position: THREE.Vector3;
  tag: string;
}

/** Live array: cleared and refilled when the Silly Zone is built. */
export const sillySpots: SillySpot[] = [];

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
  root.add(confetti.group);
  const colliders: RAPIER.Collider[] = [];

  // ── Layout (inside the 16 m anchor radius) ──
  const flopPos = at(-5, -9);
  const ballHome = at(2, -4);
  const mushroomPos = [-6, -2, 2, 6].map((dz) => at(-10.5, dz));
  const tubeAngles = [50, 70, 90, 110, 130].map((d) => (d * Math.PI) / 180);
  const tubePos = tubeAngles.map((ang) => at(Math.cos(ang) * 11, Math.sin(ang) * 11));
  const tubeYaw = tubePos.map((p) => Math.atan2(S.x - p.x, S.z - p.z));
  const seesawC = at(10, 3);

  root.add(createFloorDressing(mushroomPos));

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
  // Drawn between the last two fixed physics steps (smooth at any display rate).
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
  const mush = createMushrooms(mushroomPos);
  root.add(mush.stems);
  for (const c of mush.caps) root.add(c);
  for (const p of mushroomPos) colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(p.x, p.y + 0.6, p.z), 0.6, 0.5));
  const mushSpin = mushroomPos.map((_, i) => (i % 2 ? -1 : 1));
  const mushSquash = mushroomPos.map(() => ({ s: 0, v: 0 }));
  let bumperCooldown = 0;

  // ── Tube characters ──
  const tubes = createTubes(tubePos.length, tubePos, tubeYaw);
  root.add(tubes.root);
  const tubeStates: TubeState[] = tubePos.map((_, i) => createTube(i * 1.7 + 0.4));
  const tubeInside = tubePos.map(() => false);
  const tubeTip = tubePos.map(() => 0);

  // ── FLOP button ──
  const flop = createFlopButton(flopPos);
  root.add(flop.base, flop.cap);
  let flopArmed = true;
  let flopT = 0;
  let flopPress = 0;

  // ── See-saw ──
  const seesaw = createSeesaw();
  const seesawRoot = new THREE.Group();
  seesawRoot.position.copy(seesawC);
  seesawRoot.add(seesaw.fixed, seesaw.plank, seesaw.jelly);
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
  // Flip after a see-saw launch.
  let flipT = -1;
  let flipDur = 1;
  const flipQ = new THREE.Quaternion();
  const flipE = new THREE.Euler();

  // ── Gem-worthy spots ──
  for (const [i, p] of mushroomPos.entries()) sillySpots.push({ position: new THREE.Vector3(p.x, p.y + SILLY.bumper.top + 3, p.z), tag: `sillyMushroom${i + 1}` });
  sillySpots.push({ position: new THREE.Vector3(ballHome.x, ballHome.y + 2 * r + 3.2, ballHome.z), tag: 'sillyBall' });
  {
    const v = arcLaunch(-1, 0, SILLY.seesaw.distance, SILLY.seesaw.apex, PLAYER.gravity);
    const t = airTime(v.y, PLAYER.gravity) / 2;
    sillySpots.push({ position: new THREE.Vector3(cup.x + v.x * t, cup.y + SILLY.seesaw.apex + 0.3 + PLAYER.height / 2, cup.z), tag: 'sillySeesaw' });
  }
  sillySpots.push({ position: new THREE.Vector3(flopPos.x, flopPos.y + 1.2, flopPos.z), tag: 'sillyFlop' });
  for (let i = 0; i + 1 < tubePos.length; i += 2) {
    const m = tubePos[i].clone().lerp(tubePos[i + 1], 0.5);
    sillySpots.push({ position: new THREE.Vector3(m.x, m.y + 1.2, m.z), tag: `sillyTubes${i / 2 + 1}` });
  }

  // ── Helpers ──
  const pv = new THREE.Vector3();
  const walking = (): boolean => player.mode === 'walk';
  const launch = (v: { x: number; y: number; z: number }): void => {
    player.launch(pv.set(v.x, v.y, v.z));
  };

  function updateBall(dt: number): void {
    const t = ballBody.translation();
    ballPos.set(t.x, t.y, t.z);
    // Fell in the sea, rolled far away, or went somewhere silly: pop it back home.
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
    if (walking()) {
      const p = player.position;
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const dh = Math.hypot(dx, dz);
      const top = t.y + r;
      // Bounce: landing on (or standing on) the top of the ball.
      if (ballCooldown <= 0 && dh < r * 0.75 && p.y > top - 0.55 && p.y < top + 0.4 && player.velocity.y <= 0.5) {
        launch({ x: player.velocity.x * 0.6, y: SILLY.ball.bounce, z: player.velocity.z * 0.6 });
        ballBody.applyImpulse({ x: 0, y: -SILLY.ball.mass * 4, z: 0 }, true);
        ballSquashV -= 9;
        ballCooldown = 0.4;
        ctx.audio.play('boing', { pitch: 0.8 });
      } else if (dh < r + PLAYER.radius + 0.25 && p.y < t.y + 0.2 && dh > 1e-3) {
        // Push: walking into the ball shoves it along (on top of the controller's own impulse).
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
    const a = steps.alpha;
    ballMesh.position.lerpVectors(prevP, curP, a);
    ballMesh.position.y += ballSquash * r * 0.5;
    ballMesh.quaternion.slerpQuaternions(prevQ, curQ, a);
    const sq = Math.max(-0.35, Math.min(0.35, ballSquash));
    // Squash in world Y (scale applied in the rotated frame is close enough for a quick boing).
    ballMesh.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
  }

  function updateMushrooms(dt: number): void {
    bumperCooldown = Math.max(0, bumperCooldown - dt);
    const p = player.position;
    mushroomPos.forEach((m, i) => {
      const cap = mush.caps[i];
      const sq = mushSquash[i];
      cap.rotation.y += mushSpin[i] * 2.4 * dt;
      sq.v += (-160 * sq.s - 10 * sq.v) * dt;
      sq.s += sq.v * dt;
      cap.scale.set(1 + sq.s * 0.4, 1 - sq.s, 1 + sq.s * 0.4);
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
  let time = 0;

  function updateTubes(dt: number): void {
    const segs = SILLY.tube.segments;
    const L = SILLY.tube.segLen;
    const p = player.position;
    tubePos.forEach((base, ti) => {
      const s = tubeStates[ti];
      // Push: player (any mode, any speed) near the tube base bends it away, in the tube's frame.
      const dx = base.x - p.x;
      const dz = base.z - p.z;
      const dh = Math.hypot(dx, dz);
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
        if (!tubeInside[ti]) {
          const sp = Math.hypot(player.velocity.x, player.velocity.z);
          whackTube(s, lx, lz, 1.5 + sp * 0.35);
          ctx.audio.play('boing', { pitch: 1.7 + ti * 0.07, volume: 0.35 });
        }
      }
      tubeInside[ti] = inside;
      const tip = stepTube(s, time + ti * 3.1, dt, push, lx, lz);
      tubeTip[ti] = Math.hypot(tip.ax, tip.az);
      // Pose the instanced segments up the chain.
      tubeQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      joint.set(base.x, base.y + 0.45, base.z);
      for (let i = 0; i < segs; i++) {
        e.set(s.ax[i], 0, s.az[i]);
        tubeQ.multiply(segQ.setFromEuler(e));
        off.set(0, L / 2, 0).applyQuaternion(tubeQ);
        centre.copy(joint).add(off);
        tubes.body.setMatrixAt(ti * segs + i, mtx.compose(centre, tubeQ, one));
        joint.addScaledVector(off, 2);
        if (i === 3) {
          // Arms at the shoulders: two segments each, flapping.
          for (let side = 0; side < 2; side++) {
            const sgn = side ? 1 : -1;
            const ang = s.arm[side];
            let q = armQ.copy(tubeQ).multiply(segQ.setFromEuler(e.set(0.3 * Math.sin(time * 3 + side), 0, -sgn * (0.4 + ang))));
            const sh = new THREE.Vector3(sgn * 0.3, -0.05, 0).applyQuaternion(tubeQ).add(joint);
            for (let k = 0; k < 2; k++) {
              const o = new THREE.Vector3(0, 0.27, 0).applyQuaternion(q);
              tubes.arms.setMatrixAt(ti * 4 + side * 2 + k, mtx.compose(sh.clone().add(o), q, one));
              sh.addScaledVector(o, 2);
              q = q.clone().multiply(segQ.setFromEuler(e.set(0, 0, -sgn * ang * 0.6)));
            }
          }
        }
        if (i === segs - 1) {
          // Face on the top segment, looking at the zone centre.
          for (let side = 0; side < 2; side++) {
            const sgn = side ? 1 : -1;
            const eye = new THREE.Vector3(sgn * 0.13, 0.12, 0.29).applyQuaternion(tubeQ).add(centre);
            tubes.eyes.setMatrixAt(ti * 2 + side, mtx.compose(eye, tubeQ, one));
            const pupil = new THREE.Vector3(sgn * 0.13, 0.12 + Math.sin(time * 4 + ti) * 0.02, 0.38).applyQuaternion(tubeQ).add(centre);
            tubes.pupils.setMatrixAt(ti * 2 + side, mtx.compose(pupil, tubeQ, one));
          }
          const mouth = new THREE.Vector3(0, -0.06, 0.33).applyQuaternion(tubeQ).add(centre);
          const mq = armQ.copy(tubeQ).multiply(segQ.setFromEuler(e.set(0, 0, Math.PI)));
          tubes.mouths.setMatrixAt(ti, mtx.compose(mouth, mq, one));
        }
      }
    });
    for (const m of [tubes.body, tubes.arms, tubes.eyes, tubes.pupils, tubes.mouths]) m.instanceMatrix.needsUpdate = true;
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
    // The cap squashes down onto its base ring (0.24 m tall at rest, about half when pressed).
    const sy = 1 - 0.5 * flopPress;
    flop.cap.scale.y = sy;
    flop.cap.position.y = flopPos.y + 0.06 + 0.12 * sy;
  }

  function updateSeesaw(dt: number): void {
    seesawT += dt;
    const p = player.position;
    const inCup = Math.hypot(p.x - cup.x, p.z - cup.z) < 0.85 && p.y < cup.y + 0.8 && p.y > cup.y - 0.5;
    if (!inCup) seesawArmed = true;
    const jellyHome = pedestalTop;
    // Stomp pad position (plank local +X end) in see-saw space.
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
        // The jelly hops from its pedestal onto the high end.
        const k = Math.min(1, seesawT / SILLY.seesaw.armDelay);
        const to = stompAt(restTilt);
        seesaw.jelly.position.lerpVectors(jellyHome, to, k);
        seesaw.jelly.position.y += Math.sin(Math.PI * k) * 1.6;
        if (k >= 1) {
          seesawPhase = 'slam';
          seesawT = 0;
          jellySquashV -= 10;
          ctx.audio.play('bigBoing', { pitch: 1.2, volume: 0.8 });
          // Only fling a player who is still standing in the cup (and on foot).
          if (inCup && walking()) {
            const dir = new THREE.Vector3(-1, 0, 0);
            const v = arcLaunch(dir.x, dir.z, SILLY.seesaw.distance, SILLY.seesaw.apex, PLAYER.gravity);
            player.yaw = Math.atan2(dir.x, dir.z);
            launch(v);
            flipT = 0;
            flipDur = airTime(v.y, PLAYER.gravity);
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
        // The jelly hops home; the plank tips back.
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

    // The flip after a launch (visual only; cleared on landing).
    if (flipT >= 0) {
      flipT += dt;
      if (!walking() || (flipT > 0.15 && player.grounded) || flipT > flipDur + 0.6) {
        flipT = -1;
        if (walking()) player.setVisualRotation(null);
      } else {
        const k = Math.min(1, flipT / (flipDur * 0.9));
        flipE.set(Math.PI * 2 * (k * k * (3 - 2 * k)), 0, 0);
        player.setVisualRotation(flipQ.setFromEuler(flipE));
      }
    }
  }

  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') {
      resetBall();
      seesawPhase = 'ready';
      tilt = restTilt;
      flopArmed = true;
    }
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
    };
  }

  // Pose everything once so the zone looks right before the first playing frame.
  updateTubes(0);
  updateBall(0);
  seesaw.plank.rotation.z = tilt;
  seesaw.jelly.position.copy(pedestalTop);

  return {
    update(dt) {
      time += dt;
      updateBall(dt);
      updateMushrooms(dt);
      updateTubes(dt);
      updateFlop(dt);
      updateSeesaw(dt);
      confetti.update(dt);
    },
    dispose() {
      offPhase();
      offStep();
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
