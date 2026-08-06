import { describe, expect, it } from 'vitest';
import { resolveCoffeePropState, resolveIdleMotion } from './idleMotion';

describe('resolveIdleMotion', () => {
  it('keeps a human walking duration for a long office route', () => {
    const samples = Array.from({ length: 240 }, (_, second) => resolveIdleMotion(second, 1.3, 45));
    const outward = samples.filter((sample) => sample.phase === 'walking-out');
    expect(outward.length).toBeGreaterThan(35);
  });

  it('desynchronizes different workers and varies pauses across trips', () => {
    const moments = [20, 45, 80, 130, 190];
    const first = moments.map((time) => resolveIdleMotion(time, 1.3, 32).phase);
    const second = moments.map((time) => resolveIdleMotion(time, 6.5, 32).phase);
    expect(first).not.toEqual(second);
  });

  it('always returns bounded route progress', () => {
    for (let time = 0; time < 900; time += 7) {
      const motion = resolveIdleMotion(time, 3.9, 54);
      expect(motion.progress).toBeGreaterThanOrEqual(0);
      expect(motion.progress).toBeLessThanOrEqual(1);
    }
  });

  it('moves one physical cup from rack to hand and finally to the desk', () => {
    const pickup = 0.72;
    expect(resolveCoffeePropState({ phase: 'at-desk', progress: 0, trip: 0 }, pickup)).toBe('rack');
    expect(resolveCoffeePropState({ phase: 'walking-out', progress: 0.71, trip: 0 }, pickup)).toBe('rack');
    expect(resolveCoffeePropState({ phase: 'walking-out', progress: 0.72, trip: 0 }, pickup)).toBe('hand');
    expect(resolveCoffeePropState({ phase: 'at-cafe', progress: 1, trip: 0 }, pickup)).toBe('hand');
    expect(resolveCoffeePropState({ phase: 'walking-back', progress: 0.4, trip: 0 }, pickup)).toBe('hand');
    expect(resolveCoffeePropState({ phase: 'at-desk', progress: 0, trip: 1 }, pickup)).toBe('desk');
  });
});
