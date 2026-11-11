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
  CHEST, CHUTE, COUNT, ECON, FOLLOW_AGAIN, HOWTO, INTRO, POOLS, RESCUE, RETURNING, STORY, STORY_GLASSES_BEAT, SUNSET, TIPS,
  follow, line, needGems, skillTip, suggest,
} from './script';
import { MEGA_GAP, Memory, ShuffleBag, UNSOLICITED_GAP } from './pools';
import type { V2 } from './steer';
import { GLASSES_ATTRACTIONS, type Attraction, type GlassesAttraction } from './types';

const isGlasses = (a: Attraction): a is GlassesAttraction => (GLASSES_ATTRACTIONS as readonly string[]).includes(a);

export type IntroStep = 'story' | 'follow' | 'jump' | 'done';

/** Seconds between re-prompts of the same step. */
export const REPROMPT = 15;
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
/** Pip leads a new player to this many attractions, then lets them choose. */
export const LEAD_ATTRACTIONS = 2;
/** Seconds at an attraction that count as "done it" even without an event. */
export const DONE_AT_SECONDS = 10;
/** Leaving the trampoline this long during the "jump" step = lead back to it. */
const JUMP_AWAY_SECONDS = 6;
/** Seconds of play when Pip first (and again) points at the nearest magic-glasses game nobody tried. */
export const GLASSES_NUDGE_AT = [60, 150] as const;
/** How long Pip waits at the game to show where it is. */
const GLASSES_LEAD_SECONDS = 9;
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
  /** Pip puts on his own magic glasses and sparkles for `seconds` (carries no position). */
  glasses(seconds: number): void;
  /** The hero's next goal right now. */
  goal(): Goal;
  anchor(name: Attraction): V2 | null;
  /** Attractions that exist, with positions (for leading and suggestions). */
  places(): readonly { name: Attraction; x: number; z: number }[];
}

type LeadKind = 'tour' | 'rescue' | 'glasses';

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
  private guiding = false;
  private lastChestHint = -99;
  private lastHint = -99;
  private lastPrompt = -99;
  private lastMega = -99;
  private sunsetSaid = false;
  private bounces = 0;
  private counted = false;
  private gems = 0;
  private bestCombo = 0;
  private bestStars = 0;
  private glassesHits = 0;
  private wasFreefall = false;
  private returning = false;
  private glassesNudges = 0;
  private glassesLeadT = 0;
  private awayT = 0;
  private pushT = 0;
  private wanderT = 0;
  private beatT = 0;
  private lastNearest = Infinity;
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
    this.glassesNudges = 0;
    this.glassesLeadT = 0;
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
    this.say(line(INTRO.skipped, PRIORITY.story, 'intro:skipped'));
    return true;
  }

  /**
   * Ask Pip (T / his button / D-pad down): the HUD element explanation chosen by the caller, else
   * the how-to of the place the hero is at, else the current goal.
   */
  ask(explain: ScriptLine | null): void {
    if (explain) {
      this.say(line(explain, PRIORITY.story, 'ask'));
      return;
    }
    if (this.topicNow && this.step !== 'story') {
      this.chain = this.chain.filter((c) => c.topic === null);
      this.howTo(this.topicNow, PRIORITY.story, true);
      return;
    }
    this.sayGoal(PRIORITY.story);
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
    if (!this.sunsetSaid && remaining <= 30 && remaining > 0) {
      this.sunsetSaid = true;
      this.say(line(SUNSET, PRIORITY.tip, 'sunset'));
    }
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
    this.playT += dt;
    this.sinceProgress += dt;
    this.fed = false;
    this.stillT = v.onFoot && v.heroSpeed < 0.3 ? this.stillT + dt : 0;
    this.pushT = v.onFoot && v.pushing && v.heroSpeed < 2.5 && v.ride === 'none' ? this.pushT + dt : 0;

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
        this.say(line(CHEST[v.chestHint], PRIORITY.story, `chest:${v.chestHint}`));
      }
    }
    const chestNear = !!v.chestHint || this.playT - this.lastChestHint < CHEST_QUIET;

    this.onTick(v.remaining);
    this.updateLead(dt, v);
    if (this.rescueCheck(dt, v, chestNear)) return;

    if (this.step !== 'done') {
      this.introT += dt;
      this.stepT += dt;
      this.updateIntro(dt, v);
      return;
    }

    // Rides: the first freefall explains the chute, later ones cheer now and then.
    const ff = v.ride === 'freefall';
    if (ff && !this.wasFreefall) {
      if (!this.store.tipSeen('chute')) this.tip('chute', CHUTE(v.keys));
      else if (this.rand() < 0.5) this.react('freefall');
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

    if (v.busy || chestNear || this.chain.length) return;

    // One-time HUD tips, spread over the first minutes (quiet while Pip shows the way).
    if (!this.guiding && this.canHint()) {
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

    // Early nudge: lead to the nearest magic-glasses game not tried yet (the site, never an object).
    const nudge = GLASSES_NUDGE_AT[this.glassesNudges];
    if (!this.guiding && nudge !== undefined && this.playT > nudge && !this.triedGlasses() && this.canHint() && !this.leadTo) {
      this.glassesNudges++;
      this.nudgeGlasses(v.hero);
      return;
    }

    // Nothing happened for a while → suggest the nearest attraction not tried yet.
    if (this.sinceProgress > STUCK_SECONDS && this.canHint()) {
      this.sinceProgress = 0;
      const best = this.nearestPlace(v.hero, (p) => !this.visited.has(p));
      if (best && this.fresh(suggest(best).text)) {
        this.lastHint = this.playT;
        this.say(line(suggest(best), PRIORITY.tip, 'stuck'));
        this.sink.bark('bark');
      }
      return;
    }

    // Standing still: a playful idle line now and then.
    if (this.stillT > IDLE_SECONDS && this.canHint()) {
      this.stillT = -10;
      const pick = this.bag('idle').next((l) => this.fresh(l.text));
      if (pick) {
        this.lastHint = this.playT;
        this.say(line(pick, PRIORITY.idle, 'idle'));
      }
    }
  }

  // ───────────── intro ─────────────

  private enter(step: IntroStep): void {
    this.step = step;
    this.stepT = 0;
    this.lastPrompt = this.playT;
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
            if (i === STORY.length - 1) this.leadToPlace(FIRST_ATTRACTION, 'tour');
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
        if (this.leadTo !== FIRST_ATTRACTION) this.leadToPlace(FIRST_ATTRACTION, 'tour');
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
        if (!this.leadTo) this.leadToPlace(FIRST_ATTRACTION, 'tour');
        this.reprompt();
        break;
      case 'jump':
        if (v.nearAttraction === FIRST_ATTRACTION) this.awayT = 0;
        else if ((this.awayT += dt) > JUMP_AWAY_SECONDS) this.enter('follow');
        break;
      case 'done':
        break;
    }
  }

  /** "Follow me" again with a different line (or just a bark once they are used up). */
  private reprompt(): void {
    if (this.playT - this.lastPrompt < REPROMPT || !this.canHint()) return;
    this.lastPrompt = this.playT;
    this.lastHint = this.playT;
    this.sink.bark('bark');
    const text = this.bag('follow').next((l) => this.fresh(l.text));
    if (text) this.say(line({ ...follow(FIRST_ATTRACTION), text: text.text }, PRIORITY.story, 'intro:follow'));
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
    this.glassesLeadT = 0;
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

  private markDone(a: Attraction): void {
    if (this.done.has(a)) return;
    this.done.add(a);
    if (!this.guiding || this.step !== 'done') return;
    if (this.done.size >= LEAD_ATTRACTIONS || this.leadTo === a || !this.leadTo || this.leadKind !== 'tour') this.nextLead();
  }

  /** The hero did something where they stand (ticket, stunt, shop): that place is "done". */
  private didSomething(): void {
    if (this.at) this.markDone(this.at);
  }

  /** After an attraction: lead to the next fun one, or let the child choose. */
  private nextLead(): void {
    if (!this.guiding) return;
    if (this.done.size >= LEAD_ATTRACTIONS) {
      this.guiding = false;
      this.stopLead();
      this.store.markTip('compass');
      this.lastHint = this.playT;
      this.say(line(INTRO.choose, PRIORITY.tip, 'guide:choose'));
      return;
    }
    const from = this.sink.anchor(this.at ?? FIRST_ATTRACTION);
    const next = from ? this.nearestPlace(from, (p) => FUN_ATTRACTIONS.includes(p) && !this.done.has(p)) : null;
    if (!next) {
      this.guiding = false;
      this.stopLead();
      return;
    }
    this.leadToPlace(next, 'tour');
    this.lastHint = this.playT;
    this.say(line(follow(next), PRIORITY.tip, 'guide:follow'));
  }

  private updateLead(dt: number, v: DirectorView): void {
    if (this.leadTo && v.nearAttraction === this.leadTo) {
      // Arrived: the place's how-to takes over; Pip goes back to following.
      const kind = this.leadKind;
      this.leadTo = null;
      this.leadKind = null;
      this.glassesLeadT = 0;
      this.sink.lead(null);
      if (kind === 'rescue' && this.guiding && this.step === 'done') this.lastHint = this.playT;
    }
    if (this.glassesLeadT > 0) {
      this.glassesLeadT -= dt;
      if (this.glassesLeadT <= 0 && this.leadKind === 'glasses') this.stopLead();
    }
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
    if (!why && this.guiding && this.step !== 'story' && this.wanderT > WANDER_SECONDS) why = 'wander';
    if (!why && this.guiding && this.stillT > IDLE_SECONDS && !v.nearAttraction && this.step !== 'story') why = 'idle';
    if (!why) return false;
    this.pushT = 0;
    this.wanderT = 0;
    if (why === 'idle') this.stillT = -IDLE_SECONDS;
    this.rescue(v, why === 'stuck');
    return true;
  }

  private rescue(v: DirectorView, assist: boolean): void {
    this.rescues++;
    // Lead to the tour's target if there is one, else the nearest fun place not done yet.
    let to: Attraction | null = this.leadTo && this.leadKind === 'tour' ? this.leadTo : null;
    if (!to && this.step !== 'done') to = FIRST_ATTRACTION;
    if (!to) to = this.nearestPlace(v.hero, (p) => FUN_ATTRACTIONS.includes(p) && !this.done.has(p) && p !== v.nearAttraction);
    if (!to) return;
    const kind: LeadKind = this.leadKind === 'tour' || this.step !== 'done' ? 'tour' : 'rescue';
    this.leadToPlace(to, kind, { fetch: true, assist });
    this.sink.bark('bark');
    if (this.step !== 'story' && this.canHint() && this.fresh(RESCUE.text)) {
      this.lastHint = this.playT;
      this.say(line(RESCUE, PRIORITY.tip, 'rescue'));
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

  private triedGlasses(): boolean {
    return GLASSES_ATTRACTIONS.some((g) => this.visited.has(g));
  }

  private nudgeGlasses(from: V2): void {
    const best = this.nearestPlace(from, (p) => isGlasses(p) && !this.visited.has(p));
    if (!best) return;
    this.lastHint = this.playT;
    if (this.fresh(suggest(best).text)) this.say(line(suggest(best), PRIORITY.tip, 'glasses:nudge'));
    this.leadToPlace(best, 'glasses');
    this.sink.bark('bark');
    this.glassesLeadT = GLASSES_LEAD_SECONDS;
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
    this.say(line(l, PRIORITY.tip, `tip:${id}`));
  }

  /** Queue a place's how-to (1–3 lines, said one after the other). */
  private howTo(topic: HowToTopic, priority: Line['priority'], asked = false): void {
    this.store.markTip(`howto:${topic}`);
    const lines = HOWTO[topic];
    const items: ChainItem[] = lines.map((l, i) => ({ line: line(l, i === 0 ? priority : PRIORITY.tip, `howto:${topic}:${i}`), topic }));
    if (asked) {
      // The child asked: say it now.
      const first = items.shift()!;
      this.say(first.line);
    }
    this.chain.push(...items);
  }

  /** Explain an economy thing the first time it matters (once ever). True if it spoke. */
  private econ(id: EconId): boolean {
    const key: TipId = `econ:${id}`;
    if (this.store.tipSeen(key)) return false;
    this.store.markTip(key);
    this.lastHint = this.playT;
    this.say(line(ECON[id], PRIORITY.tip, key));
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

  private sayGoal(priority: Line['priority']): void {
    const g = this.sink.goal();
    this.say(line(g.line, priority, `goal:${g.id}`));
  }
}
