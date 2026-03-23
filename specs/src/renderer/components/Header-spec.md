---
title: Header Component Specification
version: 0.1.0
maintained_by: claude
domain_tags: [renderer, react, ui]
status: active
governs: src/renderer/components/Header.tsx
---

# Purpose
Render the top header bar showing the active project name and New Session button.

# Behavior
- Displays the active session's project name, or "Switchboard" if none active.
- "+ New Session" button triggers onNewSession callback.

# Props
```typescript
interface HeaderProps {
  activeSessionName: string | null;
  onNewSession: () => void;
}
```

# Exports
- `Header` (default export)

# Test Strategy
- Unit test: shows session name when provided.
- Unit test: shows "Switchboard" when no active session.
- Unit test: button triggers callback on click.
