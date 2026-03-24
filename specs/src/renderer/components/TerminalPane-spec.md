---
title: Terminal Pane Component Specification
version: 0.2.0
maintained_by: claude
domain_tags: [renderer, react, xterm, terminal]
status: active
governs: src/renderer/components/TerminalPane.tsx
---

# Purpose
Render an xterm.js terminal instance connected to a PTY session via the preload IPC API. Manages terminal lifecycle, data relay, resize handling, and WebGL context loss recovery.

# Behavior

## Props
```typescript
interface TerminalPaneProps {
  sessionId: string;
  visible: boolean;  // Controls CSS display (none vs block)
}
```

## Styling and Layout
- `@xterm/xterm/css/xterm.css` must be imported for proper terminal layout (scrolling, selection, text measurement).
- The container div uses absolute positioning (`position: absolute; top/left/right/bottom: 0`) instead of `width/height: 100%` so that FitAddon receives correct pixel dimensions from the container's layout.

## Lifecycle
- On mount: creates an xterm.js Terminal instance with FitAddon and WebLinksAddon. After `terminal.open()`, attempts to attach the WebGL addon via `tryAttachWebgl()`.
- Opens the terminal in a container div.
- Subscribes to `pty:data` for this sessionId — writes incoming data to the terminal.
- Subscribes to terminal `onData` — sends user input to PTY via `pty:input`.
- FitAddon fits on mount and sends `pty:resize` with initial dimensions.
- On unmount: removes the window resize listener, unsubscribes from `pty:data`, and disposes the terminal.

## Visibility
- When `visible` is true: `display: block`. A deferred callback (setTimeout 50ms) re-attaches WebGL if it was lost, runs FitAddon.fit(), sends `pty:resize`, clears the deferred-resize flag, and focuses the terminal.
- When `visible` is false: `display: none`. Terminal instance stays alive (never destroyed).

## Visibility Ref Pattern
- A `visibleRef` (React ref) mirrors the `visible` prop value synchronously on every render. This allows the window resize handler to read current visibility without being re-registered whenever the `visible` prop changes.
- A `needsResizeRef` flag tracks whether a resize was skipped while the pane was hidden, so the deferred resize is applied when the pane becomes visible again.

## Window Resize Handling
- The window `resize` event handler checks `visibleRef.current` before calling `FitAddon.fit()`.
- If the pane is hidden, the handler sets `needsResizeRef.current = true` and returns without fitting. This prevents zero-dimension corruption that occurs when FitAddon measures a `display: none` container.
- When the pane becomes visible, the visibility effect always calls `fitAddon.fit()` regardless of the `needsResizeRef` flag, which covers both deferred resizes and normal visibility transitions. The flag is then cleared.

## Addons
- **FitAddon**: auto-resize terminal to fill container. Guarded against fit errors during layout transitions.
- **WebLinksAddon**: clickable URLs in terminal output.
- **WebGL addon**: attached after `terminal.open()` via `tryAttachWebgl()`. Falls back to canvas renderer if the addon fails to load or attach.

## WebGL Context Loss Recovery
- `tryAttachWebgl()` registers an `onContextLoss` callback on the WebGL addon. When a WebGL context loss event fires, the callback disposes the WebGL addon (xterm automatically falls back to its built-in canvas renderer).
- `webglAddonRef` is set to `null` after disposal.
- When the pane becomes visible again, the visibility effect checks `webglAddonRef.current`. If it is `null`, it calls `tryAttachWebgl()` to re-attach a fresh WebGL addon, restoring GPU-accelerated rendering.

# Exports
- `TerminalPane` React component (default export).

# Test Strategy
- Unit test: component renders a container div.
- Unit test: visibility prop controls display style.
- Note: xterm.js requires a real DOM and canvas, so deep integration tests are deferred to E2E.
