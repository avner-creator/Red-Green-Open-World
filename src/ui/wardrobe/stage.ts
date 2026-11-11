/**
 * The dressing room's little 3D stage: the current hero, big, on a round podium, wearing what the
 * profile says (or what the child is trying on). Its own small WebGL renderer and scene, never the
 * game's vision pipeline (this is a menu: both eyes see it, like the rest of the UI), created on
 * first use and kept while the page lives; it only renders while the dressing room is open.
 *
 * Drag (mouse/touch) or the arrow buttons turn the hero. Putting something on plays a happy pose.
 */
import * as THREE from 'three';
import { CHARACTERS } from '../../core/characters/catalog';
import type { AttachPart, CharacterDef } from '../../core/characters/catalog';
import { loadCharacter } from '../../core/characters/load';
import type { LoadedCharacter } from '../../core/characters/load';
import { gearFit } from '../../activities/gear/fit';
import { buildGear } from '../../activities/gear/models';
import type { Wearable } from '../../activities/gear/models';
import type { PlayerAnim } from '../../types';

export type StageLook = Record<AttachPart, string | null>;

export interface Stage {
  /** Holds the stage canvas (created when the room first opens). */
  readonly el: HTMLElement;
  /** True once the hero model is on the stage. */
  readonly ready: boolean;
  setHero(id: string): void;
  /** What is worn per slot; new items pop on with a cheer. */
  setLook(look: StageLook, cheer: boolean): void;
  /** Play a pose once (an emote preview), then back to idle. */
  pose(anim: PlayerAnim | 'emote'): void;
  /** Turn the hero by `rad`. */
  turn(rad: number): void;
  /** Start/stop rendering (the dressing room is shown / hidden). */
  run(on: boolean): void;
  /** Items worn on the stage hero right now (test hook). */
  worn(): StageLook;
  resize(): void;
}

const PARTS: readonly AttachPart[] = ['head', 'face', 'back'];

interface Worn {
  id: string;
  wear: Wearable;
  holder: THREE.Group;
  pop: number;
}

const easeOutBack = (t: number): number => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

export function createStage(testMode: boolean): Stage {
  const host = document.createElement('div');
  host.className = 'dr-host';
  let renderer: THREE.WebGLRenderer | null = null;
  let canvas: HTMLCanvasElement | null = null;
  /**
   * The stage's WebGL context exists only while needed: made when the room opens; in test mode
   * (software GL, many contexts in one browser) released again when it closes.
   */
  const ensureRenderer = (): void => {
    if (renderer) return;
    try {
      const c = document.createElement('canvas');
      c.className = 'dr-canvas';
      c.setAttribute('data-testid', 'wardrobe-stage');
      const r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: !testMode, powerPreference: 'low-power', preserveDrawingBuffer: testMode });
      r.setClearColor(0x000000, 0);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.15;
      wireDrag(c);
      host.replaceChildren(c);
      renderer = r;
      canvas = c;
    } catch {
      renderer = null;
      canvas = null;
    }
  };
  const releaseRenderer = (): void => {
    if (!renderer) return;
    renderer.dispose();
    renderer.forceContextLoss();
    renderer = null;
    canvas?.remove();
    canvas = null;
  };

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeef4ff, 0x40384a, 1.5));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.6);
  key.position.set(2.5, 4, 4);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 2.2);
  rim.position.set(-3, 3, -3);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8);
  fill.position.set(-3, 1, 3);
  scene.add(key, rim, fill);

  // Podium: dark top, bright rim and a bright ring (reads by brightness in both channels).
  const podium = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.18, 48), new THREE.MeshStandardMaterial({ color: 0x2a2f5a, roughness: 0.5, metalness: 0.2 }));
  top.position.y = -0.09;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.035, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  ring.position.y = 0.0;
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.68, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  inner.position.y = 0.005;
  podium.add(top, ring, inner);
  scene.add(podium);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const turntable = new THREE.Group();
  scene.add(turntable);

  let hero: LoadedCharacter | null = null;
  let heroId = '';
  let loading = '';
  const cache = new Map<string, Promise<LoadedCharacter>>();
  const worn = new Map<AttachPart, Worn>();
  let look: StageLook = { head: null, face: null, back: null };
  let running = false;
  let raf = 0;
  let last = 0;
  let yaw = -0.35;
  let yawVel = 0;
  let poseLeft = 0;
  let jiggle = 0;
  let hop = 0;
  let frame = 0;

  const frameHero = (def: CharacterDef | undefined): void => {
    const h = (def?.height ?? 1.7) * 1.18 + 0.25;
    const lookY = h * 0.47;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(h / (2 * tan), 2.6 / (2 * tan * Math.max(0.5, camera.aspect))) * 1.02;
    camera.position.set(0, lookY + dist * 0.12, dist);
    camera.lookAt(0, lookY - 0.02, 0);
  };

  const putOn = (part: AttachPart, id: string | null, animate: boolean): void => {
    const old = worn.get(part);
    if (old) {
      old.holder.removeFromParent();
      old.wear.dispose();
      worn.delete(part);
    }
    if (!id || !hero) return;
    const wear = buildGear(id);
    if (!wear) return;
    const fit = gearFit(hero.def.id, part, id);
    const holder = new THREE.Group();
    holder.position.set(...(fit?.pos ?? ([0, 0, 0] as const)));
    holder.rotation.set(...(fit?.rot ?? ([0, 0, 0] as const)));
    holder.scale.setScalar(fit?.scale ?? 1);
    holder.add(wear.object);
    hero.anchors[part].add(holder);
    if (animate) wear.object.scale.setScalar(0.001);
    worn.set(part, { id, wear, holder, pop: animate ? 0 : 1 });
  };

  const dress = (animate: boolean): void => {
    for (const p of PARTS) {
      if (worn.get(p)?.id === (look[p] ?? undefined)) continue;
      putOn(p, look[p], animate);
    }
  };

  const playPose = (anim: PlayerAnim | 'emote', secs: number): void => {
    if (!hero) return;
    hero.play(anim, 1, 0.15, true);
    poseLeft = secs;
  };

  function setHero(id: string): void {
    if (id === heroId || id === loading) return;
    const def = CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
    if (!def) return;
    loading = id;
    let p = cache.get(def.id);
    if (!p) {
      p = loadCharacter(def);
      cache.set(def.id, p);
    }
    p.then((c) => {
      if (loading !== id) return;
      loading = '';
      if (hero) {
        for (const part of PARTS) putOn(part, null, false);
        turntable.remove(hero.object);
      }
      hero = c;
      heroId = id;
      turntable.add(c.object);
      c.object.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = false;
      });
      c.play('idle', 1, 0);
      frameHero(c.def);
      dress(false);
    }).catch(() => {
      loading = '';
      cache.delete(def.id);
    });
  }

  const draw = (): void => {
    if (!renderer || !canvas) return;
    renderer.render(scene, camera);
  };

  const tick = (now: number): void => {
    raf = 0;
    if (!running) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    frame++;
    // The software renderer in tests is slow: draw every sixth frame there.
    const drawNow = !testMode || frame % 6 === 0;
    step(dt);
    if (drawNow) draw();
    raf = requestAnimationFrame(tick);
  };

  function step(dt: number): void {
    yaw += yawVel * dt;
    yawVel *= Math.pow(0.04, dt);
    turntable.rotation.y = yaw;
    hop = Math.max(0, hop - dt * 2.2);
    turntable.position.y = Math.sin(Math.min(1, 1 - hop) * Math.PI) * (hop > 0 ? 0.18 : 0);
    jiggle = Math.max(0, jiggle - dt * 3);
    if (hero) {
      if (poseLeft > 0) {
        poseLeft -= dt;
        if (poseLeft <= 0) hero.play('idle', 1, 0.3);
      }
      hero.update(dt);
    }
    // Fake speed pulses make the wobbly bits wobble after a pop or a hop.
    const speed = jiggle > 0 ? 6 * Math.sin(jiggle * 9) * jiggle : 0;
    for (const w of worn.values()) {
      if (w.pop < 1) {
        w.pop = Math.min(1, w.pop + dt / 0.45);
        w.wear.object.scale.setScalar(Math.max(0.001, easeOutBack(w.pop)));
      }
      w.wear.update?.(dt, Math.abs(speed));
    }
    ring.rotation.y += dt * 0.4;
  }

  const sizeTo = (): void => {
    if (!renderer || !canvas) return;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(64, Math.round(r.width));
    const h = Math.max(64, Math.round(r.height));
    const dpr = testMode ? 1 : Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    frameHero(hero?.def);
  };

  // Drag to turn.
  let dragX: number | null = null;
  function wireDrag(c: HTMLCanvasElement): void {
    c.addEventListener('pointerdown', (e) => {
      dragX = e.clientX;
      c.setPointerCapture?.(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (dragX === null) return;
      const dx = e.clientX - dragX;
      dragX = e.clientX;
      yaw += dx * 0.012;
      yawVel = dx * 0.6;
    });
    const endDrag = (): void => {
      dragX = null;
    };
    c.addEventListener('pointerup', endDrag);
    c.addEventListener('pointercancel', endDrag);
  }

  return {
    el: host,
    get ready() {
      return !!hero && !loading;
    },
    setHero,
    setLook(next, cheer) {
      const changed = PARTS.some((p) => next[p] !== look[p]);
      const added = PARTS.some((p) => next[p] && next[p] !== look[p]);
      look = { ...next };
      if (!changed) return;
      dress(cheer);
      if (cheer && added) {
        playPose('cheer', 1.4);
        hop = 1;
        jiggle = 1;
      }
    },
    pose(anim) {
      playPose(anim, anim === 'dance' ? 3 : 2);
      jiggle = 1;
    },
    turn(rad) {
      yawVel += rad * 3.2;
    },
    run(on) {
      if (on === running) return;
      running = on;
      last = 0;
      if (on) {
        ensureRenderer();
        sizeTo();
        if (!raf) raf = requestAnimationFrame(tick);
        // Draw once right away (the first rAF may be a while on a busy machine).
        step(0);
        draw();
      } else {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (testMode) releaseRenderer();
      }
    },
    worn() {
      const out: StageLook = { head: null, face: null, back: null };
      for (const p of PARTS) out[p] = worn.get(p)?.id ?? null;
      return out;
    },
    resize: sizeTo,
  };
}
