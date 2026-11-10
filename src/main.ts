/**
 * Boot + frame loop. Only the orchestrator edits this file; the loader/boot-stage parts belong to
 * Stream I (`src/boot/`). Only the small pieces needed to paint the loading screen are static
 * imports; every heavy system is a separate chunk, downloaded in parallel and awaited in boot order.
 */
import { CAMERA, FIXED_DT, MAX_FRAME_DT, SETTINGS_KEY } from './config';
import { createEventBus } from './events';
import { createSettings } from './settings';
import { createSession } from './session';
import { isPhoneViewport, touchPixelRatioCap } from './core/input-touch-math';
import { createBootLoader, hasWebGL2, nextPaint, showContextLost, watchContextLoss, watchVisibility, whenVisible } from './boot';
import type { FailureScreen } from './boot';
import type { GameContext, TestApi } from './types';

const params = new URLSearchParams(location.search);
const testMode = params.get('test') === '1';
/**
 * Test mode only: `&quality=low|medium|high` sets the boot quality (e2e tests that don't judge
 * visuals run at Low: no shadow map, thinner scatter, about half the SwiftShader frame cost).
 */
const testQuality = testMode ? params.get('quality') : null;
const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(`unhandledrejection: ${String(e.reason)}`));

/** A phone: coarse primary pointer and a phone-sized viewport (short side). */
function isPhone(w = window.innerWidth, h = window.innerHeight): boolean {
  let coarse = false;
  try {
    coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    /* no matchMedia: not a phone */
  }
  return coarse && isPhoneViewport(Math.max(1, w), Math.max(1, h));
}

/** True when a settings object was saved before (a grown-up's choice wins over device defaults). */
function hasSavedSettings(): boolean {
  try {
    return localStorage.getItem(SETTINGS_KEY) !== null;
  } catch {
    return false;
  }
}

const loader = createBootLoader(document.getElementById('boot'));

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;

  if (!hasWebGL2()) {
    loader.fail('webgl');
    return;
  }

  // Start every download now (they arrive in parallel; Vite adds modulepreload for their shared
  // chunks, and index.html already preloads the physics WASM). They are awaited in boot order.
  loader.stage('code');
  const chunks = {
    three: import('three'),
    audio: import('./audio'),
    vision: import('./vision'),
    core: import('./core'),
    world: import('./world'),
    activities: import('./activities'),
    ui: import('./ui'),
  };
  // A failure is reported where the chunk is awaited (below), not as an unhandled rejection.
  for (const p of Object.values(chunks)) p.catch(() => undefined);
  const [THREE, { createAudio }, { createVision }] = await Promise.all([chunks.three, chunks.audio, chunks.vision]);

  const events = createEventBus();
  const firstRun = !hasSavedSettings();
  const settings = createSettings(events);
  // First run on a phone: start at Low (smooth on phone GPUs). Saved settings are never overridden.
  if (!testMode && firstRun && isPhone()) settings.set({ quality: 'low' });
  if (testQuality === 'low' || testQuality === 'medium' || testQuality === 'high') settings.set({ quality: testQuality });
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
  const { createInput, createPhysics, createPlayerSystems } = await chunks.core;
  ctx.input = createInput(ctx);
  loader.stage('physics');
  await nextPaint();
  ctx.physics = await createPhysics(ctx);
  const { createWorld } = await chunks.world;
  loader.stage('world');
  await nextPaint();
  ctx.world = await createWorld(ctx);
  loader.stage('player');
  await nextPaint();
  const core = await createPlayerSystems(ctx);
  ctx.player = core.player;
  ctx.cameraRig = core.cameraRig;
  ctx.interactions = core.interactions;
  ctx.vehicles = core.vehicles;
  const { createActivities } = await chunks.activities;
  loader.stage('activities');
  await nextPaint();
  const activities = await createActivities(ctx);
  const { createUi } = await chunks.ui;
  loader.stage('ui');
  await nextPaint();
  ctx.ui = createUi(ctx);

  const resize = (): void => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Phones get a lower pixel-ratio cap at every quality (see touchPixelRatioCap).
    const cap = testMode ? 1 : touchPixelRatioCap(settings.get().quality, isPhone(w, h));
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
  /** True while the GPU context is lost: nothing is updated or drawn until it is restored. */
  let contextLost = false;
  let last = performance.now();
  const loop = (now: number): void => {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, MAX_FRAME_DT);
    last = now;
    if (frozen || contextLost) return;
    update(dt);
    render(dt);
  };

  // Lost GPU context (driver reset, too many tabs, phone sleep): wordless "picture is coming back"
  // screen, then carry on without reloading once three.js has rebuilt its GPU state.
  let lostScreen: FailureScreen | null = null;
  watchContextLoss(canvas, {
    onLost() {
      contextLost = true;
      if (session.state.phase === 'playing') session.pause();
      lostScreen = showContextLost();
    },
    onRestored() {
      contextLost = false;
      lostScreen?.close();
      lostScreen = null;
      resize();
      last = performance.now();
    },
  });
  // Background tab: pause the game and fade the music out; the pause menu greets the player back.
  watchVisibility({
    onHidden() {
      if (session.state.phase === 'playing') session.pause();
      audio.setMusic(false);
    },
    onVisible() {
      audio.setMusic(true);
      last = performance.now();
    },
  });

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

  loader.stage('frame');
  await nextPaint();
  update(FIXED_DT);
  render(FIXED_DT);
  if (api) api.ready = true;
  requestAnimationFrame(loop);
  // A tab opened in the background keeps the reveal for when the player looks at it.
  await whenVisible();
  await loader.done();
}

boot().catch((err: unknown) => {
  console.error(err);
  errors.push(String(err));
  // A chunk, the physics WASM or a model did not download (or boot broke): wordless retry screen.
  loader.fail('load');
});
