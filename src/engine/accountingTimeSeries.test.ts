import { describe, test, expect } from 'bun:test';
import { computeAccountingTimeSeries, computeAnnualizedIncome } from './accountingTimeSeries';
import { computeSalesTimeSeries } from './salesModel';
import type { PlannedProject, SalesTimeSeries } from '../types';

function makeProject(index: number, endMonth: number, devDuration: number): PlannedProject {
  return {
    index,
    startMonth: endMonth - devDuration,
    devDurationMonths: devDuration,
    endMonth,
    downtimeMonths: 1,
    cycleEndMonth: endMonth + 1,
  };
}

describe('computeAccountingTimeSeries', () => {
  test('single project places revenue at correct calendar months', () => {
    const project = makeProject(0, 6, 3);
    const sales = computeSalesTimeSeries(6, 60, 100, 9.99);
    const salesMap = new Map<number, SalesTimeSeries>([[0, sales]]);

    const accounting = computeAccountingTimeSeries([project], salesMap, 60);

    // Months before launch should be zero
    for (let m = 0; m < 6; m++) {
      expect(accounting.entries[m].revenue).toBe(0);
    }
    // Launch month (6) should have month-1 revenue
    expect(accounting.entries[6].revenue).toBeGreaterThan(0);
    expect(accounting.entries[6].revenue).toBe(sales.monthlyRevenue[0]);
  });

  test('two overlapping projects sum revenue correctly', () => {
    const p1 = makeProject(0, 4, 2);
    const p2 = makeProject(1, 8, 3);
    const s1 = computeSalesTimeSeries(4, 60, 100, 9.99);
    const s2 = computeSalesTimeSeries(8, 60, 200, 14.99);
    const salesMap = new Map<number, SalesTimeSeries>([[0, s1], [1, s2]]);

    const accounting = computeAccountingTimeSeries([p1, p2], salesMap, 60);

    // At month 8, both projects have revenue
    expect(accounting.entries[8].revenue).toBeCloseTo(
      s1.monthlyRevenue[4] + s2.monthlyRevenue[0],
      5,
    );
  });

  test('empty project list returns all-zero entries', () => {
    const accounting = computeAccountingTimeSeries([], new Map(), 24);
    expect(accounting.entries.length).toBe(25);
    for (const entry of accounting.entries) {
      expect(entry.revenue).toBe(0);
      expect(entry.netIncome).toBe(0);
    }
  });

  test('netIncome equals revenue when expenses are zero', () => {
    const project = makeProject(0, 3, 3);
    const sales = computeSalesTimeSeries(3, 24, 500, 9.99);
    const salesMap = new Map<number, SalesTimeSeries>([[0, sales]]);

    const accounting = computeAccountingTimeSeries([project], salesMap, 24);

    for (const entry of accounting.entries) {
      expect(entry.netIncome).toBe(entry.revenue);
      expect(entry.expenses).toBe(0);
    }
  });

  test('revenueByProject tracks per-project revenue', () => {
    const p1 = makeProject(0, 4, 2);
    const p2 = makeProject(1, 8, 3);
    const s1 = computeSalesTimeSeries(4, 60, 100, 9.99);
    const s2 = computeSalesTimeSeries(8, 60, 200, 14.99);
    const salesMap = new Map<number, SalesTimeSeries>([[0, s1], [1, s2]]);

    const accounting = computeAccountingTimeSeries([p1, p2], salesMap, 60);

    expect(accounting.revenueByProject.length).toBe(2);
    // Project 0 at month 4 = its launch revenue
    expect(accounting.revenueByProject[0][4]).toBe(s1.monthlyRevenue[0]);
    // Project 1 at month 8 = its launch revenue
    expect(accounting.revenueByProject[1][8]).toBe(s2.monthlyRevenue[0]);
    // Pre-launch months are zero
    expect(accounting.revenueByProject[0][3]).toBe(0);
    expect(accounting.revenueByProject[1][7]).toBe(0);
    // Sum matches aggregate
    expect(accounting.entries[8].revenue).toBeCloseTo(
      accounting.revenueByProject[0][8] + accounting.revenueByProject[1][8],
      5,
    );
  });

  test('computeAnnualizedIncome uses lookback window correctly', () => {
    const project = makeProject(0, 3, 3);
    const sales = computeSalesTimeSeries(3, 24, 500, 9.99);
    const salesMap = new Map<number, SalesTimeSeries>([[0, sales]]);

    const accounting = computeAccountingTimeSeries([project], salesMap, 24);
    const annualized = computeAnnualizedIncome(accounting, 24, 12);

    // Should be positive (there's revenue in the lookback window)
    expect(annualized).toBeGreaterThan(0);

    // Window is 12 months (max(12, targetDevScope=12)), so it's the raw sum × 12/12 = raw sum
    let manualSum = 0;
    for (let m = 12; m < 24; m++) {
      manualSum += accounting.entries[m].netIncome;
    }
    expect(annualized).toBeCloseTo(manualSum, 2);
  });

  test('revenue beyond horizon is truncated', () => {
    const project = makeProject(0, 10, 5);
    const sales = computeSalesTimeSeries(10, 120, 1000, 9.99);
    const salesMap = new Map<number, SalesTimeSeries>([[0, sales]]);

    const accounting = computeAccountingTimeSeries([project], salesMap, 15);

    // Only 6 months of revenue (months 10-15)
    expect(accounting.entries.length).toBe(16);
    expect(accounting.entries[15].revenue).toBeGreaterThan(0);
  });
});
