---
sprint: 8
title: Tab Reordering
milestone: Flow
status: completed
---

## Goal
Enable drag-and-drop reordering of session tabs in the sidebar, with persistent tab order across restarts.

## Deliverables
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` dependencies
- `src/renderer/components/SortableSessionTab.tsx` — drag-and-drop wrapper for SessionTab
- Updated `src/renderer/state/sessions.tsx` — REORDER_SESSIONS action
- Updated `src/renderer/components/Sidebar.tsx` — DndContext + SortableContext wrapper
- Tab order persistence via preferences.sessionOrder
- Specs for new/modified files
- Unit tests

## Acceptance Criteria
- Tabs can be reordered by dragging in the sidebar.
- Drag is restricted to vertical axis.
- Tab order persists across app restarts via preferences.
- Context menu is disabled during drag.
- All existing tests continue to pass.
- New tests exist and pass.

## Dependencies
- Sprint 07 (Preferences Infrastructure) — complete
