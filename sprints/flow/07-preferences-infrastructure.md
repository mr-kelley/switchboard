---
sprint: 7
title: Preferences Infrastructure
milestone: Flow
status: completed
---

## Goal
Create the foundational preferences system that all subsequent Flow milestone features depend on: type definitions, persistent preferences store, theme presets, IPC channels, preload bridge, and React context.

## Deliverables
- `src/shared/types.ts` — extended with `TerminalThemeColors`, `UIThemeColors`, `SwitchboardPreferences` types and `SwitchboardAPI.preferences` namespace
- `src/shared/themes.ts` — named theme presets (catppuccin-mocha, catppuccin-latte, dracula, nord, solarized-dark, one-dark)
- `src/main/preferences-store.ts` — JSON persistence for user preferences (load/save/reset with deep-merge defaults)
- `src/main/ipc-handlers.ts` — extended with `preferences:load`, `preferences:save`, `preferences:reset` handlers and `preferences:changed` broadcast
- `src/main/preload.ts` — extended with `window.switchboard.preferences` namespace
- `src/renderer/state/preferences.tsx` — React context + `usePreferences()` hook with optimistic updates
- `src/renderer/App.tsx` — wrapped in `PreferencesProvider`
- Specs for each new/modified file
- Unit tests for PreferencesStore, theme presets, preferences context

## Acceptance Criteria
- Preferences persist in `~/.config/Switchboard/preferences.json`.
- Loading preferences deep-merges with defaults (new fields get default values).
- Corrupt or missing preferences file falls back to defaults gracefully.
- Theme presets each provide complete `TerminalThemeColors` and `UIThemeColors`.
- Renderer can load, update, and reset preferences via `usePreferences()` hook.
- Preferences changes broadcast to all windows via IPC.
- All existing tests continue to pass.
- New tests exist and pass for PreferencesStore, themes, and preferences context.

## Dependencies
- Sprint 06 (Session Persistence & Notifications) — complete
