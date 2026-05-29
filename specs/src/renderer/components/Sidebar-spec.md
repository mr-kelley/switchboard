---
title: Sidebar Component Specification
version: 0.3.0
maintained_by: claude
domain_tags: [renderer, react, ui]
status: active
governs: src/renderer/components/Sidebar.tsx
---

# Purpose
Render the session list sidebar with clickable session tabs and a right-click context menu for session management.

# Behavior
- Renders a "Sessions" header label and a scrollable list of `SessionTab` components, one per session.
- Consumes `useSessions()` for state, `setActiveSession`, `removeSession`, and `updateSessionName`.
- Clicking a tab calls `setActiveSession`.
- Shows "No sessions yet" when the session list is empty.

## Context Menu
- Right-clicking a tab opens a `ContextMenu` component positioned at the click coordinates.
- Menu items:
  - **Rename** — prompts the user (browser `prompt()`) for a new name, calls `updateSessionName`.
  - **Notifications** (submenu, Sprint 19) — High / Normal / Silent. Calls `window.switchboard.session.setPriority(sessionId, priority)`. The current priority (from `prefs.notificationPriorities[sessionId]`, default `normal`) is shown with a check mark.
  - **Close Session** — calls `window.switchboard.pty.close()` then `removeSession()`.
- The context menu dismisses on outside click.

# Exports
- `Sidebar` (default export)

# Test Strategy
- Unit test: renders sessions as tabs.
- Unit test: shows empty state when no sessions.
- Unit test: context menu appears on right-click.
- Unit test: rename and close actions work.
