/**
 * Registry of the weave parts, in creation/update order. Ids are the folder names; see
 * `./README.md` for what each one hooks into.
 */
import type { GlassesKind } from '../../../types';
import * as boost from './boost';
import * as bounce from './bounce';
import * as chute from './chute';
import * as fakes from './fakes';
import * as hero from './hero';
import * as shack from './shack';
import type { WeaveFactory } from './types';

export interface WeavePartDef {
  id: string;
  kind: GlassesKind;
  create: WeaveFactory;
}

export const WEAVE_PARTS: readonly WeavePartDef[] = [
  // Weak-eye perfect-bounce timing ring on the giant trampoline.
  { id: 'bounce', kind: 'timeIt', create: bounce.create },
  // Weak-eye parachute-open ring in the skydive + weak-eye gem through a strong-eye hoop (lineUp).
  { id: 'chute', kind: 'timeIt', create: chute.create },
  // Weak-eye skill-ready ring and combo number over the hero.
  { id: 'hero', kind: 'onHero', create: hero.create },
  // Weak-eye boost-pad timing on the buggy race.
  { id: 'boost', kind: 'timeIt', create: boost.create },
  // The real gem among weak-eye fakes at a few gem spots.
  { id: 'fakes', kind: 'tellApart', create: fakes.create },
  // A dot-picture prize code at the Gear Shack.
  { id: 'shack', kind: 'popOut', create: shack.create },
];
