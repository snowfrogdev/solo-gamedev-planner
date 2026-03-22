import type { PlannedProject, PlannerInputs, SalesTimeSeries, AccountingTimeSeries } from '../types';
import { devCostWeights } from './expenses';

/**
 * Aggregate per-project revenue and expenses into a horizon-wide monthly accounting series.
 * entries[m] contains the full P&L breakdown for calendar month m.
 * revenueByProject[projectIndex][m] contains each project's revenue at calendar month m.
 */
export function computeAccountingTimeSeries(
  projects: PlannedProject[],
  salesByProject: Map<number, SalesTimeSeries>,
  horizonEndMonth: number,
  inputs: PlannerInputs,
): AccountingTimeSeries {
  const length = Math.ceil(horizonEndMonth) + 1;
  const entries = Array.from({ length }, () => ({
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    fixedExpenses: 0,
    netProfit: 0,
    platformFees: 0,
    projectDevCosts: 0,
  }));

  const revenueByProject: number[][] = projects.map(() => new Array(length).fill(0));

  // Revenue
  for (let pi = 0; pi < projects.length; pi++) {
    const project = projects[pi];
    const sales = salesByProject.get(project.index);
    if (!sales) continue;

    for (let i = 0; i < sales.monthlyRevenue.length; i++) {
      const calendarMonth = Math.floor(project.endMonth) + i;
      if (calendarMonth >= length) break;
      const rev = sales.monthlyRevenue[i];
      entries[calendarMonth].revenue += rev;
      revenueByProject[pi][calendarMonth] = rev;
    }
  }

  // Platform fees (COGS component)
  for (let m = 0; m < length; m++) {
    entries[m].platformFees = entries[m].revenue * inputs.platformCutRate;
  }

  // Variable project costs — distributed across dev months with power-law weighting (COGS component)
  for (const project of projects) {
    const totalCost = inputs.projectCostBase + project.devDurationMonths * inputs.projectCostPerMonth;
    const weights = devCostWeights(project.devDurationMonths);

    for (let i = 0; i < weights.length; i++) {
      const calendarMonth = Math.floor(project.startMonth) + i;
      if (calendarMonth >= length) break;
      entries[calendarMonth].projectDevCosts += totalCost * weights[i];
    }
  }

  // Aggregate P&L
  for (const entry of entries) {
    entry.cogs = entry.platformFees + entry.projectDevCosts;
    entry.grossProfit = entry.revenue - entry.cogs;
    entry.fixedExpenses = inputs.monthlyFixedExpenses;
    entry.netProfit = entry.grossProfit - entry.fixedExpenses;
  }

  return { entries, revenueByProject };
}

/**
 * Compute annualized net profit at the horizon using the lookback window.
 * Window = max(12, targetDevScope) months ending at the horizon, pro-rated to 12 months.
 */
export function computeAnnualizedNetProfit(
  accounting: AccountingTimeSeries,
  timeHorizonMonths: number,
  targetDevScope: number,
): number {
  const windowSize = Math.max(12, targetDevScope);
  const windowStart = Math.max(0, Math.floor(timeHorizonMonths) - windowSize);
  const windowEnd = Math.min(accounting.entries.length, Math.floor(timeHorizonMonths));

  let totalInWindow = 0;
  for (let m = windowStart; m < windowEnd; m++) {
    totalInWindow += accounting.entries[m].netProfit;
  }

  const actualWindowMonths = windowEnd - windowStart;
  if (actualWindowMonths <= 0) return 0;

  return totalInWindow * 12 / actualWindowMonths;
}
