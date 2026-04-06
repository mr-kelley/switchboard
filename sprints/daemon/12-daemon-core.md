---
sprint: 12
title: Daemon Core — Protocol, PTY Management, Output Buffer
milestone: Daemon
status: planned
---

# Goal
Build the daemon's core components: shared protocol types, PTY session management (adapted from the existing session-manager), idle detection, output ring buffer, configuration loading, and first-run setup. The daemon is not yet networked — this sprint delivers the internal engine that Sprint 13 will expose over WebSocket.

# Deliverables

## Implementation
- `src/shared/protocol.ts` — Message type definitions shared between daemon and client. All 16 message types from the architecture spec.
- `src/daemon/config.ts` — Configuration loading from `~/.switchboard/daemon.json`. First-run setup: generate token, self-signed TLS cert, write defaults.
- `src/daemon/pty-manager.ts` — PTY session management adapted from `src/main/session-manager.ts`. Adds `rename()` method. Same defensive lifecycle (spawn, write, resize, close, closeAll).
- `src/daemon/idle-detector.ts` — Idle detection adapted from `src/main/idle-detector.ts`. Identical logic, decoupled from Electron IPC.
- `src/daemon/output-buffer.ts` — Per-session ring buffer. Append raw terminal data, evict oldest lines when at capacity, serialize to/from disk, replay as chunks.
- `src/daemon/session-store.ts` — Session metadata persistence adapted from `src/main/session-store.ts`.

## Specs (per-file)
- `specs/src/shared/protocol-spec.md`
- `specs/src/daemon/config-spec.md`
- `specs/src/daemon/pty-manager-spec.md`
- `specs/src/daemon/idle-detector-spec.md`
- `specs/src/daemon/output-buffer-spec.md`
- `specs/src/daemon/session-store-spec.md`

## Tests
- `tests/shared/protocol.test.ts`
- `tests/daemon/config.test.ts`
- `tests/daemon/pty-manager.test.ts`
- `tests/daemon/idle-detector.test.ts`
- `tests/daemon/output-buffer.test.ts`
- `tests/daemon/session-store.test.ts`

# Acceptance Criteria
- All message types serialize/deserialize correctly with type safety.
- PTY manager spawns sessions, relays data, resizes, closes, and reports status.
- Idle detector fires status transitions on PTY output patterns.
- Output buffer appends data, evicts at capacity, persists to disk, and replays in chunks.
- Config loads from file, generates defaults on first run (token + self-signed cert).
- All tests pass.

# Dependencies
- None (first daemon sprint).

# Notes
- PTY manager and idle detector are adapted from existing main-process code, not written from scratch. The key change is decoupling from Electron IPC.
- The output buffer is the most novel component — no existing equivalent.
- Self-signed certificate generation uses Node.js `crypto` module (no external dependencies).
