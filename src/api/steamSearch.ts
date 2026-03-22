/**
 * Background fetcher for Steam indie game data.
 * Paginates through Steam's store search API (via CORS proxy), sorted by release date descending,
 * collecting all indie English games from the last 24 months. Results are saved
 * incrementally to IndexedDB per page for resilience against interruption.
 */

import { createRateLimitedFetcher } from './rateLimiter';
import { getCache, isCacheFresh, savePage, markFetchStarted, markFetchComplete } from './steamCache';
import { estimateSalesFromReviews } from '../engine/steamComparison';
import type { SteamGame } from '../types';

const RESULTS_PER_PAGE = 100;
const MIN_AGE_DAYS = 30;
const MAX_AGE_MONTHS = 24;

let cachedGames: SteamGame[] | null = null;
let fetchInProgress = false;
let fetchComplete = false;

function buildSearchUrl(start: number): string {
  return (
    `https://store.steampowered.com/search/results/?infinite=1` +
    `&sort_by=Released_DESC` +
    `&tags=492` +           // 492 = Indie tag
    `&category1=998` +      // 998 = Games only (no DLC/software)
    `&supportedlang=english` +
    `&hidef2p=1` +          // Hide free-to-play games
    `&cc=us` +              // Force USD pricing
    `&count=${RESULTS_PER_PAGE}` +
    `&start=${start}`
  );
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function parseReleaseDate(text: string): Date | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.toLowerCase().includes('coming soon')) return null;
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

function parseReviewTooltip(tooltip: string): { totalReviews: number; positivePct: number } | null {
  const match = tooltip.match(/(\d+)%\s+of\s+(?:the\s+)?([\d,]+)\s+user\s+reviews?/i);
  if (!match) return null;
  return {
    positivePct: parseInt(match[1], 10),
    totalReviews: parseInt(match[2].replace(/,/g, ''), 10),
  };
}

function parseOriginalPriceCents(row: Element): number {
  const originalPriceEl = row.querySelector('.discount_original_price');
  if (originalPriceEl) {
    const text = originalPriceEl.textContent ?? '';
    const digits = text.replace(/[^0-9]/g, '');
    if (digits) return parseInt(digits, 10);
  }

  const priceAttr = row.querySelector('[data-price-final]')?.getAttribute('data-price-final');
  return priceAttr ? parseInt(priceAttr, 10) : 0;
}

function parseSearchResults(html: string, now: Date): { games: SteamGame[]; reachedCutoff: boolean } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const rows = doc.querySelectorAll('a[data-ds-appid]');
  const games: SteamGame[] = [];
  let reachedCutoff = false;

  for (const row of rows) {
    const appid = parseInt(row.getAttribute('data-ds-appid') ?? '', 10);
    if (isNaN(appid)) continue;

    const name = row.querySelector('.title')?.textContent?.trim() ?? '';
    const href = row.getAttribute('href') ?? `https://store.steampowered.com/app/${appid}`;

    const releaseDateText = row.querySelector('.search_released')?.textContent ?? '';
    const releaseDate = parseReleaseDate(releaseDateText);
    if (!releaseDate) continue;

    const monthsSinceRelease = monthsBetween(releaseDate, now);

    if (monthsSinceRelease > MAX_AGE_MONTHS) {
      reachedCutoff = true;
      break;
    }

    const daysSinceRelease = (now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceRelease < MIN_AGE_DAYS) continue;

    const originalPriceCents = parseOriginalPriceCents(row);

    const reviewEl = row.querySelector('.search_review_summary');
    const tooltip = reviewEl?.getAttribute('data-tooltip-html') ?? '';
    const reviewData = parseReviewTooltip(tooltip);

    games.push({
      appid,
      name,
      totalReviews: reviewData?.totalReviews ?? 0,
      reviewPositivePct: reviewData?.positivePct ?? 0,
      priceInCents: originalPriceCents,
      releaseDate,
      monthsSinceRelease,
      estimatedSales: reviewData ? estimateSalesFromReviews(reviewData.totalReviews) : 0,
      storeUrl: href,
    });
  }

  return { games, reachedCutoff };
}

export interface FetchProgress {
  page: number;
  gamesFound: number;
  status: string;
}

/**
 * Start background fetch of all indie Steam games from the last 24 months.
 * Clears existing data and rebuilds from scratch.
 * Results are saved incrementally per page to IndexedDB.
 */
export async function startBackgroundFetch(
  onProgress?: (progress: FetchProgress) => void,
): Promise<void> {
  if (fetchInProgress) return;
  fetchInProgress = true;

  try {
    // Check if cache is complete and fresh
    if (await isCacheFresh()) {
      cachedGames = await getCache();
      fetchComplete = true;
      onProgress?.({ page: 0, gamesFound: cachedGames?.length ?? 0, status: 'Loaded from cache' });
      return;
    }

    // Clear stale/partial data and start fresh
    await markFetchStarted();

    const rateLimitedFetch = createRateLimitedFetcher(2000, (msg) => {
      onProgress?.({ page: 0, gamesFound: 0, status: msg });
    });

    const now = new Date();
    let totalGamesFound = 0;
    let page = 0;

    while (true) {
      const start = page * RESULTS_PER_PAGE;
      const url = buildSearchUrl(start);

      onProgress?.({ page: page + 1, gamesFound: totalGamesFound, status: `Fetching page ${page + 1}...` });

      const response = await rateLimitedFetch(url);
      const data = await response.json();

      if (!data.results_html) break;

      const { games, reachedCutoff } = parseSearchResults(data.results_html, now);

      // Save this page immediately to IndexedDB
      if (games.length > 0) {
        await savePage(games);
        totalGamesFound += games.length;
      }

      if (reachedCutoff) break;

      const totalCount = data.total_count ?? 0;
      if (start + RESULTS_PER_PAGE >= totalCount) break;

      page++;
    }

    // Mark fetch as complete
    await markFetchComplete();
    cachedGames = await getCache();
    fetchComplete = true;

    onProgress?.({ page, gamesFound: totalGamesFound, status: 'Complete' });
  } finally {
    fetchInProgress = false;
  }
}

/** Get cached games (from memory if available, otherwise from IndexedDB) */
export async function getComparableGames(): Promise<SteamGame[]> {
  if (cachedGames) return cachedGames;
  cachedGames = await getCache();
  return cachedGames ?? [];
}

/** Whether the background fetch has completed (either from cache or network) */
export function isFetchDone(): boolean {
  return fetchComplete;
}

/** Start background fetch lazily — only runs once, subsequent calls are no-ops */
export function ensureFetchStarted(
  onProgress?: (progress: FetchProgress) => void,
): void {
  if (fetchComplete || fetchInProgress) return;
  startBackgroundFetch(onProgress).catch(() => {
    // Errors are surfaced via onProgress or swallowed if no callback
  });
}
