/**
 * Every fixed line Pip can say aloud (pure data, no DOM). `scripts/gen-pip-voice.mjs` renders one
 * voice clip per entry into `public/assets/voice/`, and the runtime finds a clip by `clipId(text)`.
 * Lines built from numbers (missions, "Need 3 more gems!") are listed for the values the game
 * actually uses; anything else falls back to the browser's on-device speech at runtime.
 */
import { MISSION_POOL } from '../activities/economy/missions';
import type { MissionState } from '../types';
import { EARN_GOAL, missionGoal } from './goals';
import { ATTRACTIONS, CHEST, CHUTE, COUNT, ECON, EXPLAIN, FOLLOW_AGAIN, HOWTO, INTRO, POOLS, RESCUE, RETURNING, STORY, SUNSET, TIPS, follow, needGems, skillTip, suggest } from './script';
import type { ScriptLine } from './script';
import type { Attraction } from './types';

/** Largest "Need N more gems!" with its own clip (bigger numbers use on-device speech). */
export const NEED_GEMS_MAX = 12;

export interface VoiceLine {
  /** Clip id (file name stem), from `clipId(text)`. */
  id: string;
  /** What the bubble shows. */
  text: string;
  /** What the voice says (may differ: "MEGA" → "Mega", "x3 combo" → "3 gem combo"). */
  spoken: string;
}

/** Stable clip id for a line's text: lower-case words joined by dashes ("hi-i-am-pip"). */
export function clipId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Text tuned for the ear: the bubble text is shown as is, the voice says this. */
export function spokenText(text: string): string {
  return text
    .replace(/\bMEGA\b/g, 'Mega')
    .replace(/\bx(\d+) combo\b/g, '$1 gem combo')
    .replace(/’/g, "'")
    .replace(/\.\.\./g, ',')
    .trim();
}

const KEYS = { use: 'E', jump: 'Space', skill: 'Q' };

/** Every mission line the economy can hand out (fixed targets from its pool). */
function missionLines(): ScriptLine[] {
  return MISSION_POOL.map((d, i): MissionState => ({ id: `m${i}`, kind: d.kind, icon: d.icon, target: d.target, reward: d.reward, progress: 0, done: false })).map(
    (m) => missionGoal(m).line,
  );
}

export function allVoiceLines(): VoiceLine[] {
  const names = Object.keys(ATTRACTIONS) as Attraction[];
  const lines: string[] = [
    // The welcome story first: `voice.ts` prefetches clips in this order.
    ...STORY.map((l) => l.text),
    ...Object.values(INTRO).map((l) => l.text),
    ...HOWTO.trampoline.map((l) => l.text),
    ...FOLLOW_AGAIN,
    RETURNING.text,
    RESCUE.text,
    ...Object.values(ECON).map((l) => l.text),
    ...Object.values(HOWTO).flatMap((ls) => ls.map((l) => l.text)),
    ...Object.values(TIPS).map((l) => l.text),
    ...Object.values(EXPLAIN).map((l) => l?.text ?? ''),
    ...names.map((a) => suggest(a).text),
    ...names.map((a) => follow(a).text),
    ...Object.values(CHEST).map((l) => l.text),
    CHUTE(KEYS).text,
    skillTip('Q').text,
    ...Object.values(POOLS).flatMap((ls) => ls.map((l) => l.text)),
    ...COUNT,
    SUNSET.text,
    ...Array.from({ length: NEED_GEMS_MAX }, (_, i) => needGems(i + 1).text),
    ...missionLines().map((l) => l.text),
    'Open a treasure chest!',
    `Earn ${EARN_GOAL} gems today!`,
    'You rock! Play anything!',
  ];
  const seen = new Map<string, VoiceLine>();
  for (const text of lines) {
    if (!text) continue;
    const id = clipId(text);
    if (!seen.has(id)) seen.set(id, { id, text, spoken: spokenText(text) });
  }
  return [...seen.values()];
}
