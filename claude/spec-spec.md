---
title: Specification Structure Standard
version: 0.2.0
maintained_by: Aire System Architect (ASA)
domain_tags: [system, governance, specs]
status: draft
platform: claude-code
license: Apache-2.0
---

# Purpose
Define the canonical structure, required fields, and behavioral clarity rules for all project specification files. Specs are the primary source of truth for what software should do. Implementation follows specs, not the other way around.

This standard applies to every spec used to design, implement, or validate software in a project governed by the Aire system.

# Scope

## Covers
- Required structure and sections for all spec files.
- Behavioral declaration rules (what must be made explicit).
- Spec-first development principles.
- Spec-to-implementation mapping conventions.

## Does Not Cover
- Content of individual specs (each spec owns its domain).
- Test frameworks or CI tooling (specs define *what* to test, not *how*).
- Role definitions (governed by `claude.role.base.md`).

# Spec-First Development

Specs are written before implementation. This is not a suggestion — it is a structural requirement of the Aire system.

**Why spec-first:**
- Specs force clarity of intent before code is written. Ambiguity surfaces during spec writing, not during debugging.
- Specs make Claude's work auditable. The user can review what Claude intends to build before Claude builds it.
- Specs prevent scope drift. If it's not in the spec, it's not in the implementation.
- Specs survive sessions. Code without a spec relies on conversation history that disappears.

**Rules:**
- Claude MUST NOT begin implementation of a new module, feature, or component without a governing spec.
- If a spec doesn't exist for the target work, Claude MUST create one (or propose one for user review) before writing implementation code.
- Modifying existing behavior requires checking and updating the governing spec first. Code changes that contradict the spec are bugs, not features.
- The user MAY waive spec-first for trivial changes (typo fixes, formatting, one-line bug fixes). Claude should use judgment — if the change affects behavior, it needs a spec.

Reinforcement (MUSTs):
- No implementation without a governing spec.
- Create specs before code when none exist.
- Update specs before (or alongside) behavior changes.
- Spec and implementation must agree; disagreement is a defect.

# Spec-to-Implementation Mapping

Every implementation file under `src/` (or the project's equivalent source directory) MUST have a corresponding spec.

**Mapping convention:**
- Spec location: `specs/` directory, mirroring the source path.
- Naming: source filename with a `-spec.md` suffix.
- Example: `src/auth/token.py` → `specs/src/auth/token-spec.md`

**Generalized specs** (covering multiple files or cross-cutting concerns) are allowed but they supplement per-file specs — they never replace them. Generalized specs should be documented in a spec index or README within `specs/`.

**When mapping doesn't apply:**
- Configuration files, build scripts, and generated code do not require per-file specs.
- Test files do not require their own specs (they are *governed by* the spec of the code they test).
- Specs themselves do not require specs (this document is the meta-spec).

## Spec-to-Test Mapping

Parallel to spec-per-file, every spec that defines testable behavior MUST have corresponding tests.

**Mapping convention:**
- Test location: `tests/` directory, mirroring the source path.
- Naming: source filename with a test prefix/suffix per the project's test framework convention.
- Example: `src/auth/token.py` → `tests/auth/test_token.py`

**Rules:**
- The spec's Test Strategy section defines what tests are needed. The test files implement them.
- A spec without tests (when the spec defines testable behavior) is incomplete work — same as code without a spec.
- Tests are written as part of implementation, not after. Spec-first naturally extends to test-first: the spec defines what to test, the tests verify the spec, the implementation satisfies both.

## Spec Index

All projects MUST maintain a spec index at `specs/INDEX.md`. See `claude/documentation-spec.md` for the spec index format and maintenance rules.

The spec index helps Claude locate specs without directory traversal and gives humans an overview of what's been specified.

Reinforcement (MUSTs):
- Maintain spec-per-file mapping for source code.
- Maintain spec-to-test mapping for testable specs.
- Generalized specs supplement but never replace per-file specs.
- Document all specs in the spec index.
- Every implementation spec includes a Test Strategy section.

# Required Sections for All Spec Files

Each spec MUST include the following:

1. **YAML Header**
   Every spec begins with:
   ```yaml
   ---
   title: <spec title>
   version: <semver>
   maintained_by: <owner>
   domain_tags: [<tags>]
   status: draft | stable | deprecated
   platform: claude-code
   license: <license>
   ---
   ```

2. **Purpose**
   Why this spec exists. What it governs. One to three sentences.

3. **Scope**
   What the spec covers and what it explicitly does not cover.

4. **Inputs**
   What the specified artifact expects: arguments, configuration, files, messages, environment.

5. **Outputs**
   What the artifact produces: return values, files, side effects, messages.

6. **Responsibilities**
   Behavioral rules, logic boundaries, and functional scope. This is the core of the spec — what the implementation MUST do.

7. **Edge Cases / Fault Handling**
   Expected behavior under invalid input, timeouts, missing dependencies, and system faults.

8. **Test Strategy**
   What tests are required for this artifact. This is not optional — every implementation spec MUST define its test strategy. Include:
   - What kinds of tests are needed (unit, integration, end-to-end).
   - What behaviors the tests must verify (derived from Responsibilities and Edge Cases).
   - Where the test files live (following the spec-to-test mapping convention below).
   If a spec genuinely requires no tests (e.g., a pure documentation spec), it MUST state "Tests: N/A" with justification. The absence of a Test Strategy section is a spec defect, not a signal that tests are unnecessary.

9. **Completion Criteria**
   The explicit conditions that signal the implementation is done and correct. Completion criteria MUST include "relevant tests pass" unless the spec explicitly declares Tests: N/A.

# Behavioral Declarations

Specs MUST explicitly declare operational behaviors that would otherwise be assumed or guessed. Implicit behavior is a spec defect.

Required declarations (when applicable):
- Serialization formats (JSON, YAML, Markdown, binary).
- Connection and session models.
- Message lifecycle and ordering expectations.
- Retry and timeout behavior.
- Error handling and recovery strategies.
- Runtime configuration (ports, paths, CLI arguments, environment variables).
- Concurrency model (if relevant).

If a required behavior is missing from a spec, Claude MUST flag it and amend the spec before implementing. Guessing critical behaviors is not permitted.

Reinforcement (MUSTs):
- Declare all operational behaviors explicitly.
- Flag and amend missing behavioral declarations before implementing.
- Never guess critical behaviors.

# Optional Sections
- Diagrams or message flow charts.
- References to related specs.
- Links to relevant tests.
- Version history or migration notes.
- Additional metadata in the YAML header.

# Compliance

- Every new or regenerated spec MUST conform to this structure.
- Omissions from the required sections MUST be justified (e.g., "Inputs: N/A — this is a pure output artifact").
- Spec compliance is a gate for implementation: code that lacks a compliant governing spec is incomplete work.

Reinforcement (MUSTs):
- All specs conform to this structure.
- Justify any omissions from required sections.
- Spec compliance gates implementation.

# Change Control
Regenerate-not-patch. Update version and provenance on every change.

## Provenance
- source: Adapted from `templates/spec-spec.md` v0.1 (multi-agent, Architect-delegated model)
- time: 2026-03-05
- summary: Adapted for Claude Code single-agent + human model. Added spec-first development principles and rationale. Added spec-to-implementation mapping section. Removed Architect/implementer delegation language. Strengthened behavioral declaration requirements.
