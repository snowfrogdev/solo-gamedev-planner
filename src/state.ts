import type { PlannerInputs, DowntimeConfig } from './types';
import {
  getDefaultSupportCurve,
  getDefaultRecoveryCurve,
  getDefaultSupportMax,
  getDefaultRecoveryMax,
  DOWNTIME_X_MIN,
  DOWNTIME_X_MAX,
} from './engine/downtimeDefaults';

export interface AppState {
  inputs: PlannerInputs;
  downtimeConfig: DowntimeConfig;
  useCustomDowntime: boolean;
}

type Listener = () => void;

const listeners: Listener[] = [];

export const state: AppState = {
  inputs: {
    targetIncome: 50000,
    timeHorizonMonths: 60,
    minDevScope: 3,
    targetDevScope: 12,
  },
  downtimeConfig: {
    supportCurve: getDefaultSupportCurve(),
    recoveryCurve: getDefaultRecoveryCurve(),
    minInput: DOWNTIME_X_MIN,
    maxInput: DOWNTIME_X_MAX,
    supportMaxOutput: getDefaultSupportMax(),
    recoveryMaxOutput: getDefaultRecoveryMax(),
  },
  useCustomDowntime: false,
};

export function subscribe(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function notify(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

export function updateState(partial: Partial<AppState>): void {
  Object.assign(state, partial);
  notify();
}
