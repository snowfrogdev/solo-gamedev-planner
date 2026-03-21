import type { BezierCurve } from '../types';
import { defaultDowntime } from './downtimeCalculator';

/** Fixed x range for downtime curves: 0.5–60 months */
export const DOWNTIME_X_MIN = 0.5;
export const DOWNTIME_X_MAX = 60;

/**
 * Fit a bezier curve to a formula f(x) over the normalized 0–1 range.
 *
 * Uses a least-squares approach: samples the formula at interior points,
 * then solves a 2×2 normal-equation system to find cp1/cp2 that minimize
 * the squared error between the bezier and the sampled values.
 */
function fitBezierToFormula(
  formula: (realX: number) => number,
  xMin: number, xMax: number, maxOutput: number,
): BezierCurve {
  const xRange = xMax - xMin;
  const p0 = { x: 0, y: formula(xMin) / maxOutput };
  const p3 = { x: 1, y: formula(xMax) / maxOutput };

  const FITTING_SAMPLES = 50;
  const targets: { t: number; nx: number; ny: number }[] = [];
  for (let i = 1; i < FITTING_SAMPLES; i++) {
    const t = i / FITTING_SAMPLES;
    targets.push({ t, nx: t, ny: formula(xMin + t * xRange) / maxOutput });
  }

  // Solve 2×2 normal equations for least-squares bezier control point fitting.
  // The cubic bezier basis functions at parameter t are:
  //   a = 3(1-t)²t  (weight for cp1)
  //   b = 3(1-t)t²  (weight for cp2)
  // We minimize Σ(a·cp1 + b·cp2 - r)² where r = value - endpoint contributions.
  function solveLeastSquares(p0v: number, p3v: number, vals: { t: number; v: number }[]) {
    let aa = 0, ab = 0, bb = 0, ar = 0, br = 0;
    for (const { t, v } of vals) {
      const mt = 1 - t;
      const a = 3 * mt * mt * t, b = 3 * mt * t * t;
      const r = v - mt * mt * mt * p0v - t * t * t * p3v;
      aa += a * a; ab += a * b; bb += b * b; ar += a * r; br += b * r;
    }
    const det = aa * bb - ab * ab;
    if (Math.abs(det) < 1e-12) return { cp1: (p0v + p3v) / 3, cp2: (p0v + p3v) * 2 / 3 };
    return { cp1: (bb * ar - ab * br) / det, cp2: (aa * br - ab * ar) / det };
  }

  const xs = solveLeastSquares(p0.x, p3.x, targets.map(s => ({ t: s.t, v: s.nx })));
  const ys = solveLeastSquares(p0.y, p3.y, targets.map(s => ({ t: s.t, v: s.ny })));
  return { p0, cp1: { x: xs.cp1, y: ys.cp1 }, cp2: { x: xs.cp2, y: ys.cp2 }, p3 };
}

export function getDefaultSupportCurve(): BezierCurve {
  return fitBezierToFormula(
    (x) => defaultDowntime(x).postLaunchSupport,
    DOWNTIME_X_MIN, DOWNTIME_X_MAX,
    defaultDowntime(DOWNTIME_X_MAX).postLaunchSupport,
  );
}

export function getDefaultRecoveryCurve(): BezierCurve {
  return fitBezierToFormula(
    (x) => defaultDowntime(x).creativeRecovery,
    DOWNTIME_X_MIN, DOWNTIME_X_MAX,
    defaultDowntime(DOWNTIME_X_MAX).creativeRecovery,
  );
}

export function getDefaultSupportMax(): number {
  return Math.ceil(defaultDowntime(DOWNTIME_X_MAX).postLaunchSupport * 10) / 10;
}

export function getDefaultRecoveryMax(): number {
  return Math.ceil(defaultDowntime(DOWNTIME_X_MAX).creativeRecovery * 10) / 10;
}
