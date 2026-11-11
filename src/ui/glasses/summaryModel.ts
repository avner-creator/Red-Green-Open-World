/** Pure grouping and formatting for the grown-up "Session summary": plain counts, nothing else. */
import type { GlassesKind, GlassesSummary, GlassesTally } from '../../types';

/** Display order and plain labels of the kinds of glasses play. */
export const KIND_ORDER: readonly GlassesKind[] = ['find', 'follow', 'read', 'tellApart', 'timeIt', 'lineUp', 'popOut', 'onHero'];
export const KIND_LABEL: Record<GlassesKind, string> = {
  find: 'Find',
  follow: 'Follow',
  read: 'Read',
  tellApart: 'Tell apart',
  timeIt: 'Time it',
  lineUp: 'Line up',
  popOut: 'Pop-out pictures',
  onHero: 'On the hero',
};
export const TIER_LABEL = ['Easy', 'Medium', 'Tricky'] as const;
export const EMPTY_TEXT = 'Nothing to show yet — play a session first.';

const KNOWN_NAMES: Record<string, string> = {
  gems: 'Glow gems',
  chestkeys: 'Chest keys',
  chests: 'Chests',
  glowflies: 'Glow-flies',
  toys: "Pip's lost toys",
  oddone: 'Odd one out',
  oddoneout: 'Odd one out',
  lineup: 'Line-up bubbles',
  gates: 'Half-symbol gates',
  dotsigns: 'Dot pictures',
};

/** `glowflies` -> "Glow-flies", `oddOneOut` -> "Odd one out", unknown `some_thing` -> "Some Thing". */
export function mechanicName(id: string): string {
  const known = KNOWN_NAMES[id.replace(/[\s_-]/g, '').toLowerCase()];
  if (known) return known;
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (!words.length) return 'Other';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface Cell {
  hits: number;
  tries: number;
  /** Whole percent, or null when there were no tries. */
  rate: number | null;
  /** "3 / 5" */
  counts: string;
  /** "60%" or an en dash */
  rateText: string;
}

export function makeCell(hits: number, misses: number): Cell {
  const h = Math.max(0, Math.round(hits));
  const tries = h + Math.max(0, Math.round(misses));
  const rate = tries > 0 ? Math.round((h / tries) * 100) : null;
  return { hits: h, tries, rate, counts: `${h} / ${tries}`, rateText: rate === null ? '–' : `${rate}%` };
}

export interface MechanicRow {
  mechanic: string;
  name: string;
  tiers: [Cell, Cell, Cell];
  total: Cell;
}
export interface KindGroup {
  kind: string;
  label: string;
  rows: MechanicRow[];
}
export interface SummaryModel {
  empty: boolean;
  time: string;
  challenge: string;
  groups: KindGroup[];
  tiers: [Cell, Cell, Cell];
  total: Cell;
}

export function formatChallenge(c: GlassesSummary['challenge'] | undefined): string {
  if (!c || !c.enabled) return 'Off';
  return `On · step ${Math.round(c.level)} of ${Math.round(c.maxLevel)} · ${c.stepsUp} up, ${c.stepsDown} down`;
}

type Pair = [number, number];

export function buildSummary(s: GlassesSummary | null | undefined): SummaryModel {
  const rows: readonly GlassesTally[] = s?.rows ?? [];
  const kinds = new Map<string, Map<string, [Pair, Pair, Pair]>>();
  for (const r of rows) {
    const t = Math.min(3, Math.max(1, Math.round(r.tier))) - 1;
    let mech = kinds.get(r.kind);
    if (!mech) kinds.set(r.kind, (mech = new Map()));
    let tiers = mech.get(r.mechanic);
    if (!tiers) mech.set(r.mechanic, (tiers = [[0, 0], [0, 0], [0, 0]]));
    const cell = tiers[t] as Pair;
    cell[0] += r.hits;
    cell[1] += r.misses;
  }
  const known = KIND_ORDER as readonly string[];
  const order = [...known.filter((k) => kinds.has(k)), ...[...kinds.keys()].filter((k) => !known.includes(k))];
  const sum: [Pair, Pair, Pair] = [[0, 0], [0, 0], [0, 0]];
  const groups: KindGroup[] = order.map((kind) => {
    const mech = kinds.get(kind) as Map<string, [Pair, Pair, Pair]>;
    const list: MechanicRow[] = [...mech.entries()]
      .map(([mechanic, t]) => {
        t.forEach((v, i) => {
          (sum[i] as Pair)[0] += v[0];
          (sum[i] as Pair)[1] += v[1];
        });
        return {
          mechanic,
          name: mechanicName(mechanic),
          tiers: t.map((v) => makeCell(v[0], v[1])) as [Cell, Cell, Cell],
          total: makeCell(t[0][0] + t[1][0] + t[2][0], t[0][1] + t[1][1] + t[2][1]),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { kind, label: (KIND_LABEL as Record<string, string>)[kind] ?? mechanicName(kind), rows: list };
  });
  return {
    empty: groups.length === 0,
    time: formatTime(s?.seconds ?? 0),
    challenge: formatChallenge(s?.challenge),
    groups,
    tiers: sum.map((v) => makeCell(v[0], v[1])) as [Cell, Cell, Cell],
    total: makeCell(sum[0][0] + sum[1][0] + sum[2][0], sum[0][1] + sum[1][1] + sum[2][1]),
  };
}
