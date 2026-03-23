# Project State — Switchboard

## Project Overview
Switchboard is a Slack-style multi-session terminal manager built for developers who run AI coding agents in parallel. Electron desktop app with React UI, xterm.js terminals, and node-pty backend. Repository: `gits/switchboard`. Current phase: **Core MVP complete**.

## Active Work
No active work. Core MVP milestone is complete. Next milestone: Flow (v2).

## Recent Completions
- Sprint 06: Session Persistence & Notifications — commit `4a8df56` — 2026-03-23.
- Sprint 05: Idle Detection & Status Indicators — commit `380971e` — 2026-03-23.
- Sprint 04: Sidebar & Session Tabs — commit `402b049` — 2026-03-23.
- Sprint 03: Terminal Pane (xterm.js) — commit `e22b41f` — 2026-03-23.
- Sprint 02: PTY Session Manager — commit `9c1eb6f` — 2026-03-23.
- Sprint 01: Electron Shell & Project Skeleton — commit `394b953` — 2026-03-23.

## Project Structure
- `claude/` — Role files and governance specs.
- `specs/` — 13 specification files governing implementation.
- `decisions/` — Decision log (no decisions logged yet).
- `sprints/core-mvp/` — 6 completed sprint files.
- `src/main/` — Electron main process: main.ts, preload.ts, session-manager.ts, ipc-handlers.ts, idle-detector.ts, session-store.ts, notifications.ts.
- `src/renderer/` — React renderer: App.tsx, main.tsx, index.html.
- `src/renderer/components/` — TerminalPane, Sidebar, SessionTab, Header, NewSessionModal, ContextMenu.
- `src/renderer/state/` — sessions.tsx (React context + reducer).
- `src/shared/` — Shared types (SwitchboardAPI, SessionInfo, etc.).
- `tests/` — 14 test files, 99 tests passing.

## Key Decisions
*(none logged — all choices were Class A)*

## Open Questions
*(none)*

## Session Notes
Core MVP milestone complete. All 6 sprints delivered and promoted to main. 99 tests passing across 14 test files. Ready for user testing or to begin Flow (v2) milestone.
