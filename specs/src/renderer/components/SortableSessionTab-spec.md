---
title: Sortable Session Tab Specification
version: 0.1.0
maintained_by: claude
domain_tags: [renderer, components, drag-and-drop]
status: active
governs: src/renderer/components/SortableSessionTab.tsx
---

# Purpose
Wrap SessionTab with @dnd-kit's useSortable hook to enable drag-and-drop reordering of tabs in the sidebar.

# Scope

## Covers
- Sortable wrapper applying drag transform/transition styles.
- Delegating all display to SessionTab.

## Does Not Cover
- DndContext or SortableContext (managed by Sidebar).
- Tab order persistence (managed by Sidebar + preferences).

# Inputs
- `session: SessionInfo` — session data.
- `isActive: boolean` — whether this tab is the active session.
- `onSelect: () => void` — click handler.
- `onContextMenu: (e: React.MouseEvent) => void` — right-click handler.

# Outputs
- Renders a `<div>` wrapper with sortable attributes around `<SessionTab>`.

# Responsibilities
- Call `useSortable({ id: session.id })`.
- Apply `transform` and `transition` CSS from the hook.
- Set `opacity: 0.5` while dragging (`isDragging`).
- Pass all props through to `<SessionTab>`.

# Edge Cases / Fault Handling
- N/A — pure presentational wrapper.

# Test Strategy
- Unit test: component renders with correct data-testid.
- Unit test: renders SessionTab with passed props.
- Test file: `tests/renderer/components/SortableSessionTab.test.tsx`

# Completion Criteria
- Component renders and accepts drag attributes.
- SessionTab receives all props.
- Tests pass.
