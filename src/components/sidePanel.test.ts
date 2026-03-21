import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GlobalWindow } from 'happy-dom';
import { createSidePanel } from './sidePanel';
import type { PlannedProject, DowntimeBreakdown, PricingInfo, SalesTimeSeries } from '../types';
import { computeSalesTimeSeries } from '../engine/salesModel';

const project: PlannedProject = {
  index: 2,
  startMonth: 5,
  devDurationMonths: 3,
  endMonth: 8,
  downtimeMonths: 1.5,
  cycleEndMonth: 9.5,
};

const breakdown: DowntimeBreakdown = {
  total: 1.5,
  postLaunchSupport: 1.0,
  creativeRecovery: 0.5,
};

const pricing: PricingInfo = {
  launchPrice: 4.99,
  rawPrice: 3.20,
};

const sales: SalesTimeSeries = computeSalesTimeSeries(8, 120, 500, 4.99);

let window: InstanceType<typeof GlobalWindow>;
let container: HTMLElement;

beforeEach(() => {
  window = new GlobalWindow();
  globalThis.document = window.document as unknown as Document;
  globalThis.KeyboardEvent = window.KeyboardEvent as unknown as typeof KeyboardEvent;
  globalThis.MouseEvent = window.MouseEvent as unknown as typeof MouseEvent;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  window.close();
});

describe('createSidePanel', () => {
  test('show() renders correct values and adds visible class', () => {
    const panel = createSidePanel(container);
    panel.show(project, breakdown, pricing);

    const overlay = container.querySelector('.side-panel-overlay')!;
    expect(overlay.classList.contains('visible')).toBe(true);

    const values = Array.from(overlay.querySelectorAll('.side-panel-value'))
      .map((el) => el.textContent!.trim());

    expect(values).toContain('3.0 mo');     // Dev Duration
    expect(values).toContain('Month 5.0');  // Start
    expect(values).toContain('Month 8.0');  // End
    expect(values).toContain('1.5 mo');     // Total downtime
    expect(values).toContain('1.0 mo');     // Post-Launch Support
    expect(values).toContain('0.5 mo');     // Creative Recovery
    expect(values).toContain('4.5 mo');     // Total Cycle (3 + 1.5)
    expect(values).toContain('Month 9.5');  // Cycle End

    panel.destroy();
  });

  test('show() renders correct project number (1-indexed)', () => {
    const panel = createSidePanel(container);
    panel.show(project, breakdown, pricing);

    const heading = container.querySelector('.side-panel-header h2')!;
    expect(heading.textContent).toBe('Game #3');

    panel.destroy();
  });

  test('hide() removes visible class', () => {
    const panel = createSidePanel(container);
    panel.show(project, breakdown, pricing);

    const overlay = container.querySelector('.side-panel-overlay')!;
    expect(overlay.classList.contains('visible')).toBe(true);

    panel.hide();
    expect(overlay.classList.contains('visible')).toBe(false);

    panel.destroy();
  });

  test('overlay click dismisses panel', () => {
    const panel = createSidePanel(container);
    panel.show(project, breakdown, pricing);

    const overlay = container.querySelector('.side-panel-overlay')!;
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay.classList.contains('visible')).toBe(false);

    panel.destroy();
  });

  test('clicking inside panel does not dismiss', () => {
    const panel = createSidePanel(container);
    panel.show(project, breakdown, pricing);

    const aside = container.querySelector('.side-panel')!;
    aside.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const overlay = container.querySelector('.side-panel-overlay')!;
    expect(overlay.classList.contains('visible')).toBe(true);

    panel.destroy();
  });

  test('close button dismisses panel', () => {
    const panel = createSidePanel(container);
    panel.show(project, breakdown, pricing);

    const closeBtn = container.querySelector('.close-btn')!;
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: false }));

    const overlay = container.querySelector('.side-panel-overlay')!;
    expect(overlay.classList.contains('visible')).toBe(false);

    panel.destroy();
  });

  test('Escape key dismisses panel', () => {
    const panel = createSidePanel(container);
    panel.show(project, breakdown, pricing);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    const overlay = container.querySelector('.side-panel-overlay')!;
    expect(overlay.classList.contains('visible')).toBe(false);

    panel.destroy();
  });

  test('show() renders pricing info', () => {
    const panel = createSidePanel(container);
    panel.show(project, breakdown, pricing);

    const values = Array.from(container.querySelectorAll('.side-panel-value'))
      .map((el) => el.textContent!.trim());

    expect(values).toContain('$4.99'); // Launch Price

    panel.destroy();
  });

  test('destroy() removes DOM elements', () => {
    const panel = createSidePanel(container);
    panel.show(project, breakdown, pricing);

    expect(container.querySelector('.side-panel-overlay')).not.toBeNull();

    panel.destroy();
    expect(container.querySelector('.side-panel-overlay')).toBeNull();
  });

  test('show() renders revenue chart section when sales data provided', () => {
    const panel = createSidePanel(container);
    panel.show(project, breakdown, pricing, sales);

    const headings = Array.from(container.querySelectorAll('h3'))
      .map((el) => el.textContent!.trim());
    expect(headings).toContain('Revenue Over Time');

    panel.destroy();
  });

  test('show() renders revenue chart SVG when sales data provided', () => {
    const panel = createSidePanel(container);
    panel.show(project, breakdown, pricing, sales);

    const svg = container.querySelector('.revenue-chart');
    expect(svg).not.toBeNull();

    // 3 data lines: units, revenue, price
    const lines = container.querySelectorAll('.line-units, .line-revenue, .line-price');
    expect(lines.length).toBe(3);

    panel.destroy();
  });

  test('show() omits revenue section when no sales data', () => {
    const panel = createSidePanel(container);
    panel.show(project, breakdown, pricing);

    const headings = Array.from(container.querySelectorAll('h3'))
      .map((el) => el.textContent!.trim());
    expect(headings).not.toContain('Revenue Over Time');
    expect(container.querySelector('.revenue-chart')).toBeNull();

    panel.destroy();
  });
});
