---
sprint: 9
title: Keyboard Shortcuts
milestone: Flow
status: active
---

## Goal
Enable keyboard-driven navigation and session management: tab switching, session creation/closing, sidebar toggle, and zoom controls, all user-remappable via preferences.

## Deliverables
- `src/renderer/hooks/useKeyboardShortcuts.ts` — global keyboard shortcut hook
- Updated `src/renderer/App.tsx` — shortcut handlers, sidebar toggle state
- Updated `src/renderer/components/Header.tsx` — shortcut hint tooltips
- Updated `src/renderer/components/ContextMenu.tsx` — optional shortcut labels
- Updated `src/renderer/components/Sidebar.tsx` — shortcut hints in context menu
- Default shortcut map in preferences
- Specs for new/modified files
- Unit tests for shortcut parsing and matching

## Acceptance Criteria
- Ctrl+1-9 jumps to session by position.
- Ctrl+Tab / Ctrl+Shift+Tab cycles sessions.
- Ctrl+N opens new session modal.
- Ctrl+W closes active session.
- Ctrl+B toggles sidebar visibility.
- Ctrl+, opens preferences (placeholder — modal in Sprint 10).
- Ctrl+=/- zoom in/out terminal font.
- Shortcuts do not conflict with terminal input (Ctrl+C, Ctrl+V, etc.).
- All existing tests continue to pass.
- New tests exist and pass.

## Dependencies
- Sprint 07 (Preferences Infrastructure) — complete
