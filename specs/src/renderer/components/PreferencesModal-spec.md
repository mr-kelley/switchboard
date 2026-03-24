---
title: Preferences Modal Specification
version: 0.1.0
maintained_by: claude
domain_tags: [renderer, components, preferences, modal]
status: active
governs: src/renderer/components/PreferencesModal.tsx
---

# Purpose
Provide a modal dialog for configuring all user preferences: theme selection, font settings, background images, transparency, keyboard shortcuts, and terminal behavior. Changes apply immediately (live preview).

# Scope

## Covers
- Modal UI with tabbed sections.
- Theme preset dropdown.
- Font family and size inputs.
- Background image file path inputs with opacity sliders.
- Transparency sliders.
- Keyboard shortcut display and rebinding.
- Terminal behavior toggles.
- Reset to defaults button.

## Does Not Cover
- Preferences persistence (governed by PreferencesStore spec).
- React context (governed by preferences-spec.md).

# Inputs
- `isOpen: boolean` — modal visibility.
- `onClose: () => void` — close callback.

# Outputs
- Renders a modal overlay with preferences form.
- Updates preferences via `usePreferences().updatePrefs()`.

# Responsibilities

## Sections
1. **Theme** — dropdown to select preset, updates `themeName`, `terminalColors`, and `uiColors`.
2. **Font** — terminal font family (text), terminal font size (number), line height (number), UI font family (text), UI font size (number).
3. **Backgrounds** — terminal background image path (text), terminal background opacity (slider 0-1), sidebar background image path (text).
4. **Transparency** — window opacity (slider 0.5-1.0), terminal background alpha (slider 0-1).
5. **Shortcuts** — table of action names and current bindings, click to capture new keybinding.
6. **Terminal** — cursor blink toggle, scrollback lines (number).

## Theme Switching
When user selects a new theme preset:
- Load `THEME_PRESETS[themeName]`.
- Call `updatePrefs({ themeName, terminalColors: preset.terminal, uiColors: preset.ui })`.

## Live Preview
All changes call `updatePrefs` immediately — no "Apply" button needed.

## Reset
"Reset to Defaults" button calls `resetPrefs()`.

# Edge Cases / Fault Handling
- Invalid font size: clamp to 8-32 range.
- Invalid file path for background: image simply won't load (CSS handles gracefully).
- Modal closed mid-edit: changes already saved (optimistic updates).

# Test Strategy
- Unit test: modal renders when isOpen=true, hidden when false.
- Unit test: theme dropdown lists all presets.
- Unit test: reset button calls resetPrefs.
- Test file: `tests/renderer/components/PreferencesModal.test.tsx`

# Completion Criteria
- Modal renders all sections.
- Theme switching updates preferences.
- Reset button works.
- Tests pass.
