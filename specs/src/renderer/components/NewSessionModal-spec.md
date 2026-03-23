---
title: New Session Modal Specification
version: 0.1.0
maintained_by: claude
domain_tags: [renderer, react, ui]
status: active
governs: src/renderer/components/NewSessionModal.tsx
---

# Purpose
Modal dialog for creating a new terminal session.

# Behavior
- Fields: project name (required), working directory (required), command (optional, default: "claude").
- Submit: calls pty:spawn via preload API, then adds session to state.
- Cancel: closes modal without action.
- Validates that name and directory are non-empty before submit.

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
