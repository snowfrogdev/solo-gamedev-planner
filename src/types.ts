/** A 2D point (normalized 0–1 on both axes) */
export interface Point {
  x: number;
  y: number;
}

/** A cubic bezier curve defined by two endpoints and two control handles (all normalized 0–1) */
export interface BezierCurve {
  p0: Point;   // start endpoint (x pinned at 0)
  cp1: Point;  // control handle for start
  cp2: Point;  // control handle for end
  p3: Point;   // end endpoint (x pinned at 1)
}

/** User-entered configuration */
export interface PlannerInputs {
  targetIncome: number;
  timeHorizonMonths: number;
  minDevScope: number;
  targetDevScope: number;
  monthlyFixedExpenses: number;
  projectCostBase: number;
  projectCostPerMonth: number;
}

/** A single generated project in the timeline */
export interface PlannedProject {
  index: number;
  startMonth: number;
  devDurationMonths: number;
  endMonth: number;
  downtimeMonths: number;
  cycleEndMonth: number;
}

/** Full generated plan */
export interface GeneratedPlan {
  projects: PlannedProject[];
  totalMonths: number;
}

/** Configuration for the editable downtime curves */
export interface DowntimeConfig {
  supportCurve: BezierCurve;
  recoveryCurve: BezierCurve;
  minInput: number;
  maxInput: number;
  supportMaxOutput: number;
  recoveryMaxOutput: number;
}

/** Downtime breakdown for a single project */
export interface DowntimeBreakdown {
  total: number;
  postLaunchSupport: number;
  creativeRecovery: number;
}

/** Pricing info for a single project */
export interface PricingInfo {
  launchPrice: number;
  rawPrice: number;
}

/** Monthly unit sales time series for a single project */
export interface SalesTimeSeries {
  m1Units: number;
  tailStrength: number;
  monthlySales: number[];      // index 0 = month 1 (launch month)
  monthlyPrices: number[];     // AEP per month (same indexing)
  monthlyRevenue: number[];    // price × units per month
  cumulativeTotal: number;
  cumulativeYear1: number;
  cumulativeYear2: number;
  cumulativeYear5: number;
  monthlyExpenses: number[];     // variable project costs distributed across dev months
  totalExpenses: number;         // sum of monthlyExpenses
}

/** A single month's accounting entry (horizon-wide aggregation) */
export interface MonthlyAccountingEntry {
  revenue: number;
  expenses: number;
  netIncome: number;
}

/** Monthly accounting time series spanning the planning horizon */
export interface AccountingTimeSeries {
  entries: MonthlyAccountingEntry[];
  revenueByProject: number[][];  // [projectIndex][calendarMonth]
}

/** A Steam game with estimated sales data, used for market comparison */
export interface SteamGame {
  appid: number;
  name: string;
  totalReviews: number;
  reviewPositivePct: number;
  priceInCents: number;         // original (non-discounted) price
  releaseDate: Date;
  monthsSinceRelease: number;
  estimatedSales: number;       // derived from totalReviews × review-to-sales multiplier
  storeUrl: string;
}
