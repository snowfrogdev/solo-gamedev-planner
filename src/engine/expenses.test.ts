import { describe, test, expect } from 'bun:test';
import { devCostWeights } from './expenses';

describe('devCostWeights', () => {
  test('weights sum to 1', () => {
    for (const months of [1, 3, 6, 12]) {
      const weights = devCostWeights(months);
      const sum = weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  test('weights are monotonically increasing', () => {
    const weights = devCostWeights(6);
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeGreaterThan(weights[i - 1]);
    }
  });

  test('returns single weight of 1 for 1 month', () => {
    const weights = devCostWeights(1);
    expect(weights.length).toBe(1);
    expect(weights[0]).toBe(1);
  });

  test('returns correct number of weights', () => {
    expect(devCostWeights(3).length).toBe(3);
    expect(devCostWeights(12).length).toBe(12);
  });
});
