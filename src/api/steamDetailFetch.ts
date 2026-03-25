/**
 * Background fetcher for Steam game details (genres, Early Access status).
 * Runs as a second phase after the search fetch completes, enriching cached
 * games with data from Steam's appdetails API. Processes cheapest games first.
 * Saves incrementally to IndexedDB and is resumable across sessions.
 */

import { createRateLimitedFetcher } from './rateLimiter';
import {
  getCache,
  getGamesWithoutDetails,
  getDetailFetchProgress,
  saveGameWithDetails,
  saveDetailFetchProgress,
  markDetailFetchComplete,
  isDetailFetchComplete,
} from './steamCache';
import type { SteamGame, SteamGameDetails, DetailFetchProgress } from '../types';
export type { DetailFetchProgress } from '../types';

let detailFetchInProgress = false;
let detailFetchDone = false;

/** Parse Steam appdetails JSON into a SteamGameDetails object */
function parseAppDetails(data: Record<string, unknown>): SteamGameDetails | null {
  const appData = data as { success?: boolean; data?: {
    genres?: Array<{ id: string; description: string }>;
    categories?: Array<{ id: number; description: string }>;
  } };

  if (!appData.success || !appData.data) return null;

  const genres = appData.data.genres?.map((g) => g.description) ?? [];

  // Early Access is indicated by category id 70
  const isEarlyAccess = appData.data.categories?.some((c) => c.id === 70) ?? false;

  return {
    genres,
    isEarlyAccess,
    fetchedAt: Date.now(),
  };
}

/** Fetch Chinese review percentage via the appreviews API.
 *  Both numerator and denominator come from the same API to avoid count mismatches. */
async function fetchChineseReviewPct(
  appid: number,
  fetcher: (url: string) => Promise<Response>,
): Promise<number> {
  // Total reviews (all languages)
  const allUrl = `https://store.steampowered.com/appreviews/${appid}?json=1&language=all&num_per_page=0&purchase_type=all`;
  const allResp = await fetcher(allUrl);
  const allJson = await allResp.json();
  const allCount = (allJson?.query_summary?.total_positive ?? 0) + (allJson?.query_summary?.total_negative ?? 0);
  if (allCount <= 0) return 0;

  // Chinese reviews
  const cnUrl = `https://store.steampowered.com/appreviews/${appid}?json=1&language=schinese&num_per_page=0&purchase_type=all`;
  const cnResp = await fetcher(cnUrl);
  const cnJson = await cnResp.json();
  const cnCount = (cnJson?.query_summary?.total_positive ?? 0) + (cnJson?.query_summary?.total_negative ?? 0);

  return cnCount / allCount;
}

/** Fetch details for a single game via the appdetails API + Chinese review percentage */
async function fetchSingleDetail(
  game: SteamGame,
  fetcher: (url: string) => Promise<Response>,
): Promise<SteamGameDetails | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${game.appid}&cc=us`;
  const response = await fetcher(url);
  const json = await response.json();
  const entry = json[String(game.appid)];
  if (!entry) return null;
  const details = parseAppDetails(entry);
  if (!details) return null;

  try {
    details.chineseReviewPct = await fetchChineseReviewPct(game.appid, fetcher);
  } catch {
    // Non-critical — leave chineseReviewPct undefined on failure
  }

  return details;
}

/**
 * Start background fetch of details for all cached games.
 * Processes games sorted by price ascending (cheapest first).
 * Saves incrementally and checkpoints every 10 games for resumability.
 */
export async function startDetailFetch(
  onProgress?: (progress: DetailFetchProgress) => void,
): Promise<void> {
  if (detailFetchInProgress) return;
  detailFetchInProgress = true;

  try {
    if (await isDetailFetchComplete()) {
      detailFetchDone = true;
      const all = await getCache();
      onProgress?.({
        processed: all?.length ?? 0,
        total: all?.length ?? 0,
        currentGame: '',
        status: 'Loaded from cache',
      });
      return;
    }

    const gamesWithoutDetails = await getGamesWithoutDetails();
    if (gamesWithoutDetails.length === 0) {
      await markDetailFetchComplete();
      detailFetchDone = true;
      onProgress?.({ processed: 0, total: 0, currentGame: '', status: 'Complete' });
      return;
    }

    // Resume point: checkpoint tracks cumulative count for progress display,
    // but gamesWithoutDetails already excludes processed games, so loop from 0.
    const checkpoint = await getDetailFetchProgress();
    const alreadyProcessed = checkpoint?.totalProcessed ?? 0;
    const total = gamesWithoutDetails.length + alreadyProcessed;

    const rateLimitedFetch = createRateLimitedFetcher(3000, (msg) => {
      onProgress?.({ processed: alreadyProcessed, total, currentGame: '', status: msg });
    });

    for (let i = 0; i < gamesWithoutDetails.length; i++) {
      const game = gamesWithoutDetails[i];

      onProgress?.({
        processed: alreadyProcessed + i,
        total,
        currentGame: game.name,
        status: `Enriching game data…`,
      });

      try {
        const details = await fetchSingleDetail(game, rateLimitedFetch);
        if (details) {
          game.details = details;
          await saveGameWithDetails(game);
        }
      } catch {
        // Skip failed games — they can be retried on next session
      }

      // Checkpoint every 10 games
      if ((alreadyProcessed + i + 1) % 10 === 0) {
        await saveDetailFetchProgress(alreadyProcessed + i + 1);
      }
    }

    await markDetailFetchComplete();
    detailFetchDone = true;
    onProgress?.({ processed: total, total, currentGame: '', status: 'Complete' });
  } finally {
    detailFetchInProgress = false;
  }
}

/** Start detail fetch lazily — only runs once, subsequent calls are no-ops */
export function ensureDetailFetchStarted(
  onProgress?: (progress: DetailFetchProgress) => void,
): void {
  if (detailFetchDone || detailFetchInProgress) return;
  startDetailFetch(onProgress).catch(() => {
    // Errors are surfaced via onProgress or swallowed if no callback
  });
}

/**
 * Fetch details on-demand for specific games (used by progressive refinement
 * in the side panel comparison). Uses a shorter rate-limit delay since this
 * is user-initiated.
 *
 * Note: this may run concurrently with the background detail fetch. Both can
 * fetch the same appid simultaneously — this is benign since both writes are
 * idempotent (same data structure, last-write-wins in IndexedDB).
 */
export async function fetchDetailsForGames(appids: number[]): Promise<SteamGame[]> {
  const allGames = await getCache();
  if (!allGames) return [];

  const gameMap = new Map(allGames.map((g) => [g.appid, g]));
  const rateLimitedFetch = createRateLimitedFetcher(2000);
  const results: SteamGame[] = [];

  for (const appid of appids) {
    const game = gameMap.get(appid);
    if (!game) continue;

    // Backfill chineseReviewPct for games with details from a prior cache version
    if (game.details && game.details.chineseReviewPct === undefined) {
      try {
        game.details.chineseReviewPct = await fetchChineseReviewPct(appid, rateLimitedFetch);
        await saveGameWithDetails(game);
      } catch {
        // Non-critical — continue without it
      }
      results.push(game);
      continue;
    }

    // Skip if details already present
    if (game.details) {
      results.push(game);
      continue;
    }

    try {
      const details = await fetchSingleDetail(game, rateLimitedFetch);
      if (details) {
        game.details = details;
        await saveGameWithDetails(game);
      }
      results.push(game);
    } catch {
      results.push(game); // Return without details on failure
    }
  }

  return results;
}
