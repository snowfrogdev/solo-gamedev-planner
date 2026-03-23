---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
  - "**/*.css"
  - "**/*.scss"
  - "**/*.html"
  - "**/components/**"
  - "**/pages/**"
  - "**/views/**"
---

# UI/UX Evaluation Reference

When reviewing frontend code or interface designs, consider these principles.

## Nielsen's 10 Usability Heuristics

1. **Visibility of system status** — Provide feedback within 400ms. Show loading states, progress indicators, and confirmation of actions.
2. **Match between system and real world** — Use the user's language, not system jargon. Follow real-world conventions for ordering and grouping.
3. **User control and freedom** — Provide undo, redo, cancel, and escape hatches. Users make mistakes and need clear exits.
4. **Consistency and standards** — Follow platform conventions. Similar elements should look and behave the same way throughout.
5. **Error prevention** — Eliminate error-prone conditions. Use constraints, defaults, confirmations, and smart formatting.
6. **Recognition over recall** — Make options, actions, and information visible. Minimize what users must remember between screens.
7. **Flexibility and efficiency of use** — Provide shortcuts and accelerators for expert users without cluttering the novice experience.
8. **Aesthetic and minimalist design** — Every element should serve a purpose. Remove or de-emphasize irrelevant information.
9. **Help users recover from errors** — Use plain language error messages. Describe the problem and suggest a concrete solution.
10. **Help and documentation** — If needed, make it searchable, task-focused, and concise. Best interfaces need no documentation.

## Laws of UX

### Interaction

- **Fitts's Law** — Time to reach a target is a function of distance and size. Audit for click/touch targets under 48dp, primary actions placed in hard-to-reach zones, and insufficient spacing between interactive elements.
- **Hick's Law** — Decision time increases logarithmically with the number of choices. Audit screens with more than 5-7 primary options. Look for missing progressive disclosure and overwhelming menus.
- **Doherty Threshold** — System responses must be under 400ms for productive interaction. Audit for missing loading states, skeleton screens, or spinners during async operations.

### Cognition

- **Miller's Law** — Working memory holds roughly 7 plus or minus 2 items. Audit for unchunked information, long unstructured lists, and data-heavy displays without grouping.
- **Jakob's Law** — Users transfer expectations from other products. Audit for deviations from category conventions (navigation placement, interaction patterns, terminology) without clear justification.
- **Goal-Gradient Effect** — Motivation increases as users approach completion. Audit multi-step flows for missing progress indicators, step counts, or completion feedback.
- **Paradox of the Active User** — Users never read instructions; they dive in and try things. Audit whether core tasks are completable without documentation or tutorials.

### Perception (Gestalt Principles)

- **Law of Proximity** — Spatial closeness implies functional relatedness. Audit for labels separated from their fields, related actions with inconsistent spacing, and unrelated items grouped too closely.
- **Law of Similarity** — Visually identical elements are perceived as sharing function. Audit for interactive elements styled inconsistently, or non-interactive elements that look clickable.
- **Law of Common Region** — Elements within shared boundaries group together. Audit cards, form sections, and dashboard widgets for missing or unclear visual containers.
- **Law of Pragnanz** — The mind simplifies complex visuals into the simplest form. Audit for ambiguous icons, overly complex visual patterns, and unclear visual hierarchy.
- **Law of Uniform Connectedness** — Visual connectors signal relationships. Audit multi-step processes for missing progress lines, flow indicators, or visual connections between related items.
- **Aesthetic-Usability Effect** — Users perceive beautiful interfaces as more usable. Visual polish builds trust but can mask real problems. Audit for both visual quality and whether polish is hiding usability issues.
- **Von Restorff Effect** — Distinctive items attract attention. Audit whether primary CTAs visually stand out. Check for overuse of visual emphasis that dilutes the effect.

### Behavior

- **Peak-End Rule** — Experiences are judged by their most intense moment and their ending. Audit final screens in key flows (confirmations, completions, error recovery) for quality.
- **Serial Position Effect** — First and last items in a series are best remembered. Audit whether critical navigation items and key actions occupy the extremes of lists and menus.
- **Zeigarnik Effect** — Incomplete tasks create cognitive tension. Audit for missing save-state recovery, draft persistence, and completion indicators in multi-step flows.

### Design Principles

- **Occam's Razor** — The simplest solution is usually best. Audit for unnecessary elements, redundant controls, and complexity that doesn't serve user goals.
- **Pareto Principle** — 80% of effects come from 20% of causes. Focus audit attention on the features and flows that serve the majority of user tasks.
- **Postel's Law** — Accept varied inputs liberally, provide consistent output. Audit form fields for rigid format requirements, unhelpful validation, and unnecessary constraints.
- **Tesler's Law** — Irreducible complexity should be absorbed by the system, not the user. Audit for complexity that could be automated, defaulted, or hidden behind progressive disclosure.
- **Parkinson's Law** — Tasks expand to fill available time. Audit for missing autofill, smart defaults, and unnecessary steps that add friction without value.

## Accessibility Baseline (WCAG 2.1 AA)

- **Color contrast**: 4.5:1 for normal text, 3:1 for large text (18px+ bold or 24px+) and UI components
- **Touch/click targets**: Minimum 48x48dp (44x44 CSS pixels) with adequate spacing
- **Keyboard navigation**: All interactive elements must be reachable and operable via keyboard
- **Focus indicators**: Visible focus states on all interactive elements
- **ARIA and semantics**: Proper use of ARIA labels, roles, and semantic HTML elements
- **Motion**: Respect `prefers-reduced-motion`; avoid animations that could trigger vestibular disorders
