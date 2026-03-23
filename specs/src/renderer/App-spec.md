---
title: App Root Component Specification
version: 0.1.0
maintained_by: claude
domain_tags: [renderer, react, layout]
status: active
governs: src/renderer/App.tsx
---

# Purpose
Define the root React component that establishes the application layout: a fixed-width sidebar on the left and a flexible main content area on the right.

# Behavior

## Layout
- Flexbox row layout, full viewport height and width.
- Sidebar: fixed width (~220px), left side.
- Main area: fills remaining width, right side.
- Header bar at top of main area: app title, placeholder for controls.

## Sprint 01 Scope
- Sidebar shows a placeholder with "Sessions" heading.
- Main area shows a placeholder with "Terminal" text.
- Header shows "Switchboard" title and a disabled "+ New Session" button.

## Styling
- Dark theme by default.
- CSS modules or inline styles (no external CSS framework dependency).
- Colors: dark background (#1e1e2e), lighter sidebar (#252536), text (#cdd6f4).

# Exports
- `App` — default export, root React component.

# Test Strategy
- Unit test: renders without crashing.
- Unit test: sidebar and main area elements are present in the DOM.
