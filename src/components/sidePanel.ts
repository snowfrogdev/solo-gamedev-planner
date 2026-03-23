import * as d3 from 'd3';
import type { PlannedProject, DowntimeBreakdown, PricingInfo, SalesTimeSeries, SteamGame } from '../types';
import { fmtCompact } from '../utils/format';
import { buildComparisonReport, filterByPriceTier } from '../engine/steamComparison';
import { DEFAULT_PLATFORM_CUT_RATE, computeProjectFinancials } from '../engine/expenses';
import type { SteamComparisonReport, SalesBreakdown } from '../engine/steamComparison';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatBreakdownTooltip(b: SalesBreakdown): string {
  const lines: string[] = [`Multiplier: ${b.multiplier.toFixed(1)}×`];
  const factors: Array<{ name: string; detail: { raw: number; dampened: number }; label?: string }> = [
    { name: 'Volume', detail: b.volume },
    { name: 'Price', detail: b.price },
    { name: 'Sentiment', detail: b.sentiment },
    { name: 'Chinese', detail: b.cjkAudience },
    { name: 'Genre', detail: b.genre, label: b.genre.label },
    { name: 'EA', detail: b.earlyAccess },
  ];
  for (const f of factors) {
    if (f.detail.raw === 1.0) continue;
    const label = f.label ? ` (${f.label})` : '';
    lines.push(`${f.name}: ${f.detail.dampened.toFixed(2)}×${label}`);
  }
  return lines.join('\n');
}

function fmtMonths(n: number): string {
  return n.toFixed(1);
}

function fmtInt(n: number): string {
  return String(Math.round(n));
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// --- Chart constants ---

const CHART_MARGIN = { top: 12, right: 48, bottom: 28, left: 48 };
const CHART_HEIGHT = 280;
const CHART_COLORS = { units: '#5b9bd5', revenue: '#70ad47', price: '#ed7d31' };

interface ChartDimensions { innerW: number; innerH: number; width: number; }

type ChartDataPoint = { month: number; units: number; price: number; revenue: number };

// --- Chart scales ---

/** Creates X, left-Y (log), and right-Y (linear) scales for the revenue chart.
 *  Log scale is used for units/revenue because sales decay follows an exponential
 *  tail — log scale keeps both the launch spike and long-tail visible. */
function createChartScales(data: ChartDataPoint[], innerW: number, innerH: number) {
  const months = data.length;

  const xScale = d3.scaleLinear()
    .domain([1, months])
    .range([0, innerW]);

  const leftMax = Math.max(
    d3.max(data, (d) => d.units) ?? 1,
    d3.max(data, (d) => d.revenue) ?? 1,
  );
  const leftScale = d3.scaleLog()
    .domain([1, leftMax * 1.05])
    .range([innerH, 0])
    .clamp(true);

  const rightMax = d3.max(data, (d) => d.price) ?? 1;
  const rightScale = d3.scaleLinear()
    .domain([0, rightMax * 1.15])
    .range([innerH, 0]);

  return { xScale, leftScale, rightScale };
}

// --- Chart axes ---

function drawChartAxes(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  scales: ReturnType<typeof createChartScales>,
  months: number,
  innerW: number,
  innerH: number,
): void {
  const tickCount = Math.min(months, 6);
  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .attr('class', 'axis')
    .call(d3.axisBottom(scales.xScale).ticks(tickCount).tickFormat((d) => `${d}mo`));

  g.append('g')
    .attr('class', 'axis axis-left')
    .call(d3.axisLeft(scales.leftScale).ticks(5, '~s'));

  g.append('g')
    .attr('class', 'axis axis-right')
    .attr('transform', `translate(${innerW},0)`)
    .call(d3.axisRight(scales.rightScale).ticks(5).tickFormat((d) => `$${(d as number).toFixed(0)}`));
}

// --- Chart lines ---

function drawChartLines(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: ChartDataPoint[],
  scales: ReturnType<typeof createChartScales>,
): void {
  const { xScale, leftScale, rightScale } = scales;

  const lines: Array<{ class: string; color: string; y: (d: ChartDataPoint) => number }> = [
    { class: 'line-units', color: CHART_COLORS.units, y: (d) => leftScale(d.units) },
    { class: 'line-revenue', color: CHART_COLORS.revenue, y: (d) => leftScale(d.revenue) },
    { class: 'line-price', color: CHART_COLORS.price, y: (d) => rightScale(d.price) },
  ];

  for (const line of lines) {
    g.append('path')
      .datum(data)
      .attr('class', line.class)
      .attr('fill', 'none')
      .attr('stroke', line.color)
      .attr('stroke-width', 1.5)
      .attr('d', d3.line<ChartDataPoint>().x((d) => xScale(d.month)).y(line.y));
  }
}

// --- Chart legend ---

function addChartLegend(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  width: number,
): void {
  const legend = svg.append('g')
    .attr('transform', `translate(${width - CHART_MARGIN.right - 60},${CHART_MARGIN.top})`);

  const items = [
    { label: 'Units', color: CHART_COLORS.units },
    { label: 'Revenue', color: CHART_COLORS.revenue },
    { label: 'Price', color: CHART_COLORS.price },
  ];

  items.forEach((item, i) => {
    const row = legend.append('g')
      .attr('transform', `translate(0,${i * 14})`);
    row.append('line')
      .attr('x1', 0).attr('x2', 14)
      .attr('y1', 4).attr('y2', 4)
      .attr('stroke', item.color)
      .attr('stroke-width', 2);
    row.append('text')
      .attr('x', 18).attr('y', 8)
      .attr('class', 'chart-legend-label')
      .attr('font-size', '10px')
      .attr('fill', 'currentColor')
      .text(item.label);
  });
}

// --- Chart tooltip ---

function addChartTooltip(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  chartContainer: HTMLElement,
  data: ChartDataPoint[],
  scales: ReturnType<typeof createChartScales>,
  dims: ChartDimensions,
): void {
  const { xScale, leftScale, rightScale } = scales;
  const { innerW, innerH, width } = dims;

  const crosshair = g.append('line')
    .attr('class', 'chart-crosshair')
    .attr('y1', 0).attr('y2', innerH)
    .attr('stroke', 'currentColor')
    .attr('stroke-opacity', 0.3)
    .attr('stroke-dasharray', '3,3')
    .style('display', 'none');

  const dotUnits = g.append('circle').attr('r', 3).attr('fill', CHART_COLORS.units).style('display', 'none');
  const dotRevenue = g.append('circle').attr('r', 3).attr('fill', CHART_COLORS.revenue).style('display', 'none');
  const dotPrice = g.append('circle').attr('r', 3).attr('fill', CHART_COLORS.price).style('display', 'none');

  const tooltip = d3.select(chartContainer)
    .append('div')
    .attr('class', 'chart-tooltip')
    .style('display', 'none');

  g.append('rect')
    .attr('class', 'chart-hover-zone')
    .attr('width', innerW)
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .on('mousemove', (event: MouseEvent) => {
      const [mx] = d3.pointer(event);
      const mIdx = Math.round(xScale.invert(mx)) - 1;
      const clamped = Math.max(0, Math.min(mIdx, data.length - 1));
      const d = data[clamped];
      const x = xScale(d.month);

      crosshair.attr('x1', x).attr('x2', x).style('display', null);
      dotUnits.attr('cx', x).attr('cy', leftScale(d.units)).style('display', null);
      dotRevenue.attr('cx', x).attr('cy', leftScale(d.revenue)).style('display', null);
      dotPrice.attr('cx', x).attr('cy', rightScale(d.price)).style('display', null);

      const onRight = x > innerW / 2;
      tooltip
        .style('display', null)
        .style('left', onRight ? '' : `${x + CHART_MARGIN.left + 8}px`)
        .style('right', onRight ? `${width - x - CHART_MARGIN.left + 8}px` : '')
        .style('top', `${CHART_MARGIN.top}px`)
        .html(
          `<strong>Month ${d.month}</strong><br>` +
          `<span style="color:${CHART_COLORS.units}">Units:</span> ${fmtCompact(d.units)}<br>` +
          `<span style="color:${CHART_COLORS.revenue}">Revenue:</span> ${fmtCompact(d.revenue, '$')}<br>` +
          `<span style="color:${CHART_COLORS.price}">Price:</span> $${d.price.toFixed(2)}`
        );
    })
    .on('mouseleave', () => {
      crosshair.style('display', 'none');
      dotUnits.style('display', 'none');
      dotRevenue.style('display', 'none');
      dotPrice.style('display', 'none');
      tooltip.style('display', 'none');
    });
}

// --- Chart orchestrator ---

function renderRevenueChart(
  chartContainer: HTMLElement,
  sales: SalesTimeSeries,
): void {
  const months = sales.monthlySales.length;
  if (months < 2) return;

  const data: ChartDataPoint[] = sales.monthlySales.map((units, i) => ({
    month: i + 1,
    units,
    price: sales.monthlyPrices[i],
    revenue: sales.monthlyRevenue[i],
  }));

  const width = chartContainer.clientWidth || 740;
  const innerW = width - CHART_MARGIN.left - CHART_MARGIN.right;
  const innerH = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;

  const svg = d3.select(chartContainer)
    .append('svg')
    .attr('class', 'revenue-chart')
    .attr('width', '100%')
    .attr('height', CHART_HEIGHT)
    .attr('viewBox', `0 0 ${width} ${CHART_HEIGHT}`);

  const g = svg.append('g')
    .attr('transform', `translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`);

  const scales = createChartScales(data, innerW, innerH);
  drawChartAxes(g, scales, months, innerW, innerH);
  drawChartLines(g, data, scales);
  addChartLegend(svg, width);
  addChartTooltip(g, chartContainer, data, scales, { innerW, innerH, width });
}

// --- Side panel factory ---

interface SidePanelShowOptions {
  sales?: SalesTimeSeries;
  steamProvider?: () => Promise<SteamGame[]>;
  platformCutRate?: number;
  detailFetcher?: (appids: number[]) => Promise<SteamGame[]>;
}

export function createSidePanel(
  container: HTMLElement,
): { show(project: PlannedProject, breakdown: DowntimeBreakdown, pricing: PricingInfo, opts?: SidePanelShowOptions): void; hide(): void; destroy(): void } {
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

  function show(project: PlannedProject, breakdown: DowntimeBreakdown, pricing: PricingInfo, opts?: SidePanelShowOptions): void {
    const { sales, steamProvider, platformCutRate, detailFetcher } = opts ?? {};
    const cycleDuration = project.devDurationMonths + project.downtimeMonths;
    const showChart = sales && sales.monthlySales.length >= 2;

    panel.innerHTML = `
      <div class="side-panel-header">
        <h2>Game #${project.index + 1}</h2>
        <button class="close-btn" aria-label="Close">&times;</button>
      </div>

      <div class="side-panel-columns">
        <div class="side-panel-section">
          <h3>Scope</h3>
          <div class="side-panel-row">
            <span>Dev Duration</span>
            <span class="side-panel-value">${fmtInt(project.devDurationMonths)} mo</span>
          </div>
          <div class="side-panel-row">
            <span>Start</span>
            <span class="side-panel-value">Month ${fmtInt(project.startMonth)}</span>
          </div>
          <div class="side-panel-row">
            <span>End</span>
            <span class="side-panel-value">Month ${fmtInt(project.endMonth)}</span>
          </div>
        </div>

        <div class="side-panel-section">
          <h3>Downtime</h3>
          <div class="side-panel-row">
            <span>Total</span>
            <span class="side-panel-value">${fmtInt(breakdown.total)} mo</span>
          </div>
          <div class="side-panel-row sub">
            <span>Post-Launch Support</span>
            <span class="side-panel-value">${fmtMonths(breakdown.postLaunchSupport)} mo</span>
          </div>
          <div class="side-panel-row sub">
            <span>Creative Recovery</span>
            <span class="side-panel-value">${fmtMonths(breakdown.creativeRecovery)} mo</span>
          </div>
        </div>

        <div class="side-panel-section">
          <h3>Cycle</h3>
          <div class="side-panel-row">
            <span>Total Cycle</span>
            <span class="side-panel-value">${fmtInt(cycleDuration)} mo</span>
          </div>
          <div class="side-panel-row">
            <span>Cycle End</span>
            <span class="side-panel-value">Month ${fmtInt(project.cycleEndMonth)}</span>
          </div>
        </div>
      </div>

      ${sales ? (() => {
        const totalRevenue = sales.monthlyRevenue.reduce((a, b) => a + b, 0);
        const cutRate = platformCutRate ?? DEFAULT_PLATFORM_CUT_RATE;
        const fin = computeProjectFinancials(totalRevenue, sales.totalDevCost, cutRate);
        return `
      <div class="side-panel-columns-2">
        <div class="side-panel-section">
          <h3>Pricing & Sales</h3>
          <div class="side-panel-row">
            <span>Launch Price</span>
            <span class="side-panel-value">${fmtUsd(pricing.launchPrice)}</span>
          </div>
          <div class="side-panel-row">
            <span>Month 1 Units</span>
            <span class="side-panel-value">${Math.round(sales.m1Units).toLocaleString()}</span>
          </div>
        </div>
        <div class="side-panel-section">
          <h3>Financials</h3>
          <div class="side-panel-row">
            <span>Total Revenue</span>
            <span class="side-panel-value">${fmtUsd(fin.totalRevenue)}</span>
          </div>
          <div class="side-panel-row sub">
            <span>Platform Fees (${Math.round(cutRate * 100)}%)</span>
            <span class="side-panel-value">-${fmtUsd(fin.platformFees)}</span>
          </div>
          <div class="side-panel-row sub">
            <span>Dev Cost</span>
            <span class="side-panel-value">-${fmtUsd(fin.totalDevCost)}</span>
          </div>
          <div class="side-panel-row">
            <span>Gross Profit</span>
            <span class="side-panel-value">${fmtUsd(fin.grossProfit)}</span>
          </div>
        </div>
      </div>`;
      })() : `
      <div class="side-panel-section">
        <h3>Pricing & Sales</h3>
        <div class="side-panel-row">
          <span>Launch Price</span>
          <span class="side-panel-value">${fmtUsd(pricing.launchPrice)}</span>
        </div>
      </div>`}
      ${showChart ? `
      <div class="side-panel-section">
        <h3>Revenue Over Time</h3>
        <div class="revenue-chart-container"></div>
      </div>
      ` : ''}
      ${sales && steamProvider ? `
      <div class="side-panel-section">
        <h3>Steam Comparison</h3>
        <div class="steam-comparison-container"></div>
      </div>
      ` : ''}
    `;

    panel.querySelector('.close-btn')!.addEventListener('click', hide);

    // Make overlay visible before rendering chart so clientWidth is available
    overlay.classList.add('visible');

    if (showChart) {
      const chartContainer = panel.querySelector<HTMLElement>('.revenue-chart-container');
      if (chartContainer) {
        renderRevenueChart(chartContainer, sales);
      }
    }

    if (sales && steamProvider) {
      const compContainer = panel.querySelector<HTMLElement>('.steam-comparison-container');
      if (compContainer) {
        (async () => {
          try {
            const priceCents = Math.round(pricing.launchPrice * 100);
            const allGames = await steamProvider();
            const priceMatched = filterByPriceTier(allGames, priceCents);

            let report = buildComparisonReport(priceMatched, sales.m1Units, sales.tailStrength);
            const hasDetailFetcher = !!detailFetcher;
            renderComparisonReport(compContainer, report, pricing.launchPrice, hasDetailFetcher);

            // Progressive refinement — fetch details for top-10 games missing them
            if (detailFetcher) {
              while (overlay.classList.contains('visible')) {
                const needDetails = report.closest
                  .filter((r) => !r.game.details)
                  .map((r) => r.game.appid);

                if (needDetails.length === 0) break;

                const fetched = await detailFetcher(needDetails);

                if (!overlay.classList.contains('visible')) break;

                const fetchedMap = new Map(fetched.map((g) => [g.appid, g]));
                for (const game of priceMatched) {
                  const updated = fetchedMap.get(game.appid);
                  if (updated?.details) game.details = updated.details;
                }

                report = buildComparisonReport(priceMatched, sales.m1Units, sales.tailStrength);
                const stillRefining = report.closest.some((r) => !r.game.details);
                renderComparisonReport(compContainer, report, pricing.launchPrice, stillRefining);
              }
            }
          } catch {
            compContainer.innerHTML = '<p class="compare-error">Failed to load Steam comparison data.</p>';
          }
        })();
      }
    }
  }

  function renderComparisonReport(
    container: HTMLElement,
    report: SteamComparisonReport,
    launchPrice: number,
    refining = false,
  ): void {
    if (report.totalGames === 0) {
      container.innerHTML = '<p class="compare-empty">No comparable games found at this price tier.</p>';
      return;
    }

    const pctValue = Math.round(report.percentile * 100);
    const gamesList = report.closest.map((r) => {
      const sign = r.rating >= 0 ? '+' : '';
      const cls = r.rating >= 0 ? 'positive' : 'negative';
      const safeName = escapeHtml(r.game.name);
      const safeUrl = r.game.storeUrl.startsWith('https://store.steampowered.com/') ? r.game.storeUrl : '#';
      const salesStr = Math.round(r.estimatedSales).toLocaleString();
      const multStr = r.breakdown.multiplier.toFixed(1);
      const tooltip = formatBreakdownTooltip(r.breakdown);
      const dotHidden = (!refining || r.game.details) ? ' hidden' : '';
      const pendingDot = `<span class="comp-refine-dot${dotHidden}"></span>`;
      return `
        <li class="comp-game">
          <a href="${safeUrl}" target="_blank" rel="noopener">${safeName}</a>
          <span class="comp-meta">
            <span class="comp-rating ${cls}">${sign}${r.rating.toFixed(2)}</span>
            <span class="comp-sales">~${salesStr} units sold</span>
            <span class="comp-mult" title="${escapeHtml(tooltip)}">${multStr}×</span>${pendingDot}
          </span>
        </li>`;
    }).join('');

    container.innerHTML = `
      <div class="percentile-display">
        <span class="percentile-value">${pctValue}%</span>
        <span class="percentile-label">of indie games at that price point sold fewer copies</span>
      </div>
      <h4>Most Similar Games</h4>
      <ul class="comparable-games-list">${gamesList}</ul>
      ${refining && report.closest.some((r) => !r.game.details)
        ? '<p class="comp-refining"><span class="comp-refine-dot"></span> Refining estimates…</p>'
        : ''}
      <p class="comp-note">Based on ${report.totalGames} games at $${launchPrice.toFixed(2)} released in last 24 months</p>
    `;
  }

  function destroy(): void {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  }

  return { show, hide, destroy };
}
