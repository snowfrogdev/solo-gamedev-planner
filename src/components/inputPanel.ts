import type { PlannerInputs } from '../types';

export interface InputPanelCallbacks {
  onChange: (inputs: PlannerInputs) => void;
  onOpenConfig: () => void;
}

export function createInputPanel(
  container: HTMLElement,
  initialValues: PlannerInputs,
  callbacks: InputPanelCallbacks,
): { update(values: PlannerInputs): void } {
  const current = { ...initialValues };

  container.innerHTML = `
    <div class="input-panel">
      <h2>Plan Configuration</h2>
      <div class="slider-columns">
        <div class="slider-column-left">
          <div class="slider-group">
            <div class="slider-header">
              <label for="minDevScope">Minimum Dev Scope</label>
              <span class="slider-value" id="minDevScopeValue">${current.minDevScope} months</span>
            </div>
            <input type="range" id="minDevScope" min="1" max="24" step="1" value="${current.minDevScope}">
          </div>
          <div class="slider-group">
            <div class="slider-header">
              <label for="targetDevScope">Target Dev Scope</label>
              <span class="slider-value" id="targetDevScopeValue">${current.targetDevScope} months</span>
            </div>
            <input type="range" id="targetDevScope" min="1" max="36" step="1" value="${current.targetDevScope}">
          </div>
        </div>
        <div class="slider-column-right">
          <div class="slider-group">
            <div class="slider-header">
              <label for="timeHorizon">Time Horizon</label>
              <span class="slider-value" id="timeHorizonValue">${current.timeHorizonMonths} months</span>
            </div>
            <input type="range" id="timeHorizon" min="6" max="120" step="1" value="${current.timeHorizonMonths}">
          </div>
          <div class="slider-group">
            <div class="slider-header">
              <label for="targetIncome">Target Pre-Tax Income</label>
              <span class="slider-value" id="targetIncomeValue">$${current.targetIncome.toLocaleString()} /year</span>
            </div>
            <input type="range" id="targetIncome" min="1000" max="500000" step="1000" value="${current.targetIncome}">
          </div>
        </div>
      </div>
      <button class="config-btn" id="openConfigBtn">Advanced Settings</button>
    </div>
  `;

  const timeHorizonInput = container.querySelector<HTMLInputElement>('#timeHorizon')!;
  const minDevInput = container.querySelector<HTMLInputElement>('#minDevScope')!;
  const targetDevInput = container.querySelector<HTMLInputElement>('#targetDevScope')!;
  const targetIncomeInput = container.querySelector<HTMLInputElement>('#targetIncome')!;
  const configBtn = container.querySelector<HTMLButtonElement>('#openConfigBtn')!;

  const timeHorizonValueEl = container.querySelector<HTMLElement>('#timeHorizonValue')!;
  const minDevValueEl = container.querySelector<HTMLElement>('#minDevScopeValue')!;
  const targetDevValueEl = container.querySelector<HTMLElement>('#targetDevScopeValue')!;
  const targetIncomeValueEl = container.querySelector<HTMLElement>('#targetIncomeValue')!;

  function syncConstraints(): void {
    // Time horizon can't be less than target dev scope
    timeHorizonInput.min = targetDevInput.value;
    // Target dev scope can't exceed time horizon
    targetDevInput.max = timeHorizonInput.value;
    // Min dev scope can't exceed target dev scope
    minDevInput.max = targetDevInput.value;
    // Target dev scope can't be less than min dev scope
    targetDevInput.min = minDevInput.value;
  }

  function emitChange(): void {
    let timeHorizon = parseFloat(timeHorizonInput.value);
    const minDev = parseFloat(minDevInput.value);
    let targetDev = parseFloat(targetDevInput.value);
    const income = parseFloat(targetIncomeInput.value);

    if (isNaN(timeHorizon) || isNaN(minDev) || isNaN(targetDev) || isNaN(income)) return;
    if (timeHorizon <= 0 || minDev <= 0 || targetDev <= 0 || income <= 0) return;

    // Enforce: target >= min
    if (targetDev < minDev) {
      targetDev = minDev;
      targetDevInput.value = String(targetDev);
    }

    // Enforce: horizon >= target
    if (timeHorizon < targetDev) {
      timeHorizon = targetDev;
      timeHorizonInput.value = String(timeHorizon);
    }

    syncConstraints();

    current.timeHorizonMonths = timeHorizon;
    current.minDevScope = minDev;
    current.targetDevScope = targetDev;
    current.targetIncome = income;

    timeHorizonValueEl.textContent = `${timeHorizon} months`;
    minDevValueEl.textContent = `${minDev} months`;
    targetDevValueEl.textContent = `${targetDev} months`;
    targetIncomeValueEl.textContent = `$${income.toLocaleString()} /year`;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => callbacks.onChange(current), 150);
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  syncConstraints();
  timeHorizonInput.addEventListener('input', emitChange);
  minDevInput.addEventListener('input', emitChange);
  targetDevInput.addEventListener('input', emitChange);
  targetIncomeInput.addEventListener('input', emitChange);
  configBtn.addEventListener('click', callbacks.onOpenConfig);

  return {
    update(values: PlannerInputs): void {
      timeHorizonInput.value = String(values.timeHorizonMonths);
      minDevInput.value = String(values.minDevScope);
      targetDevInput.value = String(values.targetDevScope);
      targetIncomeInput.value = String(values.targetIncome);
      timeHorizonValueEl.textContent = `${values.timeHorizonMonths} months`;
      minDevValueEl.textContent = `${values.minDevScope} months`;
      targetDevValueEl.textContent = `${values.targetDevScope} months`;
      targetIncomeValueEl.textContent = `$${values.targetIncome.toLocaleString()} /year`;
      syncConstraints();
    },
  };
}
