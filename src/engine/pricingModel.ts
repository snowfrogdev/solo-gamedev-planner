import type { PricingInfo } from '../types';

const PRICE_TIERS = [4.99, 7.99, 9.99, 14.99, 19.99, 24.99, 29.99];

function snapToTier(price: number): number {
  let best = PRICE_TIERS[0];
  let bestDist = Math.abs(price - best);
  for (let i = 1; i < PRICE_TIERS.length; i++) {
    const dist = Math.abs(price - PRICE_TIERS[i]);
    if (dist < bestDist) {
      best = PRICE_TIERS[i];
      bestDist = dist;
    }
  }
  return best;
}

/** D(m) = 0.15 + 0.50 × e^(−0.055m) + 0.30 × e^(−0.015m) */
function priceDecayFactor(monthsAfterLaunch: number): number {
  const m = Math.max(0, monthsAfterLaunch);
  return (
    0.15 +
    0.50 * Math.exp(-0.055 * m) +
    0.30 * Math.exp(-0.015 * m)
  );
}

/** AEP(m) = P₀ × 0.80 × D(m), where 0.80 = regional pricing factor (global avg ~20% below US price) */
export function averageEffectivePrice(
  launchPrice: number,
  monthsAfterLaunch: number,
): number {
  return launchPrice * 0.80 * priceDecayFactor(monthsAfterLaunch);
}

/** Price = $5.00 × ln(months) − $1.00, snapped to nearest Steam tier */
export function computeLaunchPrice(devDurationMonths: number): PricingInfo {
  if (devDurationMonths <= 0) {
    return {
      launchPrice: PRICE_TIERS[0],
      rawPrice: 0,
    };
  }
  const rawPrice = 5.00 * Math.log(devDurationMonths) - 1.00;

  let launchPrice: number;
  if (rawPrice <= PRICE_TIERS[0]) {
    launchPrice = PRICE_TIERS[0];
  } else if (rawPrice >= PRICE_TIERS[PRICE_TIERS.length - 1]) {
    launchPrice = PRICE_TIERS[PRICE_TIERS.length - 1];
  } else {
    launchPrice = snapToTier(rawPrice);
  }

  return {
    launchPrice,
    rawPrice,
  };
}
