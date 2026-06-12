---
title: New Session Modal Specification
version: 0.2.0
maintained_by: claude
domain_tags: [renderer, react, ui]
status: active
governs: src/renderer/components/NewSessionModal.tsx
---

# Purpose
Modal dialog for creating a new terminal session.

# Behavior
- Fields: project name (required), working directory (required), command (optional, default: "claude"). Host selector shown when daemons are connected.
- Submit: calls pty:spawn via preload API, then adds session to state.
- Cancel: closes modal without action.
- Validates that name and directory are non-empty before submit.

## Templates (Sprint 20)
- A **Templates** dropdown at the top of the form lists `prefs.sessionTemplates`. Selecting one prefills name, host, cwd, and command. Selecting the blank "—" option clears the selection (does not wipe typed values).
- A **Save as template** checkbox: when checked at submit time, the current form is persisted as a new `SessionTemplate` (via `updatePrefs`) in addition to spawning the session.
- A **Manage templates…** link opens `ManageTemplatesModal` (list/edit/delete). See `ManageTemplatesModal-spec.md`.
- Templates persist via `SwitchboardPreferences.sessionTemplates`; no separate IPC channel is required (uses the preferences save path).

# Props
```typescript
interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated: (session: SessionInfo) => void;
}
```

# Exports
- `NewSessionModal` (default export)

# Test Strategy
- Unit test: renders form fields when open.
- Unit test: does not render when closed.
- Unit test: validates required fields.
