---
sprint: 15
title: Client Integration — Remove Direct PTY, Connection UI
milestone: Daemon
status: planned
---

# Goal
Complete the client-server transition. Remove direct node-pty from the Electron main process. Add connection management UI (add/remove daemons, connection status display). All sessions now go through daemon connections. Optional localhost daemon auto-start for zero-config local use.

# Deliverables

## Implementation
- Remove direct node-pty usage from `src/main/ipc-handlers.ts` and `src/main/main.ts`.
- Remove or archive `src/main/session-manager.ts`, `src/main/idle-detector.ts`, `src/main/session-store.ts`, `src/main/notifications.ts` (functionality moved to daemon).
- `src/renderer/components/ConnectionManager.tsx` — UI for managing daemon connections (add, remove, edit, connect/disconnect).
- Updates to `src/renderer/components/Sidebar.tsx` — Show per-daemon grouping and connection status indicators.
- Updates to `src/renderer/components/StatusBar.tsx` — Show connected daemon count and status.
- Updates to `src/renderer/components/NewSessionModal.tsx` — Select target daemon when creating a session.
- Optional: localhost daemon auto-start as a child process when no daemons are configured.

## Specs
- Update existing component specs to reflect daemon-backed sessions.
- `specs/src/renderer/components/ConnectionManager-spec.md`

## Tests
- Update all existing tests for daemon-backed session model.
- E2E test: start daemon, start client, create session, verify output.
- E2E test: disconnect/reconnect, verify history replay.
- E2E test: two clients to same daemon, verify shared output.

# Acceptance Criteria
- node-pty is no longer imported or used in the Electron main process.
- All sessions are daemon-managed.
- Connection management UI allows adding/removing/editing daemon connections.
- Sidebar groups sessions by daemon with connection status indicators.
- New Session modal lets user pick the target daemon.
- History replay works on reconnect.
- All existing UI features work unchanged.
- All tests pass (unit + integration + E2E).
- 0.3.0-rc version bump.

# Dependencies
- Sprint 14 (client connection manager).

# Notes
- This is the sprint where the monolithic architecture is fully retired.
- Existing main-process modules (session-manager, idle-detector, session-store) may be kept in the repo for reference but should be excluded from the build.
- The localhost auto-start feature is optional — users can always start the daemon manually.
