/** Smoothness score (0–1): measures deviation from a linear ramp.
 *  Returns 1 for perfectly linear progressions, 0 for maximum deviation.
 *  Used by both the duration optimizer and M₁ optimizer. */
export function smoothness(values: number[]): number {
  if (values.length < 3) return 1;
  const first = values[0];
  const last = values[values.length - 1];
  const range = last - first;
  let totalDeviation = 0;
  for (let i = 1; i < values.length - 1; i++) {
    const ideal = first + (i / (values.length - 1)) * range;
    totalDeviation += Math.abs(values[i] - ideal);
  }
  const maxDeviation = range * (values.length - 2);
  return maxDeviation > 0 ? Math.max(0, 1 - totalDeviation / maxDeviation) : 1;
}
