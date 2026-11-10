/**
 * Scoops, the ice-cream shop: pure rules (no three.js). The cone builder state machine, the
 * wobbly-stack physics, recipe cards, the secret topping of the day, the eating effects and the
 * ticket/prize maths. Everything here is deterministic given its seed (unit tested).
 */

export type ConeId = 'waffle' | 'choco' | 'rainbow';
export type FlavourId = 'vanilla' | 'choc' | 'berry' | 'mint' | 'blue';
export type SauceId = 'fudge' | 'strawberry' | 'caramel';
export type ToppingId = 'worms' | 'popcorn' | 'pickle' | 'duck' | 'sprinkles' | 'marsh';
export type EffectId = 'bigHead' | 'tiny' | 'rainbow' | 'speed' | 'moon' | 'burps';
export type SecretId = 'starCandy' | 'goldCherry' | 'glowBear' | 'rocketPop';
export type Stage = 'cone' | 'scoops' | 'sauce' | 'toppings' | 'eat';

export const CONES: readonly ConeId[] = ['waffle', 'choco', 'rainbow'];
export const FLAVOURS: readonly FlavourId[] = ['vanilla', 'choc', 'berry', 'mint', 'blue'];
export const SAUCES: readonly SauceId[] = ['fudge', 'strawberry', 'caramel'];
export const TOPPINGS: readonly ToppingId[] = ['worms', 'popcorn', 'pickle', 'duck', 'sprinkles', 'marsh'];
export const SECRETS: readonly SecretId[] = ['starCandy', 'goldCherry', 'glowBear', 'rocketPop'];
export const STAGES: readonly Stage[] = ['cone', 'scoops', 'sauce', 'toppings', 'eat'];

export const SCOOPS = {
  maxScoops: 5,
  maxToppings: 3,
  jars: 3,
  /** Wrong jar picks allowed per cone before the jars close. */
  jarTries: 2,
  effectSeconds: 30,
  /** Ticket after the first free cone of the session (gems). */
  ticket: 3,
  /** Gems: finishing any cone, a matching recipe card, the secret topping. */
  prizeCone: 1,
  prizeRecipe: 4,
  prizeSecret: 2,
} as const;

/** Which effect each topping gives when eaten. */
export const TOPPING_EFFECT: Readonly<Record<ToppingId, EffectId>> = {
  sprinkles: 'rainbow',
  popcorn: 'moon',
  pickle: 'bigHead',
  duck: 'burps',
  worms: 'speed',
  marsh: 'tiny',
};

/** No topping: the top scoop's flavour decides. */
export const FLAVOUR_EFFECT: Readonly<Record<FlavourId, EffectId>> = {
  vanilla: 'tiny',
  choc: 'bigHead',
  berry: 'rainbow',
  mint: 'speed',
  blue: 'burps',
};

/** The secret topping of the day adds this extra effect (and a gem bonus). */
export const SECRET_EFFECT: Readonly<Record<SecretId, EffectId>> = {
  starCandy: 'moon',
  goldCherry: 'bigHead',
  glowBear: 'rainbow',
  rocketPop: 'speed',
};

// ───────────────────────────── Seeded randomness ─────────────────────────────

/** mulberry32: small, fast, deterministic 0..1 generator. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Day number (UTC days since 1970) → the secret topping of that day. */
export function secretOfDay(day: number): SecretId {
  const d = Math.floor(day);
  return SECRETS[((d % SECRETS.length) + SECRETS.length) % SECRETS.length];
}

export function dayNumber(ms: number): number {
  return Math.floor(ms / 86_400_000);
}

// ───────────────────────────── Recipe cards ─────────────────────────────

export interface Recipe {
  cone: ConeId;
  /** Bottom to top. */
  scoops: FlavourId[];
  sauce: SauceId | null;
  topping: ToppingId;
}

const pick = <T>(list: readonly T[], r: () => number): T => list[Math.min(list.length - 1, Math.floor(r() * list.length))];

/** A friend's order: 2-3 scoops (never the same flavour twice in a row), maybe a sauce, one topping. */
export function makeRecipe(r: () => number): Recipe {
  const n = r() < 0.5 ? 2 : 3;
  const scoops: FlavourId[] = [];
  while (scoops.length < n) {
    const f = pick(FLAVOURS, r);
    if (f !== scoops[scoops.length - 1]) scoops.push(f);
  }
  return { cone: pick(CONES, r), scoops, sauce: r() < 0.25 ? null : pick(SAUCES, r), topping: pick(TOPPINGS, r) };
}

/**
 * Does a cone match the card? Forgiving for young kids: same cone, the same scoops in any order,
 * the same sauce (or none), and the card's topping is on it (extra toppings are fine).
 */
export function matchesRecipe(b: Readonly<BuildSnapshot>, r: Readonly<Recipe>): boolean {
  if (b.cone !== r.cone || b.sauce !== r.sauce) return false;
  if (b.scoops.length !== r.scoops.length) return false;
  const a = [...b.scoops].sort().join();
  const c = [...r.scoops].sort().join();
  return a === c && b.toppings.includes(r.topping);
}

/** How many of the card's parts are already right (for the card's tick marks). */
export function recipeProgress(b: Readonly<BuildSnapshot>, r: Readonly<Recipe>): { cone: boolean; scoops: boolean; sauce: boolean; topping: boolean } {
  const a = [...b.scoops].sort().join();
  const c = [...r.scoops].sort().join();
  return {
    cone: b.cone === r.cone,
    scoops: a === c,
    sauce: b.stage !== 'cone' && b.stage !== 'scoops' ? b.sauce === r.sauce : r.sauce !== null && b.sauce === r.sauce,
    topping: b.toppings.includes(r.topping),
  };
}

// ───────────────────────────── Effects ─────────────────────────────

/** The effects a finished cone gives (distinct, in topping order; at most 3 + the secret's). */
export function effectsFor(b: Readonly<Pick<BuildSnapshot, 'scoops' | 'toppings' | 'secret'>>, secret: SecretId): EffectId[] {
  const out: EffectId[] = [];
  for (const t of b.toppings) {
    const e = TOPPING_EFFECT[t];
    if (!out.includes(e)) out.push(e);
  }
  if (!out.length) out.push(FLAVOUR_EFFECT[b.scoops[b.scoops.length - 1] ?? 'vanilla']);
  if (b.secret) {
    const e = SECRET_EFFECT[secret];
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

// ───────────────────────────── Wobbly stack ─────────────────────────────

/**
 * The scoop tower leans like a springy inverted pendulum. Each new scoop gives it a push (along the
 * swing, so piling scoops on while it still wobbles adds up); taller stacks
 * are floppier. Wait for the wobble to settle and even five scoops stand; rush it and it topples.
 */
export const WOBBLE = {
  /** Spring stiffness for n scoops: base / (1 + soft * n²). */
  base: 60,
  soft: 0.5,
  damping: 2.4,
  /** Push per new scoop, rad/s: kick + kickPerScoop * n. */
  kick: 0.35,
  kickPerScoop: 0.1,
  /** Lean (rad) at which the top falls off. */
  topple: 0.55,
  /** Scoops that always stay on after a topple. */
  keep: 2,
} as const;

export class StackWobble {
  /** Lean as a 2D vector (x = sideways, z = toward the customer), radians. */
  x = 0;
  z = 0;
  vx = 0;
  vz = 0;
  constructor(private readonly r: () => number = Math.random) {}

  stiffness(n: number): number {
    return WOBBLE.base / (1 + WOBBLE.soft * n * n);
  }

  lean(): number {
    return Math.hypot(this.x, this.z);
  }

  /** A new scoop landed on a stack that now has `n` scoops. */
  push(n: number): void {
    const k = WOBBLE.kick + WOBBLE.kickPerScoop * n;
    // Push along the swing (or the lean): a stack still wobbling gains energy and can go over.
    const v = Math.hypot(this.vx, this.vz);
    const l = this.lean();
    let dx: number;
    let dz: number;
    if (v > 0.1) {
      dx = this.vx / v;
      dz = this.vz / v;
    } else if (l > 0.04) {
      dx = this.x / l;
      dz = this.z / l;
    } else {
      const a = this.r() * Math.PI * 2;
      dx = Math.cos(a);
      dz = Math.sin(a);
    }
    this.vx += dx * k;
    this.vz += dz * k;
  }

  /** Advance; returns true when the stack topples this step (then it resets upright). */
  step(dt: number, n: number): boolean {
    if (n <= 0) {
      this.x = this.z = this.vx = this.vz = 0;
      return false;
    }
    const k = this.stiffness(n);
    // Semi-implicit Euler in small sub-steps (stable for any frame dt).
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vx += (-k * this.x - WOBBLE.damping * this.vx) * h;
      this.vz += (-k * this.z - WOBBLE.damping * this.vz) * h;
      this.x += this.vx * h;
      this.z += this.vz * h;
      if (n > WOBBLE.keep && this.lean() > WOBBLE.topple) {
        this.reset();
        return true;
      }
    }
    return false;
  }

  reset(): void {
    this.x = this.z = this.vx = this.vz = 0;
  }

  /** Settled enough that adding another scoop is safe. */
  calm(): boolean {
    return this.lean() < 0.05 && Math.hypot(this.vx, this.vz) < 0.15;
  }
}

// ───────────────────────────── The cone builder ─────────────────────────────

export type Tile =
  | { kind: 'cone'; id: ConeId }
  | { kind: 'flavour'; id: FlavourId }
  | { kind: 'sauce'; id: SauceId }
  | { kind: 'topping'; id: ToppingId }
  | { kind: 'jar'; index: number }
  | { kind: 'next' };

export type ChooseResult =
  | { type: 'cone'; id: ConeId }
  | { type: 'scoop'; id: FlavourId; count: number }
  | { type: 'sauce'; id: SauceId }
  | { type: 'topping'; id: ToppingId }
  | { type: 'jarRight'; index: number }
  | { type: 'jarWrong'; index: number; movedTo: number }
  | { type: 'stage'; stage: Stage }
  | { type: 'full' }
  | { type: 'noop' };

export interface BuildSnapshot {
  stage: Stage;
  cone: ConeId | null;
  scoops: FlavourId[];
  sauce: SauceId | null;
  toppings: ToppingId[];
  secret: boolean;
  /** Jar that holds the secret topping right now (weak eye only), or -1 once found/closed. */
  secretJar: number;
  jarTries: number;
  /** Jars already opened empty this cone (they stay open). */
  openJars: number[];
  selected: number;
}

export function tilesFor(stage: Stage): Tile[] {
  switch (stage) {
    case 'cone':
      return CONES.map((id) => ({ kind: 'cone', id }));
    case 'scoops':
      return [...FLAVOURS.map((id): Tile => ({ kind: 'flavour', id })), { kind: 'next' }];
    case 'sauce':
      return [...SAUCES.map((id): Tile => ({ kind: 'sauce', id })), { kind: 'next' }];
    case 'toppings':
      return [
        ...TOPPINGS.map((id): Tile => ({ kind: 'topping', id })),
        ...Array.from({ length: SCOOPS.jars }, (_, index): Tile => ({ kind: 'jar', index })),
        { kind: 'next' },
      ];
    case 'eat':
      return [];
  }
}

export class ConeBuilder implements BuildSnapshot {
  stage: Stage = 'cone';
  cone: ConeId | null = null;
  scoops: FlavourId[] = [];
  sauce: SauceId | null = null;
  toppings: ToppingId[] = [];
  secret = false;
  secretJar = 0;
  jarTries = 0;
  openJars: number[] = [];
  selected = 0;

  constructor(private readonly r: () => number = Math.random) {
    this.secretJar = Math.floor(r() * SCOOPS.jars) % SCOOPS.jars;
  }

  tiles(): Tile[] {
    return tilesFor(this.stage);
  }

  /** Can this tile be chosen right now (dimmed tiles in the UI)? */
  enabled(t: Tile): boolean {
    switch (t.kind) {
      case 'cone':
        return this.stage === 'cone';
      case 'flavour':
        return this.stage === 'scoops' && this.scoops.length < SCOOPS.maxScoops;
      case 'sauce':
        return this.stage === 'sauce';
      case 'topping':
        return this.stage === 'toppings' && this.toppings.length < SCOOPS.maxToppings && !this.toppings.includes(t.id);
      case 'jar':
        return this.stage === 'toppings' && !this.secret && this.jarTries < SCOOPS.jarTries && !this.openJars.includes(t.index);
      case 'next':
        return this.stage === 'scoops' ? this.scoops.length > 0 : this.stage === 'sauce' || this.stage === 'toppings';
    }
  }

  /** Move the cursor by ±1 (wraps). */
  move(dir: number): void {
    const n = this.tiles().length;
    if (!n || !dir) return;
    this.selected = (((this.selected + Math.sign(dir)) % n) + n) % n;
  }

  select(index: number): void {
    const n = this.tiles().length;
    if (n) this.selected = Math.max(0, Math.min(n - 1, index));
  }

  current(): Tile | null {
    return this.tiles()[this.selected] ?? null;
  }

  private goto(stage: Stage): ChooseResult {
    this.stage = stage;
    // Land the cursor on something useful: the first enabled tile of the new row.
    const tiles = this.tiles();
    const i = tiles.findIndex((t) => this.enabled(t) && t.kind !== 'next');
    this.selected = i >= 0 ? i : 0;
    return { type: 'stage', stage };
  }

  /** Choose the selected tile (or a given one). */
  choose(t: Tile | null = this.current()): ChooseResult {
    if (!t) return { type: 'noop' };
    if (!this.enabled(t)) {
      if (t.kind === 'flavour' && this.scoops.length >= SCOOPS.maxScoops) return { type: 'full' };
      if (t.kind === 'topping' && this.toppings.length >= SCOOPS.maxToppings) return { type: 'full' };
      return { type: 'noop' };
    }
    switch (t.kind) {
      case 'cone':
        this.cone = t.id;
        this.goto('scoops');
        return { type: 'cone', id: t.id };
      case 'flavour':
        this.scoops.push(t.id);
        if (this.scoops.length >= SCOOPS.maxScoops) this.selected = this.tiles().length - 1; // on "next"
        return { type: 'scoop', id: t.id, count: this.scoops.length };
      case 'sauce':
        this.sauce = t.id;
        this.goto('toppings');
        return { type: 'sauce', id: t.id };
      case 'topping':
        this.toppings.push(t.id);
        if (this.toppings.length >= SCOOPS.maxToppings) this.selected = this.tiles().length - 1;
        return { type: 'topping', id: t.id };
      case 'jar':
        return this.pickJar(t.index);
      case 'next':
        return this.next();
    }
  }

  private pickJar(index: number): ChooseResult {
    if (index === this.secretJar) {
      this.secret = true;
      this.secretJar = -1;
      return { type: 'jarRight', index };
    }
    this.jarTries++;
    this.openJars.push(index);
    // The secret hops to another closed jar (the weak eye sees it move).
    const closed = Array.from({ length: SCOOPS.jars }, (_, i) => i).filter((i) => i !== this.secretJar && !this.openJars.includes(i));
    if (closed.length && this.jarTries < SCOOPS.jarTries) this.secretJar = pick(closed, this.r);
    if (this.jarTries >= SCOOPS.jarTries) this.secretJar = -1; // the jars close for this cone
    return { type: 'jarWrong', index, movedTo: this.secretJar };
  }

  /** Go to the next stage (the "next"/"eat" tile, or the E key). */
  next(): ChooseResult {
    switch (this.stage) {
      case 'cone':
        return { type: 'noop' };
      case 'scoops':
        return this.scoops.length ? this.goto('sauce') : { type: 'noop' };
      case 'sauce':
        return this.goto('toppings');
      case 'toppings':
        return this.goto('eat');
      case 'eat':
        return { type: 'noop' };
    }
  }

  /** The top `n` scoops fell off (topple). Toppings/sauce sat on top, so they go too. */
  dropTop(n: number): void {
    this.scoops.splice(Math.max(0, this.scoops.length - n));
    if (this.stage === 'scoops' && this.scoops.length < SCOOPS.maxScoops) {
      const i = this.tiles().findIndex((t) => t.kind === 'next');
      if (this.selected === i) this.selected = 0;
    }
  }

  snapshot(): BuildSnapshot {
    return {
      stage: this.stage,
      cone: this.cone,
      scoops: [...this.scoops],
      sauce: this.sauce,
      toppings: [...this.toppings],
      secret: this.secret,
      secretJar: this.secretJar,
      jarTries: this.jarTries,
      openJars: [...this.openJars],
      selected: this.selected,
    };
  }
}

// ───────────────────────────── Tickets and prizes ─────────────────────────────

export type TicketCheck = { ok: true; price: number; free: boolean } | { ok: false; need: number };

/**
 * First cone of the session is free; later ones cost a ticket. No economy (wallet undefined) =
 * always free. A child who can't pay is told how many gems are missing (other rides stay open).
 */
export function ticketFor(conesThisSession: number, wallet: number | undefined): TicketCheck {
  if (wallet === undefined || conesThisSession === 0) return { ok: true, price: 0, free: true };
  if (wallet >= SCOOPS.ticket) return { ok: true, price: SCOOPS.ticket, free: false };
  return { ok: false, need: SCOOPS.ticket - Math.max(0, wallet) };
}

export interface ConeResult {
  gems: number;
  stars: number;
  recipe: boolean;
  secret: boolean;
  tower: boolean;
}

/** Gems and stars for an eaten cone. */
export function scoreCone(b: Readonly<BuildSnapshot>, recipe: Readonly<Recipe> | null): ConeResult {
  const isRecipe = !!recipe && matchesRecipe(b, recipe);
  const tower = b.scoops.length >= SCOOPS.maxScoops;
  const gems = SCOOPS.prizeCone + (isRecipe ? SCOOPS.prizeRecipe : 0) + (b.secret ? SCOOPS.prizeSecret : 0);
  const stars = Math.min(3, 1 + (isRecipe ? 1 : 0) + (b.secret || tower ? 1 : 0));
  return { gems, stars, recipe: isRecipe, secret: b.secret, tower };
}
