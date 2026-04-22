---
sprint: 18
title: Session Groups & Templates
milestone: Flow II
status: planned
---

# Goal
Make the sidebar scalable when the user has many sessions across many hosts. Two related features: **session templates** (save a reusable session config for one-click spawn) and **session groups** (collapsible sidebar headers organizing sessions by host, project, or user-defined grouping). Covers two v4 observables.

# Design

## Session Templates

### Behavior
- A template stores: name, host (daemon id), cwd, command (optional).
- Templates are managed from the New Session modal:
  - A "Save as template" checkbox on session-creation.
  - A "Templates" dropdown at the top of the modal: picking a template prefills the form.
  - A "Manage templates" link opens a small list/edit dialog.
- Templates live in `SwitchboardPreferences.sessionTemplates: SessionTemplate[]`.

### Implementation
- Extend `src/shared/types.ts` — `SessionTemplate` type and `sessionTemplates` prefs field.
- Update `src/renderer/components/NewSessionModal.tsx` — template dropdown + save checkbox.
- `src/renderer/components/ManageTemplatesModal.tsx` (new) — list, edit, delete templates.

## Session Groups

### Behavior
- Sessions are displayed under collapsible group headers in the sidebar.
- Default grouping: **by host** (daemon name). Each daemon's sessions collapse under its name.
- User can override group for a session via context menu → "Move to group…" → pick/create.
- Collapsed/expanded state is persisted per group.
- Sessions without an explicit group appear under their host group. Ungrouping a session returns it to the host default.
- Drag-and-drop reordering still works within a group.

### Implementation
- Extend `SwitchboardPreferences`:
  - `sessionGroups: Record<string, { name: string; collapsed: boolean; sessionIds: string[] }>`
  - Implicit host-default groups use `daemon-<daemonId>` as the group key.
- Update `src/renderer/components/Sidebar.tsx` — render groups, expand/collapse toggles, group headers.
- Update `src/renderer/components/ContextMenu.tsx` — "Move to group" submenu.
- Drag-and-drop: reordering within a group updates that group's `sessionIds`; dragging across groups moves the session.

## Deliverables

### Implementation
- `src/renderer/components/ManageTemplatesModal.tsx`
- Update `src/renderer/components/NewSessionModal.tsx`, `Sidebar.tsx`, `ContextMenu.tsx`
- Update `src/shared/types.ts` — new template + group types and prefs fields

### Tests
- `tests/renderer/components/ManageTemplatesModal.test.tsx`
- Update `NewSessionModal.test.tsx`, `Sidebar.test.tsx` (if exists), `ContextMenu.test.tsx`

### Specs
- `specs/src/renderer/components/ManageTemplatesModal-spec.md`
- Update Sidebar and ContextMenu specs

# Acceptance Criteria
- User can create a session from a saved template in one click.
- User can save a new template from the New Session modal.
- Sidebar groups sessions by host by default; headers are collapsible.
- Collapsed/expanded state persists across restarts.
- User can move a session to a custom-named group via context menu.
- Drag-and-drop reordering respects groups.
- All tests pass.

# Dependencies
- Sprint 16 (queued prompts) and Sprint 17 (tray & notifications) — independent work, but this sprint closes out Flow II.

# Notes
- Session templates are a small feature bundled into this sprint because they overlap with the New Session modal and sit next to the "organize your sessions" theme.
- Groups are more involved — most of the sprint's complexity lives in the sidebar rendering and drag-and-drop rules.
- Flow II completes when this sprint merges.
