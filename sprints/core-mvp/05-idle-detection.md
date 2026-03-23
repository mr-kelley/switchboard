---
sprint: 5
title: Idle Detection & Status Indicators
milestone: Core MVP
status: planned
---

## Goal
Implement the three-state idle detection system that watches PTY output streams and updates session status: green (working), yellow (idle/quiet), red pulsing (needs attention / prompt detected).

## Deliverables
- `src/main/idle-detector.ts` — prompt pattern matching on PTY output, timer-based idle detection
- Updates to session manager for status tracking and IPC events (session-status-changed)
- Updates to preload for status IPC channels
- Updates to SessionTab.tsx for animated status dots (green/yellow/red pulsing)
- Configurable prompt pattern (default regex, overridable via settings)
- Specs for each implementation file
- Unit tests for idle detection logic

## Acceptance Criteria
- Green dot shows when PTY output is actively flowing.
- Yellow dot shows after 10 seconds of no output (if red hasn't triggered).
- Red pulsing dot shows when configurable prompt pattern is detected after activity.
- Status changes propagate from main process to renderer via IPC.
- Prompt pattern is configurable (env var or settings).
- User input resets status to green (working).
- Tests exist and pass.

## Dependencies
- Sprint 04 (Sidebar & Session Tabs)
