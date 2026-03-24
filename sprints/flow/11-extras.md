---
sprint: 11
title: Extras — Unread Badges, Terminal Search, Custom CSS, Status Bar
milestone: Flow
status: completed
---

## Goal
Polish features that round out the Flow milestone: unread indicators on background tabs, in-terminal search, custom CSS injection for power users, and a status bar showing session context.

## Deliverables
- Unread badge on SessionTab for background tabs with new output
- `src/renderer/components/SearchBar.tsx` — floating terminal search using xterm SearchAddon
- Custom CSS injection via `prefs.customCssPath`
- `src/renderer/components/StatusBar.tsx` — bottom bar with session info
- Specs for new components
- Unit tests

## Acceptance Criteria
- Background tabs show an unread indicator when they receive output.
- Indicator clears when tab becomes active.
- Ctrl+Shift+F opens terminal search bar.
- Search bar supports find-next and find-previous.
- Custom CSS path in preferences loads and injects a user stylesheet.
- Status bar shows active session name, terminal dimensions, and shortcut hints.
- All existing tests continue to pass.
- New tests exist and pass.

## Dependencies
- Sprint 10 (GUI Customization) — complete
