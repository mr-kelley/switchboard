# Bug Log — Switchboard

Documented bugs encountered during development, their root causes, and fixes.

---

## BUG-001: Electron SUID sandbox crash on Linux

**Reported:** 2026-03-23
**Commit:** `6127c0d`
**Severity:** Blocker (app won't launch)

### Symptom
App crashes on `npm run dev` with:
```
FATAL:setuid_sandbox_host.cc(163) The SUID sandbox helper binary was found,
but is not configured correctly.
```

### Root Cause
On Linux, Electron's `chrome-sandbox` binary must be owned by root with SUID bit (`chmod 4755`). In development, the binary inside `node_modules/electron/dist/` doesn't have these permissions.

### Fix
Added `--no-sandbox` flag to the `dev:main` npm script for development use. This is safe in development; production packaging via electron-builder handles sandbox permissions correctly.

**Permanent alternative:** `sudo chown root:root node_modules/electron/dist/chrome-sandbox && sudo chmod 4755 node_modules/electron/dist/chrome-sandbox`

---

## BUG-002: All terminal canvases go blank after switching tabs

**Reported:** 2026-03-23
**Commit:** `6127c0d`
**Severity:** Critical (total loss of terminal display)

### Symptom
After opening multiple sessions and switching between tabs, all three terminal canvases go blank. Tab labels remain correct. Switching tabs does not recover them.

### Root Cause
The xterm.js WebGL renderer loses its GPU context when its canvas element is hidden via `display: none`. The `onContextLoss` handler disposed the WebGL addon but **never restored any renderer**. After disposal, xterm had no rendering backend — resulting in a permanently blank canvas.

### Fix
1. On WebGL context loss: dispose the addon. xterm.js automatically falls back to its built-in canvas renderer, so the terminal remains visible (just without GPU acceleration).
2. When a tab becomes visible again: attempt to re-attach a fresh WebGL addon to restore GPU-accelerated rendering.
3. Track the WebGL addon reference (`webglAddonRef`) so the visibility handler knows whether re-attachment is needed.

### Lessons Learned
- WebGL context loss is expected behavior in browsers, not an edge case. Any `display: none` toggle can trigger it.
- Always have a fallback renderer strategy. Don't dispose a renderer without ensuring another one is active.

---

## BUG-003: Terminal does not scroll, text disappears off bottom

**Reported:** 2026-03-24
**Commit:** `53b82b5`
**Severity:** Critical (terminal unusable for any output longer than one screen)

### Symptom
When terminal output reaches the bottom of the visible area, new lines disappear instead of scrolling. The terminal viewport appears to have no scroll container.

### Root Cause
The xterm.js CSS stylesheet (`@xterm/xterm/css/xterm.css`) was never imported. Without it, the terminal viewport element has no height constraints, the scroll container (`xterm-viewport`) has no overflow rules, and the screen element is not properly positioned — so xterm cannot manage scrolling.

### Fix
Added `import '@xterm/xterm/css/xterm.css'` to `TerminalPane.tsx`.

---

## BUG-004: Cannot copy text from terminal (blank clipboard)

**Reported:** 2026-03-24
**Commit:** `53b82b5` (same fix as BUG-003)
**Severity:** High (breaks a fundamental terminal operation)

### Symptom
Selecting text in the terminal and copying produces blank lines in the clipboard.

### Root Cause
Same as BUG-003. Without `xterm.css`, the selection layer overlay (`xterm-selection`) has no dimensions and is not positioned over the text canvas. The selection visually appears to work (highlight shows) but the underlying selection coordinates are wrong because the text measurement layer has incorrect sizing.

### Fix
Same as BUG-003 — importing the xterm.js CSS stylesheet fixes selection layer positioning.

---

## BUG-005: Window resize blanks all terminal canvases (including hidden tabs)

**Reported:** 2026-03-24
**Commit:** `53b82b5`
**Severity:** High (forces app restart)

### Symptom
Resizing the Electron window blanks the terminal canvas on all tabs, including background tabs that are not currently visible.

### Root Cause
The `window.resize` event handler called `FitAddon.fit()` on every terminal, including those with `display: none`. FitAddon measures the container element to calculate the terminal dimensions (cols × rows). A hidden element returns zero dimensions, causing FitAddon to set the terminal to 0×0 — which corrupts the rendering state and triggers WebGL context loss on all terminals.

### Fix
1. Store visibility in a ref (`visibleRef`) so the resize handler can check it without re-registering the event listener.
2. If the terminal is hidden during resize, set a `needsResizeRef` flag instead of fitting.
3. When the tab becomes visible, always run `fit()` — this handles both the initial display and any deferred resizes.

### Lessons Learned
- Never call `FitAddon.fit()` on a `display: none` terminal. It will measure zero dimensions and corrupt the terminal state.
- Use refs (not state) for values that event handlers need to read but that shouldn't trigger re-renders.

---

## BUG-006: Terminal prompt wraps at wrong column (line splitting)

**Reported:** 2026-03-24
**Commit:** `53b82b5` (same fix as BUG-003)
**Severity:** Medium (display corruption, not data loss)

### Symptom
Shell prompts split across lines at unexpected positions. Example:
```
mrkelley@cloud0:~/gi
ts/knucklehead$
```
instead of:
```
mrkelley@cloud0:~/gits/knucklehead$
```

### Root Cause
Two compounding issues:
1. Missing `xterm.css` caused the terminal's text measurement to use incorrect container dimensions, reporting wrong column counts to the PTY.
2. The TerminalPane container used `width: 100%; height: 100%` which, inside a flex parent, can compute to zero or incorrect pixel values before the flex layout completes. FitAddon then sent wrong dimensions to the PTY.

### Fix
1. Import `xterm.css` for correct text measurement.
2. Change the terminal container from `width/height: 100%` to absolute positioning (`position: absolute; inset: 0`) which resolves to correct pixel dimensions immediately within the flex parent.
