/** Line-up ("magic ring bubbles"): tuning (metres, seconds, degrees). */
export const LINEUP = {
  /** Aim pad centre in site-local metres (x right, z towards the approach); bubbles float towards −Z. */
  pad: { x: 0, z: -1.2, radius: 1.1, inner: 0.82, lift: 0.04 },
  /** How far above the pad the player's feet may be and still count as "on the pad". */
  padHeight: 1.2,
  bubble: {
    /** Bubble slots (tier 3 shows two at once, tiers 1–2 one). */
    slots: 2,
    /** Seconds a live bubble waits on the pad before it floats away (a miss). */
    lifetime: 15,
    bob: 0.18,
    spawnIn: 0.6,
    popSeconds: 0.55,
    driftSeconds: 1.2,
    respawnDelay: 0.7,
    /** A bubble's radius is this fraction of the ring's (so a bubble inside the ring sits in it). */
    ofRing: 0.78,
  },
  /** After a press that misses, the ring recharges this long before the next press counts. */
  missCooldown: 6,
  /** Approximate extra distance from the camera to the pad (third-person camera behind the hero). */
  cameraBack: 5.1,
  /** Candidate spots relative to the pad: angles off straight ahead, distances, heights above the pad. */
  spots: {
    angles: [-34, -17, 0, 17, 34],
    distances: [8, 10.5, 13],
    heights: [2.4, 3.3, 4.2],
    /** Free space needed behind a bubble along the sightline (no wall/tree right behind it). */
    behind: 5,
    /** Bubbles keep this far apart, as seen from the pad (degrees). */
    spacingDeg: 14,
    /** Ground must stay this far below a bubble. */
    clearance: 1.6,
  },
  gems: { 1: 1, 2: 2, 3: 4 } as const,
} as const;
