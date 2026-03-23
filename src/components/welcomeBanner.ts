const STORAGE_KEY = 'sgp-welcome-dismissed';

export function createWelcomeBanner(
  container: HTMLElement,
): { show(): void; destroy(): void } {
  const dismissed = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1';

  const banner = document.createElement('div');
  banner.className = `welcome-banner${dismissed ? ' welcome-banner-hidden' : ''}`;
  banner.innerHTML = `
    <div class="welcome-banner-content">
      <p>
        Plan your path from small first games to a sustainable indie career.
        This tool generates a portfolio of progressively larger projects,
        estimates revenue from real Steam data, and shows when you might reach
        your income target.
      </p>
      <p class="welcome-philosophy">
        Start small, ship often, and grow your scope over time &mdash; many smaller games is lower risk than one big bet.
      </p>
    </div>
    <button class="welcome-dismiss" aria-label="Dismiss welcome message">Got it</button>
  `;

  container.appendChild(banner);

  const dismissBtn = banner.querySelector<HTMLButtonElement>('.welcome-dismiss')!;
  dismissBtn.addEventListener('click', () => {
    banner.classList.add('welcome-banner-hidden');
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, '1');
  });

  return {
    show() {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
      banner.classList.remove('welcome-banner-hidden');
    },
    destroy() {
      banner.remove();
    },
  };
}
