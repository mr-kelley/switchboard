---
title: Sidebar Component Specification
version: 0.1.0
maintained_by: claude
domain_tags: [renderer, react, ui]
status: active
governs: src/renderer/components/Sidebar.tsx
---

# Purpose
Render the session list sidebar with clickable session tabs.

# Behavior
- Renders a list of SessionTab components, one per session.
- Receives sessions and activeSessionId from context.
- Clicking a tab calls setActiveSession.
- Shows "No sessions yet" when empty.

# Exports
- `Sidebar` (default export)

# Test Strategy
- Unit test: renders sessions as tabs.
- Unit test: shows empty state when no sessions.
