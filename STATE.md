# Project State — Switchboard

## Project Overview
Switchboard is a Slack-style multi-session terminal manager built for developers who run AI coding agents in parallel. Electron desktop app with React UI, xterm.js terminals, and node-pty backend. Repository: `gits/switchboard`. Current phase: **Core MVP development**.

## Active Work
- **Sprint 02: PTY Session Manager** — `sprints/core-mvp/02-pty-session-manager.md`. Status: planned (next up).

### Active Milestone
Core MVP — see `ROADMAP.md`

### Active Sprint
`sprints/core-mvp/02-pty-session-manager.md` (planned, next up)

## Recent Completions
- Sprint 01: Electron Shell & Project Skeleton — commit `394b953` on `main` — 2026-03-23.
- Project initialization and planning artifacts — commit `3087e33` — 2026-03-23.

## Project Structure
- `claude/` — Role files and governance specs.
- `specs/` — Specification files (spec-per-file mapping to `src/`).
- `decisions/` — Decision log (append-only JSON events).
- `sprints/` — Sprint planning files.
- `src/main/` — Electron main process (main.ts, preload.ts).
- `src/renderer/` — React renderer (App.tsx, main.tsx, index.html).
- `src/shared/` — Shared types (types.ts).
- `tests/` — Test suites (main/, renderer/).

## Key Decisions
*(none yet)*

## Open Questions
*(none yet)*

## Session Notes
Sprint 01 complete. Electron shell with React renderer, preload script, security config, and 14 passing tests. Promoted to main via stage/test. Ready for Sprint 02 (PTY Session Manager).
