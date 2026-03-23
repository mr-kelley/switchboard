---
title: Project State Tracker Specification
version: 0.2.0
maintained_by: Aire System Architect (ASA)
domain_tags: [system, governance, state]
status: draft
platform: claude-code
license: Apache-2.0
---

# Purpose
Define a human-readable, always-current project state file shared between Claude and the user. The tracker is the authoritative snapshot of what is happening in the project — what work is active, what has been done, and what the current structure looks like. It provides continuity across Claude Code sessions.

# File Location
`STATE.md` at the repository root. This is deliberately prominent — it is the user's primary mechanism for understanding where the project stands at any given time.

# Scope

## Covers
- Tracking active and recent work across sessions.
- Recording project structure and key artifacts.
- Providing session-start context so Claude can resume effectively.
- Logging decisions made and their status.

## Does Not Cover
- Replacing git history or commit messages as the audit trail.
- Storing full file contents or diffs.
- Serving as a task management system (it tracks state, not assignments).

# Format
The tracker MUST be Markdown. It is meant to be read by both Claude and the user at any time.

## Required Sections

### 1. Project Overview
Brief description of the project, its repository, and its current phase or milestone.

### 2. Active Work
What is currently in progress. Each item includes:
- A short description of the work.
- The branch it lives on (if applicable).
- Key files being touched.
- Current status (in-progress, blocked, waiting-on-user).

When no work is active, this section states that explicitly.

### 3. Recent Completions
Work completed in recent sessions. Each item includes:
- A short description.
- The commit SHA or branch where it landed.
- Date of completion.

Older items rotate out as the list grows; the threshold is approximately 10 items. Git history is the long-term record.

### 4. Project Structure
Key directories, entry points, and architectural landmarks. Updated when the structure changes meaningfully. This is a map, not an exhaustive listing.

### 5. Key Decisions
Decisions that affect ongoing work, with references to decision log entries (e.g., `DEC-000012`) when the decision log is in use. Lightweight summary format — the decision log holds the full record.

### 6. Open Questions
Unresolved ambiguities, blocked items, or topics that need user input. Each item states what is unclear and what is needed to resolve it.

### 7. Session Notes
Optional. Brief notes from the most recent session — what was done, what was left in progress, anything Claude or the user should pick up next time. This section is overwritten each session, not appended.

# Maintenance Rules

- Claude MUST update the tracker when meaningful state changes occur: starting work, completing work, making decisions, encountering blockers, or changing project structure.
- Claude MUST NOT update the tracker for trivial changes (typo fixes, minor reformatting) unless they affect project state.
- The tracker MUST remain concise. If a section grows unwieldy, Claude should summarize and trim, preserving references to where full details live (git log, decision log, specs).
- The user MAY edit the tracker directly. Claude MUST treat user edits as authoritative and not silently revert them.
- On session start, Claude SHOULD read the tracker to restore context.

Reinforcement (MUSTs):
- Update the tracker on meaningful state changes.
- Keep the tracker concise and human-readable.
- Treat user edits to the tracker as authoritative.
- Do not revert or overwrite user modifications without explicit instruction.

# Verification
The tracker is compliant if:
1. It is valid Markdown with all required sections present.
2. Active work reflects actual in-progress state (no stale entries).
3. Recent completions reference verifiable commits or branches.
4. Key decisions reference decision log entries when the log is in use.
5. The file is readable and useful to a human opening it cold.

# Example (Non-Normative)
```markdown
# Project State — myapp

## Project Overview
myapp is a CLI tool for indexing and searching local JSON datasets. Repository: `gits/myapp`. Current milestone: Core CLI functional.

## Active Work
- **Argument parsing sprint** — branch `work/2026-03-10T0900Z/arg-parsing`. Implementing CLI argument parser per `specs/src/cli/args-spec.md`. Status: in-progress. Key files: `src/cli/args.py`, `tests/cli/test_args.py`.

## Recent Completions
- Project initialization and planning — commit `abc1234` — 2026-03-09.
- NORTHSTAR.md and ROADMAP.md approved — commit `def5678` — 2026-03-09.

## Project Structure
- `src/cli/` — CLI entry point and argument handling.
- `src/index/` — Indexing engine (planned, not yet started).
- `src/search/` — Search engine (planned, not yet started).
- `specs/` — All specification files.
- `decisions/` — Decision log events.
- `docs/` — User-facing documentation (not yet created).

## Key Decisions
- DEC-000001: Use SQLite FTS5 for the search index (simple, local, fast).
- DEC-000002: Support JSON and JSONL input formats only for v1.

## Open Questions
- Should we support streaming input from stdin in the first milestone?

## Session Notes
Completed argument parser implementation. Tests passing. Next: wire up the index subcommand in sprint 02.
```

# Change Control
Regenerate-not-patch. Update version and provenance on every change.

## Provenance
- source: Adapted from `templates/state-tracker-spec.md` v0.1 (JSON, multi-agent, per-directive overwrite model)
- time: 2026-03-05
- summary: Converted from machine-first JSON to human-readable Markdown. Replaced per-directive overwrite semantics with continuous maintenance model. Removed directive bundle, checksum, and Runner/Orchestrator references. Designed for shared Claude + human use across sessions. File location moved to STATE.md at repository root for visibility.
