import { describe, test, expect } from 'bun:test';
import { createInterpolator } from './curveInterpolator';
import type { BezierCurve } from '../types';

describe('createInterpolator (bezier)', () => {
  test('linear bezier (handles at 1/3 and 2/3) produces near-linear output', () => {
    const curve: BezierCurve = {
      p0: { x: 0, y: 0 },
      cp1: { x: 0.33, y: 0.33 },
      cp2: { x: 0.66, y: 0.66 },
      p3: { x: 1, y: 1 },
    };
    const interp = createInterpolator(curve);
    expect(interp(0)).toBeCloseTo(0, 1);
    expect(interp(0.5)).toBeCloseTo(0.5, 1);
    expect(interp(1)).toBeCloseTo(1, 1);
  });

  test('returns start value at x=0 and end value at x=1', () => {
    const curve: BezierCurve = {
      p0: { x: 0, y: 0.1 },
      cp1: { x: 0.3, y: 0.5 },
      cp2: { x: 0.7, y: 0.8 },
      p3: { x: 1, y: 0.9 },
    };
    const interp = createInterpolator(curve);
    expect(interp(0)).toBeCloseTo(0.1, 1);
    expect(interp(1)).toBeCloseTo(0.9, 1);
  });

  test('clamps below 0 and above 1', () => {
    const curve: BezierCurve = {
      p0: { x: 0, y: 0.2 },
      cp1: { x: 0.33, y: 0.4 },
      cp2: { x: 0.66, y: 0.6 },
      p3: { x: 1, y: 0.8 },
    };
    const interp = createInterpolator(curve);
    expect(interp(-0.5)).toBeCloseTo(0.2, 1);
    expect(interp(1.5)).toBeCloseTo(0.8, 1);
  });

  test('ease-in curve (handle pulled right) starts slow', () => {
    const curve: BezierCurve = {
      p0: { x: 0, y: 0 },
      cp1: { x: 0.8, y: 0 },  // handle far right, low
      cp2: { x: 0.9, y: 0.9 },
      p3: { x: 1, y: 1 },
    };
    const interp = createInterpolator(curve);
    // At x=0.3, the curve should be below the linear value of 0.3
    expect(interp(0.3)).toBeLessThan(0.3);
  });

  test('output is monotonically non-decreasing for a well-formed curve', () => {
    const curve: BezierCurve = {
      p0: { x: 0, y: 0 },
      cp1: { x: 0.33, y: 0.2 },
      cp2: { x: 0.66, y: 0.8 },
      p3: { x: 1, y: 1 },
    };
    const interp = createInterpolator(curve);
    let prev = interp(0);
    for (let x = 0.05; x <= 1.0; x += 0.05) {
      const curr = interp(x);
      expect(curr).toBeGreaterThanOrEqual(prev - 0.001);
      prev = curr;
    }
  });
});
