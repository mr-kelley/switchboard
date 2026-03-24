---
title: Preload Script Specification
version: 0.2.0
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
  platform: NodeJS.Platform;
  pty: {
    spawn(config: SessionConfig): Promise<SessionInfo>;
    resize(sessionId: string, cols: number, rows: number): Promise<void>;
    close(sessionId: string): Promise<void>;
    input(sessionId: string, data: string): void;
    onData(callback: (sessionId: string, data: string) => void): () => void;
    onExit(callback: (sessionId: string, exitCode: number) => void): () => void;
  };
  session: {
    list(): Promise<SessionInfo[]>;
    onStatusChanged(callback: (sessionId: string, status: string) => void): () => void;
  };
}
```

## IPC Channel Mapping
| API Method | IPC Channel | Direction | Pattern |
|---|---|---|---|
| `pty.spawn` | `pty:spawn` | renderer → main | invoke/handle |
| `pty.resize` | `pty:resize` | renderer → main | invoke/handle |
| `pty.close` | `pty:close` | renderer → main | invoke/handle |
| `pty.input` | `pty:input` | renderer → main | send/on (fire-and-forget) |
| `pty.onData` | `pty:data` | main → renderer | send/on (event stream) |
| `pty.onExit` | `pty:exit` | main → renderer | send/on (event) |
| `session.list` | `session:list` | renderer → main | invoke/handle |
| `session.onStatusChanged` | `session:status-changed` | main → renderer | send/on (event) |

## Event Listener Cleanup
All `on*` methods return an unsubscribe function `() => void`. Callers MUST invoke this on cleanup to prevent memory leaks (e.g., in React useEffect return).

## Security Rules
- MUST use `contextBridge.exposeInMainWorld` exclusively.
- MUST NOT expose `ipcRenderer` directly.
- MUST NOT expose any Node.js globals or modules.
- Each exposed function MUST validate its arguments before forwarding to ipcRenderer.

# Exports
- `SwitchboardAPI` type (exported from `src/shared/types.ts` for renderer consumption).

# Test Strategy
- Unit test: verify the API shape exposed via contextBridge.
- Unit test: verify no prohibited APIs are exposed.
- Unit test: verify platform info is exposed.
