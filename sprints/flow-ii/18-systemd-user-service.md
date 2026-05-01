---
sprint: 18
title: Systemd User Service for Localhost Daemon
milestone: Flow II
status: planned
---

# Goal
Decouple the localhost daemon from the client lifecycle entirely. Today the daemon is spawned as a child of the Electron main process; closing the client takes the daemon (and all its sessions) with it. With Sprint 17, sessions can be respawned from disk on relaunch — but the *processes themselves* are still terminated.

The fix: install the daemon as a `systemd --user` service, managed from within the app. Once installed, the client connects to a long-lived daemon instead of spawning one. Linux only for v1.

This sprint resolves Part 2 of Issue #32.

# Design

## Service installer
- **Location**: new `src/main/systemd-installer.ts`.
- **Operations**:
  - `isInstalled(): boolean` — checks for `~/.config/systemd/user/switchboard-daemon.service`.
  - `isRunning(): Promise<boolean>` — `systemctl --user is-active switchboard-daemon`.
  - `install(daemonPath, dataDir): Promise<void>` — write unit file, `systemctl --user daemon-reload`, `enable --now`.
  - `uninstall(): Promise<void>` — `disable --now`, remove unit file, reload.
  - `restart(): Promise<void>` — `systemctl --user restart`.
  - `getStatus(): Promise<{installed, running, pid?}>`.
- All shell-outs use `child_process.execFile` with strict argument lists; no shell interpolation.

## Unit file template
- `Description=Switchboard daemon`
- `ExecStart=<node> <daemon.js>` — embed the path computed at install time. For dev: `node dist/daemon/daemon/daemon.js`. For packaged: `<resourcesPath>/dist/daemon/daemon.js` via `process.execPath` + `ELECTRON_RUN_AS_NODE`.
- `Restart=on-failure`
- `Environment=` for `SWITCHBOARD_DATA_DIR` etc.
- `[Install] WantedBy=default.target` so it auto-starts on user login.

## Client lifecycle change
- **Startup logic** (in `local-daemon.ts` or a new wrapper):
  - If service is installed and running → skip child spawn, treat localhost daemon as already up; client just connects to `127.0.0.1:3717`.
  - If service is installed but not running → start it, then connect.
  - If not installed → existing child-process behavior.
- `before-quit` handler: only kill the child daemon if we spawned one (don't kill the systemd service).

## UI
- Preferences → Daemons gets a new section: **Localhost daemon**.
- States rendered:
  - *Not installed*: shows "Install as user service" button + brief explanation.
  - *Installed, running*: shows "Running (PID 12345)" + "Restart" + "Uninstall" actions.
  - *Installed, stopped*: shows "Stopped" + "Start" + "Uninstall".
- Confirmation dialogs for install/uninstall.

# Deliverables

## Implementation
- **Main**:
  - `src/main/systemd-installer.ts` — new file.
  - `src/main/local-daemon.ts` — branch on installed-service detection, skip child spawn when service is up.
  - `src/main/main.ts` — `before-quit` only kills child, never the service.
  - `src/main/ipc-handlers.ts` — IPC handlers for install/uninstall/start/stop/restart/status.
  - `src/main/preload.ts` — expose `daemon.localService.{install,uninstall,start,stop,restart,status}`.
- **Renderer**:
  - `src/renderer/components/PreferencesModal.tsx` — Localhost daemon section.
- **Build**:
  - Document the daemon path resolution for dev vs packaged builds.

## Specs
- `specs/src/main/systemd-installer-spec.md` — new.
- Update `specs/src/main/local-daemon-spec.md` for the service-detection branch.

## Tests
- `tests/main/systemd-installer.test.ts` — mock `execFile`; verify command sequences for install/uninstall/start/stop. Verify unit file content.
- `tests/main/local-daemon.test.ts` — verify child spawn is skipped when service is detected as running.

# Acceptance Criteria
- User can install the localhost daemon as a systemd user service from Preferences > Daemons.
- After install, closing the client does NOT kill the daemon; sessions stay alive (verified by checking PID before/after).
- Reopening the client connects to the existing service; no fresh child process.
- User can uninstall, restart, start, stop the service from Preferences.
- All shell commands use `execFile` with arg arrays (no shell interpolation, no path injection).
- All tests pass.
- Linux only — macOS/Windows fallback gracefully to existing child-process behavior with a "service install not supported on this platform" notice.

# Dependencies
- Sprint 17 (session restore on startup) — useful but not strictly required. With service mode, daemon rarely restarts; without Sprint 17, an explicit service restart still loses sessions.
- Daemon (v3) — uses existing daemon binary as-is; this sprint only changes how it's launched.

# Notes
- macOS (`launchd`) and Windows (Windows Service / scheduled task) are intentionally out of scope. Each is a separate platform with its own permission model and would 2x the surface area.
- Remote daemon provisioning (installing the service over SSH on another host) is a much bigger feature — separate issue.
- A future enhancement: detect a port-3717 conflict at install time (some other process holding it) and offer alternate-port config.
