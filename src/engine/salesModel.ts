import type { SalesTimeSeries } from '../types';
import { averageEffectivePrice } from './pricingModel';
import { devCostWeights } from './expenses';

const DECAY_EXPONENT = 0.65;

/** Pure decay multiplier f(m): f(1) = 1, f(m>1) = tailStrength / m^0.65 */
export function unitSalesDecay(month: number, tailStrength: number): number {
  if (month <= 0) return 0;
  if (month === 1) return 1;
  return tailStrength / Math.pow(month, DECAY_EXPONENT);
}

export interface SalesTimeSeriesOptions {
  devDurationMonths?: number;
  projectCostBase?: number;
  projectCostPerMonth?: number;
  tailStrength?: number;
}

/**
 * Compute a monthly unit-sales time series for a single game.
 * monthlySales[0] = month 1 (launch month).
 * Also pre-computes monthly prices (AEP), revenue, and per-project expenses.
 */
export function computeSalesTimeSeries(
  launchMonth: number,
  horizonEndMonth: number,
  m1Units: number,
  launchPrice: number,
  options?: SalesTimeSeriesOptions,
): SalesTimeSeries {
  const devDurationMonths = options?.devDurationMonths ?? 0;
  const projectCostBase = options?.projectCostBase ?? 0;
  const projectCostPerMonth = options?.projectCostPerMonth ?? 0;
  const tailStrength = options?.tailStrength ?? 0.55;
  const maxMonths = Math.max(horizonEndMonth - launchMonth, 120);
  const monthlySales: number[] = [];
  const monthlyPrices: number[] = [];
  const monthlyRevenue: number[] = [];
  let cumulative = 0;
  let cumulativeYear1 = 0;
  let cumulativeYear2 = 0;
  let cumulativeYear5 = 0;

  for (let m = 1; m <= maxMonths; m++) {
    const units = m1Units * unitSalesDecay(m, tailStrength);
    if (units < 1) break;
    const price = averageEffectivePrice(launchPrice, m);
    monthlySales.push(units);
    monthlyPrices.push(price);
    monthlyRevenue.push(price * units);
    cumulative += units;
    if (m === 12) cumulativeYear1 = cumulative;
    if (m === 24) cumulativeYear2 = cumulative;
    if (m === 60) cumulativeYear5 = cumulative;
  }

  // If series ended before a milestone, snapshot at final value
  const len = monthlySales.length;
  if (len < 12) cumulativeYear1 = cumulative;
  if (len < 24) cumulativeYear2 = cumulative;
  if (len < 60) cumulativeYear5 = cumulative;

  // Per-project variable expenses distributed across dev months
  const totalProjectCost = projectCostBase + devDurationMonths * projectCostPerMonth;
  const weights = devCostWeights(devDurationMonths);
  const monthlyDevCosts = weights.map((w) => totalProjectCost * w);

  return {
    m1Units,
    tailStrength,
    monthlySales,
    monthlyPrices,
    monthlyRevenue,
    cumulativeTotal: cumulative,
    cumulativeYear1,
    cumulativeYear2,
    cumulativeYear5,
    monthlyDevCosts,
    totalDevCost: totalProjectCost,
  };
}
