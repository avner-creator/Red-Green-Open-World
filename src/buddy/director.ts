/**
 * Story director (no DOM, no three.js): the opening tour for a new player, "welcome back" for a
 * returning one, leading the way to the first attractions, rescues (stuck at a fence, wandering
 * off, standing around), one-time context tips, the trampoline count and reactions.
 * It only decides WHAT Pip says and WHERE he leads; `index.ts` turns that into motion, voice and
 * the bubble. Unit-tested in tests/buddy/director.test.ts and tests/buddy/guide.test.ts.
 *
 * RULES
 *  - Every intro step waits for the action it teaches (move, look, jump) and re-prompts; no timer
 *    pushes the tour on. Place tips ("Jump!") only fire inside that attraction's radius.
 *  - Pip leads only to both-eye places (attraction anchors from `places()` / `anchor()`); he never
 *    goes towards, faces or points at a weak-eye or strong-eye object. The sink has no way to ask
 *    for a gem, key or lock position on purpose.
 *  - Never nagging: at most one unsolicited hint every HINT_GAP seconds; context hints (a chest
 *    right here, a place's how-to) win over generic tips; leading stops after LEAD_ATTRACTIONS.
 */
import type { Line } from './dialogue';
import { PRIORITY } from './dialogue';
import type { Goal } from './goals';
import type { BuddyStore } from './store';
import type { KeyNames, ScriptLine, TipId } from './script';
import { ATTRACTIONS, CHEST, CHUTE, COUNT, IDLE, INTRO, RESCUE, needGems, REACT, RETURNING, skillTip, suggest, TIPS, follow, line } from './script';
import type { V2 } from './steer';
import { GLASSES_ATTRACTIONS, type Attraction, type GlassesAttraction } from './types';

const isGlasses = (a: Attraction): a is GlassesAttraction => (GLASSES_ATTRACTIONS as readonly string[]).includes(a);

export type IntroStep = 'welcome' | 'move' | 'look' | 'glasses' | 'follow' | 'jump' | 'done';

/** Seconds the welcome line stays before "walk" (the only step that moves on by time). */
export const WELCOME_SECONDS = 2.6;
/** Seconds of "magic glasses" show before Pip leads on. */
export const GLASSES_SECONDS = 3.6;
/** Metres the hero must walk to finish the "move" step. */
export const MOVE_METRES = 4;
/** Radians of looking around to finish the "look" step. */
export const LOOK_RADIANS = 0.6;
/** "Look" re-prompts at most this many times, then the tour moves on (never stalls on it). */
export const LOOK_PROMPTS = 2;
/** Seconds between re-prompts of the same step. */
export const REPROMPT = 12;
/** At most one unsolicited hint per this many seconds. */
export const HINT_GAP = 12;
/** The intro can be skipped after this many seconds. */
export const SKIP_AFTER = 2;
/** Pressing move without getting anywhere this long = stuck (fence, wall). */
export const STUCK_PUSH_SECONDS = 3;
/** Walking away from every attraction this long = lost. */
export const WANDER_SECONDS = 15;
/** "Away from everything" = farther than this from the nearest attraction (m). */
export const WANDER_RADIUS = 24;
export const STUCK_SECONDS = 40;
export const IDLE_SECONDS = 15;
export const REACT_COOLDOWN = 6;
export const CHEST_HINT_COOLDOWN = 18;
/** Generic tips stay quiet this long after a chest hint. */
const CHEST_QUIET = 8;
/** Pip leads a new player to this many attractions, then lets them choose. */
export const LEAD_ATTRACTIONS = 2;
/** Seconds at an attraction that count as "done it" even without an event. */
export const DONE_AT_SECONDS = 10;
/** Leaving the trampoline this long during the "jump" step = lead back to it. */
const JUMP_AWAY_SECONDS = 6;
/** Seconds of play when Pip first (and again) points at the nearest magic-glasses game nobody tried. */
export const GLASSES_NUDGE_AT = [50, 140] as const;
/** How long Pip waits at the game to show where it is. */
const GLASSES_LEAD_SECONDS = 9;

/** The first attraction of the tour (free, fun, no button needed but jump). */
export const FIRST_ATTRACTION: Attraction = 'trampoline';
/** Free first plays Pip leads to next (nearest first). Shops and the glasses games are not "rides". */
export const FUN_ATTRACTIONS: readonly Attraction[] = [
  'trampoline', 'bouncePads', 'launchPads', 'balloon', 'garage', 'raceStart', 'foamCourse', 'sillyZone', 'bubbleArena', 'dinoRing',
  'carnivalRow', 'bungee', 'airstrip', 'ranch',
];

/** When each one-time HUD tip may show (seconds of play), in order. */
export const TIP_SCHEDULE: readonly { id: TipId; at: number }[] = [
  { id: 'missions', at: 18 },
  { id: 'timer', at: 38 },
  { id: 'skill', at: 55 },
  { id: 'help', at: 80 },
  { id: 'pip', at: 105 },
];

export type RideView = 'none' | 'basket' | 'freefall' | 'canopy' | 'vehicle' | 'other';
export type ChestHint = 'findKey' | 'findSide' | 'shape' | null;

export interface DirectorView {
  hero: V2;
  heroSpeed: number;
  /** Hero is on foot (walk mode). */
  onFoot: boolean;
  ride: RideView;
  /** Attraction the hero is standing at, if any. */
  nearAttraction: Attraction | null;
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

export class Director {
  step: IntroStep = 'done';
  /** Seconds in the current intro step. */
  stepT = 0;
  /** Seconds since the intro started. */
  introT = 0;
  playT = 0;
  sinceProgress = 0;
  stillT = 0;
  readonly visited = new Set<Attraction>();
  /** Attractions the hero actually did something at (leading stops after LEAD_ATTRACTIONS). */
  readonly done = new Set<Attraction>();
  /** Where Pip is leading right now (null = following). */
  leadTo: Attraction | null = null;
  leadKind: LeadKind | null = null;
  /** Number of rescues so far this session (tests). */
  rescues = 0;
  private guiding = false;
  private lastReact = -99;
  private lastChestHint = -99;
  private lastHint = -99;
  private lastPrompt = -99;
  private prompts = 0;
  private sunsetSaid = false;
  private walletSaid = false;
  private idleIndex = 0;
  private bounces = 0;
  private wasFreefall = false;
  private returning = false;
  private glassesNudges = 0;
  private glassesLeadT = 0;
  private moved = 0;
  private looked = 0;
  private awayT = 0;
  private pushT = 0;
  private wanderT = 0;
  private lastNearest = Infinity;
  private at: Attraction | null = null;
  private atT = 0;

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
    this.walletSaid = false;
    this.visited.clear();
    this.done.clear();
    this.glassesNudges = 0;
    this.glassesLeadT = 0;
    this.bounces = 0;
    this.lastHint = -99;
    this.lastChestHint = -99;
    this.pushT = 0;
    this.wanderT = 0;
    this.rescues = 0;
    this.at = null;
    this.atT = 0;
    this.stopLead();
    this.returning = !runIntro;
    this.guiding = runIntro;
    if (runIntro) {
      this.introT = 0;
      this.enter('welcome');
    } else {
      this.step = 'done';
      this.sink.say(line(RETURNING, PRIORITY.story, 'returning'));
      this.sayGoal(PRIORITY.tip);
    }
  }

  /** The session left 'playing' for good (title / end). */
  end(): void {
    this.step = 'done';
    this.guiding = false;
    this.stopLead();
  }

  /** Skip the intro (any non-game key / tap on the bubble). Returns true if it skipped. */
  skip(): boolean {
    if (this.step === 'done' || this.introT < SKIP_AFTER) return false;
    this.finishIntro();
    this.guiding = false;
    this.stopLead();
    this.sink.say(line(INTRO.skipped, PRIORITY.story, 'intro:skipped'));
    return true;
  }

  /** Ask Pip: the current goal (or the HUD element explanation chosen by the caller). */
  ask(explain: ScriptLine | null): void {
    if (explain) this.sink.say(line(explain, PRIORITY.story, 'ask'));
    else this.sayGoal(PRIORITY.story);
  }

  // ───────────── events ─────────────

  onGem(e: { mega?: boolean; combo?: number }): void {
    this.progress();
    if (this.guiding && !this.walletSaid) {
      // A brand-new player's first gem: gems are money (wallet callout).
      this.walletSaid = true;
      this.sink.celebrate(false);
      this.sink.say(line(INTRO.wallet, PRIORITY.story, 'intro:wallet'));
      return;
    }
    if (e.mega) this.react(REACT.mega, true);
    else if ((e.combo ?? 1) >= 3) this.react(REACT.combo);
    else if (!this.store.tipSeen('combo') && (e.combo ?? 1) >= 2 && this.step === 'done') this.tip('combo', TIPS.combo);
  }

  onShopOpen(): void {
    this.progress();
    this.didSomething();
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
    if (e.stars >= 2) this.react(REACT.stunt, true);
  }

  /** The hero reached the top of a bounce on the trampoline (Pip barks the count). */
  onTrampolineApex(): void {
    this.progress();
    this.bounces = Math.min(this.bounces + 1, COUNT.length);
    const word = COUNT[this.bounces - 1];
    this.sink.bark('yip');
    if (!this.introActive || this.step === 'jump') {
      this.sink.say({ text: word, icon: 'wTrampoline', priority: PRIORITY.react, mood: 'excited', hold: 0.5, ttl: 0.6 });
    }
    if (this.bounces >= 2) this.markDone('trampoline');
    if (this.step === 'jump' && this.bounces >= 2) this.jumpDone();
  }

  /** Hero left the trampoline: the count starts again next time. */
  resetBounces(): void {
    this.bounces = 0;
  }

  onChestKey(): void {
    this.progress();
    this.react(REACT.key, true);
  }

  onChestOpened(): void {
    this.progress();
    this.react(REACT.chest, true);
    this.sink.celebrate(true);
  }

  onFlop(): void {
    this.react(REACT.flop);
  }

  onSkill(): void {
    this.progress();
    this.react(REACT.skill);
  }

  onEmote(): void {
    this.react(REACT.emote, true);
  }

  onPurchased(): void {
    this.progress();
    this.react(REACT.bought, true);
    this.sink.celebrate(false);
  }

  onUnlocked(): void {
    this.react(REACT.unlocked);
  }

  onTicketPaid(): void {
    this.progress();
    this.didSomething();
    this.react(REACT.ticket, true);
  }

  onTicketDenied(price: number, wallet: number): void {
    this.sink.say(line(needGems(Math.max(1, price - wallet)), PRIORITY.tip));
    this.sink.bark('whine');
  }

  onMissionCompleted(): void {
    this.progress();
    this.sink.say(line(REACT.goalDone, PRIORITY.tip, 'goal:done'));
    this.sink.celebrate(true);
    if (!this.guiding) this.sayGoal(PRIORITY.tip);
  }

  onJackpot(): void {
    this.progress();
    this.sink.say(line(REACT.jackpot, PRIORITY.tip));
    this.sink.celebrate(true);
  }

  onWalletChange(): void {
    this.progress();
  }

  onTick(remaining: number): void {
    if (!this.sunsetSaid && remaining <= 30 && remaining > 0) {
      this.sunsetSaid = true;
      this.sink.say(line(REACT.sunset, PRIORITY.tip, 'sunset'));
    }
  }

  /** Called on every weak-eye game hit/miss event with `hit`. */
  onGlassesHit(): void {
    this.progress();
    this.didSomething();
    this.react(REACT.magic);
  }

  // ───────────── frame ─────────────

  update(dt: number, v: DirectorView): void {
    this.playT += dt;
    this.sinceProgress += dt;
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

    // Chests: context hint, wins over everything generic (repeats with a cooldown while there).
    if (v.chestHint && this.playT - this.lastChestHint > CHEST_HINT_COOLDOWN) {
      this.lastChestHint = this.playT;
      this.lastHint = this.playT;
      this.sink.say(line(CHEST[v.chestHint], PRIORITY.story, `chest:${v.chestHint}`));
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

    // Rides: the first freefall explains the chute, later ones just cheer.
    const ff = v.ride === 'freefall';
    if (ff && !this.wasFreefall) {
      if (!this.store.tipSeen('chute')) this.tip('chute', CHUTE(v.keys));
      else this.react(REACT.freefall);
    }
    this.wasFreefall = ff;

    // First visit to an attraction: a one-line how-to (only inside its radius).
    if (at && !this.visited.has(at)) {
      this.visited.add(at);
      this.progress();
      const id: TipId = `visit:${at}`;
      if (!this.store.tipSeen(id) && !chestNear) {
        this.tip(id, ATTRACTIONS[at].howTo(v.keys));
        this.lastHint = this.playT;
      }
    }

    if (v.busy || chestNear) return;

    // One-time HUD tips, spread over the first two minutes (quiet while Pip shows the way).
    if (!this.guiding && this.canHint()) {
      if (this.returning && this.playT > 9 && !this.store.tipSeen('compass')) {
        this.hint('compass', TIPS.compass);
        return;
      }
      for (const t of TIP_SCHEDULE) {
        if (this.playT < t.at || this.store.tipSeen(t.id)) continue;
        if (t.id === 'missions' && !v.hasMissions) continue;
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
      if (best) {
        this.lastHint = this.playT;
        this.sink.say(line(suggest(best), PRIORITY.tip, 'stuck'));
        this.sink.bark('bark');
      }
      return;
    }

    // Standing still: a playful idle line now and then.
    if (this.stillT > IDLE_SECONDS && this.canHint()) {
      this.stillT = -10;
      this.lastHint = this.playT;
      const pick = IDLE[(this.idleIndex + Math.floor(this.rand() * IDLE.length)) % IDLE.length];
      this.idleIndex++;
      this.sink.say(line(pick, PRIORITY.idle, 'idle'));
    }
  }

  // ───────────── intro ─────────────

  private enter(step: IntroStep): void {
    this.step = step;
    this.stepT = 0;
    this.prompts = 0;
    this.lastPrompt = -99;
    switch (step) {
      case 'welcome':
        this.sink.say(line(INTRO.welcome, PRIORITY.story, 'intro:welcome'));
        break;
      case 'move':
        // From spawn Pip runs ahead towards the first attraction: "walk with me!".
        this.moved = 0;
        this.leadToPlace(FIRST_ATTRACTION, 'tour');
        this.prompt(INTRO.move, 'intro:move');
        break;
      case 'look':
        this.looked = 0;
        this.prompt(INTRO.look, 'intro:look');
        break;
      case 'glasses':
        // Pip's own magic glasses + sparkles: the line says gems hide, nothing shows where.
        this.sink.glasses(GLASSES_SECONDS + 1);
        this.sink.say(line(INTRO.glasses, PRIORITY.story, 'intro:glasses'));
        break;
      case 'follow':
        if (this.leadTo !== FIRST_ATTRACTION) this.leadToPlace(FIRST_ATTRACTION, 'tour');
        this.prompt(follow(FIRST_ATTRACTION), 'intro:follow');
        break;
      case 'jump':
        this.bounces = 0;
        this.awayT = 0;
        this.prompt(INTRO.jump, 'intro:jump');
        break;
      case 'done':
        break;
    }
  }

  /** Say a step's line now and remember it for re-prompts. */
  private prompt(l: ScriptLine, id: string): void {
    this.prompts++;
    this.lastPrompt = this.playT;
    this.lastHint = this.playT;
    this.sink.say(line(l, PRIORITY.story, id));
  }

  private reprompt(l: ScriptLine, id: string): void {
    if (this.playT - this.lastPrompt < REPROMPT || !this.canHint()) return;
    this.prompt(l, id);
    this.sink.bark('bark');
  }

  private updateIntro(dt: number, v: DirectorView): void {
    // Reaching the trampoline early jumps straight to its step (wherever the tour is).
    if (v.nearAttraction === FIRST_ATTRACTION && this.step !== 'jump' && this.step !== 'welcome') {
      this.enter('jump');
      return;
    }
    switch (this.step) {
      case 'welcome':
        if (this.stepT > WELCOME_SECONDS) this.enter('move');
        break;
      case 'move':
        if (v.onFoot) this.moved += v.heroSpeed * dt;
        if (this.moved >= MOVE_METRES) this.enter('look');
        else this.reprompt(INTRO.move, 'intro:move');
        break;
      case 'look':
        this.looked += v.look ?? 0;
        if (this.looked >= LOOK_RADIANS) this.enter('glasses');
        else if (this.prompts > LOOK_PROMPTS && this.playT - this.lastPrompt > REPROMPT) this.enter('glasses');
        else this.reprompt(INTRO.look, 'intro:look');
        break;
      case 'glasses':
        if (this.stepT > GLASSES_SECONDS) this.enter('follow');
        break;
      case 'follow':
        if (!this.leadTo) this.leadToPlace(FIRST_ATTRACTION, 'tour');
        this.reprompt(follow(FIRST_ATTRACTION), 'intro:follow');
        break;
      case 'jump':
        if (v.nearAttraction === FIRST_ATTRACTION) {
          this.awayT = 0;
          this.reprompt(INTRO.jump, 'intro:jump');
        } else if ((this.awayT += dt) > JUMP_AWAY_SECONDS) this.enter('follow');
        break;
      case 'done':
        break;
    }
  }

  private jumpDone(): void {
    this.markDone(FIRST_ATTRACTION);
    this.finishIntro();
    this.sink.celebrate(true);
    this.sink.say(line(REACT.landed, PRIORITY.story, 'intro:yay'));
    this.nextLead();
  }

  private finishIntro(): void {
    this.step = 'done';
    this.store.setIntroSeen();
    // The tour already covered these.
    this.store.markTip('compass');
    this.store.markTip('visit:trampoline');
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
      this.sink.say(line(INTRO.choose, PRIORITY.tip, 'guide:choose'));
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
    this.sink.say(line(follow(next), PRIORITY.tip, 'guide:follow'));
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
    if (!why && this.guiding && this.wanderT > WANDER_SECONDS) why = 'wander';
    if (!why && this.guiding && this.stillT > IDLE_SECONDS && !v.nearAttraction && this.step !== 'welcome') why = 'idle';
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
    if (this.canHint()) {
      this.lastHint = this.playT;
      this.sink.say(line(RESCUE, PRIORITY.tip, 'rescue'));
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
    this.sink.say(line(suggest(best), PRIORITY.tip, 'glasses:nudge'));
    this.leadToPlace(best, 'glasses');
    this.sink.bark('bark');
    this.glassesLeadT = GLASSES_LEAD_SECONDS;
  }

  // ───────────── helpers ─────────────

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
    this.sink.say(line(l, PRIORITY.tip, `tip:${id}`));
  }

  private react(l: ScriptLine, force = false): void {
    if (this.step !== 'done') return;
    if (!force && this.playT - this.lastReact < REACT_COOLDOWN) return;
    this.lastReact = this.playT;
    this.sink.say(line(l, PRIORITY.react));
  }

  private progress(): void {
    this.sinceProgress = 0;
  }

  private sayGoal(priority: Line['priority']): void {
    const g = this.sink.goal();
    this.sink.say(line(g.line, priority, `goal:${g.id}`));
  }
}
