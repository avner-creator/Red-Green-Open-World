/**
 * The giant trampoline (both-eye, lives in ctx.scene). Walking on gives a 12 m bounce at once;
 * holding jump grows each bounce x1.5 up to 45 m (~150 ft), otherwise it decays gently so kids can
 * get off. The player flies exact arcs through the shared Flight runner (flight.ts), so big bounces
 * always come back to the mat and the move keys are free for air tricks.
 */
import * as THREE from 'three';
import { finish, finishMaterial, mergeFinished } from '../core/vertex-finish';
import { CAMERA, PLAYER } from '../config';
import type { GameContext } from '../types';
import { BOUNCE, MAT } from './constants';
import {
  SURPRISE, ThresholdAwards, autoTrickPose, boostedApex, flightTime, keepOnBed, makeRng, nextBounceApex, rollSurprise,
  speedFromApex, superApex,
} from './bounceLogic';
import type { AutoTrick, BounceSurprise } from './bounceLogic';
import type { Arc, ArrivalInfo, Flight, FlightHooks } from './flight';
import type { ThrillConfetti } from './thrillConfetti';
import { getStuntGate } from './stuntGate';
import { thrillSpots } from './thrillSpots';

const RINGS = 24;
const SEGS = 48;

/** Brightness bands (read in R-only and G-only): bright centre target, ring and edge on a dark mat. */
function bandColor(f: number): THREE.Color {
  const white = f < 0.14 || (f > 0.5 && f < 0.62) || f > 0.95;
  return white ? new THREE.Color(0xf4f4f4) : new THREE.Color(0x24407f);
}

/** Five-point star path centred on (x, y). */
function starPath(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

/**
 * Plate for the height gauge (no text: non-readers): stacked up-chevrons on the left and yellow
 * stars on the right, one of each per tier. Dark on white, so it reads in R-only and G-only.
 */
function heightPlate(stars: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#f6f6f6';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#0e1226';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 118);
  // Up chevrons, stacked bottom to top.
  g.lineWidth = 13;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const step = 26;
  const top = 64 - ((stars - 1) * step) / 2 - 12;
  for (let i = 0; i < stars; i++) {
    const y = top + i * step;
    g.beginPath();
    g.moveTo(26, y + 20);
    g.lineTo(54, y);
    g.lineTo(82, y + 20);
    g.stroke();
  }
  // Stars, one per tier.
  g.lineWidth = 6;
  for (let i = 0; i < stars; i++) {
    starPath(g, 128 + i * 44, 64, 22);
    g.fillStyle = '#ffd21f';
    g.fill();
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
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

export function createTrampoline(ctx: GameContext, flight: Flight, confetti: ThrillConfetti): Trampoline {
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
  root.name = 'trampoline';
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
  // Frame (rim, skirt, legs, steps) is one static mesh with per-vertex finishes: 1 draw.
  const frameMat = mat(finishMaterial('rg-trampoline-frame'));
  const frameParts: THREE.BufferGeometry[] = [finish(rimGeo.clone().translate(0, MAT.top, 0), { color: 0xffd23a, rough: 0.6, metal: 0 })];

  // Dark skirt under the mat and legs.
  const skirtGeo = new THREE.CylinderGeometry(R + 0.2, R + 0.2, MAT.top - 0.05, 48, 1, true);
  disposables.push(skirtGeo);
  frameParts.push(finish(skirtGeo.clone().translate(0, (MAT.top - 0.05) / 2, 0), { color: 0x2a2f3a, rough: 1, metal: 0 }));
  const legGeo = new THREE.CylinderGeometry(0.22, 0.28, MAT.top, 10);
  disposables.push(legGeo);
  for (let i = 0; i < MAT.legs; i++) {
    const a = (i / MAT.legs) * Math.PI * 2;
    frameParts.push(finish(legGeo.clone().translate(Math.cos(a) * (R + 0.45), MAT.top / 2, Math.sin(a) * (R + 0.45)), { color: 0x4a505c, rough: 0.7, metal: 0 }));
  }

  // Frame collider (covers mat + rim) and two low step rings all the way round: walking in from
  // any side climbs 3 x 0.33 m kerbs (under the controller's autostep) straight onto the bed.
  // The rings reach below the ground so they never float where the terrain dips.
  const colliders = [
    ctx.physics.addStaticCylinder(new THREE.Vector3(cx, groundY + MAT.top / 2, cz), MAT.top / 2, R + MAT.rimTube * 2),
  ];
  const sink = 0.6;
  for (let k = 0; k < 2; k++) {
    const h = MAT.stepRise * (2 - k); // inner ring is taller
    const radius = R + MAT.rimTube * 2 + MAT.stepDepth * (k + 1);
    const geo = new THREE.CylinderGeometry(radius, radius, h + sink, 64, 1, false);
    disposables.push(geo);
    // Light outer ring, mid-grey inner ring: the two kerbs differ in brightness in R and G alone.
    frameParts.push(finish(geo.clone().translate(0, (h - sink) / 2, 0), { color: k ? 0xeeeeee : 0x9aa0aa, rough: 0.8, metal: 0 }));
    colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(cx, groundY + (h - sink) / 2, cz), (h + sink) / 2, radius));
  }
  const frame = new THREE.Mesh(mergeFinished(frameParts), frameMat);
  frame.castShadow = true;
  frame.receiveShadow = true;
  root.add(frame);
  disposables.push(frame.geometry);


  // Shockwave rings on the mat (both-eye, bright white on the dark mat).
  const ringGeo = new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2);
  disposables.push(ringGeo);
  // A near-black twin just inside each white ring, so it also reads over the white mat bands.
  const ringDarkGeo = new THREE.RingGeometry(0.8, 0.92, 64).rotateX(-Math.PI / 2);
  disposables.push(ringDarkGeo);
  const rings: { mesh: THREE.Mesh; dark: THREE.Mesh; t: number; power: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const m = mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    const md = mat(new THREE.MeshBasicMaterial({ color: 0x0a0d1c, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    const mesh = new THREE.Mesh(ringGeo, m);
    const dark = new THREE.Mesh(ringDarkGeo, md);
    for (const o of [dark, mesh]) {
      o.visible = false;
      o.position.y = MAT.top + 0.08;
      o.renderOrder = 5;
      root.add(o);
    }
    rings.push({ mesh, dark, t: 9, power: 1 });
  }

  // Ground-shadow / landing marker on the mat: dark blob with a bright rim, grows with height.
  const blobGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  const blobRimGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
  disposables.push(blobGeo, blobRimGeo);
  const blob = new THREE.Mesh(blobGeo, mat(new THREE.MeshBasicMaterial({ color: 0x080a16, transparent: true, opacity: 0.5, depthWrite: false, fog: false })));
  const blobRim = new THREE.Mesh(blobRimGeo, mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, fog: false })));
  for (const o of [blob, blobRim]) {
    o.visible = false;
    o.renderOrder = 4;
    root.add(o);
  }

  // Height gauge beside the mat: a striped mast with chevron + star plates at 15 / 30 / 45 m.
  const gaugeX = -(R + 4.5);
  // Mast segments and arms are one unlit vertex-coloured mesh (1 draw).
  const stripeA = new THREE.Color(0xf4f4f4);
  const stripeB = new THREE.Color(0x0e1226);
  const mastParts: THREE.BufferGeometry[] = [];
  const painted = (g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry => {
    const n = g.index ? g.toNonIndexed() : g;
    const col = new Float32Array(n.attributes.position.count * 3);
    for (let k = 0; k < col.length; k += 3) col.set([c.r, c.g, c.b], k);
    n.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return n;
  };
  for (let i = 0; i < 10; i++) mastParts.push(painted(new THREE.CylinderGeometry(0.13, 0.13, 5, 8).translate(gaugeX, MAT.top + 2.5 + i * 5, 0), i % 2 ? stripeB : stripeA));
  for (const h of [15, 30, 45]) mastParts.push(painted(new THREE.BoxGeometry(3, 0.14, 0.14).translate(gaugeX + 1.5, MAT.top + h, 0), stripeB));
  const mast = new THREE.Mesh(mergeFinished(mastParts), mat(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  root.add(mast);
  disposables.push(mast.geometry);
  [15, 30, 45].forEach((h, i) => {
    const tex = heightPlate(i + 1);
    if (!tex) return;
    disposables.push(tex);
    const sprite = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: tex, fog: false })));
    // Small and on the far side of the mast: at the apex the camera is level with a plate, and a
    // big one beside the mat filled the top-left of the screen.
    sprite.scale.set(2.6, 1.3, 1);
    sprite.position.set(gaugeX - 1.2, MAT.top + h, 0);
    root.add(sprite);
  });
  // Bonus star (both-eye: bright gold with a near-black rim, reads in R and G alone): hangs
  // somewhere up the column on some bounces; flying through it pays a star.
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.42 : 1;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.26, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1 }).center();
  const starRimGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.1, bevelEnabled: false }).center().scale(1.22, 1.22, 1);
  disposables.push(starGeo, starRimGeo);
  const bonusStar = new THREE.Group();
  bonusStar.name = 'trampoline-bonus-star';
  bonusStar.add(
    new THREE.Mesh(starGeo, mat(new THREE.MeshStandardMaterial({ color: 0xffd21f, emissive: 0x7a5a00, roughness: 0.35, metalness: 0.2 }))),
    new THREE.Mesh(starRimGeo, mat(new THREE.MeshBasicMaterial({ color: 0x0e1226 }))),
  );
  bonusStar.scale.setScalar(0.9);
  bonusStar.visible = false;
  ctx.scene.add(bonusStar);
  let starSpin = 0;

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
  /** Jelly ripple amplitude of the last landing (m). */
  let rippleAmp = 0;
  // Surprises: seeded (test mode pins the seed so e2e is repeatable).
  const SEED = 0x5eed;
  let rng = makeRng(ctx.testMode ? SEED : (Math.random() * 4294967296) >>> 0);
  let surprise: BounceSurprise | null = null;
  /** Surprises on (always in play; tests opt in with `__rgTramp.setSurprises(true)` or `&surprise=1`). */
  let surprises = !ctx.testMode || new URLSearchParams(location.search).get('surprise') === '1';
  let superCount = 0;
  let bonusStars = 0;
  let autoTrick: { kind: AutoTrick; t: number; dur: number; yaw0: number } | null = null;
  const stopAutoTrick = (): void => {
    if (!autoTrick) return;
    autoTrick = null;
    ctx.player.setTilt(0, 0);
  };
  if (ctx.testMode) {
    (window as unknown as { __rgTramp?: unknown }).__rgTramp = {
      get surprise() {
        return surprise;
      },
      get superCount() {
        return superCount;
      },
      get bonusStars() {
        return bonusStars;
      },
      get star() {
        return bonusStar.visible ? bonusStar.position.toArray() : null;
      },
      reseed: (seed: number) => (rng = makeRng(seed)),
      setSurprises: (on: boolean) => (surprises = on),
    };
  }

  const dist = (x: number, z: number): number => Math.hypot(x - cx, z - cz);
  const onMat = (): boolean => {
    const p = ctx.player.position;
    return dist(p.x, p.z) < R + MAT.rimTube && p.y > matTopY - 0.35 && p.y < matTopY + 0.9;
  };

  function applyDepth(depth: number, ripple = 0, t = 0): void {
    if (depth === 0 && lastDepth === 0 && ripple === 0) return;
    lastDepth = depth + ripple;
    const arr = matGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < vertCount; i++) {
      const f = radial[i];
      // Jelly bed: the dip plus rings of ripple running out to the rim.
      const rip = ripple ? ripple * Math.sin(17 * f - 13 * t) * (1 - f) * f * 4 : 0;
      arr.setY(i, MAT.top - depth * (1 - f * f) - rip);
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
  function makeArc(apex: number, vx: number, vz: number, withDwell: boolean, kick?: { x: number; z: number }): Arc {
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
    if (kick) {
      // Random sideways boing, shrunk so the landing stays on the bed.
      const k = keepOnBed(p.x + hx * T - cx, p.z + hz * T - cz, kick.x, kick.z, T, R * SURPRISE.safeShare);
      hx += k.kx;
      hz += k.kz;
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
      getStuntGate(ctx).stunt({ kind: 'bigBounce', value: apex, stars: t.stars });
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
        stopAutoTrick();
        bonusStar.visible = false;
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
      stopAutoTrick();
      bonusStar.visible = false;
      surprise = surprises
        ? rollSurprise(rng, apex, BOUNCE.maxHeight)
        : { kickX: 0, kickZ: 0, superBoing: false, trick: 'none', starAt: -1, starX: 0, starZ: 0 };
      const top = surprise.superBoing ? superApex(apex, BOUNCE.maxHeight) : apex;
      chainApex = top;
      boingFx(top);
      const arc = makeArc(top, info.vIn.x, info.vIn.z, true, { x: surprise.kickX, z: surprise.kickZ });
      rippleAmp = 0.05 + 0.1 * (top / BOUNCE.maxHeight);
      if (surprise.superBoing) {
        // Wind-up: sink deep, wobble, then BOING.
        superCount++;
        arc.dwell = (arc.dwell ?? 0.1) + 0.28;
        arc.dip = (arc.dip ?? 0.3) * 1.7;
        landDepth = arc.dip;
        landDwell = arc.dwell;
        rippleAmp = 0.22;
        superFx(top);
      }
      const T = flightTime(top);
      if (surprise.trick !== 'none') autoTrick = { kind: surprise.trick, t: -(arc.dwell ?? 0), dur: T * 0.62, yaw0: ctx.player.yaw };
      if (surprise.starAt >= 0) {
        // On the way up, near the line of flight (a nudge of the stick on small bounces reaches it).
        const h = surprise.starAt * top;
        const vy = arc.vy;
        const tUp = (vy - Math.sqrt(Math.max(0, vy * vy - 2 * PLAYER.gravity * h))) / PLAYER.gravity + (arc.dwell ?? 0);
        bonusStar.position.set(info.pos.x + arc.vx * tUp + surprise.starX, matTopY + h + 0.9, info.pos.z + arc.vz * tUp + surprise.starZ);
        bonusStar.visible = true;
      }
      return arc;
    },
    camera() {
      const f = Math.min(1, Math.max(0, (ctx.player.position.y - matTopY) / BOUNCE.maxHeight));
      const e = f * (2 - f); // ease-out: the pull-back is already obvious at 15 m
      // Capped pull-back: the hero stays >= ~6% of the screen at 45 m, with a high, downward-looking
      // camera so the island panorama is in view.
      return { distance: CAMERA.distance + e * 5.5, height: CAMERA.height + e * 9.5, fov: CAMERA.fov + e * 6 };
    },
    onEnd() {
      chainApex = 0;
      stopAutoTrick();
      bonusStar.visible = false;
    },
  };

  /** SUPER BOING: deep wobble, big boing, fanfare, confetti and a bigger shockwave. */
  function superFx(apex: number): void {
    const p = ctx.player.position;
    ctx.audio.play('bigBoing', { pitch: 0.78 });
    ctx.audio.play('fanfare', { volume: 0.7, pitch: 1.1 });
    ctx.audio.play('whoosh', { volume: Math.min(1, apex / 40), pitch: 0.9 });
    ctx.cameraRig.shake(0.6);
    spawnRings(1.6);
    flight.visual.kick(-14);
    confetti.burst(new THREE.Vector3(p.x, p.y + 0.5, p.z), 90);
  }

  /** Extra fanfare for a skill-boosted first bounce (a ground-pound goes straight to the top). */
  function boostFx(boost: number, apex: number): void {
    const p = ctx.player.position;
    spawnRings(1.4);
    ctx.cameraRig.shake(boost === Infinity ? 0.7 : 0.45);
    ctx.audio.play('fanfare', { volume: boost === Infinity ? 0.9 : 0.6 });
    ctx.audio.play('whoosh', { volume: Math.min(1, apex / 45), pitch: 0.85 });
    confetti.burst(new THREE.Vector3(p.x, p.y + 1, p.z), boost === Infinity ? 140 : 60);
  }

  function begin(rawApex: number, vx: number, vz: number, from: Flight): void {
    // Character skill boost (super-bounce +25%, ground-pound = maximum): read it before the flight
    // takes over, because taking over clears it.
    const boost = ctx.player.skill.bounceBoost;
    const apex = boostedApex(rawApex, boost);
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
    if (boost > 1) boostFx(boost, apex);
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
      const s = 0.6 + k * R * 1.25 * Math.min(1.4, r.power);
      const op = Math.max(0, 0.95 * (1 - k) ** 1.5);
      for (const o of [r.mesh, r.dark]) {
        o.visible = r.t >= 0 && r.t <= 1;
        o.scale.set(s, 1, s);
        (o.material as THREE.MeshBasicMaterial).opacity = op;
      }
    }

    // Landing marker under the player while bouncing.
    const marking = flight.active && flight.owner === 'trampoline';
    blob.visible = blobRim.visible = marking;
    if (marking) {
      const h = Math.max(0, flight.height);
      const p = player.position;
      let lx = p.x - cx;
      let lz = p.z - cz;
      const d = Math.hypot(lx, lz);
      if (d > R - 0.5) {
        lx *= (R - 0.5) / d;
        lz *= (R - 0.5) / d;
      }
      const c = Math.cos(-anchor.yaw);
      const sn = Math.sin(-anchor.yaw);
      const s = 0.9 + h * 0.055;
      for (const o of [blob, blobRim]) {
        o.position.set(lx * c + lz * sn, MAT.top + 0.06, -lx * sn + lz * c);
        o.scale.set(s, 1, s);
      }
      (blob.material as THREE.MeshBasicMaterial).opacity = 0.55 - 0.2 * Math.min(1, h / BOUNCE.maxHeight);
    }

    // Auto trick (visual only, done well before the landing so the hero lands upright).
    if (autoTrick) {
      if (!(flight.active && flight.owner === 'trampoline')) stopAutoTrick();
      else {
        autoTrick.t += dt;
        const pose = autoTrickPose(autoTrick.kind, Math.max(0, autoTrick.t) / autoTrick.dur);
        player.setTilt(pose.pitch, pose.roll);
        if (autoTrick.kind === 'twirl') player.yaw = autoTrick.yaw0 + pose.yaw;
        if (autoTrick.t >= autoTrick.dur) stopAutoTrick();
      }
    }

    // Bonus star: spins and bobs; flying through it pays a star.
    if (bonusStar.visible) {
      starSpin += dt * 3;
      bonusStar.rotation.y = starSpin;
      const p = player.position;
      const dx = p.x - bonusStar.position.x;
      const dy = p.y + 0.9 - bonusStar.position.y;
      const dz = p.z - bonusStar.position.z;
      if (dx * dx + dy * dy + dz * dz < 1.9 * 1.9) {
        bonusStar.visible = false;
        bonusStars++;
        ctx.audio.play('star', { pitch: 1.2 });
        confetti.burst(bonusStar.position.clone(), 40);
        getStuntGate(ctx).stunt({ kind: 'bigBounce', value: chainApex, stars: 1 });
      }
    }

    // Mat squash and jelly ripple.
    if (sinceLand < 3) {
      sinceLand += dt;
      const rip = rippleAmp * Math.exp(-2.4 * sinceLand);
      applyDepth(depthAt(sinceLand, landDepth, landDwell), sinceLand < 2.9 && rip > 0.002 ? rip : 0, sinceLand);
    }
  }

  /** A flight arrives from above (the last bounce pad): hand it a big first bounce. */
  function catchFrom(info: ArrivalInfo, f: Flight): void {
    begin(nextBounceApex(0, true, 60), info.vIn.x, info.vIn.z, f);
    sinceJump = 0;
  }

  function reset(): void {
    awards.reset();
    stopAutoTrick();
    bonusStar.visible = false;
    if (ctx.testMode) rng = makeRng(SEED);
    superCount = bonusStars = 0;
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
      bonusStar.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
