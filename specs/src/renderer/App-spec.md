---
title: App Root Component Specification
version: 0.2.0
maintained_by: claude
domain_tags: [renderer, react, layout]
status: active
governs: src/renderer/App.tsx
---

# Purpose
Define the root React component that establishes the application layout and composes all major UI components. Manages top-level state wiring including session creation, PTY exit handling, and idle status propagation.

# Behavior

## Layout
- Flexbox row layout, full viewport height and width.
- Sidebar: fixed width (~220px), left side. Renders `Sidebar` component.
- Main area: fills remaining width, right side. Contains `Header` and terminal area.
- Header bar at top of main area: active session name or "Switchboard", "+ New Session" button.
- Terminal area: `position: relative`, fills remaining flex space. Contains all `TerminalPane` instances.

## Component Composition
```
App (SessionsProvider)
└── AppContent
    ├── Sidebar (session tabs, context menu)
    ├── Header (active session name, new session button)
    ├── TerminalPane[] (one per session, display-swap visibility)
    └── NewSessionModal (modal dialog, conditionally rendered)
```

## State Management
- Wraps entire app in `SessionsProvider` (React Context + useReducer).
- `AppContent` consumes `useSessions()` for session state and dispatch.

## IPC Event Wiring
- **PTY exit**: subscribes to `window.switchboard.pty.onExit`. On exit, removes the session from state.
- **Status changes**: subscribes to `window.switchboard.session.onStatusChanged`. Updates session status in state, which propagates to sidebar dot colors.

## Terminal Pane Management
- One `TerminalPane` per session, keyed by session ID.
- Active session's pane gets `visible={true}` (display: block); all others get `visible={false}` (display: none).
- Panes are never unmounted on tab switch — only visibility changes.
- When no sessions exist, shows an empty state message.

## Styling
- Dark theme (Catppuccin Mocha-inspired).
- Inline styles (no external CSS framework dependency).
- Colors: dark background (#1e1e2e), lighter sidebar (#252536), text (#cdd6f4).

# Exports
- `App` — default export, root React component.

# Test Strategy
- Unit test: renders without crashing.
- Unit test: sidebar, header, and terminal area elements are present.
- Unit test: shows empty state when no sessions exist.
- Unit test: new session button is present and functional.
