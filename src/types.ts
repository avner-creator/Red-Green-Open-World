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

/** Kinds of glasses play (docs/GAME_DESIGN.md "Red-green depth pass"); used for scoring and the grown-up summary. */
export type GlassesKind = 'find' | 'follow' | 'read' | 'tellApart' | 'timeIt' | 'lineUp' | 'popOut' | 'onHero';

/** Difficulty tier of a weak-eye object: 1 = big, bright, slow … 3 = small, faint, fast (worth more). */
export type GlassesTier = 1 | 2 | 3;

/**
 * Per-session challenge modifiers on top of the calibrated eye settings ("Auto challenge").
 * Runtime only: never written to the saved settings. Every scale is 0..1 where 1 = exactly the
 * calibrated value, so the picture can only get harder than calibrated, never stronger.
 */
export interface ChallengeModifiers {
  /** Staircase step: 0 (calibrated) .. `maxLevel`. */
  level: number;
  maxLevel: number;
  /** Effective weak-layer strength = settings.eye.weakStrength × weakScale. */
  weakScale: number;
  /** Effective strong-eye contrast = max(0.4, settings.eye.strongContrast × strongScale). */
  strongScale: number;
  /** Suggested size multiplier for weak-eye objects built with the vision toolkit. */
  sizeScale: number;
}

/** Hits and misses of one mechanic at one tier in a session. */
export interface GlassesTally {
  /** Mechanic id, e.g. 'gems', 'glowflies', 'oddOneOut'. */
  mechanic: string;
  kind: GlassesKind;
  tier: GlassesTier;
  hits: number;
  misses: number;
}

/** What the grown-up summary screen shows: plain counts, nothing else. */
export interface GlassesSummary {
  /** One row per mechanic and tier that had at least one result in the session. */
  rows: readonly GlassesTally[];
  /** Seconds played in the session the rows cover. */
  seconds: number;
  /** Auto challenge: was it on, where the staircase ended and how many steps it took each way. */
  challenge: { enabled: boolean; level: number; maxLevel: number; stepsUp: number; stepsDown: number };
}

export type Quality = 'low' | 'medium' | 'high';

export interface GameSettings {
  eye: EyeSettings;
  /** Session length in minutes (3..15). Default 5. */
  sessionMinutes: number;
  volumeMaster: number; // 0..1
  volumeMusic: number; // 0..1
  volumeSfx: number; // 0..1
  /** Pip's spoken words, 0..1 (default 1). */
  voicePip: number;
  quality: Quality;
  /** Grown-up option "Auto challenge": gently adapts weak-eye objects during a session. Default off (undefined). */
  autoChallenge?: boolean;
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
  /** Current per-session challenge modifiers (identity, level 0, when "Auto challenge" is off). */
  challenge?(): Readonly<ChallengeModifiers>;
  /** Test/debug: force modifiers (clamped to 0..1); null hands control back to the staircase. Never touches saved settings. */
  setChallenge?(mods: Partial<Pick<ChallengeModifiers, 'level' | 'weakScale' | 'strongScale' | 'sizeScale'>> | null): void;
  /**
   * Fade a whole layer (`WeakOnly` or `StrongOnly`) to `fade` 0..1 (1 = normal), eased over `seconds`
   * (default 0 = at once). Multiplies with the challenge modifiers; never touches the other channel.
   */
  setLayerFade?(layer: VisionLayer, fade: number, seconds?: number): void;
  /** Glasses-play counts of the current (or the last finished) session, for the grown-up summary. */
  sessionSummary?(): GlassesSummary;
  /** Open the calibration screen (DOM overlay + test patterns). Calls `onClose` when done. */
  openCalibration(onClose: () => void): void;
  dispose(): void;
}

// ───────────────────────────── Events ─────────────────────────────

export type SessionPhase = 'title' | 'playing' | 'paused' | 'ended';
export type PlayerMode = 'walk' | 'flop' | 'driving' | 'riding' | 'external';
export type StuntKind =
  | 'bigBounce' | 'longGlide' | 'bullseye' | 'bigAir' | 'bungee' | 'launch'
  /** Attraction rounds finished (value = score or place, stars = result). */
  | 'carnival' | 'scoops' | 'race' | 'sky' | 'bumper' | 'foam';

export interface GameEvents {
  'session:phase': { phase: SessionPhase; previous: SessionPhase };
  /** Fired about 4×/s while playing. */
  'session:tick': { remaining: number; total: number };
  'settings:changed': { settings: Readonly<GameSettings> };
  'gem:collected': {
    id: string; count: number; total: number; position: THREE.Vector3;
    /** Stream C: gem value (1 or 5), mega gem, combo multiplier used (1..5), value × combo put in the wallet. */
    value?: number; mega?: boolean; combo?: number; gain?: number;
  };
  'gem:near': { id: string; distance: number };
  'chest:key': { chestId: string };
  'chest:opened': { chestId: string; outfitId: string };
  'outfit:unlocked': { outfitId: string };
  'outfit:equipped': { outfitId: string | null; slot: OutfitSlot };
  /** `stamped`: the attraction also emits its own `stamp:earned`, so the Fun Pass derives nothing from this stunt. */
  stunt: { kind: StuntKind; value: number; stars: number; stamped?: boolean };
  'interact:focus': { target: Interactable | null };
  'player:mode': { mode: PlayerMode; previous: PlayerMode };
  'player:jump': Record<string, never>;
  'player:land': { speed: number };
  'player:flop': Record<string, never>;
  'player:respawn': Record<string, never>;
  /**
   * The hero got dizzy from mashing (a burst of presses during a carnival round): a short comic stun.
   * `game` is the booth id, `seconds` the stun. For guide hints such as "slow and steady".
   */
  'player:dizzy': { source: 'carnival'; game: string; seconds: number };
  /** Glasses play: something only the weak eye (or both eyes together) could do was hit or missed. */
  'glasses:result': { mechanic: string; kind: GlassesKind; tier: GlassesTier; hit: boolean };
  /** The "Auto challenge" staircase moved or was reset. */
  'glasses:challenge': { modifiers: Readonly<ChallengeModifiers> };
  /** A glasses booth waits for the hero to come back to its start pad (Pip: "Back to the pad!"). */
  'glasses:wait': { mechanic: string };
  /** The playable character changed (after its model loaded and swapped in). */
  'player:character': { id: string };
  /** A character skill fired (double jump, glide start, dash, super-bounce spring, ground pound). */
  'player:skill': { id: SkillId };
  /** The player started the character's signature emote. `id` is the emote id (e.g. 'dance'). */
  'player:emote': { id: string };
  'vehicle:bump': { speed: number };
  /** Short icon+text toast on the HUD (text is optional; icons first). */
  'ui:toast': { icon: IconName; text?: string };
  // Economy (stream C)
  'wallet:changed': { wallet: number; delta: number; reason: WalletReason };
  'gem:respawned': { id: string };
  'combo:changed': { multiplier: number; streak: number };
  /** The player used the kiosk; the UI opens the shop. */
  'shop:open': Record<string, never>;
  'shop:purchased': { itemId: string; price: number };
  'item:unlocked': { itemId: string; source: UnlockSource };
  'item:equipped': { slot: EquipSlot; itemId: string | null };
  /** Ask for the equipped emote (or a given one) to play. */
  'emote:play': { itemId?: string };
  'ticket:paid': { kind: TicketKind; price: number; free: boolean };
  /**
   * An attraction round was completed (a Fun Pass stamp). Emitted once per completion by the
   * attraction itself; `id` is the stamp slot: the attraction's anchor name, a glasses site id, or
   * 'chest'. The Fun Pass ignores repeats.
   */
  'stamp:earned': { id: string };
  'ticket:denied': { kind: TicketKind; price: number; wallet: number };
  'mission:progress': { index: number; mission: MissionState };
  'mission:completed': { index: number; mission: MissionState };
  'mission:jackpot': { reward: number };
  'profile:reset': Record<string, never>;
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
  // Economy counters (stream C), reset by `start()`.
  /** Gems put in the wallet this session (bonuses included). */
  earned?: number;
  bestCombo?: number;
  megaGems?: number;
  missionsDone?: number;
  spent?: number;
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
  /** Character skill held (glide, super-bounce charge): Q, gamepad LB, touch skill button. */
  skill: boolean;
  /** Edge-triggered: skill pressed this frame. */
  skillPressed: boolean;
  /** Edge-triggered: emote (C or G, gamepad D-pad up, touch emote button). */
  emotePressed: boolean;
  /**
   * Last device used; UI shows matching button icons. 'touch' while the on-screen touch controls
   * are active (touch-first device or the last input was a finger): no key caps, touch pictograms.
   */
  device: 'keyboard' | 'gamepad' | 'touch';
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
  /**
   * First hit of a ray against static+dynamic geometry, or null. `visibleOnly` skips invisible
   * movement helpers (colliders in `GROUP_HELPER`, see `src/core/physics.ts`): use it for
   * sightline checks ("does something the player can see hide this?").
   */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, opts?: { visibleOnly?: boolean }): { point: THREE.Vector3; normal: THREE.Vector3; distance: number } | null;
  /** Fixed-step the world. Called by main once per frame. */
  step(dt: number): void;
}

// ───────────────────────────── Player / camera / interaction ─────────────────────────────

/** Character skills (one per character, see `src/core/characters/catalog.ts`). */
export type SkillId = 'doubleJump' | 'glide' | 'dash' | 'superBounce' | 'groundPound';

/** Read-only view of the current character's skill. */
export interface PlayerSkillView {
  readonly id: SkillId;
  /** Can fire now (cooldown over, nothing in progress). Air/ground rules still apply. */
  readonly ready: boolean;
  /** Seconds until ready again (0 when ready). */
  readonly cooldown: number;
  /** A skill is in progress (gliding, dashing, charging, pounding). */
  readonly active: boolean;
  /**
   * Multiplier for the NEXT trampoline / bounce-pad bounce (1 = none). 1.25 after a super-bounce;
   * Infinity after a ground-pound landing (= give the maximum bounce: `min(apex * boost, max)`).
   * Read it when the bounce starts; it is cleared when an external controller takes over or
   * shortly after a landing that started no bounce.
   */
  readonly bounceBoost: number;
  /** The chosen super power's id when it differs from the classic skill `id` (extra powers). */
  readonly power?: string;
}

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

/** See `PlayerApi.addMoveModifier`. Each factor defaults to 1. */
export interface MoveModifier {
  /** Top walk/sprint speed. */
  speed?: number;
  /** Gravity while walking/jumping (< 1 = floaty). */
  gravity?: number;
  /** Ground grip: acceleration and braking (< 1 = slippery). */
  friction?: number;
  /** Jump take-off speed. */
  jump?: number;
  /** Seconds until it removes itself (omit = until `remove()`). */
  duration?: number;
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
  /**
   * Walk-mode movement modifier (ice-cream effects, slippery ground…). Active modifiers multiply
   * together; `duration` (s, game time) makes it expire on its own. Returns `remove()`. All are
   * cleared when a session starts or ends. The object is kept (not copied): its factors may be
   * eased while it is active (re-read every frame).
   */
  addMoveModifier(mod: MoveModifier): () => void;
  setExternalController(controller: ExternalController | null): void;
  /** Force an animation while in external mode (ignored in walk mode). */
  setAnimation(anim: PlayerAnim): void;
  /** Hide/show the avatar (inside the balloon basket, in a car…). */
  setVisible(visible: boolean): void;
  /** Attach an outfit mesh to a body part; returns a remover. */
  attach(part: 'head' | 'back' | 'face' | 'hand', object: THREE.Object3D): () => void;
  /**
   * Tilt the body about its centre (PLAYER.height / 2), radians: `pitch` forward (+ = face down,
   * the belly-down skydive pose), `roll` sideways. Feet `position`, yaw and pickup points don't
   * move. Outfits follow. Reset to 0, 0 automatically when an external controller is released.
   */
  setTilt(pitch: number, roll: number): void;
  /**
   * Visual-only extra rotation of the avatar about its body centre (flips, spins), or null to
   * clear. Composes with `setTilt`: the tilt is the outer rotation, this one is applied inside the
   * tilted body frame. Feet `position`, yaw, collider and pickup points don't move; outfits follow.
   * Ignored during a flop. Cleared automatically when an external controller is released, on
   * respawn, on flop and when entering a vehicle.
   */
  setVisualRotation(q: THREE.Quaternion | null): void;
  /**
   * Visual-only extra squash (-) / stretch (+) on top of the built-in landing spring: height
   * scales by 1 + s, width by 1 - s / 2 (clamped to -0.9..2). 0 clears. Same reset rules as
   * `setVisualRotation`.
   */
  setVisualStretch(s: number): void;
  /** What the player is riding/driving, if anything. */
  readonly vehicle: VehicleApi | null;
  /** Current character id (catalog id, e.g. 'robot'). */
  readonly characterId: string;
  /**
   * Switch character (loads its model lazily, swaps it in with a poof, keeps position, velocity,
   * mode and outfits). Emits `player:character`. Unknown ids are ignored with a warning.
   */
  setCharacter(id: string): Promise<void>;
  /** The current character's skill. */
  readonly skill: PlayerSkillView;
  /** Play the character's signature emote (walk mode, on the ground; moving cancels it). */
  emote(): void;
  /**
   * Stream C: a handler `emote()` asks first (after its own walk/ground checks). Return true when it
   * played its own emote (the equipped shop emote); false falls back to the signature emote.
   */
  setEmoteHandler?(handler: (() => boolean) | null): void;
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
  /**
   * Temporarily override follow settings (skydive pulls back and widens FOV). null resets.
   * `yawOffset` (radians): while set, the camera eases to look along `player.yaw + yawOffset`
   * (player look input still works and wins for a moment). `orbitRate` (rad/s): while set, the
   * camera keeps orbiting around the player at that rate (e.g. a slow reveal on the balloon ride).
   */
  setOverride(
    o: { distance?: number; height?: number; fov?: number; lookAhead?: number; yawOffset?: number; orbitRate?: number } | null,
  ): void;
  /** Small playful shake (landing, bump). amount 0..1 */
  shake(amount: number): void;
  /** Yaw of the camera around the player, radians (movement is camera-relative). */
  readonly yaw: number;
}

export type IconName =
  | 'gem' | 'key' | 'lock' | 'chest' | 'star' | 'car' | 'horse' | 'balloon' | 'parachute'
  | 'bungee' | 'trampoline' | 'rocket' | 'hat' | 'cape' | 'glasses' | 'paint' | 'exit'
  | 'hand' | 'clock' | 'flop' | 'eye' | 'check'
  | 'megaGem' | 'combo' | 'shop' | 'ticket' | 'mission' | 'trail' | 'emote' | 'backpack' | 'character' | 'jackpot' | 'wallet'
  | 'tent' | 'plane' | 'dragon' | 'cone' | 'flag' | 'bubble'
  /** A foot stepping onto a floor tile ("step on a tile"). */
  | 'step';

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
  /** Optional landing/aim spot that belongs to this anchor (launchPads: the rocket landing net). */
  target?: THREE.Vector3;
  /** Clear radius around `target`, metres. */
  targetRadius?: number;
}

export type AnchorName =
  | 'spawn' | 'garage' | 'ranch' | 'trampoline' | 'bouncePads' | 'bungee' | 'bungeeLanding'
  | 'balloon' | 'landingRings' | 'lakePlatform' | 'lighthouse' | 'sillyZone' | 'launchPads'
  /** Gear Shack kiosk on the plaza; +Z of its yaw is the counter side where the player stands. */
  | 'gearShack'
  /** Carnival Island attractions (positions, yaws and clear radii: `src/world/layout.ts`). */
  | 'carnivalRow' | 'iceCream' | 'bubbleArena' | 'dinoRing' | 'raceStart' | 'foamCourse' | 'airstrip' | 'dragonRoost';

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
  | 'chute' | 'key' | 'chest' | 'star' | 'click' | 'horn' | 'bump' | 'neigh' | 'start' | 'fanfare' | 'tick'
  | 'roar' | 'baa' | 'cluck' | 'squeak';

export interface AudioApi {
  /** Must be called from a user gesture once (Play button). */
  unlock(): void;
  play(name: SfxName, opts?: { volume?: number; pitch?: number }): void;
  /** Continuous sounds (wind, engine): intensity 0 stops it. pitch ~0.5..2 */
  setLoop(name: 'wind' | 'engine' | 'gallop', intensity: number, pitch?: number): void;
  setMusic(on: boolean): void;
  /** Duck the music to `level` (0..1) now and ease back to full after `seconds` (e.g. while Pip talks). */
  duckMusic?(level: number, seconds: number): void;
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
  /** Saved player profile (wallet, owned items). Created right after `session`. */
  profile: ProfileApi;
  /** Shop, tickets, combo, missions. Created just before `activities`. */
  economy: EconomyApi;
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
  /**
   * Advance `n` fixed frames of `dt` seconds (works while frozen). Only the last frame is rendered,
   * and only when `render` is true (default); pass false for fast simulation-only stepping.
   */
  step(dt?: number, n?: number, render?: boolean): void;
  /** Render the current state again without advancing time. */
  render(): void;
  start(): void;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  setEye(patch: Partial<EyeSettings>): void;
  setLayerVisible(layer: VisionLayer, visible: boolean): void;
  /** Names of every object registered on a vision layer (`ctx.vision.add`), in order. */
  layerObjects(): { name: string; layer: VisionLayer }[];
  /** Hide/show every registered layer object whose name starts with `prefix`. Returns how many matched. */
  setLayerObjectsVisible(prefix: string, visible: boolean): number;
  setRemaining(seconds: number): void;
  /** Every E target added after the core systems (activities): id and current prompt position. */
  interactables(): { id: string; position: [number, number, number] }[];
  /** True while some system holds a camera override (setOverride with a non-null value). */
  cameraOverridden(): boolean;
  /** Sound loops currently on (intensity > 0): 'wind' | 'engine' | 'gallop'. */
  audioLoops(): string[];
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

// ───────────────────────────── Economy (stream C) ─────────────────────────────

/**
 * 'hand' = a held wardrobe item (shown on the back anchor until heroes get a hand anchor).
 * 'power' = the chosen super power per hero, stored as `hero:power` pairs joined by ',' (see
 * `src/core/skills-powers.ts`); not an owned item.
 */
export type EquipSlot = OutfitSlot | 'hand' | 'trail' | 'emote' | 'character' | 'power';
export type ShopCategory = 'character' | 'outfit' | 'paint' | 'trail' | 'emote';
export type WalletReason = 'gem' | 'mission' | 'jackpot' | 'shop' | 'ticket' | 'test';
export type UnlockSource = 'shop' | 'chest' | 'starter';
export type TicketKind =
  | 'balloon' | 'rocketPad'
  /** Attractions: first play of each per session free, then `ECONOMY.attractionTicket`. */
  | 'bubbleBall' | 'dinoSumo' | 'carnival' | 'foam' | 'plane' | 'dragon' | 'race' | 'scoops' | 'silly';
/** `EconomyApi.rideTicket` outcome: 'practice' = could not pay; play anyway, no prize. */
export type TicketOutcome = 'free' | 'paid' | 'practice';
export type BuyResult = 'ok' | 'owned' | 'tooPoor' | 'notForSale' | 'unknown';
export type MissionKind =
  | 'collectGems' | 'megaGems' | 'combo' | 'bounceHeight' | 'openChest' | 'driveGems' | 'landRings' | 'stars';

export interface ShopItem {
  id: string;
  category: ShopCategory;
  slot: EquipSlot;
  /** Short name, shown small. The icon and the preview are what matter. */
  name: string;
  icon: IconName;
  /** Price in gems (5..100). 0 = free starter item (owned from the start). */
  price: number;
  /** Only given by treasure chests: never sold; shown with a chest badge until owned. */
  chestOnly?: boolean;
  /** Optional CSS colour for the shop card preview (paints, trails). */
  swatch?: string;
  /** Optional picture of the item for shop cards: returns an image URL (may be a `data:` URL, may render lazily on first call), or null if there is none. */
  preview?(): string | null;
}

export interface ProfileData {
  version: 1;
  /** Gems the player can spend. Kept between sessions. */
  wallet: number;
  /** Every gem ever earned (never goes down). */
  lifetimeGems: number;
  /** Ids of owned shop items (starter items included). */
  owned: string[];
  equipped: Partial<Record<EquipSlot, string>>;
  /** Sessions started. */
  sessions: number;
  bestCombo: number;
}

/** The player's saved profile (localStorage, wrapped in try/catch). Implemented in `src/profile.ts`. */
export interface ProfileApi {
  readonly data: Readonly<ProfileData>;
  readonly wallet: number;
  /** Add gems (amount > 0). Emits `wallet:changed`. */
  earn(amount: number, reason: WalletReason): void;
  /** Take gems if the wallet has enough; returns false (and changes nothing) if not. Emits `wallet:changed`. */
  spend(amount: number, reason: WalletReason): boolean;
  owns(itemId: string): boolean;
  /** Mark an item as owned. Returns true if it was new (then emits `item:unlocked`). */
  unlock(itemId: string, source: UnlockSource): boolean;
  /** Save what is worn in a slot (null = nothing). Emits `item:equipped`. Does not check ownership. */
  equip(slot: EquipSlot, itemId: string | null): void;
  equipped(slot: EquipSlot): string | null;
  /** Record a new best combo if higher. */
  noteCombo(multiplier: number): void;
  /** Count a started session. */
  noteSession(): void;
  /** Wipe the profile (grown-up settings). Emits `profile:reset`, `wallet:changed` and `item:equipped` (null) for every slot that was set. */
  reset(): void;
}

export interface Mission {
  id: string;
  kind: MissionKind;
  icon: IconName;
  /** The number shown on the card ("10 gems", "30 m"). */
  target: number;
  /** Gem bonus paid when done. */
  reward: number;
}
export interface MissionState extends Mission {
  progress: number;
  done: boolean;
}

/** Gems as money: shop, tickets, combo and missions. Implemented in `src/activities/economy/`. */
export interface EconomyApi {
  /** Everything the shop can show (registered items, in registration order). */
  readonly catalog: readonly ShopItem[];
  item(id: string): ShopItem | undefined;
  /** Add items to the catalog (gear, and later the characters from the main build). Starter items (price 0) become owned. Ignores ids already registered. */
  registerItems(items: readonly ShopItem[]): void;
  /** Pay, unlock and equip in one go. Emits `shop:purchased` on 'ok'. */
  buy(itemId: string): BuyResult;
  /** Wear an owned item (or null to take the slot off). Returns false if not owned/unknown. */
  equip(slot: EquipSlot, itemId: string | null): boolean;
  /** What the next ride costs right now (0 = free, e.g. the first balloon ride of a session). */
  ticketPrice(kind: TicketKind): number;
  /** Call when the player starts a ride. true = go (paid or free; emits `ticket:paid`). false = not enough gems (emits `ticket:denied`; the ride must not start). */
  payTicket(kind: TicketKind): boolean;
  /**
   * Attractions: like `payTicket`, but a child who cannot pay still plays a practice round
   * ('practice': no prize; `ticket:denied` is still emitted so the HUD/Pip can say why).
   */
  rideTicket(kind: TicketKind): TicketOutcome;
  /** This session's three missions (empty on the title screen before the first session). */
  readonly missions: readonly MissionState[];
  /** Current streak. multiplier 1 = no combo. timeLeft = seconds before it drops. */
  readonly combo: Readonly<{ multiplier: number; streak: number; timeLeft: number }>;
}
