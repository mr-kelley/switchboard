# Project State — Switchboard

## Project Overview
Switchboard is a Slack-style multi-session terminal manager built for developers who run AI coding agents in parallel. Electron desktop app with React UI, xterm.js terminals, and node-pty backend. Repository: `gits/switchboard`. Current phase: **Daemon (v3) — Sprint 15 pending**.

## Active Work
- **Milestone:** Daemon (v3) — Sprints 12–14 complete; pairing flow and UI integration complete; live-verified 2026-04-21.
- **Next sprint:** Sprint 15 (Client Integration) — remove direct node-pty from Electron so all sessions (including localhost) are daemon-managed.

## Recent Completions
- Pairing flow live-verified end-to-end (workstation ↔ daemon on VM) — 2026-04-21.
- Sprint 14: Client connection manager — commit `1ed9207` — 2026-04-20.
- Sprint 13: Daemon transport (WebSocket+TLS, auth) — commit `1c8a543` — 2026-04-20.
- Sprint 12: Daemon core (protocol, PTY mgr, output buffer, idle detector, session store) — commit `5c83250` — 2026-04-19.
- 6-digit pairing flow + Preferences Daemons section + New Session host selector — commits `41ed2ee`, `edb77a0`, `23c93a9`, `51670b3`.
- Daemon architecture spec — PR #24 merged — 2026-04-06.
- Daemon architecture planning — NORTHSTAR, ROADMAP, BACKLOG updated — PR #23 merged — 2026-04-06.
- UX bugfixes (Ctrl+Tab, font scaling, transparency removal, file browse, unread badge, mouse clicks, background images) — PR #1 merged — 2026-03-26.
- GitHub Issues governance spec and role update — PR #11 merged — 2026-03-26.
- Backlog created from NORTHSTAR/ROADMAP reconciliation — 2026-03-26.
- Sprint 11: Extras (unread badges, search, CSS, status bar) — commit `03dc381` — 2026-03-24.
- Sprint 10: Full GUI Customization — commit `47cde08` — 2026-03-24.
- Sprint 09: Keyboard Shortcuts — commit `7f21e40` — 2026-03-24.
- Sprint 08: Tab Reordering — commit `1a6e17a` — 2026-03-24.
- Sprint 07: Preferences Infrastructure — commit `37dd482` — 2026-03-24.
- Sprint 06: Session Persistence & Notifications — commit `4a8df56` — 2026-03-23.
- Sprint 05: Idle Detection & Status Indicators — commit `380971e` — 2026-03-23.
- Sprint 04: Sidebar & Session Tabs — commit `402b049` — 2026-03-23.
- Sprint 03: Terminal Pane (xterm.js) — commit `e22b41f` — 2026-03-23.
- Sprint 02: PTY Session Manager — commit `9c1eb6f` — 2026-03-23.
- Sprint 01: Electron Shell & Project Skeleton — commit `394b953` — 2026-03-23.

## Milestones
| # | Name | Status |
|---|------|--------|
| 1 | Core MVP | completed |
| 2 | Flow | completed |
| 3 | Daemon | in progress |
| 4 | Flow II | planned |
| 5 | Intelligence | planned |

## Project Structure
- `claude/` — Role files and governance specs (including `github-issues-spec.md`).
- `specs/` — 20 specification files governing implementation.
- `decisions/` — Decision log.
- `sprints/core-mvp/` — 6 completed sprint files.
- `sprints/flow/` — 5 completed sprint files.
- `src/main/` — Electron main process: main.ts, preload.ts, session-manager.ts, ipc-handlers.ts, idle-detector.ts, session-store.ts, preferences-store.ts, notifications.ts.
- `src/renderer/` — React renderer: App.tsx, main.tsx, index.html.
- `src/renderer/components/` — TerminalPane, Sidebar, SessionTab, SortableSessionTab, Header, NewSessionModal, ContextMenu, PreferencesModal, StatusBar.
- `src/renderer/state/` — sessions.tsx, preferences.tsx (React context + reducer).
- `src/renderer/hooks/` — useKeyboardShortcuts.ts.
- `src/shared/` — types.ts, themes.ts.
- `src/daemon/` — Standalone daemon: daemon.ts (entry), config.ts, pty-manager.ts, idle-detector.ts, output-buffer.ts, session-store.ts, transport.ts, auth.ts.
- `src/main/connection-manager.ts` — Client-side bridge to daemon(s).
- `sprints/daemon/` — 4 sprint files (12–15); 12–14 complete, 15 pending.
- `tests/` — 30 test files, 251 tests passing.

## Key Decisions
- DEC-000001: Retire v3 Intelligence; introduce v3 Daemon, v4 Flow II, v5 Intelligence. Daemon-first architecture to support remote sessions and session mobility.

## Open Questions
*(none)*

## Session Notes
Daemon (v3) architecture planned and largely built. Client-server split: standalone daemon process manages PTYs on any host; Electron client connects via WebSocket + TLS. All original backlog items (B-01 through B-09) reassigned to v4 (client UX) and v5 (intelligence, daemon-side). GitHub Issues #21 and #22 solved structurally by daemon design. Five bug issues (#13, #14, #15, #16, #20) assigned to collaborator LachrymaGhost.

Sprints 12–14 implemented the daemon core, transport, and client connection manager. A 6-digit pairing flow (like Bluetooth pairing) was added on top to replace manual connection-string copy-paste. Live-tested 2026-04-21: workstation client paired with daemon on VM (10.0.0.153:3717), created session, bidirectional I/O confirmed.

Sprint 15 (Client Integration) remains: remove the local node-pty fallback path so the client is always a daemon client — this is the roadmap observable "All sessions — including localhost — are daemon-managed."
