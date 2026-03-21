/** Default expense configuration */
export const DEFAULT_MONTHLY_FIXED_EXPENSES = 300;
export const DEFAULT_PROJECT_COST_BASE = 500;
export const DEFAULT_PROJECT_COST_PER_MONTH = 250;

/**
 * Compute power-law weights for distributing costs across dev months.
 * Later months bear more cost (heavier toward release).
 * Weights sum to 1.
 */
export function devCostWeights(devMonths: number): number[] {
  const n = Math.max(1, Math.ceil(devMonths));
  const raw = Array.from({ length: n }, (_, i) => Math.pow(i + 1, 1.5));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}
