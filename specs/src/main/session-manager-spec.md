---
title: Session Manager Specification
version: 0.2.0
maintained_by: claude
domain_tags: [electron, main-process, pty, session]
status: active
governs: src/main/session-manager.ts
---

# Purpose
Manage PTY session lifecycle in the Electron main process: spawn, data relay, resize, close, and cleanup. Each session runs in its own PTY via node-pty. SessionManager is event-agnostic — it exposes callback setters rather than directly handling IPC.

# Behavior

## Session Data Model
```typescript
interface SessionConfig {
  name: string;
  cwd: string;
  command?: string;
}

interface SessionInfo {
  id: string;           // UUID (crypto.randomUUID)
  name: string;         // User-facing project name
  cwd: string;          // Working directory
  command: string;      // Shell command (resolved from config or default shell)
  pid: number;          // PTY process ID
  status: SessionStatus;
}

type SessionStatus = 'working' | 'idle' | 'needs-attention';
```

## Event Callbacks
SessionManager does NOT directly emit IPC events. Instead, consumers register callbacks:
- `setOnData(handler)` — called with `(sessionId, data)` on every PTY data event.
- `setOnExit(handler)` — called with `(sessionId, exitCode)` when a PTY process exits.

This decouples SessionManager from Electron IPC, making it testable in isolation.

## Session Lifecycle

### spawn(config: SessionConfig): SessionInfo
- Creates a new PTY via `node-pty.spawn()`.
- Shell defaults to user's default shell (`process.env.SHELL` on Linux/macOS, `powershell.exe` on Windows).
- Terminal type: `xterm-256color`, initial size 80×24.
- Attaches PTY `onData` listener that invokes the registered data callback.
- Attaches PTY `onExit` listener that removes the session from the map and invokes the exit callback.
- Returns a copy of the session info.

### write(sessionId: string, data: string): void
- Sends input data to the specified PTY.
- Throws if session not found.

### resize(sessionId: string, cols: number, rows: number): void
- Resizes the specified PTY.
- Validates dimensions are positive integers (≥1).
- Throws if session not found.

### close(sessionId: string): void
- Kills the PTY process (catch errors — PTY may already be dead).
- Removes session from active sessions map.
- Throws if session not found.

### getAll(): SessionInfo[]
- Returns copies of metadata for all active sessions.

### getSession(sessionId: string): SessionInfo | undefined
- Returns a copy of a single session's metadata, or undefined if not found.

### updateStatus(sessionId: string, status: SessionStatus): void
- Updates a session's status field in place. Used by IdleDetector integration.

### closeAll(): void
- Best-effort cleanup: iterates all sessions and closes each, catching errors.

## Cleanup
- On app quit: `closeAll()` kills all active PTY processes.
- Defensive: catch and log errors from PTY operations; never let one session's failure affect others.

# Exports
- `SessionManager` class
- `SessionInfo`, `SessionConfig`, `SessionStatus` types

# Test Strategy
- Unit test: spawn creates a session and stores it.
- Unit test: write sends data to the correct PTY.
- Unit test: resize calls pty.resize with correct dimensions.
- Unit test: close kills the PTY and removes the session.
- Unit test: getAll returns all active sessions.
- Unit test: sessions are isolated (closing one doesn't affect others).
