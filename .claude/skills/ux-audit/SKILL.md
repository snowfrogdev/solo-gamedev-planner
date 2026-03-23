---
description: Perform a structured UI/UX audit using Laws of UX and Nielsen's heuristics
argument-hint: "[target] - file path, folder, component name, 'all', or 'changes'"
agent: ux-auditor
context: fork
allowed-tools: Read, Glob, Grep, Bash(git:*)
---

Perform a comprehensive UI/UX audit of: $ARGUMENTS

## Step 1: Determine Audit Target

Parse the target argument to determine what to audit:

| Argument | Action |
|----------|--------|
| File path (e.g., `src/components/Header.tsx`) | Audit that specific file |
| Folder path (e.g., `src/pages/`) | Discover and audit all UI files in that folder |
| `all` or empty | Discover all UI files in the project (search `**/components/**`, `**/pages/**`, `**/views/**`, `**/*.tsx`, `**/*.jsx`, `**/*.vue`, `**/*.svelte`, `**/*.html`) |
| `changes` or `uncommitted` | Run `git diff --name-only` and `git diff --cached --name-only`, filter to UI-relevant files |
| Component name (e.g., `Header`) | Search for matching files via Glob (`**/*Header*.*`, `**/Header.*`) |

## Step 2: Gather Context

1. Read all target files identified in Step 1.
2. Discover and read CSS/style files in the project (`**/*.css`, `**/*.scss`, `**/*.module.css`) for cross-referencing class names and style values.
3. Read relevant law reference files from `.claude/skills/ux-audit/laws/` based on the type of UI being audited (see the mapping in the agent's workflow).

## Step 3: Context Gathering

- Identify what type of interface this is (form, dashboard, landing page, navigation, data visualization, settings, etc.)
- Note the apparent target audience and use context
- Identify the primary user tasks this interface supports

## Step 4: Nielsen's Heuristic Evaluation

Evaluate against all 10 heuristics. For each violation found:

- State the heuristic violated
- Describe the specific issue with file:line or CSS selector reference
- Assign severity (0-4 using Nielsen's scale)
- Provide a concrete fix recommendation
- Estimate effort (Low/Medium/High)

## Step 5: Laws of UX Assessment

Select the most relevant laws for the screen type and evaluate alignment using the detailed reference files:

- Score each applicable law on a 1-5 scale
- Provide specific observations grounded in the law's principles
- Reference concrete code locations

## Step 6: Accessibility Quick-Check

- Color contrast (WCAG AA: 4.5:1 for normal text, 3:1 for large text and UI components)
- Touch/click target sizes (minimum 48x48dp)
- Keyboard navigability and focus indicators
- ARIA labels, roles, and semantic HTML
- Focus management in modals/overlays
- Motion and `prefers-reduced-motion` support

## Step 7: Synthesis

- Identify the top 3-5 critical findings
- Note positive patterns worth preserving
- Provide a prioritized recommendation roadmap: quick wins, strategic improvements, polish items

## Output

Structure your complete findings using the template defined in `.claude/rules/ux-audit-template.md`.
