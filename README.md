# Switchboard

A Slack-style multi-session terminal manager for AI coding workflows. Run multiple AI sessions side-by-side with ambient status tracking so you know which sessions need your attention. See the [performance profile](docs/performance/switchboard-performance.md) for measured session counts and CPU/memory cost.

## Features

- **Multi-session tabs** — spawn and switch between terminal sessions without losing state
- **Remote daemons** — run sessions on any Linux host (x86_64 / arm64 / armv7l) by adding a daemon from Preferences → Daemons → Add daemon. Provisioning uploads the matching daemon tarball + an mTLS cert bundle and installs the daemon as a `systemd --user` service on the target. Sessions live on that host and stay put across client restarts.
- **Three-state idle detection** — green (working), yellow (idle 10s), red pulsing (needs attention / prompt detected)
- **Queued prompts** — right-click a session → Queue prompt to stage exactly one follow-up. It fires automatically the next time the session goes to `needs-attention`, so a long-running task hands off cleanly to your next instruction without you having to babysit it. Queue persists across daemon restart.
- **Session persistence** — sessions restore across both client relaunch AND daemon restart with stable IDs; scrollback replays on reconnect
- **Persistent local daemon** — install the localhost daemon as a `systemd --user` service (Preferences → Daemons → Install as service) so sessions survive closing the client. Combine with `loginctl enable-linger` for survival across logout / reboot.
- **System tray** — a tray icon shows the total count of sessions needing attention across all daemons; left-click restores the window and focuses an attention session. Closing the window minimizes to tray (quit from the tray menu or Ctrl+Q)
- **Notification routing** — set per-session notification priority (right-click a tab → Notifications): High (always alert), Normal (alert when unfocused), Silent (never alert)
- **Desktop notifications** — OS-level alerts when a background session needs attention
- **Session templates** — save a session config (host/cwd/command) and one-click spawn it from the New Session dialog
- **Session groups** — organize tabs under collapsible group headers (by host by default), with drag-and-drop and a "Move to group" menu
- **Context menu** — right-click tabs to rename, set notifications, move to a group, or close sessions
- **WebGL-accelerated rendering** — GPU terminal rendering with automatic canvas fallback

## Quick Start

### Prerequisites

- Node.js 20+ (for building/development). The daemon bundles its own Node runtime, so target hosts don't need Node installed — see [DEC-000009](decisions/events/DEC-000009.json).
- npm
- Build tools for native modules: `build-essential`, `python3`

### Development

```bash
npm install
npm run dev
```

This starts the Vite dev server (renderer) and Electron main process concurrently.

> **Linux note:** The dev script passes `--no-sandbox` to Electron to avoid SUID sandbox issues in development. Production packages handle this via proper Chromium sandbox configuration.

### Running Tests

```bash
npm test              # single run
npm run test:watch    # watch mode
```

## Building & Packaging

Switchboard uses [electron-builder](https://www.electron.build/) to produce Linux desktop packages.

### Build from source (unpacked)

```bash
npm run pack
```

Creates an unpacked Electron app in `release/linux-unpacked/`. Useful for quick testing.

### Build the distributable

```bash
npm run dist:appimage
```

Output: `release/Switchboard-<version>.AppImage` (~205 MB, runs on any x86_64 Linux with glibc). The AppImage bundles the client and three per-arch daemon tarballs (linux-x64, linux-arm64, linux-armv7l) so the "Add remote daemon" flow can provision any supported target without a separate download.

### Install / run

```bash
chmod +x release/Switchboard-*.AppImage
./release/Switchboard-*.AppImage
```

On first launch, Switchboard registers itself with the desktop environment by writing `~/.local/share/applications/switchboard.desktop` and hicolor icons under `~/.local/share/icons/hicolor/*/apps/switchboard.png` — no root, no `apt install`, no `.desktop` fiddling. The dock and app grid pick up the entry (needed on Wayland, where compositors resolve window icons via `.desktop` rather than any per-window protocol). Re-launching a newer AppImage from a different path automatically updates the entry.

Remove the integration from **Preferences → Daemons → Desktop integration → Uninstall**, or manually with:

```bash
rm -f ~/.local/share/applications/switchboard.desktop
rm -f ~/.local/share/icons/hicolor/*/apps/switchboard.png
```

### Build assets

- `build/icon.svg` / `build/icon.png` — app icon source (512x512). `scripts/gen-app-icon.py` emits `src/main/app-icon.ts` (base64 data URLs for the window icon and hicolor sizes) and `scripts/gen-tray-icons.py` emits `src/main/tray-icons.ts` (badged tray variants). Regenerate after editing the source PNG.
- Desktop launcher for the AppImage is generated at runtime by `src/main/desktop-install.ts` — see `specs/src/main/desktop-install-spec.md`.

.deb and .snap targets were removed in rc.12 (see `decisions/events/DEC-000006.json`).

### Native modules

node-pty is a native module that gets rebuilt against the packaged Electron's Node ABI during `npm run dist`. It is excluded from the asar archive (`asarUnpack`) since native `.node` binaries cannot run from inside an asar.

## Architecture

Switchboard uses a **daemon-client architecture**: PTYs run in a standalone daemon process, and the Electron app is a client that connects to one or more daemons over WebSocket + mutual TLS. This enables remote sessions and session mobility across machines.

```
src/
  main/                   # Electron main process (daemon client)
    main.ts               # Entry point, window + tray lifecycle, minimize-to-tray
    preload.ts            # contextBridge API (pty, session, daemon, preferences)
    ipc-handlers.ts       # IPC registration -> ConnectionManager / PreferencesStore / service
    connection-manager.ts # Daemon connections (WS+TLS), routing, attention summary
    local-daemon.ts       # Localhost daemon lifecycle (child process or systemd service)
    systemd-installer.ts  # Install/control the localhost daemon as a systemd --user service
    tray.ts, tray-icons.ts# System tray (attention badge, minimize-to-tray)
    preferences-store.ts  # JSON preferences persistence in userData
    notifications.ts      # OS desktop notifications (priority-aware)
  daemon/                 # Standalone daemon process (owns all PTYs)
    daemon.ts             # Entry point
    pty-manager.ts        # PTY lifecycle (spawn, write, resize, close)
    idle-detector.ts      # Three-state machine (working/idle/needs-attention)
    output-buffer.ts      # Scrollback buffer for replay
    queued-prompts.ts     # Per-session queued prompt (fires on needs-attention)
    session-store.ts      # Session metadata persistence
    transport.ts, config.ts           # WebSocket+mTLS server, config
  renderer/               # React frontend (Vite-bundled)
    App.tsx               # Root component, IPC event subscriptions
    state/                # React Context + reducers (sessions, preferences, queued-prompts)
    components/
      TerminalPane.tsx    # xterm.js terminal with WebGL, fit, resize handling
      Sidebar.tsx         # Collapsible session groups + context menu + drag-and-drop
      SessionTab.tsx      # Tab with status dot and pulse animation
      Header.tsx          # Active session name + new session button
      NewSessionModal.tsx, ManageTemplatesModal.tsx  # Session creation + templates
      ContextMenu.tsx     # Right-click menu (with submenus)
      PreferencesModal.tsx, StatusBar.tsx
  shared/
    types.ts              # Shared types (SessionInfo, SwitchboardAPI, etc.)
    protocol.ts           # Client/daemon wire protocol
    themes.ts             # Theme presets
```

### Security model

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- All main/renderer communication goes through validated IPC channels
- node-pty runs in the **daemon process**, never in the renderer; the renderer has no direct Node.js access
- Client↔daemon transport is **mutual TLS** (mTLS): both sides present certificates signed by an operator-issued lab CA and both validate against it. Client identity is drawn from the certificate's SAN FQDN. No pairing codes, no bearer tokens, no insecure fallback — see [DEC-000010](decisions/events/DEC-000010.json).
- Certificates and CA trust anchor live under `~/.switchboard/tls/` (`SWITCHBOARD_TLS_DIR` overrides). Provisioning a new host is a one-shot flow from the client's "Add remote daemon" dialog — it uploads a matching cert bundle, installs the daemon as a `systemd --user` service, and hands the client its own certificate for that daemon.

## Configuration

### Prompt pattern

The idle detector matches shell prompts to determine when a session needs attention. Default pattern: `/^[>$#]\s*$/m`

Override via the `SWITCHBOARD_PROMPT_PATTERN` environment variable on the **daemon** process (the daemon runs idle detection; the client does not). For a systemd-installed daemon, edit the unit file:

```
[Service]
Environment=SWITCHBOARD_PROMPT_PATTERN=^custom-prompt>
```

For a client-managed localhost daemon (spawned as a child process), set the env var before launching Switchboard so the child inherits it. See `specs/src/daemon/idle-detector-spec.md` for parsing rules.

## AI-Assisted Development (Aire)

This project is built using the **Aire governance system** — a spec-first, decision-logged workflow designed for AI-assisted development with Claude Code.

### What happens when you run Claude Code in this repo

When Claude Code starts a session at the repo root, it reads `CLAUDE.md`, which instructs it to:

1. Load the **role file** (`claude/terminal-emulator.role.md`) — defines what Claude can and cannot do, security requirements, performance targets, and verification checklists.
2. Read **project state** (`STATE.md`) — current milestone, sprint status, test counts, and what's in progress.
3. Follow **governance specs** in `claude/` — spec-first development, decision logging, git hygiene, planning, and documentation standards.
4. Check the **active sprint** (path in `STATE.md`) for current work items and acceptance criteria.

Claude Code will then operate under these constraints automatically: writing specs before implementation, logging architectural decisions, following git promotion rules (Profile B: work branch -> stage/test -> main), and maintaining state files as work progresses.

### Governance files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Entry point — tells Claude Code where to find everything |
| `claude/terminal-emulator.role.md` | Role definition: scope, requirements, verification checklist |
| `claude/spec-spec.md` | How to write and maintain specs |
| `claude/decision-log-spec.md` | When and how to log architectural decisions |
| `claude/claude.git-hygiene.md` | Branching, commit, and promotion rules |
| `claude/state-tracker-spec.md` | How to maintain `STATE.md` |
| `claude/state-pack-spec.md` | Session context loading at startup |
| `claude/planning-spec.md` | Sprint and milestone planning |
| `claude/documentation-spec.md` | Documentation requirements |

### Project tracking files

| File | Purpose |
|------|---------|
| `STATE.md` | Live project state (milestone, sprint, test counts) |
| `NORTHSTAR.md` | Vision, target user, design principles |
| `ROADMAP.md` | Milestones and their completion criteria |
| `specs/INDEX.md` | Index of all implementation specs |
| `decisions/` | Decision log entries |
| `sprints/` | Sprint definitions and acceptance criteria |

### Specs

Every source file has a corresponding spec in `specs/` mirroring the `src/` path with a `-spec.md` suffix. Specs are the source of truth — implementation follows specs, not the other way around. See `specs/INDEX.md` for the full index.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding features, filing bugs, and working with the Aire governance system.

## License

MIT
