import { unitSalesDecay } from './salesModel';
import type { SteamGame } from '../types';
export type { SteamGame } from '../types';

/** Review-to-sales multiplier: estimated copies sold ≈ total reviews × 30 */
const REVIEW_TO_SALES_MULTIPLIER = 30;

export const DEFAULT_TAIL_STRENGTH = 0.55;

export interface ComparisonResult {
  rating: number;
  game: SteamGame;
}

export interface SteamComparisonReport {
  percentile: number;
  totalGames: number;
  closest: ComparisonResult[];
}

/** Compute cumulative projected unit sales through month m using the decay model */
export function computeProjectedCumulativeSales(
  m1Units: number,
  months: number,
  tailStrength = DEFAULT_TAIL_STRENGTH,
): number {
  let total = 0;
  for (let m = 1; m <= months; m++) {
    const units = m1Units * unitSalesDecay(m, tailStrength);
    if (units < 1) break;
    total += units;
  }
  return total;
}

/**
 * Log ratio comparing estimated real sales vs projected sales.
 * 0 = perfect match, positive = real game did better, negative = worse.
 */
export function computeRating(
  estimatedSales: number,
  projectedCumulativeSales: number,
): number {
  if (estimatedSales <= 0 || projectedCumulativeSales <= 0) return 0;
  return Math.log(estimatedSales / projectedCumulativeSales);
}

/** Estimate total sales from review count using the review-to-sales multiplier */
export function estimateSalesFromReviews(totalReviews: number): number {
  return totalReviews * REVIEW_TO_SALES_MULTIPLIER;
}

/**
 * Build a comparison report: percentile ranking + top 10 closest games.
 */
export function buildComparisonReport(
  steamGames: SteamGame[],
  m1Units: number,
  tailStrength = DEFAULT_TAIL_STRENGTH,
): SteamComparisonReport {
  const results: ComparisonResult[] = [];

  for (const game of steamGames) {
    if (game.monthsSinceRelease < 1 || game.totalReviews < 1) continue;

    const projected = computeProjectedCumulativeSales(
      m1Units,
      game.monthsSinceRelease,
      tailStrength,
    );

    if (projected <= 0) continue;

    const rating = computeRating(game.estimatedSales, projected);
    results.push({ rating, game });
  }

  if (results.length === 0) {
    return { percentile: 0, totalGames: 0, closest: [] };
  }

  const negativeCount = results.filter((r) => r.rating < 0).length;
  const percentile = negativeCount / results.length;

  const closest = [...results]
    .sort((a, b) => Math.abs(a.rating) - Math.abs(b.rating))
    .slice(0, 10);

  return {
    percentile,
    totalGames: results.length,
    closest,
  };
}

/** Filter games to those within a price tolerance (in cents) that have reviews */
export function filterByPriceTier(
  games: SteamGame[],
  priceCents: number,
  toleranceCents = 100,
): SteamGame[] {
  return games.filter((g) =>
    g.totalReviews > 0 && Math.abs(g.priceInCents - priceCents) <= toleranceCents
  );
}
