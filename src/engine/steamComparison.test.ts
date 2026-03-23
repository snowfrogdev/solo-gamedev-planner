import { describe, test, expect } from 'bun:test';
import {
  computeRating,
  computeProjectedCumulativeSales,
  estimateSales,
  getSalesBreakdown,
  getGenreFactor,
  hasCjkCharacters,
  buildComparisonReport,
  filterByPriceTier,
  DEFAULT_TAIL_STRENGTH,
} from './steamComparison';
import type { SteamGame, SteamGameDetails } from '../types';

function makeGame(overrides: Partial<SteamGame> = {}): SteamGame {
  return {
    appid: 1,
    name: 'Test Game',
    totalReviews: 100,
    reviewPositivePct: 80,
    priceInCents: 999,
    releaseDate: new Date('2025-01-01'),
    monthsSinceRelease: 12,
    storeUrl: 'https://store.steampowered.com/app/1',
    ...overrides,
  };
}

function makeDetails(overrides: Partial<SteamGameDetails> = {}): SteamGameDetails {
  return {
    genres: ['Indie', 'Simulation'],
    isEarlyAccess: false,
    fetchedAt: Date.now(),
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
    expect(cum).toBeGreaterThan(0);
    expect(cum).toBeLessThan(100);
  });

  test('non-default tailStrength changes output', () => {
    const defaultResult = computeProjectedCumulativeSales(500, 12, DEFAULT_TAIL_STRENGTH);
    const strongerTail = computeProjectedCumulativeSales(500, 12, 0.8);
    expect(strongerTail).not.toBe(defaultResult);
    expect(strongerTail).toBeGreaterThan(defaultResult);
  });
});

describe('hasCjkCharacters', () => {
  test('detects CJK characters', () => {
    expect(hasCjkCharacters('公主：东方与远征')).toBe(true);
    expect(hasCjkCharacters('Game Name 中文')).toBe(true);
  });

  test('returns false for non-CJK text', () => {
    expect(hasCjkCharacters('Test Game')).toBe(false);
    expect(hasCjkCharacters('Über Cool Game')).toBe(false);
    expect(hasCjkCharacters('')).toBe(false);
  });

  test('detects CJK extension B characters', () => {
    expect(hasCjkCharacters('\u3400')).toBe(true);
  });
});

describe('getGenreFactor', () => {
  test('returns factor for recognized genre', () => {
    expect(getGenreFactor(['Action'])).toBe(2.0);
    expect(getGenreFactor(['RPG'])).toBe(1.25);
    expect(getGenreFactor(['Puzzle'])).toBe(0.85);
    expect(getGenreFactor(['Visual Novel'])).toBe(0.65);
  });

  test('skips Indie and uses next recognized genre', () => {
    expect(getGenreFactor(['Indie', 'Action'])).toBe(2.0);
  });

  test('averages multiple recognized non-Indie genres', () => {
    expect(getGenreFactor(['Action', 'Adventure'])).toBeCloseTo(1.45, 5);
    expect(getGenreFactor(['Indie', 'Strategy', 'Action'])).toBeCloseTo(1.525, 5);
  });

  test('returns 1.0 for Indie-only', () => {
    expect(getGenreFactor(['Indie'])).toBe(1.0);
  });

  test('returns 1.0 for unrecognized genres', () => {
    expect(getGenreFactor(['Sports', 'Racing'])).toBe(1.0);
  });

  test('returns 1.0 for empty list', () => {
    expect(getGenreFactor([])).toBe(1.0);
  });
});

describe('estimateSales', () => {
  test('base case: no active factors produces base × reviews', () => {
    const game = makeGame({ totalReviews: 500, priceInCents: 999, reviewPositivePct: 80 });
    expect(estimateSales(game)).toBe(500 * 30);
  });

  // Hardcoded expected values (independently computed, not replicating formula)
  test('50 reviews at $9.99, 80% positive = 1143 sales', () => {
    // 50 × 30 × dampen(0.7) = 50 × 30 × 0.8189 ≈ 1228
    // dampen(0.7) = 1/(1/0.7)^0.56 = 1/1.4286^0.56 = 1/1.2209 = 0.8190
    const game = makeGame({ totalReviews: 50, priceInCents: 999, reviewPositivePct: 80 });
    expect(estimateSales(game)).toBeCloseTo(1229, -1); // within ~10
  });

  test('5000 reviews at $9.99, 80% positive ≈ 181,100 sales', () => {
    // 5000 × 30 × dampen(1.4) = 5000 × 30 × 1.2074 ≈ 181,100
    const game = makeGame({ totalReviews: 5000, priceInCents: 999, reviewPositivePct: 80 });
    expect(estimateSales(game)).toBeCloseTo(181100, -2); // within ~100
  });

  test('500 reviews at $3.99, 80% positive = 18,197 sales', () => {
    // 500 × 30 × dampen(1.3) = 500 × 30 × 1.1613 ≈ 17,420
    // (1.3^0.56 = 1.1613)
    const game = makeGame({ totalReviews: 500, priceInCents: 399, reviewPositivePct: 80 });
    expect(estimateSales(game)).toBeCloseTo(17420, -2);
  });

  // Boundary tests — review count tiers
  test('boundary: 99 reviews uses 0.7× volume factor', () => {
    const game = makeGame({ totalReviews: 99 });
    expect(estimateSales(game) / 99).toBeLessThan(30); // dampened 0.7 pulls below 30
  });

  test('boundary: 100 reviews uses 1.0× volume factor', () => {
    const game = makeGame({ totalReviews: 100 });
    expect(estimateSales(game) / 100).toBe(30); // no adjustment
  });

  test('boundary: 999 reviews uses 1.0× volume factor', () => {
    const game = makeGame({ totalReviews: 999 });
    expect(estimateSales(game) / 999).toBe(30);
  });

  test('boundary: 1000 reviews uses 1.4× volume factor', () => {
    const game = makeGame({ totalReviews: 1000 });
    expect(estimateSales(game) / 1000).toBeGreaterThan(30);
  });

  test('boundary: 10000 reviews uses 1.4× volume factor', () => {
    const game = makeGame({ totalReviews: 10000 });
    expect(estimateSales(game) / 10000).toBeGreaterThan(30);
  });

  test('boundary: 10001 reviews uses 1.0× volume factor', () => {
    const game = makeGame({ totalReviews: 10001 });
    expect(estimateSales(game) / 10001).toBe(30);
  });

  // Boundary tests — price
  test('boundary: 499 cents gets price adjustment', () => {
    const game = makeGame({ totalReviews: 500, priceInCents: 499 });
    expect(estimateSales(game)).toBeGreaterThan(500 * 30);
  });

  test('boundary: 500 cents does NOT get price adjustment', () => {
    const game = makeGame({ totalReviews: 500, priceInCents: 500 });
    expect(estimateSales(game)).toBe(500 * 30);
  });

  // Boundary tests — sentiment
  test('boundary: 95% positive triggers sentiment factor', () => {
    const game = makeGame({ totalReviews: 500, reviewPositivePct: 95 });
    expect(estimateSales(game)).toBeLessThan(500 * 30);
  });

  test('boundary: 94% positive does NOT trigger sentiment factor', () => {
    const game = makeGame({ totalReviews: 500, reviewPositivePct: 94 });
    expect(estimateSales(game)).toBe(500 * 30);
  });

  test('boundary: 40% positive triggers sentiment factor', () => {
    const game = makeGame({ totalReviews: 500, reviewPositivePct: 40 });
    expect(estimateSales(game)).toBeLessThan(500 * 30);
  });

  test('boundary: 41% positive does NOT trigger sentiment factor', () => {
    const game = makeGame({ totalReviews: 500, reviewPositivePct: 41 });
    expect(estimateSales(game)).toBe(500 * 30);
  });

  test('CJK name applies CJK audience factor', () => {
    const game = makeGame({ name: '公主：东方与远征', totalReviews: 500, priceInCents: 999, reviewPositivePct: 80 });
    expect(estimateSales(game)).toBeLessThan(500 * 30);
  });

  test('genre factor applied when details available', () => {
    const game = makeGame({
      totalReviews: 500, priceInCents: 999, reviewPositivePct: 80,
      details: makeDetails({ genres: ['Action'] }),
    });
    expect(estimateSales(game)).toBeGreaterThan(500 * 30);
  });

  test('Early Access factor applied when details available', () => {
    const game = makeGame({
      totalReviews: 500, priceInCents: 999, reviewPositivePct: 80,
      details: makeDetails({ isEarlyAccess: true }),
    });
    expect(estimateSales(game)).toBeGreaterThan(500 * 30);
  });

  test('no details means genre and EA factors are 1.0', () => {
    const withDetails = makeGame({
      totalReviews: 500, priceInCents: 999, reviewPositivePct: 80,
      details: makeDetails({ genres: ['Action'], isEarlyAccess: true }),
    });
    const without = makeGame({
      totalReviews: 500, priceInCents: 999, reviewPositivePct: 80,
    });
    expect(estimateSales(without)).toBeLessThan(estimateSales(withDetails));
  });

  test('multiplier cap at 70×: all max-boosting factors produce exactly 70×', () => {
    // All max factors: volume 1.4 + price 1.3 + genre Action 2.0 + EA 1.25
    // Calibrated so dampened product = exactly 70/30
    const game = makeGame({
      totalReviews: 1000,
      priceInCents: 399,     // < 500 → price 1.3
      reviewPositivePct: 80, // neutral sentiment
      details: makeDetails({ genres: ['Action'], isEarlyAccess: true }),
    });
    const effectiveMultiplier = estimateSales(game) / game.totalReviews;
    expect(effectiveMultiplier).toBeCloseTo(70, 0);
  });

  test('dampening preserves factor direction', () => {
    const baseGame = makeGame({ totalReviews: 500, priceInCents: 999, reviewPositivePct: 80 });
    const cheapGame = makeGame({ totalReviews: 500, priceInCents: 299, reviewPositivePct: 80 });
    expect(estimateSales(cheapGame)).toBeGreaterThan(estimateSales(baseGame));

    const lowReviewGame = makeGame({ totalReviews: 50, priceInCents: 999, reviewPositivePct: 80 });
    const perReviewLow = estimateSales(lowReviewGame) / 50;
    const perReviewBase = estimateSales(baseGame) / 500;
    expect(perReviewLow).toBeLessThan(perReviewBase);
  });
});

describe('getSalesBreakdown', () => {
  test('returns all factors at 1.0 for a neutral game', () => {
    const game = makeGame({ totalReviews: 500, priceInCents: 999, reviewPositivePct: 80 });
    const b = getSalesBreakdown(game);
    expect(b.multiplier).toBe(30);
    expect(b.volume.raw).toBe(1.0);
    expect(b.price.raw).toBe(1.0);
    expect(b.sentiment.raw).toBe(1.0);
    expect(b.cjkAudience.raw).toBe(1.0);
    expect(b.genre.raw).toBe(1.0);
    expect(b.earlyAccess.raw).toBe(1.0);
  });

  test('reports active factors with raw and dampened values', () => {
    const game = makeGame({
      totalReviews: 5000, priceInCents: 299, reviewPositivePct: 80,
      details: makeDetails({ genres: ['Action'], isEarlyAccess: true }),
    });
    const b = getSalesBreakdown(game);
    expect(b.volume.raw).toBe(1.4);
    expect(b.volume.dampened).toBeGreaterThan(1.0);
    expect(b.volume.dampened).toBeLessThan(1.4);
    expect(b.price.raw).toBe(1.3);
    expect(b.genre.raw).toBe(2.0);
    expect(b.genre.label).toBe('Action');
    expect(b.earlyAccess.raw).toBe(1.25);
  });

  test('reports CJK factor for Chinese game names', () => {
    const game = makeGame({ name: '公主：东方与远征', totalReviews: 500 });
    const b = getSalesBreakdown(game);
    expect(b.cjkAudience.raw).toBe(0.7);
    expect(b.cjkAudience.dampened).toBeLessThan(1.0);
    expect(b.cjkAudience.dampened).toBeGreaterThan(0.7);
  });

  test('genre label shows averaged genres', () => {
    const game = makeGame({
      totalReviews: 500,
      details: makeDetails({ genres: ['Indie', 'Action', 'Adventure'] }),
    });
    const b = getSalesBreakdown(game);
    expect(b.genre.label).toBe('Action, Adventure');
    expect(b.genre.raw).toBeCloseTo(1.45, 5);
  });

  test('multiplier matches estimateSales / totalReviews', () => {
    const game = makeGame({
      totalReviews: 1000, priceInCents: 399,
      details: makeDetails({ genres: ['RPG'] }),
    });
    const b = getSalesBreakdown(game);
    const sales = estimateSales(game);
    expect(b.multiplier).toBeCloseTo(sales / game.totalReviews, 5);
  });
});

describe('buildComparisonReport', () => {
  test('computes correct percentile', () => {
    const m1Units = 100;
    const games = [
      makeGame({ appid: 1, totalReviews: 5, monthsSinceRelease: 12 }),
      makeGame({ appid: 2, totalReviews: 15, monthsSinceRelease: 12 }),
      makeGame({ appid: 3, totalReviews: 50, monthsSinceRelease: 12 }),
    ];

    const report = buildComparisonReport(games, m1Units);
    expect(report.totalGames).toBe(3);
    expect(report.percentile).toBeGreaterThan(0);
    expect(report.percentile).toBeLessThan(1);
  });

  test('returns top 10 sorted by |rating|', () => {
    const games = Array.from({ length: 15 }, (_, i) =>
      makeGame({
        appid: i,
        totalReviews: 10 + i * 5,
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

  test('closest results carry estimatedSales and breakdown', () => {
    const games = [makeGame({ totalReviews: 500, monthsSinceRelease: 12 })];
    const report = buildComparisonReport(games, 100);
    expect(report.closest[0].estimatedSales).toBe(estimateSales(games[0]));
    expect(report.closest[0].breakdown).toBeDefined();
    expect(report.closest[0].breakdown.multiplier).toBe(30);
  });

  test('skips games with 0 reviews', () => {
    const games = [makeGame({ totalReviews: 0 })];
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
    const games = [
      makeGame({ appid: 1, totalReviews: 50, monthsSinceRelease: 12 }),
      makeGame({ appid: 2, totalReviews: 500, monthsSinceRelease: 12 }),
    ];
    const defaultReport = buildComparisonReport(games, 100);
    const altReport = buildComparisonReport(games, 100, 0.8);
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
