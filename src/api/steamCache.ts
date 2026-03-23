import type { SteamGame } from '../types';

const DB_NAME = 'solo-gamedev-planner';
/** Bump version when stores change. onupgradeneeded creates missing stores. */
const DB_VERSION = 2;
const GAMES_STORE = 'steam-games';
const META_STORE = 'steam-meta';
const DETAILS_META_STORE = 'steam-details-meta';
const CACHE_MAX_AGE_DAYS = 30;

let dbPromise: Promise<IDBDatabase> | null = null;
function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GAMES_STORE)) {
        db.createObjectStore(GAMES_STORE, { keyPath: 'appid' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
      if (!db.objectStoreNames.contains(DETAILS_META_STORE)) {
        db.createObjectStore(DETAILS_META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get all cached Steam games, or null if cache is empty/missing */
export async function getCache(): Promise<SteamGame[] | null> {
  try {
    const db = await getDb();
    const tx = db.transaction(GAMES_STORE, 'readonly');
    const games = await txPromise(tx.objectStore(GAMES_STORE).getAll());
    for (const g of games) {
      if (typeof g.releaseDate === 'string') g.releaseDate = new Date(g.releaseDate);
    }
    return games.length > 0 ? games : null;
  } catch {
    return null;
  }
}

/** Check if cache is complete and fresh (< 30 days old) */
export async function isCacheFresh(): Promise<boolean> {
  try {
    const db = await getDb();
    const tx = db.transaction(META_STORE, 'readonly');
    const store = tx.objectStore(META_STORE);
    const status = await txPromise(store.get('fetchStatus'));
    const timestamp = await txPromise(store.get('fetchTimestamp'));

    if (status !== 'complete' || !timestamp) return false;
    const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
    return ageDays < CACHE_MAX_AGE_DAYS;
  } catch {
    return false;
  }
}

/** Save one page of games to the cache (incremental) */
export async function savePage(games: SteamGame[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(GAMES_STORE, 'readwrite');
  const store = tx.objectStore(GAMES_STORE);
  for (const game of games) {
    store.put(game);
  }
  await txComplete(tx);
}

/** Mark fetch as started — clears all game data for a fresh start */
export async function markFetchStarted(): Promise<void> {
  const db = await getDb();

  const gameTx = db.transaction(GAMES_STORE, 'readwrite');
  gameTx.objectStore(GAMES_STORE).clear();
  await txComplete(gameTx);

  const metaTx = db.transaction(META_STORE, 'readwrite');
  metaTx.objectStore(META_STORE).put('in-progress', 'fetchStatus');
  metaTx.objectStore(META_STORE).delete('fetchTimestamp');
  await txComplete(metaTx);
}

/** Mark fetch as complete with current timestamp */
export async function markFetchComplete(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(META_STORE, 'readwrite');
  const store = tx.objectStore(META_STORE);
  store.put('complete', 'fetchStatus');
  store.put(Date.now(), 'fetchTimestamp');
  await txComplete(tx);
}

/** Clear all cached data */
export async function clearCache(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([GAMES_STORE, META_STORE, DETAILS_META_STORE], 'readwrite');
  tx.objectStore(GAMES_STORE).clear();
  tx.objectStore(META_STORE).clear();
  tx.objectStore(DETAILS_META_STORE).clear();
  await txComplete(tx);
}

// --- Detail fetch persistence ---

/** Save a single game with updated details back to the store */
export async function saveGameWithDetails(game: SteamGame): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(GAMES_STORE, 'readwrite');
  tx.objectStore(GAMES_STORE).put(game);
  await txComplete(tx);
}

/** Get detail-fetch progress checkpoint */
export async function getDetailFetchProgress(): Promise<{ totalProcessed: number } | null> {
  try {
    const db = await getDb();
    const tx = db.transaction(DETAILS_META_STORE, 'readonly');
    const store = tx.objectStore(DETAILS_META_STORE);
    const totalProcessed = await txPromise(store.get('totalProcessed'));
    if (totalProcessed == null) return null;
    return { totalProcessed };
  } catch {
    return null;
  }
}

/** Save detail-fetch progress checkpoint */
export async function saveDetailFetchProgress(totalProcessed: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(DETAILS_META_STORE, 'readwrite');
  tx.objectStore(DETAILS_META_STORE).put(totalProcessed, 'totalProcessed');
  await txComplete(tx);
}

/** Mark detail fetch as complete */
export async function markDetailFetchComplete(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(DETAILS_META_STORE, 'readwrite');
  const store = tx.objectStore(DETAILS_META_STORE);
  store.put('complete', 'detailFetchStatus');
  store.put(Date.now(), 'detailFetchTimestamp');
  await txComplete(tx);
}

/** Check if detail fetch is complete */
export async function isDetailFetchComplete(): Promise<boolean> {
  try {
    const db = await getDb();
    const tx = db.transaction(DETAILS_META_STORE, 'readonly');
    const status = await txPromise(tx.objectStore(DETAILS_META_STORE).get('detailFetchStatus'));
    return status === 'complete';
  } catch {
    return false;
  }
}

/** Get all cached games without details, sorted by price ascending */
export async function getGamesWithoutDetails(): Promise<SteamGame[]> {
  const all = await getCache();
  if (!all) return [];
  const without = all.filter((g) => !g.details);
  without.sort((a, b) => a.priceInCents - b.priceInCents);
  return without;
}
