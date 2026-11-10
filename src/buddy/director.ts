/**
 * Story director (no DOM, no three.js): the opening tour for a new player, "welcome back" for a
 * returning one, one-time context tips, stuck/idle nudges, the trampoline count and reactions.
 * It only decides WHAT Pip says and WHERE he leads; `index.ts` turns that into motion, voice and
 * the bubble. Unit-tested in tests/buddy/director.test.ts.
 */
import type { Line } from './dialogue';
import { PRIORITY } from './dialogue';
import type { Goal } from './goals';
import type { BuddyStore } from './store';
import type { KeyNames, ScriptLine, TipId } from './script';
import { ATTRACTIONS, CHEST, CHUTE, COUNT, IDLE, INTRO, needGems, REACT, RETURNING, skillTip, suggest, TIPS, line } from './script';
import type { V2 } from './steer';
import type { Attraction } from './types';

export type IntroStep = 'welcome' | 'glasses' | 'findGem' | 'wallet' | 'shop' | 'trampoline' | 'choose' | 'done';

/** Seconds before an intro step moves on by itself (the tour never waits forever). */
export const INTRO_TIMEOUT: Record<Exclude<IntroStep, 'done'>, number> = {
  welcome: 3.2,
  glasses: 3.8,
  findGem: 14,
  wallet: 3.8,
  shop: 8.5,
  trampoline: 8.5,
  choose: 3.6,
};
/** The intro can be skipped after this many seconds. */
export const SKIP_AFTER = 2;
export const STUCK_SECONDS = 40;
export const IDLE_SECONDS = 15;
export const REACT_COOLDOWN = 6;
export const CHEST_HINT_COOLDOWN = 18;

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
}

export interface DirectorSink {
  say(line: Line): void;
  /** Lead the hero towards a spot (null = back to following). `wait` = sit and bark there. */
  lead(target: V2 | null): void;
  /** Happy dance / zoomies. */
  celebrate(big: boolean): void;
  /** Little bark (count barks, nudges). */
  bark(kind: 'yip' | 'bark' | 'whine'): void;
  /** The hero's next goal right now. */
  goal(): Goal;
  /** "General way" spot towards the nearest gem spot (already coarse), or null. */
  gemWay(): V2 | null;
  anchor(name: Attraction): V2 | null;
  /** Attractions that exist, with positions (for stuck suggestions). */
  places(): readonly { name: Attraction; x: number; z: number }[];
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
  readonly visited = new Set<Attraction>();
  private lastReact = -99;
  private lastChestHint = -99;
  private sunsetSaid = false;
  private idleIndex = 0;
  private shopOpened = false;
  private bounces = 0;
  private wasFreefall = false;
  private returning = false;
  private nextBark = 3;

  constructor(
    private readonly sink: DirectorSink,
    private readonly store: BuddyStore,
    private readonly rand: () => number = Math.random,
  ) {}

  get introActive(): boolean {
    return this.step !== 'done';
  }

  /** A new session started. `runIntro` = brand-new player (and intro allowed). */
  begin(runIntro: boolean): void {
    this.playT = 0;
    this.sinceProgress = 0;
    this.stillT = 0;
    this.sunsetSaid = false;
    this.visited.clear();
    this.bounces = 0;
    this.shopOpened = false;
    this.returning = !runIntro;
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
    if (this.step !== 'done') this.step = 'done';
    this.sink.lead(null);
  }

  /** Skip the intro (any non-game key / tap on the bubble). Returns true if it skipped. */
  skip(): boolean {
    if (this.step === 'done' || this.introT < SKIP_AFTER) return false;
    this.finishIntro();
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
    if (this.step === 'findGem') {
      this.enter('wallet');
      return;
    }
    if (e.mega) this.react(REACT.mega, true);
    else if ((e.combo ?? 1) >= 3) this.react(REACT.combo);
    else if (!this.store.tipSeen('combo') && (e.combo ?? 1) >= 2 && this.step === 'done') this.tip('combo', TIPS.combo);
  }

  onShopOpen(): void {
    this.progress();
    this.shopOpened = true;
  }

  onStunt(e: { kind: string; stars: number }): void {
    this.progress();
    if (this.step === 'trampoline' && e.kind === 'bigBounce') {
      this.enter('choose');
      return;
    }
    if (e.stars > 0 && this.step === 'done' && !this.store.tipSeen('stars')) {
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
    if (!this.introActive || this.step === 'trampoline') {
      this.sink.say({ text: word, icon: 'wTrampoline', priority: PRIORITY.react, mood: 'excited', hold: 0.5, ttl: 0.6 });
    }
    if (this.step === 'trampoline' && this.bounces >= 2) this.enter('choose');
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
    this.sayGoal(PRIORITY.tip);
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

  // ───────────── frame ─────────────

  update(dt: number, v: DirectorView): void {
    this.playT += dt;
    this.sinceProgress += dt;
    this.stillT = v.onFoot && v.heroSpeed < 0.3 ? this.stillT + dt : 0;
    if (this.step !== 'done') {
      this.introT += dt;
      this.stepT += dt;
      this.updateIntro(v);
      return;
    }
    // Rides: the first freefall explains the chute, later ones just cheer.
    const ff = v.ride === 'freefall';
    if (ff && !this.wasFreefall) {
      if (!this.store.tipSeen('chute')) this.tip('chute', CHUTE(v.keys));
      else this.react(REACT.freefall);
    }
    this.wasFreefall = ff;

    // First visit to an attraction: a one-line how-to.
    const at = v.nearAttraction;
    if (at && !this.visited.has(at)) {
      this.visited.add(at);
      this.progress();
      const id: TipId = `visit:${at}`;
      if (!this.store.tipSeen(id)) this.tip(id, ATTRACTIONS[at].howTo(v.keys));
    }

    // Chests: what to do next (repeats with a cooldown while standing there).
    if (v.chestHint && this.playT - this.lastChestHint > CHEST_HINT_COOLDOWN) {
      this.lastChestHint = this.playT;
      this.sink.say(line(CHEST[v.chestHint], PRIORITY.tip, `chest:${v.chestHint}`));
    }

    this.onTick(v.remaining);
    if (v.busy) return;

    // One-time HUD tips, spread over the first two minutes.
    if (this.returning && this.playT > 9 && !this.store.tipSeen('compass')) {
      this.tip('compass', TIPS.compass);
      return;
    }
    for (const t of TIP_SCHEDULE) {
      if (this.playT < t.at || this.store.tipSeen(t.id)) continue;
      if (t.id === 'missions' && !v.hasMissions) continue;
      this.tip(t.id, t.id === 'skill' ? skillTip(v.keys.skill) : TIPS[t.id as keyof typeof TIPS]);
      return;
    }

    // Stuck: nothing happened for a while → suggest the nearest attraction not tried yet.
    if (this.sinceProgress > STUCK_SECONDS) {
      this.sinceProgress = 0;
      const places = this.sink.places();
      let best: Attraction | null = null;
      let bestD = Infinity;
      for (const p of places) {
        const d = Math.hypot(p.x - v.hero.x, p.z - v.hero.z) + (this.visited.has(p.name) ? 1000 : 0);
        if (d < bestD) {
          bestD = d;
          best = p.name;
        }
      }
      if (best) {
        this.sink.say(line(suggest(best), PRIORITY.tip, 'stuck'));
        this.sink.bark('bark');
      }
      return;
    }

    // Standing still: a playful idle line now and then.
    if (this.stillT > IDLE_SECONDS) {
      this.stillT = -10;
      const pick = IDLE[(this.idleIndex + Math.floor(this.rand() * IDLE.length)) % IDLE.length];
      this.idleIndex++;
      this.sink.say(line(pick, PRIORITY.idle, 'idle'));
    }
  }

  // ───────────── internals ─────────────

  private enter(step: IntroStep): void {
    this.step = step;
    this.stepT = 0;
    switch (step) {
      case 'welcome':
        this.sink.lead(null);
        this.sink.say(line(INTRO.welcome, PRIORITY.story, 'intro:welcome'));
        break;
      case 'glasses':
        this.sink.say(line(INTRO.glasses, PRIORITY.story, 'intro:glasses'));
        break;
      case 'findGem':
        this.sink.lead(this.sink.gemWay());
        this.sink.say(line(INTRO.findGem, PRIORITY.story, 'intro:findGem'));
        break;
      case 'wallet':
        this.sink.lead(null);
        this.sink.celebrate(false);
        this.sink.say(line(INTRO.wallet, PRIORITY.story, 'intro:wallet'));
        break;
      case 'shop':
        this.shopOpened = false;
        this.nextBark = 3;
        this.sink.lead(this.sink.anchor('gearShack'));
        this.sink.say(line(INTRO.shop, PRIORITY.story, 'intro:shop'));
        break;
      case 'trampoline':
        this.bounces = 0;
        this.sink.lead(this.sink.anchor('trampoline'));
        this.sink.say(line(INTRO.trampoline, PRIORITY.story, 'intro:trampoline'));
        break;
      case 'choose':
        this.sink.lead(null);
        this.sink.say(line(INTRO.choose, PRIORITY.story, 'intro:choose'));
        break;
      case 'done':
        break;
    }
  }

  private updateIntro(v: DirectorView): void {
    const s = this.step;
    if (s === 'done') return;
    const timeout = INTRO_TIMEOUT[s];
    switch (s) {
      case 'welcome':
        if (this.stepT > timeout) this.enter('glasses');
        break;
      case 'glasses':
        if (this.stepT > timeout) this.enter('findGem');
        break;
      case 'findGem':
        if (this.stepT > timeout) this.enter('shop');
        break;
      case 'wallet':
        if (this.stepT > timeout) this.enter('shop');
        break;
      case 'shop': {
        const near = v.nearAttraction === 'gearShack';
        if (this.shopOpened || this.stepT > timeout || (near && this.stepT > 2.5)) {
          if (this.shopOpened || near) this.visited.add('gearShack');
          this.enter('trampoline');
        } else if (this.stepT > this.nextBark) {
          // Pip waits at the shack and barks every few seconds.
          this.nextBark = this.stepT + 3;
          this.sink.bark('bark');
        }
        break;
      }
      case 'trampoline':
        if (v.nearAttraction === 'trampoline') this.visited.add('trampoline');
        if (this.stepT > timeout) this.enter('choose');
        break;
      case 'choose':
        if (this.stepT > timeout) this.finishIntro();
        break;
    }
  }

  private finishIntro(): void {
    this.step = 'done';
    this.store.setIntroSeen();
    // The tour already covered these.
    this.store.markTip('compass');
    this.store.markTip('visit:gearShack');
    this.store.markTip('visit:trampoline');
    this.sink.lead(null);
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
