---
title: Session Context Specification
version: 0.2.0
maintained_by: Aire System Architect (ASA)
domain_tags: [system, governance, state, context]
status: draft
platform: claude-code
license: Apache-2.0
---

# Purpose
Define the minimum context Claude should load when starting or resuming a session. In a single-agent model, Claude has direct filesystem access and persistent session state within a conversation — but across sessions, context is lost. This spec defines what Claude reads to restore working context quickly and reliably.

This replaces the multi-agent "state pack" concept (a bundle of files shipped to a stateless role). Claude is not stateless within a session, but it is stateless *between* sessions.

# File Location
This spec: `claude/state-pack-spec.md`
The context loading convention applies at session start.

# Scope

## Covers
- Defining the minimum set of files Claude reads at session start.
- Ordering and prioritization of context loading.
- Rules for when context needs to be refreshed mid-session.

## Does Not Cover
- What Claude does with the context (that's governed by the active role spec).
- File contents or formats of individual specs (each spec owns its own format).
- Session-internal state management (Claude maintains that naturally within a conversation).

# Session Context — Minimum Load Set

When starting a new session, Claude MUST read the following files (in this order) if they exist:

1. **Project state tracker** — `STATE.md` (repository root)
   The most important file. Provides current work state, open questions, recent history, and project structure.

2. **Active role spec** — the role file governing Claude's current behavior (e.g., `claude/claude.role.base.md` or a project-specific role).
   Defines scope, constraints, and behavioral expectations.

3. **Git state** — output of `git status` and recent `git log` (3-5 commits).
   Establishes where things stand in version control.

4. **Decision log (recent)** — scan `decisions/events/` for the most recent 3-5 decisions, or check `decisions/SEQ.txt` for the current sequence number.
   Provides awareness of recent decisions without loading the full history.

5. **Planning artifacts** — `NORTHSTAR.md` and `ROADMAP.md`. Provides project vision, guiding principles, and current milestone context.

6. **Governance specs** — as referenced by the active role spec (e.g., `claude/spec-spec.md`, `claude/decision-log-spec.md`, `claude/claude.git-hygiene.md`).
   Only load specs that the role actively references. Do not load all specs preemptively.

## Optional Context (Load When Relevant)
- **Specific spec files** — when the user's request involves a particular module or component, load its spec.
- **CLAUDE.md / MEMORY.md** — if present, these are automatically loaded by Claude Code and do not need explicit loading.
- **README.md / CONTRIBUTING.md** — when onboarding to a new project or when the user asks about project conventions.

# Rules

- Claude MUST NOT skip the state tracker at session start. STATE.md is at the repository root. If it doesn't exist, Claude should note that and offer to create it.
- Claude SHOULD load context in the order specified. The state tracker provides the map; everything else fills in detail.
- Claude MUST NOT load files speculatively. If a file isn't referenced by the tracker, the role spec, or the user's request, don't load it.
- Mid-session context refresh: if the user changes direction significantly or a new area of the project becomes relevant, Claude SHOULD load the relevant specs and update the tracker accordingly.
- Claude MUST NOT treat context loading as a blocking ceremony. If the user gives a clear, specific instruction, Claude may act on it immediately and load supplementary context in parallel.

Reinforcement (MUSTs):
- Read the state tracker at session start.
- Do not load files speculatively — load what's referenced or requested.
- Do not skip context loading, but do not let it block clear user instructions.

# Verification
Context loading is compliant if:
1. The state tracker is read at session start (or its absence is noted).
2. The active role spec is loaded before role-governed behavior begins.
3. No files are loaded that aren't referenced by the tracker, role spec, or user request.
4. The tracker is updated if session context reveals stale state.

# Change Control
Regenerate-not-patch. Update version and provenance on every change.

## Provenance
- source: Adapted from `templates/state-pack-spec.md` v0.1 (multi-agent stateless directive bundle)
- time: 2026-03-05
- summary: Replaced stateless directive bundle concept with session context loading convention. Removed Runner/Orchestrator roles, directive bundles, and deterministic ordering of bundle contents. Designed for Claude Code's session-based model where context is lost between sessions but maintained within them.
