/**
 * Super powers: the pool a hero picks from on the hero-select screen (one at a time, on the skill
 * button). Pure data + rules + the saved choice; no three.js.
 *
 * - The five classic skills (`SkillId`) run in the player's own `SkillMachine`. A hero who picks
 *   one of them simply gets that skill (the catalog's `skill` follows the choice).
 * - The extra powers (rocket boots, bounce ball, giant, rainbow slide, bubble shield) run in
 *   `skills-extra.ts` through `PlayerApi` hooks; while one is chosen the SkillMachine hands its
 *   button to them (`setExtraPowerHook`).
 *
 * Every hero has three free powers (its signature first); the rest are earned by collecting gems
 * (lifetime total, never spent) — all within the first few minutes of play.
 */
import type { SkillId } from '../types';

export type ExtraPowerId = 'rocketBoots' | 'bounceBall' | 'giant' | 'rainbowSlide' | 'bubbleShield';
export type PowerId = SkillId | ExtraPowerId;

export interface PowerDef {
  readonly id: PowerId;
  /** Big short label (UI). */
  readonly name: string;
  /** Lifetime gems that unlock it for heroes that don't have it free. */
  readonly earnAt: number;
  /** Seconds of cooldown after use (HUD ring). */
  readonly cooldown: number;
}

export const POWERS: readonly PowerDef[] = [
  { id: 'doubleJump', name: 'Double Jump', earnAt: 10, cooldown: 0.2 },
  { id: 'superBounce', name: 'Super Jump', earnAt: 10, cooldown: 0.8 },
  { id: 'dash', name: 'Speed Dash', earnAt: 10, cooldown: 1.5 },
  { id: 'glide', name: 'Glide', earnAt: 15, cooldown: 0.25 },
  { id: 'groundPound', name: 'Shockwave', earnAt: 15, cooldown: 0.5 },
  { id: 'rocketBoots', name: 'Rocket Boots', earnAt: 20, cooldown: 1.2 },
  { id: 'bounceBall', name: 'Bounce Ball', earnAt: 20, cooldown: 3 },
  { id: 'giant', name: 'Giant', earnAt: 25, cooldown: 3 },
  { id: 'rainbowSlide', name: 'Rainbow Slide', earnAt: 25, cooldown: 2.5 },
  { id: 'bubbleShield', name: 'Bubble', earnAt: 30, cooldown: 4 },
];

export const POWER_IDS: readonly PowerId[] = POWERS.map((p) => p.id);
const NATIVE = new Set<string>(['doubleJump', 'glide', 'dash', 'superBounce', 'groundPound']);

export function isNativePower(id: PowerId): id is SkillId {
  return NATIVE.has(id);
}

export function getPower(id: PowerId): PowerDef {
  const p = POWERS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown power ${id}`);
  return p;
}

/** Minimal hero view (avoids importing the catalog: the catalog imports this file). */
export interface PowerHero {
  readonly id: string;
  /** Signature skill. */
  readonly signature: SkillId;
  /** The two extra free picks. */
  readonly freePowers: readonly [PowerId, PowerId];
}

/** The hero's three free powers, signature first. */
export function freePowers(h: PowerHero): PowerId[] {
  return [h.signature, ...h.freePowers.filter((p) => p !== h.signature)];
}

export type PowerState = 'free' | 'earned' | 'locked';

/** Is `power` usable by this hero after `lifetimeGems` collected gems? */
export function powerState(h: PowerHero, power: PowerId, lifetimeGems: number): PowerState {
  if (freePowers(h).includes(power)) return 'free';
  return lifetimeGems >= getPower(power).earnAt ? 'earned' : 'locked';
}

/** The hero's power list for the select screen: free ones first, then the rest by unlock order. */
export function powersFor(h: PowerHero): PowerId[] {
  const free = freePowers(h);
  const rest = POWERS.filter((p) => !free.includes(p.id))
    .slice()
    .sort((a, b) => a.earnAt - b.earnAt)
    .map((p) => p.id);
  return [...free, ...rest];
}

// ── saved choice per hero ──

/** localStorage key for the per-hero power picks (`{ heroId: powerId }`). */
export const POWER_KEY = 'rgow.powers.v1';

export interface PowerStore {
  load(): Record<string, string>;
  save(all: Record<string, string>): void;
}

const localStore: PowerStore = {
  load() {
    try {
      const raw = localStorage.getItem(POWER_KEY);
      const v: unknown = raw ? JSON.parse(raw) : {};
      return v && typeof v === 'object' ? (v as Record<string, string>) : {};
    } catch {
      return {};
    }
  },
  save(all) {
    try {
      localStorage.setItem(POWER_KEY, JSON.stringify(all));
    } catch {
      /* storage blocked: the pick lasts until reload */
    }
  },
};

let store: PowerStore = localStore;
let cache: Record<string, string> | null = null;
const listeners = new Set<(heroId: string, power: PowerId) => void>();

/** Plug in another store (tests, or the profile later). null = localStorage. */
export function setPowerStore(s: PowerStore | null): void {
  store = s ?? localStore;
  cache = null;
}

function all(): Record<string, string> {
  if (!cache) cache = { ...store.load() };
  return cache;
}

/** The hero's chosen power (its signature when nothing valid is saved). */
export function chosenPower(h: PowerHero): PowerId {
  const v = all()[h.id];
  return v && (POWER_IDS as readonly string[]).includes(v) ? (v as PowerId) : h.signature;
}

/** Save a pick (no ownership check here: the select screen only offers usable powers). */
export function choosePower(heroId: string, power: PowerId): void {
  const a = all();
  a[heroId] = power;
  store.save(a);
  for (const fn of listeners) fn(heroId, power);
}

/** Called after every `choosePower`. Returns an unsubscriber. */
export function onPowerChosen(fn: (heroId: string, power: PowerId) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The classic skill the player's SkillMachine should run for this hero (signature for extras). */
export function nativeSkillFor(h: PowerHero): SkillId {
  const p = chosenPower(h);
  return isNativePower(p) ? p : h.signature;
}
