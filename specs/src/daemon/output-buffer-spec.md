---
title: Daemon Output Buffer Specification
version: 0.1.0
maintained_by: claude
domain_tags: [daemon, buffer, replay, persistence]
status: draft
governs: src/daemon/output-buffer.ts
platform: claude-code
license: MIT
---

# Purpose
Provide a per-session ring buffer that stores raw terminal output data. Supports append, eviction at capacity, persistence to disk, and chunked replay for client reconnection. Enables the daemon to deliver session history to newly connected or reconnecting clients.

# Scope

## Covers
- Per-session ring buffer with configurable line limit.
- Append of raw terminal data (including escape sequences).
- Oldest-line eviction when at capacity.
- Disk persistence to `~/.switchboard/buffers/<session-id>.buf`.
- Loading persisted buffers on daemon restart.
- Chunked replay (64KB per chunk).
- Delta replay support via sequence numbers.
- Buffer removal on session close.

## Does Not Cover
- Terminal rendering or escape sequence interpretation -- raw bytes are stored and replayed.
- WebSocket framing -- replay messages are constructed by the caller using protocol types.
- Session lifecycle management -- governed by `pty-manager-spec.md`.

# Inputs
- Raw terminal output data strings from PTY sessions.
- Session IDs for addressing buffers.
- Configuration: `scrollbackLimit` (line count) and data directory path.

# Outputs
- Replay chunks: arrays of data strings, each up to 64KB.
- Total line count for a session's buffer.
- Persisted `.buf` files on disk.

# Responsibilities

## Class Interface

```typescript
class OutputBuffer {
  constructor(config: {
    scrollbackLimit: number;   // Max lines per session. Default: 50000
    dataDir: string;           // Base data directory (e.g., ~/.switchboard)
  });

  append(sessionId: string, data: string): void;
  getReplayChunks(sessionId: string): string[];
  getDeltaReplayChunks(sessionId: string, sinceSeq: number): string[];
  getTotalLines(sessionId: string): number;
  getLastSeq(sessionId: string): number;
  createBuffer(sessionId: string): void;
  removeBuffer(sessionId: string): void;
  persistBuffer(sessionId: string): void;
  persistAll(): void;
  loadBuffer(sessionId: string): boolean;
  loadAll(sessionIds: string[]): void;
}
```

## Internal Data Model

Each session buffer tracks:
```typescript
interface BufferState {
  lines: string[];       // Ring buffer of raw terminal lines
  writeIndex: number;    // Next write position (wraps at scrollbackLimit)
  totalAppended: number; // Total lines ever appended (for sequencing)
  isFull: boolean;       // Whether the ring buffer has wrapped at least once
}
```

## Line Splitting
- Incoming data is split on `\n` (newline characters).
- Partial lines (data not ending in `\n`) are held in a per-session accumulator and prepended to the next append call's first line.
- Empty splits are not stored as lines.

## Ring Buffer Behavior

### `createBuffer(sessionId: string): void`
- Creates a new empty `BufferState` for the session.
- If a buffer already exists for this session, replaces it (fresh buffer).
- Creates the buffers directory (`<dataDir>/buffers/`) if it does not exist.

### `append(sessionId: string, data: string): void`
- Split the data into lines using the line-splitting rules above.
- For each complete line:
  - Write to `lines[writeIndex]`.
  - Increment `writeIndex`. If `writeIndex >= scrollbackLimit`, set `writeIndex = 0` and `isFull = true`.
  - Increment `totalAppended`.
- No-op if session buffer does not exist (does not throw).

### Ring Buffer Eviction
- When `isFull` is true, the buffer has wrapped. The oldest lines are at `writeIndex` (the next position to be overwritten).
- Eviction is implicit: writing past the end overwrites the oldest line.

### `getTotalLines(sessionId: string): number`
- Returns `scrollbackLimit` if `isFull`, otherwise `writeIndex`.
- Returns 0 if session buffer does not exist.

### `getLastSeq(sessionId: string): number`
- Returns `totalAppended` for the session.
- Returns 0 if session buffer does not exist.

## Replay

### `getReplayChunks(sessionId: string): string[]`
- Returns an array of string chunks, each up to 64KB (`65536` bytes, measured by UTF-8 byte length).
- Lines are joined with `\n` and accumulated into chunks.
- When adding a line would exceed 64KB, the current chunk is finalized and a new chunk starts.
- Lines are read in chronological order:
  - If `isFull`: read from `writeIndex` to end, then from 0 to `writeIndex - 1`.
  - If not full: read from 0 to `writeIndex - 1`.
- Returns empty array if session buffer does not exist.

### `getDeltaReplayChunks(sessionId: string, sinceSeq: number): string[]`
- Returns replay chunks containing only lines appended after sequence number `sinceSeq`.
- Compute `linesToSkip = sinceSeq` and `linesToReplay = totalAppended - sinceSeq`.
- If `linesToReplay <= 0`, return empty array (client is up to date).
- If `linesToReplay > current buffer size` (lines were evicted), return a full replay via `getReplayChunks`.
- Otherwise, read the last `linesToReplay` lines from the ring buffer in order and chunk them.

### Chunk Size Constant
```typescript
const REPLAY_CHUNK_SIZE = 65536; // 64KB in bytes
```

## Disk Persistence

### `persistBuffer(sessionId: string): void`
- Serialize the buffer state to disk at `<dataDir>/buffers/<sessionId>.buf`.
- File format: JSON containing `{ lines, writeIndex, totalAppended, isFull, partial }` where `partial` is the current line accumulator content.
- Write atomically: write to a temp file (`<sessionId>.buf.tmp`) then rename.
- No-op if session buffer does not exist.
- Catch and log write errors (do not throw).

### `persistAll(): void`
- Calls `persistBuffer` for every active session buffer.
- Used on daemon shutdown and periodic flush.

### `loadBuffer(sessionId: string): boolean`
- Load buffer state from `<dataDir>/buffers/<sessionId>.buf`.
- Parse the JSON, restore `BufferState` and the partial line accumulator.
- Returns `true` if loaded successfully, `false` if file missing or corrupt.
- On corrupt file: log warning, return `false`.

### `loadAll(sessionIds: string[]): void`
- Calls `loadBuffer` for each session ID.
- Sessions that fail to load are silently skipped (log warning).

### `removeBuffer(sessionId: string): void`
- Removes the session buffer from memory.
- Deletes the persisted file `<dataDir>/buffers/<sessionId>.buf` from disk.
- Catch and log deletion errors (file may not exist).

## Persistence File Format
```json
{
  "version": 1,
  "lines": ["line1", "line2", "..."],
  "writeIndex": 42,
  "totalAppended": 1500,
  "isFull": false,
  "partial": ""
}
```

The `version` field enables future format migration. Current version is `1`.

# Edge Cases / Fault Handling

- **Append to non-existent session**: Silently ignored (no throw). Logged at debug level.
- **Replay of non-existent session**: Returns empty array.
- **Delta replay with sinceSeq = 0**: Equivalent to full replay.
- **Delta replay with sinceSeq > totalAppended**: Returns empty array (client has future data -- likely a bug, but safe).
- **Delta replay where eviction has passed sinceSeq**: Falls back to full replay (some history lost).
- **Data with no newlines**: Accumulated in partial buffer. Only complete lines enter the ring buffer.
- **Data with only newlines**: Each `\n` produces a line boundary. Empty lines between newlines are not stored.
- **Very large single line**: Stored as-is. No per-line size limit.
- **Disk full on persist**: Catch error, log warning, continue with in-memory buffer only.
- **Corrupt persistence file on load**: Log warning, return false, buffer starts empty.
- **Persistence file from future version**: Log warning, return false (do not attempt migration).
- **Concurrent persist and load**: Not expected (single daemon process, single-threaded event loop). No locking needed.
- **Session removed while persist is writing temp file**: The rename will succeed or fail harmlessly. Remove cleans up the final file.

# Test Strategy

Test file: `tests/src/daemon/output-buffer.test.ts`

- Unit test: `createBuffer` initializes an empty buffer for a session.
- Unit test: `append` stores lines in the buffer.
- Unit test: `append` splits data on newline characters.
- Unit test: `append` accumulates partial lines across calls.
- Unit test: ring buffer evicts oldest lines when at capacity.
- Unit test: `getTotalLines` returns correct count before and after wrapping.
- Unit test: `getLastSeq` returns `totalAppended`.
- Unit test: `getReplayChunks` returns all lines in chronological order.
- Unit test: `getReplayChunks` respects 64KB chunk size limit.
- Unit test: `getReplayChunks` returns empty array for non-existent session.
- Unit test: `getDeltaReplayChunks` returns only lines after sinceSeq.
- Unit test: `getDeltaReplayChunks` returns empty array when client is up to date.
- Unit test: `getDeltaReplayChunks` falls back to full replay when eviction has passed sinceSeq.
- Unit test: `persistBuffer` writes a valid JSON file to disk.
- Unit test: `loadBuffer` restores buffer state from a persisted file.
- Unit test: `persistBuffer` + `loadBuffer` round-trip preserves all state including partial line accumulator.
- Unit test: `loadBuffer` returns false for missing file.
- Unit test: `loadBuffer` returns false for corrupt JSON.
- Unit test: `loadBuffer` returns false for future version number.
- Unit test: `removeBuffer` removes from memory and deletes file from disk.
- Unit test: `persistAll` persists all active buffers.
- Unit test: `append` to non-existent session is a silent no-op.
- Integration test: append many lines exceeding scrollbackLimit, verify eviction and correct chronological replay order.
- Integration test: persist, remove from memory, load, verify replay matches pre-persist state.

# Completion Criteria
1. Ring buffer correctly stores and evicts lines at the configured capacity.
2. Line splitting handles partial lines, newlines, and edge cases.
3. Replay produces chronologically ordered chunks within the 64KB size limit.
4. Delta replay returns only new data since a given sequence number.
5. Disk persistence round-trips correctly (write, load, verify).
6. All operations are defensive (no throws on missing sessions, disk errors logged not propagated).
7. All tests pass.
