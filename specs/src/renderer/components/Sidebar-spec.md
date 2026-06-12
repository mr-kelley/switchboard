---
title: Sidebar Component Specification
version: 0.4.0
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

## Session Groups (Sprint 20)
- Sessions render under collapsible group headers. Default grouping is **by host**: each session belongs to the implicit host-default group keyed `daemon-<daemonId>` (derived from the composite session id `daemonId:sessionId`), unless it is a member of a custom group in `prefs.sessionGroups`.
- A group header shows the group name and a collapse/expand chevron. Collapsing hides the group's tabs and persists `collapsed` per group via `updatePrefs({ sessionGroups })`.
- Host-default group display names come from the daemon name where available; otherwise the daemon id.
- **Move to group** (context-menu submenu): lets the user move the session to an existing custom group or create a new named group (browser `prompt()` for the name). Moving updates `sessionGroups` membership and persists; moving out / ungrouping returns the session to its host-default group.
- **Drag-and-drop:** reordering within a group updates that group's order; dragging a tab onto another group moves the session into it. Implemented with dnd-kit multi-container sortable. Host-default groups are derived (not stored) until a session is explicitly moved, at which point the relevant group entries are materialized in `prefs.sessionGroups`.
- Grouping is a pure function of `state.sessions` + `prefs.sessionGroups`; sessions with stale/missing group references fall back to their host-default group.

## Context Menu
- Right-clicking a tab opens a `ContextMenu` component positioned at the click coordinates.
- Menu items:
  - **Rename** — prompts the user (browser `prompt()`) for a new name, calls `updateSessionName`.
  - **Notifications** (submenu, Sprint 19) — High / Normal / Silent. Calls `window.switchboard.session.setPriority(sessionId, priority)`. The current priority (from `prefs.notificationPriorities[sessionId]`, default `normal`) is shown with a check mark.
  - **Move to group** (submenu, Sprint 20) — lists existing custom groups plus "New group…". Updates `prefs.sessionGroups` membership.
  - **Close Session** — calls `window.switchboard.pty.close()` then `removeSession()`.
- The context menu dismisses on outside click.

# Exports
- `Sidebar` (default export)

# Test Strategy
- Unit test: renders sessions as tabs.
- Unit test: shows empty state when no sessions.
- Unit test: context menu appears on right-click.
- Unit test: rename and close actions work.
