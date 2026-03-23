---
globs:
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

# UX Audit Output Template

Structure all audit findings using this format.

## Executive Summary

2-3 sentences: overall assessment, critical issues count, key theme.

## Interface Context

- **Type**: [form / dashboard / landing page / navigation / settings / data visualization / etc.]
- **Primary tasks**: [what users are trying to accomplish]
- **Notable strengths**: [positive patterns observed]

## Heuristic Findings

### Critical (Severity 3-4)

For each finding:

**[Heuristic Name]** | Severity: X/4

- **Issue**: [specific description with file:line or CSS selector location]
- **Impact**: [how this affects users]
- **Fix**: [concrete recommendation]
- **Effort**: Low / Medium / High

### Major (Severity 2)

[Same format as Critical]

### Minor (Severity 0-1)

[Same format as Critical]

## Laws of UX Assessment

| Law | Score (1-5) | Notes |
|-----|-------------|-------|
| [Relevant law] | X | [Brief assessment] |

Only include laws relevant to the screen type being audited. Do not evaluate all laws for every screen.

**Screen type to law mapping guide**:

- Navigation/menus: Hick's Law, Miller's Law, Serial Position Effect, Jakob's Law
- Buttons/CTAs: Fitts's Law, Von Restorff Effect
- Forms/onboarding: Goal-Gradient Effect, Parkinson's Law, Postel's Law, Zeigarnik Effect
- Visual layout: Gestalt laws (Proximity, Similarity, Common Region, Pragnanz, Uniform Connectedness), Aesthetic-Usability Effect
- Performance/loading: Doherty Threshold
- Information density: Miller's Law, Occam's Razor, Pareto Principle
- Key moments (checkout, completion, errors): Peak-End Rule
- Complex workflows: Tesler's Law, Paradox of the Active User

## Accessibility Flags

| Issue | Location | WCAG Criterion | Severity |
|-------|----------|---------------|----------|
| [Description] | [file:line or selector] | [e.g., 1.4.3 Contrast] | [Critical/Major/Minor] |

## Positive Patterns

Highlight what works well and why, citing the specific UX principle it satisfies:

- **[Pattern]**: [Why it works well per UX principles]

## Prioritized Recommendations

1. **Quick wins** (high impact, low effort):
   - [item]

2. **Strategic improvements** (high impact, high effort):
   - [item]

3. **Polish items** (low impact, low effort):
   - [item]
