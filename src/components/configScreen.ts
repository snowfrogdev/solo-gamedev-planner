import * as d3 from 'd3';
import type { BezierCurve, Point, DowntimeConfig, PlannerInputs } from '../types';
import { createInterpolator } from '../engine/curveInterpolator';
import { DOWNTIME_X_MIN, DOWNTIME_X_MAX } from '../engine/downtimeDefaults';

const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };
const TOTAL_SAMPLES = 80;

// Colors
const SUPPORT_COLOR = '#5b9bd5';
const RECOVERY_COLOR = '#e07050';
const TOTAL_COLOR = '#999';

export type ExpenseInputs = Pick<PlannerInputs, 'monthlyFixedExpenses' | 'projectCostBase' | 'projectCostPerMonth'>;

export interface ConfigScreenCallbacks {
  onChange: (config: DowntimeConfig) => void;
  onExpenseChange: (expenses: ExpenseInputs) => void;
  onClose: () => void;
  onReset: () => void;
}

/**
 * Sample a bezier curve into real-world y values at evenly spaced x positions.
 */
export function sampleBezier(curve: BezierCurve, maxOutput: number, count: number): number[] {
  const interp = createInterpolator(curve);
  const values: number[] = [];
  for (let i = 0; i <= count; i++) {
    values.push(interp(i / count) * maxOutput);
  }
  return values;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function deepCopyCurve(c: BezierCurve): BezierCurve {
  return { p0: { ...c.p0 }, cp1: { ...c.cp1 }, cp2: { ...c.cp2 }, p3: { ...c.p3 } };
}

export function createConfigScreen(
  container: HTMLElement,
  config: DowntimeConfig,
  expenses: ExpenseInputs,
  callbacks: ConfigScreenCallbacks,
): { show(): void; hide(): void; destroy(): void } {
  const overlay = document.createElement('div');
  overlay.className = 'config-overlay';

  const modal = document.createElement('div');
  modal.className = 'config-modal';

  modal.innerHTML = `
    <div class="config-header">
      <h2>Advanced Settings</h2>
      <button class="config-close-btn close-btn" aria-label="Close">&times;</button>
    </div>
    <h3 class="config-section-title">Downtime Formula</h3>
    <p class="config-description">
      Drag handles to shape how downtime scales with project duration.
      Total downtime (dashed) = support + recovery.
    </p>
    <div class="curve-legend">
      <span class="legend-item"><span class="legend-swatch" style="background:${SUPPORT_COLOR}"></span>Post-launch support</span>
      <span class="legend-item"><span class="legend-swatch" style="background:${RECOVERY_COLOR}"></span>Creative recovery</span>
      <span class="legend-item"><span class="legend-swatch legend-dashed" style="border-color:${TOTAL_COLOR}"></span>Total downtime</span>
    </div>
    <div class="config-editor-container"></div>
    <h3 class="config-section-title">Expenses</h3>
    <div class="config-expense-inputs">
      <div class="config-input-row">
        <label>Fixed Monthly Expenses</label>
        <div class="config-input-field">
          <span class="input-prefix">$</span>
          <input type="number" data-field="fixedExpenses" value="${expenses.monthlyFixedExpenses}" min="0" step="50">
          <span class="input-suffix">/month</span>
        </div>
      </div>
      <div class="config-input-row">
        <label>Project Cost Formula</label>
        <div class="config-input-field formula-field">
          <span class="input-prefix">$</span>
          <input type="number" data-field="projectCostBase" value="${expenses.projectCostBase}" min="0" step="100">
          <span class="input-operator">+ ( months &times;</span>
          <span class="input-prefix">$</span>
          <input type="number" data-field="projectCostPerMonth" value="${expenses.projectCostPerMonth}" min="0" step="50">
          <span class="input-suffix">)</span>
        </div>
      </div>
    </div>
    <div class="config-actions">
      <button class="config-reset-btn reset-btn">Reset to Default</button>
      <button class="config-done-btn done-btn">Done</button>
    </div>
  `;

  overlay.appendChild(modal);
  container.appendChild(overlay);

  const currentConfig: DowntimeConfig = {
    ...config,
    supportCurve: deepCopyCurve(config.supportCurve),
    recoveryCurve: deepCopyCurve(config.recoveryCurve),
  };

  // --- Build the combined SVG ---
  const svgContainer = modal.querySelector<HTMLElement>('.config-editor-container')!;
  const width = 460;
  const height = 300;
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  let yMaxTotal = config.supportMaxOutput + config.recoveryMaxOutput;

  const svg = d3.select(svgContainer)
    .append('svg')
    .attr('class', 'curve-editor')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const g = svg.append('g')
    .attr('transform', `translate(${MARGIN.left}, ${MARGIN.top})`);

  // Normalized scales (curves stored 0–1)
  const xScale = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
  // Y scale in real-world months (shared axis for all three)
  const yScale = d3.scaleLinear().domain([0, yMaxTotal]).range([innerHeight, 0]);

  const xAxisScale = d3.scaleLinear().domain([DOWNTIME_X_MIN, DOWNTIME_X_MAX]).range([0, innerWidth]);

  g.append('g').attr('class', 'axis')
    .attr('transform', `translate(0, ${innerHeight})`)
    .call(d3.axisBottom(xAxisScale).ticks(6));

  const yAxisG = g.append('g').attr('class', 'axis')
    .call(d3.axisLeft(yScale).ticks(6));

  svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle')
    .attr('x', MARGIN.left + innerWidth / 2).attr('y', height - 4)
    .text('Dev Duration (months)');

  svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(MARGIN.top + innerHeight / 2)).attr('y', 14)
    .text('Downtime (months)');

  // Helper: convert normalized bezier point to pixel, scaling y by that curve's maxOutput
  function toPixelX(p: Point): number { return xScale(p.x); }
  function toPixelYSupport(p: Point): number { return yScale(p.y * currentConfig.supportMaxOutput); }
  function toPixelYRecovery(p: Point): number { return yScale(p.y * currentConfig.recoveryMaxOutput); }

  // Total downtime polyline (drawn first, behind everything)
  const totalPath = g.append('path')
    .attr('class', 'total-curve-line')
    .attr('fill', 'none')
    .attr('stroke', TOTAL_COLOR)
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '6 4');

  // Support bezier path + handles
  const supportHandleLineStart = g.append('line').attr('class', 'handle-line').attr('stroke', SUPPORT_COLOR);
  const supportHandleLineEnd = g.append('line').attr('class', 'handle-line').attr('stroke', SUPPORT_COLOR);
  const supportPath = g.append('path').attr('fill', 'none').attr('stroke', SUPPORT_COLOR).attr('stroke-width', 2.5);
  const supportP0 = g.append('circle').attr('class', 'endpoint').attr('r', 5).attr('fill', SUPPORT_COLOR).attr('stroke', 'white').attr('stroke-width', 2);
  const supportP3 = g.append('circle').attr('class', 'endpoint').attr('r', 5).attr('fill', SUPPORT_COLOR).attr('stroke', 'white').attr('stroke-width', 2);
  const supportCP1 = g.append('circle').attr('class', 'control-handle').attr('r', 4).attr('fill', SUPPORT_COLOR).attr('stroke', 'white').attr('stroke-width', 1.5).attr('opacity', 0.7);
  const supportCP2 = g.append('circle').attr('class', 'control-handle').attr('r', 4).attr('fill', SUPPORT_COLOR).attr('stroke', 'white').attr('stroke-width', 1.5).attr('opacity', 0.7);

  // Recovery bezier path + handles
  const recoveryHandleLineStart = g.append('line').attr('class', 'handle-line').attr('stroke', RECOVERY_COLOR);
  const recoveryHandleLineEnd = g.append('line').attr('class', 'handle-line').attr('stroke', RECOVERY_COLOR);
  const recoveryPath = g.append('path').attr('fill', 'none').attr('stroke', RECOVERY_COLOR).attr('stroke-width', 2.5);
  const recoveryP0 = g.append('circle').attr('class', 'endpoint').attr('r', 5).attr('fill', RECOVERY_COLOR).attr('stroke', 'white').attr('stroke-width', 2);
  const recoveryP3 = g.append('circle').attr('class', 'endpoint').attr('r', 5).attr('fill', RECOVERY_COLOR).attr('stroke', 'white').attr('stroke-width', 2);
  const recoveryCP1 = g.append('circle').attr('class', 'control-handle').attr('r', 4).attr('fill', RECOVERY_COLOR).attr('stroke', 'white').attr('stroke-width', 1.5).attr('opacity', 0.7);
  const recoveryCP2 = g.append('circle').attr('class', 'control-handle').attr('r', 4).attr('fill', RECOVERY_COLOR).attr('stroke', 'white').attr('stroke-width', 1.5).attr('opacity', 0.7);

  function render(): void {
    const supportCurve = currentConfig.supportCurve;
    const recoveryCurve = currentConfig.recoveryCurve;

    // Support bezier
    supportPath.attr('d', `M ${toPixelX(supportCurve.p0)},${toPixelYSupport(supportCurve.p0)} C ${toPixelX(supportCurve.cp1)},${toPixelYSupport(supportCurve.cp1)} ${toPixelX(supportCurve.cp2)},${toPixelYSupport(supportCurve.cp2)} ${toPixelX(supportCurve.p3)},${toPixelYSupport(supportCurve.p3)}`);
    supportHandleLineStart.attr('x1', toPixelX(supportCurve.p0)).attr('y1', toPixelYSupport(supportCurve.p0)).attr('x2', toPixelX(supportCurve.cp1)).attr('y2', toPixelYSupport(supportCurve.cp1));
    supportHandleLineEnd.attr('x1', toPixelX(supportCurve.p3)).attr('y1', toPixelYSupport(supportCurve.p3)).attr('x2', toPixelX(supportCurve.cp2)).attr('y2', toPixelYSupport(supportCurve.cp2));
    supportP0.attr('cx', toPixelX(supportCurve.p0)).attr('cy', toPixelYSupport(supportCurve.p0));
    supportP3.attr('cx', toPixelX(supportCurve.p3)).attr('cy', toPixelYSupport(supportCurve.p3));
    supportCP1.attr('cx', toPixelX(supportCurve.cp1)).attr('cy', toPixelYSupport(supportCurve.cp1));
    supportCP2.attr('cx', toPixelX(supportCurve.cp2)).attr('cy', toPixelYSupport(supportCurve.cp2));

    // Recovery bezier
    recoveryPath.attr('d', `M ${toPixelX(recoveryCurve.p0)},${toPixelYRecovery(recoveryCurve.p0)} C ${toPixelX(recoveryCurve.cp1)},${toPixelYRecovery(recoveryCurve.cp1)} ${toPixelX(recoveryCurve.cp2)},${toPixelYRecovery(recoveryCurve.cp2)} ${toPixelX(recoveryCurve.p3)},${toPixelYRecovery(recoveryCurve.p3)}`);
    recoveryHandleLineStart.attr('x1', toPixelX(recoveryCurve.p0)).attr('y1', toPixelYRecovery(recoveryCurve.p0)).attr('x2', toPixelX(recoveryCurve.cp1)).attr('y2', toPixelYRecovery(recoveryCurve.cp1));
    recoveryHandleLineEnd.attr('x1', toPixelX(recoveryCurve.p3)).attr('y1', toPixelYRecovery(recoveryCurve.p3)).attr('x2', toPixelX(recoveryCurve.cp2)).attr('y2', toPixelYRecovery(recoveryCurve.cp2));
    recoveryP0.attr('cx', toPixelX(recoveryCurve.p0)).attr('cy', toPixelYRecovery(recoveryCurve.p0));
    recoveryP3.attr('cx', toPixelX(recoveryCurve.p3)).attr('cy', toPixelYRecovery(recoveryCurve.p3));
    recoveryCP1.attr('cx', toPixelX(recoveryCurve.cp1)).attr('cy', toPixelYRecovery(recoveryCurve.cp1));
    recoveryCP2.attr('cx', toPixelX(recoveryCurve.cp2)).attr('cy', toPixelYRecovery(recoveryCurve.cp2));

    // Total = support + recovery sampled as polyline
    const supVals = sampleBezier(supportCurve, currentConfig.supportMaxOutput, TOTAL_SAMPLES);
    const recVals = sampleBezier(recoveryCurve, currentConfig.recoveryMaxOutput, TOTAL_SAMPLES);
    const totalPoints: [number, number][] = [];
    for (let i = 0; i <= TOTAL_SAMPLES; i++) {
      const nx = i / TOTAL_SAMPLES;
      totalPoints.push([xScale(nx), yScale(supVals[i] + recVals[i])]);
    }
    const lineGen = d3.line();
    totalPath.attr('d', lineGen(totalPoints));
  }

  function emitChange(): void {
    callbacks.onChange({
      ...currentConfig,
      supportCurve: deepCopyCurve(currentConfig.supportCurve),
      recoveryCurve: deepCopyCurve(currentConfig.recoveryCurve),
    });
  }

  // --- Drag behaviors ---
  /**
   * Convert a pixel Y position to a real-world Y value (months), clamped to axis.
   * If the real value exceeds the curve's maxOutput, rescale maxOutput and all
   * existing normalized points so their real-world positions stay the same.
   */
  function toRealY(pixelY: number): number {
    return clamp(yScale.invert(pixelY), 0, yMaxTotal);
  }

  function updateYAxis(): void {
    yMaxTotal = currentConfig.supportMaxOutput + currentConfig.recoveryMaxOutput;
    yScale.domain([0, yMaxTotal]);
    yAxisG.call(d3.axisLeft(yScale).ticks(6));
  }

  // maxOutput only grows (never shrinks) during a drag session. This means the
  // Y-axis resolution can degrade if a user briefly drags high then back down.
  // This is intentional: shrinking would cause all normalized points to jump,
  // which feels jarring during drag. The Reset button restores original resolution.
  function rescaleCurve(curve: BezierCurve, key: 'supportMaxOutput' | 'recoveryMaxOutput', newMax: number): void {
    const ratio = currentConfig[key] / newMax;
    curve.p0.y *= ratio;
    curve.cp1.y *= ratio;
    curve.cp2.y *= ratio;
    curve.p3.y *= ratio;
    currentConfig[key] = newMax;
    updateYAxis();
  }

  // Set a point's normalized Y from a real-world value, auto-expanding the
  // curve's max output (and rescaling all points) if the value exceeds it.
  function setCurveY(point: Point, realY: number, curve: BezierCurve, key: 'supportMaxOutput' | 'recoveryMaxOutput'): void {
    if (realY > currentConfig[key]) {
      rescaleCurve(curve, key, realY);
    }
    point.y = realY / currentConfig[key];
  }

  // --- Drag handler factories ---
  // Two patterns: endpoints (Y-only, attached control handle follows) and
  // control handles (free X+Y movement).

  function makeEndpointDrag(
    endpoint: Point,
    attachedHandle: Point,
    curve: BezierCurve,
    maxKey: 'supportMaxOutput' | 'recoveryMaxOutput',
  ): d3.DragBehavior<SVGCircleElement, unknown, unknown> {
    return d3.drag<SVGCircleElement, unknown>().on('drag', (event) => {
      const realY = toRealY(event.y);
      const oldRealY = endpoint.y * currentConfig[maxKey];
      const newHandleRealY = attachedHandle.y * currentConfig[maxKey] + (realY - oldRealY);
      setCurveY(endpoint, realY, curve, maxKey);
      setCurveY(attachedHandle, Math.max(0, newHandleRealY), curve, maxKey);
      render(); emitChange();
    });
  }

  function makeControlHandleDrag(
    handle: Point,
    curve: BezierCurve,
    maxKey: 'supportMaxOutput' | 'recoveryMaxOutput',
  ): d3.DragBehavior<SVGCircleElement, unknown, unknown> {
    return d3.drag<SVGCircleElement, unknown>().on('drag', (event) => {
      handle.x = clamp(xScale.invert(event.x), 0, 1);
      setCurveY(handle, toRealY(event.y), curve, maxKey);
      render(); emitChange();
    });
  }

  // Support curve drag handlers
  supportP0.call(makeEndpointDrag(currentConfig.supportCurve.p0, currentConfig.supportCurve.cp1, currentConfig.supportCurve, 'supportMaxOutput'));
  supportP3.call(makeEndpointDrag(currentConfig.supportCurve.p3, currentConfig.supportCurve.cp2, currentConfig.supportCurve, 'supportMaxOutput'));
  supportCP1.call(makeControlHandleDrag(currentConfig.supportCurve.cp1, currentConfig.supportCurve, 'supportMaxOutput'));
  supportCP2.call(makeControlHandleDrag(currentConfig.supportCurve.cp2, currentConfig.supportCurve, 'supportMaxOutput'));

  // Recovery curve drag handlers
  recoveryP0.call(makeEndpointDrag(currentConfig.recoveryCurve.p0, currentConfig.recoveryCurve.cp1, currentConfig.recoveryCurve, 'recoveryMaxOutput'));
  recoveryP3.call(makeEndpointDrag(currentConfig.recoveryCurve.p3, currentConfig.recoveryCurve.cp2, currentConfig.recoveryCurve, 'recoveryMaxOutput'));
  recoveryCP1.call(makeControlHandleDrag(currentConfig.recoveryCurve.cp1, currentConfig.recoveryCurve, 'recoveryMaxOutput'));
  recoveryCP2.call(makeControlHandleDrag(currentConfig.recoveryCurve.cp2, currentConfig.recoveryCurve, 'recoveryMaxOutput'));

  render();

  // --- Expense inputs ---
  const fixedExpInput = modal.querySelector<HTMLInputElement>('[data-field="fixedExpenses"]')!;
  const costBaseInput = modal.querySelector<HTMLInputElement>('[data-field="projectCostBase"]')!;
  const costPerMonthInput = modal.querySelector<HTMLInputElement>('[data-field="projectCostPerMonth"]')!;

  function emitExpenseChange(): void {
    callbacks.onExpenseChange({
      monthlyFixedExpenses: Math.max(0, parseFloat(fixedExpInput.value) || 0),
      projectCostBase: Math.max(0, parseFloat(costBaseInput.value) || 0),
      projectCostPerMonth: Math.max(0, parseFloat(costPerMonthInput.value) || 0),
    });
  }

  fixedExpInput.addEventListener('change', emitExpenseChange);
  costBaseInput.addEventListener('change', emitExpenseChange);
  costPerMonthInput.addEventListener('change', emitExpenseChange);

  // --- Modal controls ---
  modal.querySelector('.config-close-btn')!.addEventListener('click', callbacks.onClose);
  modal.querySelector('.config-done-btn')!.addEventListener('click', callbacks.onClose);
  modal.querySelector('.config-reset-btn')!.addEventListener('click', callbacks.onReset);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) callbacks.onClose();
  });

  return {
    show() { overlay.classList.add('visible'); },
    hide() { overlay.classList.remove('visible'); },
    destroy() { svg.remove(); overlay.remove(); },
  };
}
