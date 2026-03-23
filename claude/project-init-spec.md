---
title: Project Initialization Specification
version: 0.1.0
maintained_by: Aire System Architect (ASA)
domain_tags: [system, governance, initialization]
status: draft
platform: claude-code
license: Apache-2.0
---

# Purpose
Define how a new project is bootstrapped using the Aire system with Claude Code. This spec covers the initialization sequence from "I have role files" to "Claude is ready to work" — including CLAUDE.md setup, directory scaffolding, planning artifact creation, and state tracker initialization.

# Scope

## Covers
- CLAUDE.md structure and role file integration.
- Required directory scaffolding.
- Initialization sequence (what happens in what order).
- State tracker bootstrapping.
- Planning artifact kickoff.

## Does Not Cover
- Role file creation (governed by `claude/aire-smith.role.md`).
- Content of planning artifacts (governed by `claude/planning-spec.md`).
- Ongoing development workflow (governed by role files, git hygiene, etc.).

# CLAUDE.md

## Purpose
CLAUDE.md is automatically loaded by Claude Code at session start. It is the entry point — the first thing Claude reads. It MUST be a concise pointer that tells Claude where to find its governing context, not a dump of all governance content.

## Location
Repository root: `CLAUDE.md`

## Structure

CLAUDE.md MUST contain:

1. **Project identity**: project name and one-line description.
2. **Role reference**: path to the active role file(s). Instruction to read and follow them.
3. **State tracker reference**: path to STATE.md. Instruction to read it at session start and maintain it.
4. **Planning references**: paths to NORTHSTAR.md and ROADMAP.md. Instruction to consult them for project direction.
5. **Governance references**: paths to spec-spec, decision-log-spec, git-hygiene, and other active governance files. Instruction to follow them.
6. **Key conventions**: any project-specific conventions not covered by role files (e.g., language, framework, preferred tools). Keep this short.

## Rules
- CLAUDE.md MUST be concise. It is a pointer and a brief instruction set, not a comprehensive document.
- The meat of behavioral governance lives in role files and specs. CLAUDE.md points to them.
- CLAUDE.md SHOULD be stable. It changes when role files are added/removed or governance structure changes, not on every task.
- Claude MUST NOT modify CLAUDE.md without user approval (it governs Claude's own behavior — changes are Class C).

## Example (Non-Normative)
```markdown
# Project: myapp

A CLI tool for indexing and searching local JSON datasets.

## Role
Read and follow: `roles/developer.role.md`

## State
Read at session start and maintain throughout: `STATE.md`

## Planning
- Project vision and principles: `NORTHSTAR.md`
- Milestones and progress: `ROADMAP.md`
- Active sprint: check STATE.md for the current sprint file path.

## Governance
Follow these specs:
- Spec structure: `claude/spec-spec.md`
- Decision logging: `claude/decision-log-spec.md`
- Git hygiene: `claude/claude.git-hygiene.md`
- Testing: see spec-spec.md Test Strategy requirements and git-hygiene promotion rules.

## Conventions
- Language: Python 3.12+
- Package manager: uv
- Test framework: pytest
```

# Directory Scaffolding

## Required at initialization
These directories and files MUST exist after project initialization:

```
<project-root>/
  CLAUDE.md              # entry point for Claude Code
  STATE.md               # project state tracker
  NORTHSTAR.md           # project vision (created during planning phase)
  ROADMAP.md             # milestones (created during planning phase)
  specs/                 # specification files
    INDEX.md             # spec table of contents
  decisions/             # decision log
    events/              # canonical decision events
  sprints/               # sprint files (created when planning begins)
```

## Optional (created as needed)
```
  src/                   # source code (or project-appropriate equivalent)
  tests/                 # test files
  docs/                  # user-facing documentation
```

## Rules
- Claude MUST create the required scaffolding at project initialization if it doesn't exist.
- Claude MUST NOT create directories speculatively. `src/`, `tests/`, `docs/` are created when the first file in them is needed.
- STATE.md MUST be at the repository root. It is the user's primary mechanism for understanding project status.

# Initialization Sequence

When a user starts a new project with Aire governance:

## Phase 1: Bootstrap
1. Initialize git repository (if not already initialized).
2. Create CLAUDE.md with role and governance references.
3. Create STATE.md with initial project overview (minimal — will be fleshed out during planning).
4. Create required directory scaffolding (`specs/`, `decisions/`, `specs/INDEX.md`).
5. Create initial `specs/INDEX.md` (empty index, header only).
6. Initial commit: `chore(init): bootstrap project with Aire governance`

## Phase 2: Planning
7. User describes project goals and outcomes.
8. Claude drafts NORTHSTAR.md — user reviews and approves.
9. Claude drafts ROADMAP.md with initial milestones — user reviews and approves.
10. Claude creates sprint files for the first milestone.
11. Claude updates STATE.md to reflect planning state.
12. Commit: `docs(planning): add northstar, roadmap, and initial sprints`

## Phase 3: Ready
13. Claude updates STATE.md with active sprint information.
14. Development begins on the first sprint.

## Rules
- Each phase MUST be committed before moving to the next.
- The user MUST review and approve NORTHSTAR.md and ROADMAP.md before development begins. These are the guiding documents — Claude does not proceed on guesses.
- If role files need to be created (via AireSmith), that happens before Phase 1.

Reinforcement (MUSTs):
- Commit after each phase.
- User reviews and approves northstar and roadmap before development.
- Role files exist before initialization begins.

# Verification
Initialization is complete when:
1. CLAUDE.md exists and references the active role, STATE.md, and governance specs.
2. STATE.md exists at repo root with current project state.
3. Required directory scaffolding exists.
4. NORTHSTAR.md and ROADMAP.md exist and have been user-approved.
5. At least one sprint file exists for the first milestone.
6. All initialization work is committed.

# Change Control
Regenerate-not-patch. Update version and provenance on every change.
