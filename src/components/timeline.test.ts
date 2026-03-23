import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GlobalWindow } from 'happy-dom';
import { findProjectAtMonth, createTimeline } from './timeline';
import type { PlannedProject, GeneratedPlan, PlannerInputs } from '../types';

// --- Pure function tests (no DOM needed) ---

const projects: PlannedProject[] = [
  { index: 0, startMonth: 0, devDurationMonths: 3, rawDevDuration: 3, endMonth: 3, downtimeMonths: 1, cycleEndMonth: 4 },
  { index: 1, startMonth: 4, devDurationMonths: 6, rawDevDuration: 6, endMonth: 10, downtimeMonths: 2, cycleEndMonth: 12 },
];

describe('findProjectAtMonth', () => {
  test('returns null for month before any project', () => {
    expect(findProjectAtMonth(-1, projects)).toBeNull();
  });

  test('returns dev phase for month during development', () => {
    const result = findProjectAtMonth(1, projects);
    expect(result).not.toBeNull();
    expect(result!.project.index).toBe(0);
    expect(result!.phase).toBe('dev');
  });

  test('returns downtime phase for month during downtime', () => {
    const result = findProjectAtMonth(3, projects);
    expect(result).not.toBeNull();
    expect(result!.project.index).toBe(0);
    expect(result!.phase).toBe('downtime');
  });

  test('boundary: endMonth is downtime, not dev', () => {
    // endMonth = 3 for project 0, should be downtime
    const result = findProjectAtMonth(3, projects);
    expect(result!.phase).toBe('downtime');
  });

  test('boundary: cycleEndMonth returns null (gap between projects)', () => {
    // cycleEndMonth = 4 for project 0, startMonth = 4 for project 1
    // month 4 should be dev of project 1
    const result = findProjectAtMonth(4, projects);
    expect(result!.project.index).toBe(1);
    expect(result!.phase).toBe('dev');
  });

  test('returns null for month after all projects', () => {
    expect(findProjectAtMonth(15, projects)).toBeNull();
  });

  test('returns null for empty projects array', () => {
    expect(findProjectAtMonth(0, [])).toBeNull();
  });

  test('correctly identifies second project phases', () => {
    const dev = findProjectAtMonth(7, projects);
    expect(dev!.project.index).toBe(1);
    expect(dev!.phase).toBe('dev');

    const downtime = findProjectAtMonth(11, projects);
    expect(downtime!.project.index).toBe(1);
    expect(downtime!.phase).toBe('downtime');
  });
});

// --- DOM tests ---

const baseInputs: PlannerInputs = {
  targetIncome: 50000,
  timeHorizonMonths: 60,
  minDevScope: 3,
  targetDevScope: 12,
  monthlyFixedExpenses: 300,
  projectCostBase: 500,
  projectCostPerMonth: 250,
  platformCutRate: 0.30,
};

let window: InstanceType<typeof GlobalWindow>;
let container: HTMLElement;

beforeEach(() => {
  window = new GlobalWindow();
  globalThis.document = window.document as unknown as Document;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  window.close();
});

describe('createTimeline DOM', () => {
  test('shows no-data message when plan has 0 projects', () => {
    const timeline = createTimeline(container);
    const emptyPlan: GeneratedPlan = { projects: [], totalMonths: 0 };
    timeline.update(emptyPlan, baseInputs);

    const noData = container.querySelector('.no-data');
    expect(noData).not.toBeNull();
    expect(noData!.textContent).toContain('No projects');
  });

  test('renders stats bar with correct project count', () => {
    const timeline = createTimeline(container);
    const plan: GeneratedPlan = {
      projects,
      totalMonths: 12,
    };
    timeline.update(plan, baseInputs, undefined, 25000);

    const stats = container.querySelector('.timeline-stats');
    expect(stats).not.toBeNull();

    const values = Array.from(container.querySelectorAll('.stat-value')).map(
      (el) => el.textContent!.trim(),
    );
    // First stat is project count
    expect(values[0]).toBe('2');
  });

  test('renders annualized income stat', () => {
    const timeline = createTimeline(container);
    const plan: GeneratedPlan = { projects, totalMonths: 12 };
    timeline.update(plan, baseInputs, undefined, 25000);

    const statsHtml = container.querySelector('.timeline-stats')!.innerHTML;
    expect(statsHtml).toContain('$25,000');
    expect(statsHtml).toContain('Avg. Annual Net Profit');
  });

  test('shows $0 income when no annualized income provided', () => {
    const timeline = createTimeline(container);
    const plan: GeneratedPlan = { projects, totalMonths: 12 };
    timeline.update(plan, baseInputs);

    const statsHtml = container.querySelector('.timeline-stats')!.innerHTML;
    expect(statsHtml).toContain('$0');
  });
});
