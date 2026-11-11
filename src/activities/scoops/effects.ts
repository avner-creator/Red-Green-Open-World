/**
 * The funny 30-second effects of an eaten cone. Several can run at once (one per topping).
 *  - bigHead: the hero's head bone swells to 2.3× (hats follow).
 *  - tiny:    the whole hero shrinks to 45 %.
 *  - rainbow: a striped ribbon trail on the ground behind the hero (light/dark bands).
 *  - speed:   running speed is pushed up to ~1.6× (walk mode, on the ground).
 *  - moon:    jumps launch ~3× higher and fall slowly.
 *  - burps:   every few seconds a burp of bubbles pops out (with a squash and a "boing").
 * Everything is both-eye, visual and comic; nothing hurts. Pure timing maths is in `effectLevel`.
 */
import * as THREE from 'three';
import { PLAYER } from '../../config';
import type { GameContext, MoveModifier } from '../../types';
import { SCOOPS } from './logic';
import type { EffectId } from './logic';

/** Ease in (0.35 s) and out (0.6 s) of an effect with `remaining` of `total` seconds left. */
export function effectLevel(remaining: number, total: number): number {
  if (remaining <= 0) return 0;
  const inK = Math.min(1, (total - remaining) / 0.35);
  const outK = Math.min(1, remaining / 0.6);
  const s = (t: number): number => t * t * (3 - 2 * t);
  return s(inK) * s(outK);
}

export const EFFECT_TUNING = {
  headScale: 2.3,
  tinyScale: 0.45,
  speedTop: PLAYER.sprintSpeed * 1.6,
  moonJump: PLAYER.jumpSpeed * 1.75,
  /** Upward help while falling in moon mode, m/s² (gravity 22 → ~12). */
  moonFloat: 10,
  burpEvery: 3.2,
  trailPoints: 64,
  trailWidth: 0.9,
} as const;

const RAINBOW = [0xfff6c8, 0x7a2e8a, 0xffd93b, 0x2a5aa8, 0xa8f0d0, 0xc8233a];

interface Bubble {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  life: number;
  size: number;
}

export interface Effects {
  start(list: readonly EffectId[], seconds?: number): void;
  active(): { id: EffectId; remaining: number }[];
  clear(): void;
  update(dt: number): void;
  dispose(): void;
}

export function createEffects(ctx: GameContext): Effects {
  const remaining = new Map<EffectId, number>();
  const total = new Map<EffectId, number>();
  let time = 0;

  // ── giant head: find the head bone above the head anchor ──
  const marker = new THREE.Object3D();
  let detach: (() => void) | null = null;
  let headBone: THREE.Object3D | null = null;
  let headBase = new THREE.Vector3(1, 1, 1);
  const findHead = (): void => {
    detach?.();
    detach = ctx.player.attach('head', marker);
    headBone = null;
    let o: THREE.Object3D | null = marker.parent;
    while (o && o !== ctx.player.object) {
      if ((o as THREE.Bone).isBone) {
        headBone = o;
        break;
      }
      o = o.parent;
    }
    // No skeleton (fallback model): swell the anchor itself, so at least the hat goes huge.
    headBone ??= marker.parent;
    headBase = headBone ? headBone.scale.clone() : new THREE.Vector3(1, 1, 1);
  };
  const offCharacter = ctx.events.on('player:character', () => {
    if (headBone) headBone.scale.copy(headBase);
    headBone = null;
  });

  // ── rainbow trail: a ribbon of 6 bands following the feet ──
  const N = EFFECT_TUNING.trailPoints;
  const BANDS = RAINBOW.length;
  const trailPts: THREE.Vector3[] = [];
  const trailGeo = new THREE.BufferGeometry();
  const idx: number[] = [];
  const triCol: THREE.Color[] = RAINBOW.map((c) => new THREE.Color(c));
  // Non-shared vertices per band so each band keeps a flat colour: build bands as separate strips.
  const strip = (b: number, i: number): number => b * N + i;
  const pos2 = new Float32Array(BANDS * N * 2 * 3);
  const col2 = new Float32Array(BANDS * N * 2 * 3);
  for (let b = 0; b < BANDS; b++) {
    for (let i = 0; i < N; i++) {
      for (let side = 0; side < 2; side++) {
        const v = (strip(b, i) * 2 + side) * 3;
        col2[v] = triCol[b].r;
        col2[v + 1] = triCol[b].g;
        col2[v + 2] = triCol[b].b;
      }
      if (i > 0) {
        const a0 = strip(b, i - 1) * 2;
        const a1 = strip(b, i) * 2;
        idx.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1);
      }
    }
  }
  trailGeo.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(col2, 3));
  trailGeo.setIndex(idx);
  const trailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.visible = false;
  trail.receiveShadow = true;
  trail.name = 'Scoops.rainbowTrail';
  ctx.scene.add(trail);
  let trailTimer = 0;
  const lastDrop = new THREE.Vector3();

  function rebuildTrail(level: number): void {
    const n = trailPts.length;
    const right = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const p = trailPts[Math.min(n - 1, Math.max(0, n - N + i))] ?? ctx.player.position;
      const q = trailPts[Math.min(n - 1, Math.max(0, n - N + i + 1))] ?? p;
      const d = new THREE.Vector3().subVectors(q, p);
      if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
      right.set(d.z, 0, -d.x).normalize();
      // Tail tapers to nothing; the head is full width.
      const w = EFFECT_TUNING.trailWidth * level * Math.min(1, i / (N * 0.6));
      for (let b = 0; b < BANDS; b++) {
        const o0 = (b / BANDS - 0.5) * w;
        const o1 = ((b + 1) / BANDS - 0.5) * w;
        const v = strip(b, i) * 2 * 3;
        pos2[v] = p.x + right.x * o0;
        pos2[v + 1] = p.y + 0.06;
        pos2[v + 2] = p.z + right.z * o0;
        pos2[v + 3] = p.x + right.x * o1;
        pos2[v + 4] = p.y + 0.06;
        pos2[v + 5] = p.z + right.z * o1;
      }
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.computeVertexNormals();
  }

  // ── bubbles ──
  const MAX_BUBBLES = 40;
  const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.55, emissive: 0x334455 });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), bubbleMat, MAX_BUBBLES);
  bubbles.frustumCulled = false;
  bubbles.count = 0;
  bubbles.name = 'Scoops.bubbles';
  ctx.scene.add(bubbles);
  const live: Bubble[] = [];
  let burpTimer = 1.2;
  let burpSquash = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();

  function burp(): void {
    const yaw = ctx.player.yaw;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const scale = ctx.player.object.scale.x;
    const mouth = ctx.player.position.clone().add(new THREE.Vector3(0, PLAYER.height * 0.85 * scale, 0)).addScaledVector(fwd, 0.35 * scale);
    for (let i = 0; i < 9 && live.length < MAX_BUBBLES; i++) {
      const a = (i / 9) * Math.PI * 2;
      live.push({
        pos: mouth.clone(),
        vel: fwd.clone().multiplyScalar(1.6 + (i % 3) * 0.5).add(new THREE.Vector3(Math.cos(a) * 0.6, 0.9 + Math.sin(a) * 0.5, Math.sin(a) * 0.6)),
        t: 0,
        life: 1.6 + (i % 4) * 0.35,
        size: 0.08 + (i % 3) * 0.05,
      });
    }
    ctx.audio.play('boing', { pitch: 1.8, volume: 0.7 });
    burpSquash = 1;
  }

  function updateBubbles(dt: number): void {
    for (let i = live.length - 1; i >= 0; i--) {
      const b = live[i];
      b.t += dt;
      b.vel.multiplyScalar(Math.exp(-1.5 * dt));
      b.vel.y += 0.6 * dt;
      b.pos.addScaledVector(b.vel, dt);
      if (b.t >= b.life) live.splice(i, 1);
    }
    bubbles.count = live.length;
    for (let i = 0; i < live.length; i++) {
      const b = live[i];
      const pop = b.t > b.life - 0.12 ? 1.4 : 1;
      const s = b.size * pop * (1 + Math.sin(b.t * 9 + i) * 0.08);
      bubbles.setMatrixAt(i, m4.compose(b.pos, q, sc.set(s, s * 0.94, s)));
    }
    bubbles.instanceMatrix.needsUpdate = true;
  }

  // ── super speed and moon jump: through the player's movement-modifier hook ──
  // Moon: lighter gravity and a matching jump boost, so a moon jump reaches the old moon-jump
  // height (v²/2g with jumpSpeed × 1.75 at full gravity) but floats down slowly.
  const MOON_GRAVITY = 1 - EFFECT_TUNING.moonFloat / PLAYER.gravity;
  const MOON_JUMP = (EFFECT_TUNING.moonJump / PLAYER.jumpSpeed) * Math.sqrt(MOON_GRAVITY);
  const speedMod: MoveModifier = { speed: 1 };
  const moonMod: MoveModifier = { gravity: 1, jump: 1 };
  let offSpeed: (() => void) | null = null;
  let offMoon: (() => void) | null = null;
  const offJump = ctx.events.on('player:jump', () => {
    if (remaining.has('moon') && ctx.player.mode === 'walk') ctx.audio.play('boing', { pitch: 1.3, volume: 0.6 });
  });

  function restore(id: EffectId): void {
    switch (id) {
      case 'bigHead':
        if (headBone) headBone.scale.copy(headBase);
        detach?.();
        detach = null;
        headBone = null;
        break;
      case 'tiny':
        ctx.player.object.scale.setScalar(1);
        break;
      case 'rainbow':
        trail.visible = false;
        trailPts.length = 0;
        break;
      case 'burps':
        if (ctx.player.mode === 'walk') ctx.player.setVisualStretch(0);
        break;
      case 'speed':
        offSpeed?.();
        offSpeed = null;
        break;
      case 'moon':
        offMoon?.();
        offMoon = null;
        break;
      default:
        break;
    }
  }

  return {
    start(list, seconds = SCOOPS.effectSeconds) {
      for (const id of list) {
        remaining.set(id, seconds);
        total.set(id, seconds);
        if (id === 'bigHead' && !headBone) findHead();
        if (id === 'rainbow') {
          trailPts.length = 0;
          lastDrop.copy(ctx.player.position);
        }
        if (id === 'burps') burpTimer = 0.8;
        if (id === 'speed') ctx.audio.play('whoosh', { pitch: 1.4 });
      }
    },
    active() {
      return [...remaining.entries()].map(([id, r]) => ({ id, remaining: r }));
    },
    clear() {
      for (const id of [...remaining.keys()]) restore(id);
      remaining.clear();
      total.clear();
      live.length = 0;
      bubbles.count = 0;
    },
    update(dt) {
      time += dt;
      if (ctx.session.state.phase !== 'playing' && ctx.session.state.phase !== 'paused') {
        if (remaining.size) this.clear();
      }
      for (const [id, r] of remaining) {
        const left = r - dt;
        if (left <= 0) {
          remaining.delete(id);
          restore(id);
        } else remaining.set(id, left);
      }
      const lvl = (id: EffectId): number => (remaining.has(id) ? effectLevel(remaining.get(id) ?? 0, total.get(id) ?? 1) : 0);

      // Giant head (re-applied every frame: the animation mixer may own bone scale).
      if (remaining.has('bigHead')) {
        if (!headBone) findHead();
        const k = lvl('bigHead');
        const wob = 1 + Math.sin(time * 7) * 0.04 * k;
        if (headBone) headBone.scale.copy(headBase).multiplyScalar((1 + (EFFECT_TUNING.headScale - 1) * k) * wob);
      }
      if (remaining.has('tiny')) ctx.player.object.scale.setScalar(1 + (EFFECT_TUNING.tinyScale - 1) * lvl('tiny'));

      // Super speed (sprint reaches speedTop at full strength) and moon gravity, eased in and out.
      if (remaining.has('speed')) {
        offSpeed ??= ctx.player.addMoveModifier(speedMod);
        speedMod.speed = 1 + (EFFECT_TUNING.speedTop / PLAYER.sprintSpeed - 1) * lvl('speed');
      }
      if (remaining.has('moon')) {
        offMoon ??= ctx.player.addMoveModifier(moonMod);
        const k = lvl('moon');
        moonMod.gravity = 1 + (MOON_GRAVITY - 1) * k;
        moonMod.jump = 1 + (MOON_JUMP - 1) * k;
      }

      // Rainbow trail.
      if (remaining.has('rainbow')) {
        trailTimer += dt;
        const p = ctx.player.position;
        if (!trailPts.length || (trailTimer > 0.03 && p.distanceTo(lastDrop) > 0.25)) {
          trailPts.push(p.clone());
          lastDrop.copy(p);
          trailTimer = 0;
          if (trailPts.length > N) trailPts.shift();
        }
        trail.visible = trailPts.length > 2;
        if (trail.visible) rebuildTrail(lvl('rainbow'));
      }

      // Bubble burps.
      if (remaining.has('burps')) {
        burpTimer -= dt;
        if (burpTimer <= 0 && ctx.player.mode === 'walk') {
          burp();
          burpTimer = EFFECT_TUNING.burpEvery;
        }
      }
      if (burpSquash > 0) {
        burpSquash = Math.max(0, burpSquash - dt * 3);
        if (ctx.player.mode === 'walk') ctx.player.setVisualStretch(Math.sin((1 - burpSquash) * Math.PI * 2) * 0.18 * burpSquash);
      }
      if (live.length || bubbles.count) updateBubbles(dt);
    },
    dispose() {
      this.clear();
      offJump();
      offCharacter();
      detach?.();
      trail.removeFromParent();
      trailGeo.dispose();
      trailMat.dispose();
      bubbles.removeFromParent();
      bubbles.geometry.dispose();
      bubbleMat.dispose();
    },
  };
}
