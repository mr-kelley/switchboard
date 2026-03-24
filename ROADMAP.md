# Roadmap — Switchboard

## Milestones

### 1. Core MVP
**Status:** `completed`

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
**Status:** `completed`

**Outcome:** A developer can process a needs-attention session and submit the next prompt entirely via keyboard. Session management is fast, frictionless, and fully customizable.

**Observable conditions:**
- Preferences system persists user customizations (themes, fonts, shortcuts, layout).
- Tab reordering via drag-and-drop with persistent order.
- Keyboard shortcuts for session switching (Ctrl+1-9), session management (Ctrl+N/W), and UI navigation (Ctrl+B sidebar toggle).
- Full GUI customization: theme presets, custom colors, fonts, background images, transparency.
- Preferences modal (Ctrl+,) for configuring all visual and behavioral settings.
- Tab unread badges for background session activity.
- In-terminal search (Ctrl+Shift+F).
- Custom CSS injection for power users.
- Status bar showing session context.

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
