# Project State — Switchboard

## Project Overview
Switchboard is a Slack-style multi-session terminal manager built for developers who run AI coding agents in parallel. Electron desktop app with React UI, xterm.js terminals. PTYs run on a standalone daemon process; the Electron client is a daemon client. Repository: `gits/switchboard`. Current phase: **Daemon (v3) complete — between milestones**.

## Active Work
- **Milestone:** Flow II (v4) — Sprint 17 complete (Part 1 of Issue #32). Sprint 18 next: user-level systemd service installer (Part 2 of Issue #32).
- **Next up:** Sprint 18 (systemd user service), then Sprint 19 (Tray & Notifications), Sprint 20 (Templates & Groups).

## Recent Completions
- Sprint 17: Persistent daemon — boot-time session restore (stable ids across restart) + on-demand replay via `session:replay-request`. Closes Part 1 of Issue #32 and the rc.6 replay-history gap. Live-verified on VM: session respawned with same id after SIGTERM/restart, sidebar tab hydrated, idle indicator correct. PR #36 merged — 2026-05-22.
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
- `sprints/flow-ii/` — 5 sprint files (16–20); 16–17 complete, 18–20 planned.
- `tests/` — 32 test files, 262 tests passing.

## Key Decisions
- DEC-000001: Retire v3 Intelligence; introduce v3 Daemon, v4 Flow II, v5 Intelligence. Daemon-first architecture to support remote sessions and session mobility.

## Open Questions
- Issue #38: `OutputBuffer` line-based storage corrupts PTY byte streams — replay-on-demand is broken for TUI output (watch/vim/less/claude). Three compounding bugs: split/join injects spurious newlines at chunk boundaries, line-eviction strips initial state-setting escape codes, and replay races with live `session:data`. Fix is a byte-based buffer + renderer-side replay queue — sized as its own sprint. Queued post-Sprint 18.

## Session Notes
Daemon (v3) complete and live-verified. Flow II (v4) underway. Sprint 16 (Queued Prompts) shipped daemon-side with broadcast-to-all + reject-only-to-requester semantics. Sprint 17 (Persistent Daemon — Part 1 of Issue #32) shipped: boot-time restore reconstructs sessions from `sessions.json` with stable ids so per-session buffer paths remain valid across restart; `session:replay-request` is a new client→daemon message the renderer fires on mount, closing the rc.6 replay-history gap for pre-existing sessions. Note: PTYs themselves don't survive daemon restart — only metadata + scrollback do; respawned sessions get a fresh shell.

ROADMAP.md milestone 4 observables: queued prompts ✅, persistent daemon (Sprint 17 ✅, systemd installer Sprint 18), system tray (Sprint 19), templates + groups (Sprint 20), notification routing.
