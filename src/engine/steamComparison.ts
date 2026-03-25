import { unitSalesDecay } from './salesModel';
import type { SteamGame } from '../types';
export type { SteamGame } from '../types';

/** Base multiplier before factor adjustments in estimateSales() */
const BASE_MULTIPLIER = 30;
const MAX_MULTIPLIER = 70;

/**
 * Dampening exponent applied to each adjustment factor before they are
 * multiplied together. Each factor (volume tier, price, sentiment, genre,
 * Early Access) was derived from independent studies that
 * examined it in isolation. When compounded naïvely, correlated factors
 * overstate their combined effect — e.g., Action games tend to also be in
 * the high-review tier, so multiplying both at full strength double-counts.
 *
 * Raising each factor to DAMPEN_EXPONENT < 1 shrinks it toward 1.0, preserving
 * direction while reducing magnitude. The exponent is calibrated so the
 * worst-case combination of all max-boosting factors (volume 1.4 × price
 * 1.3 × genre 2.0 × EA 1.25 = 4.55 product) produces exactly MAX_MULTIPLIER:
 *
 *   DAMPEN_EXPONENT = ln(MAX_MULTIPLIER / BASE_MULTIPLIER) / ln(4.55)
 *                   = ln(70 / 30) / ln(4.55)
 *                   ≈ 0.56
 *
 * This makes the hard cap at 70× a safety net that rarely activates.
 */
const DAMPEN_EXPONENT = 0.56;

/** Dampen a factor toward 1.0 to reduce compounding of correlated adjustments */
function dampen(factor: number): number {
  if (factor >= 1) return factor ** DAMPEN_EXPONENT;
  return 1 / ((1 / factor) ** DAMPEN_EXPONENT);
}

/**
 * Genre-to-multiplier factor relative to the base (Simulation ≈ 1.0×).
 * Source: Steam Page Analyzer 2026 synthesis of developer data.
 * Mapped against Steam's genre strings from appdetails API.
 */
const GENRE_FACTORS: Record<string, number> = {
  'Action': 2.0,
  'Shooter': 2.0,
  'Horror': 1.25,
  'RPG': 1.25,
  'Roguelike': 1.15,
  'Roguelite': 1.15,
  'Strategy': 1.05,
  'Simulation': 1.0,
  'Platformer': 1.0,
  'Adventure': 0.9,
  'Indie': 1.0,
  'Casual': 0.85,
  'Puzzle': 0.85,
  'Visual Novel': 0.65,
};

/** Compute the average genre factor across all recognized non-Indie genres.
 *  Returns 1.0 if no recognized genres are found. */
export function getGenreFactor(genres: string[]): number {
  let sum = 0;
  let count = 0;
  for (const genre of genres) {
    const factor = GENRE_FACTORS[genre];
    if (factor !== undefined && genre !== 'Indie') {
      sum += factor;
      count++;
    }
  }
  return count > 0 ? sum / count : 1.0;
}

/** Get the recognized non-Indie genre names for display purposes */
function getGenreLabels(genres: string[]): string {
  const labels = genres.filter((g) => GENRE_FACTORS[g] !== undefined && g !== 'Indie');
  return labels.length > 0 ? labels.join(', ') : '';
}

/** Continuous CJK audience factor based on Chinese review percentage (0–1).
 *  Returns 0.7 at 100% Chinese, 1.0 at 0%, linear interpolation between. */
function chineseAudienceFactor(game: SteamGame): number {
  const pct = game.details?.chineseReviewPct ?? 0;
  return 1 - pct * 0.3;
}

export const DEFAULT_TAIL_STRENGTH = 0.55;

export interface FactorDetail {
  raw: number;
  dampened: number;
}

export interface SalesBreakdown {
  multiplier: number;
  volume: FactorDetail;
  price: FactorDetail;
  sentiment: FactorDetail;
  chineseAudience: FactorDetail;
  genre: FactorDetail & { label: string };
  earlyAccess: FactorDetail;
}

export interface ComparisonResult {
  rating: number;
  game: SteamGame;
  estimatedSales: number;
  breakdown: SalesBreakdown;
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

/** Compute factor values before dampening for a game's sales estimate */
function computeRawFactors(game: SteamGame) {
  // Review count tier (bell-curve: small games over-reviewed, mid-tier under-reviewed)
  let volume: number;
  if (game.totalReviews < 100) volume = 0.7;
  else if (game.totalReviews < 1000) volume = 1.0;
  else if (game.totalReviews <= 10000) volume = 1.4;
  else volume = 1.0;

  // Price: cheap games get fewer reviews per sale (F2P excluded by fetcher)
  const price = game.priceInCents > 0 && game.priceInCents < 500 ? 1.3 : 1.0;

  // Sentiment: U-shaped — extreme ratings produce more reviews per sale
  const sentiment =
    (game.reviewPositivePct >= 95 || game.reviewPositivePct <= 40) ? 0.85 : 1.0;

  // CJK audience (proportional to Chinese review share)
  const chineseAudience = chineseAudienceFactor(game);

  // Genre and Early Access from detail data (when available)
  let genre = 1.0;
  let earlyAccess = 1.0;
  let genreLabel = '';
  if (game.details) {
    genre = getGenreFactor(game.details.genres);
    genreLabel = getGenreLabels(game.details.genres);
    if (game.details.isEarlyAccess) earlyAccess = 1.25;
  }

  return { volume, price, sentiment, chineseAudience, genre, genreLabel, earlyAccess };
}

/** Get the full breakdown of how each factor contributes to the sales estimate */
export function getSalesBreakdown(game: SteamGame): SalesBreakdown {
  const f = computeRawFactors(game);

  const multiplier = Math.min(
    BASE_MULTIPLIER
      * dampen(f.volume)
      * dampen(f.price)
      * dampen(f.sentiment)
      * f.chineseAudience           // Not dampened — audience composition is orthogonal to game characteristics
      * dampen(f.genre)
      * dampen(f.earlyAccess),
    MAX_MULTIPLIER,
  );

  return {
    multiplier,
    volume: { raw: f.volume, dampened: dampen(f.volume) },
    price: { raw: f.price, dampened: dampen(f.price) },
    sentiment: { raw: f.sentiment, dampened: dampen(f.sentiment) },
    chineseAudience: { raw: f.chineseAudience, dampened: f.chineseAudience }, // Undampened — audience composition is independent of game characteristics
    genre: { raw: f.genre, dampened: dampen(f.genre), label: f.genreLabel },
    earlyAccess: { raw: f.earlyAccess, dampened: dampen(f.earlyAccess) },
  };
}

/**
 * Unified sales estimation using best available data.
 * Delegates to getSalesBreakdown for the dampened multiplier, then
 * multiplies by review count. See getSalesBreakdown for factor details.
 */
export function estimateSales(game: SteamGame): number {
  return game.totalReviews * getSalesBreakdown(game).multiplier;
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

    const breakdown = getSalesBreakdown(game);
    const estimatedSales = game.totalReviews * breakdown.multiplier;
    const rating = computeRating(estimatedSales, projected);
    results.push({ rating, game, estimatedSales, breakdown });
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
