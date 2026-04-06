---
title: Daemon PTY Manager Specification
version: 0.1.0
maintained_by: claude
domain_tags: [daemon, pty, session]
status: draft
governs: src/daemon/pty-manager.ts
platform: claude-code
license: MIT
---

# Purpose
Manage PTY session lifecycle in the daemon process: spawn, write, resize, rename, close, and cleanup. Each session runs in its own PTY via node-pty. PtyManager is event-agnostic -- it exposes callback setters rather than directly handling WebSocket messages. This is the daemon-side equivalent of the Electron `SessionManager`, adapted for the headless daemon context.

# Scope

## Covers
- PTY session creation and destruction via node-pty.
- Input relay, resize, rename, and status update operations.
- Session metadata tracking (`SessionInfo`).
- Callback-based event notification (data, exit, status change).
- Best-effort cleanup on shutdown.

## Does Not Cover
- Output buffering -- governed by `output-buffer-spec.md`.
- Idle detection -- governed by `idle-detector-spec.md`.
- WebSocket message routing -- governed by daemon transport/dispatch specs.
- Session persistence -- governed by `session-store-spec.md`.

# Inputs
- `SessionConfig` objects for spawning sessions.
- Input data strings for writing to PTY stdin.
- Resize dimensions (cols, rows).
- Session IDs for addressing operations.

# Outputs
- `SessionInfo` objects describing active sessions.
- Callback invocations: data events, exit events.

# Responsibilities

## Session Data Model

```typescript
interface SessionConfig {
  name: string;
  cwd: string;
  command?: string;
}

interface SessionInfo {
  id: string;           // UUID (crypto.randomUUID)
  name: string;         // User-facing label
  cwd: string;          // Working directory
  command: string;      // Shell command (resolved from config or default shell)
  pid: number;          // PTY process ID
  status: SessionStatus;
}

type SessionStatus = 'working' | 'idle' | 'needs-attention';
```

These types are imported from the shared protocol module (`src/shared/protocol.ts`).

## Event Callbacks

PtyManager does NOT directly send WebSocket messages. Consumers register callbacks:

```typescript
setOnData(handler: (sessionId: string, data: string) => void): void
```
Called with `(sessionId, data)` on every PTY data event.

```typescript
setOnExit(handler: (sessionId: string, exitCode: number | undefined) => void): void
```
Called with `(sessionId, exitCode)` when a PTY process exits. The exit code is `undefined` if the process was killed by a signal.

This decouples PtyManager from the transport layer, making it testable in isolation.

## Session Lifecycle

### `spawn(config: SessionConfig): SessionInfo`
- Validates `config.name` is a non-empty string.
- Validates `config.cwd` is a non-empty string pointing to an existing directory.
- Generates a UUID via `crypto.randomUUID()`.
- Resolves the shell command:
  - If `config.command` is provided and non-empty, use it.
  - Otherwise, use `process.env.SHELL` on Linux/macOS, `powershell.exe` on Windows.
- Spawns a PTY via `node-pty.spawn(command, [], { name: 'xterm-256color', cols: 80, rows: 24, cwd: config.cwd })`.
- Attaches PTY `onData` listener that invokes the registered data callback.
- Attaches PTY `onExit` listener that:
  1. Removes the session from the active sessions map.
  2. Invokes the registered exit callback with `(sessionId, exitCode)`.
- Stores the session in an internal `Map<string, { info: SessionInfo, pty: IPty }>`.
- Returns a copy of the `SessionInfo`.

### `write(sessionId: string, data: string): void`
- Sends input data to the specified PTY via `pty.write(data)`.
- Throws `SessionNotFoundError` if the session ID is not in the active sessions map.

### `resize(sessionId: string, cols: number, rows: number): void`
- Resizes the specified PTY via `pty.resize(cols, rows)`.
- Validates `cols` and `rows` are positive integers (>= 1). Throws `Error` if not.
- Throws `SessionNotFoundError` if session not found.

### `rename(sessionId: string, name: string): void`
- Updates the session's `name` field in the stored `SessionInfo`.
- Validates `name` is a non-empty string. Throws `Error` if empty.
- Throws `SessionNotFoundError` if session not found.

### `close(sessionId: string): void`
- Kills the PTY process via `pty.kill()`. Catches errors (PTY may already be dead).
- Removes the session from the active sessions map.
- Throws `SessionNotFoundError` if session not found.

### `getAll(): SessionInfo[]`
- Returns copies of metadata for all active sessions.
- Order is not guaranteed.

### `getSession(sessionId: string): SessionInfo | undefined`
- Returns a copy of a single session's metadata, or `undefined` if not found.

### `updateStatus(sessionId: string, status: SessionStatus): void`
- Updates a session's `status` field in place. Used by idle detector integration.
- No-op if session not found (does not throw -- idle detector may fire after session exit).

### `closeAll(): void`
- Best-effort cleanup: iterates all sessions and closes each, catching errors per session.
- Clears the sessions map after iteration.
- Used on daemon shutdown (SIGTERM/SIGINT).

## Error Types

```typescript
class SessionNotFoundError extends Error {
  constructor(sessionId: string);
}
```

## Cleanup
- On daemon shutdown: `closeAll()` kills all active PTY processes.
- Defensive: catch and log errors from PTY operations. One session's failure MUST NOT affect other sessions.

# Edge Cases / Fault Handling

- **Invalid cwd (directory does not exist)**: `spawn` throws an `Error` before creating the PTY.
- **Empty session name**: `spawn` throws an `Error`.
- **PTY spawn failure (e.g., shell not found)**: node-pty throws. `spawn` lets the error propagate.
- **Write to a session that just exited**: The exit handler removes the session from the map. `write` throws `SessionNotFoundError`.
- **Resize with non-positive dimensions**: `resize` throws before calling `pty.resize`.
- **Close an already-closed session**: `close` throws `SessionNotFoundError` (session was already removed from map by exit handler or previous close).
- **Rename with empty string**: `rename` throws `Error`.
- **Data callback not set when PTY emits data**: If no data callback is registered, output is silently dropped.
- **Exit callback not set when PTY exits**: If no exit callback is registered, session is removed from map silently.
- **Rapid spawn/close cycles**: Each operation is synchronous on the sessions map. No race conditions with single-threaded Node.js event loop.

# Test Strategy

Test file: `tests/src/daemon/pty-manager.test.ts`

- Unit test: `spawn` creates a session, stores it, and returns valid `SessionInfo` with a UUID, resolved command, and `working` status.
- Unit test: `spawn` uses default shell when `command` is not provided.
- Unit test: `spawn` throws on empty `name`.
- Unit test: `spawn` throws on non-existent `cwd`.
- Unit test: `write` sends data to the correct PTY mock.
- Unit test: `write` throws `SessionNotFoundError` for unknown session ID.
- Unit test: `resize` calls `pty.resize` with correct dimensions.
- Unit test: `resize` throws on non-positive `cols` or `rows`.
- Unit test: `resize` throws `SessionNotFoundError` for unknown session ID.
- Unit test: `rename` updates the session name.
- Unit test: `rename` throws on empty name.
- Unit test: `rename` throws `SessionNotFoundError` for unknown session ID.
- Unit test: `close` kills the PTY and removes the session from the map.
- Unit test: `close` throws `SessionNotFoundError` for unknown session ID.
- Unit test: `getAll` returns all active sessions.
- Unit test: `getSession` returns `undefined` for unknown session ID.
- Unit test: `updateStatus` changes the session's status.
- Unit test: `updateStatus` is a no-op for unknown session ID.
- Unit test: `closeAll` closes all sessions and clears the map.
- Unit test: `closeAll` catches errors from individual PTY kills.
- Unit test: data callback is invoked when PTY emits output.
- Unit test: exit callback is invoked and session is removed when PTY exits.
- Unit test: sessions are isolated -- closing one does not affect others.

# Completion Criteria
1. All session lifecycle methods (`spawn`, `write`, `resize`, `rename`, `close`, `closeAll`) work correctly.
2. Callback setters (`setOnData`, `setOnExit`) decouple PtyManager from transport.
3. `SessionNotFoundError` is thrown for operations on non-existent sessions.
4. Input validation rejects empty names, invalid cwd, and non-positive dimensions.
5. `closeAll` performs best-effort cleanup without propagating individual errors.
6. All tests pass.
