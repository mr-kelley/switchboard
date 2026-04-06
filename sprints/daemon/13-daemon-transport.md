---
sprint: 13
title: Daemon Transport — WebSocket Server, Auth, Replay
milestone: Daemon
status: planned
---

# Goal
Add the network layer to the daemon: a WebSocket + TLS server that accepts client connections, authenticates via token, streams PTY data, handles session commands, and performs history replay on connect/reconnect. After this sprint, the daemon is a fully functional networked service.

# Deliverables

## Implementation
- `src/daemon/transport.ts` — WebSocket + TLS server. Accepts connections, dispatches messages to handlers, broadcasts to connected clients.
- `src/daemon/auth.ts` — Token validation with constant-time comparison. Connection rejection on auth failure.
- `src/daemon/daemon.ts` — Daemon entry point. Wires together config, transport, PTY manager, idle detector, output buffer, session store. CLI interface (`switchboard-daemon` command).

## Specs (per-file)
- `specs/src/daemon/transport-spec.md`
- `specs/src/daemon/auth-spec.md`
- `specs/src/daemon/daemon-spec.md`

## Tests
- `tests/daemon/transport.test.ts`
- `tests/daemon/auth.test.ts`
- `tests/daemon/daemon.test.ts`
- Integration test: full connection lifecycle (connect, auth, spawn, data, close).
- Integration test: reconnection with delta replay.
- Integration test: multiple concurrent clients.

# Acceptance Criteria
- Daemon starts and listens on configured port with TLS.
- Client connects via WebSocket, authenticates with token, receives session list.
- Session spawn/input/resize/close commands work over the wire.
- PTY output streams to all connected clients in real time.
- History replay works on connect (replay:begin/data/end sequence).
- Ping/pong keepalive detects dead connections.
- Auth failure closes the connection with auth:fail message.
- All tests pass (unit + integration).

# Dependencies
- Sprint 12 (daemon core components).

# Notes
- The `ws` npm package is the WebSocket implementation (same as used by many Electron apps).
- TLS uses Node.js `tls` module with the self-signed cert from config.
- Integration tests start a real daemon and connect real WebSocket clients.
