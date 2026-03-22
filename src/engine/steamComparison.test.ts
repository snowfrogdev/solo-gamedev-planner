import { describe, test, expect } from 'bun:test';
import {
  computeRating,
  computeProjectedCumulativeSales,
  estimateSalesFromReviews,
  buildComparisonReport,
  filterByPriceTier,
  DEFAULT_TAIL_STRENGTH,
} from './steamComparison';
import type { SteamGame } from '../types';

function makeGame(overrides: Partial<SteamGame> = {}): SteamGame {
  return {
    appid: 1,
    name: 'Test Game',
    totalReviews: 100,
    reviewPositivePct: 80,
    priceInCents: 999,
    releaseDate: new Date('2025-01-01'),
    monthsSinceRelease: 12,
    estimatedSales: 3000,
    storeUrl: 'https://store.steampowered.com/app/1',
    ...overrides,
  };
}

describe('computeRating', () => {
  test('returns 0 for exact match', () => {
    expect(computeRating(1000, 1000)).toBe(0);
  });

  test('returns positive when real game sold more', () => {
    expect(computeRating(2000, 1000)).toBeGreaterThan(0);
  });

  test('returns negative when real game sold less', () => {
    expect(computeRating(500, 1000)).toBeLessThan(0);
  });

  test('is symmetric: 2x overshoot same magnitude as 0.5x', () => {
    const over = computeRating(2000, 1000);
    const under = computeRating(500, 1000);
    expect(Math.abs(over)).toBeCloseTo(Math.abs(under), 5);
  });

  test('returns 0 for zero estimated sales', () => {
    expect(computeRating(0, 1000)).toBe(0);
  });

  test('returns 0 for zero projected sales', () => {
    expect(computeRating(1000, 0)).toBe(0);
  });

  test('returns 0 for negative inputs', () => {
    expect(computeRating(-100, 1000)).toBe(0);
    expect(computeRating(1000, -100)).toBe(0);
  });
});

describe('computeProjectedCumulativeSales', () => {
  test('first month equals m1Units', () => {
    const cum = computeProjectedCumulativeSales(500, 1);
    expect(cum).toBe(500);
  });

  test('cumulative increases with more months', () => {
    const at6 = computeProjectedCumulativeSales(500, 6);
    const at12 = computeProjectedCumulativeSales(500, 12);
    expect(at12).toBeGreaterThan(at6);
  });

  test('matches our sales decay model (~3x by year 1)', () => {
    const cum = computeProjectedCumulativeSales(1000, 12);
    expect(cum / 1000).toBeGreaterThan(2.5);
    expect(cum / 1000).toBeLessThan(3.5);
  });

  test('returns 0 for m1Units=0', () => {
    expect(computeProjectedCumulativeSales(0, 12)).toBe(0);
  });

  test('early-exits when units drop below 1', () => {
    const cum = computeProjectedCumulativeSales(1, 1000);
    // Should terminate early, not loop 1000 times accumulating near-zero values
    expect(cum).toBeGreaterThan(0);
    expect(cum).toBeLessThan(100);
  });

  test('non-default tailStrength changes output', () => {
    const defaultResult = computeProjectedCumulativeSales(500, 12, DEFAULT_TAIL_STRENGTH);
    const strongerTail = computeProjectedCumulativeSales(500, 12, 0.8);
    expect(strongerTail).not.toBe(defaultResult);
    // Stronger tail = more sales in later months
    expect(strongerTail).toBeGreaterThan(defaultResult);
  });
});

describe('estimateSalesFromReviews', () => {
  test('applies review-to-sales multiplier of 30', () => {
    expect(estimateSalesFromReviews(100)).toBe(3000);
  });
});

describe('buildComparisonReport', () => {
  test('computes correct percentile', () => {
    const projected = computeProjectedCumulativeSales(100, 12);
    const games = [
      makeGame({ estimatedSales: projected * 0.5, monthsSinceRelease: 12 }),
      makeGame({ appid: 2, estimatedSales: projected, monthsSinceRelease: 12 }),
      makeGame({ appid: 3, estimatedSales: projected * 2, monthsSinceRelease: 12 }),
    ];

    const report = buildComparisonReport(games, 100);
    expect(report.percentile).toBeCloseTo(1 / 3, 2);
    expect(report.totalGames).toBe(3);
  });

  test('percentile is 0 when all games outperform', () => {
    const projected = computeProjectedCumulativeSales(100, 12);
    const games = [
      makeGame({ estimatedSales: projected * 2, monthsSinceRelease: 12 }),
      makeGame({ appid: 2, estimatedSales: projected * 3, monthsSinceRelease: 12 }),
    ];
    const report = buildComparisonReport(games, 100);
    expect(report.percentile).toBe(0);
  });

  test('percentile is 1 when all games underperform', () => {
    const projected = computeProjectedCumulativeSales(100, 12);
    const games = [
      makeGame({ estimatedSales: projected * 0.1, monthsSinceRelease: 12 }),
      makeGame({ appid: 2, estimatedSales: projected * 0.2, monthsSinceRelease: 12 }),
    ];
    const report = buildComparisonReport(games, 100);
    expect(report.percentile).toBe(1);
  });

  test('returns top 10 sorted by |rating|', () => {
    const projected = computeProjectedCumulativeSales(100, 6);
    const games = Array.from({ length: 15 }, (_, i) =>
      makeGame({
        appid: i,
        estimatedSales: projected * (0.5 + i * 0.2),
        monthsSinceRelease: 6,
      }),
    );

    const report = buildComparisonReport(games, 100);
    expect(report.closest.length).toBe(10);

    for (let i = 1; i < report.closest.length; i++) {
      expect(Math.abs(report.closest[i].rating)).toBeGreaterThanOrEqual(
        Math.abs(report.closest[i - 1].rating),
      );
    }
  });

  test('skips games with 0 reviews', () => {
    const games = [makeGame({ totalReviews: 0, estimatedSales: 0 })];
    const report = buildComparisonReport(games, 100);
    expect(report.totalGames).toBe(0);
  });

  test('skips games less than 1 month old', () => {
    const games = [makeGame({ monthsSinceRelease: 0 })];
    const report = buildComparisonReport(games, 100);
    expect(report.totalGames).toBe(0);
  });

  test('returns empty report for no games', () => {
    const report = buildComparisonReport([], 100);
    expect(report.percentile).toBe(0);
    expect(report.totalGames).toBe(0);
    expect(report.closest).toEqual([]);
  });

  test('non-default tailStrength flows through to computation', () => {
    const projected = computeProjectedCumulativeSales(100, 12);
    const games = [
      makeGame({ estimatedSales: projected * 0.5, monthsSinceRelease: 12 }),
      makeGame({ appid: 2, estimatedSales: projected * 2, monthsSinceRelease: 12 }),
    ];
    const defaultReport = buildComparisonReport(games, 100);
    const altReport = buildComparisonReport(games, 100, 0.8);
    // Different tailStrength should produce different ratings
    expect(altReport.closest[0].rating).not.toBe(defaultReport.closest[0].rating);
  });
});

describe('filterByPriceTier', () => {
  test('filters games within price tolerance', () => {
    const games = [
      makeGame({ priceInCents: 999, totalReviews: 50 }),
      makeGame({ appid: 2, priceInCents: 1099, totalReviews: 50 }),
      makeGame({ appid: 3, priceInCents: 1200, totalReviews: 50 }),
    ];
    const result = filterByPriceTier(games, 999);
    expect(result.length).toBe(2);
    expect(result.map((g) => g.appid)).toEqual([1, 2]);
  });

  test('excludes games with 0 reviews', () => {
    const games = [
      makeGame({ priceInCents: 999, totalReviews: 0 }),
      makeGame({ appid: 2, priceInCents: 999, totalReviews: 10 }),
    ];
    const result = filterByPriceTier(games, 999);
    expect(result.length).toBe(1);
    expect(result[0].appid).toBe(2);
  });

  test('respects custom tolerance', () => {
    const games = [
      makeGame({ priceInCents: 500, totalReviews: 50 }),
      makeGame({ appid: 2, priceInCents: 999, totalReviews: 50 }),
    ];
    const result = filterByPriceTier(games, 999, 50);
    expect(result.length).toBe(1);
  });

  test('returns empty array when no games match', () => {
    const games = [makeGame({ priceInCents: 2000, totalReviews: 50 })];
    const result = filterByPriceTier(games, 999);
    expect(result.length).toBe(0);
  });
});
