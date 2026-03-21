import type { DowntimeBreakdown, DowntimeConfig } from '../types';
import { createInterpolator } from './curveInterpolator';

/**
 * Default downtime formula:
 *   Post-launch support ≈ 0.15 × D^1.05
 *   Creative recovery ≈ 0.01 × D^1.85
 *   Total = support + recovery
 */
export function defaultDowntime(devDurationMonths: number): DowntimeBreakdown {
  const postLaunchSupport = 0.15 * Math.pow(devDurationMonths, 1.05);
  const creativeRecovery = 0.01 * Math.pow(devDurationMonths, 1.85);
  const total = postLaunchSupport + creativeRecovery;
  return { total, postLaunchSupport, creativeRecovery };
}

/**
 * Create a downtime function from two custom bezier curves
 * (one for support, one for recovery). Total = support + recovery.
 */
export function createCustomDowntime(
  config: DowntimeConfig,
): (devDurationMonths: number) => DowntimeBreakdown {
  const supportInterp = createInterpolator(config.supportCurve);
  const recoveryInterp = createInterpolator(config.recoveryCurve);
  const inputRange = config.maxInput - config.minInput;

  return (devDurationMonths: number): DowntimeBreakdown => {
    const normalizedInput = inputRange === 0
      ? 0
      : Math.max(0, Math.min(1, (devDurationMonths - config.minInput) / inputRange));

    const postLaunchSupport = supportInterp(normalizedInput) * config.supportMaxOutput;
    const creativeRecovery = recoveryInterp(normalizedInput) * config.recoveryMaxOutput;
    const total = postLaunchSupport + creativeRecovery;

    return { total, postLaunchSupport, creativeRecovery };
  };
}
