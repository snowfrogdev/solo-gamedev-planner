import { describe, test, expect } from 'bun:test';
import { computeLaunchPrice, averageEffectivePrice } from './pricingModel';

describe('computeLaunchPrice', () => {
  test('returns lowest tier for very short projects', () => {
    const result = computeLaunchPrice(0.5);
    expect(result.launchPrice).toBe(4.99);
    expect(result.rawPrice).toBeLessThan(4.99);
  });

  test('returns lowest tier with rawPrice 0 for zero or negative duration', () => {
    expect(computeLaunchPrice(0).launchPrice).toBe(4.99);
    expect(computeLaunchPrice(0).rawPrice).toBe(0);
    expect(computeLaunchPrice(-1).launchPrice).toBe(4.99);
    expect(computeLaunchPrice(-1).rawPrice).toBe(0);
  });

  test('snaps to expected tiers for typical durations', () => {
    // ln(3) ≈ 1.099 → 5.00 × 1.099 − 1.00 ≈ 4.49 → $4.99
    expect(computeLaunchPrice(3).launchPrice).toBe(4.99);

    // ln(6) ≈ 1.792 → 5.00 × 1.792 − 1.00 ≈ 7.96 → $7.99
    expect(computeLaunchPrice(6).launchPrice).toBe(7.99);

    // ln(12) ≈ 2.485 → 5.00 × 2.485 − 1.00 ≈ 11.42 → $9.99
    expect(computeLaunchPrice(12).launchPrice).toBe(9.99);

    // ln(24) ≈ 3.178 → 5.00 × 3.178 − 1.00 ≈ 14.89 → $14.99
    expect(computeLaunchPrice(24).launchPrice).toBe(14.99);
  });

  test('caps at highest tier for very long projects', () => {
    // ln(1000) ≈ 6.908 → 5.00 × 6.908 − 1.00 ≈ 33.54 → $29.99 (capped)
    expect(computeLaunchPrice(1000).launchPrice).toBe(29.99);
  });

  test('rawPrice reflects the unsnapped formula output', () => {
    const result = computeLaunchPrice(6);
    const expected = 5.00 * Math.log(6) - 1.00;
    expect(result.rawPrice).toBeCloseTo(expected, 4);
  });

  test('rawPrice between tiers snaps to nearest', () => {
    // rawPrice ≈ 6.49, closer to 7.99 (dist 1.50) than 4.99 (dist 1.50)
    // With strict < comparison, equal distance keeps first match (lower tier)
    // But 6.4903 is slightly closer to 7.99, so it snaps up
    const result = computeLaunchPrice(4.473);
    expect(result.rawPrice).toBeCloseTo(6.49, 1);
    expect(result.launchPrice).toBe(7.99);
  });

  test('includes pre-computed AEP values', () => {
    const result = computeLaunchPrice(6);
    expect(result.aepMonth1).toBeCloseTo(
      result.launchPrice * 0.80 * 0.9188, 1,
    );
    expect(result.aepYear1).toBeLessThan(result.aepMonth1);
    expect(result.aepYear3).toBeLessThan(result.aepYear1);
    expect(result.aepYear3).toBeGreaterThan(0);
  });
});

describe('averageEffectivePrice', () => {
  test('produces expected values for $14.99 game', () => {
    // D(1) = 0.15 + 0.50×e^-0.055 + 0.30×e^-0.015 ≈ 0.9188
    // AEP(1) = 14.99 × 0.80 × 0.9188 ≈ 11.02
    expect(averageEffectivePrice(14.99, 1)).toBeCloseTo(11.02, 1);

    // D(12) = 0.15 + 0.50×e^-0.66 + 0.30×e^-0.18 ≈ 0.6590
    // AEP(12) = 14.99 × 0.80 × 0.6590 ≈ 7.90
    expect(averageEffectivePrice(14.99, 12)).toBeCloseTo(7.90, 1);
  });

  test('AEP at month 0 equals P₀ × 0.80 × 0.95', () => {
    // D(0) = 0.15 + 0.50 + 0.30 = 0.95
    expect(averageEffectivePrice(19.99, 0)).toBeCloseTo(19.99 * 0.80 * 0.95, 2);
  });

  test('AEP is always positive', () => {
    for (const m of [0, 1, 6, 12, 36, 60, 120]) {
      expect(averageEffectivePrice(14.99, m)).toBeGreaterThan(0);
    }
  });

  test('negative months are clamped to 0', () => {
    expect(averageEffectivePrice(10, -5)).toBe(averageEffectivePrice(10, 0));
  });
});
