/**
 * Registry of the glasses-play mechanics, in site order (`SITE_PLANS` in ./sites.ts uses the same
 * ids). `pictos` are the board's 2–3 wordless panels, read left to right.
 */
import type { GlassesKind } from '../../types';
import * as dotsigns from './dotsigns';
import * as gates from './gates';
import * as glowflies from './glowflies';
import * as lineup from './lineup';
import * as oddone from './oddone';
import * as toys from './toys';
import type { GlassesPicto } from './pictos';
import type { MechanicFactory } from './types';

export interface MechanicDef {
  id: string;
  kind: GlassesKind;
  pictos: readonly GlassesPicto[];
  create: MechanicFactory;
}

export const MECHANICS: readonly MechanicDef[] = [
  // Catch the drifting weak-eye fireflies by running through them → gems.
  { id: 'glowflies', kind: 'follow', pictos: ['firefly', 'run', 'gems'], create: glowflies.create },
  // Three weak-eye shapes: press the button under the different one → gems.
  { id: 'oddone', kind: 'tellApart', pictos: ['odd', 'press', 'gems'], create: oddone.create },
  // Stand on the pad, put the weak-eye magic ring over the strong-eye bubble and press → it pops → gems.
  { id: 'lineup', kind: 'lineUp', pictos: ['pad', 'hoop', 'gems'], create: lineup.create },
  // Follow the weak-eye paw prints to Pip's lost toy → gems.
  { id: 'toys', kind: 'follow', pictos: ['paw', 'toy', 'gems'], create: toys.create },
  // Two halves (one per eye) show which of three arches to run through → gems.
  { id: 'gates', kind: 'lineUp', pictos: ['halves', 'arches', 'gems'], create: gates.create },
  // The hidden shape of the dot picture is the answer on the three-button pedestal → gems.
  { id: 'dotsigns', kind: 'popOut', pictos: ['dots', 'press', 'gems'], create: dotsigns.create },
];
