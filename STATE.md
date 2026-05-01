# Project State — Switchboard

## Project Overview
Switchboard is a Slack-style multi-session terminal manager built for developers who run AI coding agents in parallel. Electron desktop app with React UI, xterm.js terminals. PTYs run on a standalone daemon process; the Electron client is a daemon client. Repository: `gits/switchboard`. Current phase: **Daemon (v3) complete — between milestones**.

## Active Work
- **Milestone:** Flow II (v4) — Sprint 16 complete, planning to pull Issue #32 ahead of Sprint 17.
- **Next up:** Issue #32 (persistent daemon: session restore on startup + user-level systemd service). Replay-buffer-history gap from PR #34 shares the same `session:replay-request` protocol surface. Sprints 17 (Tray & Notifications) and 18 (Templates & Groups) follow.

## Recent Completions
- Session-list IPC race fix (rc.6) — daemon-side sessions now hydrate as sidebar tabs on client open via `session.list()` poll alongside the broadcast subscription. Replay history for pre-existing sessions still missing — rolls into #32. PR #34 merged — 2026-05-01.
- Sprint 16: Queued Prompts — daemon-side queue with strict 0/1 per session, broadcast-to-all + reject-only-to-requester, persists to disk, fires on `needs-attention`. Idle-detector default regex relaxed (drop `^` anchor). PR #33 merged — 2026-04-30.
- Flow II planning — sprint files for 16/17/18 staged. PR #31 merged — 2026-04-23.
- Daemon pairings persist across client restarts (#26) — PR #29 merged — 2026-04-22.
- Sprint 15: Client Integration — local node-pty removed, localhost daemon auto-start, StatusBar daemon count — PR #27 merged — 2026-04-21.
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
| 3 | Daemon | completed |
| 4 | Flow II | in-progress |
| 5 | Intelligence | planned |

## Project Structure
- `claude/` — Role files and governance specs (including `github-issues-spec.md`).
- `specs/` — 20 specification files governing implementation.
- `decisions/` — Decision log.
- `sprints/core-mvp/` — 6 completed sprint files.
- `sprints/flow/` — 5 completed sprint files.
- `src/main/` — Electron main: main.ts, preload.ts, ipc-handlers.ts, connection-manager.ts (bridge to daemon), local-daemon.ts (child-process lifecycle), preferences-store.ts, notifications.ts.
- `src/renderer/` — React renderer: App.tsx, main.tsx, index.html.
- `src/renderer/components/` — TerminalPane, Sidebar, SessionTab, SortableSessionTab, Header, NewSessionModal, ContextMenu, PreferencesModal, StatusBar.
- `src/renderer/state/` — sessions.tsx, preferences.tsx (React context + reducer).
- `src/renderer/hooks/` — useKeyboardShortcuts.ts.
- `src/shared/` — types.ts, themes.ts, protocol.ts.
- `src/daemon/` — Standalone daemon: daemon.ts (entry), config.ts, pty-manager.ts, idle-detector.ts, output-buffer.ts, session-store.ts, transport.ts, auth.ts.
- `sprints/daemon/` — 4 sprint files (12–15), all complete.
- `sprints/flow-ii/` — 3 sprint files (16–18); 16 complete, 17–18 planned.
- `tests/` — 31 test files, 254 tests passing.

## Key Decisions
- DEC-000001: Retire v3 Intelligence; introduce v3 Daemon, v4 Flow II, v5 Intelligence. Daemon-first architecture to support remote sessions and session mobility.

## Open Questions
*(none)*

## Session Notes
Daemon (v3) complete and live-verified. Flow II (v4) underway: Sprint 16 (Queued Prompts) shipped daemon-side, broadcast-to-all + reject-only-to-requester with strict 0/1 per session, persisted to disk. Pivoted from initial client-local design after user identified cross-device + client-restart-continuity gaps in testing.

PR #34 (rc.6) fixed an IPC race where existing daemon sessions didn't hydrate as sidebar tabs on client open — `session:list` broadcast fired before renderer's listener attached. Renderer now polls `session.list()` on mount in addition to subscribing. Replay-buffer history for pre-existing sessions is still missing — daemon's `replay:*` only fires once per WS connect and is not re-requestable. That gap rolls into Issue #32, which is being pulled ahead of Sprint 17.

ROADMAP.md milestone 4 observables: queued prompts ✅, system tray (Sprint 17), templates + groups (Sprint 18), notification routing.
