---
sprint: 3
title: Terminal Pane (xterm.js)
milestone: Core MVP
status: planned
---

## Goal
Implement the terminal pane component that renders xterm.js terminals, connects them to PTY sessions via IPC, and manages multiple terminal instances with CSS display swapping (never unmounting).

## Deliverables
- `src/renderer/components/TerminalPane.tsx` — xterm.js terminal component
- `src/renderer/hooks/useTerminal.ts` — terminal instance lifecycle management
- xterm.js addons: FitAddon, WebLinksAddon, WebGL renderer
- Terminal theme configuration (dark default)
- Updates to App.tsx to integrate TerminalPane
- Specs for each implementation file
- Unit tests

## Acceptance Criteria
- xterm.js terminal renders in the main area.
- Terminal connects to a PTY session and displays output.
- User input in the terminal reaches the PTY.
- FitAddon resizes the terminal on window resize.
- Multiple terminal instances can coexist; inactive ones use `display: none`.
- WebGL renderer is used by default with canvas fallback.
- Tests exist and pass.

## Dependencies
- Sprint 02 (PTY Session Manager)
