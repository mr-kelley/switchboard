---
sprint: 19
title: System Tray & Notification Routing
milestone: Flow II
status: planned
---

# Goal
Bring Switchboard's attention-awareness outside the main window. A system-tray icon shows the total count of sessions needing attention across all daemons; clicking it restores focus. Per-session notification priority lets the user mute noisy sessions or escalate important ones. Covers two v4 observables: tray with unread badge, and notification routing (high/normal/silent).

# Design

## System Tray

### Behavior
- Tray icon appears on app startup; persists across window close (window close hides, doesn't quit).
- Icon shows a numeric badge with the count of sessions currently in `needs-attention` across all connected daemons.
- Left-click tray: show the main window and focus the most recently attention-needing session (or the active session if none are needs-attention).
- Right-click tray: context menu with entries:
  - "Show Switchboard" / "Hide Switchboard"
  - Per-daemon status lines (e.g. "Localhost — 2 sessions, 1 need attention")
  - "Quit"
- On Linux, the tray icon uses the standard `app.setAppUserModelId` + `Tray` API. macOS-style menubar rendering is out of scope for this sprint (future v5 concern).

### Implementation
- `src/main/tray.ts` (new) — owns the `Tray` instance, renders the icon with count overlay.
- Update `src/main/main.ts` — instantiate tray, wire to window close ("hide instead of quit"), wire to daemon status events.
- The tray queries `connectionManager.getConnectionStatuses()` and aggregates attention counts. Listens to existing `session:status-changed` broadcasts.

## Notification Routing

### Behavior
- Each session can be tagged with a notification priority: `high`, `normal`, `silent`.
- Defaults to `normal` (the existing behavior).
- `high`: always fires the OS notification, even when the app is focused.
- `normal`: fires when the app is not focused (current behavior).
- `silent`: never fires the OS notification, but still updates tab status + tray count.
- Priority is set via the existing session context-menu (right-click on tab → "Notifications" submenu).
- Stored per session ID in preferences (keyed by the composite `daemonId:sessionId` when applicable).

### Implementation
- Extend `SwitchboardPreferences` with `notificationPriorities: Record<string, 'high' | 'normal' | 'silent'>`.
- Update `src/renderer/components/ContextMenu.tsx` — add "Notifications" submenu with the three options.
- Update `src/main/connection-manager.ts` and (for localhost-local) `src/main/notifications.ts` — consult the priority map before firing. Need a way for the main-process notification code to read the priority; easiest is an IPC call or a subscription on preference changes.

## Deliverables

### Implementation
- `src/main/tray.ts`
- Update `src/main/main.ts`, `src/main/connection-manager.ts`, `src/main/notifications.ts`
- Update `src/renderer/components/ContextMenu.tsx`
- Update `src/shared/types.ts` — add `notificationPriorities` to prefs; add `window.switchboard.session.setPriority(...)` to the API.
- Update `src/main/preload.ts` — expose the new IPC.

### Tests
- `tests/main/tray.test.ts` — badge count calculation, menu contents, icon updates on status change.
- `tests/main/notifications.test.ts` — extend with priority filtering.
- `tests/renderer/ContextMenu.test.tsx` — new submenu entries.

### Specs
- `specs/src/main/tray-spec.md`
- Update `specs/src/main/notifications-spec.md`
- Update `specs/src/main/connection-manager-spec.md`

# Acceptance Criteria
- Tray icon shows total `needs-attention` count across all daemons, updates live.
- Left-click tray restores the main window and focuses an attention-needing session.
- Closing the main window hides it to tray; app continues running.
- User can right-click a session tab → Notifications → Silent and receive no OS notifications from that session.
- `high`-priority sessions fire notifications even when the window is focused.
- Priorities persist across client restarts.
- All tests pass.

# Dependencies
- Sprint 16 (queued prompts) — independent, but scheduling Sprint 17 after gives both features a shared touch on the session-status event path.

# Notes
- Minimize-to-tray behavior: on window-close, hide instead of quit. An explicit "Quit" from tray or `Cmd+Q` shuts down the app.
- The tray API differs subtly across platforms; we target Linux first (the dev platform). macOS/Windows behaviors to be validated when packaging for those targets.
