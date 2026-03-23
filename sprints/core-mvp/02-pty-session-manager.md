---
sprint: 2
title: PTY Session Manager
milestone: Core MVP
status: active
---

## Goal
Implement the main-process session manager that spawns and manages PTY processes via node-pty, relays data over IPC, and handles session lifecycle (create, resize, close, crash recovery).

## Deliverables
- `src/main/session-manager.ts` — PTY spawn, data relay, resize, close, lifecycle
- `src/main/ipc-handlers.ts` — IPC channel registration for pty:spawn, pty:data, pty:resize, pty:exit
- Updates to `src/main/preload.ts` — expose session IPC channels
- Specs for each implementation file
- Unit tests for session manager logic

## Acceptance Criteria
- Can spawn a new PTY session with a given shell command and working directory.
- PTY data streams to the renderer via IPC.
- Renderer can send input to a specific PTY via IPC.
- PTY resize events propagate correctly.
- Session close cleans up the PTY process.
- Orphaned PTY detection/cleanup on app exit.
- Tests exist and pass.

## Dependencies
- Sprint 01 (Electron Shell)
