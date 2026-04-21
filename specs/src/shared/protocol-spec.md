---
title: Protocol Message Types Specification
version: 0.1.0
maintained_by: claude
domain_tags: [daemon, client, protocol, shared]
status: draft
governs: src/shared/protocol.ts
platform: claude-code
license: MIT
---

# Purpose
Define the shared wire protocol message types used between Switchboard clients and daemons. This module provides TypeScript interfaces for all 16 message types, serialization helpers, and sequence number management. Both client and daemon import from this shared module.

# Scope

## Covers
- All 16 message type interfaces (8 client-to-daemon, 8 daemon-to-client).
- Base message structure with `type` and `seq` fields.
- `SessionInfo` type shared across messages.
- Serialization (encode/decode) as JSON WebSocket text frames.
- Sequence number semantics.
- Union types for message routing.

## Does Not Cover
- Transport layer (WebSocket/TLS setup) -- governed by daemon transport spec.
- Message routing or dispatch logic -- governed by consumer specs.
- Authentication logic -- governed by daemon auth/config spec.

# Inputs
- For `serialize(msg)`: a typed message object.
- For `deserialize(raw)`: a raw JSON string from a WebSocket text frame.

# Outputs
- For `serialize(msg)`: a JSON string ready to send as a WebSocket text frame.
- For `deserialize(raw)`: a typed message object, or throws on invalid input.

# Responsibilities

## Base Message Interface
```typescript
interface BaseMessage {
  type: string;
  seq: number; // Monotonically increasing per sender per connection, starting at 1
}
```

## Session Info (Shared Type)
```typescript
interface SessionInfo {
  id: string;           // UUID
  name: string;         // User-facing label
  cwd: string;          // Working directory
  command: string;      // Shell command
  pid: number;          // PTY process ID
  status: SessionStatus;
}

type SessionStatus = 'working' | 'idle' | 'needs-attention';
```

## Client-to-Daemon Messages (8 types)

```typescript
interface AuthMessage extends BaseMessage {
  type: 'auth';
  token: string;
}

interface SessionSpawnMessage extends BaseMessage {
  type: 'session:spawn';
  name: string;
  cwd: string;
  command?: string;
}

interface SessionInputMessage extends BaseMessage {
  type: 'session:input';
  sessionId: string;
  data: string;
}

interface SessionResizeMessage extends BaseMessage {
  type: 'session:resize';
  sessionId: string;
  cols: number;
  rows: number;
}

interface SessionCloseMessage extends BaseMessage {
  type: 'session:close';
  sessionId: string;
}

interface SessionRenameMessage extends BaseMessage {
  type: 'session:rename';
  sessionId: string;
  name: string;
}

interface SessionListRequestMessage extends BaseMessage {
  type: 'session:list';
}

interface PingMessage extends BaseMessage {
  type: 'ping';
}
```

## Daemon-to-Client Messages (8 types)

Note: The architecture spec lists more than 8 distinct daemon-to-client types (auth:ok, auth:fail, session:created, session:closed, session:data, session:status, session:renamed, session:list, replay:begin, replay:data, replay:end, pong, error). For grouping purposes, the "8 daemon-to-client" count treats the replay messages (replay:begin, replay:data, replay:end) and the error message as part of the core 8, with auth:ok and auth:fail counted as one auth response group. All types below are defined individually.

```typescript
interface AuthOkMessage extends BaseMessage {
  type: 'auth:ok';
  daemonId: string;
  hostname: string;
  version: string;
}

interface AuthFailMessage extends BaseMessage {
  type: 'auth:fail';
  reason: string;
}

interface SessionCreatedMessage extends BaseMessage {
  type: 'session:created';
  session: SessionInfo;
}

interface SessionClosedMessage extends BaseMessage {
  type: 'session:closed';
  sessionId: string;
  exitCode?: number;
}

interface SessionDataMessage extends BaseMessage {
  type: 'session:data';
  sessionId: string;
  data: string;
}

interface SessionStatusMessage extends BaseMessage {
  type: 'session:status';
  sessionId: string;
  status: SessionStatus;
}

interface SessionRenamedMessage extends BaseMessage {
  type: 'session:renamed';
  sessionId: string;
  name: string;
}

interface SessionListMessage extends BaseMessage {
  type: 'session:list';
  sessions: SessionInfo[];
}

interface ReplayBeginMessage extends BaseMessage {
  type: 'replay:begin';
  sessionId: string;
  totalLines: number;
}

interface ReplayDataMessage extends BaseMessage {
  type: 'replay:data';
  sessionId: string;
  data: string;
}

interface ReplayEndMessage extends BaseMessage {
  type: 'replay:end';
  sessionId: string;
}

interface PongMessage extends BaseMessage {
  type: 'pong';
}

interface ErrorMessage extends BaseMessage {
  type: 'error';
  code: string;
  message: string;
  context?: Record<string, unknown>;
}
```

## Union Types

```typescript
type ClientMessage =
  | AuthMessage
  | SessionSpawnMessage
  | SessionInputMessage
  | SessionResizeMessage
  | SessionCloseMessage
  | SessionRenameMessage
  | SessionListRequestMessage
  | PingMessage;

type DaemonMessage =
  | AuthOkMessage
  | AuthFailMessage
  | SessionCreatedMessage
  | SessionClosedMessage
  | SessionDataMessage
  | SessionStatusMessage
  | SessionRenamedMessage
  | SessionListMessage
  | ReplayBeginMessage
  | ReplayDataMessage
  | ReplayEndMessage
  | PongMessage
  | ErrorMessage;

type AnyMessage = ClientMessage | DaemonMessage;
```

## Serialization

### `serialize(msg: AnyMessage): string`
- Calls `JSON.stringify(msg)`.
- Returns the resulting string.
- No additional framing -- WebSocket text frames handle message boundaries.

### `deserialize(raw: string): AnyMessage`
- Calls `JSON.parse(raw)`.
- Validates that the result is an object with a `type` field (string) and a `seq` field (non-negative integer).
- Returns the parsed message cast to `AnyMessage`.
- Throws `ProtocolError` if parsing fails or required fields are missing.

### `ProtocolError`
```typescript
class ProtocolError extends Error {
  constructor(message: string);
}
```

## Sequence Number Rules
- Sequence numbers are per-connection, per-direction (client and daemon each maintain their own counter).
- Sequence numbers start at 1 and increment by 1 for each message sent.
- Sequence numbers MUST be non-negative integers.
- The receiver uses sequence numbers to detect gaps on reconnect (delta replay).
- The `deserialize` function validates that `seq` is a non-negative integer but does NOT enforce monotonicity -- that is the consumer's responsibility.

## Serialization Format
- All messages are serialized as JSON text (UTF-8).
- Sent as WebSocket text frames (not binary frames).
- No compression at the protocol level (WebSocket per-message compression may be enabled at the transport layer).

# Edge Cases / Fault Handling

- **Malformed JSON**: `deserialize` throws `ProtocolError` with message indicating parse failure.
- **Missing `type` field**: `deserialize` throws `ProtocolError`.
- **Missing `seq` field**: `deserialize` throws `ProtocolError`.
- **`seq` is negative or non-integer**: `deserialize` throws `ProtocolError`.
- **Unknown `type` value**: `deserialize` does NOT reject unknown types -- it returns the parsed object. This allows forward compatibility when one side is upgraded before the other. Consumers handle unknown types.
- **Extra fields on messages**: Preserved through serialization/deserialization. No stripping.
- **Very large messages**: No size limit enforced at the protocol level. Transport layer may impose limits.

# Test Strategy

Test file: `tests/src/shared/protocol.test.ts`

- Unit test: `serialize` produces valid JSON for each of the 16+ message types.
- Unit test: `deserialize` round-trips with `serialize` for every message type.
- Unit test: `deserialize` throws `ProtocolError` on malformed JSON.
- Unit test: `deserialize` throws `ProtocolError` when `type` field is missing.
- Unit test: `deserialize` throws `ProtocolError` when `seq` field is missing.
- Unit test: `deserialize` throws `ProtocolError` when `seq` is negative.
- Unit test: `deserialize` throws `ProtocolError` when `seq` is not an integer (e.g., 1.5).
- Unit test: `deserialize` accepts unknown `type` values without throwing.
- Unit test: extra fields on messages survive round-trip.
- Unit test: union types correctly discriminate on `type` field (TypeScript compile-time check).

# Completion Criteria
1. All 16+ message type interfaces are defined and exported.
2. `SessionInfo` and `SessionStatus` types are defined and exported.
3. `ClientMessage` and `DaemonMessage` union types are defined and exported.
4. `serialize` and `deserialize` functions work correctly for all message types.
5. `ProtocolError` is thrown on invalid input to `deserialize`.
6. All tests pass.
