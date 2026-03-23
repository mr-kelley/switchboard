---
title: IPC Handlers Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, ipc, main-process]
status: active
governs: src/main/ipc-handlers.ts
---

# Purpose
Register IPC handlers that bridge renderer requests to the SessionManager. All IPC channels follow the `<domain>:<action>` convention.

# IPC Channels

## Renderer → Main (invoke/handle)
- `pty:spawn` — Create a new PTY session. Args: `{ name, cwd, command? }`. Returns: session metadata.
- `pty:resize` — Resize a PTY. Args: `{ sessionId, cols, rows }`. Returns: void.
- `pty:close` — Close a PTY session. Args: `{ sessionId }`. Returns: void.
- `session:list` — List all sessions. Returns: session metadata array.

## Renderer → Main (send/on)
- `pty:input` — Send input to a PTY. Args: `{ sessionId, data }`.

## Main → Renderer (send)
- `pty:data` — PTY output data. Args: `{ sessionId, data }`.
- `pty:exit` — PTY process exited. Args: `{ sessionId, exitCode }`.

# Validation
- All handlers MUST validate arguments before forwarding to SessionManager.
- Invalid arguments result in thrown errors (for handle) or silent drops (for on).

# Exports
- `registerIpcHandlers(sessionManager: SessionManager): void`

# Test Strategy
- Unit test: each handler validates its arguments.
- Unit test: handlers delegate to SessionManager methods.
