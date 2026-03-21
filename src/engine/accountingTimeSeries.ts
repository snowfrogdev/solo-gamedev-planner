import type { PlannedProject, PlannerInputs, SalesTimeSeries, AccountingTimeSeries } from '../types';
import { devCostWeights } from './expenses';

/**
 * Aggregate per-project revenue and expenses into a horizon-wide monthly accounting series.
 * entries[m] contains the combined revenue/expenses/netIncome for calendar month m.
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
    expenses: 0,
    netIncome: 0,
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

  // Fixed monthly expenses — every month in the horizon
  for (let m = 0; m < length; m++) {
    entries[m].expenses += inputs.monthlyFixedExpenses;
  }

  // Variable project costs — distributed across dev months with power-law weighting
  for (const project of projects) {
    const totalCost = inputs.projectCostBase + project.devDurationMonths * inputs.projectCostPerMonth;
    const weights = devCostWeights(project.devDurationMonths);

    for (let i = 0; i < weights.length; i++) {
      const calendarMonth = Math.floor(project.startMonth) + i;
      if (calendarMonth >= length) break;
      entries[calendarMonth].expenses += totalCost * weights[i];
    }
  }

  // Net income
  for (const entry of entries) {
    entry.netIncome = entry.revenue - entry.expenses;
  }

  return { entries, revenueByProject };
}

/**
 * Compute annualized income at the horizon using the lookback window.
 * Window = max(12, targetDevScope) months ending at the horizon, pro-rated to 12 months.
 */
export function computeAnnualizedIncome(
  accounting: AccountingTimeSeries,
  timeHorizonMonths: number,
  targetDevScope: number,
): number {
  const windowSize = Math.max(12, targetDevScope);
  const windowStart = Math.max(0, Math.floor(timeHorizonMonths) - windowSize);
  const windowEnd = Math.min(accounting.entries.length, Math.floor(timeHorizonMonths));

  let totalInWindow = 0;
  for (let m = windowStart; m < windowEnd; m++) {
    totalInWindow += accounting.entries[m].netIncome;
  }

  const actualWindowMonths = windowEnd - windowStart;
  if (actualWindowMonths <= 0) return 0;

  return totalInWindow * 12 / actualWindowMonths;
}
