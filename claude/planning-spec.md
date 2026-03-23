---
title: Planning Artifacts Specification
version: 0.1.0
maintained_by: Aire System Architect (ASA)
domain_tags: [system, governance, planning]
status: draft
platform: claude-code
license: Apache-2.0
---

# Purpose
Define the structure and governance of planning artifacts used to guide project development. Planning artifacts are the "what and why" guardrails — they define what the project aims to achieve and how work is organized to get there. Role files are the "how" guardrails — they define behavioral expectations. Together, they provide complete context for autonomous development.

Three planning artifacts are defined:
1. **Northstar** — the project's purpose, vision, and success criteria.
2. **Roadmap** — milestones and their outcomes.
3. **Sprints** — granular units of work within milestones.

# Scope

## Covers
- Structure and required content for each planning artifact.
- How Claude creates, uses, and maintains planning artifacts.
- Relationship between planning artifacts and execution governance.

## Does Not Cover
- Project management tooling or integrations.
- Time estimates or scheduling (planning is outcome-bound, not time-bound).
- Role definitions (governed by `claude/claude.role.base.md`).

# Northstar

## Purpose
The northstar is the project's guiding document. It tells Claude (and the user) what this project is, why it exists, what success looks like, and what principles govern decisions when trade-offs arise. It is the first document Claude should read after STATE.md to understand the project's intent.

## File Location
`NORTHSTAR.md` at the repository root.

## Required Content

### Project Identity
- Project name.
- One-paragraph description of what the project is and who it serves.

### Vision
- What the project looks like when it is successful. Written in concrete, observable terms — not aspirational abstractions.
- Example: "Users can deploy a local search index from any JSON dataset in under 5 minutes with zero configuration" — not "Democratize data access."

### Success Criteria
- Measurable or verifiable conditions that indicate the project has achieved its goals.
- Each criterion should be testable: Claude (or the user) should be able to look at the project and say "yes, this is met" or "no, it isn't."

### Guiding Principles
- Decision-making heuristics for when trade-offs arise.
- These are project-specific. Examples: "Prefer simplicity over configurability," "Offline-first," "No external service dependencies."
- These directly inform Class B/C decisions — when Claude faces a choice, guiding principles help pick the right option.

### Non-Goals
- What this project deliberately does not aim to do. Helps prevent scope creep.

## Rules
- The northstar is written collaboratively by the user and Claude at project start.
- Claude MUST consult the northstar when making architectural or design decisions. If a choice conflicts with guiding principles, Claude flags it.
- The northstar is stable — it changes rarely. Changes are Class C decisions.
- The northstar MUST be human-readable and concise. It is not a spec; it is a compass.

# Roadmap

## Purpose
The roadmap defines milestones — named checkpoints that represent meaningful project outcomes. It organizes work by what gets achieved, not by time or task volume.

## File Location
`ROADMAP.md` at the repository root.

## Required Content

### Milestone List
Each milestone includes:
- **Name**: short, descriptive (e.g., "Core CLI functional," "Auth system complete").
- **Outcome**: what is true when this milestone is done. Written as observable conditions, not task lists.
- **Dependencies**: which milestones (if any) must be complete first.
- **Status**: `planned`, `active`, `completed`.
- **Completion evidence**: when completed, a brief note on what was delivered and where (commits, branches, artifacts).

### Ordering
Milestones are ordered by dependency, not by date. The first milestone has no dependencies; subsequent milestones build on prior ones.

## Rules
- The roadmap is outcome-bound, not time-bound. No dates, no time estimates.
- Each milestone defines what success looks like, not what work is required. The work breakdown happens in sprints.
- Claude MUST update milestone status as work progresses. Moving a milestone to `completed` requires that its outcome conditions are verifiably met.
- Adding or removing milestones is a Class B decision (log it).
- Reordering milestones that changes dependency structure is a Class B decision.

Reinforcement (MUSTs):
- Milestones define outcomes, not tasks.
- Update milestone status as work progresses.
- Log milestone additions/removals as Class B decisions.

# Sprints

## Purpose
Sprints are granular units of work within a milestone. Each sprint delivers one feature, one component, or one clearly scoped piece of functionality. Sprints are how milestones get done.

## File Location
`sprints/` directory. One file per sprint: `sprints/<milestone-slug>/<sprint-number>-<slug>.md`.

Example: `sprints/core-cli/01-argument-parsing.md`

## Required Content

Each sprint file includes:

### Header
```yaml
---
sprint: <number>
title: <short title>
milestone: <milestone name>
status: planned | active | completed | blocked
---
```

### Goal
One or two sentences: what this sprint delivers.

### Deliverables
Specific, enumerable outputs:
- Implementation files (with spec references).
- Tests.
- Documentation updates.

### Acceptance Criteria
Conditions that must be true for the sprint to be complete. These should be verifiable — tests pass, behavior observable, documentation updated.

### Dependencies
Other sprints or external factors this sprint depends on.

### Notes
Optional. Context, design considerations, open questions.

## Rules
- Sprints SHOULD be scoped to approximately one feature or component. If a sprint grows to encompass multiple unrelated features, split it.
- Every sprint MUST have acceptance criteria that include passing tests. "Tests pass" is always an acceptance criterion, never optional.
- **One sprint, one branch.** Each sprint maps 1:1 to a git work branch per `claude/claude.git-hygiene.md`. The sprint starts when the work branch is created; the sprint completes when the work is promoted to `main`. No mixing sprints on a branch, no splitting a sprint across branches.
- Claude MUST update sprint status as work progresses.
- Claude MUST NOT start a new sprint while the current sprint has uncommitted or unverified work. Complete or explicitly pause the current sprint first.
- Sprint scope changes (adding/removing deliverables) after work has started are Class B decisions.
- Creating a sprint for work outside the current active milestone is a Class B decision.

Reinforcement (MUSTs):
- Sprints include acceptance criteria with passing tests.
- Update sprint status as work progresses.
- Complete or pause the current sprint before starting a new one.
- Log sprint scope changes as Class B decisions.

# Workflow Integration

## Project Start
1. User describes project goals and outcomes.
2. Claude drafts a NORTHSTAR.md for user review.
3. Claude drafts a ROADMAP.md with initial milestones for user review.
4. User and Claude refine both documents.
5. Claude creates sprint files for the first milestone.
6. Work begins on the first sprint.

## During Execution
- Claude works one sprint at a time.
- At sprint completion: verify acceptance criteria, update sprint status, update STATE.md, update milestone progress in ROADMAP.md.
- At milestone completion: verify milestone outcomes, update ROADMAP.md, create sprints for the next milestone.
- Planning artifacts inform decisions: when a Class B/C decision arises, Claude checks northstar guiding principles and current milestone context.

## Planning Artifact Maintenance
- NORTHSTAR.md: stable, changes rarely, Class C to modify.
- ROADMAP.md: updated when milestones are added/completed/reordered.
- Sprint files: updated during active work, frozen after completion.
- STATE.md: always reflects current sprint and milestone status.

# Verification
Planning artifacts are compliant if:
1. NORTHSTAR.md exists and contains all required sections.
2. ROADMAP.md exists with at least one milestone defined.
3. Active sprint file exists when development work is in progress.
4. Sprint acceptance criteria include test requirements.
5. STATE.md reflects current planning state (active milestone, active sprint).

# Change Control
Regenerate-not-patch. Update version and provenance on every change.
