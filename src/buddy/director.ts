/**
 * Story director (no DOM, no three.js): the spoken welcome story for a new player, "welcome back"
 * for a returning one, leading the way to the first attractions, a spoken how-to at every
 * attraction (first arrival, and again on request), the economy explained at the moment it
 * matters, rescues (stuck at a fence, wandering off, standing around), one-time HUD tips, the
 * trampoline count and reactions.
 * It only decides WHAT Pip says and WHERE he leads; `index.ts` turns that into motion, voice and
 * the bubble. Unit-tested in tests/buddy/director.test.ts and tests/buddy/guide.test.ts.
 *
 * RULES
 *  - The story runs while the child can already move; it is skippable. How-tos only fire inside
 *    that attraction's radius (or when its use prompt is focused).
 *  - Pip leads only to both-eye places (attraction anchors from `places()` / `anchor()`); he never
 *    goes towards, faces or points at a weak-eye or strong-eye object. How-tos explain rules, never
 *    positions. The sink has no way to ask for a gem, key or lock position on purpose.
 *  - Restraint: reactions come from shuffle-bag pools (≥ 8 lines), only for firsts, milestones and
 *    new bests; at most one unsolicited line every UNSOLICITED_GAP seconds; no line is repeated
 *    within REPEAT_SECONDS (else Pip just barks).
 */
import type { Line } from './dialogue';
import { PRIORITY } from './dialogue';
import type { Goal } from './goals';
import type { BuddyStore } from './store';
import type { EconId, HowToTopic, KeyNames, PoolId, ScriptLine, TipId } from './script';
import {
  CHEST, CHUTE, CLOSE_MENU, COUNT, DIZZY, DIZZY_GAP, DRIVE_CUE, ECON, FOLLOW_AGAIN, GLASSES_WAIT, GLASSES_WAIT_GAP, HOP_OUT, HOWTO, INTRO, POOLS, RESCUE, RETURNING,
  STORY, STORY_GLASSES_BEAT, SUNSET, TIPS, follow, line, needGems, skillTip, suggest,
} from './script';
import { MEGA_GAP, Memory, ShuffleBag, UNSOLICITED_GAP } from './pools';
import type { V2 } from './steer';
import { GLASSES_ATTRACTIONS, type Attraction } from './types';

export type IntroStep = 'story' | 'follow' | 'jump' | 'done';

/** Minimum seconds between stuck rescues, by how many came right before at the same spot. */
export const RESCUE_GAPS = [0, 8, 12] as const;
/** After this many rescues at the same spot (two did not help), Pip hops the hero free. */
export const HOP_AFTER = 3;
/** At most this many rescues in RESCUE_WINDOW seconds (QA round 5: 14 in a row at one counter). */
export const RESCUE_CAP = 4;
export const RESCUE_WINDOW = 60;
/** At most one unsolicited hint/reaction per this many seconds. */
export const HINT_GAP = UNSOLICITED_GAP;
/** The intro can be skipped after this many seconds. */
export const SKIP_AFTER = 2;
/** A story beat that never finished (queue trouble) moves on after this many seconds. */
const BEAT_MAX = 14;
/** Pressing move without getting anywhere this long = stuck (fence, wall). */
export const STUCK_PUSH_SECONDS = 3;
/** Walking away from every attraction this long = lost. */
export const WANDER_SECONDS = 15;
/** "Away from everything" = farther than this from the nearest attraction (m). */
export const WANDER_RADIUS = 24;
export const STUCK_SECONDS = 45;
export const IDLE_SECONDS = 20;
export const CHEST_HINT_COOLDOWN = 45;
/** Generic tips stay quiet this long after a chest hint. */
const CHEST_QUIET = 8;
/** Pip leads a new player to this many attractions, then lets them choose (QA round 5: three). */
export const LEAD_ATTRACTIONS = 3;
/** Seconds at an attraction that count as "done it" even without an event. */
export const DONE_AT_SECONDS = 10;
/** Leaving the trampoline this long during the "jump" step = lead back to it. */
const JUMP_AWAY_SECONDS = 6;

// ───────────── light-touch guide (after the tour, and for returning players) ─────────────
/** Idle this long (no attraction, no ride, little movement) = Pip offers the next place (QA6 M4). */
export const INVITE_IDLE = 13;
/**
 * ONE cap policy for every call to come along or do something (QA7 m8): the story's "follow me",
 * tour leads, re-calls, invitations, rescues of a child standing about or wandering, vehicle cues.
 * Never more than one new call per INVITE_GAP seconds (a tour lead right after an attraction is
 * the child's own progress, and the parked-vehicle cues have their own short schedule).
 */
export const INVITE_GAP = 25;
/** After an ignored call, wait this long before the next (by how many were ignored in a row). */
export const INVITE_BACKOFF = [25, 45, 90] as const;
/** This many ignored in a row = Pip stops calling until the child does something (or the last minute). */
export const MAX_IGNORED = 3;
/** A child who does not come closer (and is not pushing) this long has ignored the call. */
export const INVITE_PATIENCE = 12;

// ───────────── vehicles (QA7 M2: a child parked in the buggy got no guidance for 3 minutes) ─────────────
/** In a vehicle and not moving this long: Pip's "drive!" cue (the move key). */
export const PARK_CUE = 8;
/** Still parked: a second cue (the race, or a place to drive to). */
export const PARK_CUE2 = 24;
/** Still parked: "hop out, it's this way!" (the use key), then a lead on foot. */
export const PARK_HOP = 40;
/**
 * Later parked cues (QA8 M2: after two "hop out"s Pip fell silent for 68–117 s; then a cue every
 * 36 s for ever was found repetitive): after the first round (PARK_CUE, PARK_CUE2, PARK_HOP), one
 * cue about every PARK_GAP_LATE seconds, rotating through different lines (never the same line
 * twice in a row, no line more than PARK_LINE_MAX times a session).
 */
export const PARK_GAP_LATE = 75;
export const PARK_LINE_MAX = 3;
/** Driving this long since the last suggestion: the race or a place to drive to (at the invitation rate). */
export const DRIVE_SUGGEST = 20;
/** A suggestion while driving counts as ignored when the hero has not got there in this long. */
const DRIVE_PATIENCE = 40;
/** Faster than this (m/s) in a vehicle = driving. */
const DRIVING_SPEED = 1.2;
/** Moving farther than this from where the idle stretch began = exploring (m): Pip stays quiet. */
export const IDLE_MOVE = 6;
/** An invitation waits this long after any other unsolicited line (s). */
const INVITE_BREATH = 5;
/** The "last minute" beat: once, when this many seconds are left (and more than LAST_MINUTE_MIN). */
export const LAST_MINUTE = 60;
const LAST_MINUTE_MIN = 20;
/**
 * QA8 M2: the intro never blocks. A child who wanders this long (s) during the story (moving, far from
 * every attraction and getting farther) is not listening: the story yields to normal guidance.
 */
export const STORY_WANDER = 8;
/**
 * QA8 m12: a non-pause menu (buggy workshop, wardrobe / shop) open with no input this long (s) gets one
 * gentle "close it" cue (close key + a ring round the close button), again every OVERLAY_REPEAT.
 */
export const OVERLAY_CUE = 12;
export const OVERLAY_REPEAT = 40;
/** The close button Pip rings, per menu. */
const OVERLAY_CLOSE: Record<'workshop' | 'wardrobe', string> = {
  workshop: '[data-testid="ws-card-exit"]',
  wardrobe: '[data-testid="wardrobe-close"]',
};
/** Kinds of fun (Pip prefers a kind the child has not tried yet). */
export const KIND: Record<Attraction, 'bounce' | 'sky' | 'drive' | 'game' | 'glasses' | 'shop'> = {
  trampoline: 'bounce', bouncePads: 'bounce', launchPads: 'sky', balloon: 'sky', bungee: 'sky', airstrip: 'sky', dragonRoost: 'sky',
  garage: 'drive', raceStart: 'drive', ranch: 'drive', foamCourse: 'game', sillyZone: 'game', bubbleArena: 'game', dinoRing: 'game',
  carnivalRow: 'game', iceCream: 'game', gearShack: 'shop',
  glowflies: 'glasses', oddone: 'glasses', lineup: 'glasses', toys: 'glasses', gates: 'glasses', dotsigns: 'glasses',
};
/** Metres added to a place of a kind already tried (so a new kind wins unless it is much farther). */
const KIND_TRIED_PENALTY = 45;
/** Quick things for the last minute (a ride of a few seconds, or a short glasses round). */
export const QUICK: readonly Attraction[] = ['trampoline', 'bouncePads', 'launchPads', 'bungee', ...GLASSES_ATTRACTIONS];
/** Gem pickups between two "gem" cheers. */
export const GEM_MILESTONE = 5;

/** The first attraction of the tour (free, fun, no button needed but jump). */
export const FIRST_ATTRACTION: Attraction = 'trampoline';
/** Free first plays Pip leads to next (nearest first). Shops and the glasses games are not "rides". */
export const FUN_ATTRACTIONS: readonly Attraction[] = [
  'trampoline', 'bouncePads', 'launchPads', 'balloon', 'garage', 'raceStart', 'foamCourse', 'sillyZone', 'bubbleArena', 'dinoRing',
  'carnivalRow', 'bungee', 'airstrip', 'ranch',
];

/** When each one-time HUD tip may show (seconds of play), in order. */
export const TIP_SCHEDULE: readonly { id: TipId; at: number }[] = [
  { id: 'missions', at: 25 },
  { id: 'timer', at: 45 },
  { id: 'skill', at: 70 },
  { id: 'arrows', at: 95 },
  { id: 'help', at: 120 },
  { id: 'pip', at: 150 },
];

export type RideView = 'none' | 'basket' | 'freefall' | 'canopy' | 'vehicle' | 'other';
export type ChestHint = 'findKey' | 'shape' | null;

export interface DirectorView {
  hero: V2;
  heroSpeed: number;
  /** Hero is on foot (walk mode). */
  onFoot: boolean;
  ride: RideView;
  /** Attraction the hero is standing at, if any. */
  nearAttraction: Attraction | null;
  /** The how-to topic of the use prompt the hero is at (a booth, a vault…), if any. */
  topic?: HowToTopic | null;
  /** Hint for the chest the hero stands next to (null = no chest near / nothing to say). */
  chestHint: ChestHint;
  keys: KeyNames;
  remaining: number;
  hasMissions: boolean;
  /** Pip is saying something right now. */
  busy: boolean;
  /** The move stick / keys are pushed. */
  pushing?: boolean;
  /** Radians of look input this frame (mouse, right stick, drag). */
  look?: number;
  /**
   * An attraction game is running (the hero is under an external controller: Scoops, race,
   * carnival, dino sumo…). Pip says nothing unsolicited and starts no lead or rescue; how-tos on
   * entry and reactions to results are fine.
   */
  inGame?: boolean;
  /**
   * A parachute can be opened now (a real skydive, not a trampoline bounce or a bungee fall).
   * Undefined = yes when in freefall.
   */
  chute?: boolean;
  /** The vehicle the hero sits in (ride 'vehicle'): buggy or pony. `heroSpeed` is its speed. */
  vehicle?: 'car' | 'horse' | null;
  /**
   * A non-pause menu is open over play (QA8 m12): the buggy workshop or the wardrobe / shop. Pip
   * says nothing else then; after OVERLAY_CUE s with no input, how to close it. (The pause menu and
   * the grown-up settings are never passed here: Pip does not talk over them.)
   */
  overlay?: 'workshop' | 'wardrobe' | null;
  /** Any input this frame (key, mouse, pad, touch). */
  input?: boolean;
}

export interface LeadOptions {
  /** Hero within this radius of the target = arrived (m). */
  radius?: number;
  /** Run to the hero first, then lead (rescue). */
  fetch?: boolean;
  /** Help a hero pushing against a fence: ease the camera towards the way (stuck rescue). */
  assist?: boolean;
}

export interface DirectorSink {
  say(line: Line): void;
  /**
   * Lead the hero to a both-eye place (null = back to following): Pip runs a few metres ahead,
   * looks back, waits, runs on. Targets only ever come from `anchor()` / `places()`.
   */
  lead(target: V2 | null, opts?: LeadOptions): void;
  /** Happy dance / zoomies. */
  celebrate(big: boolean): void;
  /** Little bark (count barks, nudges). */
  bark(kind: 'yip' | 'bark' | 'whine'): void;
  /**
   * Stuck for good (a fence at the island edge, a touch stick with no camera turn): a friendly
   * hop of the hero a few metres towards `toward` (always an attraction anchor).
   */
  hop?(toward: V2): void;
  /** Pip puts on his own magic glasses and sparkles for `seconds` (carries no position). */
  glasses(seconds: number): void;
  /** The hero's next goal right now. */
  goal(): Goal;
  anchor(name: Attraction): V2 | null;
  /** Attractions that exist, with positions (for leading and suggestions). */
  places(): readonly { name: Attraction; x: number; z: number }[];
}

type LeadKind = 'tour' | 'rescue' | 'invite';

/** A call Pip made and is watching: did the child come along / drive / hop out, or ignore it? */
interface Offer {
  to: Attraction | null;
  kind: 'lead' | 'drive' | 'hop' | 'suggest';
  /** Closest the hero got to `to` (m), and seconds since they last got closer. */
  best: number;
  t: number;
}

interface ChainItem {
  line: Line;
  /** Runs when the line starts. */
  start?: () => void;
  /** The how-to topic it belongs to (dropped when the hero walks away); null = story. */
  topic: HowToTopic | null;
}

export class Director {
  step: IntroStep = 'done';
  /** Seconds in the current intro step. */
  stepT = 0;
  /** Seconds since the intro started. */
  introT = 0;
  playT = 0;
  sinceProgress = 0;
  stillT = 0;
  /** Story beat now being told (−1 = none yet). */
  beat = -1;
  readonly visited = new Set<Attraction>();
  /** Attractions the hero actually did something at (leading stops after LEAD_ATTRACTIONS). */
  readonly done = new Set<Attraction>();
  /** Where Pip is leading right now (null = following). */
  leadTo: Attraction | null = null;
  leadKind: LeadKind | null = null;
  /** Number of rescues so far this session (tests). */
  rescues = 0;
  /** Number of hop-frees so far this session (tests). */
  frees = 0;
  /** Why the last lead changed target (debug: `__rgBuddy.lead().why`). */
  why: string | null = null;
  /** Places a lead gave up on this session (unreachable). */
  readonly unreachable = new Set<Attraction>();
  /** An attraction game is running (see DirectorView.inGame). */
  quiet = false;
  private rescueTimes: number[] = [];
  private lastHero: V2 | null = null;
  private realSpeed = 0;
  private pendingLead = false;
  private guiding = false;
  private lastChestHint = -99;
  private lastHint = -99;
  private lastMega = -99;
  private lastDizzy = -99;
  private sunsetSaid = false;
  private bounces = 0;
  private counted = false;
  private gems = 0;
  private bestCombo = 0;
  private bestStars = 0;
  private glassesHits = 0;
  private wasFreefall = false;
  private returning = false;
  /** Invitations offered by the light-touch guide this session (tests). */
  invitations = 0;
  /** Every call this session: leads, re-calls, invitations, vehicle cues (tests, `__rgBuddy`). */
  offers = 0;
  /** Seconds idle (no attraction game, ride or lead, little movement). */
  idleT = 0;
  private idleAt: V2 | null = null;
  /** The call being watched (null = none), when the last one was made, and the earliest next one. */
  private offer: Offer | null = null;
  private lastOfferT = -99;
  private nextInviteAt = 0;
  /** Calls ignored in a row (reset when the child does something). */
  ignoredRun = 0;
  /** The last call was ignored: the next one goes somewhere else, nearer (m), and fetches the hero. */
  private ignoredDist = Infinity;
  private afterIgnore = false;
  /** What kind of call was ignored last (driving on does not end a run of ignored drive suggestions). */
  private ignoredKind: Offer['kind'] | null = null;
  /** Vehicle: seconds parked (not moving), seconds driven since the last suggestion, cues said while parked. */
  private parkT = 0;
  private driveT = 0;
  private parkCues = 0;
  /** Later parked rounds: the earliest time for the next cue. */
  private parkNextAt = 0;
  /** Parked cues said this session, by text, and the last one (no repeats in a row). */
  private readonly parkSaid = new Map<string, number>();
  private lastParkText = '';
  private inVehicle = false;
  /** Menu open (QA8 m12): seconds with no input, and the time to the next "close it" cue. */
  private overlayNow: 'workshop' | 'wardrobe' | null = null;
  private overlayIdle = 0;
  private overlayWait = 0;
  /** Where Pip leads once the hero hops out of the vehicle (offered while in it). */
  private hopTo: Attraction | null = null;
  private lastGlassesWait = -99;
  private lastMinuteDone = false;
  /** Places invited to and ignored this session (offered again only when nothing else is left). */
  private readonly declined = new Set<Attraction>();
  /** The ride and chest state right now (lines that only make sense in it check these). */
  private rideNow: RideView = 'none';
  private chestNow: ChestHint = null;
  private awayT = 0;
  private pushT = 0;
  private wanderT = 0;
  private beatT = 0;
  private lastNearest = Infinity;
  private lastRescue = -99;
  private stuckRun = 0;
  private stuckAt: V2 | null = null;
  private at: Attraction | null = null;
  private atT = 0;
  /** The how-to topic where the hero is now (focused prompt, else the attraction). */
  private topicNow: HowToTopic | null = null;
  private chain: ChainItem[] = [];
  private fed = false;
  private readonly memory = new Memory();
  private readonly bags = new Map<PoolId | 'follow', ShuffleBag<ScriptLine>>();

  constructor(
    private readonly sink: DirectorSink,
    private readonly store: BuddyStore,
    private readonly rand: () => number = Math.random,
  ) {}

  get introActive(): boolean {
    return this.step !== 'done';
  }

  /** Pip is still showing a new player around (leading to the first attractions). */
  get isGuiding(): boolean {
    return this.guiding;
  }

  /** A new session started. `runIntro` = brand-new player (and intro allowed). */
  begin(runIntro: boolean): void {
    this.playT = 0;
    this.sinceProgress = 0;
    this.stillT = 0;
    this.sunsetSaid = false;
    this.visited.clear();
    this.done.clear();
    this.invitations = 0;
    this.offers = 0;
    this.idleT = 0;
    this.idleAt = null;
    this.offer = null;
    this.lastOfferT = -99;
    this.nextInviteAt = 0;
    this.ignoredRun = 0;
    this.ignoredDist = Infinity;
    this.afterIgnore = false;
    this.ignoredKind = null;
    this.parkT = 0;
    this.driveT = 0;
    this.parkCues = 0;
    this.parkNextAt = 0;
    this.parkSaid.clear();
    this.lastParkText = '';
    this.inVehicle = false;
    this.overlayNow = null;
    this.overlayIdle = 0;
    this.overlayWait = 0;
    this.hopTo = null;
    this.lastGlassesWait = -99;
    this.lastMinuteDone = false;
    this.declined.clear();
    this.bounces = 0;
    this.counted = false;
    this.gems = 0;
    this.bestCombo = 0;
    this.bestStars = 0;
    this.glassesHits = 0;
    this.lastHint = -99;
    this.lastChestHint = -99;
    this.lastMega = -99;
    this.pushT = 0;
    this.wanderT = 0;
    this.rescues = 0;
    this.frees = 0;
    this.why = null;
    this.unreachable.clear();
    this.quiet = false;
    this.rescueTimes = [];
    this.lastHero = null;
    this.realSpeed = 0;
    this.pendingLead = false;
    this.lastRescue = -99;
    this.stuckRun = 0;
    this.stuckAt = null;
    this.at = null;
    this.atT = 0;
    this.topicNow = null;
    this.chain = [];
    this.beat = -1;
    this.memory.clear();
    this.stopLead();
    this.returning = !runIntro;
    this.guiding = runIntro;
    if (runIntro) {
      this.introT = 0;
      this.enter('story');
    } else {
      this.step = 'done';
      this.say(line(RETURNING, PRIORITY.story, 'returning'));
      this.sayGoal(PRIORITY.tip);
    }
  }

  /** The session left 'playing' for good (title / end). */
  end(): void {
    this.step = 'done';
    this.guiding = false;
    this.chain = [];
    this.stopLead();
  }

  /** Skip the intro (any non-game key / tap on the bubble). Returns true if it skipped. */
  skip(): boolean {
    if (this.step === 'done' || this.introT < SKIP_AFTER) return false;
    this.chain = [];
    this.finishIntro();
    this.guiding = false;
    this.stopLead();
    this.offer = null;
    this.say({ ...line(INTRO.skipped, PRIORITY.story, 'intro:skipped'), interrupt: true });
    return true;
  }

  /**
   * Ask Pip (T / his button / D-pad down): the HUD element explanation chosen by the caller, else
   * the how-to of the place the hero is at, else the current goal.
   */
  ask(explain: ScriptLine | null): void {
    if (explain) {
      this.say({ ...line(explain, PRIORITY.story, 'ask'), interrupt: true });
      return;
    }
    if (this.topicNow && this.step !== 'story') {
      this.chain = this.chain.filter((c) => c.topic === null);
      this.howTo(this.topicNow, PRIORITY.story, true);
      return;
    }
    this.sayGoal(PRIORITY.story, true);
  }

  // ───────────── events ─────────────

  onGem(e: { mega?: boolean; combo?: number }): void {
    this.progress();
    this.gems++;
    const combo = e.combo ?? 1;
    if (e.mega) {
      if (this.econ('mega')) return;
      if (this.playT - this.lastMega >= MEGA_GAP && this.react('mega')) this.lastMega = this.playT;
      return;
    }
    if (this.econ('gem')) return;
    if (combo >= 3 && combo > this.bestCombo) {
      this.bestCombo = combo;
      this.react('combo');
      return;
    }
    if (!this.store.tipSeen('combo') && combo >= 2 && this.step === 'done') {
      this.tip('combo', TIPS.combo);
      return;
    }
    if (this.gems % GEM_MILESTONE === 0) this.react('gem');
  }

  onShopOpen(): void {
    this.progress();
    this.didSomething();
    this.econ('shop');
  }

  onStunt(e: { kind: string; stars: number }): void {
    this.progress();
    this.didSomething();
    if (this.step === 'jump' && e.kind === 'bigBounce') {
      this.jumpDone();
      return;
    }
    if (e.stars > 0 && this.step === 'done' && !this.store.tipSeen('stars') && !this.guiding) {
      this.tip('stars', TIPS.stars);
      return;
    }
    if (e.stars >= 2) {
      if (e.stars > this.bestStars) {
        this.bestStars = e.stars;
        this.react('stunt');
      } else if (this.rand() < 0.35) this.react('stunt');
    }
  }

  /** The hero reached the top of a bounce on the trampoline (Pip barks the count, once a session). */
  onTrampolineApex(): void {
    this.progress();
    this.sink.bark('yip');
    if (this.counted && this.step !== 'jump') return;
    this.bounces = Math.min(this.bounces + 1, COUNT.length);
    const word = COUNT[this.bounces - 1];
    if (this.step === 'done' || this.step === 'jump') {
      this.say({ text: word, icon: 'wTrampoline', priority: PRIORITY.react, mood: 'excited', hold: 0.5, ttl: 0.6, praise: true });
    }
    if (this.bounces >= COUNT.length) this.counted = true;
    if (this.bounces >= 2) this.markDone('trampoline');
    if (this.step === 'jump' && this.bounces >= 2) this.jumpDone();
  }

  /** Hero left the trampoline: the count starts again next time (until it was counted once). */
  resetBounces(): void {
    if (this.bounces >= 3) this.counted = true;
    this.bounces = 0;
  }

  onChestKey(): void {
    this.progress();
    if (!this.econ('key')) this.react('key');
  }

  onChestOpened(): void {
    this.progress();
    this.react('chest', true);
    this.sink.celebrate(true);
  }

  /** The hero got dizzy (a carnival spin): a gentle "wibble wobble", rate-limited (not a nag). */
  onDizzy(): void {
    if (this.playT - this.lastDizzy < DIZZY_GAP) return;
    this.lastDizzy = this.playT;
    this.say(line(DIZZY, PRIORITY.react, 'dizzy'));
  }

  onFlop(): void {
    if (this.rand() < 0.5) this.react('flop');
  }

  onSkill(): void {
    this.progress();
  }

  onEmote(): void {}

  onPurchased(): void {
    this.progress();
    this.react('bought', true);
    this.sink.celebrate(false);
  }

  onUnlocked(): void {}

  /** The first-minute wardrobe gift arrived (once per profile). */
  onGift(): void {
    this.econ('gift');
  }

  onTicketPaid(free = false): void {
    this.progress();
    this.didSomething();
    if (!free) this.econ('ticket');
  }

  onTicketDenied(price: number, wallet: number): void {
    this.say(line(needGems(Math.max(1, price - wallet)), PRIORITY.tip));
    this.sink.bark('whine');
  }

  /** A Fun Pass stamp (or something that earns one) happened. */
  onStamp(): void {
    this.progress();
    if (!this.econ('stamp')) this.react('stamp');
  }

  onMissionCompleted(): void {
    this.progress();
    this.react('goal', true);
    this.sink.celebrate(true);
  }

  onJackpot(): void {
    this.progress();
    this.react('jackpot', true);
    this.sink.celebrate(true);
  }

  onWalletChange(): void {
    this.progress();
  }

  /** The hero came back down after being way up (not the trampoline). */
  onLanded(): void {
    this.react('landed');
  }

  onTick(remaining: number): void {
    if (this.quiet) return;
    if (!this.sunsetSaid && remaining <= 30 && remaining > 0) {
      this.sunsetSaid = true;
      this.say(line(SUNSET, PRIORITY.tip, 'sunset'));
    }
  }

  /**
   * A glasses booth waits for the hero to come back to its start pad: "Back to the pad!" (at most
   * once per GLASSES_WAIT_GAP; the booth's own trail and prompt show the way).
   */
  onGlassesWait(): void {
    if (this.playT - this.lastGlassesWait < GLASSES_WAIT_GAP) return;
    this.lastGlassesWait = this.playT;
    this.lastHint = this.playT;
    this.say({ ...line(GLASSES_WAIT, PRIORITY.tip, 'glasses:wait'), ttl: 3 });
  }

  /** Called on every weak-eye game hit. */
  onGlassesHit(): void {
    this.progress();
    this.didSomething();
    this.glassesHits++;
    if (this.glassesHits === 1) this.react('magic', true);
    else if (this.rand() < 0.3) this.react('magic');
  }

  // ───────────── frame ─────────────

  update(dt: number, v: DirectorView): void {
    if (v.overlay) {
      this.overlayUpdate(dt, v);
      return;
    }
    if (this.overlayNow) {
      // Closed: guidance resumes where it was (nothing built up while the menu was open).
      this.overlayNow = null;
      this.idleT = 0;
      this.stillT = 0;
      this.sinceProgress = 0;
    }
    this.playT += dt;
    this.sinceProgress += dt;
    this.fed = false;
    const wasQuiet = this.quiet;
    this.quiet = !!v.inGame;
    if (this.quiet) {
      // Nothing builds up during a game (no "stuck" or "idle" line right after it).
      this.sinceProgress = 0;
      this.pushT = 0;
      this.wanderT = 0;
    } else if (wasQuiet && this.pendingLead) {
      // The game is over: now lead on to the next place.
      this.pendingLead = false;
      this.nextLead();
    }
    // How fast the hero really moves (position change): a hero walking into a fence can report
    // a walking velocity while going nowhere (QA round 5: pushing at a rail fence for 100 s).
    if (this.lastHero && dt > 0) {
      const moved = Math.hypot(v.hero.x - this.lastHero.x, v.hero.z - this.lastHero.z) / dt;
      this.realSpeed += (Math.min(moved, 20) - this.realSpeed) * Math.min(1, dt * 3);
    } else this.realSpeed = v.heroSpeed;
    this.lastHero = { x: v.hero.x, z: v.hero.z };
    this.rideNow = v.ride;
    this.chestNow = v.chestHint;
    const speed = Math.min(v.heroSpeed, this.realSpeed);
    this.stillT = v.onFoot && v.heroSpeed < 0.3 && !v.inGame ? this.stillT + dt : 0;
    this.pushT = v.onFoot && v.pushing && speed < 2.5 && v.ride === 'none' ? this.pushT + dt : 0;

    // Where the hero is: first visits, "done" after a while or any action there.
    const at = v.nearAttraction;
    if (at !== this.at) {
      this.at = at;
      this.atT = 0;
    } else if (at) this.atT += dt;
    if (at && this.atT > DONE_AT_SECONDS && (!this.leadTo || this.leadTo === at) && !v.pushing) this.markDone(at);
    if (at && v.ride !== 'none') this.markDone(at);
    const topic: HowToTopic | null = v.topic ?? at;
    if (topic !== this.topicNow) {
      // Walked away: an unfinished how-to of the old place is dropped.
      this.chain = this.chain.filter((c) => c.topic === null || c.topic === topic);
      this.topicNow = topic;
    }

    // The story yields to whatever the child started (before its next line is fed).
    this.yieldIntro(v);
    // A lead put off (a game, a ride, a vehicle, a yielded story): back on foot, it starts now.
    if (this.pendingLead && !this.quiet && v.onFoot && v.ride === 'none' && this.step === 'done' && this.guiding) {
      this.pendingLead = false;
      this.nextLead();
    }

    // Feed the next line of a story / how-to once Pip is free.
    if (this.chain.length && !v.busy) {
      const c = this.chain.shift()!;
      c.start?.();
      this.say(c.line);
      this.fed = true;
    }

    // Chests: the full how-to the first time, then a short hint now and then while there.
    if (v.chestHint && this.step === 'done') {
      if (!this.store.tipSeen('howto:chest')) {
        this.lastChestHint = this.playT;
        this.howTo('chest', PRIORITY.story);
      } else if (this.playT - this.lastChestHint > CHEST_HINT_COOLDOWN && this.fresh(CHEST[v.chestHint].text)) {
        this.lastChestHint = this.playT;
        this.lastHint = this.playT;
        this.say({ ...line(CHEST[v.chestHint], PRIORITY.story, `chest:${v.chestHint}`), ttl: 4, valid: () => this.chestNow !== null });
      }
    }
    const chestNear = !!v.chestHint || this.playT - this.lastChestHint < CHEST_QUIET;

    this.onTick(v.remaining);
    this.updateLead(dt, v);
    this.track(dt, v);
    this.watchOffer(dt, v);
    this.vehicleTrack(dt, v);
    if (this.rescueCheck(dt, v, chestNear)) return;

    if (this.step !== 'done') {
      this.introT += dt;
      this.stepT += dt;
      if (this.quiet) return;
      this.updateIntro(dt, v);
      return;
    }

    // Rides: the first freefall explains the chute, later ones cheer now and then.
    // (Only a real skydive: a big trampoline bounce or a bungee fall has no parachute. QA6 m8.)
    const ff = v.ride === 'freefall' && v.chute !== false;
    if (ff && !this.wasFreefall) {
      if (!this.store.tipSeen('chute')) {
        // Said right now (it is about this second of the fall), and never once the fall is over.
        this.store.markTip('chute');
        this.say({ ...line(CHUTE(v.keys), PRIORITY.story, 'tip:chute'), interrupt: true, ttl: 1.5, once: true, valid: () => this.rideNow === 'freefall' });
      } else if (this.rand() < 0.5) this.react('freefall');
    }
    this.wasFreefall = ff;

    if (at && !this.visited.has(at)) {
      this.visited.add(at);
      this.progress();
    }
    // First time at a place (attraction or use prompt): its spoken how-to.
    if (topic && topic !== 'chest' && !this.store.tipSeen(`howto:${topic}`) && !chestNear && !this.chain.some((c) => c.topic === topic)) {
      this.howTo(topic, PRIORITY.tip);
    }

    if (v.busy || chestNear || this.chain.length || this.quiet) return;

    if (this.vehicleGuide(v)) return;
    if (this.reoffer(v)) return;
    if (this.lightGuide(v)) return;

    // One-time HUD tips, spread over the first minutes (quiet while Pip shows the way, and while
    // an invitation is about to come: the child is standing about).
    if (!this.guiding && this.canHint() && !this.invitePending()) {
      if (this.returning && this.playT > 9 && !this.store.tipSeen('compass')) {
        this.hint('compass', TIPS.compass);
        return;
      }
      for (const t of TIP_SCHEDULE) {
        if (this.playT < t.at || this.store.tipSeen(t.id)) continue;
        if (t.id === 'missions' && !v.hasMissions) continue;
        if (t.id === 'arrows') {
          this.lastHint = this.playT;
          this.store.markTip('arrows');
          this.howTo('secrets', PRIORITY.tip);
          return;
        }
        this.hint(t.id, t.id === 'skill' ? skillTip(v.keys.skill) : TIPS[t.id as keyof typeof TIPS]);
        return;
      }
    }

    // Standing still: a playful idle line now and then.
    if (this.stillT > IDLE_SECONDS && this.canHint() && !this.invitePending()) {
      this.stillT = -10;
      const pick = this.bag('idle').next((l) => this.fresh(l.text));
      if (pick) {
        this.lastHint = this.playT;
        this.say(line(pick, PRIORITY.idle, 'idle'));
      }
    }
  }

  // ───────────── menus open over play (QA8 m12) ─────────────

  /** A menu is open: no other line; after OVERLAY_CUE s with no input, how to close it (then rarely). */
  private overlayUpdate(dt: number, v: DirectorView): void {
    const kind = v.overlay!;
    if (this.overlayNow !== kind) {
      this.overlayNow = kind;
      this.overlayIdle = 0;
      this.overlayWait = 0;
      // A menu during the story: the story yields (it is not told to a closed menu).
      if (this.step === 'story' || this.step === 'follow') this.yieldNow('menu');
      // A how-to or reaction still queued is for the world, not the menu.
      this.chain = [];
    }
    this.overlayIdle = v.input ? 0 : this.overlayIdle + dt;
    this.overlayWait = Math.max(0, this.overlayWait - dt);
    if (this.overlayIdle < OVERLAY_CUE || this.overlayWait > 0 || v.busy) return;
    this.overlayWait = OVERLAY_REPEAT;
    this.say({ ...line(CLOSE_MENU(OVERLAY_CLOSE[kind]), PRIORITY.tip, 'menu:close'), ttl: 4, valid: () => this.overlayNow === kind });
  }

  // ───────────── the intro never blocks (QA8 M2) ─────────────

  /**
   * During the story (or its "follow me to the trampoline"): a child who gets into a vehicle, starts an
   * attraction or a ride, or wanders off is busy with something else. The story yields: the clip
   * being said finishes, the rest is dropped, and normal guidance takes over (vehicle cues, the next
   * lead after the game, a call to a place near the child). True if it yielded this frame.
   */
  private yieldIntro(v: DirectorView): boolean {
    if (this.step !== 'story' && this.step !== 'follow') return false;
    const atFirst = v.nearAttraction === FIRST_ATTRACTION;
    let why: string | null = null;
    if (v.ride === 'vehicle') why = 'vehicle';
    else if (this.quiet) why = 'game';
    else if (v.ride !== 'none' && !atFirst) why = 'ride';
    else if (this.step === 'story' && this.wanderT > STORY_WANDER) why = 'wander';
    if (!why) return false;
    this.yieldNow(why);
    if (why === 'wander' && v.onFoot && !this.leadTo) this.leadNear(v);
    return true;
  }

  private yieldNow(why: string): void {
    this.chain = this.chain.filter((c) => c.topic !== null);
    this.leaveIntro();
    this.why = `intro yielded: ${why}`;
    // The story's "follow me" is not the child's to ignore any more; the tour goes on after.
    if (this.leadTo === FIRST_ATTRACTION && this.leadKind === 'tour') this.stopLead();
    if (this.offer?.kind === 'lead') this.offer = null;
    if (this.guiding) this.pendingLead = true;
  }

  /** A tour call to the fun place nearest the child (Pip runs over first). */
  private leadNear(v: DirectorView): void {
    this.pendingLead = false;
    const to = this.nearestPlace(v.hero, (p) => FUN_ATTRACTIONS.includes(p) && !this.done.has(p) && !this.unreachable.has(p));
    if (!to || !this.callTo(to, 'tour', { fetch: true })) return;
    this.lastHint = this.playT;
    this.sink.bark('bark');
    this.say({ ...line(follow(to), PRIORITY.tip, 'guide:follow'), valid: () => this.leadTo === to });
  }

  // ───────────── intro ─────────────

  private enter(step: IntroStep): void {
    this.step = step;
    this.stepT = 0;
    switch (step) {
      case 'story':
        this.beat = -1;
        this.beatT = 0;
        this.chain = STORY.map((l, i) => ({
          line: line(l, PRIORITY.story, i === 0 ? 'intro:welcome' : `story:${i}`),
          topic: null,
          start: () => {
            this.beat = i;
            this.beatT = 0;
            if (i === STORY_GLASSES_BEAT) this.sink.glasses(5);
            // The last beat says "follow me": Pip starts running ahead.
            if (i === STORY.length - 1) this.callTo(FIRST_ATTRACTION, 'tour');
          },
        }));
        // The first beat now (the session just started; nothing else is talking).
        {
          const c = this.chain.shift()!;
          c.start?.();
          this.say(c.line);
          this.fed = true;
        }
        break;
      case 'follow':
        if (this.leadTo !== FIRST_ATTRACTION && !this.declined.has(FIRST_ATTRACTION)) this.callTo(FIRST_ATTRACTION, 'tour');
        break;
      case 'jump':
        this.bounces = 0;
        this.awayT = 0;
        this.chain = this.chain.filter((c) => c.topic !== null);
        this.store.markTip('howto:trampoline');
        this.lastHint = this.playT;
        this.say(line(INTRO.jump, PRIORITY.story, 'intro:jump'));
        this.chain.push({ line: line(HOWTO.trampoline[1], PRIORITY.tip, 'howto:trampoline:1'), topic: 'trampoline' });
        break;
      case 'done':
        break;
    }
  }

  private updateIntro(dt: number, v: DirectorView): void {
    // Reaching the trampoline jumps straight to its step (the story is cut short: they are playing).
    if (v.nearAttraction === FIRST_ATTRACTION && this.step !== 'jump' && (this.step !== 'story' || this.beat >= 1)) {
      this.chain = [];
      this.finishStory();
      this.enter('jump');
      return;
    }
    switch (this.step) {
      case 'story':
        this.beatT += dt;
        if (this.chain.length === 0 && !v.busy && !this.fed) {
          this.finishStory();
          this.enter('follow');
        } else if (this.beatT > BEAT_MAX && this.chain.length && !this.fed) {
          // Safety net: never stall the story.
          const c = this.chain.shift()!;
          c.start?.();
          this.say(c.line);
        }
        break;
      case 'follow':
        // (Re-calls, if the child does not come, go through the one cap policy: watchOffer/reoffer.)
        if (!this.leadTo && !this.offer && !this.afterIgnore) this.callTo(FIRST_ATTRACTION, 'tour');
        break;
      case 'jump':
        if (v.nearAttraction === FIRST_ATTRACTION) this.awayT = 0;
        else if ((this.awayT += dt) > JUMP_AWAY_SECONDS) this.enter('follow');
        break;
      case 'done':
        break;
    }
  }

  /**
   * The child did not come to the trampoline: the story's tour step is over (no "jump" step), but
   * Pip still shows the way, to somewhere nearer (QA7 m8). Its how-to comes when they get there.
   */
  private leaveIntro(): void {
    if (this.step === 'done') return;
    this.chain = this.chain.filter((c) => c.topic !== null);
    if (this.beat < STORY.length) this.finishStory();
    this.step = 'done';
    this.store.setIntroSeen();
    this.store.markTip('compass');
  }

  /** The story told (or cut short): its HUD topics count as explained. */
  private finishStory(): void {
    this.beat = STORY.length;
    this.store.markTip('missions');
    this.store.markTip('econ:gem-intro');
  }

  private jumpDone(): void {
    this.markDone(FIRST_ATTRACTION);
    this.finishIntro();
    this.sink.celebrate(true);
    this.say(line({ ...POOLS.landed[0], praise: false }, PRIORITY.story, 'intro:yay'));
    this.nextLead();
  }

  private finishIntro(): void {
    this.step = 'done';
    this.store.setIntroSeen();
    // The tour already covered these.
    this.store.markTip('compass');
    this.store.markTip('missions');
    this.store.markTip('howto:trampoline');
    this.visited.add(FIRST_ATTRACTION);
  }

  // ───────────── leading ─────────────

  private stopLead(): void {
    this.leadTo = null;
    this.leadKind = null;
    this.sink.lead(null);
  }

  private leadToPlace(a: Attraction, kind: LeadKind, opts: LeadOptions = {}): boolean {
    const p = this.sink.anchor(a);
    if (!p) return false;
    this.leadTo = a;
    this.leadKind = kind;
    this.sink.lead(p, { radius: 2.5, ...opts });
    return true;
  }

  /** Lead to `a` as a call Pip watches (followed, or ignored → the cap policy). */
  private callTo(a: Attraction, kind: LeadKind, opts: LeadOptions = {}): boolean {
    if (!this.leadToPlace(a, kind, opts)) return false;
    this.startOffer(a, 'lead');
    return true;
  }

  // ───────────── one cap policy for every call (QA7 m8) ─────────────

  private startOffer(to: Attraction | null, kind: Offer['kind']): void {
    this.offers++;
    this.lastOfferT = this.playT;
    this.offer = { to, kind, best: Infinity, t: 0 };
  }

  /** The child did what Pip asked (or something else fun): the ignored run is over. */
  private acted(): void {
    this.offer = null;
    this.ignoredRun = 0;
    this.afterIgnore = false;
    this.ignoredKind = null;
    this.ignoredDist = Infinity;
  }

  /** May Pip make a new call now? (One per INVITE_GAP, a back-off after ignored ones, a cap.) */
  private canOffer(): boolean {
    return this.ignoredRun < MAX_IGNORED && this.playT >= this.nextInviteAt && this.playT - this.lastOfferT >= INVITE_GAP;
  }

  private distTo(a: Attraction | null, from: V2): number {
    const p = a ? this.sink.anchor(a) : null;
    return p ? Math.hypot(p.x - from.x, p.z - from.z) : Infinity;
  }

  /** The call was ignored: back to following; the next one waits longer and goes somewhere nearer. */
  private ignored(v: DirectorView): void {
    const o = this.offer;
    if (!o) return;
    this.offer = null;
    if (o.to) {
      this.declined.add(o.to);
      this.ignoredDist = this.distTo(o.to, v.hero);
    }
    this.ignoredRun++;
    this.afterIgnore = true;
    this.ignoredKind = o.kind;
    this.nextInviteAt = this.playT + INVITE_BACKOFF[Math.min(this.ignoredRun, INVITE_BACKOFF.length) - 1];
    if (o.kind === 'lead' && this.leadTo === o.to) this.stopLead();
    if (this.step === 'follow' || this.step === 'story') this.leaveIntro();
    if (this.ignoredRun >= MAX_IGNORED) this.guiding = false;
  }

  /** Followed, did something, or ignored? (Every frame.) */
  private watchOffer(dt: number, v: DirectorView): void {
    const o = this.offer;
    if (!o) return;
    const driving = v.ride === 'vehicle' && v.heroSpeed > DRIVING_SPEED;
    // On a ride, in a game or driving = doing something (an invitation lead ends there).
    if (this.quiet || (v.ride !== 'none' && v.ride !== 'vehicle') || (driving && o.kind !== 'suggest')) {
      if (o.kind === 'lead' && this.leadKind === 'invite') this.stopLead();
      this.acted();
      return;
    }
    switch (o.kind) {
      case 'lead': {
        if (this.leadTo !== o.to) {
          // The lead ended: arrived (followed), or replaced / given up (not the child's doing).
          if (o.to && v.nearAttraction === o.to) this.acted();
          else this.offer = null;
          return;
        }
        // (In a vehicle the vehicle cues take over; while the story is told the child listens.)
        if (v.ride === 'vehicle' || this.step === 'story') return;
        const d = this.distTo(o.to, v.hero);
        if (d < o.best - 2) {
          o.best = d;
          o.t = 0;
        } else if (!v.pushing || d > o.best + 15) o.t += dt;
        if (o.t > INVITE_PATIENCE) this.ignored(v);
        return;
      }
      case 'drive':
      case 'hop':
        // Hopped out: the lead on foot starts (vehicleTrack); not ignored.
        if (v.ride !== 'vehicle') {
          this.offer = null;
          return;
        }
        if ((o.t += dt) > INVITE_PATIENCE) this.ignored(v);
        return;
      case 'suggest':
        if (o.to && v.nearAttraction === o.to) {
          this.acted();
          return;
        }
        if ((o.t += dt) > DRIVE_PATIENCE) this.ignored(v);
        return;
    }
  }

  /**
   * After an ignored call (Pip still showing a new player around): the next call, when the cap
   * policy allows it, to a different place nearer to the child; Pip runs over first.
   */
  private reoffer(v: DirectorView): boolean {
    if (!this.guiding || this.leadTo || this.offer || !this.afterIgnore || !v.onFoot || v.ride !== 'none') return false;
    if (!this.canOffer() || this.playT - this.lastHint < INVITE_BREATH) return false;
    const to = this.pickInvite(v.hero, false);
    if (!to) {
      this.guiding = false;
      return false;
    }
    this.callTo(to, 'tour', { fetch: true });
    this.sink.bark('bark');
    this.lastHint = this.playT;
    const pick = this.bag('follow').next((l) => this.fresh(l.text));
    this.say({ ...line({ ...follow(to), ...(pick ? { text: pick.text } : {}) }, PRIORITY.tip, 'guide:invite'), valid: () => this.leadTo === to });
    return true;
  }

  private markDone(a: Attraction): void {
    if (this.done.has(a)) return;
    this.done.add(a);
    if (!this.guiding || this.step !== 'done') return;
    if (this.done.size >= LEAD_ATTRACTIONS || this.leadTo === a || !this.leadTo || this.leadKind !== 'tour') this.nextLead();
  }

  /** The hero did something where they stand (ticket, stunt, shop): that place is "done". */
  private didSomething(): void {
    this.ignoredRun = 0;
    if (this.at) this.markDone(this.at);
  }

  /** After an attraction: lead to the next fun one, or let the child choose. */
  private nextLead(): void {
    if (!this.guiding) return;
    if (this.quiet || this.rideNow === 'vehicle') {
      // Never start a lead (or say "follow me") in the middle of a game: after it. In a vehicle
      // Pip cannot run ahead: the parked cues offer the way, the lead starts on foot.
      this.pendingLead = true;
      return;
    }
    if (this.done.size >= LEAD_ATTRACTIONS) {
      this.guiding = false;
      this.stopLead();
      this.store.markTip('compass');
      this.lastHint = this.playT;
      this.say(line(INTRO.choose, PRIORITY.tip, 'guide:choose'));
      return;
    }
    const from = this.sink.anchor(this.at ?? FIRST_ATTRACTION);
    const next = from ? this.nearestPlace(from, (p) => FUN_ATTRACTIONS.includes(p) && !this.done.has(p) && !this.unreachable.has(p)) : null;
    if (!next) {
      this.guiding = false;
      this.stopLead();
      return;
    }
    this.callTo(next, 'tour');
    this.lastHint = this.playT;
    this.say({ ...line(follow(next), PRIORITY.tip, 'guide:follow'), valid: () => this.leadTo !== null });
  }

  /**
   * The lead could not get there (Pip made no progress for ~10 s: a wall, a fence, water). Never
   * stand still: a tour goes on to the next-nearest fun place; any other lead just ends.
   */
  leadFailed(why: string): void {
    const to = this.leadTo;
    this.why = `${to ?? '?'}: ${why}`;
    if (!to) return;
    if (to === FIRST_ATTRACTION && this.step !== 'done') {
      // The first stop of the story: try again from where everyone is now.
      this.leadToPlace(to, 'tour');
      return;
    }
    this.unreachable.add(to);
    const kind = this.leadKind;
    this.stopLead();
    // A call that cannot get there is not the child's doing (not counted as ignored).
    const o = this.offer;
    if (o?.to === to) this.offer = null;
    // An invitation that cannot get there: offer another place soon.
    if (kind === 'invite') this.nextInviteAt = Math.min(this.nextInviteAt, this.playT + 3);
    if (kind === 'tour' && this.guiding) {
      const next = this.nearestPlace(this.sink.anchor(to) ?? { x: 0, z: 0 }, (p) => FUN_ATTRACTIONS.includes(p) && !this.done.has(p) && !this.unreachable.has(p));
      if (next && this.leadToPlace(next, 'tour')) {
        // The same call goes on to the next place (not a new one).
        this.offer = o ? { ...o, to: next, best: Infinity, t: 0 } : null;
      } else this.guiding = false;
    }
  }

  private updateLead(dt: number, v: DirectorView): void {
    if (this.leadTo && v.nearAttraction === this.leadTo) {
      // Arrived: the place's how-to takes over; Pip goes back to following.
      const kind = this.leadKind;
      this.leadTo = null;
      this.leadKind = null;
      this.sink.lead(null);
      if (kind === 'rescue' && this.guiding && this.step === 'done') this.lastHint = this.playT;
      if (kind === 'invite') this.ignoredRun = 0;
    }
    void dt;
  }

  // ───────────── light-touch guide ─────────────

  /** Test hook (`__rgBuddy.invite`): an invitation lead to `a` now, as the light guide makes one. */
  testInvite(a: Attraction): boolean {
    this.guiding = false;
    this.step = 'done';
    return this.callTo(a, 'invite');
  }

  /**
   * Idle time (no attraction game, no ride, no lead, little movement) and whether a child shown
   * the way by an invitation follows it: closer and closer = following; standing about (not
   * pushing) for INVITE_PATIENCE = ignored (back-off). Starting something else ends the invitation.
   */
  private track(dt: number, v: DirectorView): void {
    const driving = v.ride === 'vehicle' && v.heroSpeed > DRIVING_SPEED;
    // Doing something (a game, a ride, driving) ends an ignored run; sitting parked does not.
    if (this.quiet || (v.ride !== 'none' && v.ride !== 'vehicle') || (driving && this.ignoredKind !== 'suggest')) {
      if (this.ignoredRun || this.afterIgnore) this.acted();
    }
    const active = this.quiet || v.ride !== 'none' || !v.onFoot;
    if (active || this.leadTo) {
      this.idleT = 0;
      this.idleAt = { x: v.hero.x, z: v.hero.z };
    } else if (!this.idleAt || Math.hypot(v.hero.x - this.idleAt.x, v.hero.z - this.idleAt.z) > IDLE_MOVE) {
      this.idleAt = { x: v.hero.x, z: v.hero.z };
      this.idleT = 0;
    } else if (!this.chain.length) this.idleT += dt; // (listening to a how-to is not idling)
  }

  // ───────────── vehicles (QA7 M2) ─────────────

  /** Parked / driving time; hopping out starts the lead that was offered (or the tour's next one). */
  private vehicleTrack(dt: number, v: DirectorView): void {
    if (v.ride !== 'vehicle') {
      if (this.inVehicle) {
        this.inVehicle = false;
        this.parkT = 0;
        this.driveT = 0;
        this.parkCues = 0;
        const to = this.hopTo;
        this.hopTo = null;
        if (v.onFoot && !this.quiet) {
          if (this.pendingLead && this.guiding) {
            this.pendingLead = false;
            this.nextLead();
          } else if (to && !this.leadTo && this.callTo(to, 'invite')) {
            this.invitations++;
            this.lastHint = this.playT;
            this.sink.bark('bark');
            this.say({ ...line(follow(to), PRIORITY.tip, 'invite'), valid: () => this.leadTo === to });
          }
        }
      }
      return;
    }
    this.inVehicle = true;
    if (this.quiet) return;
    if (v.heroSpeed > DRIVING_SPEED) {
      this.parkT = 0;
      this.parkCues = 0;
      this.parkNextAt = 0;
      this.driveT += dt;
    } else this.parkT += dt;
  }

  /**
   * In a vehicle: parked, "Zoom!" with the move key (PARK_CUE), then the race or a place to drive
   * to (PARK_CUE2), then "hop out, it's this way!" (PARK_HOP) and a lead on foot; while driving,
   * now and then the race or a place to drive to. Every cue counts in the one cap policy.
   */
  private vehicleGuide(v: DirectorView): boolean {
    if (v.ride !== 'vehicle' || this.playT - this.lastHint < INVITE_BREATH) return false;
    const kind = v.vehicle ?? 'car';
    if (this.parkT > 0) {
      // First round on a fixed schedule (PARK_CUE, PARK_CUE2, PARK_HOP); later, one cue about every
      // PARK_GAP_LATE, rotating lines (QA8 M2: a light cycle while parked, never a nag).
      const first = this.parkCues < 3;
      const due = first
        ? this.parkT >= [PARK_CUE, PARK_CUE2, PARK_HOP][this.parkCues] && (this.parkCues < 2 || !this.offer)
        : !this.offer && this.playT >= this.parkNextAt;
      if (!due) return false;
      // The three kinds in turn (drive, a place, hop out); a kind whose line was said too often, or
      // just now, gives way to the next (hop out also has the "follow me" lines).
      const hopTo = (): Attraction | null => (this.hopTo && !this.declined.has(this.hopTo) ? this.hopTo : null) ?? this.nextPlace(v);
      const ok = (text: string): boolean => text !== this.lastParkText && (this.parkSaid.get(text) ?? 0) < PARK_LINE_MAX;
      let said = false;
      for (let k = 0; k < 4 && !said; k++) {
        const step = (this.parkCues + k) % 3;
        if (step === 0) {
          const l = DRIVE_CUE(kind);
          if (!ok(l.text)) continue;
          this.parkCue(null, 'drive', { ...line(l, PRIORITY.tip, 'vehicle:drive'), valid: () => this.parkT > 0 });
        } else if (step === 1) {
          const to = this.driveTarget(v, kind);
          if (!to || !ok(suggest(to).text)) continue;
          this.hopTo = to;
          this.parkCue(to, 'drive', { ...line({ ...suggest(to), action: 'move' }, PRIORITY.tip, 'vehicle:suggest'), valid: () => this.parkT > 0 });
        } else {
          const to = hopTo();
          if (!to) continue;
          const pick = ok(HOP_OUT(to).text) ? HOP_OUT(to) : (() => {
            const f = this.bag('follow').next((l) => ok(l.text));
            return f ? { ...HOP_OUT(to), text: f.text } : null;
          })();
          if (!pick) continue;
          this.hopTo = to;
          this.parkCue(to, 'hop', { ...line(pick, PRIORITY.tip, 'vehicle:hop'), valid: () => this.parkT > 0 });
        }
        this.parkCues += k + 1;
        said = true;
      }
      if (!said) {
        // Everything said often enough: stay quiet for a long while.
        this.parkNextAt = this.playT + PARK_GAP_LATE;
        return false;
      }
      // After the first round: about every PARK_GAP_LATE.
      this.parkNextAt = this.playT + PARK_GAP_LATE;
      return true;
    }
    if (this.ignoredRun >= MAX_IGNORED) return false;
    if (this.driveT >= DRIVE_SUGGEST && !this.offer && this.canOffer()) {
      const to = this.driveTarget(v, kind);
      this.driveT = 0;
      if (!to) return false;
      this.hopTo = to;
      this.cue(to, 'suggest', line(suggest(to), PRIORITY.tip, 'vehicle:suggest'));
      return true;
    }
    return false;
  }

  /** A parked cue (counted for the no-repeat rule). */
  private parkCue(to: Attraction | null, kind: Offer['kind'], l: Line): void {
    this.parkSaid.set(l.text, (this.parkSaid.get(l.text) ?? 0) + 1);
    this.lastParkText = l.text;
    this.cue(to, kind, l);
  }

  private cue(to: Attraction | null, kind: Offer['kind'], l: Line): void {
    this.startOffer(to, kind);
    this.lastHint = this.playT;
    this.sink.bark('yip');
    this.say(l);
  }

  /** Where to drive: the race (in the buggy, not done yet), else the next place to offer. */
  private driveTarget(v: DirectorView, kind: 'car' | 'horse'): Attraction | null {
    const race = kind === 'car' && !this.done.has('raceStart') && !this.declined.has('raceStart') && !this.unreachable.has('raceStart');
    if (race && this.sink.places().some((p) => p.name === 'raceStart')) return 'raceStart';
    return this.nextPlace(v);
  }

  /** The tour's next fun place while guiding, else the next place to offer. */
  private nextPlace(v: DirectorView): Attraction | null {
    if (this.guiding) {
      const t = this.nearestPlace(v.hero, (p) => FUN_ATTRACTIONS.includes(p) && !this.done.has(p) && !this.declined.has(p) && !this.unreachable.has(p) && p !== this.at);
      if (t) return t;
    }
    return this.pickInvite(v.hero, false);
  }

  /** The child has been standing about and an invitation is coming soon (tips wait). */
  private invitePending(): boolean {
    return !this.guiding && this.step === 'done' && this.ignoredRun < MAX_IGNORED && this.idleT > INVITE_IDLE - 6;
  }

  /**
   * After the tour: a child who stands about gets the next place offered (nearest first, a kind not
   * tried yet first) and Pip leads if they follow. A busy explorer hears nothing. One last-minute
   * beat leads to something quick. Only ever to attraction anchors (both-eye places).
   */
  private lightGuide(v: DirectorView): boolean {
    if (this.guiding || this.step !== 'done' || this.leadTo || this.offer || !v.onFoot || v.ride !== 'none') return false;
    if (this.playT - this.lastOfferT < INVITE_GAP || this.playT - this.lastHint < INVITE_BREATH) return false;
    if (!this.lastMinuteDone && v.remaining <= LAST_MINUTE && v.remaining > LAST_MINUTE_MIN) {
      this.lastMinuteDone = true;
      return this.invite(v, true);
    }
    if (this.idleT < INVITE_IDLE || this.ignoredRun >= MAX_IGNORED || this.playT < this.nextInviteAt) return false;
    return this.invite(v, false);
  }

  private invite(v: DirectorView, last: boolean): boolean {
    const to = this.pickInvite(v.hero, last);
    if (!to) return false;
    this.invitations++;
    this.lastHint = this.playT;
    this.callTo(to, 'invite');
    this.sink.bark('bark');
    const still = (): boolean => this.leadTo === to;
    if (last) {
      // "Hurry! Sunset is coming!" now stands for the last minute (no second sunset line).
      this.sunsetSaid = true;
      this.say({ ...line(SUNSET, PRIORITY.tip, 'invite:last'), valid: still });
      this.chain.push({ line: { ...line(suggest(to), PRIORITY.tip, 'invite:last:to'), valid: still }, topic: null });
      return true;
    }
    const pick = this.fresh(suggest(to).text) ? suggest(to) : this.bag('follow').next((l) => this.fresh(l.text));
    if (pick) this.say({ ...line({ ...suggest(to), text: pick.text }, PRIORITY.tip, 'invite'), valid: still });
    return true;
  }

  /**
   * The next place to offer: nearest, a kind not tried yet first; never one done or just ignored.
   * Right after an ignored call: simply the nearest other place, nearer than the ignored one if
   * there is one (QA7 m8: eleven calls, all to the far trampoline).
   */
  private pickInvite(from: V2, last: boolean): Attraction | null {
    const tried = new Set([...this.done].map((a) => KIND[a]));
    const near = this.afterIgnore && !last;
    const ok = (a: Attraction, strict: boolean): boolean =>
      a !== 'gearShack' && a !== this.at && !this.unreachable.has(a) && (!strict || (!this.done.has(a) && !this.declined.has(a))) && (!last || QUICK.includes(a)) &&
      (!near || !this.declined.has(a));
    if (near) {
      // Nearer than the ignored place first, else the nearest one left.
      for (const nearer of [true, false]) {
        const a = this.nearestPlace(from, (p) => ok(p, true) && (!nearer || this.distTo(p, from) < this.ignoredDist));
        if (a) return a;
      }
    }
    for (const strict of [true, false]) {
      let best: Attraction | null = null;
      let bestS = Infinity;
      for (const p of this.sink.places()) {
        if (!ok(p.name, strict)) continue;
        const s = Math.hypot(p.x - from.x, p.z - from.z) + (tried.has(KIND[p.name]) ? KIND_TRIED_PENALTY : 0);
        if (s < bestS) {
          bestS = s;
          best = p.name;
        }
      }
      if (best) return best;
      if (!last && !near) this.declined.clear();
    }
    return null;
  }

  /** Stuck against something, wandering off, or standing around while new: Pip runs over and leads. */
  private rescueCheck(dt: number, v: DirectorView, chestNear: boolean): boolean {
    if (!v.onFoot || v.ride !== 'none' || chestNear) {
      this.wanderT = 0;
      return false;
    }
    let why: 'stuck' | 'wander' | 'idle' | null = null;
    if (this.pushT > STUCK_PUSH_SECONDS && (!v.nearAttraction || (this.leadTo && v.nearAttraction !== this.leadTo))) why = 'stuck';
    // Wandering: moving, far from everything and getting farther (only while Pip shows the way).
    const nearest = this.nearestDist(v.hero);
    if (v.heroSpeed > 1 && nearest > WANDER_RADIUS && nearest >= this.lastNearest - 0.05) this.wanderT += dt;
    else this.wanderT = Math.max(0, this.wanderT - dt * 2);
    this.lastNearest = nearest;
    // During the story only a hero stuck at a fence gets help (Pip keeps telling it meanwhile).
    // Wandering off is a call like any other (the cap policy); a child standing about is handled
    // by the call watch (ignored -> a nearer place, at most MAX_IGNORED times).
    if (!why && this.guiding && this.step !== 'story' && this.wanderT > WANDER_SECONDS) {
      if (this.canOffer()) why = 'wander';
      else this.wanderT = 0;
    }
    if (!why) return false;
    // Cap: never a long run of rescues (the hop-free below should have helped by then).
    this.rescueTimes = this.rescueTimes.filter((t) => this.playT - t < RESCUE_WINDOW);
    if (this.rescueTimes.length >= RESCUE_CAP) {
      this.pushT = 0;
      this.wanderT = 0;
      return false;
    }
    this.pushT = 0;
    this.wanderT = 0;
    if (why === 'stuck') {
      // Stuck again near the last stuck spot = the last rescue did not help.
      const same = !!this.stuckAt && Math.hypot(v.hero.x - this.stuckAt.x, v.hero.z - this.stuckAt.z) < 6;
      this.stuckRun = same ? this.stuckRun + 1 : 1;
      this.stuckAt = { ...v.hero };
      if (this.playT - this.lastRescue < RESCUE_GAPS[Math.min(this.stuckRun - 1, RESCUE_GAPS.length - 1)]) return false;
    } else this.stuckRun = 0;
    this.rescue(v, why === 'stuck');
    return true;
  }

  private rescue(v: DirectorView, assist: boolean): void {
    this.rescues++;
    this.rescueTimes.push(this.playT);
    this.lastRescue = this.playT;
    // Lead to the tour's target if there is one, else the nearest fun place not done yet.
    let to: Attraction | null = this.leadTo && (this.leadKind === 'tour' || this.leadKind === 'invite') ? this.leadTo : null;
    if (!to && this.step !== 'done') to = FIRST_ATTRACTION;
    if (!to) to = this.nearestPlace(v.hero, (p) => FUN_ATTRACTIONS.includes(p) && !this.done.has(p) && p !== v.nearAttraction);
    if (!to) return;
    const kind: LeadKind = this.leadKind === 'tour' || this.step !== 'done' ? 'tour' : this.leadKind === 'invite' && to === this.leadTo ? 'invite' : 'rescue';
    const same = this.offer?.kind === 'lead' && this.offer.to === to;
    this.leadToPlace(to, kind, { fetch: true, assist });
    // A stuck child is trying (no gap needed); either way the lead is a call Pip watches.
    if (!same) this.startOffer(to, 'lead');
    this.sink.bark('bark');
    if (assist && this.stuckRun >= HOP_AFTER) {
      // Two rescues did not get the hero free: a friendly hop towards the way out.
      const p = this.sink.anchor(to);
      if (p && this.sink.hop) {
        this.sink.hop(p);
        this.frees++;
        this.stuckRun = 0;
        this.stuckAt = null;
      }
    }
    if (this.step !== 'story' && this.canHint()) {
      const pick = this.fresh(RESCUE.text) ? RESCUE : this.bag('follow').next((l) => this.fresh(l.text));
      if (pick) {
        this.lastHint = this.playT;
        this.say(line({ ...RESCUE, text: pick.text }, PRIORITY.tip, 'rescue'));
      }
    }
  }

  private nearestPlace(from: V2, ok: (a: Attraction) => boolean): Attraction | null {
    let best: Attraction | null = null;
    let bestD = Infinity;
    for (const p of this.sink.places()) {
      if (!ok(p.name)) continue;
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d < bestD) {
        bestD = d;
        best = p.name;
      }
    }
    return best;
  }

  private nearestDist(from: V2): number {
    let bestD = Infinity;
    for (const p of this.sink.places()) bestD = Math.min(bestD, Math.hypot(p.x - from.x, p.z - from.z));
    return bestD;
  }

  // ───────────── helpers ─────────────

  /** Every line goes through here (remembered for the no-repeat rule). */
  private say(l: Line): void {
    this.memory.note(l.text, this.playT);
    this.sink.say(l);
  }

  private fresh(text: string): boolean {
    return this.memory.fresh(text, this.playT);
  }

  private bag(id: PoolId | 'follow'): ShuffleBag<ScriptLine> {
    let b = this.bags.get(id);
    if (!b) {
      const items: readonly ScriptLine[] = id === 'follow' ? FOLLOW_AGAIN.map((text) => ({ text, icon: 'paw' as const })) : POOLS[id];
      b = new ShuffleBag(items, this.rand);
      this.bags.set(id, b);
    }
    return b;
  }

  private canHint(): boolean {
    return this.playT - this.lastHint >= HINT_GAP;
  }

  /** A one-time tip (saved) that counts against the hint gap. */
  private hint(id: TipId, l: ScriptLine): void {
    this.lastHint = this.playT;
    this.tip(id, l);
  }

  private tip(id: TipId, l: ScriptLine): void {
    this.store.markTip(id);
    this.say({ ...line(l, PRIORITY.tip, `tip:${id}`), once: true });
  }

  /** Queue a place's how-to (1–3 lines, said one after the other). */
  private howTo(topic: HowToTopic, priority: Line['priority'], asked = false): void {
    this.store.markTip(`howto:${topic}`);
    const lines = HOWTO[topic];
    const here = (): boolean => asked || this.topicNow === topic;
    const items: ChainItem[] = lines.map((l, i) => ({ line: { ...line(l, i === 0 ? priority : PRIORITY.tip, `howto:${topic}:${i}`), valid: here }, topic }));
    if (asked) {
      // The child asked: say it now.
      const first = items.shift()!;
      this.say({ ...first.line, interrupt: true });
    }
    this.chain.push(...items);
  }

  /** Explain an economy thing the first time it matters (once ever). True if it spoke. */
  private econ(id: EconId): boolean {
    const key: TipId = `econ:${id}`;
    if (this.store.tipSeen(key)) return false;
    this.store.markTip(key);
    this.lastHint = this.playT;
    this.say({ ...line(ECON[id], PRIORITY.tip, key), once: true });
    return true;
  }

  /**
   * A reaction from a pool: only after the intro, only once per UNSOLICITED_GAP (unless forced:
   * big moments), never while a story or how-to is being told, never a line said in the last
   * REPEAT_SECONDS. Returns true if Pip said something.
   */
  private react(pool: PoolId, force = false): boolean {
    if (this.step !== 'done' || this.chain.length) return false;
    if (!force && !this.canHint()) return false;
    const pick = this.bag(pool).next((l) => this.fresh(l.text));
    if (!pick) return false;
    this.lastHint = this.playT;
    this.say(line(pick, PRIORITY.react));
    return true;
  }

  private progress(): void {
    this.sinceProgress = 0;
  }

  private sayGoal(priority: Line['priority'], interrupt = false): void {
    const g = this.sink.goal();
    this.say({ ...line(g.line, priority, `goal:${g.id}`), interrupt });
  }
}
