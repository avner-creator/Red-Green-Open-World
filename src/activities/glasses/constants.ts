/** Tuning for the glasses-play framework (sites, boards, far-idle). Mechanics keep their own constants in their folder. */
export const GLASSES = {
  /** Usable radius of a site (metres): mechanics build inside this circle. */
  siteRadius: 6,
  /** Minimum distance between site centres. */
  siteSpacing: 14,
  /** Extra clearance around every anchor radius / target radius. */
  anchorMargin: 2,
  /** Clearance from every gem and chest spot to the site's edge. */
  spotClear: 4,
  /** Clearance from a road's edge to the site's edge. */
  roadMargin: 1.5,
  /** Ground must be this far above the water level. */
  minAboveWater: 1.5,
  /** Max height difference between the centre and any rim sample (gentle slope). */
  maxRise: 1.4,
  /** Plaza sites: distance band from `anchors.spawn`. */
  plazaMin: 15,
  plazaMax: 45,
  /** Attraction sites: at most this far from the attraction anchor's centre. */
  nearMax: 35,
  /** Spiral search: step between candidates (golden-angle spiral) and number of candidates. */
  searchStep: 1.25,
  searchCount: 1600,
  /** Far-idle: a mechanic switches on inside `activateRadius` and off beyond `deactivateRadius`. */
  activateRadius: 60,
  deactivateRadius: 70,
  /** `goto` viewing distance from the site centre (the approach side). */
  viewDistance: 15,
} as const;

/** Board (wordless pictogram sign) dimensions, metres. The board faces local +Z. */
export const BOARD = {
  cell: 1.35,
  gap: 0.12,
  postHeight: 3.7,
  post: 0.24,
  panelY: 2.75,
  panelDepth: 0.16,
  topperY: 4.75,
  topperSize: 1.6,
} as const;
