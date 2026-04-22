---
sprint: 16
title: Queued Prompts
milestone: Flow II
status: in-progress
---

# Goal
Let a user pre-stage a prompt for a session. When the session transitions into `needs-attention`, the daemon automatically sends the queued prompt to the PTY (as if the user typed it and pressed Enter) and clears the queue. This is the v4 observable: *"Queued prompts: pre-stage a prompt per session; fire it when the session needs attention."*

# Design

## Scope revision

Initial draft had queued prompts as **client-local** state. During Sprint 16 testing the user pointed out two gaps that design couldn't cover:
1. Cross-device continuity — working from laptop one day and workstation the next should see the same queue against the same remote daemon.
2. Client-restart continuity — the client-local queue vanished when localStorage wasn't refreshed before a sync bug wiped it.

Revised to **daemon-side** state. The daemon owns the queue, enforces a strict 0-or-1 per session, persists to disk, and fires on status transitions independent of any connected client. All clients see the same queue via broadcast.

## Behavior
- Each session can have **at most one** queued prompt at a time. Strict — second queue attempt is **rejected** (not overwritten) with a reason sent to the requesting client only.
- Queue lives on the **daemon**, persisted to `~/.switchboard/queued-prompts.json` alongside sessions.json.
- Fires on transition **into** `needs-attention` (from any previous state). Since firing is daemon-side, this works even if the queuing client has since disconnected.
- **One-shot**: after firing, queue is cleared and broadcast to all connected clients.
- Sent as the prompt text followed by `\r` via the existing PTY input path.

## Protocol additions (in `src/shared/protocol.ts`)

| Message | Direction | Payload |
|---|---|---|
| `session:queue-prompt` | client → daemon | `{ sessionId, text }` |
| `session:clear-queue` | client → daemon | `{ sessionId }` |
| `session:queue-updated` | daemon → all clients | `{ sessionId, text: string \| null }` |
| `session:queue-rejected` | daemon → requesting client | `{ sessionId, reason }` |

`session:list` payload gains `queuedPrompts?: Record<sessionId, text>` so a newly connected client syncs the current queue state.

## UI
- A collapsible input bar below each terminal pane (hidden by default, toggled with a keyboard shortcut — `Ctrl+Shift+Q`; `Ctrl+Q` is reserved as the standard quit shortcut on Linux).
- **Mode-based**: if queue is empty, show input + Queue button. If already queued, show the current text + Clear button (no editing; clear then re-queue to change).
- When a prompt is queued, the sidebar tab shows a small ✎ indicator beside the status dot.
- On `queue-rejected`, an inline error displays in the bar for 4s, auto-dismissed.

## Deliverables

### Implementation
- **Daemon**:
  - `src/daemon/queued-prompts.ts` (new) — `Map<sessionId, string>` with strict 0/1 semantics, JSON-backed disk persistence.
  - Update `src/daemon/daemon.ts` — wire `QueuedPrompts` into status transitions (consume on `needs-attention`, write `<text>\r` to PTY, broadcast `queue-updated`). Handle new message types. Include queue snapshot in `session:list`.
- **Client main**:
  - Update `src/main/connection-manager.ts` — bridge new IPC ↔ protocol messages, convert composite session IDs on broadcast.
  - Update `src/main/ipc-handlers.ts` — handlers for `session:queue-prompt` and `session:clear-queue`.
  - Update `src/main/preload.ts` — expose `session.queuePrompt`, `session.clearQueue`, `session.onQueueUpdated`, `session.onQueueRejected`, `session.onQueueSync`.
- **Renderer**:
  - `src/renderer/state/queued-prompts.tsx` — React context with reducer. State shape: `{ queued: Record<sessionId, string>, lastRejection }`. Subscribes to daemon events; dispatches writes via IPC.
  - `src/renderer/components/QueuedPromptBar.tsx` — mode-based UI.
  - `src/renderer/components/SessionTab.tsx` / `SortableSessionTab.tsx` — ✎ indicator.
  - `src/renderer/components/TerminalPane.tsx` — render bar; resize hook on toggle.
  - `src/renderer/hooks/useKeyboardShortcuts.ts` — `Ctrl+Shift+Q` binding.

### Specs
- `specs/src/daemon/queued-prompts-spec.md`
- `specs/src/renderer/state/queued-prompts-spec.md`
- Update existing component specs (TerminalPane, SessionTab) to note the new integration.

### Tests
- `tests/daemon/queued-prompts.test.ts` — tryQueue/clear/consume semantics, disk persistence, reject-on-duplicate.
- `tests/renderer/state/queued-prompts.test.tsx` — IPC-dispatch, broadcast-to-state mapping, rejection handling.
- `tests/renderer/components/QueuedPromptBar.test.tsx` — mode-based UI, submit, clear, error display.

# Acceptance Criteria
- User can toggle the queue bar on the active session, type a prompt, and press Enter (or click Queue) to stage it.
- Queue bar toggle is bound to `Ctrl+Shift+Q` (overrideable in shortcuts prefs).
- When the session transitions into `needs-attention` on the daemon, the queued prompt is sent to the PTY and the queue is cleared — broadcast to all connected clients.
- Sidebar tab shows a ✎ indicator while a prompt is queued for that session.
- Queued prompts survive client close/reopen (daemon persists them).
- Two connected clients see the same queue state in real time.
- A second client attempting to queue into a full queue gets `queue-rejected`; the existing prompt is not overwritten.
- All tests pass.

# Dependencies
- Daemon (v3) — uses existing `session:status` broadcast and PTY input path.

# Notes
- Daemon-side state was chosen over client-local after the user identified the multi-device use case. Makes the feature work across laptop ↔ workstation against the same remote daemon, and survives client restart without localStorage bugs.
- Strict 0/1 per session is an intentionally minimal primitive. Queueing N prompts, priority ordering, or per-user quotas can be layered on later without breaking this semantics.
