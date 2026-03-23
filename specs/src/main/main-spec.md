---
title: Main Process Entry Point Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, main-process]
status: active
governs: src/main/main.ts
---

# Purpose
Define the Electron main process entry point: window creation, security configuration, and application lifecycle.

# Behavior

## Window Creation
- Creates a single BrowserWindow on app ready.
- Window dimensions: 1200x800 default, resizable.
- Loads the renderer HTML (Vite dev server in development, built file in production).

## Security Configuration
- `contextIsolation: true` — MUST be enabled.
- `nodeIntegration: false` — MUST be disabled.
- `sandbox: true` — MUST be enabled.
- Preload script path set to `preload.ts` (compiled to `preload.js`).

## Application Lifecycle
- On `window-all-closed`: quit the app (all platforms for now).
- On `activate` (macOS): recreate window if none exist.

## IPC
- No direct IPC handlers in main.ts — those live in dedicated handler modules.
- Main.ts imports and initializes IPC handler registration.

# Exports
- None (entry point).

# Test Strategy
- Unit test: verify BrowserWindow is created with correct webPreferences.
- Unit test: verify security settings (contextIsolation, nodeIntegration, sandbox).
