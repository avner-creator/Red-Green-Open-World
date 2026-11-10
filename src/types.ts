/**
 * Shared interfaces for every system. ONLY the orchestrator edits this file.
 * Systems talk to each other through `GameContext` and never import each other's internals.
 */
import type * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Pass } from 'postprocessing';

// ───────────────────────────── Vision (red-green) ─────────────────────────────

/** Which eye(s) can see an object. See "The red-green (dichoptic) rule" in CLAUDE.md. */
export enum VisionLayer {
  /** Normal world object: both eyes. Lives in `ctx.scene`. */
  Both = 0,
  /** Visible only through the weaker eye's lens (gems, clues, secret paths, chest keys). */
  WeakOnly = 1,
  /** Visible only through the stronger eye's lens (chest locks). */
  StrongOnly = 2,
}

export type Eye = 'left' | 'right';
export type Lens = 'red' | 'green';
export type Channel = 'r' | 'g';

export interface EyeSettings {
  /** Colour of the lens in front of the LEFT eye. Default 'red'. */
  leftLens: Lens;
  /** Which eye is the weaker one. */
  weakEye: Eye;
  /** 0..1 — how strongly weak-eye objects are mixed into the weak channel. Default 1. */
  weakStrength: number;
  /** 0..1 — max allowed weak-channel delta (crosstalk limiter). 1 = unlimited. Default 1. */
  crosstalkLimit: number;
  /** 0.4..1 — contrast of the strong channel for the whole image. Default 1. */
  strongContrast: number;
}

export interface ChannelAssignment {
  weak: Channel;
  strong: Channel;
}

export type Quality = 'low' | 'medium' | 'high';

export interface GameSettings {
  eye: EyeSettings;
  /** Session length in minutes (3..15). Default 5. */
  sessionMinutes: number;
  volumeMaster: number; // 0..1
  volumeMusic: number; // 0..1
  volumeSfx: number; // 0..1
  quality: Quality;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface SettingsApi {
  get(): Readonly<GameSettings>;
  /** Merge a patch, clamp, save to localStorage, emit `settings:changed`. */
  set(patch: DeepPartial<GameSettings>): void;
  reset(): void;
}

/**
 * Owns the frame: main scene → post passes → layer pass → dichoptic compositor → canvas.
 * Implemented in `src/vision`.
 */
export interface VisionApi {
  /**
   * Register an object for a layer. `Both` simply adds it to `ctx.scene`.
   * `WeakOnly`/`StrongOnly` objects are owned by the vision layer scene: do NOT also add them to
   * `ctx.scene`. Their world transform is whatever you set on the object (or its parents inside
   * the object). Material colour is ignored; only brightness (luminance) and alpha matter.
   */
  add(object: THREE.Object3D, layer: VisionLayer): void;
  remove(object: THREE.Object3D): void;
  /** Current channel assignment derived from the eye settings. */
  channels(): ChannelAssignment;
  /**
   * Post-processing passes (pmndrs `postprocessing`) that run on the main scene BEFORE the
   * compositor (AO, bloom, tone mapping, AA…). Owned by `src/world`. Replaces earlier passes.
   */
  setPostPasses(passes: Pass[]): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  /** Render one frame to the canvas. Called once per frame by main. */
  render(dt: number): void;
  /** Test/debug: hide or show every object of a layer. */
  setLayerVisible(layer: VisionLayer, visible: boolean): void;
  /** Open the calibration screen (DOM overlay + test patterns). Calls `onClose` when done. */
  openCalibration(onClose: () => void): void;
  dispose(): void;
}

// ───────────────────────────── Events ─────────────────────────────

export type SessionPhase = 'title' | 'playing' | 'paused' | 'ended';
export type PlayerMode = 'walk' | 'flop' | 'driving' | 'riding' | 'external';
export type StuntKind = 'bigBounce' | 'longGlide' | 'bullseye' | 'bigAir' | 'bungee' | 'launch';

export interface GameEvents {
  'session:phase': { phase: SessionPhase; previous: SessionPhase };
  /** Fired about 4×/s while playing. */
  'session:tick': { remaining: number; total: number };
  'settings:changed': { settings: Readonly<GameSettings> };
  'gem:collected': { id: string; count: number; total: number; position: THREE.Vector3 };
  'gem:near': { id: string; distance: number };
  'chest:key': { chestId: string };
  'chest:opened': { chestId: string; outfitId: string };
  'outfit:unlocked': { outfitId: string };
  'outfit:equipped': { outfitId: string | null; slot: OutfitSlot };
  stunt: { kind: StuntKind; value: number; stars: number };
  'interact:focus': { target: Interactable | null };
  'player:mode': { mode: PlayerMode; previous: PlayerMode };
  'player:jump': Record<string, never>;
  'player:land': { speed: number };
  'player:flop': Record<string, never>;
  'player:respawn': Record<string, never>;
  'vehicle:bump': { speed: number };
  /** Short icon+text toast on the HUD (text is optional; icons first). */
  'ui:toast': { icon: IconName; text?: string };
}

export interface EventBus {
  on<K extends keyof GameEvents>(type: K, handler: (e: GameEvents[K]) => void): () => void;
  emit<K extends keyof GameEvents>(type: K, event: GameEvents[K]): void;
}

// ───────────────────────────── Session ─────────────────────────────

export type OutfitSlot = 'head' | 'back' | 'face' | 'carColor' | 'horseColor';

export interface OutfitDef {
  id: string;
  slot: OutfitSlot;
  /** Short display name (shown small; the icon is what matters). */
  name: string;
  icon: IconName;
}

export interface SessionState {
  phase: SessionPhase;
  /** Seconds left in the session. */
  remaining: number;
  total: number;
  gems: number;
  gemsTotal: number;
  chests: number;
  chestsTotal: number;
  stars: number;
  /** Best value per stunt kind this session. */
  bestStunts: Partial<Record<StuntKind, number>>;
  outfits: string[];
}

export interface SessionApi {
  readonly state: Readonly<SessionState>;
  /** title → playing (resets counters) */
  start(): void;
  pause(): void;
  resume(): void;
  /** playing → ended (also happens when the timer hits 0) */
  end(): void;
  /** ended/paused → title */
  toTitle(): void;
  /** Activities register totals so the HUD can show "3/60". */
  setTotals(totals: { gems?: number; chests?: number }): void;
  /** Test hook: set seconds remaining. */
  setRemaining(seconds: number): void;
}

// ───────────────────────────── Input ─────────────────────────────

/** One merged, device-independent input state (keyboard+mouse and gamepad). */
export interface InputState {
  /** Move stick: x = right(+)/left(−), y = forward(+)/back(−), length ≤ 1. */
  moveX: number;
  moveY: number;
  /** Look delta since last frame, radians (already scaled by sensitivity). */
  lookX: number;
  lookY: number;
  sprint: boolean;
  /** Held states */
  jump: boolean;
  use: boolean;
  /** Edge-triggered this frame */
  jumpPressed: boolean;
  usePressed: boolean;
  flopPressed: boolean;
  respawnPressed: boolean;
  pausePressed: boolean;
  /** Last device used; UI shows matching button icons. */
  device: 'keyboard' | 'gamepad';
}

export interface InputApi {
  readonly state: Readonly<InputState>;
  /** Called first each frame by main. */
  update(dt: number): void;
  /** Request/release pointer lock (mouse look). UI calls release when a menu opens. */
  capturePointer(): void;
  releasePointer(): void;
  /** While false, gameplay inputs read as neutral (menus open). pausePressed still works. */
  setGameplayEnabled(enabled: boolean): void;
  /** Test hook: force values for the next frames (null clears). */
  inject(patch: Partial<InputState> | null): void;
}

// ───────────────────────────── Physics ─────────────────────────────

export interface PhysicsApi {
  /** The Rapier module (already initialised). */
  readonly rapier: typeof RAPIER;
  readonly world: RAPIER.World;
  /** Static helpers (world-artist uses these; no need to touch Rapier directly). */
  addStaticBox(center: THREE.Vector3, halfExtents: THREE.Vector3, rotation?: THREE.Quaternion): RAPIER.Collider;
  addStaticCylinder(center: THREE.Vector3, halfHeight: number, radius: number): RAPIER.Collider;
  addStaticSphere(center: THREE.Vector3, radius: number): RAPIER.Collider;
  /** Triangle mesh in world space (bakes the mesh's world matrix). */
  addStaticMesh(mesh: THREE.Mesh): RAPIER.Collider;
  /**
   * Terrain heightfield. `heights` is row-major [z][x] with (nx+1)*(nz+1) samples covering
   * `size` metres centred on the origin.
   */
  addHeightfield(nx: number, nz: number, heights: Float32Array, size: { x: number; z: number }): RAPIER.Collider;
  removeCollider(collider: RAPIER.Collider): void;
  /** First hit of a ray against static+dynamic geometry, or null. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { point: THREE.Vector3; normal: THREE.Vector3; distance: number } | null;
  /** Fixed-step the world. Called by main once per frame. */
  step(dt: number): void;
}

// ───────────────────────────── Player / camera / interaction ─────────────────────────────

export type PlayerAnim = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'flop' | 'dance' | 'wave' | 'cheer' | 'sit';

/**
 * Lets an activity take over the player completely (balloon ride, skydive, bungee…).
 * While set, the normal walk controller is off and physics does not move the player.
 */
export interface ExternalController {
  /** Move the player by setting `player.position`/`player.yaw`. Return false to hand control back. */
  update(dt: number, input: Readonly<InputState>): boolean;
  /** Called when control is taken away (finished, respawn, session end). */
  onRelease?(): void;
}

export interface PlayerApi {
  /** Root object (feet at origin). Outfits attach to named bones via `attach`. */
  readonly object: THREE.Object3D;
  /** Feet position (live reference; mutate only inside an ExternalController, else use teleport). */
  readonly position: THREE.Vector3;
  /** Current velocity in m/s (live reference; read-only for others — use launch()). */
  readonly velocity: THREE.Vector3;
  /** Facing angle around Y, radians. */
  yaw: number;
  readonly mode: PlayerMode;
  readonly grounded: boolean;
  /** Seconds since the player was last on the ground. */
  readonly airTime: number;
  /** Highest height above the last take-off point during the current air time. */
  readonly airPeak: number;
  teleport(position: THREE.Vector3, yaw?: number): void;
  /** Set velocity (trampoline, launch pad). Leaves the ground immediately. */
  launch(velocity: THREE.Vector3): void;
  /** Comic tumble, then pops back up. */
  flop(): void;
  /** Back to the last safe spot (or the spawn point). */
  respawn(): void;
  setExternalController(controller: ExternalController | null): void;
  /** Force an animation while in external mode (ignored in walk mode). */
  setAnimation(anim: PlayerAnim): void;
  /** Hide/show the avatar (inside the balloon basket, in a car…). */
  setVisible(visible: boolean): void;
  /** Attach an outfit mesh to a body part; returns a remover. */
  attach(part: 'head' | 'back' | 'face', object: THREE.Object3D): () => void;
  /** What the player is riding/driving, if anything. */
  readonly vehicle: VehicleApi | null;
}

export interface VehicleApi {
  readonly kind: 'car' | 'horse';
  readonly id: string;
  readonly object: THREE.Object3D;
  readonly position: THREE.Vector3;
  readonly speed: number;
  /** Tint body colour (outfit reward). */
  setColor(color: THREE.ColorRepresentation): void;
}

export interface VehiclesApi {
  readonly all: readonly VehicleApi[];
}

export interface CameraApi {
  readonly camera: THREE.PerspectiveCamera;
  /** Temporarily override follow settings (skydive pulls back and widens FOV). null resets. */
  setOverride(o: { distance?: number; height?: number; fov?: number; lookAhead?: number } | null): void;
  /** Small playful shake (landing, bump). amount 0..1 */
  shake(amount: number): void;
  /** Yaw of the camera around the player, radians (movement is camera-relative). */
  readonly yaw: number;
}

export type IconName =
  | 'gem' | 'key' | 'lock' | 'chest' | 'star' | 'car' | 'horse' | 'balloon' | 'parachute'
  | 'bungee' | 'trampoline' | 'rocket' | 'hat' | 'cape' | 'glasses' | 'paint' | 'exit'
  | 'hand' | 'clock' | 'flop' | 'eye' | 'check';

export interface Interactable {
  id: string;
  /** World position of the prompt (live getter so it can move). */
  position(): THREE.Vector3;
  /** Distance at which the E prompt shows. */
  radius: number;
  icon: IconName;
  /** Return false to hide the prompt for now. */
  enabled?(): boolean;
  onUse(): void;
}

export interface InteractionApi {
  add(target: Interactable): () => void;
  /** The currently focused (nearest in range) target. */
  readonly focused: Interactable | null;
}

// ───────────────────────────── World ─────────────────────────────

/** A named place an attraction is built on. `position` is on the ground; +Z of `yaw` is "front". */
export interface Anchor {
  position: THREE.Vector3;
  yaw: number;
  /** Clear radius the world keeps free of props. */
  radius: number;
}

export type AnchorName =
  | 'spawn' | 'garage' | 'ranch' | 'trampoline' | 'bouncePads' | 'bungee' | 'bungeeLanding'
  | 'balloon' | 'landingRings' | 'lakePlatform' | 'lighthouse' | 'sillyZone' | 'launchPads';

export interface WorldApi {
  /** Island is `size`×`size` metres centred on the origin; water level is y = `waterLevel`. */
  readonly size: number;
  readonly waterLevel: number;
  /** Terrain height (y) at x,z. */
  heightAt(x: number, z: number): number;
  /** Is this point on land the player may stand on (above water, inside the island)? */
  isLand(x: number, z: number): boolean;
  readonly anchors: Readonly<Record<AnchorName, Anchor>>;
  /**
   * Hand-picked spots for collectibles, grouped by theme (rooftops, under the bridge…).
   * `y` is the absolute height the item should float at.
   */
  readonly gemSpots: readonly { position: THREE.Vector3; tag: string }[];
  readonly chestSpots: readonly { position: THREE.Vector3; yaw: number }[];
  /** 0 (session start, golden hour) → 1 (sunset). Driven by main from the timer. */
  setTimeOfDay(t: number): void;
  setQuality(q: Quality): void;
  update(dt: number): void;
}

// ───────────────────────────── Audio ─────────────────────────────

export type SfxName =
  | 'gem' | 'gemNear' | 'jump' | 'land' | 'boing' | 'bigBoing' | 'flop' | 'splash' | 'whoosh'
  | 'chute' | 'key' | 'chest' | 'star' | 'click' | 'horn' | 'bump' | 'neigh' | 'start' | 'fanfare' | 'tick';

export interface AudioApi {
  /** Must be called from a user gesture once (Play button). */
  unlock(): void;
  play(name: SfxName, opts?: { volume?: number; pitch?: number }): void;
  /** Continuous sounds (wind, engine): intensity 0 stops it. pitch ~0.5..2 */
  setLoop(name: 'wind' | 'engine' | 'gallop', intensity: number, pitch?: number): void;
  setMusic(on: boolean): void;
  update(dt: number): void;
}

// ───────────────────────────── UI ─────────────────────────────

export interface UiApi {
  update(dt: number): void;
  /** True while a menu that needs the mouse is open. */
  readonly menuOpen: boolean;
}

// ───────────────────────────── Context & systems ─────────────────────────────

export interface GameSystem {
  update(dt: number): void;
  dispose?(): void;
}

/**
 * Everything a system can reach. Fields are filled in boot order:
 * settings, events, session, audio → renderer/scene/camera → vision → input, physics → world
 * → player, cameraRig, interactions, vehicles → activities → ui.
 * A system may only use fields created before it during construction; all are set by first update.
 */
export interface GameContext {
  readonly canvas: HTMLCanvasElement;
  /** DOM root for HUD and menus (pointer-events: none; enable on your own elements). */
  readonly uiRoot: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  /** Main (both-eye) scene. */
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly settings: SettingsApi;
  readonly events: EventBus;
  readonly session: SessionApi;
  readonly audio: AudioApi;
  /** True when running under `?test=1` (deterministic: no random camera sway, no auto music). */
  readonly testMode: boolean;
  vision: VisionApi;
  input: InputApi;
  physics: PhysicsApi;
  world: WorldApi;
  player: PlayerApi;
  cameraRig: CameraApi;
  interactions: InteractionApi;
  vehicles: VehiclesApi;
  ui: UiApi;
}

// ───────────────────────────── Test hook (`?test=1`) ─────────────────────────────

/** `window.__rg` in test mode. Used by Playwright tests and the QA agent. */
export interface TestApi {
  /** True after boot finished and at least one frame rendered. */
  ready: boolean;
  frames: number;
  ctx: GameContext;
  /** Stop the real-time loop; frames then only advance via `step`. */
  freeze(frozen: boolean): void;
  /** Advance `n` fixed frames of `dt` seconds and render (works while frozen). */
  step(dt?: number, n?: number): void;
  /** Render the current state again without advancing time. */
  render(): void;
  start(): void;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  setEye(patch: Partial<EyeSettings>): void;
  setLayerVisible(layer: VisionLayer, visible: boolean): void;
  setRemaining(seconds: number): void;
  inject(patch: Partial<InputState> | null): void;
  state(): SessionState & { playerPosition: [number, number, number]; playerMode: PlayerMode };
  /** Uncaught errors seen since boot. */
  errors: string[];
}

declare global {
  interface Window {
    __rg?: TestApi;
  }
}
