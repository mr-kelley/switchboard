---
title: Preload Script Specification
version: 0.4.0
maintained_by: claude
domain_tags: [electron, ipc, security, daemon-client]
status: active
platform: claude-code
license: Apache-2.0
governs: src/main/preload.ts
---

# Purpose
Define the preload script that bridges the sandboxed renderer with the main process via `contextBridge`. This is the ONLY surface through which the renderer reaches Node/Electron, and it mirrors the daemon-client IPC surface registered in `ipc-handlers.ts` plus the window/tray events emitted by `main.ts` and the daemon events relayed by `connection-manager.ts`.

# Scope

## Covers
- The `window.switchboard` API shape exposed via `contextBridge`.
- The mapping from API methods to IPC channels and direction.
- Event-listener cleanup contract.
- Renderer security rules.

## Does Not Cover
- Handler implementations (`ipc-handlers-spec.md`).
- Daemon connection semantics (`connection-manager-spec.md`).

# Exposed API
`contextBridge.exposeInMainWorld('switchboard', api)` exposes (typed as `SwitchboardAPI` in `src/shared/types.ts`):

- `platform: NodeJS.Platform`
- `dialog.openFile(filters?)`
- `onCycleTab(cb)` — `shortcut:cycle-tab`
- `pty`: `spawn`, `resize`, `close`, `input` (send), `onData`, `onExit`
- `session`: `list`, `onStatusChanged`, `onSessionCreated`, `queuePrompt`, `clearQueue`, `requestReplay`, `setPriority` (Sprint 19), `onFocusAttention` (Sprint 19), `onQueueUpdated`, `onQueueRejected`, `onQueueSync`
- `daemon`: `add`, `connect`, `disconnect`, `remove`, `statuses`, `onStatusChanged`, `onConnected`, `pair`, `submitCode`, `onPairChallenge`, `onPairSuccess`, `onPairFailed`, and `localService.{status, install, uninstall, start, stop, restart}` (Sprint 18)
- `preferences`: `load`, `save`, `reset`, `onChanged`

# IPC Channel Mapping
| API method | IPC channel | Direction | Pattern |
|---|---|---|---|
| `dialog.openFile` | `dialog:open-file` | r→m | invoke/handle |
| `onCycleTab` | `shortcut:cycle-tab` | m→r | on (event) |
| `pty.spawn` | `pty:spawn` | r→m | invoke/handle |
| `pty.resize` | `pty:resize` | r→m | invoke/handle |
| `pty.close` | `pty:close` | r→m | invoke/handle |
| `pty.input` | `pty:input` | r→m | send/on (fire-and-forget) |
| `pty.onData` | `pty:data` | m→r | on (stream) |
| `pty.onExit` | `pty:exit` | m→r | on (event) |
| `session.list` | `session:list` | r→m | invoke/handle |
| `session.onStatusChanged` | `session:status-changed` | m→r | on (event) |
| `session.onSessionCreated` | `daemon:session-created` | m→r | on (event) |
| `session.queuePrompt` | `session:queue-prompt` | r→m | invoke/handle |
| `session.clearQueue` | `session:clear-queue` | r→m | invoke/handle |
| `session.requestReplay` | `session:replay-request` | r→m | invoke/handle |
| `session.setPriority` | `session:set-priority` | r→m | invoke/handle (Sprint 19) |
| `session.onFocusAttention` | `tray:focus-attention` | m→r | on (event, Sprint 19) |
| `session.onQueueUpdated` | `session:queue-updated` | m→r | on (event) |
| `session.onQueueRejected` | `session:queue-rejected` | m→r | on (event) |
| `session.onQueueSync` | `session:queue-sync` | m→r | on (event) |
| `daemon.add` | `daemon:add` | r→m | invoke/handle |
| `daemon.connect` / `disconnect` / `remove` | `daemon:connect` / `daemon:disconnect` / `daemon:remove` | r→m | invoke/handle |
| `daemon.statuses` | `daemon:statuses` | r→m | invoke/handle |
| `daemon.onStatusChanged` | `daemon:status-changed` | m→r | on (event) |
| `daemon.onConnected` | `daemon:connected` | m→r | on (event) |
| `daemon.pair` | `daemon:pair` | r→m | invoke/handle |
| `daemon.submitCode` | `daemon:submit-code` | r→m | invoke/handle |
| `daemon.onPairChallenge` / `onPairSuccess` / `onPairFailed` | `daemon:pair-challenge` / `daemon:pair-success` / `daemon:pair-failed` | m→r | on (event) |
| `daemon.localService.{status,install,uninstall,start,stop,restart}` | `localService:{status,install,uninstall,start,stop,restart}` | r→m | invoke/handle (Sprint 18) |
| `preferences.load` / `save` / `reset` | `preferences:load` / `preferences:save` / `preferences:reset` | r→m | invoke/handle |
| `preferences.onChanged` | `preferences:changed` | m→r | on (event) |

# Event Listener Cleanup
All `on*` methods return an unsubscribe function `() => void`. Callers MUST invoke it on cleanup (e.g., React `useEffect` return) to prevent listener leaks.

# Security Rules
- MUST use `contextBridge.exposeInMainWorld` exclusively.
- MUST NOT expose `ipcRenderer` or any Node global/module directly.
- The renderer is untrusted; argument validation happens in the main-process handlers.

# Exports
- `SwitchboardAPI` type lives in `src/shared/types.ts` for renderer consumption.

# Test Strategy
Unit tests in `tests/main/preload.test.ts`:
- The exposed API shape matches this spec (namespaces and methods present).
- No prohibited APIs (`ipcRenderer`, Node globals) are exposed.
- `platform` is exposed.

# Completion Criteria
- The exposed API and channel mapping match `src/main/preload.ts`.
- Tests pass.
