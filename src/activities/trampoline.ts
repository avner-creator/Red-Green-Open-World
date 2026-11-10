/**
 * The giant trampoline (both-eye, lives in ctx.scene). Walking on gives a 12 m bounce at once;
 * holding jump grows each bounce x1.5 up to 45 m (~150 ft), otherwise it decays gently so kids can
 * get off. The player flies exact arcs through the shared Flight runner (flight.ts), so big bounces
 * always come back to the mat and the move keys are free for air tricks.
 */
import * as THREE from 'three';
import { CAMERA } from '../config';
import type { GameContext } from '../types';
import { BOUNCE, MAT } from './constants';
import { ThresholdAwards, flightTime, nextBounceApex, speedFromApex } from './bounceLogic';
import type { Arc, ArrivalInfo, Flight, FlightHooks } from './flight';
import type { Confetti } from './chests/confetti';
import { thrillSpots } from './thrillSpots';

const RINGS = 24;
const SEGS = 48;

/** Brightness bands (read in R-only and G-only): bright centre target, ring and edge on a dark mat. */
function bandColor(f: number): THREE.Color {
  const white = f < 0.14 || (f > 0.5 && f < 0.62) || f > 0.95;
  return white ? new THREE.Color(0xf4f4f4) : new THREE.Color(0x24407f);
}

export interface Trampoline {
  update(dt: number): void;
  /** Take over a flight that arrives from above (the last bounce pad): a big first bounce. */
  catchFrom(info: ArrivalInfo, flight: Flight): void;
  /** Centre of the mat (world). */
  readonly centre: THREE.Vector3;
  reset(): void;
  /** World y of the mat surface. */
  readonly matTopY: number;
  dispose(): void;
}

export function createTrampoline(ctx: GameContext, flight: Flight, confetti: Confetti): Trampoline {
  const anchor = ctx.world.anchors.trampoline;
  const cx = anchor.position.x;
  const cz = anchor.position.z;
  const groundY = ctx.world.heightAt(cx, cz);
  const matTopY = groundY + MAT.top;
  const R = MAT.radius;
  const disposables: { dispose(): void }[] = [];
  const mat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const root = new THREE.Group();
  root.position.set(cx, groundY, cz);
  root.rotation.y = anchor.yaw;
  ctx.scene.add(root);

  // Mat: polar grid whose vertices dip under a landing.
  const vertCount = 1 + RINGS * SEGS;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const radial = new Float32Array(vertCount); // 0..1
  const setVert = (i: number, x: number, z: number, f: number): void => {
    positions.set([x, MAT.top, z], i * 3);
    radial[i] = f;
    const c = bandColor(f);
    colors.set([c.r, c.g, c.b], i * 3);
  };
  setVert(0, 0, 0, 0);
  for (let r = 1; r <= RINGS; r++) {
    for (let s = 0; s < SEGS; s++) {
      const a = (s / SEGS) * Math.PI * 2;
      const f = r / RINGS;
      setVert(1 + (r - 1) * SEGS + s, Math.cos(a) * f * R, Math.sin(a) * f * R, f);
    }
  }
  const index: number[] = [];
  for (let s = 0; s < SEGS; s++) index.push(0, 1 + ((s + 1) % SEGS), 1 + s);
  for (let r = 1; r < RINGS; r++) {
    for (let s = 0; s < SEGS; s++) {
      const a = 1 + (r - 1) * SEGS + s;
      const b = 1 + (r - 1) * SEGS + ((s + 1) % SEGS);
      const c = a + SEGS;
      const d = b + SEGS;
      index.push(a, b, c, b, d, c);
    }
  }
  const matGeo = new THREE.BufferGeometry();
  matGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  matGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  matGeo.setIndex(index);
  matGeo.computeVertexNormals();
  disposables.push(matGeo);
  const matMesh = new THREE.Mesh(matGeo, mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));
  matMesh.receiveShadow = true;
  root.add(matMesh);

  // Padded rim: bright yellow (bright in both R and G).
  const rimGeo = new THREE.TorusGeometry(R + MAT.rimTube * 0.2, MAT.rimTube, 14, 64).rotateX(Math.PI / 2);
  disposables.push(rimGeo);
  const rim = new THREE.Mesh(rimGeo, mat(new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.6 })));
  rim.position.y = MAT.top;
  rim.castShadow = true;
  root.add(rim);

  // Dark skirt under the mat and legs.
  const skirtGeo = new THREE.CylinderGeometry(R + 0.2, R + 0.2, MAT.top - 0.05, 48, 1, true);
  disposables.push(skirtGeo);
  const skirt = new THREE.Mesh(skirtGeo, mat(new THREE.MeshStandardMaterial({ color: 0x2a2f3a, side: THREE.DoubleSide })));
  skirt.position.y = (MAT.top - 0.05) / 2;
  root.add(skirt);
  const legGeo = new THREE.CylinderGeometry(0.22, 0.28, MAT.top, 10);
  disposables.push(legGeo);
  const legMat = mat(new THREE.MeshStandardMaterial({ color: 0x4a505c, roughness: 0.7 }));
  for (let i = 0; i < MAT.legs; i++) {
    const a = (i / MAT.legs) * Math.PI * 2;
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(Math.cos(a) * (R + 0.45), MAT.top / 2, Math.sin(a) * (R + 0.45));
    leg.castShadow = true;
    root.add(leg);
  }

  // Frame collider (covers mat + rim) and two steps at the front (+Z of the anchor).
  const colliders = [
    ctx.physics.addStaticCylinder(new THREE.Vector3(cx, groundY + MAT.top / 2, cz), MAT.top / 2, R + MAT.rimTube * 2),
  ];
  const stepMat = mat(new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.8 }));
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), anchor.yaw);
  const front = new THREE.Vector3(Math.sin(anchor.yaw), 0, Math.cos(anchor.yaw));
  for (let k = 0; k < 2; k++) {
    const h = MAT.stepRise * (2 - k); // inner step is taller
    const dist = R + MAT.rimTube * 2 + 0.5 + k * 1;
    const half = new THREE.Vector3(1.8, h / 2, 0.5);
    const geo = new THREE.BoxGeometry(half.x * 2, h, half.z * 2);
    disposables.push(geo);
    const step = new THREE.Mesh(geo, stepMat);
    step.position.set(0, h / 2, dist);
    step.castShadow = true;
    root.add(step);
    const center = new THREE.Vector3(cx, groundY + h / 2, cz).addScaledVector(front, dist);
    colliders.push(ctx.physics.addStaticBox(center, half, yawQ));
  }


  // Shockwave rings on the mat (both-eye, bright white on the dark mat).
  const ringGeo = new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2);
  disposables.push(ringGeo);
  const rings: { mesh: THREE.Mesh; t: number; power: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const m = mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    const mesh = new THREE.Mesh(ringGeo, m);
    mesh.visible = false;
    mesh.position.y = MAT.top + 0.08;
    mesh.renderOrder = 5;
    root.add(mesh);
    rings.push({ mesh, t: 9, power: 1 });
  }
  let nextRing = 0;
  function spawnRings(power: number): void {
    for (let k = 0; k < 2; k++) {
      const r = rings[(nextRing + k) % rings.length];
      r.t = -k * 0.12;
      r.power = power;
    }
    nextRing = (nextRing + 2) % rings.length;
  }

  // State.
  const centre = new THREE.Vector3(cx, matTopY, cz);
  const awards = new ThresholdAwards();
  let chainApex = 0;
  /** Standing after the bounce died away: jump (or leaving and coming back) starts it again. */
  let rest = false;
  let sinceJump = 9;
  let sinceLand = 9;
  let landDepth = 0;
  let landDwell = 0.1;
  let lastDepth = 0;

  const dist = (x: number, z: number): number => Math.hypot(x - cx, z - cz);
  const onMat = (): boolean => {
    const p = ctx.player.position;
    return dist(p.x, p.z) < R + MAT.rimTube && p.y > matTopY - 0.35 && p.y < matTopY + 0.9;
  };

  function applyDepth(depth: number): void {
    if (depth === 0 && lastDepth === 0) return;
    lastDepth = depth;
    const arr = matGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < vertCount; i++) {
      const f = radial[i];
      arr.setY(i, MAT.top - depth * (1 - f * f));
    }
    arr.needsUpdate = true;
    matGeo.computeVertexNormals();
  }

  /** Mat depth (m) `t` seconds after a landing that pressed `D` deep for `dwell` seconds. */
  function depthAt(t: number, D: number, dwell: number): number {
    if (t < 0) return 0;
    if (t < dwell) return D * Math.sin((Math.PI * t) / dwell);
    const u = t - dwell;
    const v = -0.32 * D * Math.exp(-5 * u) * Math.sin(15 * u);
    return Math.abs(v) < 0.003 ? 0 : v;
  }

  /** The arc of the next bounce (apex m) from the player's current horizontal velocity. */
  function makeArc(apex: number, vx: number, vz: number, withDwell: boolean): Arc {
    const p = ctx.player.position;
    let hx = vx * BOUNCE.keepHorizontal;
    let hz = vz * BOUNCE.keepHorizontal;
    const hs = Math.hypot(hx, hz);
    if (hs > BOUNCE.maxHorizontal) {
      hx *= BOUNCE.maxHorizontal / hs;
      hz *= BOUNCE.maxHorizontal / hs;
    }
    // Pull the landing spot back towards the middle so big bounces never drift off the mat.
    const T = flightTime(apex);
    const lx = p.x + hx * T - cx;
    const lz = p.z + hz * T - cz;
    if (Math.hypot(lx, lz) > BOUNCE.recentreFrom) {
      hx -= (lx * BOUNCE.recentre) / T;
      hz -= (lz * BOUNCE.recentre) / T;
    }
    const f = Math.min(1, dist(p.x, p.z) / R);
    const D = 0.3 + 0.55 * (apex / BOUNCE.maxHeight);
    const arc: Arc = { vx: hx, vy: speedFromApex(apex), vz: hz, endY: matTopY };
    if (withDwell) {
      arc.dwell = 0.1 + 0.05 * (apex / BOUNCE.maxHeight);
      arc.dip = D * (1 - f * f);
    }
    landDepth = D;
    landDwell = arc.dwell ?? 0.1;
    sinceLand = 0;
    return arc;
  }

  /** Sounds, rings, camera shake and squash-and-stretch for a bounce of `apex`. */
  function boingFx(apex: number): void {
    const big = apex >= 18;
    ctx.audio.play(big ? 'bigBoing' : 'boing', { pitch: big ? 1.05 - apex / 200 : 1.15 - apex / 60 });
    ctx.cameraRig.shake(Math.min(0.55, 0.1 + apex / 90));
    spawnRings(0.5 + apex / BOUNCE.maxHeight);
    flight.visual.stretch = -0.5;
    flight.visual.kick(8 + 22 * (apex / BOUNCE.maxHeight));
    const p = ctx.player.position;
    for (const t of awards.reached(apex)) {
      ctx.events.emit('stunt', { kind: 'bigBounce', value: apex, stars: t.stars });
      ctx.events.emit('ui:toast', { icon: 'trampoline', text: `${t.height} m` });
      if (t.stars >= 2) confetti.burst(new THREE.Vector3(p.x, p.y + 1, p.z), t.stars >= 3 ? 120 : 70);
    }
  }

  const hooks: FlightHooks = {
    steer(dt, input, f) {
      sinceJump = input.jump || input.jumpPressed ? 0 : sinceJump + dt;
      if (chainApex <= BOUNCE.walkOffApex && (input.moveX !== 0 || input.moveY !== 0)) {
        // Small bounces: the move keys walk you across the mat (and off it).
        const cy = ctx.cameraRig.yaw;
        const dx = Math.sin(cy) * input.moveY - Math.cos(cy) * input.moveX;
        const dz = Math.cos(cy) * input.moveY + Math.sin(cy) * input.moveX;
        const k = Math.min(1, 25 * dt);
        f.vx += (dx * BOUNCE.walkSpeed - f.vx) * k;
        f.vz += (dz * BOUNCE.walkSpeed - f.vz) * k;
      }
    },
    onArrive(info) {
      const p = info.pos;
      if (dist(p.x, p.z) > R + MAT.rimTube) {
        chainApex = 0; // walked off the mat: a plain drop
        return null;
      }
      if (!info.upright) {
        // Landed mid-flip: comic flop (Flight does it), then the mat is just a mat.
        chainApex = 0;
        sinceLand = 0;
        landDepth = 0.5;
        landDwell = 0.1;
        spawnRings(0.6);
        ctx.audio.play('flop');
        return null;
      }
      const apex = nextBounceApex(chainApex, sinceJump < 0.25);
      if (apex <= 0) {
        chainApex = 0;
        rest = true;
        sinceLand = 0;
        landDepth = 0.25;
        landDwell = 0.08;
        ctx.audio.play('boing', { pitch: 1.4, volume: 0.6 });
        return null;
      }
      chainApex = apex;
      boingFx(apex);
      return makeArc(apex, info.vIn.x, info.vIn.z, true);
    },
    camera() {
      const f = Math.min(1, Math.max(0, (ctx.player.position.y - matTopY) / BOUNCE.maxHeight));
      const e = f * (2 - f); // ease-out: the pull-back is already obvious at 15 m
      return { distance: CAMERA.distance + e * 26, height: CAMERA.height + e * 16, fov: CAMERA.fov + e * 30 };
    },
    onEnd() {
      chainApex = 0;
    },
  };

  function begin(apex: number, vx: number, vz: number, from: Flight): void {
    ctx.player.position.y = matTopY;
    chainApex = apex;
    rest = false;
    sinceJump = ctx.input.state.jump ? 0 : 9;
    from.begin('trampoline', makeArc(apex, vx, vz, false), hooks);
    if (!from.active) {
      chainApex = 0;
      return;
    }
    boingFx(apex);
  }

  function update(dt: number): void {
    const player = ctx.player;
    const input = ctx.input.state;
    if (!flight.active && player.mode === 'walk') {
      if (onMat()) {
        if (rest) {
          if (input.jumpPressed || input.jump) begin(nextBounceApex(0, true), player.velocity.x, player.velocity.z, flight);
        } else if (player.grounded) {
          begin(nextBounceApex(0, true, player.airPeak), player.velocity.x, player.velocity.z, flight);
        }
      } else {
        rest = false;
      }
    }

    // Shockwave rings.
    for (const r of rings) {
      if (r.t > 1) continue;
      r.t += dt / 0.75;
      const k = Math.max(0, r.t);
      r.mesh.visible = r.t >= 0 && r.t <= 1;
      const s = 0.6 + k * R * 1.25 * Math.min(1.4, r.power);
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - k) ** 1.5);
    }

    // Mat squash.
    if (sinceLand < 3) {
      sinceLand += dt;
      applyDepth(depthAt(sinceLand, landDepth, landDwell));
    }
  }

  /** A flight arrives from above (the last bounce pad): hand it a big first bounce. */
  function catchFrom(info: ArrivalInfo, f: Flight): void {
    begin(nextBounceApex(0, true, 60), info.vIn.x, info.vIn.z, f);
    sinceJump = 0;
  }

  function reset(): void {
    awards.reset();
    chainApex = 0;
    rest = false;
    sinceLand = 9;
    applyDepth(0);
  }

  thrillSpots.push(
    ...[15, 30, 45].map((h) => ({ position: new THREE.Vector3(cx, matTopY + h, cz), tag: `trampoline${h}` })),
  );

  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') reset();
  });

  return {
    update,
    catchFrom,
    centre,
    reset,
    matTopY,
    dispose() {
      offPhase();
      chainApex = 0;
      for (const c of colliders) ctx.physics.removeCollider(c);
      root.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
