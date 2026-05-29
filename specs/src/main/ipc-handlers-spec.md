---
title: IPC Handlers Specification
version: 0.4.0
maintained_by: claude
domain_tags: [electron, ipc, main-process, daemon-client]
status: active
platform: claude-code
license: Apache-2.0
governs: src/main/ipc-handlers.ts
---

# Purpose
Register the IPC handlers that bridge renderer requests to the daemon-client layer. Since the v3 Daemon milestone, PTYs live in a standalone daemon process; the Electron main process is a *client*. These handlers therefore route session commands to a `ConnectionManager` (which owns daemon connections), manage daemon connection/pairing, persist user preferences via `PreferencesStore`, and control the localhost `systemd --user` service via the `systemd-installer` module. All channels follow the `<domain>:<action>` convention.

> **Architecture note:** `SessionManager`, `IdleDetector`, and `SessionStore` are **daemon-side** now (`src/daemon/`), not dependencies of this module. Earlier versions of this spec described a pre-daemon, local-PTY design; this version reflects the daemon-client architecture (DEC-000001).

# Scope

## Covers
- Registration of all renderer→main IPC handlers (invoke/handle and send/on).
- Argument validation at the IPC boundary.
- Preference load/save/reset and the per-session notification-priority write.
- Localhost systemd-service control handlers.
- The `broadcast` helper used to push events to all renderer windows.

## Does Not Cover
- Daemon connection lifecycle, routing, and the daemon-originated broadcasts (governed by `connection-manager-spec.md`).
- Preference file format and merge semantics (`preferences-store-spec.md`).
- systemd unit rendering/control internals (`systemd-installer-spec.md`).
- Tray and window events (`tray-spec.md`, `main-spec.md`).

# Inputs
- `registerIpcHandlers(connectionManager: ConnectionManager, localDaemon?: LocalDaemon): void`.
- A `PreferencesStore` is created internally (default file path).
- IPC messages from the renderer (validated per channel).

# Outputs
- Registered `ipcMain.handle` / `ipcMain.on` handlers.
- Return values to the renderer (e.g., `session:list` → `SessionInfo[]`).
- `broadcast(channel, data)` sends to every open `BrowserWindow`.

# Responsibilities

## Broadcast Helper
`broadcast(channel, data)` iterates `BrowserWindow.getAllWindows()` and calls `webContents.send`.

## IPC Channels — Renderer → Main (invoke/handle)
| Channel | Args | Returns | Side Effects |
|---|---|---|---|
| `pty:spawn` | `{ name, cwd, command?, daemonId? }` | `null` | Routes to `connectionManager.spawn` on `daemonId` or the default daemon; throws if none connected. Session arrives later via `daemon:session-created`. |
| `pty:resize` | `{ sessionId, cols, rows }` | void | `connectionManager.resize` |
| `pty:close` | `{ sessionId }` | void | `connectionManager.close` |
| `session:list` | — | `SessionInfo[]` | `connectionManager.getAllSessions()` (composite ids) |
| `session:rename` | `{ sessionId, name }` | void | `connectionManager.rename` |
| `session:queue-prompt` | `{ sessionId, text }` | void | `connectionManager.queuePrompt` |
| `session:clear-queue` | `{ sessionId }` | void | `connectionManager.clearQueue` |
| `session:replay-request` | `{ sessionId }` | void | `connectionManager.requestReplay` |
| `session:set-priority` | `{ sessionId, priority }` | void | Validates priority ∈ high/normal/silent; updates `notificationPriorities` in prefs; broadcasts `preferences:changed` (Sprint 19) |
| `daemon:add` | `DaemonConnectionConfig` | void | `connectionManager.addConnection` |
| `daemon:connect` | `daemonId` | void | `connectionManager.connect` |
| `daemon:disconnect` | `daemonId` | void | `connectionManager.disconnect` |
| `daemon:remove` | `daemonId` | void | `connectionManager.removeConnection` |
| `daemon:pair` | `{ host, port, clientName }` | pairing result | `connectionManager.pair` |
| `daemon:submit-code` | `code` | void | `connectionManager.submitPairingCode` |
| `daemon:statuses` | — | `Array<{ id, name, status, sessionCount }>` | `connectionManager.getConnectionStatuses()` |
| `preferences:load` | — | `SwitchboardPreferences` | — |
| `preferences:save` | `SwitchboardPreferences` | void | Persists, broadcasts `preferences:changed` |
| `preferences:reset` | — | `SwitchboardPreferences` | Deletes prefs file, broadcasts `preferences:changed` |
| `localService:status` | — | `ServiceStatus` | Adds `installBlocked`/reason when `process.env.APPIMAGE` is set |
| `localService:install` | — | `ServiceStatus` | Linux-only; rejects under AppImage; stops the child daemon to free the port, installs the unit, marks service-managed |
| `localService:uninstall` | — | `ServiceStatus` | Linux-only; `systemd.uninstall()` |
| `localService:start` / `localService:stop` / `localService:restart` | — | `ServiceStatus` | systemctl --user control |
| `dialog:open-file` | `{ filters? }` | path \| null | Opens a file picker on the focused window |

## IPC Channels — Renderer → Main (send/on)
| Channel | Args | Side Effects |
|---|---|---|
| `pty:input` | `{ sessionId, data }` | `connectionManager.input`; silently drops invalid args |

## Main → Renderer events (reference)
Broadcast to renderer windows. These originate in `connection-manager` (daemon events), `main` (window/tray), and these handlers (`preferences:changed`): `pty:data`, `pty:exit`, `session:status-changed`, `session:renamed`, `daemon:session-created`, `session:queue-updated`, `session:queue-rejected`, `session:queue-sync`, `daemon:status-changed`, `daemon:connected`, `daemon:auth-failed`, `daemon:pair-challenge`, `daemon:pair-success`, `daemon:pair-failed`, `preferences:changed`, `shortcut:cycle-tab`, `tray:focus-attention`.

# Edge Cases / Fault Handling
- `handle` handlers MUST validate arguments and throw on invalid input (surfaced to the renderer as a rejected invoke).
- The `pty:input` `on` handler silently drops invalid arguments (fire-and-forget).
- `pty:spawn` with no connected daemon throws a user-facing "No daemon connected" error.
- `localService:install` rejects on non-Linux and under AppImage with an explanatory message.
- `dialog:open-file` returns null when there is no focused window or the dialog is canceled.

# Test Strategy
Unit tests in `tests/main/ipc-handlers.test.ts` (Vitest), mocking `electron` and injecting a stub `ConnectionManager`/`LocalDaemon`:
- Each `handle` validates its arguments and throws on bad input.
- Handlers delegate to the correct `ConnectionManager` method.
- `session:set-priority` validates the priority and writes + broadcasts.
- `localService:*` handlers guard platform/AppImage and delegate to `systemd-installer`.

# Completion Criteria
- All channels above are registered and validated.
- Spec matches `src/main/ipc-handlers.ts`.
- Tests pass.
