---
sprint: 6
title: Session Persistence & Notifications
milestone: Core MVP
status: planned
---

## Goal
Implement session persistence (save/restore across app restarts) and native OS desktop notifications when background sessions need attention.

## Deliverables
- `src/main/session-store.ts` — read/write sessions.json, session restore on launch
- `src/main/notifications.ts` — native Notification API integration
- Updates to session manager for persistence hooks
- Updates to idle detector for notification triggers
- Right-click context menu on tabs: rename, change directory, close session
- Specs for each implementation file
- Unit tests

## Acceptance Criteria
- Sessions persist in a local JSON file (sessions.json in app data directory).
- On app launch, previous sessions are listed in the sidebar (PTYs respawned with saved config).
- When a background tab transitions to red (needs-attention) and the app is not focused: a native OS notification fires with the project name.
- Right-click on a tab shows context menu with rename, change directory, and close options.
- Rename updates the tab label.
- Close terminates the PTY and removes the tab.
- Tests exist and pass.

## Dependencies
- Sprint 05 (Idle Detection)
