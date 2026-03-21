import './style.css';
import { state, subscribe, updateState } from './state';
import { createInputPanel } from './components/inputPanel';
import { createTimeline } from './components/timeline';
import { createSidePanel } from './components/sidePanel';
import { createConfigScreen } from './components/configScreen';
import { getDefaultSupportCurve, getDefaultRecoveryCurve, getDefaultSupportMax, getDefaultRecoveryMax, DOWNTIME_X_MIN, DOWNTIME_X_MAX } from './engine/downtimeDefaults';
import { generatePlan } from './engine/projectGenerator';
import { defaultDowntime, createCustomDowntime } from './engine/downtimeCalculator';
import type { DowntimeBreakdown } from './types';

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
        onChange(config) {
          updateState({ downtimeConfig: config, useCustomDowntime: true });
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

// Pre-computed downtime breakdowns per project (rebuilt on regenerate)
let breakdowns = new Map<number, DowntimeBreakdown>();

// Timeline
const timeline = createTimeline(timelineContainer, (project) => {
  const breakdown = breakdowns.get(project.index);
  if (breakdown) sidePanel.show(project, breakdown);
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

  timeline.update(plan, state.inputs);
  sidePanel.hide();
}

subscribe(regenerate);

// Initial render
regenerate();
