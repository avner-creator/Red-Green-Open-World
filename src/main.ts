/** Boot + frame loop. Only the orchestrator edits this file. */
import * as THREE from 'three';
import { CAMERA, FIXED_DT, MAX_FRAME_DT } from './config';
import { createEventBus } from './events';
import { createSettings } from './settings';
import { createSession } from './session';
import { createAudio } from './audio';
import { createVision } from './vision';
import { createInput, createPhysics, createPlayerSystems } from './core';
import { createWorld } from './world';
import { createActivities } from './activities';
import { createUi } from './ui';
import type { GameContext, Quality, TestApi } from './types';

const params = new URLSearchParams(location.search);
const testMode = params.get('test') === '1';
const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(`unhandledrejection: ${String(e.reason)}`));

const PIXEL_RATIO_CAP: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;
  const bootEl = document.getElementById('boot');

  const events = createEventBus();
  const settings = createSettings(events);
  const session = createSession(events, settings);
  const audio = createAudio({ settings, events, testMode });

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    stencil: false,
    depth: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: testMode,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, CAMERA.near, CAMERA.far);

  // Filled in boot order; see GameContext docs.
  const base: Partial<GameContext> = { canvas, uiRoot, renderer, scene, camera, settings, events, session, audio, testMode };
  const ctx = base as GameContext;

  ctx.vision = createVision(ctx);
  ctx.input = createInput(ctx);
  ctx.physics = await createPhysics(ctx);
  ctx.world = await createWorld(ctx);
  const core = await createPlayerSystems(ctx);
  ctx.player = core.player;
  ctx.cameraRig = core.cameraRig;
  ctx.interactions = core.interactions;
  ctx.vehicles = core.vehicles;
  const activities = await createActivities(ctx);
  ctx.ui = createUi(ctx);

  const resize = (): void => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const cap = testMode ? 1 : PIXEL_RATIO_CAP[settings.get().quality];
    ctx.vision.setSize(w, h, Math.min(window.devicePixelRatio || 1, cap));
  };
  window.addEventListener('resize', resize);
  ctx.world.setQuality(settings.get().quality);
  events.on('settings:changed', (e) => {
    ctx.world.setQuality(e.settings.quality);
    resize();
  });
  events.on('session:tick', (e) => ctx.world.setTimeOfDay(e.total > 0 ? 1 - e.remaining / e.total : 0));
  events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') {
      ctx.player.respawn();
      ctx.world.setTimeOfDay(0);
    }
  });
  resize();

  let frames = 0;
  let prevPhase = session.state.phase;
  const update = (dt: number): void => {
    const phase = session.state.phase;
    ctx.input.setGameplayEnabled(phase === 'playing' && !ctx.ui.menuOpen);
    ctx.input.update(dt);
    // A pause press queued while a menu was open (e.g. the Esc / Start that just resumed) must not
    // pause again on the first playing frame.
    if (phase === 'playing' && prevPhase === 'playing' && ctx.input.state.pausePressed) session.pause();
    prevPhase = phase;
    if (phase === 'playing' || phase === 'title') {
      session.update(dt);
      ctx.physics.step(dt);
      core.system.update(dt);
      activities.update(dt);
    }
    ctx.world.update(dt);
    ctx.ui.update(dt);
    audio.update(dt);
  };
  const render = (dt: number): void => {
    ctx.vision.render(dt);
    frames += 1;
    if (api) api.frames = frames;
  };

  let frozen = false;
  let last = performance.now();
  const loop = (now: number): void => {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, MAX_FRAME_DT);
    last = now;
    if (frozen) return;
    update(dt);
    render(dt);
  };

  let api: TestApi | undefined;
  if (testMode) {
    api = {
      ready: false,
      frames: 0,
      ctx,
      errors,
      freeze(f) {
        frozen = f;
      },
      step(dt = FIXED_DT, n = 1, draw = true) {
        for (let i = 0; i < n; i++) update(dt);
        if (draw) render(dt);
      },
      render() {
        render(0);
      },
      start() {
        audio.unlock();
        if (session.state.phase !== 'title') session.toTitle();
        session.start();
      },
      teleport(x, y, z, yaw) {
        ctx.player.teleport(new THREE.Vector3(x, y, z), yaw);
      },
      setEye(patch) {
        settings.set({ eye: patch });
      },
      setLayerVisible(layer, visible) {
        ctx.vision.setLayerVisible(layer, visible);
      },
      setRemaining(seconds) {
        session.setRemaining(seconds);
      },
      inject(patch) {
        ctx.input.inject(patch);
      },
      state() {
        const p = ctx.player.position;
        return { ...session.state, playerPosition: [p.x, p.y, p.z], playerMode: ctx.player.mode };
      },
    };
    window.__rg = api;
  }

  update(FIXED_DT);
  render(FIXED_DT);
  if (api) api.ready = true;
  if (bootEl) {
    bootEl.style.opacity = '0';
    setTimeout(() => bootEl.remove(), 450);
  }
  requestAnimationFrame(loop);
}

boot().catch((err: unknown) => {
  console.error(err);
  errors.push(String(err));
  const bootEl = document.getElementById('boot');
  if (bootEl) bootEl.textContent = '⚠️';
});
