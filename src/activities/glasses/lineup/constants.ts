/** Line-up targets ("magic-glasses bubble popping"): tuning (metres, seconds, degrees). */
export const LINEUP = {
  /** Aim pad centre in site-local metres (x right, z towards the approach); bubbles float towards −Z. */
  pad: { x: 0, z: -1.2, radius: 1.1, inner: 0.82, lift: 0.04 },
  /** How far above the pad the player's feet may be and still count as "on the pad". */
  padHeight: 1.2,
  bubble: {
    /** Radius at tier 1 (× the tier preset size). */
    radius: 0.9,
    count: 3,
    /** Seconds on the pad before a bubble drifts away (a miss). */
    lifetime: 15,
    bob: 0.22,
    spawnIn: 0.6,
    popSeconds: 0.45,
    driftSeconds: 1.2,
    respawnDelay: 0.7,
    /** Spawn stagger when the player first steps on the pad. */
    stagger: 0.35,
  },
  /** Candidate spots relative to the pad: angles off straight ahead, distances, heights above the pad. */
  spots: {
    angles: [-34, -17, 0, 17, 34],
    distances: [8, 10.5, 13],
    heights: [2.4, 3.3, 4.2],
    /** Free space needed behind a bubble along the sightline (no wall/tree right behind it). */
    behind: 5,
    /** Bubbles keep this far apart. */
    spacing: 3,
    /** Ground must stay this far below a bubble. */
    clearance: 1.6,
  },
  /** Reticle radius at 10 m (scales with the distance so it keeps its size on screen). */
  reticleRadius: 0.36,
  /** Progress arc radius at 10 m. */
  arcRadius: 0.58,
  gems: { 1: 1, 2: 2, 3: 4 } as const,
} as const;
