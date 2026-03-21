import { describe, expect, test } from 'bun:test';
import { smoothness } from './optimizerUtils';

describe('smoothness', () => {
  test('returns 1 for empty array', () => {
    expect(smoothness([])).toBe(1);
  });

  test('returns 1 for single element', () => {
    expect(smoothness([5])).toBe(1);
  });

  test('returns 1 for two elements', () => {
    expect(smoothness([3, 12])).toBe(1);
  });

  test('returns 1 for perfect linear ramp', () => {
    expect(smoothness([2, 4, 6, 8, 10])).toBeCloseTo(1, 10);
  });

  test('returns < 1 for non-linear progression', () => {
    // [1, 10, 3] — middle value deviates from ideal of 2
    const score = smoothness([1, 10, 3]);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(1);
  });

  test('returns 1 when all values are equal (zero range)', () => {
    expect(smoothness([5, 5, 5, 5])).toBe(1);
  });

  test('penalises deviation proportionally', () => {
    // Small deviation should score higher than large deviation
    const small = smoothness([1, 2.5, 3, 4.5, 5]);
    const large = smoothness([1, 5, 1, 5, 5]);
    expect(small).toBeGreaterThan(large);
  });
});
