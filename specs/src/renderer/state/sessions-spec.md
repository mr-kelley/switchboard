---
title: Session State Management Specification
version: 0.2.0
maintained_by: claude
domain_tags: [renderer, react, state]
status: active
governs: src/renderer/state/sessions.tsx
---

# Purpose
Manage client-side session state using React Context + useReducer. Provides session list, active session tracking, and actions for creating, closing, renaming, and updating sessions.

# Behavior

## State Shape
```typescript
interface SessionsState {
  sessions: SessionInfo[];
  activeSessionId: string | null;
}
```

## Reducer Actions
| Action | Effect |
|---|---|
| `ADD_SESSION` | Appends session and sets it as active |
| `REMOVE_SESSION` | Removes session; if it was active, switches to the last remaining session |
| `SET_ACTIVE` | Changes the active session ID |
| `UPDATE_STATUS` | Updates a session's `status` field |
| `UPDATE_NAME` | Updates a session's `name` field |

## Context
- `SessionsProvider`: wraps the app, provides state and dispatch via useReducer.
- `useSessions()`: hook returning `{ state, addSession, removeSession, setActiveSession, updateSessionStatus, updateSessionName }`. Throws if used outside provider.

# Exports
- `SessionsProvider`, `useSessions`

# Test Strategy
- Unit test: addSession adds to list and sets active.
- Unit test: removeSession removes and switches active.
- Unit test: setActiveSession changes active ID.
- Unit test: updateSessionName updates the name.
