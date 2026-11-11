/**
 * The one list of attractions the wayfinding points at: anchor, pictogram, sign/beacon colours,
 * beacon tether spot and the optional "how to play" board. The fingerposts, beacon balloons and
 * (through `COMPASS_ATTRACTIONS`) the HUD compass all read this, so a new attraction is one entry here.
 * Pure data, no WebGL.
 */
import type { AnchorName } from '../types';
import { FIXED_SITES } from '../activities/glasses/sites';
import { GLASSES } from '../activities/glasses/constants';
import { ANCHORS } from './layout';
import type { IconId, PanelId } from './pictograms';

export interface Attraction {
  anchor: AnchorName;
  icon: IconId;
  /** Dark arm/board colour (signs) and bright balloon colour (beacon). */
  arm: number;
  balloon: number;
  panels: PanelId[];
  /** Beacon tether stake (x, z) and balloon height above it. */
  beacon: { x: number; z: number; h: number };
  /** How-to board: centre and the point it faces (NaN = none). */
  board: { x: number; z: number; faceX: number; faceZ: number };
}

const NO_BOARD = { x: NaN, z: NaN, faceX: 0, faceZ: 0 };

export const ATTRACTIONS: readonly Attraction[] = [
  {
    anchor: 'trampoline', icon: 'iTrampoline', arm: 0x8a2c22, balloon: 0xe0513a, panels: ['tramp1', 'tramp2', 'tramp3'],
    beacon: { x: 62, z: -37.5, h: 12 }, board: { x: 37.5, z: -25.5, faceX: 28, faceZ: -14 },
  },
  {
    anchor: 'bouncePads', icon: 'iBounce', arm: 0x1c6660, balloon: 0x22a89a, panels: ['bounce1', 'bounce2'],
    beacon: { x: 97, z: -14, h: 12 }, board: { x: 66, z: -3, faceX: 66, faceZ: 10 },
  },
  {
    anchor: 'garage', icon: 'iCar', arm: 0x20437a, balloon: 0x2f72d8, panels: ['car1', 'car2', 'car3'],
    beacon: { x: 50, z: 40, h: 13 }, board: { x: 22.5, z: 18, faceX: 22.5, faceZ: 4 },
  },
  {
    anchor: 'launchPads', icon: 'iRocket', arm: 0x86285a, balloon: 0xe04a86, panels: ['rocket1', 'rocket2', 'rocket3'],
    beacon: { x: 93, z: 31, h: 12 }, board: { x: 64.5, z: 20.5, faceX: 57, faceZ: 28 },
  },
  {
    anchor: 'balloon', icon: 'iBalloon', arm: 0x553082, balloon: 0x8d55d6, panels: ['balloon1', 'balloon2', 'balloon3'],
    beacon: { x: 96, z: 81, h: 18 }, board: { x: 90.5, z: 50.8, faceX: 86, faceZ: 40 },
  },
  {
    anchor: 'landingRings', icon: 'iTarget', arm: 0x7a5410, balloon: 0xf0b030, panels: [],
    beacon: { x: 148, z: 6, h: 22 }, board: NO_BOARD,
  },
  // ── Outer areas (stream G) ──
  {
    anchor: 'ranch', icon: 'iHorse', arm: 0x6b3f1e, balloon: 0xe08a2e, panels: ['horse1', 'horse2', 'horse3'],
    beacon: { x: -46, z: 52, h: 13 }, board: { x: -46, z: 38, faceX: -36, faceZ: 24 },
  },
  {
    anchor: 'bungee', icon: 'iBungee', arm: 0x2f5418, balloon: 0x7cc243, panels: ['bungee1', 'bungee2'],
    beacon: { x: -12, z: -84, h: 14 }, board: { x: 12, z: -87.2, faceX: 12, faceZ: -78 },
  },
  {
    anchor: 'sillyZone', icon: 'iSilly', arm: 0x7a1f6a, balloon: 0xf060c8, panels: ['silly1', 'silly2'],
    beacon: { x: -22, z: 112, h: 13 }, board: { x: -3, z: 71, faceX: -1, faceZ: 60 },
  },
  { anchor: 'lakePlatform', icon: 'iLake', arm: 0x14506e, balloon: 0x2fb8e8, panels: [], beacon: { x: -110, z: 2, h: 14 }, board: NO_BOARD },
  { anchor: 'lighthouse', icon: 'iLighthouse', arm: 0x232c6e, balloon: 0x5468e0, panels: [], beacon: { x: -48, z: -124, h: 22 }, board: NO_BOARD },
  // ── Carnival Island ──
  { anchor: 'carnivalRow', icon: 'iCarnival', arm: 0x8a2440, balloon: 0xf05a78, panels: [], beacon: { x: 33, z: -58, h: 14 }, board: NO_BOARD },
  { anchor: 'iceCream', icon: 'iIceCream', arm: 0x7a3a62, balloon: 0xf4a0c8, panels: [], beacon: { x: 31.5, z: -8.5, h: 11 }, board: NO_BOARD },
  { anchor: 'bubbleArena', icon: 'iBubble', arm: 0x1d5a7a, balloon: 0x4cc0ee, panels: [], beacon: { x: 49.5, z: 62, h: 12 }, board: NO_BOARD },
  { anchor: 'dinoRing', icon: 'iDino', arm: 0x3d6a1c, balloon: 0x9ccc3a, panels: [], beacon: { x: 13, z: 70, h: 11 }, board: NO_BOARD },
  { anchor: 'raceStart', icon: 'iFlag', arm: 0x2a2d34, balloon: 0x30343c, panels: [], beacon: { x: 38.5, z: 6.5, h: 12 }, board: NO_BOARD },
  { anchor: 'foamCourse', icon: 'iFoam', arm: 0x1d6464, balloon: 0x3cc4c0, panels: [], beacon: { x: -35.5, z: -15.5, h: 13 }, board: NO_BOARD },
  { anchor: 'airstrip', icon: 'iPlane', arm: 0x8a4a14, balloon: 0xe8742a, panels: [], beacon: { x: -26, z: 63, h: 14 }, board: NO_BOARD },
  { anchor: 'dragonRoost', icon: 'iDragon', arm: 0x245c48, balloon: 0x58c49a, panels: [], beacon: { x: -25, z: -122, h: 14 }, board: NO_BOARD },
];

// ───────────────────────────── glasses-play sites ─────────────────────────────

/**
 * The six glasses-play mini-games (`src/activities/glasses/`). They are not world anchors (the site
 * table is theirs: `FIXED_SITES`), but they get the same wayfinding as an attraction: a beacon
 * balloon, a pictogram, fingerpost arms and a compass marker. All of it is both-eye and points at
 * the site only, never at a weak-eye object inside it.
 */
export type GlassesSiteId = 'glowflies' | 'oddone' | 'lineup' | 'toys' | 'gates' | 'dotsigns';
/** Anything a fingerpost arm can point at. */
export type WayTarget = AnchorName | GlassesSiteId;

export interface GlassesWay {
  id: GlassesSiteId;
  icon: IconId;
  arm: number;
  balloon: number;
  /** Site centre and facing (local +Z = approach). */
  x: number;
  z: number;
  yaw: number;
  /** Clear circle: the site radius, or the area the mini-game uses beyond it (glow-flies). */
  r: number;
  beacon: { x: number; z: number; h: number };
  /** Stepping-stone trail from the nearest road (the two sites nearest spawn). */
  trail: boolean;
}

/** `turn`: the beacon's bearing from the site centre, relative to straight behind (radians). */
const GLASSES_STYLE: Record<GlassesSiteId, { icon: IconId; balloon: number; trail?: boolean; turn?: number }> = {
  glowflies: { icon: 'iGlowflies', balloon: 0xf0c832 },
  oddone: { icon: 'iOddone', balloon: 0xee6a4a, trail: true },
  lineup: { icon: 'iLineup', balloon: 0x5cc8f0 },
  toys: { icon: 'iToys', balloon: 0xc88a50, trail: true },
  gates: { icon: 'iGates', balloon: 0xa070e8 },
  // Straight behind is the park path; the beacon goes to the north-west, clear of it and the signs.
  dotsigns: { icon: 'iDotsigns', balloon: 0x6ed07a, turn: (Math.PI * 3) / 4 },
};
/** One arm colour for the whole family (deep indigo), so the glasses arms read as a set. */
const GLASSES_ARM = 0x2e2a6a;

/** The beacon stands behind the site (away from the approach), this far outside its clear circle. */
const GLASSES_BEACON_OUT = 3;

export const GLASSES_WAY: readonly GlassesWay[] = FIXED_SITES.filter((f): f is typeof f & { id: GlassesSiteId } => f.id in GLASSES_STYLE).map((f) => {
  const st = GLASSES_STYLE[f.id];
  const r = Math.max(GLASSES.siteRadius, f.playRadius ?? 0);
  const d = r + GLASSES_BEACON_OUT;
  const a = f.yaw + Math.PI + (st.turn ?? 0);
  return {
    id: f.id,
    icon: st.icon,
    arm: GLASSES_ARM,
    balloon: st.balloon,
    x: f.x,
    z: f.z,
    yaw: f.yaw,
    r,
    beacon: { x: f.x + Math.sin(a) * d, z: f.z + Math.cos(a) * d, h: 11 },
    trail: !!st.trail,
  };
});

const isGlasses = (t: WayTarget): t is GlassesSiteId => t in GLASSES_STYLE;

/** Position, icon and arm colour of anything a fingerpost can point at. */
export function wayTarget(t: WayTarget): { x: number; z: number; icon: IconId; arm: number } {
  if (isGlasses(t)) {
    const g = GLASSES_WAY.find((q) => q.id === t);
    if (!g) throw new Error(`no glasses site ${t}`);
    return g;
  }
  const a = attractionFor(t);
  return { x: ANCHORS[t].x, z: ANCHORS[t].z, icon: a.icon, arm: a.arm };
}

export function attractionFor(a: AnchorName): Attraction {
  const r = ATTRACTIONS.find((q) => q.anchor === a);
  if (!r) throw new Error(`no attraction for anchor ${a}`);
  return r;
}

/**
 * For the HUD compass: every attraction with a beacon, its anchor (read live positions from
 * `ctx.world.anchors[anchor]`), its world pictogram id (`drawPictogram` in pictograms.ts draws it on
 * any 2D canvas) and its beacon colour. Same order as the plaza fingerposts, then the glasses sites.
 *
 * The glasses sites are not in `AnchorName` (src/types.ts is not ours to change), so their entries
 * carry the site id cast to `AnchorName`; the world registers each id as a non-enumerable extra
 * anchor (`ctx.world.anchors.toys` etc.), so the compass finds a live position while code that
 * iterates the anchors (`Object.entries`) still sees only the real ones.
 */
export const COMPASS_ATTRACTIONS: readonly { anchor: AnchorName; icon: IconId; color: number; x: number; z: number }[] = [
  ...ATTRACTIONS.map((a) => ({
    anchor: a.anchor,
    icon: a.icon,
    color: a.balloon,
    x: ANCHORS[a.anchor].x,
    z: ANCHORS[a.anchor].z,
  })),
  ...GLASSES_WAY.map((g) => ({ anchor: g.id as string as AnchorName, icon: g.icon, color: g.balloon, x: g.x, z: g.z })),
];
