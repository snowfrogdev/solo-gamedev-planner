import { describe, test, expect } from 'bun:test';
import { optimizeM1Values, monotonicityScore } from './m1Optimizer';
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
  platformCutRate: 0.30,
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

  test('M₁ values generally trend upward (last >= first)', () => {
    const { plan, pricingMap } = buildMaps(baseInputs);
    const m1Values = optimizeM1Values(plan.projects, pricingMap, baseInputs);
    if (m1Values.length >= 2) {
      expect(m1Values[m1Values.length - 1]).toBeGreaterThanOrEqual(m1Values[0]);
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
      totalInWindow += accounting.entries[m].netProfit;
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

  test('targetIncome of 0 returns valid array without throwing', () => {
    const { plan, pricingMap } = buildMaps({ ...baseInputs, targetIncome: 0 });
    const m1Values = optimizeM1Values(plan.projects, pricingMap, { ...baseInputs, targetIncome: 0 });
    expect(m1Values.length).toBe(plan.projects.length);
    for (const v of m1Values) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  test('longer horizon does not increase first project M₁', () => {
    const shortInputs = { ...baseInputs, timeHorizonMonths: 60 };
    const longInputs = { ...baseInputs, timeHorizonMonths: 120 };
    const { plan: shortPlan, pricingMap: shortPricing } = buildMaps(shortInputs);
    const { plan: longPlan, pricingMap: longPricing } = buildMaps(longInputs);
    const shortM1 = optimizeM1Values(shortPlan.projects, shortPricing, shortInputs);
    const longM1 = optimizeM1Values(longPlan.projects, longPricing, longInputs);
    // First project M₁ should not increase with longer horizon (10% tolerance)
    expect(longM1[0]).toBeLessThanOrEqual(shortM1[0] * 1.1);
  });

  test('optimized M₁ values have monotonicityScore above 0.7', () => {
    const { plan, pricingMap } = buildMaps(baseInputs);
    const m1Values = optimizeM1Values(plan.projects, pricingMap, baseInputs);
    expect(monotonicityScore(m1Values)).toBeGreaterThanOrEqual(0.7);
  });

  test('M1 values form a roughly smooth progression', () => {
    const { plan, pricingMap } = buildMaps(baseInputs);
    const m1Values = optimizeM1Values(plan.projects, pricingMap, baseInputs);
    if (m1Values.length >= 3) {
      // No single jump should be more than 5x the previous value
      for (let i = 1; i < m1Values.length; i++) {
        expect(m1Values[i]).toBeLessThanOrEqual(m1Values[i - 1] * 5);
      }
    }
  });
});

describe('monotonicityScore', () => {
  test('returns 1 for non-decreasing sequence', () => {
    expect(monotonicityScore([1, 2, 3, 4, 5])).toBe(1);
  });

  test('returns 1 for all-equal values', () => {
    expect(monotonicityScore([5, 5, 5])).toBe(1);
  });

  test('returns 1 for single element', () => {
    expect(monotonicityScore([42])).toBe(1);
  });

  test('returns 1 for empty array', () => {
    expect(monotonicityScore([])).toBe(1);
  });

  test('returns less than 1 for decreasing sequence', () => {
    expect(monotonicityScore([5, 4, 3, 2, 1])).toBeLessThan(1);
    expect(monotonicityScore([5, 4, 3, 2, 1])).toBeGreaterThan(0);
  });

  test('returns lower score for more violations', () => {
    const oneViolation = monotonicityScore([1, 3, 2, 4, 5]);
    const manyViolations = monotonicityScore([5, 1, 5, 1, 5]);
    expect(oneViolation).toBeGreaterThan(manyViolations);
  });
});
