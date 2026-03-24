---
title: Main Process Entry Point Specification
version: 0.2.0
maintained_by: claude
domain_tags: [electron, main-process]
status: active
governs: src/main/main.ts
---

# Purpose
Define the Electron main process entry point: window creation, security configuration, application lifecycle, and orchestration of SessionManager and IPC handlers.

# Behavior

## Window Creation
- Creates a single BrowserWindow on app ready.
- Window dimensions: 1200×800 default, min 600×400, resizable.
- Background color: `#1e1e2e` (dark theme).
- Loads the Vite dev server (`http://localhost:5173`) in development, built HTML file in production.

## Security Configuration
- `contextIsolation: true` — MUST be enabled.
- `nodeIntegration: false` — MUST be disabled.
- `sandbox: true` — MUST be enabled.
- Preload script path: `preload.js` (compiled from `preload.ts`).

## Orchestration
- Creates a `SessionManager` instance at module level.
- On app ready: registers IPC handlers via `registerIpcHandlers(sessionManager)`, then creates the window.

## Application Lifecycle
- On `window-all-closed`: quit the app (all platforms).
- On `activate` (macOS): recreate window if none exist.
- On `before-quit`: calls `sessionManager.closeAll()` for defensive PTY cleanup.

# Exports
- `createWindow()` — exported for testing.

# Test Strategy
- Unit test: verify BrowserWindow is created with correct webPreferences.
- Unit test: verify security settings (contextIsolation, nodeIntegration, sandbox).
