/**
 * Player: Rapier KinematicCharacterController capsule with arcade feel (camera-relative movement,
 * smooth turning, sprint, coyote time + jump buffer, variable jump height, a little air control),
 * launches, comic flop, respawn, external controllers, vehicles, swappable characters with one
 * skill each (skills.ts) and a signature emote.
 */
import * as THREE from 'three';
import { PLAYER } from '../config';
import type { ExternalController, GameContext, PlayerAnim, PlayerApi, PlayerMode, PlayerSkillView, VehicleApi } from '../types';
import { CHARACTER_IDS, DEFAULT_CHARACTER, getCharacter } from './characters/catalog';
import type { CharacterId } from './characters/catalog';
import { loadCharacter } from './characters/load';
import type { LoadedCharacter } from './characters/load';
import { GROUP_AVATAR, groups } from './physics';
import { angleDelta, approach, approachVec2, cameraRelative, canJump, damp, integrateVertical } from './motion-math';
import { createPlayerFx } from './player-fx';
import { createPlayerModel } from './player-model';
import type { ModelAnim } from './player-model';
import { createSkillFx } from './skill-fx';
import { SKILL, SkillMachine } from './skills';
import type { SkillEvent } from './skills';
import { ANIM, CONTROLLER, MOVE } from './tuning';

const TAU = Math.PI * 2;
const easeOut = (k: number): number => 1 - (1 - Math.min(1, Math.max(0, k))) ** 2;

const HALF = (PLAYER.height - 2 * PLAYER.radius) / 2;
const CENTRE = HALF + PLAYER.radius;
const MOVE_GROUPS = groups(GROUP_AVATAR, 0xffff & ~GROUP_AVATAR);

export interface PlayerInternal {
  api: PlayerApi;
  update(dt: number): void;
  /** Called after teleport/respawn so the camera can snap behind the player. */
  onTeleport: ((yaw: number) => void) | null;
  /**
   * Put the player in/out of a vehicle (mode driving/riding). With a `seat`, the avatar hops into
   * it and stays visible there, playing `anim`; without one it is hidden.
   */
  setVehicle(vehicle: VehicleApi | null, mode?: 'driving' | 'riding', seat?: THREE.Object3D, anim?: PlayerAnim): void;
}

export async function createPlayer(ctx: GameContext, cameraYaw: () => number): Promise<PlayerInternal> {
  const R = ctx.physics.rapier;
  const world = ctx.physics.world;
  const model = createPlayerModel();
  const fx = createPlayerFx(model);
  const object = model.root;
  ctx.scene.add(object);
  const sfx = createSkillFx(ctx.scene, model.anchors.back);
  const skills = new SkillMachine(getCharacter(DEFAULT_CHARACTER).skill, PLAYER.gravity);

  // ── Characters: loaded lazily, one instance each (cached), swapped inside the stable rig.
  const loaded = new Map<CharacterId, Promise<LoadedCharacter>>();
  const loadById = (id: CharacterId): Promise<LoadedCharacter> => {
    let p = loaded.get(id);
    if (!p) {
      p = loadCharacter(getCharacter(id));
      loaded.set(id, p);
      p.catch(() => loaded.delete(id));
    }
    return p;
  };
  let characterId: CharacterId = DEFAULT_CHARACTER;
  let swapToken = 0;
  try {
    model.setCharacter(await loadById(DEFAULT_CHARACTER));
  } catch (err) {
    console.warn('default character failed to load, using the fallback robot', err);
  }

  const spawn = ctx.world.anchors.spawn;
  const position = object.position;
  position.copy(spawn.position);
  const velocity = new THREE.Vector3();

  const collider = world.createCollider(
    R.ColliderDesc.capsule(HALF, PLAYER.radius)
      .setTranslation(position.x, position.y + CENTRE, position.z)
      .setCollisionGroups(MOVE_GROUPS),
  );
  const cc = world.createCharacterController(CONTROLLER.offset);
  cc.setUp({ x: 0, y: 1, z: 0 });
  cc.setMaxSlopeClimbAngle((CONTROLLER.maxSlopeDeg * Math.PI) / 180);
  cc.setMinSlopeSlideAngle((CONTROLLER.slideSlopeDeg * Math.PI) / 180);
  cc.enableAutostep(CONTROLLER.stepHeight, CONTROLLER.stepMinWidth, false);
  cc.enableSnapToGround(CONTROLLER.snapDistance);
  cc.setApplyImpulsesToDynamicBodies(true);
  cc.setCharacterMass(CONTROLLER.characterMass);
  cc.setSlideEnabled(true);

  let mode: PlayerMode = 'walk';
  let grounded = false;
  let airTime = 0;
  let airPeak = 0;
  let takeoffY = position.y;
  let sinceGrounded = Infinity;
  let sincePressed = Infinity;
  let jumping = false;
  let jumpCut = false;
  /** Airborne because of a launch/external ride: landings never flop. */
  let launched = false;
  let flopT = 0;
  let groundedFor = 0;
  let safeTimer = 0;
  const safeSpot = spawn.position.clone();
  let safeYaw = spawn.yaw;
  let external: ExternalController | null = null;
  let externalAnim: PlayerAnim = 'idle';
  let vehicle: VehicleApi | null = null;
  let seat: THREE.Object3D | null = null;
  let seatAnim: PlayerAnim = 'sit';
  /** 0 → 1 while hopping into the seat. */
  let hopIn = 1;
  /** Set on the frame the player leaves a vehicle: that frame's R/F press belonged to the vehicle. */
  let justLeftVehicle = false;
  const hopFrom = new THREE.Vector3();
  const hopFromQ = new THREE.Quaternion();
  const seatPos = new THREE.Vector3();
  const seatQ = new THREE.Quaternion();
  const seatFwd = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  /**
   * Intended horizontal ground velocity while pressing into an obstacle. `velocity` then reports
   * the real (blocked) motion, but the next frame keeps pushing at full speed: zeroing it would
   * starve Rapier's autostep (it needs real per-frame travel to climb kerbs and stairs).
   */
  const intended = { x: 0, z: 0, valid: false };

  const syncCollider = (): void => {
    collider.setTranslation({ x: position.x, y: position.y + CENTRE, z: position.z });
  };

  const setMode = (next: PlayerMode): void => {
    if (next === mode) return;
    const previous = mode;
    mode = next;
    ctx.events.emit('player:mode', { mode: next, previous });
  };

  const resetAir = (): void => {
    grounded = false;
    airTime = 0;
    airPeak = 0;
    takeoffY = position.y;
    sinceGrounded = Infinity;
    jumping = false;
    jumpCut = false;
  };

  const releaseExternal = (): void => {
    const c = external;
    if (!c) return;
    external = null;
    collider.setEnabled(true);
    syncCollider();
    launched = true; // whatever height the ride ended at, the landing is gentle
    if (mode === 'external') setMode('walk');
    c.onRelease?.();
    api.setTilt(0, 0);
    clearVisual();
  };
  const tiltPivot = new THREE.Vector3();
  // ── Skill state used by the motion code.
  const dashDir = new THREE.Vector3(0, 0, 1);
  let dashSpeed = 0;
  let dashOnGround = true;
  /** Visual-only skill pose timers (spring flip after a super-bounce). */
  let springFlipT = -1;
  let emoting = false;
  let windOn = false;
  const tmpV = new THREE.Vector3();
  const skillView: PlayerSkillView = {
    get id() {
      return skills.id;
    },
    get ready() {
      return skills.ready;
    },
    get cooldown() {
      return skills.cooldown;
    },
    get active() {
      return skills.active;
    },
    get bounceBoost() {
      return skills.bounceBoost;
    },
  };
  /** Stop a running skill and its effects (mode change, respawn, ride). */
  const stopSkill = (): void => {
    skills.cancel();
    springFlipT = -1;
    fx.setSkillPose(0, 0, 0);
    sfx.setWings(false);
    if (windOn) {
      ctx.audio.setLoop('wind', 0);
      windOn = false;
    }
  };

  /** Activity pose layer (setVisualRotation / setVisualStretch); cleared on every hand-back. */
  let visualRot: THREE.Quaternion | null = null;
  let visualStretch = 0;
  const clearVisual = (): void => {
    if (visualRot === null && visualStretch === 0) return;
    visualRot = null;
    visualStretch = 0;
    fx.setExtra(null, 0);
  };

  const internal: PlayerInternal = {
    api: undefined as unknown as PlayerApi, // set below
    onTeleport: null,
    update,
    setVehicle(v, m = 'driving', s, anim = 'sit') {
      if (v) {
        releaseExternal();
        clearVisual();
        stopSkill();
        skills.consumeBoost();
        emoting = false;
        if (mode === 'flop') fx.reset();
        vehicle = v;
        seat = s ?? null;
        seatAnim = anim;
        hopIn = 0;
        hopFrom.copy(position);
        hopFromQ.copy(object.quaternion);
        collider.setEnabled(false);
        object.visible = !!seat;
        intended.valid = false;
        setMode(m);
        if (seat) fx.kick(2);
      } else if (vehicle) {
        vehicle = null;
        seat = null;
        justLeftVehicle = true;
        object.rotation.set(0, api.yaw, 0);
        collider.setEnabled(true);
        syncCollider();
        object.visible = true;
        velocity.set(0, 0, 0);
        intended.valid = false;
        resetAir();
        setMode('walk');
      }
    },
  };

  const api: PlayerApi = {
    get characterId() {
      return characterId;
    },
    skill: skillView,
    async setCharacter(id) {
      if (!(CHARACTER_IDS as readonly string[]).includes(id)) {
        console.warn(`setCharacter: unknown character "${id}"`);
        return;
      }
      const cid = id as CharacterId;
      const token = ++swapToken;
      let c: LoadedCharacter;
      try {
        c = await loadById(cid);
      } catch (err) {
        console.warn(`character "${id}" failed to load`, err);
        return;
      }
      if (token !== swapToken) return; // a newer pick won
      const changed = cid !== characterId || model.character !== c;
      model.setCharacter(c);
      characterId = cid;
      const def = getCharacter(cid);
      stopSkill();
      skills.setSkill(def.skill, cid === 'flamingo');
      emoting = false;
      if (changed) {
        // Poof: elastic scale pop + a sparkle burst around the body.
        fx.pop();
        if (object.visible) {
          tmpV.copy(position).setY(position.y + 0.9);
          sfx.sparkle(tmpV, 22, 3.2, 1.2);
          ctx.audio.play('star', { volume: 0.7, pitch: 1.2 });
        }
      }
      ctx.events.emit('player:character', { id: cid });
    },
    emote() {
      if (mode !== 'walk' || !grounded || skills.active || emoting) return;
      emoting = true;
      const clip = getCharacter(characterId).emote.clip;
      ctx.audio.play('star', { volume: 0.6, pitch: 1.35 });
      tmpV.copy(position).setY(position.y + 1.8);
      sfx.sparkle(tmpV, 8, 1.6, 0.8);
      fx.kick(1.5);
      ctx.events.emit('player:emote', { id: clip.toLowerCase() });
    },
    object,
    position,
    velocity,
    yaw: spawn.yaw,
    get mode() {
      return mode;
    },
    get grounded() {
      return grounded;
    },
    get airTime() {
      return airTime;
    },
    get airPeak() {
      return airPeak;
    },
    get vehicle() {
      return vehicle;
    },
    teleport(p, yaw) {
      position.copy(p);
      if (yaw !== undefined) api.yaw = yaw;
      object.rotation.y = api.yaw;
      velocity.set(0, 0, 0);
      intended.valid = false;
      resetAir();
      launched = false;
      groundedFor = 0;
      syncCollider();
      internal.onTeleport?.(api.yaw);
    },
    launch(v) {
      stopSkill();
      emoting = false;
      velocity.copy(v);
      intended.valid = false;
      if (mode === 'flop') {
        fx.reset();
        setMode('walk');
      }
      resetAir();
      launched = true;
      fx.kick(Math.min(4, v.y * 0.15));
    },
    flop() {
      if (mode !== 'walk') return;
      stopSkill();
      emoting = false;
      flopT = 0;
      clearVisual();
      fx.startFlop();
      setMode('flop');
      ctx.events.emit('player:flop', {});
    },
    respawn() {
      releaseExternal();
      if (vehicle) internal.setVehicle(null);
      clearVisual();
      stopSkill();
      skills.consumeBoost();
      emoting = false;
      fx.reset();
      if (mode !== 'walk') setMode('walk');
      api.teleport(new THREE.Vector3(safeSpot.x, safeSpot.y + 0.05, safeSpot.z), safeYaw);
      object.visible = true;
      fx.pop();
      ctx.events.emit('player:respawn', {});
    },
    setExternalController(c) {
      if (c === external) return;
      releaseExternal();
      if (!c) return;
      if (vehicle) internal.setVehicle(null);
      if (mode === 'flop') fx.reset();
      stopSkill();
      skills.consumeBoost(); // the bounce/ride that takes over has read it already
      emoting = false;
      external = c;
      externalAnim = 'idle';
      intended.valid = false;
      collider.setEnabled(false);
      setMode('external');
    },
    setAnimation(a) {
      externalAnim = a;
    },
    setVisible(v) {
      object.visible = v;
    },
    attach(part, o) {
      model.anchors[part].add(o);
      return () => {
        o.removeFromParent();
      };
    },
    setTilt(pitch, roll) {
      // Rotate the squash group, then shift it so the body centre stays put (pivot = centre).
      const s = model.squash;
      s.rotation.set(pitch, 0, roll);
      tiltPivot.set(0, model.centre, 0).applyEuler(s.rotation);
      s.position.set(-tiltPivot.x, model.centre - tiltPivot.y, -tiltPivot.z);
    },
    setVisualRotation(q) {
      if (mode === 'flop') return; // the flop tumble owns the pose
      if (q) (visualRot ??= new THREE.Quaternion()).copy(q);
      else visualRot = null;
      fx.setExtra(visualRot, visualStretch);
    },
    setVisualStretch(st) {
      if (mode === 'flop') return;
      visualStretch = Number.isFinite(st) ? st : 0;
      fx.setExtra(visualRot, visualStretch);
    },
  };
  internal.api = api;
  object.rotation.y = api.yaw;

  // A new session starts from the spawn point again.
  ctx.events.on('session:phase', (e) => {
    if (e.phase === 'title' || (e.phase === 'playing' && e.previous === 'title')) {
      safeSpot.copy(spawn.position);
      safeYaw = spawn.yaw;
    }
    if (e.phase === 'title' && e.previous !== 'title') api.respawn();
  });

  function playAnim(next: ModelAnim, rate = 1): void {
    model.play(next, rate);
  }

  function updateExternal(dt: number): void {
    const c = external as ExternalController;
    prevPos.copy(position);
    const keep = c.update(dt, ctx.input.state);
    if (dt > 0) velocity.subVectors(position, prevPos).divideScalar(dt);
    object.rotation.y = api.yaw;
    airTime += dt;
    airPeak = Math.max(airPeak, position.y - takeoffY);
    playAnim(externalAnim);
    if (keep === false && external === c) {
      releaseExternal();
      grounded = false;
      sinceGrounded = Infinity;
    }
  }

  function moveCharacter(dt: number, inputActive: boolean): void {
    const input = ctx.input.state;
    const hv = intended.valid ? { x: intended.x, z: intended.z } : { x: velocity.x, z: velocity.z };
    intended.valid = false;
    const startGrounded = grounded;
    const dir = inputActive ? cameraRelative(input.moveX, input.moveY, cameraYaw()) : { x: 0, z: 0 };
    const mag = Math.min(1, Math.hypot(dir.x, dir.z));
    const top = input.sprint && inputActive ? PLAYER.sprintSpeed : PLAYER.walkSpeed;

    // Skills first: they may replace the jump, the gravity or the horizontal motion this frame.
    const airJump = inputActive && input.jumpPressed && !grounded && sinceGrounded > MOVE.coyoteTime;
    const ev = skills.update({
      dt,
      pressed: inputActive && input.skillPressed,
      held: inputActive && input.skill,
      jumpPressed: airJump,
      grounded,
      airTime,
      vy: velocity.y,
      canUse: inputActive && mode === 'walk',
    });
    let jumpUsed = false;
    if (ev) jumpUsed = onSkill(ev, dir, mag, hv);
    const phase = skills.phase;

    if (phase === 'dash') {
      hv.x = dashDir.x * dashSpeed;
      hv.z = dashDir.z * dashSpeed;
    } else if (phase === 'hang' || phase === 'slam') {
      approachVec2(hv, 0, 0, 80 * dt);
    } else if (phase === 'charge') {
      approachVec2(hv, 0, 0, MOVE.groundDecel * 1.5 * dt);
    } else if (grounded) {
      const accel = mag > 0.01 ? MOVE.groundAccel : MOVE.groundDecel;
      approachVec2(hv, dir.x * top, dir.z * top, accel * dt);
    } else if (mag > 0.01) {
      const before = Math.hypot(hv.x, hv.z);
      hv.x += dir.x * MOVE.airAccel * dt;
      hv.z += dir.z * MOVE.airAccel * dt;
      const after = Math.hypot(hv.x, hv.z);
      const cap = Math.max(before, top * mag);
      if (after > cap) {
        hv.x *= cap / after;
        hv.z *= cap / after;
      }
    }
    if (mode === 'flop' && grounded) approachVec2(hv, 0, 0, MOVE.groundDecel * 0.4 * dt);

    // Face the movement direction (smooth).
    if (mag > 0.05 && mode === 'walk' && phase !== 'dash' && phase !== 'charge') {
      const target = Math.atan2(dir.x, dir.z);
      api.yaw += angleDelta(api.yaw, target) * damp(MOVE.turnRate, dt);
    }

    // Jump: buffered press + coyote time.
    if (inputActive && input.jumpPressed && !jumpUsed) sincePressed = 0;
    if (mode === 'walk' && phase !== 'charge' && canJump(sinceGrounded, sincePressed, MOVE.coyoteTime, MOVE.jumpBuffer)) {
      velocity.y = PLAYER.jumpSpeed;
      grounded = false;
      sinceGrounded = Infinity;
      sincePressed = Infinity;
      jumping = true;
      jumpCut = false;
      launched = false;
      takeoffY = position.y;
      airPeak = 0;
      fx.kick(2.2);
      ctx.events.emit('player:jump', {});
    }
    if (jumping && !jumpCut && velocity.y > 0 && !input.jump) {
      velocity.y *= MOVE.jumpCutFactor;
      jumpCut = true;
    }

    // Exact constant-gravity integration (accurate apex for 40 m trampoline launches); skills bend it.
    const vy0 = velocity.y;
    let dy: number;
    let vy: number;
    const hover = (phase === 'dash' && !dashOnGround) || phase === 'hang';
    if (hover) {
      dy = 0;
      vy = 0;
    } else if (phase === 'slam') {
      vy = -SKILL.groundPound.speed;
      dy = vy * dt;
    } else if (phase === 'glide') {
      const fall = -SKILL.glide.fallSpeed;
      const step = integrateVertical(vy0, PLAYER.gravity, dt);
      vy = vy0 < fall ? approach(vy0, fall, 45 * dt) : Math.max(step.vy, fall);
      dy = ((vy0 + vy) / 2) * dt;
    } else {
      const floaty = phase === 'spin' && skills.floaty && vy0 > 0;
      const step = integrateVertical(vy0, PLAYER.gravity * (floaty ? SKILL.doubleJump.floatyGravity : 1), dt);
      dy = step.dy;
      vy = Math.max(step.vy, -MOVE.maxFallSpeed);
    }
    desired.set(hv.x * dt, dy, hv.z * dt);

    if (vy0 > 0 || hover) cc.disableSnapToGround();
    else cc.enableSnapToGround(CONTROLLER.snapDistance);
    cc.computeColliderMovement(collider, desired, R.QueryFilterFlags.EXCLUDE_SENSORS, MOVE_GROUPS);
    const moved = cc.computedMovement();
    position.x += moved.x;
    position.y += moved.y;
    position.z += moved.z;
    syncCollider();

    // Blocked by a wall: report the real speed. In the air, drop the blocked part so launch speed
    // doesn't build up against walls; on the ground keep pushing (see `intended`).
    const wantH = Math.hypot(desired.x, desired.z);
    if (wantH > 1e-5 && dt > 0) {
      const gotH = Math.hypot(moved.x, moved.z);
      if (gotH < wantH * 0.9) {
        if (phase === 'dash' && gotH < wantH * 0.5) {
          // A dash stops at walls (a little bonk, no bounce-back).
          skills.cancel();
          fx.kick(-2);
          ctx.audio.play('bump', { volume: 0.5 });
        } else if (startGrounded) {
          intended.x = hv.x;
          intended.z = hv.z;
          intended.valid = true;
        }
        hv.x = moved.x / dt;
        hv.z = moved.z / dt;
      }
    }
    // Bumped the ceiling.
    if (vy0 > 0 && moved.y < dy * 0.5 - 1e-4) vy = Math.min(vy, 0);
    // The dash just ended (or hit a wall): settle back to running speed.
    if (phase === 'dash' && skills.phase !== 'dash') {
      const sp = Math.hypot(hv.x, hv.z);
      const keep = Math.min(sp, PLAYER.sprintSpeed);
      if (sp > 1e-3) {
        hv.x *= keep / sp;
        hv.z *= keep / sp;
      }
    }

    const wasGrounded = grounded;
    // An air dash and the pound's hang float: they never land mid-move.
    grounded = cc.computedGrounded() && vy0 <= 0 && !hover;
    if (grounded) {
      if (!wasGrounded) land(-Math.min(vy0, 0));
      vy = 0;
      sinceGrounded = 0;
      airTime = 0;
      jumping = false;
    } else {
      if (wasGrounded) {
        takeoffY = position.y;
        airPeak = 0;
      }
      sinceGrounded += dt;
      airTime += dt;
      airPeak = Math.max(airPeak, position.y - takeoffY);
    }
    sincePressed += dt;
    velocity.set(hv.x, vy, hv.z);
  }

  /** Turn a skill event into motion and juice. Returns true if it used up the jump press. */
  function onSkill(ev: SkillEvent, dir: { x: number; z: number }, mag: number, hv: { x: number; z: number }): boolean {
    emoting = false;
    if (ev.kind === 'charge') {
      ctx.audio.play('click', { volume: 0.5, pitch: 0.7 });
      return false;
    }
    if (ev.kind === 'end') return false;
    const id = ev.id;
    tmpV.copy(position);
    switch (id) {
      case 'doubleJump':
        velocity.y = ev.value;
        jumping = true;
        jumpCut = true;
        sincePressed = Infinity;
        fx.kick(2.6);
        model.play('jump', 1.2, true);
        sfx.sparkle(tmpV.setY(position.y + 0.1), 12, 2.6, 0.9);
        ctx.audio.play('jump', { pitch: 1.35 });
        ctx.audio.play('whoosh', { volume: 0.5, pitch: 1.6 });
        break;
      case 'glide':
        ctx.audio.play('whoosh', { volume: 0.6, pitch: 0.8 });
        sfx.sparkle(tmpV.setY(position.y + 1.1), 8, 1.5, 0.7);
        break;
      case 'dash': {
        if (mag > 0.2) dashDir.set(dir.x, 0, dir.z).normalize();
        else dashDir.set(Math.sin(api.yaw), 0, Math.cos(api.yaw));
        api.yaw = Math.atan2(dashDir.x, dashDir.z);
        object.rotation.y = api.yaw;
        dashSpeed = ev.value;
        dashOnGround = grounded;
        hv.x = dashDir.x * dashSpeed;
        hv.z = dashDir.z * dashSpeed;
        fx.kick(-1.5);
        sfx.sparkle(tmpV.setY(position.y + 0.3), 10, 2.2, 0.8);
        ctx.audio.play('whoosh', { pitch: 1.5 });
        break;
      }
      case 'superBounce':
        velocity.y = ev.value;
        grounded = false;
        sinceGrounded = Infinity;
        sincePressed = Infinity;
        jumping = true;
        jumpCut = true;
        launched = true; // a 9 m spring lands softly, never a flop
        takeoffY = position.y;
        airPeak = 0;
        springFlipT = 0;
        fx.kick(4.5);
        sfx.sparkle(tmpV.setY(position.y + 0.1), 20, 4, 1.1);
        ctx.audio.play('bigBoing', { pitch: 1.1 });
        break;
      case 'groundPound':
        launched = true; // the slam lands with a shockwave, not a flop
        jumping = false;
        ctx.audio.play('whoosh', { pitch: 0.75 });
        break;
    }
    ctx.events.emit('player:skill', { id });
    return id === 'doubleJump';
  }

  /** The slam landed: shockwave ring, bounce nearby props, rumble. */
  function poundLanded(): void {
    const r = SKILL.groundPound.radius;
    sfx.shockwave(position, r);
    tmpV.copy(position).setY(position.y + 0.2);
    sfx.sparkle(tmpV, 18, 5, 1);
    fx.kick(-5);
    ctx.audio.play('land', { volume: 1, pitch: 0.55 });
    ctx.audio.play('boing', { volume: 0.8, pitch: 0.6 });
    ctx.cameraRig.shake(0.55);
    // Gentle hop for dynamic props in reach (balls, crates, the buggy): up and away.
    const seen = new Set<number>();
    const centre = { x: position.x, y: position.y + 0.5, z: position.z };
    world.intersectionsWithShape(centre, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(r), (col) => {
      const body = col.parent();
      if (!body || !body.isDynamic() || seen.has(body.handle)) return true;
      seen.add(body.handle);
      const t = body.translation();
      const dx = t.x - centre.x;
      const dz = t.z - centre.z;
      const d = Math.hypot(dx, dz);
      const k = Math.max(0, 1 - d / r);
      const m = body.mass();
      const out = (1.5 + 3 * k) * m;
      const up = (2.5 + 4 * k) * m;
      body.applyImpulse({ x: d > 1e-3 ? (dx / d) * out : 0, y: up, z: d > 1e-3 ? (dz / d) * out : 0 }, true);
      return true;
    });
  }

  /** Per-frame skill visuals: pose layer, wings, speed lines, glide wind. */
  function skillVisuals(dt: number): void {
    const ph = skills.phase;
    const t = skills.t;
    let flip = 0;
    let spin = 0;
    let stretch = 0;
    if (ph === 'spin') {
      spin = easeOut(t / SKILL.doubleJump.spinTime) * TAU;
      stretch = 0.12 * Math.sin(Math.min(1, t / SKILL.doubleJump.spinTime) * Math.PI);
    } else if (ph === 'glide') {
      flip = 0.45 * easeOut(t / 0.25);
      stretch = -0.06;
    } else if (ph === 'dash') {
      flip = 0.38;
      stretch = -0.12;
    } else if (ph === 'charge') {
      const k = Math.min(1, t / SKILL.superBounce.charge);
      stretch = -0.38 * k + Math.sin(t * 70) * 0.025 * k;
    } else if (ph === 'hang') {
      flip = easeOut(t / SKILL.groundPound.hang) * TAU;
      stretch = -0.22;
    } else if (ph === 'slam') {
      stretch = 0.28;
    }
    if (springFlipT >= 0) {
      springFlipT += dt;
      const k = springFlipT / 0.75;
      if (k >= 1 || grounded) springFlipT = -1;
      else flip += easeOut(k) * TAU;
    }
    fx.setSkillPose(flip, spin, stretch);
    sfx.setWings(ph === 'glide');
    sfx.speedLines(ph === 'dash', position, dashDir);
    const wantWind = ph === 'glide';
    if (wantWind !== windOn) {
      ctx.audio.setLoop('wind', wantWind ? 0.3 : 0, 1.6);
      windOn = wantWind;
    }
  }

  function land(speed: number): void {
    const pound = skills.land() === 'pound';
    if (pound) poundLanded();
    const wasLaunched = launched;
    launched = false;
    if (airTime < 0.12 && speed < 3) return; // stepping off a kerb isn't a landing
    ctx.events.emit('player:land', { speed });
    fx.kick(-Math.min(5, 0.8 + speed * 0.18));
    if (!wasLaunched && speed > MOVE.flopLandingSpeed && mode === 'walk') api.flop();
  }

  function updateSafeSpot(dt: number): void {
    if (!grounded || mode !== 'walk') {
      groundedFor = 0;
      return;
    }
    groundedFor += dt;
    safeTimer += dt;
    if (groundedFor < 0.3 || safeTimer < 0.25) return;
    safeTimer = 0;
    if (!ctx.world.isLand(position.x, position.z) || position.y < ctx.world.waterLevel - 0.05) return;
    safeSpot.copy(position);
    safeYaw = api.yaw;
  }

  function checkHazards(): void {
    if (position.y < MOVE.killY) {
      api.respawn();
      return;
    }
    const water = ctx.world.waterLevel;
    if (position.y < water - 0.3 && water - ctx.world.heightAt(position.x, position.z) > MOVE.deepWater) {
      ctx.audio.play('splash');
      api.respawn();
    }
  }

  function chooseAnim(): void {
    const hs = Math.hypot(velocity.x, velocity.z);
    if (mode === 'flop') return playAnim('flop');
    const ph = skills.phase;
    if (ph === 'dash') return playAnim('run', 1.7);
    if (ph === 'glide' || ph === 'hang' || ph === 'slam') return playAnim('fall');
    if (!grounded && airTime > 0.12) return playAnim(velocity.y > 0 ? 'jump' : 'fall');
    if (emoting) {
      if (hs > 0.6 || mode !== 'walk' || ph !== 'idle') emoting = false;
      else return playAnim('emote');
    }
    if (ctx.session.state.phase === 'title') return playAnim('wave');
    if (hs < 0.35) return playAnim('idle');
    const clampRate = (v: number, r: readonly [number, number]): number => Math.min(r[1], Math.max(r[0], v));
    if (hs < ANIM.runFrom) return playAnim('walk', clampRate(hs / ANIM.walkClipSpeed, ANIM.walkRate));
    playAnim('run', clampRate(hs / ANIM.runClipSpeed, ANIM.runRate));
  }

  /** In a vehicle: hop into the seat, then ride along with it (position feeds gem pickup). */
  function followSeat(dt: number): void {
    prevPos.copy(position);
    if (!seat) {
      position.copy((vehicle as VehicleApi).position);
    } else {
      seat.updateWorldMatrix(true, false);
      seat.matrixWorld.decompose(seatPos, seatQ, seatFwd);
      if (hopIn < 1) {
        hopIn = Math.min(1, hopIn + dt / 0.38);
        const k = hopIn * hopIn * (3 - 2 * hopIn);
        position.lerpVectors(hopFrom, seatPos, k);
        position.y += Math.sin(hopIn * Math.PI) * 0.7;
        object.quaternion.slerpQuaternions(hopFromQ, seatQ, k);
      } else {
        position.copy(seatPos);
        object.quaternion.copy(seatQ);
      }
      seatFwd.set(0, 0, 1).applyQuaternion(object.quaternion);
      api.yaw = Math.atan2(seatFwd.x, seatFwd.z);
      playAnim(hopIn < 0.6 ? 'jump' : seatAnim);
    }
    if (dt > 0) velocity.subVectors(position, prevPos).divideScalar(dt);
    grounded = false;
    airTime = 0;
  }

  function update(dt: number): void {
    const input = ctx.input.state;
    if (external) {
      updateExternal(dt);
    } else if (vehicle) {
      followSeat(dt);
    } else {
      if (justLeftVehicle) {
        /* the press that got us out of the vehicle is not also a respawn/flop */
      } else if (input.respawnPressed && (mode === 'walk' || mode === 'flop')) api.respawn();
      else if (input.flopPressed && mode === 'walk') api.flop();
      else if (input.emotePressed && mode === 'walk') api.emote();
      // Moving, jumping or using a skill cancels the emote.
      if (emoting && (Math.abs(input.moveX) + Math.abs(input.moveY) > 0.1 || input.jumpPressed || input.skillPressed)) emoting = false;
      if (mode === 'flop') {
        flopT += dt;
        if (flopT >= MOVE.flopDuration) setMode('walk');
      }
      moveCharacter(dt, mode === 'walk');
      object.rotation.y = api.yaw;
      updateSafeSpot(dt);
      checkHazards();
      chooseAnim();
      skillVisuals(dt);
    }
    if (external || vehicle) {
      if (skills.active || springFlipT >= 0) stopSkill();
      emoting = false;
    }
    justLeftVehicle = false;
    sfx.update(dt);
    fx.update(dt);
    model.update(dt);
  }

  return internal;
}
