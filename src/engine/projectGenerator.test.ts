import { describe, test, expect } from 'bun:test';
import { generatePlan } from './projectGenerator';
import type { PlannerInputs } from '../types';

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

describe('generatePlan', () => {
  test('every project duration is non-decreasing', () => {
    const plan = generatePlan(baseInputs);
    for (let i = 1; i < plan.projects.length; i++) {
      expect(plan.projects[i].devDurationMonths).toBeGreaterThanOrEqual(
        plan.projects[i - 1].devDurationMonths - 0.001,
      );
    }
  });

  test('every project duration is at most 2x the previous', () => {
    const plan = generatePlan(baseInputs);
    for (let i = 1; i < plan.projects.length; i++) {
      expect(plan.projects[i].devDurationMonths).toBeLessThanOrEqual(
        plan.projects[i - 1].devDurationMonths * 2.001,
      );
    }
  });

  test('all durations are between minDevScope and targetDevScope', () => {
    const plan = generatePlan(baseInputs);
    for (const p of plan.projects) {
      expect(p.devDurationMonths).toBeGreaterThanOrEqual(baseInputs.minDevScope - 0.001);
      expect(p.devDurationMonths).toBeLessThanOrEqual(baseInputs.targetDevScope + 0.001);
    }
  });

  test('first project is at minDevScope', () => {
    const plan = generatePlan(baseInputs);
    expect(plan.projects[0].devDurationMonths).toBeCloseTo(baseInputs.minDevScope, 4);
  });

  test('last project is at targetDevScope', () => {
    const plan = generatePlan(baseInputs);
    const last = plan.projects[plan.projects.length - 1];
    expect(last.devDurationMonths).toBeCloseTo(baseInputs.targetDevScope, 4);
  });

  test('durations form a roughly smooth ramp (no huge jumps)', () => {
    const plan = generatePlan(baseInputs);
    if (plan.projects.length < 3) return;
    const steps: number[] = [];
    for (let i = 1; i < plan.projects.length; i++) {
      steps.push(plan.projects[i].devDurationMonths - plan.projects[i - 1].devDurationMonths);
    }
    // All steps should be non-negative (non-decreasing)
    for (const s of steps) {
      expect(s).toBeGreaterThanOrEqual(-0.001);
    }
    // No single step should be more than half the total range
    const range = baseInputs.targetDevScope - baseInputs.minDevScope;
    for (const s of steps) {
      expect(s).toBeLessThan(range / 2 + 0.1);
    }
  });

  test('total time is approximately equal to time horizon', () => {
    const plan = generatePlan(baseInputs);
    expect(plan.totalMonths).toBeGreaterThan(baseInputs.timeHorizonMonths * 0.8);
    expect(plan.totalMonths).toBeLessThan(baseInputs.timeHorizonMonths * 1.2);
  });

  test('respects custom downtime function', () => {
    const fixedDowntime = (_d: number) => ({ total: 1, postLaunchSupport: 0.5, creativeRecovery: 0.5 });
    const plan = generatePlan(baseInputs, fixedDowntime);
    for (const p of plan.projects) {
      expect(p.downtimeMonths).toBeCloseTo(1, 4);
    }
  });

  test('projects are placed consecutively (no gaps or overlaps)', () => {
    const plan = generatePlan(baseInputs);
    expect(plan.projects[0].startMonth).toBeCloseTo(0, 10);
    for (let i = 1; i < plan.projects.length; i++) {
      expect(plan.projects[i].startMonth).toBeCloseTo(
        plan.projects[i - 1].cycleEndMonth, 4,
      );
    }
  });

  test('endMonth = startMonth + devDurationMonths for each project', () => {
    const plan = generatePlan(baseInputs);
    for (const p of plan.projects) {
      expect(p.endMonth).toBeCloseTo(p.startMonth + p.devDurationMonths, 10);
    }
  });

  test('edge case: minDevScope = targetDevScope → all projects same length', () => {
    const inputs: PlannerInputs = {
      ...baseInputs,
      minDevScope: 6,
      targetDevScope: 6,
    };
    const plan = generatePlan(inputs);
    for (const p of plan.projects) {
      expect(p.devDurationMonths).toBeCloseTo(6, 4);
    }
  });

  test('edge case: very short horizon → at least 1 project', () => {
    const inputs: PlannerInputs = {
      ...baseInputs,
      timeHorizonMonths: 4,
    };
    const plan = generatePlan(inputs);
    expect(plan.projects.length).toBeGreaterThanOrEqual(1);
  });

  test('edge case: very long horizon → many projects with small steps', () => {
    const inputs: PlannerInputs = {
      ...baseInputs,
      timeHorizonMonths: 240,
    };
    const plan = generatePlan(inputs);
    expect(plan.projects.length).toBeGreaterThan(10);
    // Steps should be small with many projects
    if (plan.projects.length > 2) {
      const step = plan.projects[1].devDurationMonths - plan.projects[0].devDurationMonths;
      expect(step).toBeLessThan(3);
    }
  });

  test('generates at least 1 project', () => {
    const plan = generatePlan(baseInputs);
    expect(plan.projects.length).toBeGreaterThanOrEqual(1);
  });

  test('tight horizon produces single target-scope project', () => {
    const inputs: PlannerInputs = {
      ...baseInputs,
      timeHorizonMonths: 12,
      minDevScope: 3,
      targetDevScope: 12,
    };
    const plan = generatePlan(inputs);
    expect(plan.projects.length).toBe(1);
    expect(plan.projects[0].devDurationMonths).toBe(12);
  });

  test('deterministic: same inputs produce same plan', () => {
    const plan1 = generatePlan(baseInputs);
    const plan2 = generatePlan(baseInputs);
    expect(plan1.projects.length).toBe(plan2.projects.length);
    for (let i = 0; i < plan1.projects.length; i++) {
      expect(plan1.projects[i].devDurationMonths).toBe(plan2.projects[i].devDurationMonths);
    }
  });

  test('last project ends at or past the horizon', () => {
    const plan = generatePlan(baseInputs);
    const last = plan.projects[plan.projects.length - 1];
    expect(last.cycleEndMonth).toBeGreaterThanOrEqual(baseInputs.timeHorizonMonths - 1);
  });

  test('a target-scope project starts before the horizon', () => {
    const plan = generatePlan(baseInputs);
    const targetProject = plan.projects.find(
      p => p.devDurationMonths === baseInputs.targetDevScope && p.startMonth < baseInputs.timeHorizonMonths,
    );
    expect(targetProject).toBeDefined();
  });

  test('different inputs produce different plans', () => {
    const plan1 = generatePlan(baseInputs);
    const plan2 = generatePlan({ ...baseInputs, targetDevScope: 18 });
    // At minimum, total months or project count should differ
    const same = plan1.projects.length === plan2.projects.length
      && Math.abs(plan1.totalMonths - plan2.totalMonths) < 0.01;
    expect(same).toBe(false);
  });

  test('all month boundaries are integers after rounding', () => {
    const plan = generatePlan(baseInputs);
    for (const p of plan.projects) {
      expect(Number.isInteger(p.startMonth)).toBe(true);
      expect(Number.isInteger(p.endMonth)).toBe(true);
      expect(Number.isInteger(p.cycleEndMonth)).toBe(true);
    }
  });

  test('handles zero-downtime function gracefully', () => {
    const zeroDowntime = (_d: number) => ({ total: 0, postLaunchSupport: 0, creativeRecovery: 0 });
    const plan = generatePlan(baseInputs, zeroDowntime);
    for (const p of plan.projects) {
      expect(p.downtimeMonths).toBe(0);
    }
  });
});
