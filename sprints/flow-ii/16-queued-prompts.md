---
sprint: 16
title: Queued Prompts
milestone: Flow II
status: planned
---

# Goal
Let a user pre-stage a prompt for a session. When the session transitions to `needs-attention`, the queued prompt is automatically sent (as if the user typed it and pressed Enter) and cleared. This is the v4 observable: *"Queued prompts: pre-stage a prompt per session; fire it when the session needs attention."*

# Design

## Behavior
- Each session can have **at most one** queued prompt at a time.
- Queued prompts are **client-local** — stored per session ID in the renderer state, not sent to the daemon. The client that queued it is the one that fires it. (Rationale: the user who queued it is almost always the one watching for it; avoids races with other connected clients; no protocol change.)
- Fires **only** on the `idle → needs-attention` transition (not on `working → idle`, not on re-entry to needs-attention if it never went idle in between).
- **One-shot:** fires once, then the queue is cleared. User must re-queue for the next round.
- Sent as the prompt text followed by a newline (`\r`), via the existing `pty:input` channel.

## UI
- A collapsible input bar below each terminal pane (hidden by default, toggled with a small icon in the tab header or a keyboard shortcut — `Ctrl+Shift+Q`; `Ctrl+Q` is reserved as the standard quit shortcut on Linux).
- Placeholder: "Queue a prompt to send when ready…"
- When a prompt is queued, the sidebar tab shows a small indicator (e.g. a paper-airplane icon beside the status dot).
- A "Cancel" button in the queue bar clears without firing.

## Deliverables

### Implementation
- `src/renderer/state/queued-prompts.tsx` (new) — React context + reducer holding `Map<sessionId, string>`. Actions: `queue(id, text)`, `clear(id)`, `consume(id)` (returns and clears). Persisted to `localStorage` so a brief client restart doesn't lose queued prompts.
- `src/renderer/components/QueuedPromptBar.tsx` (new) — the input bar component.
- Update `src/renderer/components/TerminalPane.tsx` — render the bar; own a toggle flag per session.
- Update `src/renderer/components/SessionTab.tsx` / `SortableSessionTab.tsx` — show the queued indicator.
- Update `src/renderer/hooks/useKeyboardShortcuts.ts` — add `Ctrl+Shift+Q` to toggle the queue bar.
- Hook into session status changes: when a session's status transitions to `needs-attention` AND it has a queued prompt, send the prompt via `window.switchboard.pty.input(id, text + '\r')` and consume.

### Specs
- `specs/src/renderer/state/queued-prompts-spec.md`
- Update existing component specs (TerminalPane, SessionTab) to note the new integration.

### Tests
- `tests/renderer/state/queued-prompts.test.tsx` — reducer/actions, localStorage round-trip.
- `tests/renderer/components/QueuedPromptBar.test.tsx` — input, submit, clear.
- Integration test: status transition triggers fire + consume.

# Acceptance Criteria
- User can toggle the queue bar on a session, type a prompt, and press Enter (or a "Queue" button) to stage it.
- When the session goes `needs-attention`, the queued prompt is sent and the queue is cleared.
- Sidebar tab shows a queued-prompt indicator while a prompt is staged.
- Queue bar toggle is bound to `Ctrl+Shift+Q` (overrideable in shortcuts prefs).
- Queued prompts survive a renderer hot-reload / brief client restart (via localStorage).
- All tests pass.

# Dependencies
- Daemon (v3) — uses existing `session:status` broadcast and `pty:input` IPC.

# Notes
- Firing on `needs-attention` means the prompt goes in as soon as Claude Code (or another agent) stops and waits for input. That's the intended workflow.
- Client-local queue is a deliberate v4 scope choice. If multiple clients are watching the same session and both have queued prompts, whichever fires first wins. If daemon-side queueing is needed later, the protocol can add a `session:queue-prompt` message and the state can migrate.
