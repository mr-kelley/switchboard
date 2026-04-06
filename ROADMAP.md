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
- Full GUI customization: theme presets, custom colors, fonts, background images.
- Preferences modal (Ctrl+,) for configuring all visual and behavioral settings.
- Tab unread badges for background session activity.
- In-terminal search (Ctrl+Shift+F).
- Custom CSS injection for power users.
- Status bar showing session context.

**Dependencies:** Core MVP

---

### 3. Daemon
**Status:** `planned`

**Outcome:** Sessions are decoupled from the desktop app. PTYs run on daemons; clients connect from anywhere. Closing the client or switching machines does not interrupt sessions.

**Observable conditions:**
- A standalone `switchboard-daemon` process runs on any host (workstation, VM, server).
- The daemon manages PTY lifecycle: spawn, resize, input, close, idle detection.
- The daemon buffers session output for history replay on client connect/reconnect.
- The Electron client connects to one or more daemons via WebSocket + TLS.
- All sessions — including localhost — are daemon-managed (no direct node-pty in the client).
- Client displays connection status per daemon (connected / reconnecting / disconnected).
- Auto-reconnect with backoff handles network interruptions gracefully.
- Token-based authentication secures daemon connections.
- A developer can close the client, reopen on a different machine, and reconnect with full session history.
- Existing client UI (sidebar, tabs, shortcuts, preferences, themes) works unchanged over daemon connections.

**Dependencies:** Flow

---

### 4. Flow II
**Status:** `planned`

**Outcome:** Client-side UX enhancements reduce friction for managing sessions across multiple hosts.

**Observable conditions:**
- Queued prompts: pre-stage a prompt per session; fire it when the session needs attention.
- System tray: tray icon with badge showing count of sessions awaiting input across all daemons.
- Session templates: save host + directory + command as named templates for one-click session creation.
- Session groups: organize sessions by host, project, or custom grouping with collapsible sidebar headers.
- Notification routing: per-session notification preferences (high priority, normal, silent).

**Dependencies:** Daemon

---

### 5. Intelligence
**Status:** `planned`

**Outcome:** Switchboard understands what is happening in sessions, not just that something happened. The sidebar conveys meaningful state without requiring the user to read terminal output. Intelligence runs daemon-side where the PTY output stream lives.

**Observable conditions:**
- Richer status inference: blocked, errored, completed successfully — displayed as labels alongside the status dot.
- Per-session activity timeline with timestamps, persisted on the daemon.
- Cross-session notes pane stored on the daemon, visible alongside the terminal, follows the session across clients.
- Plugin API exposing session lifecycle events from the daemon for third-party integrations.

**Dependencies:** Daemon
