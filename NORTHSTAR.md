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

6. **Local-first, always.** No telemetry, no accounts, no cloud. Sessions and configuration live on the user's machine.

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

- **Queued prompts per session:** A small input area per tab where you can pre-stage your next prompt before the session is ready. One click to fire when the dot goes red.
- **Keyboard shortcuts:** Cmd/Ctrl+1 through Cmd/Ctrl+9 to jump directly to sessions by position. Cmd/Ctrl+` to cycle to the next session needing attention.
- **System tray integration:** Badge showing count of sessions awaiting input. Click tray icon to bring app to focus.
- **Session templates:** Save a working directory + command as a named template. New sessions can be spun up from templates in two clicks.
- **Session groups:** Organize sessions into named groups (e.g. by project or client) with collapsible group headers in the sidebar.
- **Output search:** Ctrl+F within any terminal pane.

**Success metric:** A developer can process a "needs attention" session and submit the next prompt without touching the mouse.

---

### v3 — Intelligence
*Goal: Let Switchboard understand what's happening in sessions, not just that something happened.*

- **Status inference:** Use lightweight heuristics (or optional local LLM) to infer more session states — e.g., "blocked waiting for confirmation," "encountered an error," "completed successfully" — and surface these as richer status labels alongside the dot.
- **Session timeline:** Per-session log of prompt/response cycles with timestamps. Lightweight activity history without storing full terminal output.
- **Cross-session context:** Optional "project notes" pane per session — a scratchpad visible alongside the terminal for tracking decisions, next steps, open questions.
- **Notification routing:** Configure per-session notification preferences. Some sessions are high priority; others can accumulate silently.
- **Plugin API:** Expose session lifecycle events (session-ready, session-working, output-received) so third-party tools can hook into Switchboard — e.g., time trackers, project management integrations, webhook triggers.

**Success metric:** A developer looking at the Switchboard sidebar can understand the state of all their work without reading any terminal output.

---

## What This Is Not

- A remote terminal manager / SSH client (there are good tools for that)
- A tmux replacement for general-purpose terminal use
- An AI agent itself (Switchboard manages sessions; it doesn't run them)
- A cloud or SaaS product

---

## Technical Foundation

| Layer | Choice | Rationale |
|---|---|---|
| Desktop shell | Electron | Mature, well-documented, Linux-native, same stack as VS Code's terminal |
| Terminal renderer | xterm.js | Production-grade, used in VS Code; handles 8+ instances cleanly |
| PTY management | node-pty | Real pseudoterminals; clean stream access for idle detection |
| UI | React | Component model maps cleanly to session/tab/pane structure |
| Session state | Local JSON | No dependencies, survives restarts, human-readable |
| Packaging | electron-builder | AppImage + deb targets for Linux |

**Critical implementation note:** xterm.js instances for background tabs must never be unmounted. Tab switching is a CSS `display` swap only. Destroying and recreating terminal instances on switch loses scroll history and breaks session continuity.

---

## Open Source Intent

Switchboard is intended to be open source from day one. The gap it fills is real and broadly felt — any developer running AI coding agents in parallel faces this problem. The goal is a healthy community project, not a product.

License: MIT

---

*Last updated: 2026-03-23*
