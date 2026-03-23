---
title: Session State Management Specification
version: 0.1.0
maintained_by: claude
domain_tags: [renderer, react, state]
status: active
governs: src/renderer/state/sessions.ts
---

# Purpose
Manage client-side session state using React Context. Provides session list, active session tracking, and actions for creating/closing sessions.

# Behavior

## State Shape
```typescript
interface SessionsState {
  sessions: SessionInfo[];
  activeSessionId: string | null;
}
```

## Actions
- `addSession(info: SessionInfo)`: adds a session and sets it as active.
- `removeSession(id: string)`: removes a session; if active, switches to another.
- `setActiveSession(id: string)`: switches the active session.
- `updateSessionStatus(id: string, status: SessionStatus)`: updates a session's status.

## Context
- `SessionsProvider`: wraps the app, provides state and dispatch.
- `useSessions()`: hook returning `{ state, addSession, removeSession, setActiveSession, updateSessionStatus }`.

# Exports
- `SessionsProvider`, `useSessions`

# Test Strategy
- Unit test: addSession adds to list and sets active.
- Unit test: removeSession removes and switches active.
- Unit test: setActiveSession changes active ID.
