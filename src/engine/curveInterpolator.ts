import type { BezierCurve } from '../types';

/**
 * Evaluate a cubic bezier at parameter t (0–1).
 * Returns the (x, y) point on the curve.
 */
function evalBezier(curve: BezierCurve, t: number): { x: number; y: number } {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * curve.p0.x + 3 * mt2 * t * curve.cp1.x + 3 * mt * t2 * curve.cp2.x + t3 * curve.p3.x,
    y: mt3 * curve.p0.y + 3 * mt2 * t * curve.cp1.y + 3 * mt * t2 * curve.cp2.y + t3 * curve.p3.y,
  };
}

/**
 * Creates an interpolation function from a cubic bezier curve.
 * Input: normalized x (0–1), output: normalized y (0–1).
 *
 * Since bezier curves are parametric (t maps to both x and y),
 * we build a lookup table and binary-search for the t that gives us
 * the desired x, then return the corresponding y.
 */
export function createInterpolator(curve: BezierCurve): (x: number) => number {
  // Build a dense lookup table
  const SAMPLES = 200;
  const table: { x: number; y: number }[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    table.push(evalBezier(curve, t));
  }

  return (x: number): number => {
    if (x <= table[0].x) return table[0].y;
    if (x >= table[SAMPLES].x) return table[SAMPLES].y;

    // Binary search for the segment containing x
    let lo = 0;
    let hi = SAMPLES;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid].x <= x) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    // Linear interpolation within the segment
    const segX = table[hi].x - table[lo].x;
    if (segX === 0) return table[lo].y;
    const frac = (x - table[lo].x) / segX;
    return table[lo].y + frac * (table[hi].y - table[lo].y);
  };
}
