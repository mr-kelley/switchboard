---
sprint: 10
title: Full GUI Customization
milestone: Flow
status: active
---

## Goal
Replace all hard-coded colors with theme-driven values from preferences. Add PreferencesModal for configuring themes, fonts, backgrounds, transparency, and shortcuts. Support terminal background images and window transparency.

## Deliverables
- All renderer components updated to read colors from `usePreferences()`
- `src/renderer/components/PreferencesModal.tsx` — settings UI modal
- Terminal background image support in TerminalPane
- Window transparency support via IPC
- Specs for PreferencesModal
- Unit tests

## Acceptance Criteria
- Changing theme preset updates all UI colors immediately.
- Terminal font size/family changes apply live.
- PreferencesModal opens via Ctrl+, or gear icon.
- PreferencesModal has sections: Theme, Font, Backgrounds, Transparency, Shortcuts, Terminal.
- Reset button restores all defaults.
- All existing tests continue to pass.
- New tests exist and pass.

## Dependencies
- Sprint 07 (Preferences Infrastructure) — complete
- Sprint 09 (Keyboard Shortcuts) — complete
