---
title: Session Manager Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, main-process, pty, session]
status: active
governs: src/main/session-manager.ts
---

# Purpose
Manage PTY session lifecycle in the Electron main process: spawn, data relay, resize, close, and cleanup. Each session runs in its own PTY via node-pty.

# Behavior

## Session Data Model
```typescript
interface Session {
  id: string;           // UUID
  name: string;         // User-facing project name
  cwd: string;          // Working directory
  command: string;      // Shell command (default: user's shell)
  pid: number;          // PTY process ID
  status: SessionStatus;
}

type SessionStatus = 'working' | 'idle' | 'needs-attention';
```

## Session Lifecycle

### spawn(config: SessionConfig): Session
- Creates a new PTY via `node-pty.spawn()`.
- Shell defaults to user's default shell (`process.env.SHELL` on Linux/macOS, `powershell.exe` on Windows).
- Working directory from config.
- Attaches data listener that forwards output to the renderer via IPC.
- Attaches exit listener for cleanup.
- Returns session metadata.

### write(sessionId: string, data: string): void
- Sends input data to the specified PTY.
- Validates session exists.

### resize(sessionId: string, cols: number, rows: number): void
- Resizes the specified PTY.
- Validates dimensions are positive integers.

### close(sessionId: string): void
- Kills the PTY process.
- Removes session from active sessions map.
- Emits session-closed IPC event.

### getAll(): Session[]
- Returns metadata for all active sessions.

## Cleanup
- On app quit: kill all active PTY processes.
- Defensive: catch and log errors from PTY operations; never let one session's failure affect others.

# Exports
- `SessionManager` class
- `Session`, `SessionConfig`, `SessionStatus` types

# Test Strategy
- Unit test: spawn creates a session and stores it.
- Unit test: write sends data to the correct PTY.
- Unit test: resize calls pty.resize with correct dimensions.
- Unit test: close kills the PTY and removes the session.
- Unit test: getAll returns all active sessions.
- Unit test: sessions are isolated (closing one doesn't affect others).
