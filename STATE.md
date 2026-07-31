# Project State — Switchboard

## Project Overview
Switchboard is a Slack-style multi-session terminal manager built for developers who run AI coding agents in parallel. Electron desktop app with React UI, xterm.js terminals. PTYs run on a standalone daemon process; the Electron client is a daemon client. Repository: `gits/switchboard`. Current phase: **Flow II (v4) complete; between milestones (v6 Fleet next, blocked on GH issue)**.

## Active Work
- **Milestone:** Fleet (v6).
- **In progress:** Sprint 21 (Issue #47) — remote daemon provisioning over SSH — implementation complete on `stage/test/sprint-21-remote-provisioning`, version bumped to 0.5.0-rc.1. All 10 steps of the state machine implemented, `dist:daemon-tarball` build script produces a 176 KB installable artifact, `RemoteProvisioningModal` renders the form + live progress + retry-from-step. 352/352 tests pass (+22 for ssh-client / remote-provisioner / modal). Governed by `ssh-client-spec.md`, `remote-provisioner-spec.md`, `RemoteProvisioningModal-spec.md`, DEC-000007, DEC-000008.
- **Awaiting:** Live end-to-end verification against a fresh Ubuntu 24.04 VM (Node ≥ 20, systemd --user, SSH key auth). Expected: from clicking "Install & pair" to a paired daemon in the sidebar in ~60s. Cross-group session drag from Sprint 20 becomes exercisable once a second host is paired.

## Recent Completions
- Sprint 21 plan (v6 Fleet Sprint 1): `sprints/fleet/21-remote-daemon-provisioning.md` drafted, `BACKLOG.md` v6 row 1 linked to Issue #47. PR #48 merged — 2026-07-31.
- rc.12: retire `.deb` and `.snap` electron-builder targets; AppImage is sole Linux distribution. DEC-000006. PR #46 merged — 2026-07-31.
- rc.11: AppImage desktop integration — `src/main/desktop-install.ts` writes `~/.local/share/applications/switchboard.desktop` + hicolor icons on first launch under `$APPIMAGE`, idempotent, self-updating on path change. Preferences → Daemons → Desktop integration exposes an Uninstall action (verified identical to manual `rm`). `--no-sandbox` set programmatically via `app.commandLine.appendSwitch` on Linux so it applies uniformly across launch paths. PR #45 merged — 2026-07-31. DEC-000005.
- rc.10: window-icon fix — embed `build/icon.png` as a base64 data URL and pass it to `BrowserWindow` via `nativeImage`. Only helps on X11 (Wayland ignores per-window icons); rc.11 handles Wayland. PR #44 merged — 2026-07-31.
- v6 Fleet milestone added to ROADMAP + BACKLOG (remote daemon provisioning surfaced during Flow II live-test — existing pairing flow assumes a pre-installed daemon). PR #43 merged (`a6fba3b`) — 2026-05-29.
- Sprint 19 (System Tray & Notification Routing) + Sprint 20 (Session Templates & Groups) bundled — tray icon with attention badge, per-session notification priority (silent/normal/high), hide-to-tray + Ctrl+Q, session templates modal, session groups with collapse and cross-group drag. Preferences persistence gained an open-map merge rule (DEC-000004). Bundled on one PR per DEC-000002. PR #42 merged (`85b7f41`) — 2026-05-29. Live-verified on Ubuntu 24.04 GNOME 2026-07-31 (see Active Work for coverage caveats).
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
| 4 | Flow II | completed |
| 5 | Intelligence | planned |
| 6 | Fleet | planned |

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
- DEC-000005: AppImage first-launch desktop integration — self-installs `~/.local/share/applications/switchboard.desktop` (with `--no-sandbox`) and hicolor icons; idempotent, self-updating on path change; explicit Preferences uninstall for reversibility. AppImage becomes the single Linux format (rc.12 retires .deb + .snap).
- DEC-000006: Retire `.deb` and `.snap` electron-builder targets — AppImage is the sole Linux distribution from rc.12 onward. Self-install (DEC-000005) covers desktop integration; no distro-specific packaging maintenance.
- DEC-000007: SSH transport for remote provisioning — shell out to system `ssh`/`scp` via `execFile` with strict arg arrays (not an embedded npm SSH lib). Reuses user's existing SSH agent/keys/config.
- DEC-000008: Daemon distributable shape — gzip tarball (~176 KB) with bundled `ws` + `node-pty` (linux-x64 prebuild); assumes Node 20 on target. Not a standalone binary in v1.

## Open Questions
- Issue #38: `OutputBuffer` line-based storage corrupts PTY byte streams — replay-on-demand is broken for TUI output (watch/vim/less/claude). Three compounding bugs: split/join injects spurious newlines at chunk boundaries, line-eviction strips initial state-setting escape codes, and replay races with live `session:data`. Fix is a byte-based buffer + renderer-side replay queue — sized as its own sprint. Queued (not yet scheduled).
- Issue #40: systemd service installer does not support AppImage builds. AppImages mount at ephemeral `/tmp/.mount_*` paths systemd cannot resolve after the GUI exits, so `ExecStart` goes stale on next launch. Sprint 18 ships safe-by-refusal (install button hidden + IPC rejects when `$APPIMAGE` is set). Proper-fix options: a `--daemon-only` launch flag using `$APPIMAGE`, staging the daemon to a stable location, or a separate `sb-daemon` binary. Enhancement, not yet scheduled.
- Issue #32 (persistent daemon + service install) has both parts shipped (Sprint 17 + 18). Closed 2026-05-29 referencing #36/#39; AppImage gap tracked separately as #40.
- Housekeeping (revisit later): Recent Completions has grown to ~28 items, well over the state-tracker spec's ~10 guideline. Trim to the last ~10 in a dedicated pass, leaning on git history as the long-term record.
- Cross-group drag and Move-to-group submenu are the only Sprint 19/20 features not yet live-verified — blocked pending v6 remote-daemon provisioning (only one daemon = only one group). Everything else in Sprint 19/20 verified on Ubuntu 24.04 GNOME 2026-07-31.
- Spec drift resolved (2026-05-29): `ipc-handlers-spec.md` (v0.4.0) and `preload-spec.md` (v0.4.0) regenerated for the daemon-client architecture (full current IPC surface), and the README Architecture section updated to the daemon/client tree. No known remaining drift in the main-process IPC surface.

## Session Notes
Flow II (v4) complete and live-verified on Ubuntu 24.04 GNOME 2026-07-31. Post-Flow-II packaging work: rc.10 (window icon via nativeImage, PR #44) → rc.11 (AppImage self-install of `.desktop` + hicolor icons, PR #45) → rc.12 (retire `.deb` + `.snap`, this PR). Both manual and in-app uninstall verified identical. AppImage is now the sole Linux distribution. Open issues #38 (OutputBuffer byte-stream corruption) and #40 (AppImage systemd service) remain unscheduled — neither blocks the current release cadence.

ROADMAP.md milestone 4 observables: queued prompts ✅, persistent daemon (Sprint 17 ✅, systemd installer Sprint 18 ✅), system tray ✅ (Sprint 19, live-verified), notification routing ✅ (Sprint 19, live-verified), templates ✅ + groups ⚠ (Sprint 20 — cross-host drag pending v6). Flow II done; next milestone is v6 Fleet Sprint 1 (remote daemon provisioning) once its GitHub issue is filed.
