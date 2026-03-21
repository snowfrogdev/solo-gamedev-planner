import { describe, test, expect } from 'bun:test';
import { defaultDowntime, createCustomDowntime } from './downtimeCalculator';
import type { BezierCurve, DowntimeConfig } from '../types';

describe('defaultDowntime', () => {
  test('produces expected values for known inputs', () => {
    const d3 = defaultDowntime(3);
    expect(d3.total).toBeCloseTo(0.5517, 4);

    const d6 = defaultDowntime(6);
    expect(d6.total).toBeCloseTo(1.2595, 4);

    const d12 = defaultDowntime(12);
    expect(d12.total).toBeCloseTo(3.0301, 4);
  });

  test('downtime is always positive for positive D', () => {
    for (const d of [0.5, 1, 2, 3, 6, 12, 24]) {
      const result = defaultDowntime(d);
      expect(result.total).toBeGreaterThan(0);
      expect(result.postLaunchSupport).toBeGreaterThan(0);
      expect(result.creativeRecovery).toBeGreaterThan(0);
    }
  });

  test('downtime increases as D increases (monotonic)', () => {
    const durations = [1, 2, 3, 4, 6, 8, 10, 12, 18, 24];
    for (let i = 1; i < durations.length; i++) {
      const prev = defaultDowntime(durations[i - 1]);
      const curr = defaultDowntime(durations[i]);
      expect(curr.total).toBeGreaterThan(prev.total);
    }
  });

  test('breakdown (support + recovery) sums to total', () => {
    for (const d of [1, 3, 6, 12]) {
      const result = defaultDowntime(d);
      expect(result.postLaunchSupport + result.creativeRecovery).toBeCloseTo(result.total, 10);
    }
  });
});

describe('createCustomDowntime', () => {
  const linearCurve: BezierCurve = {
    p0: { x: 0, y: 0 },
    cp1: { x: 0.33, y: 0.33 },
    cp2: { x: 0.66, y: 0.66 },
    p3: { x: 1, y: 1 },
  };

  test('two linear curves produce support + recovery = total', () => {
    const config: DowntimeConfig = {
      supportCurve: linearCurve,
      recoveryCurve: linearCurve,
      minInput: 0.5,
      maxInput: 60,
      supportMaxOutput: 10,
      recoveryMaxOutput: 5,
    };
    const getDowntime = createCustomDowntime(config);

    const atMax = getDowntime(60);
    expect(atMax.postLaunchSupport).toBeCloseTo(10, 0);
    expect(atMax.creativeRecovery).toBeCloseTo(5, 0);
    expect(atMax.total).toBeCloseTo(15, 0);
  });

  test('total equals support + recovery at midpoint', () => {
    const config: DowntimeConfig = {
      supportCurve: linearCurve,
      recoveryCurve: linearCurve,
      minInput: 0,
      maxInput: 10,
      supportMaxOutput: 4,
      recoveryMaxOutput: 2,
    };
    const getDowntime = createCustomDowntime(config);

    const mid = getDowntime(5);
    expect(mid.total).toBeCloseTo(mid.postLaunchSupport + mid.creativeRecovery, 10);
  });

  test('inputRange === 0 returns p0 value for any input', () => {
    const config: DowntimeConfig = {
      supportCurve: linearCurve,
      recoveryCurve: linearCurve,
      minInput: 5,
      maxInput: 5,
      supportMaxOutput: 10,
      recoveryMaxOutput: 5,
    };
    const getDowntime = createCustomDowntime(config);
    const result = getDowntime(5);
    // normalizedInput = 0, so interpolator returns p0.y = 0
    expect(result.postLaunchSupport).toBeCloseTo(0, 4);
    expect(result.creativeRecovery).toBeCloseTo(0, 4);
    expect(result.total).toBeCloseTo(0, 4);
  });

  test('clamps input below minInput to p0 value', () => {
    const config: DowntimeConfig = {
      supportCurve: linearCurve,
      recoveryCurve: linearCurve,
      minInput: 5,
      maxInput: 10,
      supportMaxOutput: 10,
      recoveryMaxOutput: 5,
    };
    const getDowntime = createCustomDowntime(config);
    const result = getDowntime(0);
    // normalizedInput clamped to 0
    expect(result.postLaunchSupport).toBeCloseTo(0, 1);
    expect(result.creativeRecovery).toBeCloseTo(0, 1);
  });

  test('clamps input above maxInput to p3 value', () => {
    const config: DowntimeConfig = {
      supportCurve: linearCurve,
      recoveryCurve: linearCurve,
      minInput: 0,
      maxInput: 10,
      supportMaxOutput: 10,
      recoveryMaxOutput: 5,
    };
    const getDowntime = createCustomDowntime(config);
    const result = getDowntime(100);
    // normalizedInput clamped to 1
    expect(result.postLaunchSupport).toBeCloseTo(10, 0);
    expect(result.creativeRecovery).toBeCloseTo(5, 0);
  });

  test('non-linear curve produces different output than linear at midpoint', () => {
    const easeInCurve: BezierCurve = {
      p0: { x: 0, y: 0 },
      cp1: { x: 0.8, y: 0 },
      cp2: { x: 0.9, y: 0.9 },
      p3: { x: 1, y: 1 },
    };
    const config: DowntimeConfig = {
      supportCurve: easeInCurve,
      recoveryCurve: linearCurve,
      minInput: 0,
      maxInput: 10,
      supportMaxOutput: 10,
      recoveryMaxOutput: 5,
    };
    const getDowntime = createCustomDowntime(config);
    const mid = getDowntime(5);
    // Ease-in support should be below the linear midpoint (5)
    expect(mid.postLaunchSupport).toBeLessThan(5);
    // Linear recovery should be near midpoint (2.5)
    expect(mid.creativeRecovery).toBeCloseTo(2.5, 0);
  });
});
