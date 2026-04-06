---
title: Daemon Architecture Specification
version: 0.1.0
maintained_by: claude
domain_tags: [architecture, daemon, transport, auth, session-mobility]
status: draft
platform: claude-code
license: MIT
---

# Purpose
Define the architecture for Switchboard's client-server split: a standalone daemon process that manages PTY sessions, and a client (Electron app) that connects to one or more daemons for display and input. This spec governs the overall system design, protocol, transport, authentication, and session lifecycle across the daemon boundary.

Individual component specs (per-file) will be created during sprint work and must conform to this architectural spec.

# Scope

## Covers
- Daemon process structure, responsibilities, and lifecycle.
- Client connection manager responsibilities.
- Wire protocol: message format, channels, and semantics.
- Transport: WebSocket + TLS configuration.
- Authentication: token-based model.
- Output buffering and history replay.
- Session lifecycle across the daemon boundary.
- Network resilience: reconnection, state reconciliation.
- Migration path from current monolithic architecture.

## Does Not Cover
- Client UI changes (sidebar, tabs, preferences) — these remain governed by existing renderer specs.
- Intelligence features (status inference, timeline, plugin API) — deferred to v5, will reference this spec.
- Organizational/enterprise authentication — out of scope for v3; extensibility noted.
- Daemon clustering or replication — single daemon per host.

# System Overview

```
┌──────────────────────────────────────┐
│  Switchboard Client (Electron)       │
│                                      │
│  ┌──────────────┐  ┌──────────────┐  │
│  │ Connection   │  │ Renderer     │  │
│  │ Manager      │  │ (React +     │  │
│  │              │  │  xterm.js)   │  │
│  └──────┬───────┘  └──────────────┘  │
│         │ N connections              │
└─────────┼────────────────────────────┘
          │
          │ WebSocket + TLS
          │
┌─────────┼────────────────────────────┐
│  Switchboard Daemon (Node.js)        │
│         │                            │
│  ┌──────┴───────┐  ┌──────────────┐  │
│  │ Transport    │  │ Auth         │  │
│  │ Server       │  │ Manager      │  │
│  └──────┬───────┘  └──────────────┘  │
│         │                            │
│  ┌──────┴───────┐  ┌──────────────┐  │
│  │ Session      │  │ Output       │  │
│  │ Manager      │  │ Buffer       │  │
│  │ (node-pty)   │  │ (ring buf)   │  │
│  └──────────────┘  └──────────────┘  │
│                                      │
│  ┌──────────────┐                    │
│  │ Idle         │                    │
│  │ Detector     │                    │
│  └──────────────┘                    │
└──────────────────────────────────────┘
```

# Daemon Process

## Responsibilities
- Spawn and manage PTY sessions via node-pty.
- Run idle detection on PTY output streams.
- Buffer session output for history replay.
- Accept client connections over WebSocket + TLS.
- Authenticate clients via token.
- Stream PTY output to connected clients in real time.
- Relay client input to PTY sessions.
- Persist session metadata for daemon restart recovery.
- Report session status changes to connected clients.

## Lifecycle
- The daemon is a standalone Node.js process, started independently of any client.
- It runs as a long-lived process on the host machine (workstation, VM, server).
- It MUST NOT require an Electron installation — it is a headless process.
- It MUST be installable via npm (`npx switchboard-daemon` or equivalent).
- On startup: load configuration, restore persisted sessions (if any), start listening for connections.
- On shutdown (SIGTERM/SIGINT): graceful cleanup — close all PTY sessions, notify connected clients, close transport.
- PTY sessions survive client disconnects. Sessions are only destroyed by explicit client action or daemon shutdown.

## Configuration
The daemon reads configuration from a JSON file (default: `~/.switchboard/daemon.json`).

Required configuration fields:
- `port` (number): WebSocket listen port. Default: `3717`.
- `host` (string): Bind address. Default: `"127.0.0.1"` (localhost only).
- `tls.cert` (string): Path to TLS certificate file.
- `tls.key` (string): Path to TLS private key file.
- `auth.token` (string): Shared secret for client authentication.
- `scrollbackLimit` (number): Maximum lines of output buffered per session. Default: `50000`.

Optional configuration fields:
- `tls.ca` (string): Path to CA certificate for client certificate verification (future use).
- `sessionPersistPath` (string): Path for session metadata persistence. Default: `~/.switchboard/sessions.json`.
- `idlePattern` (string): Regex pattern for idle detection. Default: platform-appropriate prompt pattern.

### First-run setup
On first run, if no configuration file exists, the daemon MUST:
1. Generate a random 256-bit token (hex-encoded).
2. Generate a self-signed TLS certificate and key pair.
3. Write the configuration file with defaults + generated values.
4. Print the connection string to stdout: `switchboard://<host>:<port>?token=<token>&fingerprint=<cert-fingerprint>`
5. The user copies this connection string into the client to establish the first connection.

## Data Directory
All daemon state lives under `~/.switchboard/` (configurable via `SWITCHBOARD_HOME` environment variable):
```
~/.switchboard/
  daemon.json          # Configuration
  daemon.crt           # TLS certificate
  daemon.key           # TLS private key
  sessions.json        # Persisted session metadata
  buffers/             # Per-session output buffer files
    <session-id>.buf
```

# Wire Protocol

## Message Format
All messages are JSON objects sent as WebSocket text frames. Every message has a `type` field and a `seq` field.

```typescript
interface Message {
  type: string;       // Message type identifier
  seq: number;        // Monotonically increasing sequence number (per sender)
}
```

Sequence numbers are per-connection, per-direction. They enable detection of dropped messages on reconnect.

## Message Types

### Client → Daemon

| Type | Fields | Description |
|------|--------|-------------|
| `auth` | `token: string` | Authenticate the connection. Must be the first message. |
| `session:spawn` | `name: string, cwd: string, command?: string` | Create a new PTY session. |
| `session:input` | `sessionId: string, data: string` | Send input to a PTY. |
| `session:resize` | `sessionId: string, cols: number, rows: number` | Resize a PTY. |
| `session:close` | `sessionId: string` | Close a PTY session. |
| `session:rename` | `sessionId: string, name: string` | Rename a session. |
| `session:list` | *(none)* | Request list of all sessions. |
| `ping` | *(none)* | Keepalive ping. |

### Daemon → Client

| Type | Fields | Description |
|------|--------|-------------|
| `auth:ok` | `daemonId: string, hostname: string, version: string` | Authentication succeeded. |
| `auth:fail` | `reason: string` | Authentication failed. Daemon closes the connection. |
| `session:created` | `session: SessionInfo` | A session was created (response to spawn, or on reconnect). |
| `session:closed` | `sessionId: string, exitCode?: number` | A session was closed or exited. |
| `session:data` | `sessionId: string, data: string` | PTY output data. |
| `session:status` | `sessionId: string, status: string` | Session status changed (idle detection). |
| `session:renamed` | `sessionId: string, name: string` | Session was renamed. |
| `session:list` | `sessions: SessionInfo[]` | Full session list (response to list request, or on reconnect). |
| `replay:begin` | `sessionId: string, totalLines: number` | History replay is starting for a session. |
| `replay:data` | `sessionId: string, data: string` | Buffered output chunk during replay. |
| `replay:end` | `sessionId: string` | History replay complete for a session. |
| `pong` | *(none)* | Keepalive response. |
| `error` | `code: string, message: string, context?: object` | Error response. |

## Message Ordering
- Messages within a single WebSocket connection are ordered (WebSocket guarantees this).
- `session:data` messages for a given session are ordered and MUST NOT be reordered or batched across sessions.
- `replay:begin`, `replay:data`, `replay:end` form a sequence that MUST NOT be interleaved with live `session:data` for the same session.

## Connection Lifecycle
1. Client opens WebSocket connection to daemon.
2. Client sends `auth` message with token.
3. Daemon validates token:
   - Success: sends `auth:ok` followed by `session:list` with all active sessions.
   - Failure: sends `auth:fail` and closes the connection.
4. For each session in the list, daemon sends `replay:begin`, `replay:data` (chunked), `replay:end` to deliver buffered history.
5. After replay completes, live `session:data` messages stream in real time.
6. Client and daemon exchange `ping`/`pong` at a configurable interval (default: 30 seconds). If no pong is received within 2 intervals, the connection is considered dead.
7. On disconnect: client enters reconnection state. Daemon keeps all sessions running.
8. On reconnect: repeat from step 1. The daemon sends only output generated since the client's last known sequence number (delta replay).

# Transport

## WebSocket + TLS
- The daemon listens for secure WebSocket connections (`wss://`).
- TLS is REQUIRED. Plaintext WebSocket (`ws://`) MUST NOT be supported in production. A `--insecure` flag MAY be provided for local development only.
- The daemon uses the certificate and key from its configuration.
- Self-signed certificates are acceptable. The client validates using the certificate fingerprint from the connection string, not a CA chain.
- The client stores known daemon fingerprints locally (trust-on-first-use model, similar to SSH `known_hosts`).

## Network Resilience
- On connection loss, the client MUST automatically attempt reconnection with exponential backoff: 1s, 2s, 4s, 8s, capped at 30s.
- During reconnection, the client UI shows per-daemon connection status (connected / reconnecting / disconnected).
- Sessions in the sidebar remain visible during reconnection, with a visual indicator that the daemon is disconnected.
- On successful reconnect, the daemon performs delta replay (output since last known sequence number).
- The client MUST handle duplicate messages gracefully (idempotent message processing using sequence numbers).

# Authentication

## Token-Based Authentication (v3)
- The daemon generates a random 256-bit token on first setup.
- The client sends the token as the first message after connecting.
- The daemon compares the token using constant-time comparison.
- A failed auth attempt results in connection closure after a brief delay (prevent timing attacks).
- The token is stored in the daemon configuration file and in the client's connection configuration.

## Future Authentication Extensions
The auth handshake is designed to be extensible:
- The `auth` message may include an `authMethod` field (default: `"token"`).
- Future methods: `"certificate"` (mutual TLS), `"oauth"` (organizational identity).
- The daemon advertises supported auth methods in a pre-auth capabilities exchange (optional, not required for v3).

# Output Buffering

## Ring Buffer
- The daemon maintains a per-session ring buffer of terminal output.
- Buffer size is configurable (`scrollbackLimit` in daemon config). Default: 50,000 lines.
- The buffer stores raw terminal data (including escape sequences) — the client is responsible for rendering.
- Buffers are persisted to disk (`~/.switchboard/buffers/<session-id>.buf`) periodically and on daemon shutdown.
- On daemon restart, buffers are loaded from disk to enable history replay even after daemon restart.

## Replay Protocol
- On client connect/reconnect, the daemon sends buffered output for each active session.
- Replay is chunked: `replay:begin` → N × `replay:data` → `replay:end`.
- Chunk size: 64KB of raw data per `replay:data` message. This balances memory usage with message count.
- During replay, the client buffers incoming data and writes it to xterm.js. The client SHOULD show a loading indicator during replay for sessions with large buffers.
- Delta replay on reconnect: the daemon tracks the last sequence number acknowledged by each client. On reconnect, only output generated after that point is replayed.

# Session Lifecycle (Daemon-Side)

## Spawn
1. Client sends `session:spawn` with name, cwd, optional command.
2. Daemon validates inputs (non-empty name, valid cwd path).
3. Daemon spawns PTY via node-pty.
4. Daemon creates output buffer for the session.
5. Daemon attaches idle detector for the session.
6. Daemon sends `session:created` to all connected clients.
7. Daemon persists updated session metadata.

## Data Flow
- PTY output → daemon output buffer (append) → all connected clients (`session:data`).
- Client input (`session:input`) → daemon → PTY stdin.
- Multiple clients may be connected simultaneously. All receive output; any may send input. The daemon does not arbitrate — last-writer-wins (same as a shared tmux session).

## Status Changes
- Idle detector monitors PTY output and fires status transitions.
- Status changes are broadcast to all connected clients via `session:status`.

## Close
1. Client sends `session:close`.
2. Daemon kills the PTY process.
3. Daemon sends `session:closed` to all connected clients.
4. Daemon removes the output buffer.
5. Daemon persists updated session metadata.

## PTY Exit
- If a PTY exits on its own (shell exit, process termination):
1. Daemon sends `session:closed` with the exit code to all connected clients.
2. Daemon retains the output buffer for a configurable period (default: 5 minutes) so clients can still read history.
3. After the retention period, the buffer is discarded.

# Client Connection Manager

## Responsibilities
- Maintain connections to N daemons (configured in client preferences).
- Handle authentication, reconnection, and delta replay.
- Translate daemon messages into the existing renderer IPC interface so the UI layer requires minimal changes.
- Track per-daemon connection status and expose it to the renderer.
- Store daemon connection configurations locally: `{ name, host, port, token, fingerprint }`.

## Connection Configuration
Stored in the client's preferences (same `preferences.json`):
```typescript
interface DaemonConnection {
  id: string;           // UUID
  name: string;         // User-facing label (e.g., "Lab VM", "localhost")
  host: string;         // Daemon hostname or IP
  port: number;         // Daemon port
  token: string;        // Auth token
  fingerprint: string;  // TLS certificate fingerprint (SHA-256)
  autoConnect: boolean; // Connect on app start
}
```

## IPC Translation
The connection manager translates between the daemon wire protocol and the existing renderer IPC channels. From the renderer's perspective, the API surface is nearly identical — `pty:spawn`, `pty:data`, `pty:resize`, `pty:input`, `pty:close`, `session:list`, `session:status-changed` — but routed through daemon connections instead of local node-pty.

Session IDs become globally unique across daemons: `<daemonId>:<sessionId>`. The renderer uses composite IDs to address sessions.

# Migration Path

## Phase 1: Daemon process (standalone)
Build the daemon as a separate package/directory (`src/daemon/`). It is independently runnable and testable. No changes to the client yet.

## Phase 2: Client connection manager
Add the connection manager to the Electron main process. It connects to daemons and translates messages to the existing IPC interface. The renderer requires minimal changes — session IDs become composite, and connection status is surfaced in the UI.

## Phase 3: Remove direct PTY
Remove node-pty from the Electron main process. All sessions go through daemon connections. A localhost daemon is started automatically if configured (or the user starts it manually).

## Phase 4: Localhost auto-management (optional)
The client can optionally spawn and manage a localhost daemon process as a child process for zero-configuration local development. This is a convenience feature, not a requirement.

# Edge Cases / Fault Handling

**Daemon crashes while sessions are running:**
PTY processes are children of the daemon. If the daemon crashes, PTY processes are orphaned and eventually terminated by the OS. Output generated between daemon crash and restart is lost. Persisted session metadata allows the daemon to report which sessions existed, but they cannot be reattached. This is a known limitation — daemon stability is critical.

**Client connects while replay is in progress from another client:**
Each client gets its own replay. Replays are independent per connection.

**Client sends input during replay:**
Input is forwarded to the PTY immediately regardless of replay state. The user may see their input echoed before replay completes. The client SHOULD queue user input until replay ends for a given session, but this is a UX recommendation, not a protocol requirement.

**Daemon disk full (buffer persistence fails):**
Log a warning. Continue operating with in-memory buffers only. History will be lost on daemon restart.

**Invalid or expired token:**
Daemon sends `auth:fail` and closes the connection. Client prompts the user to update the token.

**TLS certificate mismatch:**
Client rejects the connection if the daemon's certificate fingerprint doesn't match the stored fingerprint. The client prompts the user to accept or reject the new fingerprint (trust-on-first-use update).

**Concurrent input from multiple clients:**
Both inputs are forwarded to the PTY in arrival order. No locking or arbitration. This matches the behavior of shared tmux sessions.

# Test Strategy

## Daemon
- Unit tests: session spawn, input relay, resize, close, status updates.
- Unit tests: output buffer (append, ring buffer eviction, serialization, replay).
- Unit tests: auth token validation (success, failure, timing safety).
- Unit tests: protocol message serialization/deserialization.
- Integration tests: full connection lifecycle (connect, auth, spawn, data flow, close).
- Integration tests: reconnection and delta replay.
- Integration tests: multiple concurrent clients.

## Client Connection Manager
- Unit tests: connection state machine (disconnected → connecting → authenticated → connected).
- Unit tests: IPC translation (daemon messages → renderer IPC channels).
- Unit tests: composite session ID generation and routing.
- Integration tests: connect to a test daemon, spawn session, exchange data.

## End-to-End
- E2E test: start daemon, start client, create session, type command, verify output.
- E2E test: disconnect client, reconnect, verify history replay.
- E2E test: two clients connected to same daemon, verify both receive output.

# Completion Criteria
1. Daemon process starts, accepts connections, and manages PTY sessions.
2. Client connects to daemon and renders terminal output identically to current local PTY behavior.
3. Client reconnects after network interruption with full history replay.
4. Multiple clients can connect to the same daemon simultaneously.
5. Client can connect to multiple daemons and display sessions from all in the sidebar.
6. Token-based authentication prevents unauthorized access.
7. All tests pass (unit, integration, E2E).
8. Existing client UI features (themes, shortcuts, search, backgrounds, etc.) work unchanged over daemon connections.

# Change Control
Regenerate-not-patch. Update version and provenance on every change.
