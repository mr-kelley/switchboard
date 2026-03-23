---
title: Decision Log Specification
version: 0.2.0
maintained_by: Aire System Architect (ASA)
domain_tags: [system, governance, decisions]
status: draft
platform: claude-code
license: Apache-2.0
---

# Purpose
Create a searchable, auditable decision record so that Claude and the user can consult past decisions instead of relying on conversation memory (which does not survive across sessions).

This spec defines:
- The canonical decision event format (append-only JSON files).
- A derived SQLite full-text search index.
- A minimal CLI contract for search and retrieval.
- Decision classification and governance behavior for the Claude + human model.

# Scope

## Covers
- Decision event schema and storage.
- Decision ID allocation.
- Search index generation and rebuild.
- Decision classification (A/B/C) and when to log.
- CLI verbs for managing decisions.

## Does Not Cover
- What constitutes a correct decision (that's domain-specific).
- Project management or task tracking.
- Git commit policy (governed by `claude.git-hygiene.md`).

# Definitions
- **Decision Event**: An immutable record capturing a single decision, its context, alternatives, and rationale.
- **Canonical Store**: The JSON event files in `decisions/events/`. Source of truth.
- **Derived Index**: The SQLite database. Rebuildable from canonical events at any time.
- **Decision ID**: Stable identifier of the form `DEC-000123`.

# Directory Layout
All paths are repo-relative.

```
decisions/
  SEQ.txt              # (optional) next ID counter
  events/              # canonical — one JSON file per decision
    DEC-000001.json
    DEC-000002.json
    ...
  index.sqlite         # derived — rebuildable from events/
  README.md            # (optional) usage notes
```

- `decisions/events/*` are the **only** canonical records.
- `decisions/index.sqlite` is **derived** and may be deleted and regenerated at any time.

# Decision Event Schema

## File format
- Encoding: UTF-8
- Format: JSON object, one decision per file
- Filename: `DEC-XXXXXX.json` matching the decision ID

## Required fields
- `schema` (string): `"aire.decisions.v0.2"`
- `id` (string): `DEC-` + 6 zero-padded digits
- `ts` (string): ISO-8601 timestamp with timezone offset
- `project` (string): short project name
- `repo` (string): repo identifier or path
- `made_by` (string): `"claude"`, `"user"`, or `"claude+user"`
- `decision_class` (string): `"A"`, `"B"`, or `"C"`
- `title` (string): concise, searchable summary
- `decision` (string): the chosen course of action
- `context` (object): structured pointers to relevant state
- `scope` (object): where this applies
- `options` (array): at least 1 option object (the chosen option + alternatives)
- `rationale` (string): why this choice was made
- `risk` (object): risk level + rollback info
- `links` (object): pointers to commits, files, etc.
- `outcome` (object): status + verification pointers
- `tags` (array of strings): 0+ searchable tags

## Recommended fields
- `context.assumptions` (array of strings)
- `context.spec_refs` (array of strings): spec paths + optional anchors
- `context.task_description` (string): what prompted the decision
- `scope.areas` (array of strings)
- `scope.paths` (array of strings)

## Decision Classes

**Class A — Free to decide.** Safe defaults, refactors preserving behavior, style/formatting, internal naming, test improvements. Claude proceeds without logging (though logging is permitted).

**Class B — Decide and log.** Behavior changes, public API shape, storage formats, security posture, performance tradeoffs, new dependencies, architectural patterns affecting multiple modules. Claude proceeds and records a decision event.

**Class C — Escalate to user.** Irreversible or high-risk actions: data destruction, privilege changes, licensing changes, major architecture pivots, paid services, production-impacting operations. Claude presents options and a recommendation, then waits for user decision. The decision event records the escalation and outcome.

## Outcome semantics
- `outcome.status`: one of `"unknown"`, `"success"`, `"partial"`, `"failed"`, `"reverted"`
- `outcome.verified_by`: array of evidence pointers (commit SHAs, test results, etc.)
- `outcome.notes`: optional free-form string

# Decision ID Allocation

IDs MUST be deterministic and collision-free.

**Mechanism (v0.2):**
1. Read integer N from `decisions/SEQ.txt` (initialize to `0` if file doesn't exist).
2. Increment to N+1.
3. Write N+1 back to `SEQ.txt`.
4. Use `DEC-` + zero-padded 6-digit N+1 as the ID.

Reinforcement: decision IDs are deterministic and never collide.

# Search Index (SQLite, Derived)

- The SQLite database MUST be reconstructible from `decisions/events/*.json`.
- The database is for speed and convenience — it MUST NOT be required for correctness.
- Location: `decisions/index.sqlite`

## Required capabilities
- Full-text search across: `title`, `decision`, `rationale`, `tags`, `scope.paths`, `scope.areas`.
- Filter by: `id`, `made_by`, `decision_class`, `project`, `ts` range.
- Deterministic rebuild from canonical JSON events.

Reinforcement: SQLite is always rebuildable from JSON and never required for correctness.

# CLI Contract (Minimal)

Implementations SHOULD expose these verbs (names are illustrative; behavior is normative):

**`dec add`** — Create a new decision event with the next ID. Validates required fields before writing.

**`dec show DEC-XXXXXX`** — Display the canonical JSON (or a formatted view).

**`dec search <query>`** — Full-text search using the index. Falls back to scanning JSON files if the index is missing.

**`dec list [filters]`** — Structured filtering: `--class B`, `--made-by claude`, `--since 2026-01-01`, `--project aire`.

**`dec rebuild-index`** — Delete and regenerate `decisions/index.sqlite` from canonical events.

# Governance Behavior

## When Claude MUST log a decision
A decision event MUST be created when:
- A new external dependency is introduced.
- A public interface is added or changed.
- A persistence or serialization format is added or changed.
- Security posture changes.
- An architectural pattern is adopted that affects multiple modules.
- The user makes a significant project direction choice (Claude logs it on their behalf with `made_by: "user"` or `"claude+user"`).

Reinforcement: these triggers always require a decision event.

## Claude's decision behavior by class
- **Class A**: Proceed. Logging optional.
- **Class B**: Proceed and log.
- **Class C**: Present options, recommend one, wait for user. Log the decision with the user's choice.

## Traceability
- Commit messages SHOULD reference decision IDs when code changes implement a decision (e.g., `Implements DEC-000012`).
- Decision events SHOULD have `links.commit` filled in once the implementing commit exists.

# Canonical JSON Example (Non-Normative)
```json
{
  "schema": "aire.decisions.v0.2",
  "id": "DEC-000001",
  "ts": "2026-03-05T14:30:00-06:00",
  "project": "aire",
  "repo": "gits/aire",
  "made_by": "claude+user",
  "decision_class": "B",
  "title": "Use Markdown for project state tracker",
  "decision": "State tracker uses Markdown format instead of JSON for human readability.",
  "context": {
    "task_description": "Adapting Aire specs for Claude Code single-agent model",
    "spec_refs": ["claude/state-tracker-spec.md"],
    "assumptions": ["State is shared between Claude and human, not between AI agents"]
  },
  "scope": {
    "areas": ["governance", "state"],
    "paths": ["state/tracker.md", "claude/state-tracker-spec.md"]
  },
  "options": [
    {"name": "markdown", "pros": ["human-readable", "easy to edit", "diffs well in git"], "cons": ["not machine-parseable without effort"]},
    {"name": "json", "pros": ["machine-parseable", "schema-validatable"], "cons": ["hard for humans to scan quickly"]},
    {"name": "yaml", "pros": ["human-readable", "structured"], "cons": ["whitespace-sensitive", "parsing edge cases"]}
  ],
  "rationale": "The tracker is read by humans as often as by Claude. Markdown is the most natural format for both audiences and diffs cleanly in git.",
  "risk": {
    "level": "low",
    "reversibility": "high",
    "rollback": "Convert tracker to JSON or YAML if machine parsing becomes critical."
  },
  "links": {
    "commit": null,
    "related_files": ["claude/state-tracker-spec.md"]
  },
  "outcome": {
    "status": "success",
    "verified_by": ["claude/state-tracker-spec.md v0.2.0"],
    "notes": null
  },
  "tags": ["state", "format", "markdown", "governance"]
}
```

# Determinism Requirements
- Given the same canonical event set, `dec rebuild-index` MUST produce functionally equivalent search results.
- `dec search` MUST return stable ordering for ties (sort by `ts desc`, then `id desc`).
- Canonical JSON events MUST be valid JSON and must not depend on runtime-only fields.

# Change Control
Regenerate-not-patch. Update version and provenance on every change.

## Provenance
- source: Adapted from `templates/decision-log-spec.md` v0.1 (multi-agent, role-based governance)
- time: 2026-03-05
- summary: Adapted for Claude Code single-agent + human model. Replaced role field with made_by (claude/user/claude+user). Removed Runner/Developer/Architect/Tester role distinctions. Simplified governance behavior for single-agent decision-making. Updated schema name to aire.decisions.v0.2. Preserved core concepts: append-only JSON events, derived SQLite index, decision classes A/B/C, CLI contract.
