import type { PlannerInputs, PlannedProject, PricingInfo } from '../types';
import { mulberry32 } from './prng';
import { computeSalesTimeSeries } from './salesModel';
import { computeAccountingTimeSeries, computeAnnualizedIncome } from './accountingTimeSeries';
import { smoothness } from './optimizerUtils';

const MAX_ITERATIONS = 2000;
const M1_FLOOR = 1;

function hashM1Inputs(inputs: PlannerInputs, projectCount: number): number {
  let hash = 13;
  hash = (hash * 31 + Math.round(inputs.targetIncome)) | 0;
  hash = (hash * 31 + projectCount) | 0;
  hash = (hash * 31 + Math.round(inputs.timeHorizonMonths * 100)) | 0;
  hash = (hash * 31 + Math.round(inputs.targetDevScope * 100)) | 0;
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
  return computeAnnualizedIncome(accounting, horizon, inputs.targetDevScope);
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
  return (2 * coverage + smooth) / 3;
}

function enforceM1Constraints(values: number[]): void {
  // Floor
  for (let i = 0; i < values.length; i++) {
    values[i] = Math.max(M1_FLOOR, Math.round(values[i]));
  }
  // Non-decreasing
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i - 1]) values[i] = values[i - 1];
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

  // Seed: linear ramp from a modest floor to an estimated upper bound
  const seedFloor = 50;
  const seedCeiling = Math.max(seedFloor * 2, inputs.targetIncome / (n * 100));
  const seed = Array.from({ length: n }, (_, i) =>
    n === 1 ? seedCeiling : seedFloor + (i / (n - 1)) * (seedCeiling - seedFloor),
  );
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
