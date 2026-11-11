/**
 * Fun Pass (stamp card) rules, pure: which stamp an event earns and the prize milestones.
 * Attractions with a clean "round done" point emit `stamp:earned` themselves (`EXPLICIT_STAMPS`).
 * For the rest, stamps are still derived from existing events: a ticket (the attraction was
 * started), a stunt (attributed to the nearest candidate attraction), driving / riding, a weak-eye
 * mini-game hit.
 */
import type { AnchorName, PlayerMode, StuntKind, TicketKind } from '../types';

/** A stamp slot id: an attraction anchor, a glasses mini-game site id, or 'chest'. */
export type StampId = string;

export const CHEST_STAMP = 'chest';

/**
 * Stamps earned only through `stamp:earned` (emitted by the attraction when a round is done). The
 * ticket / stunt derivation skips these, so the stamp lands on completion, not at the start.
 */
export const EXPLICIT_STAMPS: ReadonlySet<StampId> = new Set([
  CHEST_STAMP, 'carnivalRow', 'raceStart', 'iceCream', 'foamCourse', 'bubbleArena', 'dinoRing', 'launchPads',
  'sillyZone', 'secrets', 'airstrip', 'dragonRoost',
]);

/** A derived (fallback) stamp, or null when that stamp comes from `stamp:earned` only. */
export function derived(id: StampId | null): StampId | null {
  return id && !EXPLICIT_STAMPS.has(id) ? id : null;
}

/** Prize milestones: stamps needed → gems paid. The last one is the grand prize. */
export const PASS_PRIZES: readonly { at: number; gems: number }[] = [
  { at: 3, gems: 5 },
  { at: 6, gems: 10 },
  { at: 10, gems: 15 },
  { at: 15, gems: 25 },
];
/** Grand prize for a full card. */
export const GRAND_PRIZE = 60;

const TICKET_STAMP: Record<TicketKind, AnchorName> = {
  balloon: 'balloon', rocketPad: 'launchPads', bubbleBall: 'bubbleArena', dinoSumo: 'dinoRing', carnival: 'carnivalRow',
  foam: 'foamCourse', plane: 'airstrip', dragon: 'dragonRoost', race: 'raceStart', scoops: 'iceCream', silly: 'sillyZone',
};

/** Every ticket kind (for the one-slot-one-way check). */
export const TICKET_KINDS = Object.keys(TICKET_STAMP) as TicketKind[];

/**
 * Candidate attractions per stunt kind; with more than one, the nearest to the player wins. Each
 * derived slot has exactly one way in: the balloon stamps on its ticket (not the glide after it),
 * the trampoline on a big bounce (not big air). A stunt that comes with its own `stamp:earned`
 * (Silly Zone, secrets pedestal and vault, rocket…) never stamps anything else (`StuntDeferral`).
 */
export const STUNT_STAMP: Record<StuntKind, readonly AnchorName[]> = {
  bigBounce: ['trampoline'],
  bigAir: ['bouncePads'],
  longGlide: [],
  bullseye: ['landingRings'],
  bungee: ['bungee'],
  launch: ['launchPads', 'raceStart'],
  carnival: ['carnivalRow'],
  scoops: ['iceCream'],
  race: ['raceStart'],
  sky: ['airstrip', 'dragonRoost'],
  bumper: ['bubbleArena', 'dinoRing'],
  foam: ['foamCourse'],
};

export function ticketStamp(kind: TicketKind): StampId {
  return TICKET_STAMP[kind];
}

/**
 * Stunts are derived one microtask late: an attraction that emits `stunt` and then its own
 * `stamp:earned` in the same call (secrets pedestal `bigAir`, vault `bullseye`, Silly Zone…) gets
 * only its own stamp, never a nearby trampoline or landing-rings stamp.
 */
export class StuntDeferral {
  private seq = 0;
  constructor(private readonly schedule: (fn: () => void) => void = (fn) => queueMicrotask(fn)) {}
  /** Call on every `stamp:earned`. */
  noteStamp(): void {
    this.seq++;
  }
  /** Call on every `stunt`: `apply` runs later unless a stamp was earned in between. */
  stunt(apply: () => void): void {
    const at = this.seq;
    this.schedule(() => {
      if (this.seq === at) apply();
    });
  }
}

/**
 * How a slot can be earned: 'explicit' (its own `stamp:earned`), `ticket:<kind>`, `stunt:<kind>`,
 * `mode:<mode>` or 'glasses' (a hit at that weaker-eye site).
 */
export function earnWays(id: StampId, glassesSites: readonly string[]): string[] {
  if (EXPLICIT_STAMPS.has(id)) return ['explicit'];
  const ways: string[] = [];
  for (const k of TICKET_KINDS) if (TICKET_STAMP[k] === id) ways.push(`ticket:${k}`);
  for (const [k, ids] of Object.entries(STUNT_STAMP)) if ((ids as readonly string[]).includes(id)) ways.push(`stunt:${k}`);
  for (const m of ['driving', 'riding'] as const) if (modeStamp(m) === id) ways.push(`mode:${m}`);
  if (glassesSites.includes(id)) ways.push('glasses');
  return ways;
}

export function modeStamp(mode: PlayerMode): StampId | null {
  return mode === 'driving' ? 'garage' : mode === 'riding' ? 'ranch' : null;
}

/** The stamp a stunt earns: the nearest candidate (by XZ distance) that is on the card. */
export function stuntStamp(
  kind: StuntKind,
  at: { x: number; z: number },
  where: (id: AnchorName) => { x: number; z: number } | null,
  onCard: (id: StampId) => boolean,
): StampId | null {
  let best: StampId | null = null;
  let bestD = Infinity;
  for (const id of STUNT_STAMP[kind] ?? []) {
    if (!onCard(id)) continue;
    const p = where(id);
    const d = p ? Math.hypot(p.x - at.x, p.z - at.z) : 1e6;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/** Gems paid when the stamp count goes from `before` to `after` on a card of `total` slots. */
export function prizeFor(before: number, after: number, total: number): number {
  let gems = 0;
  for (const p of PASS_PRIZES) if (p.at < total && before < p.at && after >= p.at) gems += p.gems;
  if (total > 0 && before < total && after >= total) gems += GRAND_PRIZE;
  return gems;
}

/** Milestone positions on the progress track (stamp counts), the full card last. */
export function milestones(total: number): number[] {
  const out = PASS_PRIZES.map((p) => p.at).filter((n) => n < total);
  if (total > 0) out.push(total);
  return out;
}

/** The next milestone above `count` (null once the card is full). */
export function nextMilestone(count: number, total: number): number | null {
  for (const m of milestones(total)) if (m > count) return m;
  return null;
}
