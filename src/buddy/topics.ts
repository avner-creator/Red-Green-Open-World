/** Which spoken how-to belongs to a use prompt (pure). */
import { BOOTHS } from './script';
import type { Booth, HowToTopic } from './script';

/** The how-to topic of a use prompt (`Interactable.id`), if Pip has one for it. */
export function topicOfPrompt(id: string, isHorse = false): HowToTopic | null {
  if (id.startsWith('carnival-')) {
    const b = id.slice('carnival-'.length);
    return (BOOTHS as readonly string[]).includes(b) ? (`booth:${b as Booth}` as const) : 'carnivalRow';
  }
  if (id.startsWith('vault-')) return 'vault';
  if (/^chest\d/.test(id)) return 'chest';
  if (id.startsWith('vehicle:')) return isHorse ? 'ranch' : 'garage';
  if (id.startsWith('glasses-oddone')) return 'oddone';
  if (id.startsWith('glasses-dotsigns')) return 'dotsigns';
  const map: Record<string, HowToTopic> = {
    workshop: 'workshop', gearShack: 'gearShack', 'race-booth': 'raceStart', 'scoops-counter': 'iceCream', 'foam-lava': 'foamCourse',
    bubbleball: 'bubbleArena', dinosumo: 'dinoRing', 'sky-plane': 'airstrip', 'sky-dragon': 'dragonRoost', bungee: 'bungee',
    balloon: 'balloon', 'glasses-lineup-pad': 'lineup',
  };
  return map[id] ?? null;
}
