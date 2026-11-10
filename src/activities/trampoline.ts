/**
 * The giant trampoline (both-eye, lives in ctx.scene). Bounces get higher while jump is held,
 * decay when released. Landing detection uses the PlayerApi contract: grounded, position,
 * velocity, airPeak.
 */
import * as THREE from 'three';
import { CAMERA, TRAMPOLINE } from '../config';
import type { GameContext } from '../types';
import { BOUNCE, MAT } from './constants';
import { ThresholdAwards, nextBounceApex, speedFromApex } from './bounceLogic';

const RINGS = 24;
const SEGS = 48;

/** Brightness bands (read in R-only and G-only): bright centre target, ring and edge on a dark mat. */
function bandColor(f: number): THREE.Color {
  const white = f < 0.14 || (f > 0.5 && f < 0.62) || f > 0.95;
  return white ? new THREE.Color(0xf4f4f4) : new THREE.Color(0x24407f);
}

export interface Trampoline {
  update(dt: number): void;
  /** Handle one landing on the mat. Returns the launched apex (0 = bounce stopped). */
  handleLanding(jumpHeld: boolean): number;
  reset(): void;
  /** World y of the mat surface. */
  readonly matTopY: number;
  dispose(): void;
}

export function createTrampoline(ctx: GameContext): Trampoline {
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

  // State.
  const awards = new ThresholdAwards();
  let chainApex = 0;
  let cooldown = 0;
  let cameraSet = false;
  let dent = 0;
  let dentV = 0;
  let dentScale = 0.5;
  let dentDirty = false;

  const onMat = (): boolean => {
    const p = ctx.player.position;
    return Math.hypot(p.x - cx, p.z - cz) < R + MAT.rimTube && Math.abs(p.y - matTopY) < 0.7;
  };

  function applyDent(): void {
    const arr = matGeo.getAttribute('position') as THREE.BufferAttribute;
    const depth = dent * dentScale;
    for (let i = 0; i < vertCount; i++) {
      const f = radial[i];
      arr.setY(i, MAT.top - depth * (1 - f * f));
    }
    arr.needsUpdate = true;
    matGeo.computeVertexNormals();
  }

  function endChain(): void {
    chainApex = 0;
    if (cameraSet) {
      ctx.cameraRig.setOverride(null);
      cameraSet = false;
    }
  }

  function handleLanding(jumpHeld: boolean): number {
    const player = ctx.player;
    const apex = nextBounceApex(chainApex, jumpHeld, player.airPeak);
    if (apex <= 0) {
      endChain();
      return 0;
    }
    chainApex = apex;
    cooldown = BOUNCE.cooldown;
    const v = player.velocity;
    const hx = v.x * BOUNCE.keepHorizontal;
    const hz = v.z * BOUNCE.keepHorizontal;
    const hs = Math.hypot(hx, hz);
    const k = hs > BOUNCE.maxHorizontal ? BOUNCE.maxHorizontal / hs : 1;
    player.launch(new THREE.Vector3(hx * k, speedFromApex(apex), hz * k));

    dent = 1;
    dentV = 0;
    dentScale = 0.45 + 1.1 * (apex / TRAMPOLINE.maxHeight);
    dentDirty = true;
    const big = apex >= 20;
    ctx.audio.play(big ? 'bigBoing' : 'boing', { pitch: big ? 1 : 1.15 - apex / 60 });
    ctx.cameraRig.shake(Math.min(0.5, 0.1 + apex / 100));

    for (const t of awards.reached(apex)) {
      ctx.events.emit('stunt', { kind: 'bigBounce', value: apex, stars: t.stars });
      ctx.events.emit('ui:toast', { icon: 'trampoline', text: `${t.height} m` });
    }
    return apex;
  }

  function update(dt: number): void {
    const player = ctx.player;
    cooldown = Math.max(0, cooldown - dt);
    const grounded = player.grounded;
    const mine = onMat();

    if (grounded && cooldown <= 0) {
      if (mine) {
        // Landing, walking on from the steps or just standing here: the mat always bounces. A chain
        // that has decayed to nothing restarts with a gentle first bounce (kids never get stuck).
        const input = ctx.input.state;
        handleLanding(input.jump || input.jumpPressed);
      } else if (!mine && chainApex > 0) {
        endChain();
      }
    }

    // Camera pulls back with height while a chain is running.
    if (chainApex > 0) {
      const f = Math.min(1, Math.max(0, (player.position.y - matTopY) / TRAMPOLINE.maxHeight));
      ctx.cameraRig.setOverride({ distance: CAMERA.distance + f * 16, height: CAMERA.height + f * 8, fov: CAMERA.fov + f * 14 });
      cameraSet = true;
    }

    // Mat spring (squash, then a little stretch).
    if (dentDirty || Math.abs(dent) > 0.002 || Math.abs(dentV) > 0.01) {
      dentV += (-140 * dent - 7 * dentV) * dt;
      dent += dentV * dt;
      if (Math.abs(dent) < 0.002 && Math.abs(dentV) < 0.01) {
        dent = 0;
        dentV = 0;
      }
      dentDirty = false;
      applyDent();
    }
  }

  function reset(): void {
    awards.reset();
    endChain();
    cooldown = 0;
    dent = 0;
    dentV = 0;
    applyDent();
  }

  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') reset();
  });
  // A respawn or flop ends the chain so the camera never gets stuck pulled back.
  const offRespawn = ctx.events.on('player:respawn', endChain);
  const offFlop = ctx.events.on('player:flop', endChain);

  return {
    update,
    handleLanding,
    reset,
    matTopY,
    dispose() {
      offPhase();
      offRespawn();
      offFlop();
      endChain();
      for (const c of colliders) ctx.physics.removeCollider(c);
      root.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
