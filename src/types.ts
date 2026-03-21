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
  minIncome: number;
  timeHorizonMonths: number;
  minDevScope: number;
  targetDevScope: number;
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
