import type { PlannerInputs, PlannedProject, PricingInfo } from '../types';
import { mulberry32 } from './prng';
import { computeSalesTimeSeries, unitSalesDecay } from './salesModel';
import { DEFAULT_TAIL_STRENGTH } from './steamComparison';
import { computeAccountingTimeSeries, computeAnnualizedNetProfit } from './accountingTimeSeries';
import { smoothness } from './optimizerUtils';
import { averageEffectivePrice } from './pricingModel';

const MAX_ITERATIONS = 2000;
const M1_FLOOR = 1;

function hashM1Inputs(inputs: PlannerInputs, projectCount: number): number {
  let hash = 13;
  hash = (hash * 31 + Math.round(inputs.targetIncome)) | 0;
  hash = (hash * 31 + projectCount) | 0;
  // timeHorizonMonths excluded: project count already captures horizon changes,
  // and including it causes chaotic M1 jumps when nudging the horizon slider.
  hash = (hash * 31 + Math.round(inputs.targetDevScope * 100)) | 0;
  hash = (hash * 31 + Math.round(inputs.platformCutRate * 1000)) | 0;
  return hash;
}

/** Build sales + accounting and compute annualized income for a candidate M₁ vector */
function evaluateAnnualizedIncome(
  m1Values: number[],
  projects: PlannedProject[],
  pricingMap: Map<number, PricingInfo>,
  inputs: PlannerInputs,
): number {
  const horizon = inputs.timeHorizonMonths;
  const salesMap = new Map(
    projects.map((p, i) => {
      const pricing = pricingMap.get(p.index)!;
      return [p.index, computeSalesTimeSeries(p.endMonth, horizon, m1Values[i], pricing.launchPrice, {
        devDurationMonths: p.devDurationMonths,
        projectCostBase: inputs.projectCostBase,
        projectCostPerMonth: inputs.projectCostPerMonth,
      })] as const;
    }),
  );

  const accounting = computeAccountingTimeSeries(projects, salesMap, horizon, inputs);
  return computeAnnualizedNetProfit(accounting, horizon, inputs.targetDevScope);
}

/** Soft monotonicity score: 1 if non-decreasing, reduced for each violation */
export function monotonicityScore(values: number[]): number {
  if (values.length < 2) return 1;
  let totalMagnitude = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i - 1]) {
      totalMagnitude += values[i - 1] - values[i];
    }
  }
  if (totalMagnitude === 0) return 1;
  const range = Math.max(1, Math.max(...values) - Math.min(...values));
  // Normalize by length so longer plans tolerate more local dips
  return Math.max(0, 1 - totalMagnitude / (range * values.length));
}

function m1Fitness(
  m1Values: number[],
  projects: PlannedProject[],
  pricingMap: Map<number, PricingInfo>,
  inputs: PlannerInputs,
): number {
  if (inputs.targetIncome <= 0) return 0;

  const annualized = evaluateAnnualizedIncome(m1Values, projects, pricingMap, inputs);
  const ratio = annualized / inputs.targetIncome;
  // Asymmetric penalty: undershooting penalised linearly (ratio 0.5 → coverage 0.5),
  // overshooting penalised at 0.5× rate (ratio 1.5 → coverage 0.75) so the optimizer
  // slightly prefers overshooting but still converges toward the target.
  const coverage = ratio <= 1 ? ratio : Math.max(0, 1 - (ratio - 1) * 0.5);
  const smooth = smoothness(m1Values);
  const monotonic = monotonicityScore(m1Values);
  // Coverage dominates (50%), monotonicity (25%), smoothness (25%)
  return (4 * coverage + 2 * monotonic + 2 * smooth) / 8;
}

function enforceM1Constraints(values: number[]): void {
  // Floor only — non-decreasing is now a soft penalty in the fitness function
  for (let i = 0; i < values.length; i++) {
    values[i] = Math.max(M1_FLOOR, Math.round(values[i]));
  }
}

function mutateM1(values: number[], rand: () => number): number[] {
  const candidate = [...values];
  const r = rand();

  if (r < 0.5 && candidate.length >= 3) {
    // Nudge a random interior value
    const idx = 1 + Math.floor(rand() * (candidate.length - 2));
    const range = candidate[candidate.length - 1] - candidate[0];
    const nudge = (rand() - 0.5) * Math.max(range * 0.15, 10);
    candidate[idx] += nudge;
  } else if (r < 0.8) {
    // Scale all values by a random factor
    const factor = 0.8 + rand() * 0.4;
    for (let i = 0; i < candidate.length; i++) {
      candidate[i] *= factor;
    }
  } else {
    // Nudge first or last
    const idx = rand() < 0.5 ? 0 : candidate.length - 1;
    const nudge = (rand() - 0.5) * Math.max(candidate[idx] * 0.2, 10);
    candidate[idx] += nudge;
  }

  enforceM1Constraints(candidate);
  return candidate;
}

/**
 * Find M₁ (first-month unit sales) values per project that produce
 * annualized income at the horizon meeting the target, with smooth progression.
 */
export function optimizeM1Values(
  projects: PlannedProject[],
  pricingMap: Map<number, PricingInfo>,
  inputs: PlannerInputs,
): number[] {
  const n = projects.length;
  if (n === 0) return [];

  const rand = mulberry32(hashM1Inputs(inputs, n));

  // Seed: contribution-proportional — each project's M1 is sized by how much
  // it contributes to the trailing-window income that the fitness function measures.
  // Early projects whose sales have decayed by the window get low seeds.
  const seedFloor = 50;
  const horizon = inputs.timeHorizonMonths;
  const tailStrength = DEFAULT_TAIL_STRENGTH;
  const windowSize = Math.max(12, inputs.targetDevScope);
  const windowStart = Math.max(0, Math.floor(horizon) - windowSize);
  const windowEnd = Math.floor(horizon);

  // Estimate each project's net profit contribution to the trailing window per M1 unit
  const profitPerM1InWindow = projects.map((p) => {
    const pricing = pricingMap.get(p.index)!;
    let profit = 0;
    for (let calMonth = windowStart; calMonth < windowEnd; calMonth++) {
      const salesMonth = calMonth - p.endMonth + 1; // months since launch
      if (salesMonth < 1) continue;
      const decay = unitSalesDecay(salesMonth, tailStrength);
      if (decay < 0.001) continue;
      const price = averageEffectivePrice(pricing.launchPrice, salesMonth);
      const revenue = price * decay;
      profit += revenue * (1 - inputs.platformCutRate);
    }
    return profit;
  });

  // Target: annualized net profit in the window = targetIncome
  // Compute a base M1 level, then ramp from 60% (first project) to 140% (last project)
  // so the seed already has a natural progression that later games sell more.
  const totalProfitPerM1 = profitPerM1InWindow.reduce((a, b) => a + b, 0);
  const windowIncomeTarget = inputs.targetIncome * (windowSize / 12)
    + inputs.monthlyFixedExpenses * windowSize; // offset fixed expenses

  const baseM1 = totalProfitPerM1 > 0 ? windowIncomeTarget / totalProfitPerM1 : seedFloor;

  const seed = projects.map((_, i) => {
    if (profitPerM1InWindow[i] <= 0) return seedFloor;
    // Ramp from 0.6× to 1.4× across the project sequence
    const rampFactor = n === 1 ? 1 : 0.6 + 0.8 * (i / (n - 1));
    return Math.max(seedFloor, baseM1 * rampFactor);
  });
  enforceM1Constraints(seed);

  let bestValues = seed;
  let bestScore = m1Fitness(bestValues, projects, pricingMap, inputs);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const candidate = mutateM1(bestValues, rand);
    const score = m1Fitness(candidate, projects, pricingMap, inputs);
    if (score > bestScore) {
      bestValues = candidate;
      bestScore = score;
    }
  }

  return bestValues;
}
