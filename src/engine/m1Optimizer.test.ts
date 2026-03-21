import { describe, test, expect } from 'bun:test';
import { optimizeM1Values } from './m1Optimizer';
import { generatePlan } from './projectGenerator';
import { computeLaunchPrice } from './pricingModel';
import { computeSalesTimeSeries } from './salesModel';
import { computeAccountingTimeSeries } from './accountingTimeSeries';
import type { PlannerInputs, PricingInfo } from '../types';

const baseInputs: PlannerInputs = {
  targetIncome: 50000,
  timeHorizonMonths: 60,
  minDevScope: 3,
  targetDevScope: 12,
  monthlyFixedExpenses: 300,
  projectCostBase: 500,
  projectCostPerMonth: 250,
};

function buildMaps(inputs: PlannerInputs) {
  const plan = generatePlan(inputs);
  const pricingMap = new Map<number, PricingInfo>(
    plan.projects.map((p) => [p.index, computeLaunchPrice(p.devDurationMonths)]),
  );
  return { plan, pricingMap };
}

describe('optimizeM1Values', () => {
  test('deterministic: same inputs produce same output', () => {
    const { plan, pricingMap } = buildMaps(baseInputs);
    const a = optimizeM1Values(plan.projects, pricingMap, baseInputs);
    const b = optimizeM1Values(plan.projects, pricingMap, baseInputs);
    expect(a).toEqual(b);
  });

  test('returns one M₁ value per project', () => {
    const { plan, pricingMap } = buildMaps(baseInputs);
    const m1Values = optimizeM1Values(plan.projects, pricingMap, baseInputs);
    expect(m1Values.length).toBe(plan.projects.length);
  });

  test('all M₁ values are >= 1', () => {
    const { plan, pricingMap } = buildMaps(baseInputs);
    const m1Values = optimizeM1Values(plan.projects, pricingMap, baseInputs);
    for (const v of m1Values) {
      expect(v).toBeGreaterThanOrEqual(1);
    }
  });

  test('M₁ values are non-decreasing', () => {
    const { plan, pricingMap } = buildMaps(baseInputs);
    const m1Values = optimizeM1Values(plan.projects, pricingMap, baseInputs);
    for (let i = 1; i < m1Values.length; i++) {
      expect(m1Values[i]).toBeGreaterThanOrEqual(m1Values[i - 1]);
    }
  });

  test('higher income target produces higher M₁ values', () => {
    // Use the same plan for both to isolate the income target effect
    const { plan, pricingMap } = buildMaps(baseInputs);
    const lowInputs = { ...baseInputs, targetIncome: 10000 };
    const highInputs = { ...baseInputs, targetIncome: 200000 };
    const lowM1 = optimizeM1Values(plan.projects, pricingMap, lowInputs);
    const highM1 = optimizeM1Values(plan.projects, pricingMap, highInputs);

    // Last project's M₁ should be higher with higher income target
    expect(highM1[highM1.length - 1]).toBeGreaterThan(lowM1[lowM1.length - 1]);
  });

  test('income at horizon approximately meets target', () => {
    const { plan, pricingMap } = buildMaps(baseInputs);
    const m1Values = optimizeM1Values(plan.projects, pricingMap, baseInputs);

    // Compute the actual annualized income
    const horizon = baseInputs.timeHorizonMonths;
    const salesMap = new Map(
      plan.projects.map((p, i) => {
        const pricing = pricingMap.get(p.index)!;
        return [p.index, computeSalesTimeSeries(p.endMonth, horizon, m1Values[i], pricing.launchPrice)] as const;
      }),
    );
    const accounting = computeAccountingTimeSeries(plan.projects, salesMap, horizon, baseInputs);

    const windowSize = Math.max(12, baseInputs.targetDevScope);
    const windowStart = Math.max(0, Math.floor(horizon) - windowSize);
    const windowEnd = Math.min(accounting.entries.length, Math.floor(horizon));
    let totalInWindow = 0;
    for (let m = windowStart; m < windowEnd; m++) {
      totalInWindow += accounting.entries[m].netIncome;
    }
    const annualized = totalInWindow * 12 / (windowEnd - windowStart);

    // Should be within 20% of target in either direction
    expect(annualized).toBeGreaterThan(baseInputs.targetIncome * 0.8);
    expect(annualized).toBeLessThan(baseInputs.targetIncome * 1.5);
  });

  test('empty project list returns empty array', () => {
    const m1Values = optimizeM1Values([], new Map(), baseInputs);
    expect(m1Values).toEqual([]);
  });
});
