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
  platformCutRate: number;
}

/** A single generated project in the timeline */
export interface PlannedProject {
  index: number;
  startMonth: number;
  devDurationMonths: number;
  rawDevDuration: number;
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
  monthlyDevCosts: number[];     // variable project costs distributed across dev months
  totalDevCost: number;          // sum of monthlyDevCosts
}

/** A single month's accounting entry (horizon-wide aggregation) */
export interface MonthlyAccountingEntry {
  revenue: number;
  cogs: number;              // platformFees + projectDevCosts
  grossProfit: number;       // revenue - cogs
  fixedExpenses: number;     // monthly overhead
  netProfit: number;         // grossProfit - fixedExpenses
  platformFees: number;      // revenue * platformCutRate
  projectDevCosts: number;   // variable project costs for this month
}

/** Monthly accounting time series spanning the planning horizon */
export interface AccountingTimeSeries {
  entries: MonthlyAccountingEntry[];
  revenueByProject: number[][];  // [projectIndex][calendarMonth]
}

/** Detailed data fetched from Steam's appdetails API (second-phase enrichment) */
export interface SteamGameDetails {
  genres: string[];        // e.g. ["Action", "Indie"]
  isEarlyAccess: boolean;
  chineseReviewPct?: number; // 0–1 fraction of reviews in Simplified Chinese
  fetchedAt: number;       // Date.now() when fetched
}

/** A Steam game with review and pricing data, used for market comparison */
export interface SteamGame {
  appid: number;
  name: string;
  totalReviews: number;
  reviewPositivePct: number;
  priceInCents: number;         // original (non-discounted) price
  releaseDate: Date;
  monthsSinceRelease: number;
  storeUrl: string;
  details?: SteamGameDetails;   // populated by background detail fetch
}

/** Progress report from the Steam search fetch (phase 1) */
export interface FetchProgress {
  page: number;
  gamesFound: number;
  status: string;
  oldestReleaseDate?: Date;   // oldest game on this page (for progress calculation)
}

/** Progress report from the Steam detail fetch (phase 2) */
export interface DetailFetchProgress {
  processed: number;
  total: number;
  currentGame: string;
  status: string;
}
