# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Start Vite dev server
bun run build        # TypeScript type-check + Vite production build
bun test             # Run all tests (bun:test)
bun test src/engine/projectGenerator.test.ts  # Run a single test file
```

This project uses **Bun exclusively** — do not use npm/node/npx. Tests use `bun:test` with `happy-dom` for DOM APIs. TypeScript is strict (`noUnusedLocals`, `noUnusedParameters`).

## Architecture

A solo gamedev planning tool: users configure project scope and time horizon via sliders, and a hill-climbing optimizer generates a timeline of progressively larger game projects with downtime between them.

### Layers

```text
types.ts           Pure interfaces, no dependencies
engine/            Business logic (no DOM)
  prng.ts              mulberry32 seeded PRNG
  optimizerUtils.ts    Shared optimizer helpers (smoothness scoring)
  projectGenerator.ts  Hill-climbing optimizer for project timeline
  downtimeCalculator.ts Default power-law formulas + custom bezier-based downtime
  curveInterpolator.ts  Cubic bezier evaluation via 200-sample lookup table
  downtimeDefaults.ts   Least-squares bezier fitting to default formulas
  pricingModel.ts      Launch price from dev scope, AEP decay over time
  salesModel.ts        Monthly unit-sales time series with power-law decay
  m1Optimizer.ts       Hill-climbing optimizer for month-1 sales targets
  expenses.ts          Fixed/variable cost defaults, dev cost weight distribution
  accountingTimeSeries.ts  Horizon-wide monthly P&L aggregation
  steamComparison.ts   Steam market comparison: review-to-sales estimation
api/               External data fetching (browser APIs: fetch, IndexedDB)
  proxyFetch.ts        CORS proxy with failover across multiple services
  rateLimiter.ts       Rate-limited fetch with exponential backoff for 429s
  steamCache.ts        IndexedDB persistence for Steam game data
  steamSearch.ts       Background paginated fetcher for Steam indie games
  steamDetailFetch.ts  Second-phase genre/early-access enrichment
state.ts           Pub-sub store (subscribe/notify/updateState)
utils/             Shared non-domain helpers
  format.ts          Number/date formatting
  focusTrap.ts       Keyboard focus trapping for modals
components/        Factory functions returning {update, show, hide, destroy} interfaces
  inputPanel.ts    Slider controls with cross-linked constraints
  timeline.ts      D3 bar chart visualization
  configScreen.ts  Modal with interactive dual-curve bezier editor
  sidePanel.ts     Project detail overlay with Steam market comparison
  welcomeBanner.ts Dismissible intro/help banner
  fetchProgress.ts Steam data fetch progress indicator
main.ts            Wires state → components, subscribe(regenerate) loop
```

Dependencies flow downward: `main → components → engine → types`, `main → api → engine → types`. State imports only from `engine` and `types`. Components do not import from `api/` — data-fetching is injected via callbacks from `main.ts`.

### Financial modeling pipeline

The plan generation flows through a multi-stage pipeline orchestrated in `main.ts`:

1. **Project timeline** (`projectGenerator`): hill-climbing optimizer fills the time horizon with projects of increasing dev scope
2. **Pricing** (`pricingModel`): each project gets a launch price snapped to Steam price tiers ($4.99–$29.99), plus an AEP (average effective price) decay curve accounting for discounts and regional pricing
3. **M₁ optimization** (`m1Optimizer`): a second hill-climbing pass finds month-1 unit sales for each project so the portfolio's annualized net profit hits the target income
4. **Sales series** (`salesModel`): month-1 units × power-law decay → full monthly revenue series per project
5. **Accounting** (`accountingTimeSeries`): aggregates all projects into a horizon-wide monthly P&L (revenue, COGS, gross profit, fixed expenses, net profit)

### Key patterns

- **Factory components**: `createX(container, config, callbacks) → {update(), destroy()}` — no classes or framework
- **Pub-sub reactivity**: `updateState({...})` auto-notifies all subscribers; `subscribe()` returns an unsubscribe function
- **Deterministic optimizer**: `hashInputs()` seeds mulberry32 PRNG so identical inputs always produce the same plan
- **Fitness function** weights: horizon coverage (2x), smoothness (1x), target reachability (1x)
- **Constraint enforcement**: durations are non-decreasing, max 2x jump between consecutive projects, first pinned to min scope, last pinned to target scope (target always wins over 2x rule)

### Domain concepts

- **Dev scope**: Duration of a game project in months (min → target, ramping up)
- **Downtime**: Post-launch support (`0.15 × D^1.05`) + creative recovery (`0.01 × D^1.85`), or user-defined bezier curves
- **Time horizon**: Total planning window; optimizer tries to fill it with projects
