---
sprint: 4
title: Sidebar & Session Tabs
milestone: Core MVP
status: planned
---

## Goal
Implement the sidebar with session tabs, tab switching, and the New Session modal. Each tab shows project name and a status indicator dot. Clicking a tab switches the active terminal.

## Deliverables
- `src/renderer/components/Sidebar.tsx` — session list sidebar
- `src/renderer/components/SessionTab.tsx` — individual tab component with status dot
- `src/renderer/components/NewSessionModal.tsx` — modal for creating sessions (name, directory, command)
- `src/renderer/components/Header.tsx` — header bar with active project name and controls
- `src/renderer/state/sessions.ts` — session state management (React context or lightweight store)
- Updates to App.tsx for layout integration
- Specs for each implementation file
- Unit tests

## Acceptance Criteria
- Sidebar renders at ~220px width on the left.
- Session tabs display project name and colored status dot.
- Clicking a tab switches the visible terminal (display swap, not remount).
- "+ New Session" button opens a modal.
- Modal accepts project name, working directory (text input), optional command override (default: "claude").
- Creating a session spawns a PTY and adds a tab.
- Header shows the active project name.
- Tests exist and pass.

## Dependencies
- Sprint 03 (Terminal Pane)
