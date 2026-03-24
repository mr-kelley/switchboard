---
title: Session Tab Component Specification
version: 0.2.0
maintained_by: claude
domain_tags: [renderer, react, ui]
status: active
governs: src/renderer/components/SessionTab.tsx
---

# Purpose
Render a single session tab in the sidebar with name and status dot.

# Behavior
- Displays session name and a colored dot indicating status.
- Dot colors: green (working), yellow (idle), red (needs-attention).
- Red dot pulses via CSS animation.
- Active tab has a highlighted background.
- Clicking the tab triggers onSelect callback.

# Props
```typescript
interface SessionTabProps {
  session: SessionInfo;
  isActive: boolean;
  onSelect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}
```

# Exports
- `SessionTab` (default export)

# Test Strategy
- Unit test: renders session name.
- Unit test: renders status dot with correct color.
- Unit test: active tab has highlighted style.
