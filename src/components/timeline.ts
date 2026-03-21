import * as d3 from 'd3';
import type { GeneratedPlan, PlannerInputs, PlannedProject } from '../types';

const MARGIN = { top: 30, right: 20, bottom: 40, left: 50 };
const BAR_HEIGHT = 32;
const ROW_HEIGHT = 48;

export function createTimeline(
  container: HTMLElement,
  onProjectClick?: (project: PlannedProject) => void,
): { update(plan: GeneratedPlan, inputs: PlannerInputs): void } {

  function update(plan: GeneratedPlan, inputs: PlannerInputs): void {
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
    statsEl.innerHTML = `
      <div class="stat"><span class="stat-value">${plan.projects.length}</span><span class="stat-label">Games</span></div>
      <div class="stat"><span class="stat-value">${plan.totalMonths.toFixed(1)}</span><span class="stat-label">Total Months</span></div>
      <div class="stat"><span class="stat-value">${avgDev.toFixed(1)}mo</span><span class="stat-label">Avg Dev Time</span></div>
      <div class="stat"><span class="stat-value">${avgDown.toFixed(1)}mo</span><span class="stat-label">Avg Downtime</span></div>
    `;
    container.appendChild(statsEl);

    // D3 timeline chart
    const width = container.clientWidth || 800;
    const height = MARGIN.top + plan.projects.length * ROW_HEIGHT + MARGIN.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('class', 'timeline-chart')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    const xMax = Math.max(inputs.timeHorizonMonths, plan.totalMonths);
    const xScale = d3.scaleLinear()
      .domain([0, xMax])
      .range([MARGIN.left, width - MARGIN.right]);

    // X axis
    svg.append('g')
      .attr('transform', `translate(0, ${height - MARGIN.bottom})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(xMax, 12)).tickFormat(d => `${d}mo`))
      .attr('class', 'axis');

    // Time horizon marker
    svg.append('line')
      .attr('x1', xScale(inputs.timeHorizonMonths))
      .attr('y1', MARGIN.top - 10)
      .attr('x2', xScale(inputs.timeHorizonMonths))
      .attr('y2', height - MARGIN.bottom)
      .attr('class', 'horizon-line');

    // Project bars
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

    const yOffset = (i: number) => MARGIN.top + i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;

    // Dev bars
    projects.append('rect')
      .attr('class', 'dev-bar')
      .attr('x', d => xScale(d.startMonth))
      .attr('y', (_d, i) => yOffset(i))
      .attr('width', d => Math.max(1, xScale(d.startMonth + d.devDurationMonths) - xScale(d.startMonth)))
      .attr('height', BAR_HEIGHT)
      .attr('rx', 4);

    // Downtime bars
    projects.append('rect')
      .attr('class', 'downtime-bar')
      .attr('x', d => xScale(d.endMonth))
      .attr('y', (_d, i) => yOffset(i))
      .attr('width', d => Math.max(0, xScale(d.endMonth + d.downtimeMonths) - xScale(d.endMonth)))
      .attr('height', BAR_HEIGHT)
      .attr('rx', 4);

    // Labels
    projects.append('text')
      .attr('class', 'project-label')
      .attr('x', d => xScale(d.startMonth) + 6)
      .attr('y', (_d, i) => yOffset(i) + BAR_HEIGHT / 2 + 1)
      .attr('dominant-baseline', 'middle')
      .text(d => `Game ${d.index + 1} (${d.devDurationMonths.toFixed(1)}mo)`);

    // Row labels on left
    projects.append('text')
      .attr('class', 'row-label')
      .attr('x', MARGIN.left - 8)
      .attr('y', (_d, i) => yOffset(i) + BAR_HEIGHT / 2 + 1)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .text(d => `#${d.index + 1}`);
  }

  return { update };
}
