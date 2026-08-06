export type IdleMotionPhase = 'at-desk' | 'walking-out' | 'at-cafe' | 'walking-back';

export type IdleMotion = {
  phase: IdleMotionPhase;
  progress: number;
  /** Zero-based visit number, used to keep physical props consistent between trips. */
  trip: number;
};

export type CoffeePropState = 'rack' | 'hand' | 'desk';

/**
 * One cup, one location. This prevents the visual prop from being duplicated
 * or invented while a worker moves between the rack, lounge and desk.
 */
export function resolveCoffeePropState(motion: IdleMotion, pickupProgress: number): CoffeePropState {
  if (motion.phase === 'at-desk') return motion.trip > 0 ? 'desk' : 'rack';
  if (motion.phase === 'walking-out') return motion.progress >= pickupProgress ? 'hand' : 'rack';
  return 'hand';
}

function variation(seed: number): number {
  const value = Math.sin(seed * 91.733 + 17.117) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * A deterministic but non-repeating-looking schedule shared by character and
 * door animation. Durations change on every trip, agents start out of phase,
 * and walking duration is derived from a human-scale speed (units/second).
 */
export function resolveIdleMotion(elapsedSeconds: number, agentPhase: number, routeDistance: number): IdleMotion {
  let remaining = Math.max(0, elapsedSeconds + variation(agentPhase + 2) * 42);
  const safeDistance = Math.max(8, routeDistance);

  for (let trip = 0; trip < 256; trip += 1) {
    const seed = agentPhase * 13 + trip * 7.31;
    const deskPause = 28 + variation(seed + 1) * 82;
    const outwardWalk = safeDistance / (0.92 + variation(seed + 2) * 0.22);
    const cafePause = 18 + variation(seed + 3) * 48;
    const returnWalk = safeDistance / (0.9 + variation(seed + 4) * 0.2);

    if (remaining < deskPause) return { phase: 'at-desk', progress: 0, trip };
    remaining -= deskPause;
    if (remaining < outwardWalk) return { phase: 'walking-out', progress: remaining / outwardWalk, trip };
    remaining -= outwardWalk;
    if (remaining < cafePause) return { phase: 'at-cafe', progress: 1, trip };
    remaining -= cafePause;
    if (remaining < returnWalk) return { phase: 'walking-back', progress: 1 - remaining / returnWalk, trip };
    remaining -= returnWalk;
  }

  return { phase: 'at-desk', progress: 0, trip: 0 };
}
