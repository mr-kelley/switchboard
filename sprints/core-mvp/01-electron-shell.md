---
sprint: 1
title: Electron Shell & Project Skeleton
milestone: Core MVP
status: completed
---

## Goal
Set up the Electron application skeleton with main process, preload script, renderer process (React + Vite), and basic window management. The app launches and shows an empty window with the correct security configuration.

## Deliverables
- `package.json` with all dependencies (electron, react, xterm.js, node-pty, vite, vitest, typescript, etc.)
- `tsconfig.json` (strict mode, separate configs for main and renderer if needed)
- `vite.config.ts` for the renderer process
- `src/main/main.ts` — Electron main process entry (BrowserWindow, security settings)
- `src/main/preload.ts` — preload script with contextBridge exposing minimal IPC API
- `src/renderer/index.html` — renderer entry point
- `src/renderer/main.tsx` — React root mount
- `src/renderer/App.tsx` — root React component (empty shell with sidebar + main area layout)
- Specs for each implementation file
- Unit tests for main process configuration

## Acceptance Criteria
- `npm install` succeeds.
- `npm run dev` launches an Electron window.
- Window has `contextIsolation: true`, `nodeIntegration: false`.
- Preload script exposes a typed IPC API via contextBridge.
- React renders in the renderer process.
- Basic layout visible: sidebar placeholder + main area placeholder.
- Tests exist and pass.

## Dependencies
None.
