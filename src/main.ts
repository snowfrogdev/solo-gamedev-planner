import './style.css';
import { state, subscribe, updateState } from './state';
import { createInputPanel } from './components/inputPanel';
import { createTimeline } from './components/timeline';
import { createSidePanel } from './components/sidePanel';
import { createConfigScreen } from './components/configScreen';
import { getDefaultSupportCurve, getDefaultRecoveryCurve, getDefaultSupportMax, getDefaultRecoveryMax, DOWNTIME_X_MIN, DOWNTIME_X_MAX } from './engine/downtimeDefaults';
import { generatePlan } from './engine/projectGenerator';
import { defaultDowntime, createCustomDowntime } from './engine/downtimeCalculator';
import { computeLaunchPrice } from './engine/pricingModel';
import { computeSalesTimeSeries } from './engine/salesModel';
import { optimizeM1Values } from './engine/m1Optimizer';
import { computeAccountingTimeSeries } from './engine/accountingTimeSeries';
import { DEFAULT_MONTHLY_FIXED_EXPENSES, DEFAULT_PROJECT_COST_BASE, DEFAULT_PROJECT_COST_PER_MONTH } from './engine/expenses';
import type { DowntimeBreakdown, PricingInfo, SalesTimeSeries, AccountingTimeSeries } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="app-header">
    <h1>Solo Gamedev Planner</h1>
    <p>Plan your path to full-time game development</p>
  </header>
  <section id="inputs"></section>
  <section id="timeline"></section>
  <div id="panel-root"></div>
  <div id="config-root"></div>
`;

const inputsContainer = app.querySelector<HTMLElement>('#inputs')!;
const timelineContainer = app.querySelector<HTMLElement>('#timeline')!;
const panelRoot = app.querySelector<HTMLElement>('#panel-root')!;
const configRoot = app.querySelector<HTMLElement>('#config-root')!;

// Config screen (lazy init)
let configScreen: ReturnType<typeof createConfigScreen> | null = null;

function openConfig(): void {
  if (!configScreen) {
    configScreen = createConfigScreen(
      configRoot,
      state.downtimeConfig,
      {
        monthlyFixedExpenses: state.inputs.monthlyFixedExpenses,
        projectCostBase: state.inputs.projectCostBase,
        projectCostPerMonth: state.inputs.projectCostPerMonth,
      },
      {
        onChange(config) {
          updateState({ downtimeConfig: config, useCustomDowntime: true });
        },
        onExpenseChange(expenses) {
          updateState({ inputs: { ...state.inputs, ...expenses } });
        },
        onClose() {
          configScreen?.hide();
        },
        onReset() {
          updateState({
            downtimeConfig: {
              supportCurve: getDefaultSupportCurve(),
              recoveryCurve: getDefaultRecoveryCurve(),
              minInput: DOWNTIME_X_MIN,
              maxInput: DOWNTIME_X_MAX,
              supportMaxOutput: getDefaultSupportMax(),
              recoveryMaxOutput: getDefaultRecoveryMax(),
            },
            useCustomDowntime: false,
            inputs: {
              ...state.inputs,
              monthlyFixedExpenses: DEFAULT_MONTHLY_FIXED_EXPENSES,
              projectCostBase: DEFAULT_PROJECT_COST_BASE,
              projectCostPerMonth: DEFAULT_PROJECT_COST_PER_MONTH,
            },
          });
          configScreen?.destroy();
          configScreen = null;
          openConfig();
        },
      },
    );
  }
  configScreen.show();
}

// Input panel
createInputPanel(inputsContainer, state.inputs, {
  onChange(inputs) {
    updateState({ inputs: { ...inputs } });
  },
  onOpenConfig: openConfig,
});

// Side panel
const sidePanel = createSidePanel(panelRoot);

// Pre-computed per-project data (rebuilt on regenerate)
let breakdowns = new Map<number, DowntimeBreakdown>();
let pricingMap = new Map<number, PricingInfo>();
let salesMap = new Map<number, SalesTimeSeries>();
let accounting: AccountingTimeSeries = { entries: [], revenueByProject: [] };

// Timeline
const timeline = createTimeline(timelineContainer, (project) => {
  const breakdown = breakdowns.get(project.index);
  const pricing = pricingMap.get(project.index);
  const sales = salesMap.get(project.index);
  if (breakdown && pricing) sidePanel.show(project, breakdown, pricing, sales);
});

// React to state changes
function regenerate(): void {
  const downtimeFn = state.useCustomDowntime
    ? createCustomDowntime(state.downtimeConfig)
    : defaultDowntime;

  const plan = generatePlan(state.inputs, (d) => downtimeFn(d));

  breakdowns = new Map(
    plan.projects.map((p) => [p.index, downtimeFn(p.devDurationMonths)]),
  );
  pricingMap = new Map(
    plan.projects.map((p) => [p.index, computeLaunchPrice(p.devDurationMonths)]),
  );

  const m1Values = optimizeM1Values(plan.projects, pricingMap, state.inputs);
  salesMap = new Map(
    plan.projects.map((p, i) => {
      const pricing = pricingMap.get(p.index)!;
      return [
        p.index,
        computeSalesTimeSeries(p.endMonth, state.inputs.timeHorizonMonths, m1Values[i], pricing.launchPrice, {
          devDurationMonths: p.devDurationMonths,
          projectCostBase: state.inputs.projectCostBase,
          projectCostPerMonth: state.inputs.projectCostPerMonth,
        }),
      ];
    }),
  );

  accounting = computeAccountingTimeSeries(plan.projects, salesMap, plan.totalMonths, state.inputs);

  timeline.update(plan, state.inputs, accounting);
  sidePanel.hide();
}

subscribe(regenerate);

// Initial render
regenerate();
