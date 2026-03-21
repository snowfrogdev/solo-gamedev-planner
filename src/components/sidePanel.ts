import type { PlannedProject, DowntimeBreakdown, PricingInfo } from '../types';

function fmt(n: number): string {
  return n.toFixed(1);
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function createSidePanel(
  container: HTMLElement,
): { show(project: PlannedProject, breakdown: DowntimeBreakdown, pricing: PricingInfo): void; hide(): void; destroy(): void } {
  const overlay = document.createElement('div');
  overlay.className = 'side-panel-overlay';

  const panel = document.createElement('aside');
  panel.className = 'side-panel';

  overlay.appendChild(panel);
  container.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') hide();
  }
  document.addEventListener('keydown', onKeyDown);

  function hide(): void {
    overlay.classList.remove('visible');
  }

  function show(project: PlannedProject, breakdown: DowntimeBreakdown, pricing: PricingInfo): void {
    const cycleDuration = project.devDurationMonths + project.downtimeMonths;

    panel.innerHTML = `
      <div class="side-panel-header">
        <h2>Game #${project.index + 1}</h2>
        <button class="close-btn" aria-label="Close">&times;</button>
      </div>

      <div class="side-panel-section">
        <h3>Scope</h3>
        <div class="side-panel-row">
          <span>Dev Duration</span>
          <span class="side-panel-value">${fmt(project.devDurationMonths)} mo</span>
        </div>
        <div class="side-panel-row">
          <span>Start</span>
          <span class="side-panel-value">Month ${fmt(project.startMonth)}</span>
        </div>
        <div class="side-panel-row">
          <span>End</span>
          <span class="side-panel-value">Month ${fmt(project.endMonth)}</span>
        </div>
      </div>

      <div class="side-panel-section">
        <h3>Downtime</h3>
        <div class="side-panel-row">
          <span>Total</span>
          <span class="side-panel-value">${fmt(breakdown.total)} mo</span>
        </div>
        <div class="side-panel-row sub">
          <span>Post-Launch Support</span>
          <span class="side-panel-value">${fmt(breakdown.postLaunchSupport)} mo</span>
        </div>
        <div class="side-panel-row sub">
          <span>Creative Recovery</span>
          <span class="side-panel-value">${fmt(breakdown.creativeRecovery)} mo</span>
        </div>
      </div>

      <div class="side-panel-section">
        <h3>Cycle</h3>
        <div class="side-panel-row">
          <span>Total Cycle</span>
          <span class="side-panel-value">${fmt(cycleDuration)} mo</span>
        </div>
        <div class="side-panel-row">
          <span>Cycle End</span>
          <span class="side-panel-value">Month ${fmt(project.cycleEndMonth)}</span>
        </div>
      </div>

      <div class="side-panel-section">
        <h3>Financial</h3>
        <div class="side-panel-row">
          <span>Launch Price</span>
          <span class="side-panel-value">${fmtUsd(pricing.launchPrice)}</span>
        </div>
        <div class="side-panel-row sub">
          <span>Month 1 AEP</span>
          <span class="side-panel-value">${fmtUsd(pricing.aepMonth1)}</span>
        </div>
        <div class="side-panel-row sub">
          <span>Year 1 AEP</span>
          <span class="side-panel-value">${fmtUsd(pricing.aepYear1)}</span>
        </div>
        <div class="side-panel-row sub">
          <span>Year 3 AEP</span>
          <span class="side-panel-value">${fmtUsd(pricing.aepYear3)}</span>
        </div>
      </div>
    `;

    panel.querySelector('.close-btn')!.addEventListener('click', hide);
    overlay.classList.add('visible');
  }

  function destroy(): void {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  }

  return { show, hide, destroy };
}
