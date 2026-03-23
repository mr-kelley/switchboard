# Roadmap — Switchboard

## Milestones

### 1. Core MVP
**Status:** `active`

**Outcome:** A developer can launch Switchboard, create multiple terminal sessions running Claude Code, and see at a glance which sessions are working, idle, or waiting for input — without switching tabs. Background sessions trigger native OS notifications when they need attention. Sessions persist across app restarts.

**Observable conditions:**
- App launches and displays a sidebar + terminal pane layout.
- User can create new sessions with a project name, working directory, and optional command override.
- Each session runs in its own PTY via node-pty.
- Switching tabs swaps terminal visibility (CSS display, not remount).
- Sidebar dots reflect session state: green (working), yellow (idle), red pulsing (needs attention).
- Idle detection works via configurable prompt pattern matching on PTY output.
- Native desktop notification fires when a background session transitions to needs-attention.
- Sessions persist in a local JSON file and restore on relaunch.
- Right-click context menu on tabs: rename, change directory, close.

**Dependencies:** none

---

### 2. Flow
**Status:** `planned`

**Outcome:** A developer can process a needs-attention session and submit the next prompt entirely via keyboard. Session management is fast and frictionless.

**Observable conditions:**
- Keyboard shortcuts for session switching (Cmd/Ctrl+1-9, Cmd/Ctrl+` for next needing attention).
- System tray integration with badge count.
- Session templates (save and reuse working directory + command combos).
- Session groups with collapsible sidebar sections.
- In-terminal search (Ctrl+F).

**Dependencies:** Core MVP

---

### 3. Intelligence
**Status:** `planned`

**Outcome:** Switchboard understands what is happening in sessions, not just that something happened. The sidebar conveys meaningful state without requiring the user to read terminal output.

**Observable conditions:**
- Richer status inference (blocked, errored, completed successfully).
- Per-session activity timeline.
- Cross-session notes pane.
- Per-session notification preferences.
- Plugin API for session lifecycle events.

**Dependencies:** Flow
