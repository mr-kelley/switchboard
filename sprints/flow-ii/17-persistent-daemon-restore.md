---
sprint: 17
title: Persistent Daemon — Session Restore & Replay-on-Demand
milestone: Flow II
status: in-progress
---

# Goal
Close the cross-restart history loop for localhost. The daemon already persists session metadata (`sessions.json`) and output buffers (`buffers/<id>.buf`) to disk, but it never reads them on boot. As a result, killing and relaunching the daemon (which happens implicitly when the Electron client closes) discards every localhost session.

In the same stroke, address the replay-history gap from PR #34: clients that hydrate sessions via `session.list()` see live output but no scrollback, because `replay:*` only fires once per WebSocket connect.

This sprint resolves Part 1 of Issue #32 and the rc.6 known gap.

# Design

## Daemon-side

### Stable session IDs across restart
- Add `id` to `SavedSession` (currently: `name`, `cwd`, `command`).
- `SessionStore.load()` returns sessions with their original IDs.
- `PtyManager.spawn()` accepts an optional `id` in its config; when present, use it instead of generating a fresh UUID.
- `OutputBuffer` already loads from disk on construction — once IDs are stable, the buffer path matches the saved file and history materializes for free.

### Boot-time restore
- `Daemon` constructor (after wiring callbacks, before `start()` returns) calls `sessionStore.load()` and respawns each saved session.
- For each restored session: spawn PTY with saved id/name/cwd/command, attach idle detector, create OutputBuffer at the same persist path (auto-loads history), broadcast `session:created` to any later-connecting clients.
- Failures (e.g. `cwd` no longer exists) are logged and skipped; the saved entry is dropped so the next persist clears it.

### Replay-on-demand protocol
- New client → daemon message: `session:replay-request { sessionId }`.
- Daemon handler: emit `replay:begin/data/end` for that session to the requesting connection only (not broadcast). Mirrors `handleClientConnect`'s replay block but scoped to one session.
- Empty buffers still get a `replay:begin (totalBytes: 0)` + `replay:end` so the client can detect "no history" cleanly.

## Client-side

- `connection-manager.ts` — add `requestReplay(compositeSessionId)` that routes to the right daemon.
- `preload.ts` — expose `session.requestReplay(sessionId)`.
- `TerminalPane.tsx` — on first mount for a given session, call `session.requestReplay()` after subscribing to `pty.onData`. The replay events flow through the existing `replay:data` → `pty:data` path.

## Protocol additions (in `src/shared/protocol.ts`)

| Message | Direction | Payload |
|---|---|---|
| `session:replay-request` | client → daemon | `{ sessionId }` |

(`replay:begin/data/end` already exist; just made requestable.)

# Deliverables

## Implementation
- **Daemon**:
  - `src/daemon/session-store.ts` — add `id` to `SavedSession`, preserve through load/save.
  - `src/daemon/pty-manager.ts` — accept optional `id` in spawn config.
  - `src/daemon/daemon.ts` — boot-time restore loop, `handleReplayRequest()`, route in `handleMessage`. `persistSessions()` must include IDs.
- **Client main**:
  - `src/main/connection-manager.ts` — `requestReplay()` method, IPC bridge.
  - `src/main/ipc-handlers.ts` — handler for `session:replay-request`.
  - `src/main/preload.ts` — expose `session.requestReplay()`.
- **Renderer**:
  - `src/renderer/components/TerminalPane.tsx` — request replay on mount.

## Specs
- `specs/src/daemon/session-store-spec.md` — update for `id` field.
- `specs/src/daemon/pty-manager-spec.md` — note optional `id` in spawn config.
- `specs/src/daemon/daemon-spec.md` — add boot-time restore behavior and replay-request handling.

## Tests
- `tests/daemon/session-store.test.ts` — round-trip with `id` field; backward-compatible load when older saved data lacks it.
- `tests/daemon/daemon.test.ts` (or extend existing) — boot-time restore: write `sessions.json`, instantiate daemon, verify sessions present.
- `tests/daemon/pty-manager.test.ts` — spawn with provided ID uses that ID.
- `tests/main/connection-manager.test.ts` — `requestReplay` routes to correct daemon.

# Acceptance Criteria
- Daemon restart with non-empty `sessions.json` respawns those sessions with stable IDs; clients see them on next connect.
- Output buffer history is preserved across daemon restart for restored sessions (within the configured `scrollbackLimit`).
- Reopening the client (which terminates and respawns the localhost daemon child) restores both the session list AND the terminal scrollback.
- `session:replay-request` returns the current buffer contents for a given session, regardless of when the client originally connected.
- TerminalPane shows scrollback automatically when mounted for an existing daemon session.
- All tests pass.

# Dependencies
- Daemon (v3) — uses existing `SessionStore`, `OutputBuffer`, `replay:*` plumbing.
- Sprint 16 — does not touch the queued-prompts code path.

# Notes
- Restored sessions are *fresh PTYs* — only the configuration and scrollback survive. Process state (in-flight commands, editor buffers, etc.) is gone. This is the explicit trade-off from Issue #32 and matches user expectation for "the daemon ate my sessions when I closed the client" being undesirable.
- This sprint covers the localhost-via-child-process model only. Sprint 18 (systemd user service) decouples the daemon from the client lifecycle entirely — restoring sessions then becomes a "the daemon never died" affair, and the boot-restore path here remains relevant only for actual reboots / explicit service restarts.
- `session:replay-request` is also useful long-term: lets a client "rewind" a session it had collapsed into the sidebar without re-mounting the WS, and creates a clean primitive for any future "scroll back further than the in-memory buffer" feature.
