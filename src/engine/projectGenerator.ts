import type { PlannerInputs, PlannedProject, GeneratedPlan, DowntimeBreakdown } from '../types';
import { defaultDowntime } from './downtimeCalculator';
import { mulberry32 } from './prng';
import { smoothness } from './optimizerUtils';

export type DowntimeFunction = (devDurationMonths: number) => DowntimeBreakdown;

function hashInputs(inputs: PlannerInputs): number {
  let hash = 7;
  hash = (hash * 31 + Math.round(inputs.minDevScope * 100)) | 0;
  hash = (hash * 31 + Math.round(inputs.targetDevScope * 100)) | 0;
  hash = (hash * 31 + Math.round(inputs.timeHorizonMonths * 100)) | 0;
  hash = (hash * 31 + Math.round(inputs.targetIncome)) | 0;
  return hash;
}

// --- Helpers ---

function linearDurations(min: number, target: number, n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [target];
  const step = (target - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => min + i * step);
}

function buildSequence(
  durations: number[],
  getDowntime: DowntimeFunction,
): PlannedProject[] {
  const projects: PlannedProject[] = [];
  let currentMonth = 0;
  for (let i = 0; i < durations.length; i++) {
    const dev = durations[i];
    // Round to whole months so project bars align with the monthly revenue chart
    const end = Math.round(currentMonth + dev);
    const roundedDev = end - currentMonth;
    const down = getDowntime(dev);
    const cycleEnd = Math.round(end + down.total);
    const roundedDown = cycleEnd - end;
    projects.push({
      index: i,
      startMonth: currentMonth,
      devDurationMonths: roundedDev,
      rawDevDuration: dev,
      endMonth: end,
      downtimeMonths: roundedDown,
      cycleEndMonth: cycleEnd,
    });
    currentMonth = cycleEnd;
  }
  return projects;
}

function totalTimeForDurations(
  durations: number[],
  getDowntime: DowntimeFunction,
): number {
  let total = 0;
  for (const dur of durations) {
    const end = Math.round(total + dur);
    const cycleEnd = Math.round(end + getDowntime(dur).total);
    total = cycleEnd;
  }
  return total;
}

// --- Fitness Function (3 factors) ---

function fitness(
  durations: number[],
  inputs: PlannerInputs,
  getDowntime: DowntimeFunction,
): number {
  if (durations.length === 0) return 0;

  const { targetDevScope, timeHorizonMonths } = inputs;
  const projects = buildSequence(durations, getDowntime);
  const lastProject = projects[projects.length - 1];

  // Horizon coverage: plan must end at or past the horizon, with minimal overshoot
  let horizonCoverage: number;
  if (lastProject.cycleEndMonth < timeHorizonMonths) {
    horizonCoverage = 0; // Plan doesn't cover the horizon — invalid
  } else {
    horizonCoverage = Math.max(0, 1 - (lastProject.cycleEndMonth - timeHorizonMonths) / timeHorizonMonths);
  }

  // Smoothness: how close are project durations to a linear ramp
  const smooth = smoothness(durations);

  // Target reachability: a target-scope project starts before the horizon
  let targetReachability = 0;
  for (const p of projects) {
    if (p.devDurationMonths === targetDevScope && p.startMonth < timeHorizonMonths) {
      targetReachability = 1;
      break;
    }
  }

  // Horizon coverage weighted 2x because it's the hard constraint
  return (2 * horizonCoverage + smooth + targetReachability) / 4;
}

// --- Constraints ---

function enforceConstraints(durations: number[], min: number, target: number): void {
  if (durations.length === 0) return;

  // Single project: just pin to target
  if (durations.length === 1) {
    durations[0] = target;
    return;
  }

  // Pin first and last
  durations[0] = min;
  durations[durations.length - 1] = target;

  // Clamp all to bounds
  for (let i = 1; i < durations.length - 1; i++) {
    durations[i] = Math.max(min, Math.min(target, durations[i]));
  }

  // Enforce non-decreasing
  for (let i = 1; i < durations.length; i++) {
    if (durations[i] < durations[i - 1]) {
      durations[i] = durations[i - 1];
    }
  }

  // Enforce 2x rule: prevents unrealistic jumps in project scope (e.g., 3mo -> 12mo)
  for (let i = 1; i < durations.length; i++) {
    if (durations[i] > durations[i - 1] * 2) {
      durations[i] = durations[i - 1] * 2;
    }
  }

  // Intentional: target always wins over the 2x rule for the final pair.
  // The 2x rule may clamp intermediate projects down, but the last project
  // is re-pinned to target to guarantee the plan reaches target scope.
  durations[durations.length - 1] = target;
}

// --- Mutations ---

function mutate(
  durations: number[],
  min: number,
  target: number,
  rand: () => number,
): number[] {
  const d = [...durations];
  const r = rand();

  // Mutation probabilities: 50% nudge (fine-tune), 30% add (explore more projects),
  // 20% remove (explore fewer projects). Biased toward nudging for gradual refinement.
  if (r < 0.5) {
    // Nudge a random interior duration
    if (d.length > 2) {
      const idx = 1 + Math.floor(rand() * (d.length - 2));
      d[idx] += (rand() - 0.5) * Math.max(0.5, (target - min) * 0.15);
    }
  } else if (r < 0.8) {
    // Add a project at a random position
    if (d.length < 100) {
      const idx = 1 + Math.floor(rand() * (d.length - 1));
      const leftVal = d[idx - 1];
      const rightVal = d[idx];
      d.splice(idx, 0, (leftVal + rightVal) / 2);
    }
  } else {
    // Remove a random project (can go down to 1)
    if (d.length > 1) {
      if (d.length === 2) {
        // Remove the first (min) project, leaving just target
        d.splice(0, 1);
      } else {
        const idx = 1 + Math.floor(rand() * (d.length - 2));
        d.splice(idx, 1);
      }
    }
  }

  enforceConstraints(d, min, target);
  return d;
}

// --- Seed Generation ---

function generateSeed(inputs: PlannerInputs, getDowntime: DowntimeFunction): number[] {
  const { minDevScope, targetDevScope, timeHorizonMonths } = inputs;

  // Strategy: try increasing numbers of evenly-spaced projects (linear ramp
  // from min to target) and pick the count N whose total time best matches
  // the horizon. Then pad with extra projects if needed to ensure coverage.
  let bestN = 1;
  let bestDiff = Infinity;
  for (let n = 1; n <= 200; n++) {
    const durations = linearDurations(minDevScope, targetDevScope, n);
    const total = totalTimeForDurations(durations, getDowntime);
    const diff = Math.abs(total - timeHorizonMonths);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestN = n;
    }
    if (total > timeHorizonMonths && diff > bestDiff) break;
  }

  // Ensure seed covers the horizon
  let durations = linearDurations(minDevScope, targetDevScope, bestN);
  let total = totalTimeForDurations(durations, getDowntime);
  while (total < timeHorizonMonths && durations.length < 200) {
    // Add one more project (increases N, makes steps smaller)
    bestN++;
    durations = linearDurations(minDevScope, targetDevScope, bestN);
    total = totalTimeForDurations(durations, getDowntime);
  }

  return durations;
}

// --- Main ---

const MAX_ITERATIONS = 3000;

export function generatePlan(
  inputs: PlannerInputs,
  getDowntime: DowntimeFunction = defaultDowntime,
): GeneratedPlan {
  const { minDevScope, targetDevScope } = inputs;

  // Edge case: min equals target
  if (minDevScope >= targetDevScope) {
    const cycleDuration = minDevScope + getDowntime(minDevScope).total;
    const n = Math.max(1, Math.round(inputs.timeHorizonMonths / cycleDuration));
    const durations = Array.from({ length: n }, () => minDevScope);
    const projects = buildSequence(durations, getDowntime);
    const last = projects[projects.length - 1];
    return {
      projects,
      totalMonths: last ? last.cycleEndMonth : 0,
    };
  }

  // Seeded PRNG
  const rand = mulberry32(hashInputs(inputs));

  // Generate seed
  let bestDurations = generateSeed(inputs, getDowntime);
  enforceConstraints(bestDurations, minDevScope, targetDevScope);
  let bestScore = fitness(bestDurations, inputs, getDowntime);

  // Hill-climbing
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const candidate = mutate(bestDurations, minDevScope, targetDevScope, rand);
    const score = fitness(candidate, inputs, getDowntime);
    if (score > bestScore) {
      bestDurations = candidate;
      bestScore = score;
    }
  }

  const projects = buildSequence(bestDurations, getDowntime);
  const last = projects[projects.length - 1];

  return {
    projects,
    totalMonths: last ? last.cycleEndMonth : 0,
  };
}
