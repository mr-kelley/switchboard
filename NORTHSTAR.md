# Switchboard — Project Northstar

> *A Slack-style multi-session terminal manager built for developers who run AI coding agents in parallel.*

---

## The Problem

Claude Code and tools like it are asynchronous by nature: you give them a prompt, they go work, and they come back when they're done. A skilled developer can run eight or more of these sessions simultaneously across different projects — but no tooling exists to support that workflow. Existing terminal emulators treat each session as isolated. There's no ambient awareness across sessions, no notification when one comes back ready, no way to see at a glance which projects need your attention and which are still working.

The result: developers either hyperfocus on one session and leave the others idle, or they context-switch constantly and lose their train of thought.

Switchboard solves this.

---

## The Vision

Switchboard is the terminal environment for parallel AI-assisted development.

At full maturity, it feels less like a terminal emulator and more like a mission control panel — a single window where a developer can see all their active AI coding sessions, understand the state of each at a glance, route their attention to where it's needed, and hand off work to the next session without friction. It is to Claude Code what Slack is to team communication: not just a container, but an environment that actively manages flow and attention.

**The user it's built for:** The vibe coder. The AI-native developer running multiple projects simultaneously, relying on LLM agents to do the heavy lifting while they provide direction, review, and next prompts. This user is technically sophisticated but time-constrained. They don't want to babysit terminals. They want to be the conductor, not the instrumentalist.

---

## Design Principles

1. **Attention is the resource.** Every design decision should be evaluated against whether it helps the user spend their attention where it's actually needed.

2. **Sessions are persistent.** A session is never destroyed except by explicit user action. Background sessions keep running, keep their history, keep their state.

3. **Ambient over intrusive.** Notifications should be visible, not disruptive. A red dot on a sidebar tab is better than a modal. A tray badge is better than a popup. Escalate only when truly warranted.

4. **Zero learning curve for terminal users.** If you can use a terminal, you can use Switchboard. The UI chrome should be immediately legible to anyone who has used Slack or Teams.

5. **Extensible by design.** Prompt pattern detection, session defaults, keyboard shortcuts, themes — all configurable. Don't bake in assumptions that break for different tools or workflows.

6. **Your infrastructure, your control.** No telemetry, no accounts, no cloud services. Sessions run on your machines — workstations, VMs, lab servers — connected by daemons you control. Configuration is local per client.

---

## Roadmap

### v1 — Core (MVP)
*Goal: Replace your terminal emulator for Claude Code sessions. Nothing more.*

- Electron app with Slack-style sidebar and embedded xterm.js terminals
- node-pty session management (spawn, persist, never destroy on tab switch)
- Session tabs with three-state indicator: working (green) / quiet (yellow) / needs attention (red, pulsing)
- Idle detection via configurable prompt pattern matching on raw pty output stream
- Native OS desktop notification when a background session needs attention
- New Session modal: project name, working directory, optional shell command override
- Sessions persist across app restarts (local JSON)
- Right-click tab context menu: rename, change directory, close
- Dark theme, full xterm.js feature set (FitAddon, WebLinksAddon)

**Success metric:** A developer with 8 active Claude Code sessions can tell which ones need their attention without switching to any of them.

---

### v2 — Flow
*Goal: Reduce the friction of acting on sessions, not just noticing them.*

- Preferences system with theme presets, custom colors, fonts, background images
- Keyboard shortcuts for session switching, management, and UI navigation
- Tab reordering via drag-and-drop with persistent order
- Full GUI customization via Preferences modal
- Tab unread badges, in-terminal search, custom CSS injection, status bar

**Success metric:** A developer can process a "needs attention" session and submit the next prompt without touching the mouse.

---

### v3 — Daemon
*Goal: Decouple session lifecycle from the desktop app. Sessions run on daemons; clients connect from anywhere.*

The current architecture is monolithic: the Electron app owns the PTYs directly. This means closing the app kills all sessions, sessions can't be accessed from another machine, and remote development requires manual SSH workarounds.

v3 introduces a **client-server split**:

- **Switchboard daemon** (`switchboard-daemon`): a standalone process that runs on any host (workstations, VMs, lab servers). It owns PTY lifecycle, idle detection, and output history. Multiple daemons can run on different hosts.
- **Switchboard client** (the Electron app): connects to one or more daemons via WebSocket + TLS. Renders terminals, manages UI, handles notifications. The client no longer spawns PTYs directly — all sessions are daemon-managed, including localhost.
- **Session mobility**: close the client on one machine, open it on another, reconnect to the same daemons. All sessions are still running with full output history.
- **Network resilience**: auto-reconnect with backoff. Connection status visible per daemon. Designed for use over VPN/Wireguard tunnels.
- **Authentication**: token-based auth to start (daemon generates a shared secret). Extensible to certificate-based or organizational auth later.
- **Full history replay**: daemon buffers all session output (configurable cap). On client connect or reconnect, the buffer replays so the user sees everything that happened while disconnected.

**Success metric:** A developer can start a session on a lab VM, close their laptop, travel to another location, open the client, and resume the session with full history — without the session ever stopping.

---

### v4 — Flow II
*Goal: Client-side UX enhancements that reduce friction further.*

These features were envisioned in the original v2 but deferred. They sit on top of the daemon architecture and enhance the client experience.

- **Queued prompts per session**: pre-stage the next prompt while a session is still working; fire it with one action when the session needs attention.
- **System tray integration**: tray icon with badge showing count of sessions awaiting input across all connected daemons.
- **Session templates**: save a host + working directory + command as a named template for one-click session creation.
- **Session groups**: organize sessions by host, project, or custom grouping with collapsible sidebar headers. Multi-host connections provide natural grouping.
- **Notification routing**: per-session notification preferences (high priority, normal, silent).

**Success metric:** A developer managing 8+ sessions across multiple hosts can create, organize, and respond to sessions entirely via keyboard, with attention routed to what matters most.

---

### v5 — Intelligence
*Goal: Let Switchboard understand what's happening in sessions, not just that something happened.*

Intelligence features run daemon-side, where the PTY output stream lives. The daemon has the data; the client renders the insights.

- **Status inference**: lightweight heuristics to infer richer session states — blocked, errored, completed successfully — displayed as labels alongside the status dot.
- **Session timeline**: per-session log of prompt/response cycles with timestamps. Persistent activity history on the daemon.
- **Cross-session notes**: per-session scratchpad stored on the daemon, visible alongside the terminal. Notes follow the session across clients.
- **Plugin API**: expose session lifecycle events (session-ready, session-working, output-received) from the daemon for third-party integrations.

**Success metric:** A developer looking at the Switchboard sidebar can understand the state of all their work across all their hosts without reading any terminal output.

---

## What This Is Not

- An AI agent itself (Switchboard manages sessions; it doesn't run them)
- A cloud or SaaS product (daemons run on your infrastructure, not ours)
- An SSH client (the daemon runs where the PTYs are; no SSH tunneling of terminal streams)
- A general-purpose terminal multiplexer (Switchboard is purpose-built for parallel AI agent workflows)

---

## Technical Foundation

| Layer | Choice | Rationale |
|---|---|---|
| Client shell | Electron | Mature, well-documented, Linux-native, same stack as VS Code's terminal |
| Terminal renderer | xterm.js | Production-grade, used in VS Code; handles 8+ instances cleanly |
| Daemon runtime | Node.js | Same language as client; node-pty native module for PTY management |
| PTY management | node-pty | Real pseudoterminals; clean stream access for idle detection |
| Transport | WebSocket + TLS | Bidirectional, works over VPN tunnels, well-supported in Node.js |
| UI | React | Component model maps cleanly to session/tab/pane structure |
| Client state | Local JSON | Preferences, connection configs — per-workstation |
| Daemon state | Local JSON + ring buffer | Session metadata + output history — per-host |
| Packaging | electron-builder (client), npm (daemon) | AppImage for client; daemon is a standalone Node.js process |

**Critical implementation note:** xterm.js instances for background tabs must never be unmounted. Tab switching is a CSS `display` swap only. Destroying and recreating terminal instances on switch loses scroll history and breaks session continuity.

---

## Open Source Intent

Switchboard is intended to be open source from day one. The gap it fills is real and broadly felt — any developer running AI coding agents in parallel faces this problem. The goal is a healthy community project, not a product.

License: MIT

---

*Last updated: 2026-04-06*
