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
import { computeAccountingTimeSeries, computeAnnualizedNetProfit } from './engine/accountingTimeSeries';
import { DEFAULT_MONTHLY_FIXED_EXPENSES, DEFAULT_PROJECT_COST_BASE, DEFAULT_PROJECT_COST_PER_MONTH, DEFAULT_PLATFORM_CUT_RATE } from './engine/expenses';
import { getComparableGames, ensureFetchStarted, forceRefresh, isFetchDone } from './api/steamSearch';
import { getCacheTimestamp } from './api/steamCache';
import { ensureDetailFetchStarted, fetchDetailsForGames } from './api/steamDetailFetch';
import { createFetchProgress } from './components/fetchProgress';
import { createWelcomeBanner } from './components/welcomeBanner';
import type { DowntimeBreakdown, PricingInfo, SalesTimeSeries, AccountingTimeSeries } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="app-header">
    <h1>Solo Gamedev Planner</h1>
    <p>Plan your path to full-time game development</p>
    <button class="info-btn" id="infoBtn" aria-label="About this tool">&#x2139;<span class="info-btn-tooltip">About this tool</span></button>
  </header>
  <div id="welcome-root"></div>
  <section id="inputs"></section>
  <section id="timeline"></section>
  <div id="panel-root"></div>
  <div id="config-root"></div>
`;

const welcomeRoot = app.querySelector<HTMLElement>('#welcome-root')!;
const inputsContainer = app.querySelector<HTMLElement>('#inputs')!;
const timelineContainer = app.querySelector<HTMLElement>('#timeline')!;
const panelRoot = app.querySelector<HTMLElement>('#panel-root')!;
const configRoot = app.querySelector<HTMLElement>('#config-root')!;

// Config screen (lazy init)
let configScreen: ReturnType<typeof createConfigScreen> | null = null;
let configScreenLoading = false;

async function openConfig(): Promise<void> {
  if (configScreenLoading) return;
  if (!configScreen) {
    configScreenLoading = true;
    try {
      const timestamp = await getCacheTimestamp();
      configScreen = createConfigScreen(
        configRoot,
        state.downtimeConfig,
        {
          monthlyFixedExpenses: state.inputs.monthlyFixedExpenses,
          projectCostBase: state.inputs.projectCostBase,
          projectCostPerMonth: state.inputs.projectCostPerMonth,
          platformCutRate: state.inputs.platformCutRate,
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
                platformCutRate: DEFAULT_PLATFORM_CUT_RATE,
              },
            });
            configScreen?.destroy();
            configScreen = null;
            openConfig();
          },
          onRefreshSteam() {
            forceRefresh((progress) => {
              fetchProgressUI.updateSearch(progress);
              if (progress.status === 'Complete' || progress.status === 'Loaded from cache') {
                configScreen?.updateCacheTimestamp(Date.now());
                ensureDetailFetchStarted((detailProgress) => {
                  fetchProgressUI.updateDetail(detailProgress);
                });
              }
            }).catch(() => {});
          },
        },
        timestamp,
      );
    } finally {
      configScreenLoading = false;
    }
  }
  configScreen.show();
}

// Welcome banner
const welcomeBanner = createWelcomeBanner(welcomeRoot);
app.querySelector('#infoBtn')!.addEventListener('click', () => welcomeBanner.show());

// Bar nudge: pulse project bars after first slider interaction
const barNudgeKey = 'sgp-bars-nudged';
let pendingBarNudge = false;

// Input panel
createInputPanel(inputsContainer, state.inputs, {
  onChange(inputs) {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(barNudgeKey)) {
      pendingBarNudge = true;
      localStorage.setItem(barNudgeKey, '1');
    }
    updateState({ inputs: { ...inputs } });
  },
  onOpenConfig: openConfig,
});

// Side panel
const sidePanel = createSidePanel(panelRoot);

// Background fetch progress
const fetchProgressUI = createFetchProgress(app);

// Start Steam data fetch immediately on app load
ensureFetchStarted((progress) => {
  fetchProgressUI.updateSearch(progress);
  if (progress.status === 'Complete' || progress.status === 'Loaded from cache') {
    ensureDetailFetchStarted((detailProgress) => {
      fetchProgressUI.updateDetail(detailProgress);
    });
  }
});

// Pre-computed per-project data (rebuilt on regenerate)
let breakdowns = new Map<number, DowntimeBreakdown>();
let pricingMap = new Map<number, PricingInfo>();
let salesMap = new Map<number, SalesTimeSeries>();
let accounting: AccountingTimeSeries = { entries: [], revenueByProject: [] };

// Timeline
const timeline = createTimeline(timelineContainer, (project, color) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(barNudgeKey, '1');
  const breakdown = breakdowns.get(project.index);
  const pricing = pricingMap.get(project.index);
  const sales = salesMap.get(project.index);
  if (breakdown && pricing) {
    sidePanel.show(project, breakdown, pricing, {
      sales,
      steamProvider: () => getComparableGames(),
      isIndexingComplete: isFetchDone,
      platformCutRate: state.inputs.platformCutRate,
      detailFetcher: (appids) => fetchDetailsForGames(appids),
      accentColor: color,
    });
  }
});

// React to state changes
function regenerate(): void {
  const downtimeFn = state.useCustomDowntime
    ? createCustomDowntime(state.downtimeConfig)
    : defaultDowntime;

  const plan = generatePlan(state.inputs, (d) => downtimeFn(d));

  // Scale breakdown sub-items proportionally to match the rounded total downtime
  breakdowns = new Map(
    plan.projects.map((p) => {
      const raw = downtimeFn(p.rawDevDuration);
      const scale = raw.total > 0 ? p.downtimeMonths / raw.total : 0;
      return [p.index, {
        total: p.downtimeMonths,
        postLaunchSupport: raw.postLaunchSupport * scale,
        creativeRecovery: raw.creativeRecovery * scale,
      }];
    }),
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

  const annualizedNetProfit = accounting.entries.length > 0
    ? computeAnnualizedNetProfit(accounting, state.inputs.timeHorizonMonths, state.inputs.targetDevScope)
    : 0;

  timeline.update(plan, state.inputs, accounting, annualizedNetProfit);
  sidePanel.hide();

  if (pendingBarNudge) {
    pendingBarNudge = false;
    requestAnimationFrame(() => timeline.nudgeBars());
  }
}

subscribe(regenerate);

// Initial render
regenerate();

