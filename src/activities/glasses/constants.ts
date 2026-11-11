/** Tuning for the glasses-play framework (sites, boards, far-idle). Mechanics keep their own constants in their folder. */
export const GLASSES = {
  /** Usable radius of a site (metres): mechanics build inside this circle. */
  siteRadius: 6,
  /** Minimum distance between site centres. */
  siteSpacing: 14,
  /** Extra clearance around every anchor radius / target radius. */
  anchorMargin: 2,
  /** Clearance from every gem and chest spot to the site's edge (so ≥ radius + 1 ≈ 7 m from the centre). */
  spotClear: 1,
  /** Clearance from a road's edge to the site's edge. */
  roadMargin: 1.5,
  /** Clearance from the race-lap roads (east, loop, south) to the site's edge. */
  raceRoadMargin: 4,
  /** Clearance from a reserved footprint to the site's edge. */
  reservedMargin: 2,
  /** Ground must be this far above the water level. */
  minAboveWater: 1.5,
  /** Max height difference between the centre and any rim sample (gentle slope). */
  maxRise: 1.8,
  /** Dev search helper (`searchSite`): step between candidates (golden-angle spiral) and number of candidates. */
  searchStep: 1.25,
  searchCount: 1600,
  /**
   * Far-idle: a mechanic switches on inside `activateRadius` and off beyond `deactivateRadius`
   * (player distance; the camera is ~5.5 m further). Beyond ~45 m the layer content (0.75–1.3 m
   * shapes, ~0.1 m dots, 1 m prints) is ≤ 7 px per metre at 640×360 (≤ 14 at 1280×720): unreadable.
   */
  activateRadius: 40,
  deactivateRadius: 48,
  /** `goto` viewing distance from the site centre (the approach side). */
  viewDistance: 12,
} as const;

/** Board (wordless pictogram sign) dimensions, metres. The board faces local +Z. */
export const BOARD = {
  cell: 1.6,
  gap: 0.14,
  postHeight: 3.95,
  post: 0.28,
  panelY: 2.9,
  panelDepth: 0.18,
  topperY: 5.15,
  topperSize: 1.9,
} as const;
