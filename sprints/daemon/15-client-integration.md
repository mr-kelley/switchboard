---
sprint: 15
title: Client Integration — Remove Direct PTY, Localhost Auto-Start
milestone: Daemon
status: in-progress
---

# Goal
Complete the client-server transition. Remove direct node-pty from the Electron main process so all sessions — including localhost — are daemon-managed. Implement localhost daemon auto-start so zero-config UX is preserved for users who never touch Preferences.

# Scope Notes
Scope narrowed from the original planning draft. Deferred to v4 Flow II (where they belong under the "Session groups" observable): sidebar per-daemon grouping, dedicated `ConnectionManager.tsx` component. The existing Preferences → Daemons section already covers add/remove/connect/disconnect.

# Deliverables

## Implementation
- Remove local PTY fallback in `src/main/ipc-handlers.ts`: drop the `if (daemonId)` branch's `else` and the `hasDaemons()` gate around session restore.
- Delete `src/main/session-manager.ts`, `src/main/idle-detector.ts`, `src/main/session-store.ts`. Their functionality lives on the daemon. Keep `src/main/notifications.ts` — still used by `connection-manager.ts` for OS-level notifications (which must stay client-side since they depend on local app focus).
- `src/main/local-daemon.ts` (new) — spawns the packaged daemon binary/script as a child process when no daemons are configured. Reuses the daemon's config file at `~/.switchboard/daemon.json`; auto-adds itself to the client's daemon list and connects on app startup.
- Update `src/main/main.ts` to wire in local-daemon lifecycle (start on `ready`, kill on `before-quit`).
- `src/renderer/components/StatusBar.tsx` — show "N daemon(s) connected" indicator.

## Specs
- Update `specs/src/main/main-spec.md` and `specs/src/main/ipc-handlers-spec.md` to reflect removal of local PTY path.
- Add `specs/src/main/local-daemon-spec.md`.

## Tests
- Delete tests for the removed modules (`session-manager.test.ts`, `idle-detector.test.ts`, `session-store.test.ts`). Keep `notifications.test.ts`.
- Update `tests/main/ipc-handlers.test.ts`: drop local-PTY cases; all session commands route through ConnectionManager.
- Update `tests/renderer/App.test.tsx` mocks as needed.
- New: `tests/main/local-daemon.test.ts` — spawn lifecycle smoke test.

# Acceptance Criteria
- `node-pty` is no longer imported from `src/main/**`.
- Zero-config launch works: user runs the app with no daemons configured; a localhost daemon starts automatically and is connected.
- User can create sessions immediately after launch, no Preferences setup required.
- All sessions route through `ConnectionManager`; session IDs are all composite (`daemonId:sessionId`).
- StatusBar shows connected daemon count.
- All tests pass.
- Version bump to `0.3.0-rc.7`.

# Dependencies
- Sprint 14 (client connection manager).

# Out of Scope — Deferred to v4 Flow II
- Sidebar per-daemon grouping / collapsible headers (v4 "Session groups" observable).
- Dedicated `ConnectionManager.tsx` component (Preferences Daemons section already covers the UX).
- Session templates, queued prompts, tray icon (v4 observables).
