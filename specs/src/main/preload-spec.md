---
title: Preload Script Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, ipc, security]
status: active
governs: src/main/preload.ts
---

# Purpose
Define the preload script that bridges the sandboxed renderer process with the main process via contextBridge. This is the ONLY surface through which the renderer accesses Node/Electron APIs.

# Behavior

## Exposed API
The preload script exposes a `switchboard` object on `window` via `contextBridge.exposeInMainWorld`:

```typescript
interface SwitchboardAPI {
  // PTY operations (placeholder for Sprint 02)
  // Session operations (placeholder for Sprint 04)
  // Platform info
  platform: NodeJS.Platform;
}
```

For Sprint 01, the API is minimal — just platform info. It will be extended in subsequent sprints.

## Security Rules
- MUST use `contextBridge.exposeInMainWorld` exclusively.
- MUST NOT expose `ipcRenderer` directly.
- MUST NOT expose any Node.js globals or modules.
- Each exposed function MUST validate its arguments before forwarding to ipcRenderer.

# Exports
- `SwitchboardAPI` type (exported from a shared types file for renderer consumption).

# Test Strategy
- Unit test: verify the API shape exposed via contextBridge.
- Unit test: verify no prohibited APIs are exposed.
