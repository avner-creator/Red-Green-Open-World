/**
 * Fun Pass (stamp card) rules, pure: which stamp an event earns and the prize milestones.
 * There are no dedicated "attraction done" events yet, so stamps are derived from existing ones:
 * a ticket (the attraction was started), a stunt (attributed to the nearest candidate attraction),
 * driving / riding, a weak-eye mini-game hit, a chest opened.
 */
import type { AnchorName, PlayerMode, StuntKind, TicketKind } from '../types';

/** A stamp slot id: an attraction anchor, a glasses mini-game site id, or 'chest'. */
export type StampId = string;

export const CHEST_STAMP = 'chest';

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
  foam: 'foamCourse', plane: 'airstrip', dragon: 'dragonRoost', race: 'raceStart', scoops: 'iceCream',
};

/** Candidate attractions per stunt kind; with more than one, the nearest to the player wins. */
const STUNT_STAMP: Record<StuntKind, readonly AnchorName[]> = {
  bigBounce: ['trampoline'],
  bigAir: ['bouncePads', 'sillyZone', 'trampoline'],
  longGlide: ['balloon'],
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
