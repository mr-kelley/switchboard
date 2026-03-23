---
title: User-Facing Documentation Specification
version: 0.1.0
maintained_by: Aire System Architect (ASA)
domain_tags: [system, governance, documentation]
status: draft
platform: claude-code
license: Apache-2.0
---

# Purpose
Define requirements for user-facing documentation in projects governed by the Aire system. Specs document what we're building (for Claude and the developer). Decision logs document why we chose what we chose (for audit and continuity). This spec governs the third leg: documentation for the people who *use* the software.

User-facing docs are not optional. Software without documentation is incomplete.

# Scope

## Covers
- Required documentation types and when each applies.
- Documentation quality standards.
- Documentation maintenance rules.
- Spec index (table of contents for specs, aiding AI navigation).

## Does Not Cover
- Spec content or structure (governed by `claude/spec-spec.md`).
- Decision log content (governed by `claude/decision-log-spec.md`).
- Inline code comments (governed by code style conventions).

# Documentation Types

## README.md (Always Required)
Every project MUST have a README.md at the repository root. It is the front door.

Required content:
- **Project name and description**: what this is and who it's for.
- **Installation / setup**: how to get it running.
- **Basic usage**: the minimum a user needs to start using it.
- **License**: or a pointer to LICENSE.

The README should be useful to someone encountering the project for the first time. It is not a comprehensive manual — it's a starting point that links to deeper docs.

## HOWTO / Guides (When applicable)
Task-oriented documentation: "How to do X." Written from the user's perspective, organized by goal.

Applies when:
- The project has more than one primary use case.
- Setup or usage involves multi-step processes.
- Users need to integrate the project with other tools or systems.

Location: `docs/howto/` or `docs/guides/`, one file per topic.

## Reference Documentation (When applicable)
Comprehensive, structured documentation of interfaces: CLI commands, API endpoints, configuration options, file formats.

Applies when:
- The project has a CLI with more than a few commands.
- The project exposes an API (HTTP, library, or otherwise).
- Configuration is non-trivial.

Formats (choose what fits the project):
- **Manpages**: appropriate for CLI tools distributed on Unix systems.
- **Web docs**: appropriate for web services, libraries, or projects with a web presence.
- **Markdown reference**: appropriate as a baseline for any project. Lives in `docs/reference/`.

## HACKING.md (Optional)
Developer-oriented documentation for humans who want to contribute to or understand the codebase. Useful for open-source projects or projects where human developers work alongside AI.

Content (when present):
- Architecture overview (high-level, not duplicating specs).
- How to run tests.
- How to add a new feature (the workflow).
- Where to find things (directory conventions).
- Any tribal knowledge that isn't captured elsewhere.

Note: In Aire-governed projects, specs carry most of the "how the code works" information. HACKING.md is for the human-centric view — the stuff that's hard to get from reading specs alone.

# Spec Index

## Purpose
A table of contents for all specs in the project. Helps Claude (and humans) locate specs without searching. Maintained as specs are created, moved, or deleted.

## File Location
`specs/INDEX.md`

## Required Content
- List of all spec files with:
  - Path (relative to repo root).
  - Title.
  - One-line description.
  - Status (draft/stable/deprecated).
- Organized by domain or directory structure.

## Rules
- Claude MUST update `specs/INDEX.md` when creating, renaming, moving, or deleting a spec.
- The index MUST be sorted deterministically (by path, ascending).
- The index is derived from the actual spec files — if the index and a spec disagree, the spec is authoritative.

# Documentation Quality Standards

- **Audience-appropriate**: user docs are for users, not for Claude. Write for the person who will use the software, not the agent that built it.
- **Accurate**: documentation MUST match current behavior. Outdated docs are worse than no docs.
- **Concise**: say what needs to be said, then stop. Users scan docs; they don't read novels.
- **Tested examples**: code examples in docs SHOULD be tested or derived from tested code. An example that doesn't work is a bug.
- **Maintained**: docs are updated when behavior changes. This is part of the sprint deliverables, not an afterthought.

# Documentation as a Completion Requirement

- A sprint that delivers user-visible functionality MUST include documentation updates in its deliverables.
- A feature is not complete until its documentation is written or updated.
- Documentation updates are part of the sprint acceptance criteria, alongside passing tests.

Reinforcement (MUSTs):
- README.md exists for every project.
- User-visible features include documentation in sprint deliverables.
- Spec index is maintained as specs change.
- Documentation matches current behavior.

# When to Create What

| Project State | Documentation Required |
|---|---|
| Any project | README.md, specs/INDEX.md |
| CLI tool | + manpage or CLI reference |
| Library / API | + API reference docs |
| Multi-use-case project | + HOWTO / guides |
| Web service | + web docs or API reference |
| Open source / collaborative | + HACKING.md |

Claude SHOULD propose the appropriate documentation set during project planning (NORTHSTAR.md / ROADMAP.md phase) based on the project type. Documentation milestones should appear in the roadmap.

# Change Control
Regenerate-not-patch. Update version and provenance on every change.
