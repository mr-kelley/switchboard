---
title: IPC Handlers Specification
version: 0.3.0
maintained_by: claude
domain_tags: [electron, ipc, main-process, preferences]
status: active
governs: src/main/ipc-handlers.ts
---

# Purpose
Register IPC handlers that bridge renderer requests to the SessionManager and PreferencesStore. Integrates IdleDetector for status tracking, SessionStore for session persistence, PreferencesStore for user preferences, and notifications for attention events. All IPC channels follow the `<domain>:<action>` convention.

# Architecture

## Dependencies
- `SessionManager` — PTY lifecycle management (injected)
- `IdleDetector` — three-state idle detection (created internally)
- `SessionStore` — JSON file persistence for sessions (created internally)
- `PreferencesStore` — JSON file persistence for user preferences (created internally)
- `notifications` — OS-level attention alerts (imported)

## Initialization Flow
1. Create `SessionStore`, `PreferencesStore`, and `IdleDetector` instances.
2. IdleDetector callback: on status change, updates SessionManager, broadcasts `session:status-changed`, fires OS notification if `needs-attention` and app is unfocused.
3. Restore saved sessions from `SessionStore`. Failed restores (e.g., missing directory) are silently skipped.
4. Register all IPC handlers (pty, session, and preferences).
5. Wire SessionManager `onData` and `onExit` events to IdleDetector and renderer broadcasts.

## Broadcast Helper
`broadcast(channel, data)` sends to all open `BrowserWindow` instances via `webContents.send`.

# IPC Channels

## Renderer → Main (invoke/handle)
| Channel | Args | Returns | Side Effects |
|---|---|---|---|
| `pty:spawn` | `{ name, cwd, command? }` | `SessionInfo` | Adds to IdleDetector, persists sessions |
| `pty:resize` | `{ sessionId, cols, rows }` | void | — |
| `pty:close` | `{ sessionId }` | void | Removes from IdleDetector, persists sessions |
| `session:list` | — | `SessionInfo[]` | — |
| `session:rename` | `{ sessionId, name }` | void | Broadcasts `session:renamed`, persists sessions |
| `preferences:load` | — | `SwitchboardPreferences` | — |
| `preferences:save` | `SwitchboardPreferences` | void | Persists to disk, broadcasts `preferences:changed` |
| `preferences:reset` | — | `SwitchboardPreferences` | Deletes prefs file, broadcasts `preferences:changed` |

## Renderer → Main (send/on)
| Channel | Args | Side Effects |
|---|---|---|
| `pty:input` | `{ sessionId, data }` | Notifies IdleDetector of user input, writes to PTY |

## Main → Renderer (broadcast)
| Channel | Payload | Trigger |
|---|---|---|
| `pty:data` | `{ sessionId, data }` | PTY output received |
| `pty:exit` | `{ sessionId, exitCode }` | PTY process exited |
| `session:status-changed` | `{ sessionId, status }` | IdleDetector status transition |
| `session:renamed` | `{ sessionId, name }` | session:rename handler |
| `preferences:changed` | `SwitchboardPreferences` | preferences:save or preferences:reset handler |

# Validation
- All `handle` handlers MUST validate arguments before forwarding to SessionManager. Invalid arguments throw errors.
- The `on` handler (`pty:input`) silently drops invalid arguments.

# Session Persistence
- `persistSessions()` helper saves current session configs (name, cwd, command) to `SessionStore` after every spawn, close, exit, and rename.
- On startup, saved sessions are restored by re-spawning PTYs with the same config.

# Preferences Handlers
- `preferences:load` — calls `preferencesStore.load()`, returns the result.
- `preferences:save` — calls `preferencesStore.save(prefs)`, broadcasts `preferences:changed` with the saved prefs to all windows.
- `preferences:reset` — calls `preferencesStore.reset()`, broadcasts `preferences:changed` with the returned defaults, returns the defaults.

# Exports
- `registerIpcHandlers(sessionManager: SessionManager): void`

# Test Strategy
- Unit test: each handler validates its arguments.
- Unit test: handlers delegate to SessionManager methods.
- Unit test: IdleDetector is wired to data and input events.
- Unit test: session persistence is triggered on spawn/close/exit.
