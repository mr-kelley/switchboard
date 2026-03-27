---
title: Terminal Pane Component Specification
version: 0.3.0
maintained_by: claude
domain_tags: [renderer, react, xterm, terminal]
status: active
governs: src/renderer/components/TerminalPane.tsx
---

# Purpose
Render an xterm.js terminal instance connected to a PTY session via the preload IPC API. Manages terminal lifecycle, data relay, resize handling, scroll preservation, and WebGL context loss recovery.

# Behavior

## Props
```typescript
interface TerminalPaneProps {
  sessionId: string;
  visible: boolean;  // Controls CSS display (none vs block)
  searchVisible?: boolean;
  onSearchClose?: () => void;
}
```

## Styling and Layout
- `@xterm/xterm/css/xterm.css` must be imported for proper terminal layout (scrolling, selection, text measurement).
- The container div uses absolute positioning (`position: absolute; top/left/right/bottom: 0`) instead of `width/height: 100%` so that FitAddon receives correct pixel dimensions from the container's layout.

## Lifecycle
- On mount: creates an xterm.js Terminal instance with FitAddon and WebLinksAddon. After `terminal.open()`, attempts to attach the WebGL addon via `tryAttachWebgl()`.
- Opens the terminal in a container div.
- Subscribes to `pty:data` for this sessionId — buffers incoming data and flushes to the terminal once per animation frame (see Data Buffering below).
- Subscribes to terminal `onData` — sends user input to PTY via `pty:input`.
- FitAddon fits on mount and sends `pty:resize` with initial dimensions.
- On unmount: removes the window resize listener, unsubscribes from `pty:data`, and disposes the terminal.

## Data Buffering (GH-12)
- Incoming PTY data chunks are accumulated in a string buffer rather than written to the terminal individually.
- A `requestAnimationFrame` callback flushes the buffer once per frame, issuing a single `terminal.write()` call with the combined data.
- This reduces DOM thrashing during high-throughput streaming (e.g., AI model output during CLI resume).
- Scroll position is managed entirely by xterm.js's built-in `isUserScrolling` mechanism (see Scroll Preservation below). The flush callback MUST NOT call `terminal.scrollToBottom()` or `terminal.scrollLines()` — doing so resets xterm's internal `isUserScrolling` flag and corrupts scroll management.

## Scroll Preservation (GH-12)
- xterm.js tracks whether the user has scrolled up via an internal `isUserScrolling` flag in its BufferService. When `isUserScrolling` is true, new content does not auto-scroll the viewport.
- External code MUST NOT call `scrollToBottom()` from write callbacks. `scrollToBottom()` internally calls `scrollLines(ybase - ydisp)`, which clears `isUserScrolling` when it reaches `ybase`. Because `terminal.write()` is asynchronous, a callback created while following output may fire after the user has scrolled up, resetting the flag and yanking the viewport to the bottom.
- The only scroll-related responsibility of TerminalPane is to not interfere with xterm's native scroll management.

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
- **SearchAddon**: find-in-terminal functionality, exposed via searchVisible prop.
- **WebGL addon**: attached after `terminal.open()` via `tryAttachWebgl()`. Falls back to canvas renderer if the addon fails to load or attach. The WebGL addon MUST NOT corrupt xterm's scroll management — see known issue GH-12 below.

## WebGL Context Loss Recovery
- `tryAttachWebgl()` registers an `onContextLoss` callback on the WebGL addon. When a WebGL context loss event fires, the callback disposes the WebGL addon (xterm automatically falls back to its built-in canvas renderer).
- `webglAddonRef` is set to `null` after disposal.
- When the pane becomes visible again, the visibility effect checks `webglAddonRef.current`. If it is `null`, it calls `tryAttachWebgl()` to re-attach a fresh WebGL addon, restoring GPU-accelerated rendering.

## Known Issues
- **GH-12 (active)**: The WebGL addon, when it replaces the canvas renderer, breaks xterm's `isUserScrolling`-based scroll management. The user cannot scroll up during active output when WebGL is the active renderer. Root cause under investigation. Disabling WebGL (falling back to canvas) eliminates the scroll issue. The fix must preserve WebGL rendering while ensuring scroll management remains functional.

# Exports
- `TerminalPane` React component (default export).

# Test Strategy
- Unit test: component renders a container div.
- Unit test: visibility prop controls display style.
- Unit test: subscribes to PTY data on mount.
- Unit test: sends initial resize to PTY on mount.
- Unit test: uses absolute positioning to fill container.
- Note: xterm.js requires a real DOM and canvas, so deep integration tests (scroll behavior, WebGL) are deferred to E2E.

# Change Control
Regenerate-not-patch. Update version and provenance on every change.

## Provenance
- source: TerminalPane-spec.md v0.2.0
- time: 2026-03-27
- actor_index: claude
- summary: Added Data Buffering and Scroll Preservation sections documenting GH-12 rAF buffering fix and xterm isUserScrolling invariant. Added SearchAddon to Addons. Updated Props to include searchVisible/onSearchClose. Added Known Issues section for active GH-12 WebGL investigation. Updated Test Strategy to reflect current test coverage.
