import { describe, test, expect } from 'bun:test';
import { unitSalesDecay, computeSalesTimeSeries } from './salesModel';

const LP = 9.99; // standard launch price for tests

describe('unitSalesDecay', () => {
  test('f(1) = 1 exactly', () => {
    expect(unitSalesDecay(1, 0.55)).toBe(1);
  });

  test('f(m>1) matches tailStrength / m^0.65', () => {
    const ts = 0.55;
    for (const m of [2, 5, 12, 60]) {
      expect(unitSalesDecay(m, ts)).toBeCloseTo(ts / Math.pow(m, 0.65), 10);
    }
  });

  test('month <= 0 returns 0', () => {
    expect(unitSalesDecay(0, 0.55)).toBe(0);
    expect(unitSalesDecay(-3, 0.55)).toBe(0);
  });

  test('tailStrength scales proportionally', () => {
    const m = 10;
    const low = unitSalesDecay(m, 0.06);
    const mid = unitSalesDecay(m, 0.55);
    const high = unitSalesDecay(m, 2.4);
    expect(mid / low).toBeCloseTo(0.55 / 0.06, 5);
    expect(high / mid).toBeCloseTo(2.4 / 0.55, 5);
  });
});

describe('computeSalesTimeSeries', () => {
  test('monthlySales[0] equals m1Units', () => {
    const series = computeSalesTimeSeries(0, 120, 500, LP);
    expect(series.monthlySales[0]).toBe(500);
  });

  test('cumulative ~3x M₁ by year 1 (within 5%)', () => {
    const m1 = 1000;
    const series = computeSalesTimeSeries(0, 120, m1, LP);
    const ratio = series.cumulativeYear1 / m1;
    expect(ratio).toBeGreaterThan(3.0 * 0.95);
    expect(ratio).toBeLessThan(3.0 * 1.05);
  });

  test('cumulative ~4x M₁ by year 2 (within 5%)', () => {
    const m1 = 1000;
    const series = computeSalesTimeSeries(0, 120, m1, LP);
    const ratio = series.cumulativeYear2 / m1;
    expect(ratio).toBeGreaterThan(4.0 * 0.95);
    expect(ratio).toBeLessThan(4.0 * 1.05);
  });

  test('cumulative ~5.8x M₁ by year 5 (within 5%)', () => {
    const m1 = 1000;
    const series = computeSalesTimeSeries(0, 120, m1, LP);
    const ratio = series.cumulativeYear5 / m1;
    expect(ratio).toBeGreaterThan(5.8 * 0.95);
    expect(ratio).toBeLessThan(5.8 * 1.05);
  });

  test('series is monotonically non-increasing', () => {
    const series = computeSalesTimeSeries(0, 120, 500, LP);
    for (let i = 1; i < series.monthlySales.length; i++) {
      expect(series.monthlySales[i]).toBeLessThanOrEqual(series.monthlySales[i - 1]);
    }
  });

  test('early cutoff with small M₁', () => {
    const series = computeSalesTimeSeries(0, 120, 5, LP, { tailStrength: 0.55 });
    expect(series.monthlySales.length).toBeLessThan(120);
    expect(series.monthlySales[series.monthlySales.length - 1]).toBeGreaterThanOrEqual(1);
  });

  test('tailStrength parameter changes output', () => {
    const low = computeSalesTimeSeries(0, 120, 500, LP, { tailStrength: 0.06 });
    const high = computeSalesTimeSeries(0, 120, 500, LP, { tailStrength: 2.4 });
    expect(high.cumulativeTotal).toBeGreaterThan(low.cumulativeTotal);
    expect(high.monthlySales[1]).toBeGreaterThan(low.monthlySales[1]);
  });

  test('respects horizon when longer than 120 months', () => {
    const series = computeSalesTimeSeries(0, 200, 10000, LP);
    expect(series.monthlySales.length).toBeGreaterThan(120);
  });

  test('cumulativeTotal equals sum of monthlySales', () => {
    const series = computeSalesTimeSeries(0, 120, 500, LP);
    const sum = series.monthlySales.reduce((a, b) => a + b, 0);
    expect(series.cumulativeTotal).toBeCloseTo(sum, 5);
  });

  test('monthlyPrices and monthlyRevenue are populated', () => {
    const series = computeSalesTimeSeries(0, 120, 500, LP);
    expect(series.monthlyPrices.length).toBe(series.monthlySales.length);
    expect(series.monthlyRevenue.length).toBe(series.monthlySales.length);
    // Revenue = price × units
    expect(series.monthlyRevenue[0]).toBeCloseTo(series.monthlyPrices[0] * series.monthlySales[0], 5);
  });

  test('monthly prices decay over time', () => {
    const series = computeSalesTimeSeries(0, 120, 500, LP);
    expect(series.monthlyPrices[0]).toBeGreaterThan(series.monthlyPrices[11]);
  });

  test('m1Units = 0 produces empty series', () => {
    const series = computeSalesTimeSeries(0, 120, 0, LP);
    expect(series.monthlySales.length).toBe(0);
    expect(series.cumulativeTotal).toBe(0);
  });

  test('early-cutoff milestones snapshot to cumulative total', () => {
    const series = computeSalesTimeSeries(0, 120, 2, LP, { tailStrength: 0.55 });
    // Series ends well before month 12
    expect(series.monthlySales.length).toBeLessThan(12);
    expect(series.cumulativeYear1).toBe(series.cumulativeTotal);
    expect(series.cumulativeYear2).toBe(series.cumulativeTotal);
    expect(series.cumulativeYear5).toBe(series.cumulativeTotal);
  });

  test('default tailStrength matches explicit 0.55', () => {
    const withDefault = computeSalesTimeSeries(0, 120, 500, LP);
    const withExplicit = computeSalesTimeSeries(0, 120, 500, LP, { tailStrength: 0.55 });
    expect(withDefault.cumulativeTotal).toBe(withExplicit.cumulativeTotal);
    expect(withDefault.monthlySales.length).toBe(withExplicit.monthlySales.length);
  });

  test('non-zero launchMonth with same delta produces same unit sales', () => {
    const a = computeSalesTimeSeries(0, 120, 500, LP);
    const b = computeSalesTimeSeries(50, 170, 500, LP);
    // Same delta (120), same m1Units → same unit series
    expect(b.monthlySales.length).toBe(a.monthlySales.length);
    expect(b.cumulativeTotal).toBeCloseTo(a.cumulativeTotal, 5);
  });
});
