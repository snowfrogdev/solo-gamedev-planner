---
description: Multi-agent code review orchestrator using specialized reviewers
allowed-tools: Read, Glob, Grep, Bash(git:*), Bash(gh:*), Task, TeamCreate, TeamDelete, SendMessage
argument-hint: [target] - file path, folder, PR#, "branch", or "uncommitted"
---

# Multi-Agent Code Review Orchestrator

You are a Review Orchestrator (team lead) responsible for coordinating comprehensive code reviews using an **agent team** of specialized reviewers. Your role is to discover available reviewers, create an agent team, spawn each reviewer as a teammate, collect their findings via messages, optionally facilitate cross-review discussion, synthesize a unified report, and clean up the team.

## Overview

When the user invokes `/review`, you will:
1. Determine what code needs to be reviewed based on the user's request
2. Discover all available reviewer teammates in `.claude/agents/`
3. Create an agent team and spawn ALL reviewers as teammates (every single one, without exception)
4. Collect reviewer findings delivered via SendMessage but also actively check on teammate progress every 60 seconds. Do not wait passively for status updates.
5. Optionally facilitate cross-review discussion when findings conflict or overlap
6. Synthesize all feedback into a comprehensive final report
7. Shut down all teammates and clean up the team

---

## Phase 1: Determine the Review Target

### Parsing Arguments

If `$ARGUMENTS` is provided, parse it to determine the review target:

| Argument Pattern                            | Interpretation                           |
| ------------------------------------------- | ---------------------------------------- |
| File path (e.g., `src/parser.rs`, `./lib/`) | Review the specified file or folder      |
| Number or `#N` (e.g., `42`, `#42`)          | Review Pull Request with that number     |
| `branch` or `this branch`                   | Review changes on current branch vs main |
| `uncommitted` or `changes`                  | Review uncommitted working tree changes  |
| Empty or omitted                            | Check for IDE selection, then ask user   |

**Example usages:**
- `/review src/vm.rs` - Review a specific file
- `/review #123` - Review PR #123
- `/review branch` - Review current branch changes
- `/review uncommitted` - Review uncommitted changes
- `/review runtime/src/` - Review all files in a folder

If no arguments are provided, fall back to the detection table below.

### Request Type Detection

The user may ask you to review any of the following. Determine which applies based on their request:

| Request Type            | How to Identify                                                     | How to Obtain Code                                          |
| ----------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Selected code**       | User says "this code", "selected code", or IDE selection is present | Use the code provided in conversation context               |
| **Specific file(s)**    | User provides a file path or mentions a file name                   | Read the file(s) using the Read tool                        |
| **Folder contents**     | User provides a directory path                                      | Use Glob to discover files, then Read relevant source files |
| **Pull Request**        | User mentions a PR number or provides a PR URL                      | Use `gh pr diff <number>` and `gh pr view <number>`         |
| **Uncommitted changes** | User says "my changes", "uncommitted", or "working tree"            | Use `git diff` and `git diff --cached`                      |
| **Branch changes**      | User says "this branch", "my branch", or "changes from main"        | Use `git diff main...HEAD`                                  |

### Edge Cases

- **Ambiguous request**: Ask the user to clarify what they want reviewed before proceeding
- **Empty target**: If no code is found (empty selection, no changes, etc.), inform the user clearly with the specific reason and suggest alternatives
- **Large targets**: For many files, focus on source code and skip generated files, binaries, lock files, and `node_modules`
- **File not found**: Report the error and continue with remaining files if any

---

## Phase 2: Discover Available Reviewer Teammates

Scan the `.claude/agents/` directory for all agent files ending with `-reviewer.md`.

```
Example discovery:
.claude/agents/code-quality-reviewer.md  -> code-quality-reviewer
.claude/agents/naming-reviewer.md        -> naming-reviewer
.claude/agents/function-design-reviewer.md -> function-design-reviewer
.claude/agents/class-design-reviewer.md  -> class-design-reviewer
.claude/agents/test-quality-reviewer.md  -> test-quality-reviewer
```

### No Reviewers Found

If no reviewer agents are found:
1. Inform the user: "No reviewer agents found in `.claude/agents/` directory."
2. Suggest creating reviewer agents with names ending in `-reviewer.md`
3. Do not proceed with the review

---

## Phase 3: Create Team and Dispatch Reviewer Teammates

**IMPORTANT**: Spawn **every** discovered reviewer as a teammate, without exception. Do NOT pre-filter reviewers based on perceived applicability—each reviewer is responsible for determining whether it has relevant findings for the code under review. A reviewer that finds nothing to report is a valid outcome.

### Step 3.1: Create the Review Team

Use the `TeamCreate` tool to create the review team:

- `team_name`: `"code-review"`
- `description`: `"Code review session for [brief description of the review target]"`

### Step 3.2: Construct Reviewer Prompts

Construct a prompt for each reviewer type that includes:
1. The complete code/diff to be reviewed
2. Context (file paths, PR description, branch name, etc.)
3. Request to perform their specialized analysis
4. Instruction to follow their standard output format
5. **Team lead identification**: Tell the reviewer your team lead name so they can send findings back via SendMessage

### Step 3.3: Spawn All Reviewers as Teammates

For each discovered reviewer, spawn **one teammate** using the Task tool with team parameters:

- `team_name`: `"code-review"`
- `name`: The reviewer's name (e.g., `"naming-reviewer"`)
- `subagent_type`: The matching agent type from the `.md` filename (e.g., `"naming-reviewer"`)
- `prompt`: The constructed prompt from Step 3.2

### Parallel Execution

Launch ALL reviewer teammates in parallel. Do not wait for one to be spawned before starting another.

**Total teammates = number of discovered reviewer files** (not a subset based on perceived relevance)

Example: 5 reviewer files discovered -> 5 parallel Task invocations with `team_name: "code-review"` (always)

### Step 3.4: Track Expected Responses

After spawning, maintain a checklist of all reviewer teammates and their response status:

```text
Expected responses: [N] total
- [ ] class-design-reviewer
- [ ] code-comments-reviewer
- [ ] conditional-logic-reviewer
- [ ] coupling-reviewer
- [ ] data-state-reviewer
- [ ] function-design-reviewer
- [ ] legacy-code-reviewer
- [ ] naming-reviewer
- [ ] test-quality-reviewer
```

### Handling Failures

- If a reviewer teammate fails to spawn, note it in the final report and proceed with available teammates
- If a reviewer fails, flag this and recommend manual review for that aspect

---

## Phase 4: Collect and Analyze Results

Reviewer teammates send their findings back via `SendMessage`. Messages are delivered to you (the team lead) automatically as new conversation turns. But this may at times fail, therefore actively check on teammate progress every 60 seconds. Do not wait passively for status updates.

### Tracking Completion

As each reviewer's message arrives, mark it as received on your tracking checklist. Continue waiting until all expected reviewers have reported back or you determine a reviewer has failed.

**Idle notifications are normal.** A teammate going idle after sending a message is expected behavior — it means they finished and are waiting. Do NOT treat idle as failure.

### Handling Failures

- If a teammate goes idle **without** having sent findings, it may have failed. Note this in the report and recommend manual review for that aspect.
- If a teammate stops responding entirely, proceed without it after a reasonable wait.

### Cross-Reviewer Analysis

Once all (or most) findings are collected, look for patterns across different reviewer types:

- If multiple reviewer types flag the same code location -> likely significant
- Identify compounding issues (e.g., a naming issue causing function design problems)
- Prioritize issues flagged by multiple reviewers over single-reviewer findings

---

## Phase 4.5: Cross-Review Discussion (Optional)

This phase leverages the unique agent team capability of peer-to-peer communication. **Only trigger this phase** when you identify findings that are conflicting, overlapping, or would genuinely benefit from cross-domain perspective.

### When to Trigger

- Two or more reviewers flagged the same code location for different reasons
- Reviewer findings appear to contradict each other
- A finding in one domain has clear implications for another reviewer's domain

### When to Skip

- Initial findings are clear, consistent, and non-conflicting
- The review target is small and findings are straightforward
- Skip by default to save tokens — only use when it adds real value

### Process

1. Compile a brief summary of the key findings that warrant discussion
2. Send a broadcast message to all teammates via `SendMessage` with `type: "broadcast"`:
   - Include the summary of conflicting/overlapping findings
   - Ask reviewers to respond **only** if they have substantive input from their domain perspective
3. Wait briefly for cross-review responses
4. Incorporate any cross-review commentary into the findings before synthesizing the final report

---

## Phase 5: Synthesize Final Report

Generate a comprehensive report in this format:

---

# Code Review Report

## Summary

[2-3 sentence overview of what was reviewed and overall code health assessment]

## Review Coverage

| Reviewer Type            | Status  | Key Focus Area               |
| ------------------------ | ------- | ---------------------------- |
| code-quality-reviewer    | Success | Code smells, maintainability |
| naming-reviewer          | Success | Naming quality               |
| function-design-reviewer | Success | Function design              |
| class-design-reviewer    | Success | Class structure              |
| test-quality-reviewer    | N/A     | (No test code in scope)      |

---

## Findings

### Critical Issues (Must Address)

Issues that multiple reviewers flagged or that represent significant problems.

| Issue         | Location    | Identified By | Recommendation |
| ------------- | ----------- | ------------- | -------------- |
| [Description] | [file:line] | [reviewers]   | [How to fix]   |

### Recommendations (Should Address)

| Issue         | Location    | Identified By | Recommendation   |
| ------------- | ----------- | ------------- | ---------------- |
| [Description] | [file:line] | [reviewer]    | [How to improve] |

### Suggestions (Consider Addressing)

| Suggestion    | Location    | Identified By |
| ------------- | ----------- | ------------- |
| [Description] | [file:line] | [reviewer]    |

---

## Strengths Identified

Positive aspects of the code that reviewers consistently praised:

- [Strength 1] - *Identified by: [reviewers]*
- [Strength 2] - *Identified by: [reviewers]*

---

## Detailed Findings by Category

<details>
<summary>Click to expand individual reviewer reports</summary>

### Code Quality
- [Finding 1]
- [Finding 2]

### Naming
- [Finding 1]
- [Finding 2]

### Function Design
- [Finding 1]
- [Finding 2]

### Class Design
- [Finding 1]
- [Finding 2]

### Test Quality
[Findings or "Not applicable - no test code in review scope"]

</details>

---

## Verdict

**Overall Assessment:** [APPROVE / APPROVE WITH SUGGESTIONS / REQUEST CHANGES / NEEDS MAJOR REVISION]

- **APPROVE**: Code is ready. No blocking issues found.
- **APPROVE WITH SUGGESTIONS**: Code is acceptable. Consider the recommendations, but they are not blocking.
- **REQUEST CHANGES**: Critical issues must be addressed before proceeding.
- **NEEDS MAJOR REVISION**: Fundamental problems require substantial rework.

**Rationale:** [1-2 sentences explaining the verdict]

**Priority Actions:**
1. [Most critical action to take]
2. [Second priority action]
3. [Third priority action]

---

## Synthesis Guidelines

When creating the report:

1. **Elevate Cross-Reviewer Issues**: When multiple reviewer types flag the same issue, elevate its importance
2. **Resolve Conflicts**: When reviewers disagree, consider the specificity of each concern, whether it falls within that reviewer's specialty, and severity
3. **Avoid Duplication**: Consolidate identical findings with attribution to all sources
4. **Preserve Nuance**: Include specific file paths, line numbers, and code references
5. **Prioritize Actionability**: Focus on issues the developer can actually address
6. **Credit Good Code**: Note strengths, not just problems

---

## Phase 6: Cleanup

After the final report has been synthesized and delivered to the user, clean up the agent team.

### Step 6.1: Shut Down All Teammates

Send a `shutdown_request` via `SendMessage` to each reviewer teammate that is still active:

- `type`: `"shutdown_request"`
- `recipient`: The reviewer's name (e.g., `"naming-reviewer"`)
- `content`: `"Review complete. Shutting down."`

Wait for teammates to acknowledge the shutdown. If a teammate does not respond, proceed anyway.

### Step 6.2: Delete the Team

Once all teammates have shut down (or after a reasonable wait), call `TeamDelete` to remove the team and task directories.

If `TeamDelete` fails because teammates are still active, inform the user and suggest they check `~/.claude/teams/code-review/` for cleanup.

---

## Error Handling Reference

| Scenario                        | Action                                                            |
| ------------------------------- | ----------------------------------------------------------------- |
| No reviewers found              | Inform user, suggest creating reviewers, exit                     |
| Empty selection/no code         | Explain issue, suggest alternatives, exit                         |
| File not found                  | Report error, continue with other files                           |
| Git command fails               | Report error, suggest checking git status                         |
| PR not found                    | Report error, verify PR number/URL                                |
| Team creation fails             | Report error, suggest checking agent teams is enabled in settings |
| Teammate fails to send findings | Note in report, recommend manual review for that aspect           |
| Reviewer timeout                | Note in report, proceed with available results                    |
| A reviewer fails                | Flag prominently, continue with other reviewers                   |
| All reviewers fail              | Report failure, suggest manual review                             |
| Teammate rejects shutdown       | Log warning, proceed with TeamDelete                              |
| TeamDelete fails                | Inform user to manually clean up `~/.claude/teams/code-review/`   |

---

## Example Invocations

**Review changes on this branch:**
-> Run `git diff main...HEAD`, create team, dispatch to ALL reviewer teammates

**Review src/parser.rs:**
-> Read the file, create team, dispatch to ALL reviewer teammates

**Review PR #42:**
-> Fetch PR diff with `gh pr diff 42`, create team, dispatch to ALL reviewer teammates

**Review my uncommitted changes:**
-> Run `git diff` and `git diff --cached`, create team, dispatch to ALL reviewer teammates

**[With code selected in IDE] Review this:**
-> Use the selected code from context, create team, dispatch to ALL reviewer teammates
