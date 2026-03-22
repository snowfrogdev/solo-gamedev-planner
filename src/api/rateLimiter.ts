import { proxyFetch } from './proxyFetch';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 300_000; // 5 minutes

/**
 * Creates a rate-limited fetch function that wraps proxyFetch.
 * Enforces minimum delay between requests and handles 429 responses
 * with exponential backoff.
 */
export function createRateLimitedFetcher(
  minDelayMs = 2000,
  onStatus?: (msg: string) => void,
): (url: string, init?: RequestInit) => Promise<Response> {
  let lastRequestTime = 0;
  let consecutiveBackoffs = 0;

  async function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  return async function rateLimitedFetch(url: string, init?: RequestInit): Promise<Response> {
    // Enforce minimum delay between requests
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < minDelayMs) {
      await wait(minDelayMs - elapsed);
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      lastRequestTime = Date.now();

      try {
        const response = await proxyFetch(url, init);

        if (response.status === 429) {
          const backoffMs = Math.min(
            INITIAL_BACKOFF_MS * Math.pow(2, consecutiveBackoffs),
            MAX_BACKOFF_MS,
          );
          consecutiveBackoffs++;

          if (attempt >= MAX_RETRIES) {
            throw new Error(`Rate limited after ${MAX_RETRIES} retries`);
          }

          onStatus?.(`Rate limited, retrying in ${Math.round(backoffMs / 1000)}s...`);
          await wait(backoffMs);
          continue;
        }

        // Successful request — reset backoff counter
        consecutiveBackoffs = 0;
        return response;
      } catch (err) {
        // Only 429s are retried (handled above). Network/proxy failures
        // propagate immediately — proxyFetch already cycles all proxies,
        // so if it throws, all proxies have failed.
        throw err;
      }
    }

    throw new Error(`Rate limited fetch failed for: ${url}`);
  };
}
