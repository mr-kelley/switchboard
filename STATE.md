# Project State — Switchboard

## Project Overview
Switchboard is a Slack-style multi-session terminal manager built for developers who run AI coding agents in parallel. Electron desktop app with React UI, xterm.js terminals. PTYs run on a standalone daemon process; the Electron client is a daemon client. Repository: `gits/switchboard`. Current phase: **Flow II (v4) — in progress**.

## Active Work
- **Milestone:** Flow II (v4) — feature-complete. Sprint 19 (System Tray & Notification Routing) + Sprint 20 (Session Templates & Groups) implemented and bundled on `stage/test/sprint-19-20-tray-and-organization` (v0.4.0-rc.9, 319 tests passing). Bundling two sprints on one branch/PR is a deliberate deviation from the 1:1 sprint-branch rule — see DEC-000002.
- **Awaiting:** PR review/merge + live GUI verification on the VM (built headless) of cross-group drag-and-drop and tray/minimize-to-tray behavior.

## Recent Completions
- Sprint 18: systemd user-service installer — install the localhost daemon as a `systemd --user` service from Preferences → Daemons so it survives client close; client detects an installed+running service and skips the child spawn. `systemd-installer.ts` wraps `systemctl --user` with strict `execFile` arg arrays. Ships safe-by-refusal on AppImage (ephemeral mount paths systemd can't resolve — see Issue #40). Closes Part 2 of Issue #32. PR #39 merged (`1a2a367`) — 2026-05-22.
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
- `specs/` — specification files governing implementation (see `specs/INDEX.md`).
- `decisions/` — Decision log.
- `sprints/core-mvp/` — 6 completed sprint files.
- `sprints/flow/` — 5 completed sprint files.
- `src/main/` — Electron main: main.ts, preload.ts, ipc-handlers.ts, connection-manager.ts (bridge to daemon + attention summary), local-daemon.ts (child-process + service-managed lifecycle), systemd-installer.ts (systemctl --user wrapper), tray.ts + tray-icons.ts (system tray), preferences-store.ts, notifications.ts.
- `src/renderer/` — React renderer: App.tsx, main.tsx, index.html.
- `src/renderer/components/` — TerminalPane, Sidebar (groups + dnd), SessionTab, SortableSessionTab, Header, NewSessionModal, ManageTemplatesModal, ContextMenu (submenu), PreferencesModal, StatusBar.
- `src/renderer/state/` — sessions.tsx, preferences.tsx (React context + reducer).
- `src/renderer/hooks/` — useKeyboardShortcuts.ts.
- `src/shared/` — types.ts, themes.ts, protocol.ts.
- `src/daemon/` — Standalone daemon: daemon.ts (entry), config.ts, pty-manager.ts, idle-detector.ts, output-buffer.ts, session-store.ts, transport.ts, auth.ts.
- `sprints/daemon/` — 4 sprint files (12–15), all complete.
- `sprints/flow-ii/` — 5 sprint files (16–20), all complete.
- `tests/` — 37 test files, 319 tests passing.

## Key Decisions
- DEC-000001: Retire v3 Intelligence; introduce v3 Daemon, v4 Flow II, v5 Intelligence. Daemon-first architecture to support remote sessions and session mobility.
- DEC-000002: Permit bundling closely related non-daemon UX sprints onto one branch/PR (git-hygiene v0.2.1 exception); applied to Sprints 19+20.
- DEC-000003: System tray design — minimize-to-tray with quit-on-close fallback, embedded badged tray icons, per-session notification priority (high/normal/silent).
- DEC-000004: Preferences open-map persistence — empty-default `{}` prefs adopt saved values wholesale in deepMerge (fixes notificationPriorities/sessionGroups/shortcuts persistence).

## Open Questions
- Issue #38: `OutputBuffer` line-based storage corrupts PTY byte streams — replay-on-demand is broken for TUI output (watch/vim/less/claude). Three compounding bugs: split/join injects spurious newlines at chunk boundaries, line-eviction strips initial state-setting escape codes, and replay races with live `session:data`. Fix is a byte-based buffer + renderer-side replay queue — sized as its own sprint. Queued (not yet scheduled).
- Issue #40: systemd service installer does not support AppImage builds. AppImages mount at ephemeral `/tmp/.mount_*` paths systemd cannot resolve after the GUI exits, so `ExecStart` goes stale on next launch. Sprint 18 ships safe-by-refusal (install button hidden + IPC rejects when `$APPIMAGE` is set). Proper-fix options: a `--daemon-only` launch flag using `$APPIMAGE`, staging the daemon to a stable location, or a separate `sb-daemon` binary. Enhancement, not yet scheduled.
- Issue #32 (persistent daemon + service install) has both parts shipped (Sprint 17 + 18). Closed 2026-05-29 referencing #36/#39; AppImage gap tracked separately as #40.
- Housekeeping (revisit later): Recent Completions has grown to ~28 items, well over the state-tracker spec's ~10 guideline. Trim to the last ~10 in a dedicated pass, leaning on git history as the long-term record.
- Live verification needed (Sprint 19/20): cross-group drag-and-drop and tray/minimize-to-tray were built headless. Verify on the VM: tray badge count + click-to-focus, close-hides-to-tray + Ctrl+Q quit, notification priorities, template prefill/save, group collapse + dnd within/across groups.
- Spec drift (pre-existing, daemon migration): `ipc-handlers-spec.md` and `preload-spec.md` still describe the pre-daemon architecture (SessionManager/IdleDetector internal) and the README Architecture section is pre-daemon. New Sprint 19 channels were added for traceability, but a full reconciliation pass is owed. Not scheduled.

## Session Notes
Sprints 19 + 20 implemented and bundled on `stage/test/sprint-19-20-tray-and-organization` (v0.4.0-rc.9, 319 tests). Sprint 19: system tray with live needs-attention badge (embedded icon variants), minimize-to-tray with quit-on-close fallback when no tray host, and per-session notification priority (high/normal/silent) via a context submenu + new `session:set-priority` IPC; required a deepMerge fix so empty-default preference maps persist (DEC-000004). Sprint 20: session templates (New Session dropdown + save + ManageTemplatesModal) and collapsible session groups (host-default + custom) with cross-group dnd (dnd-kit multi-container) and a Move-to-group submenu. New branding: app icon adopted from LogoIcon.png (centered crop). Governance: bundling these two UX sprints is a logged deviation (DEC-000002, git-hygiene v0.2.1). Cross-group dnd and tray behavior need live GUI verification on the VM. Open issues #38 (OutputBuffer) and #40 (AppImage service) remain unscheduled.

ROADMAP.md milestone 4 observables: queued prompts ✅, persistent daemon (Sprint 17 ✅, systemd installer Sprint 18 ✅), system tray ✅ (Sprint 19, pending live verify), notification routing ✅ (Sprint 19), templates + groups ✅ (Sprint 20, pending live verify). Flow II feature-complete pending merge + verification.
