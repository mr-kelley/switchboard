---
title: Terminal Pane Component Specification
version: 0.1.0
maintained_by: claude
domain_tags: [renderer, react, xterm, terminal]
status: active
governs: src/renderer/components/TerminalPane.tsx
---

# Purpose
Render an xterm.js terminal instance connected to a PTY session via the preload IPC API. Manages terminal lifecycle, data relay, and resize handling.

# Behavior

## Props
```typescript
interface TerminalPaneProps {
  sessionId: string;
  visible: boolean;  // Controls CSS display (none vs block)
}
```

## Lifecycle
- On mount: creates an xterm.js Terminal instance with WebGL renderer (canvas fallback), FitAddon, and WebLinksAddon.
- Opens the terminal in a container div.
- Subscribes to `pty:data` for this sessionId — writes incoming data to the terminal.
- Subscribes to terminal `onData` — sends user input to PTY via `pty:input`.
- FitAddon fits on mount and on window resize, sending `pty:resize` with new dimensions.
- On unmount: disposes the terminal and cleans up listeners.

## Visibility
- When `visible` is true: `display: block`, terminal is focused.
- When `visible` is false: `display: none`. Terminal instance stays alive (never destroyed).

## Addons
- FitAddon: auto-resize terminal to fill container.
- WebLinksAddon: clickable URLs in terminal output.
- WebGL renderer: attempted first, falls back to canvas if unavailable.

# Exports
- `TerminalPane` React component (default export).

# Test Strategy
- Unit test: component renders a container div.
- Unit test: visibility prop controls display style.
- Note: xterm.js requires a real DOM and canvas, so deep integration tests are deferred to E2E.
