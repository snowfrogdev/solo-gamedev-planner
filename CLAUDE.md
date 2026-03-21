# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Start Vite dev server
bun run build        # TypeScript type-check + Vite production build
bun test             # Run all tests (bun:test)
bun test src/engine/projectGenerator.test.ts  # Run a single test file
```

This project uses **Bun exclusively** — do not use npm/node/npx.

## Architecture

A solo gamedev planning tool: users configure project scope and time horizon via sliders, and a hill-climbing optimizer generates a timeline of progressively larger game projects with downtime between them.

### Layers

```
types.ts           Pure interfaces, no dependencies
engine/            Business logic (no DOM)
  projectGenerator.ts   Seeded PRNG (mulberry32) + hill-climbing optimizer
  downtimeCalculator.ts Default power-law formulas + custom bezier-based downtime
  curveInterpolator.ts  Cubic bezier evaluation via 200-sample lookup table
  downtimeDefaults.ts   Least-squares bezier fitting to default formulas
state.ts           Pub-sub store (subscribe/notify/updateState)
components/        Factory functions returning {update, show, hide, destroy} interfaces
  inputPanel.ts    Slider controls with cross-linked constraints
  timeline.ts      D3 bar chart visualization
  configScreen.ts  Modal with interactive dual-curve bezier editor
main.ts            Wires state → components, subscribe(regenerate) loop
```

Dependencies flow downward: `main → components → engine → types`. State imports only from `engine` and `types`.

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
