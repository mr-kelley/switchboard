---
title: Connection Manager Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, main-process, daemon-client, sessions]
status: active
platform: claude-code
license: Apache-2.0
governs: src/main/connection-manager.ts
---

# Purpose
Client-side bridge between the Electron main process and one or more daemons. Owns daemon connection lifecycle (WebSocket + TLS, auth, reconnect), routes session commands to the right daemon by composite session ID, tracks session state, relays daemon events to renderer windows, and—added in Sprint 19—exposes an attention summary and a status-change subscription for the system tray plus priority-aware OS notifications.

# Scope

## Covers
- Managing a set of daemon connections keyed by daemon ID.
- Routing PTY/session commands to the owning daemon via composite IDs (`<daemonId>:<sessionId>`).
- Maintaining per-connection session maps and statuses.
- Broadcasting daemon events to renderer windows.
- Firing OS notifications on `needs-attention`, honoring per-session priority.
- Providing an aggregate attention summary and a status-change subscription for the tray.

## Does Not Cover
- The daemon protocol itself (owned by `src/shared/protocol.ts`).
- Notification content/routing rules (owned by `notifications-spec.md`).
- Tray rendering (owned by `tray-spec.md`).
- Preference persistence (owned by `preferences-store-spec.md`).

# Inputs
- Constructor: optional `PreferencesStore` (used to persist non-localhost daemon configs and to resolve per-session notification priorities).
- `DaemonConnectionConfig` objects (add/connect/remove/pair).
- Session commands routed from IPC (spawn/resize/close/input/queue/replay) keyed by composite session ID.
- Incoming daemon messages over the WebSocket.

# Outputs
- Renderer broadcasts (e.g., `session:status-changed`, `pty:data`, `pty:exit`, `daemon:status-changed`, `daemon:session-created`).
- OS notifications via `notifyIfNeeded`.
- Query results:
  - `getConnectionStatuses(): Array<{ id; name; status; sessionCount }>`.
  - `getAllSessions(): SessionInfo[]` (composite IDs).
  - `getAttentionSummary(): { total: number; perDaemon: Array<{ id; name; status; sessionCount; attentionCount }> }` — **new**.
- Subscription: `onAttentionChange(listener: () => void): () => void` — **new**; returns an unsubscribe function.

# Responsibilities
- **Connection lifecycle:** add, connect (WS+TLS, token auth), reconnect with backoff, disconnect, remove; persist non-localhost configs to preferences (localhost is re-added each launch by auto-start and is excluded).
- **Routing:** parse composite IDs to find the owning connection; reject/ignore commands whose daemon is unknown.
- **Session tracking:** maintain `sessions` per connection; update status on `session:status` messages.
- **Notification routing (updated, Sprint 19):** on a `session:status` message with status `needs-attention`, resolve the session's priority from `prefsStore.load().notificationPriorities[compositeId]` (default `normal`) and call `notifyIfNeeded(name, isAppFocused(), priority)`. Status broadcast to the renderer and tray accounting MUST happen regardless of priority (including `silent`).
- **Attention summary (new):** `getAttentionSummary()` returns the total count of sessions with status `needs-attention` across all connections, plus a per-daemon breakdown (id, name, connection status, session count, attention count).
- **Status-change subscription (new):** maintain a list of listeners; `onAttentionChange` registers one and returns an unsubscribe. Listeners are invoked after any change that can affect the attention summary: session status change, session created, session closed, and daemon connect/disconnect.

# Edge Cases / Fault Handling
- Unknown composite ID on a routed command → no-op (no throw).
- Missing `PreferencesStore` → notification priority defaults to `normal`; attention summary still works.
- Listener throwing → MUST NOT break status processing (listeners are best-effort; a throw must not prevent broadcasts or other listeners).
- Disconnected daemon → still represented in `getConnectionStatuses`/`getAttentionSummary` with its connection status and current (possibly stale) session counts.

# Test Strategy
Unit tests under `tests/main/` (Vitest). For Sprint 19 the focused additions are:
- `getAttentionSummary()` totals and per-daemon breakdown given a constructed set of sessions/statuses.
- `onAttentionChange` listeners fire on status change and unsubscribe correctly; a throwing listener does not break processing.
- Notification routing: `needs-attention` with `silent` priority does not fire a notification but still broadcasts status; `high` fires even when focused (verified via the `notifications` module's own tests + a call-site check).
Existing connection/routing behavior is covered by the broader connection-manager tests.

# Completion Criteria
- `getAttentionSummary()` and `onAttentionChange()` exist and behave as specified.
- Notification routing consults per-session priority and never suppresses status broadcasts.
- New behavior is covered by passing tests; no regression in existing connection-manager tests.
