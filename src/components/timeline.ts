import * as d3 from 'd3';
import type { GeneratedPlan, PlannerInputs, PlannedProject, AccountingTimeSeries } from '../types';
import { computeAnnualizedIncome } from '../engine/accountingTimeSeries';

const MARGIN = { top: 30, right: 20, bottom: 40, left: 50 };
const CHART_HEIGHT = 320;
const BAR_HEIGHT = 28;
const BAR_BAND_HEIGHT = 36;

function fmtCompact(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

/** Find which project phase (dev/downtime) a given month falls in */
function findProjectAtMonth(month: number, projects: PlannedProject[]): { project: PlannedProject; phase: 'dev' | 'downtime' } | null {
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

export function createTimeline(
  container: HTMLElement,
  onProjectClick?: (project: PlannedProject) => void,
): { update(plan: GeneratedPlan, inputs: PlannerInputs, accounting?: AccountingTimeSeries): void } {

  function update(plan: GeneratedPlan, inputs: PlannerInputs, accounting?: AccountingTimeSeries): void {
    container.innerHTML = '';

    if (plan.projects.length === 0) {
      container.innerHTML = '<p class="no-data">No projects fit in this timeline.</p>';
      return;
    }

    // Summary stats
    const statsEl = document.createElement('div');
    statsEl.className = 'timeline-stats';
    const avgDev = plan.projects.reduce((s, p) => s + p.devDurationMonths, 0) / plan.projects.length;
    const avgDown = plan.projects.reduce((s, p) => s + p.downtimeMonths, 0) / plan.projects.length;

    const annualizedIncome = accounting && accounting.entries.length > 0
      ? computeAnnualizedIncome(accounting, inputs.timeHorizonMonths, inputs.targetDevScope)
      : 0;

    statsEl.innerHTML = `
      <div class="stat"><span class="stat-value">${plan.projects.length}</span><span class="stat-label">Games</span></div>
      <div class="stat"><span class="stat-value">${plan.totalMonths.toFixed(1)}</span><span class="stat-label">Total Months</span></div>
      <div class="stat"><span class="stat-value">${avgDev.toFixed(1)}mo</span><span class="stat-label">Avg Dev Time</span></div>
      <div class="stat"><span class="stat-value">${avgDown.toFixed(1)}mo</span><span class="stat-label">Avg Downtime</span></div>
      <div class="stat"><span class="stat-value">$${Math.round(annualizedIncome).toLocaleString()}</span><span class="stat-label">Est. Annual Income</span></div>
    `;
    container.appendChild(statsEl);

    // Chart wrapper (for tooltip positioning)
    const chartWrapper = document.createElement('div');
    chartWrapper.style.position = 'relative';
    container.appendChild(chartWrapper);

    const width = container.clientWidth || 800;
    const barBandTop = CHART_HEIGHT - MARGIN.bottom - BAR_BAND_HEIGHT;
    const revenueAreaBottom = barBandTop - 4;

    const svg = d3.select(chartWrapper)
      .append('svg')
      .attr('class', 'timeline-chart')
      .attr('width', '100%')
      .attr('height', CHART_HEIGHT)
      .attr('viewBox', `0 0 ${width} ${CHART_HEIGHT}`);

    const xMax = Math.max(inputs.timeHorizonMonths, plan.totalMonths);
    const xScale = d3.scaleLinear()
      .domain([0, xMax])
      .range([MARGIN.left, width - MARGIN.right]);

    // X axis at bottom
    svg.append('g')
      .attr('transform', `translate(0, ${CHART_HEIGHT - MARGIN.bottom})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(xMax, 12)).tickFormat(d => `${d}mo`))
      .attr('class', 'axis');

    // Revenue area
    let yScale: d3.ScaleLinear<number, number> | null = null;
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

    if (accounting && accounting.entries.length > 0) {
      const monthlyTarget = inputs.targetIncome / 12;
      const maxRevenue = Math.max(
        monthlyTarget * 1.2,
        d3.max(accounting.entries, (e) => e.netIncome) ?? 0,
      );

      yScale = d3.scaleLinear()
        .domain([0, maxRevenue])
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
        .y0((d) => yScale!(d[0]))
        .y1((d) => yScale!(d[1]));

      svg.selectAll('.stacked-area')
        .data(stacked)
        .enter()
        .append('path')
        .attr('class', 'stacked-area')
        .attr('fill', (_, i) => colorScale(String(i)))
        .attr('fill-opacity', 0.35)
        .attr('d', areaGen);

      // Net income line (on top of stacked area)
      const lineData = accounting.entries.map((e, m) => ({ month: m, value: e.netIncome }));
      const incomeLine = d3.line<(typeof lineData)[0]>()
        .x((d) => xScale(d.month))
        .y((d) => yScale!(d.value));

      svg.append('path')
        .datum(lineData)
        .attr('class', 'line-net-income')
        .attr('fill', 'none')
        .attr('stroke', '#70ad47')
        .attr('stroke-width', 1.5)
        .attr('d', incomeLine);

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
    }

    // Time horizon marker
    svg.append('line')
      .attr('x1', xScale(inputs.timeHorizonMonths))
      .attr('y1', MARGIN.top - 10)
      .attr('x2', xScale(inputs.timeHorizonMonths))
      .attr('y2', CHART_HEIGHT - MARGIN.bottom)
      .attr('class', 'horizon-line');

    // Project bars (single band)
    const barY = barBandTop + (BAR_BAND_HEIGHT - BAR_HEIGHT) / 2;

    const projects = svg.selectAll('.project-group')
      .data(plan.projects)
      .enter()
      .append('g')
      .attr('class', 'project-group');

    if (onProjectClick) {
      projects
        .style('cursor', 'pointer')
        .on('click', (_event: MouseEvent, d: PlannedProject) => onProjectClick(d));
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

    // Labels inside bars (short form)
    projects.append('text')
      .attr('class', 'project-label')
      .attr('x', d => xScale(d.startMonth) + 6)
      .attr('y', barY + BAR_HEIGHT / 2 + 1)
      .attr('dominant-baseline', 'middle')
      .text(d => `Game ${d.index + 1}`);

    // Crosshair tooltip
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

          // Net income
          html += `<br><span style="color:#70ad47">Net Income:</span> ${fmtCompact(entry.netIncome)}`;
          if (incomeDot && yScale) {
            incomeDot
              .attr('cx', x)
              .attr('cy', yScale(entry.netIncome))
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

  return { update };
}
