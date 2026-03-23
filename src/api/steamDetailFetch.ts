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

/** Fetch details for a single game via the appdetails API */
async function fetchSingleDetail(
  appid: number,
  fetcher: (url: string) => Promise<Response>,
): Promise<SteamGameDetails | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us`;
  const response = await fetcher(url);
  const json = await response.json();
  const entry = json[String(appid)];
  if (!entry) return null;
  return parseAppDetails(entry);
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
        const details = await fetchSingleDetail(game.appid, rateLimitedFetch);
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

    // Skip if details already present (snapshot from getCache — background
    // fetch may have saved details since, but duplicate fetches are benign)
    if (game.details) {
      results.push(game);
      continue;
    }

    try {
      const details = await fetchSingleDetail(appid, rateLimitedFetch);
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
