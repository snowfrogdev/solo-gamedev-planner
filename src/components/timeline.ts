import * as d3 from 'd3';
import type { GeneratedPlan, PlannerInputs, PlannedProject, AccountingTimeSeries } from '../types';
import { fmtCompact as fmtCompactRaw } from '../utils/format';

const MARGIN = { top: 30, right: 20, bottom: 40, left: 50 };
const CHART_HEIGHT = 320;
const BAR_HEIGHT = 28;
const BAR_BAND_HEIGHT = 36;

function fmtCompact(n: number): string {
  return fmtCompactRaw(n, '$');
}

/** Find which project phase (dev/downtime) a given month falls in */
export function findProjectAtMonth(month: number, projects: PlannedProject[]): { project: PlannedProject; phase: 'dev' | 'downtime' } | null {
  for (const p of projects) {
    if (month >= p.startMonth && month < p.endMonth) {
      return { project: p, phase: 'dev' };
    }
    if (month >= p.endMonth && month < p.cycleEndMonth) {
      return { project: p, phase: 'downtime' };
    }
  }
  return null;
}

// --- Stats ---

function renderStats(
  container: HTMLElement,
  plan: GeneratedPlan,
  annualizedNetProfit: number,
  targetDevScope: number,
): void {
  const statsEl = document.createElement('div');
  statsEl.className = 'timeline-stats';
  const avgDev = plan.projects.reduce((s, p) => s + p.devDurationMonths, 0) / plan.projects.length;
  const avgDown = plan.projects.reduce((s, p) => s + p.downtimeMonths, 0) / plan.projects.length;
  const trailingMonths = Math.max(12, targetDevScope);

  statsEl.innerHTML = `
    <div class="stat"><span class="stat-value">${plan.projects.length}</span><span class="stat-label">Games</span></div>
    <div class="stat"><span class="stat-value">${plan.totalMonths.toFixed(1)}</span><span class="stat-label">Total Months</span></div>
    <div class="stat"><span class="stat-value">${avgDev.toFixed(1)}mo</span><span class="stat-label">Avg Dev Time</span></div>
    <div class="stat"><span class="stat-value">${avgDown.toFixed(1)}mo</span><span class="stat-label">Avg Downtime</span></div>
    <div class="stat stat-accent"><span class="stat-value">$${Math.round(annualizedNetProfit).toLocaleString()}</span><span class="stat-label stat-label-with-tooltip" tabindex="0">Avg. Annual Net Profit<span class="stat-tooltip">Net profit averaged over the final ${trailingMonths} months of the plan, annualized to 12 months</span></span></div>
  `;
  container.appendChild(statsEl);
}

// --- Revenue area (stacked area + income line + target line) ---

function drawRevenueArea(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  accounting: AccountingTimeSeries,
  inputs: PlannerInputs,
  plan: GeneratedPlan,
  xScale: d3.ScaleLinear<number, number>,
  colorScale: d3.ScaleOrdinal<string, string>,
  width: number,
  revenueAreaBottom: number,
): d3.ScaleLinear<number, number> | null {
  if (!accounting || accounting.entries.length === 0) return null;

  const monthlyTarget = inputs.targetIncome / 12;
  const maxRevenue = Math.max(
    monthlyTarget * 1.2,
    d3.max(accounting.entries, (e) => e.revenue) ?? 0,
  );
  const minNetProfit = d3.min(accounting.entries, (e) => e.netProfit) ?? 0;
  const yMin = Math.min(0, minNetProfit);

  const yScale = d3.scaleLinear()
    .domain([yMin, maxRevenue])
    .range([revenueAreaBottom, MARGIN.top]);

  // Y axis (left)
  svg.append('g')
    .attr('transform', `translate(${MARGIN.left}, 0)`)
    .attr('class', 'axis')
    .call(d3.axisLeft(yScale).ticks(4).tickFormat((d) => {
      const n = d as number;
      return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${Math.round(n)}`;
    }));

  // Stacked area chart (per-game revenue contribution)
  const monthCount = accounting.entries.length;
  const stackData = Array.from({ length: monthCount }, (_, m) => {
    const row: Record<string, number> = { month: m };
    for (let pi = 0; pi < accounting.revenueByProject.length; pi++) {
      row[`g${pi}`] = accounting.revenueByProject[pi][m];
    }
    return row;
  });

  const keys = plan.projects.map((_, pi) => `g${pi}`);
  const stack = d3.stack<Record<string, number>>().keys(keys);
  const stacked = stack(stackData);

  const areaGen = d3.area<d3.SeriesPoint<Record<string, number>>>()
    .x((d) => xScale(d.data.month))
    .y0((d) => yScale(d[0]))
    .y1((d) => yScale(d[1]));

  svg.selectAll('.stacked-area')
    .data(stacked)
    .enter()
    .append('path')
    .attr('class', 'stacked-area')
    .attr('fill', (_, i) => colorScale(String(i)))
    .attr('fill-opacity', 0.35)
    .attr('d', areaGen);

  // Net profit line (on top of stacked area)
  const lineData = accounting.entries.map((e, m) => ({ month: m, value: e.netProfit }));
  const profitLine = d3.line<(typeof lineData)[0]>()
    .x((d) => xScale(d.month))
    .y((d) => yScale(d.value));

  svg.append('path')
    .datum(lineData)
    .attr('class', 'line-net-profit')
    .attr('fill', 'none')
    .attr('stroke', '#70ad47')
    .attr('stroke-width', 1.5)
    .attr('d', profitLine);

  // Income target reference line
  svg.append('line')
    .attr('class', 'income-target-line')
    .attr('x1', MARGIN.left)
    .attr('x2', width - MARGIN.right)
    .attr('y1', yScale(monthlyTarget))
    .attr('y2', yScale(monthlyTarget))
    .attr('stroke', '#ed7d31')
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '6,4');

  // Target label
  svg.append('text')
    .attr('x', width - MARGIN.right - 4)
    .attr('y', yScale(monthlyTarget) - 6)
    .attr('text-anchor', 'end')
    .attr('class', 'income-target-label')
    .attr('font-size', '10px')
    .attr('fill', '#ed7d31')
    .text(`Target: $${Math.round(monthlyTarget).toLocaleString()}/mo`);

  return yScale;
}

// --- Project bars ---

function drawProjectBars(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  plan: GeneratedPlan,
  xScale: d3.ScaleLinear<number, number>,
  barY: number,
  onProjectClick?: (project: PlannedProject) => void,
): void {
  const projects = svg.selectAll('.project-group')
    .data(plan.projects)
    .enter()
    .append('g')
    .attr('class', 'project-group');

  projects
    .attr('aria-label', (d: PlannedProject) => `Game ${d.index + 1}: ${d.devDurationMonths.toFixed(1)} months development`);

  if (onProjectClick) {
    projects
      .attr('tabindex', '0')
      .attr('role', 'button')
      .style('cursor', 'pointer')
      .on('click', (_event: MouseEvent, d: PlannedProject) => onProjectClick(d))
      .on('keydown', (event: KeyboardEvent, d: PlannedProject) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onProjectClick(d);
        }
      });
  }

  // Dev bars
  projects.append('rect')
    .attr('class', 'dev-bar')
    .attr('x', d => xScale(d.startMonth))
    .attr('y', barY)
    .attr('width', d => Math.max(1, xScale(d.startMonth + d.devDurationMonths) - xScale(d.startMonth)))
    .attr('height', BAR_HEIGHT)
    .attr('rx', 4);

  // Downtime bars
  projects.append('rect')
    .attr('class', 'downtime-bar')
    .attr('x', d => xScale(d.endMonth))
    .attr('y', barY)
    .attr('width', d => Math.max(0, xScale(d.endMonth + d.downtimeMonths) - xScale(d.endMonth)))
    .attr('height', BAR_HEIGHT)
    .attr('rx', 4);

  // Labels inside bars
  projects.append('text')
    .attr('class', 'project-label')
    .attr('x', d => xScale(d.startMonth) + 6)
    .attr('y', barY + BAR_HEIGHT / 2 + 1)
    .attr('dominant-baseline', 'middle')
    .text(d => `Game ${d.index + 1}`);
}

// --- Crosshair tooltip ---

function addTimelineTooltip(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  chartWrapper: HTMLElement,
  plan: GeneratedPlan,
  accounting: AccountingTimeSeries | undefined,
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number> | null,
  colorScale: d3.ScaleOrdinal<string, string>,
  xMax: number,
  width: number,
): void {
  const crosshair = svg.append('line')
    .attr('class', 'chart-crosshair')
    .attr('y1', MARGIN.top - 10)
    .attr('y2', CHART_HEIGHT - MARGIN.bottom)
    .attr('stroke', 'currentColor')
    .attr('stroke-opacity', 0.3)
    .attr('stroke-dasharray', '3,3')
    .style('display', 'none');

  const incomeDot = yScale
    ? svg.append('circle').attr('r', 3).attr('fill', '#70ad47').style('display', 'none')
    : null;

  const tooltip = d3.select(chartWrapper)
    .append('div')
    .attr('class', 'chart-tooltip')
    .style('display', 'none');

  const innerW = width - MARGIN.left - MARGIN.right;

  svg
    .on('mousemove', (event: MouseEvent) => {
      const [mx] = d3.pointer(event);
      const month = Math.round(xScale.invert(mx));
      const clampedMonth = Math.max(0, Math.min(month, Math.floor(xMax)));
      const x = xScale(clampedMonth);

      crosshair.attr('x1', x).attr('x2', x).style('display', null);

      // Build tooltip content
      let html = `<strong>Month ${clampedMonth}</strong>`;

      if (accounting && clampedMonth < accounting.entries.length) {
        const entry = accounting.entries[clampedMonth];

        // P&L breakdown
        html += `<br>Revenue: ${fmtCompact(entry.revenue)}`;
        if (entry.platformFees > 0) html += `<br>Platform Fees: ${fmtCompact(-entry.platformFees)}`;
        if (entry.projectDevCosts > 0) html += `<br>Dev Costs: ${fmtCompact(-entry.projectDevCosts)}`;
        html += `<br>Gross Profit: ${fmtCompact(entry.grossProfit)}`;
        if (entry.fixedExpenses > 0) html += `<br>Fixed Expenses: ${fmtCompact(-entry.fixedExpenses)}`;
        html += `<br><span style="color:#70ad47">Net Profit:</span> ${fmtCompact(entry.netProfit)}`;
        if (incomeDot && yScale) {
          incomeDot
            .attr('cx', x)
            .attr('cy', yScale(entry.netProfit))
            .style('display', null);
        }

        // Per-game revenue breakdown
        for (let pi = 0; pi < accounting.revenueByProject.length; pi++) {
          const rev = accounting.revenueByProject[pi][clampedMonth];
          if (rev > 0) {
            html += `<br><span style="color:${colorScale(String(pi))}">Game ${pi + 1}:</span> ${fmtCompact(rev)}`;
          }
        }
      }

      // Which project/phase is active
      const hit = findProjectAtMonth(clampedMonth, plan.projects);
      if (hit) {
        const { project: p, phase } = hit;
        if (phase === 'dev') {
          html += `<br><span style="color:#5b9bd5">▸ Game ${p.index + 1}:</span> In dev (${p.devDurationMonths.toFixed(1)} mo)`;
        } else {
          html += `<br><span style="color:#5b9bd5">▸ Game ${p.index + 1}:</span> Downtime (${p.downtimeMonths.toFixed(1)} mo)`;
        }
      }

      // Position tooltip (flip when past midpoint)
      const localX = x - MARGIN.left;
      const onRight = localX > innerW / 2;
      tooltip
        .style('display', null)
        .style('left', onRight ? '' : `${x + 8}px`)
        .style('right', onRight ? `${width - x + 8}px` : '')
        .style('top', `${MARGIN.top}px`)
        .html(html);
    })
    .on('mouseleave', () => {
      crosshair.style('display', 'none');
      incomeDot?.style('display', 'none');
      tooltip.style('display', 'none');
    });
}

// --- Main factory ---

export function createTimeline(
  container: HTMLElement,
  onProjectClick?: (project: PlannedProject) => void,
): { update(plan: GeneratedPlan, inputs: PlannerInputs, accounting?: AccountingTimeSeries, annualizedNetProfit?: number): void } {

  function update(plan: GeneratedPlan, inputs: PlannerInputs, accounting?: AccountingTimeSeries, annualizedNetProfit?: number): void {
    container.innerHTML = '';

    if (plan.projects.length === 0) {
      container.innerHTML = '<p class="no-data">No projects fit in this timeline.</p>';
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-content';
    wrapper.style.opacity = '0';
    container.appendChild(wrapper);

    renderStats(wrapper, plan, annualizedNetProfit ?? 0, inputs.targetDevScope);

    // Chart wrapper (for tooltip positioning)
    const chartWrapper = document.createElement('div');
    chartWrapper.style.position = 'relative';
    wrapper.appendChild(chartWrapper);

    const width = container.clientWidth || 800;
    const barBandTop = CHART_HEIGHT - MARGIN.bottom - BAR_BAND_HEIGHT;
    const revenueAreaBottom = barBandTop - 4;

    const svg = d3.select(chartWrapper)
      .append('svg')
      .attr('class', 'timeline-chart')
      .attr('width', '100%')
      .attr('height', CHART_HEIGHT)
      .attr('viewBox', `0 0 ${width} ${CHART_HEIGHT}`)
      .attr('role', 'img')
      .attr('aria-label', `Timeline chart showing ${plan.projects.length} game projects over ${Math.round(plan.totalMonths)} months`);

    const xMax = Math.max(inputs.timeHorizonMonths, plan.totalMonths);
    const xScale = d3.scaleLinear()
      .domain([0, xMax])
      .range([MARGIN.left, width - MARGIN.right]);

    // X axis at bottom
    svg.append('g')
      .attr('transform', `translate(0, ${CHART_HEIGHT - MARGIN.bottom})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(xMax, 12)).tickFormat(d => `${d}mo`))
      .attr('class', 'axis');

    const colorScale = d3.scaleOrdinal(d3.schemeTableau10);
    const yScale = drawRevenueArea(svg, accounting!, inputs, plan, xScale, colorScale, width, revenueAreaBottom);

    // Time horizon marker
    svg.append('line')
      .attr('x1', xScale(inputs.timeHorizonMonths))
      .attr('y1', MARGIN.top - 10)
      .attr('x2', xScale(inputs.timeHorizonMonths))
      .attr('y2', CHART_HEIGHT - MARGIN.bottom)
      .attr('class', 'horizon-line');

    const barY = barBandTop + (BAR_BAND_HEIGHT - BAR_HEIGHT) / 2;
    drawProjectBars(svg, plan, xScale, barY, onProjectClick);
    addTimelineTooltip(svg, chartWrapper, plan, accounting, xScale, yScale, colorScale, xMax, width);

    // Onboarding hint
    if (onProjectClick) {
      const hint = document.createElement('p');
      hint.className = 'chart-hint';
      hint.textContent = 'Click a project bar to see detailed projections';
      wrapper.appendChild(hint);
    }

    // Fade in
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => { wrapper.style.opacity = '1'; });
    } else {
      wrapper.style.opacity = '1';
    }
  }

  return { update };
}
