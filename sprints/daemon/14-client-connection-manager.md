---
sprint: 14
title: Client Connection Manager
milestone: Daemon
status: planned
---

# Goal
Add a connection manager to the Electron main process that connects to one or more daemons, translates daemon wire protocol messages to the existing renderer IPC interface, and handles reconnection. After this sprint, the client can talk to daemons while the renderer layer remains largely unchanged.

# Deliverables

## Implementation
- `src/main/connection-manager.ts` — Manages N daemon connections. Handles auth, reconnection with backoff, message routing. Translates daemon protocol messages to/from renderer IPC channels.
- Updates to `src/main/main.ts` — Initialize connection manager, wire up to IPC handlers.
- Updates to `src/main/preload.ts` — Add daemon connection APIs (connect, disconnect, list connections, connection status).
- Updates to `src/main/ipc-handlers.ts` — Route session commands through connection manager instead of local PTY.
- Updates to `src/shared/types.ts` — Add DaemonConnection type, composite session IDs, connection status types.

## Specs (per-file)
- `specs/src/main/connection-manager-spec.md`
- Updates to existing specs as needed.

## Tests
- `tests/main/connection-manager.test.ts`
- Integration test: client connects to a test daemon, spawns session, exchanges data.
- Update existing renderer tests for composite session IDs.

# Acceptance Criteria
- Client connects to a configured daemon and authenticates.
- Sessions spawned via the daemon appear in the sidebar.
- Terminal input/output works through the daemon connection.
- Connection status is visible in the renderer (connected/reconnecting/disconnected).
- Auto-reconnect works with exponential backoff.
- Multiple daemon connections work simultaneously.
- Existing UI features (themes, shortcuts, search, etc.) work unchanged.
- All tests pass.

# Dependencies
- Sprint 13 (daemon transport — need a daemon to connect to).

# Notes
- The key design goal is minimal renderer changes. The connection manager translates between the daemon wire protocol and the existing IPC channels.
- Session IDs become composite: `<daemonId>:<sessionId>` to ensure uniqueness across daemons.
- Direct local PTY support is retained during this sprint for backwards compatibility. Sprint 15 removes it.
