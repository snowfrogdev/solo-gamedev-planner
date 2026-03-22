type ProxyBuilder = (url: string) => string;

const PROXIES: ProxyBuilder[] = [
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

let lastWorkingIndex = 0;

/**
 * Fetches a URL through CORS proxies, cycling through services on network failure.
 * Returns whatever the upstream server responds (including non-OK statuses like 429).
 * Only cycles to the next proxy on network errors — not on non-2xx responses.
 */
export async function proxyFetch(url: string, init?: RequestInit): Promise<Response> {
  const order = [
    lastWorkingIndex,
    ...PROXIES.map((_, i) => i).filter((i) => i !== lastWorkingIndex),
  ];

  for (const idx of order) {
    const proxiedUrl = PROXIES[idx](url);
    try {
      const response = await fetch(proxiedUrl, init);
      lastWorkingIndex = idx;
      return response;
    } catch {
      // Try next proxy
    }
  }

  throw new Error(`All CORS proxies failed for: ${url}`);
}
