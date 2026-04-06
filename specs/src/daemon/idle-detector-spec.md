---
title: Daemon Idle Detector Specification
version: 0.1.0
maintained_by: claude
domain_tags: [daemon, idle-detection, session]
status: draft
governs: src/daemon/idle-detector.ts
platform: claude-code
license: MIT
---

# Purpose
Monitor PTY output streams in the daemon process to detect session status transitions: working, idle, and needs-attention. Uses prompt pattern matching and inactivity timers. This is the daemon-side equivalent of `src/main/idle-detector.ts`, with identical logic adapted for the daemon context.

# Scope

## Covers
- Per-session status state machine (working, idle, needs-attention).
- Prompt pattern matching on PTY output chunks.
- Configurable idle timeout and minimum activity duration.
- Configurable prompt pattern (via daemon config or environment variable).
- Callback-based status change notification.

## Does Not Cover
- PTY management -- governed by `pty-manager-spec.md`.
- WebSocket message dispatch of status changes -- handled by the daemon's message router.
- UI rendering of session status -- client-side concern.

# Inputs
- PTY output data chunks (`onOutput(sessionId, data)`).
- User input notifications (`onInput(sessionId)`).
- Session add/remove events.
- Configuration: optional `idlePattern` string from `DaemonConfig`.

# Outputs
- Status change callback invocations: `(sessionId: string, status: SessionStatus) => void`.

# Responsibilities

## State Machine

Each tracked session has one of three states:

```typescript
type SessionStatus = 'working' | 'idle' | 'needs-attention';
```

### Transitions
- `working -> idle`: No PTY output for `IDLE_TIMEOUT_MS` (10,000ms), and prompt pattern has NOT been detected.
- `working -> needs-attention`: Prompt pattern detected in PTY output after at least `MIN_ACTIVITY_MS` (2,000ms) of prior activity in the current output burst.
- `idle -> working`: Any new PTY output.
- `needs-attention -> working`: Any new user input sent to the PTY.

### Constants
```typescript
const IDLE_TIMEOUT_MS = 10_000;
const MIN_ACTIVITY_MS = 2_000;
const DEFAULT_PROMPT_PATTERN = /^[>❯$#]\s*$/m;
```

## Internal Tracking State

```typescript
interface SessionTracking {
  status: SessionStatus;
  idleTimer: ReturnType<typeof setTimeout> | null;
  firstOutputTime: number | null; // When output started in current burst
  lastOutputTime: number;
}
```

## Class Interface

```typescript
class IdleDetector {
  constructor(
    onStatusChange: (sessionId: string, status: SessionStatus) => void,
    promptPattern?: string  // Optional regex string from config
  );

  addSession(sessionId: string): void;
  removeSession(sessionId: string): void;
  onOutput(sessionId: string, data: string): void;
  onInput(sessionId: string): void;
  getStatus(sessionId: string): SessionStatus | undefined;
}
```

### `constructor(onStatusChange, promptPattern?)`
- Stores the status change callback.
- If `promptPattern` is provided, compiles it as a `RegExp` with the `m` (multiline) flag.
- If `promptPattern` is invalid, logs a warning and falls back to `DEFAULT_PROMPT_PATTERN`.
- If `promptPattern` is not provided, checks `process.env.SWITCHBOARD_PROMPT_PATTERN`. If set and valid, uses it. Otherwise uses `DEFAULT_PROMPT_PATTERN`.

### `addSession(sessionId: string): void`
- Creates a new tracking entry for the session with status `working`, no idle timer, `firstOutputTime` null, and `lastOutputTime` set to `Date.now()`.
- If session is already tracked, no-op (does not overwrite).

### `removeSession(sessionId: string): void`
- Clears the idle timer if set.
- Removes the session from the tracking map.
- No-op if session is not tracked.

### `onOutput(sessionId: string, data: string): void`
1. Look up the session tracking entry. Return silently if not found.
2. Record current time as `now`.
3. If `firstOutputTime` is null, set it to `now` (start of a new output burst).
4. Set `lastOutputTime` to `now`.
5. Clear existing idle timer.
6. Compute `activityDuration = now - firstOutputTime`.
7. If `activityDuration >= MIN_ACTIVITY_MS` AND the prompt pattern matches `data`:
   - Transition to `needs-attention`.
   - Return (do not set idle timer -- session is at a prompt).
8. If current status is not `working`, transition to `working`.
9. Set a new idle timer for `IDLE_TIMEOUT_MS`. When it fires:
   - Look up the session tracking entry.
   - If the session still exists and status is not `needs-attention`, transition to `idle`.

### `onInput(sessionId: string): void`
1. Look up the session tracking entry. Return silently if not found.
2. Reset `firstOutputTime` to null (new work cycle starting).
3. If current status is not `working`, transition to `working`.

### `getStatus(sessionId: string): SessionStatus | undefined`
- Returns the current status of the tracked session, or `undefined` if not tracked.

## Status Transition Rules
- Transitions only fire the callback when the status actually changes (same-status transitions are suppressed).
- The callback is invoked synchronously within the `onOutput` or `onInput` call (or from the idle timer callback).

# Edge Cases / Fault Handling

- **Output on untracked session**: `onOutput` silently returns. No error.
- **Input on untracked session**: `onInput` silently returns. No error.
- **Remove already-removed session**: `removeSession` is a no-op.
- **Add already-tracked session**: `addSession` is a no-op (preserves existing state).
- **Invalid prompt pattern in config**: Falls back to `DEFAULT_PROMPT_PATTERN` with a warning log.
- **Invalid prompt pattern in environment variable**: Falls back to `DEFAULT_PROMPT_PATTERN` (same as existing Electron implementation).
- **Very rapid output**: Each chunk resets the idle timer. Prompt pattern is tested on every chunk. Performance is bounded by V8 regex engine on individual chunks.
- **Session removed while idle timer is pending**: `removeSession` clears the timer. Timer callback checks if session exists and no-ops if removed.
- **Empty output data**: Passed to prompt pattern. An empty string will not match `DEFAULT_PROMPT_PATTERN`. Idle timer is still reset.

# Test Strategy

Test file: `tests/src/daemon/idle-detector.test.ts`

- Unit test: new session starts with `working` status.
- Unit test: output data keeps status as `working`.
- Unit test: no output for 10s transitions to `idle` (use fake timers).
- Unit test: output after idle transitions back to `working`.
- Unit test: prompt pattern detected after >= 2s of activity transitions to `needs-attention`.
- Unit test: prompt pattern detected before 2s of activity does NOT transition to `needs-attention`.
- Unit test: user input resets from `needs-attention` to `working`.
- Unit test: user input resets `firstOutputTime` to null (new work cycle).
- Unit test: rapid output resets idle timer (only last timer fires).
- Unit test: custom prompt pattern via constructor parameter works.
- Unit test: invalid prompt pattern in constructor falls back to default.
- Unit test: `SWITCHBOARD_PROMPT_PATTERN` environment variable is used when set.
- Unit test: invalid `SWITCHBOARD_PROMPT_PATTERN` falls back to default.
- Unit test: `removeSession` clears pending idle timer.
- Unit test: `getStatus` returns `undefined` for untracked session.
- Unit test: `addSession` on already-tracked session is a no-op.
- Unit test: status change callback is not invoked for same-status transitions.
- Unit test: `onOutput` on untracked session does not throw.

# Completion Criteria
1. State machine transitions match the specification exactly.
2. Prompt pattern matching uses configurable regex with correct fallback chain.
3. Idle timer fires after 10s of inactivity, resettable by output.
4. Minimum activity duration (2s) is enforced before needs-attention transitions.
5. Callback-based design decouples from transport layer.
6. All tests pass.
