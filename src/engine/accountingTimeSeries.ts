import type { PlannedProject, SalesTimeSeries, AccountingTimeSeries } from '../types';

/**
 * Aggregate per-project revenue into a horizon-wide monthly accounting series.
 * entries[m] contains the combined revenue/expenses/netIncome for calendar month m.
 * revenueByProject[projectIndex][m] contains each project's revenue at calendar month m.
 */
export function computeAccountingTimeSeries(
  projects: PlannedProject[],
  salesByProject: Map<number, SalesTimeSeries>,
  horizonEndMonth: number,
): AccountingTimeSeries {
  const length = Math.ceil(horizonEndMonth) + 1;
  const entries = Array.from({ length }, () => ({
    revenue: 0,
    expenses: 0,
    netIncome: 0,
  }));

  const revenueByProject: number[][] = projects.map(() => new Array(length).fill(0));

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
