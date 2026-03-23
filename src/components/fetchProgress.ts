/**
 * Non-intrusive progress toast for background Steam data fetching.
 * Shows two phases: search fetch (with date-based progress) and detail fetch (with count).
 * Includes a pulsing dot animation so the toast never looks frozen between updates.
 */

import type { FetchProgress, DetailFetchProgress } from '../types';

const MAX_SEARCH_WINDOW_MS = 24 * 30 * 24 * 60 * 60 * 1000; // ~24 months in ms
const FADE_DELAY_MS = 3000;

export function createFetchProgress(container: HTMLElement): {
  updateSearch(progress: FetchProgress): void;
  updateDetail(progress: DetailFetchProgress): void;
  destroy(): void;
} {
  const el = document.createElement('div');
  el.className = 'fetch-progress';
  el.style.display = 'none';
  container.appendChild(el);

  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSearchPct = -1; // track last known percentage so we never regress

  function show(html: string, done = false): void {
    if (fadeTimer) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
    el.innerHTML = html;
    el.classList.toggle('fp-done', done);
    el.style.display = '';
    el.style.opacity = '1';
  }

  function fadeOut(): void {
    fadeTimer = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.style.display = 'none'; }, 300);
    }, FADE_DELAY_MS);
  }

  function formatPct(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  function updateSearch(progress: FetchProgress): void {
    if (progress.status === 'Loaded from cache') {
      return;
    }

    if (progress.status === 'Complete') {
      lastSearchPct = -1;
      show(
        `<span class="fp-row">Steam data ready · ${progress.gamesFound.toLocaleString()} games</span>`,
        true,
      );
      fadeOut();
      return;
    }

    // Compute percentage from release date coverage (never regress)
    if (progress.oldestReleaseDate) {
      const elapsed = Date.now() - progress.oldestReleaseDate.getTime();
      const pct = Math.min(elapsed / MAX_SEARCH_WINDOW_MS, 0.99);
      if (pct > lastSearchPct) lastSearchPct = pct;
    }

    const pctStr = lastSearchPct >= 0 ? formatPct(lastSearchPct) : '';
    const countStr = progress.gamesFound > 0
      ? `${progress.gamesFound.toLocaleString()} found`
      : 'Starting…';

    show(
      `<span class="fp-row">` +
        `<span class="fp-label">Indexing Steam games…</span>` +
        (pctStr ? ` <span class="fp-pct">${pctStr}</span>` : '') +
      `</span>` +
      `<span class="fp-row fp-sub">${countStr} · You can keep using the app</span>`,
    );
  }

  function updateDetail(progress: DetailFetchProgress): void {
    if (progress.status === 'Loaded from cache') {
      return;
    }

    if (progress.status === 'Complete') {
      show(
        `<span class="fp-row">Game data enrichment complete</span>`,
        true,
      );
      fadeOut();
      return;
    }

    // Rate limit backoff messages
    if (progress.status.includes('retrying')) {
      show(`<span class="fp-row"><span class="fp-label">${progress.status}</span></span>`);
      return;
    }

    const pct = progress.total > 0 ? progress.processed / progress.total : 0;
    show(
      `<span class="fp-row">` +
        `<span class="fp-label">Enriching game data…</span>` +
        ` <span class="fp-pct">${formatPct(pct)}</span>` +
      `</span>` +
      `<span class="fp-row fp-sub">${progress.processed} / ${progress.total}</span>`,
    );
  }

  function destroy(): void {
    if (fadeTimer) clearTimeout(fadeTimer);
    el.remove();
  }

  return { updateSearch, updateDetail, destroy };
}
