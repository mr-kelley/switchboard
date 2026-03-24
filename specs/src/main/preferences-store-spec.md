---
title: Preferences Store Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, main-process, persistence, preferences]
status: active
governs: src/main/preferences-store.ts
---

# Purpose
Persist user preferences to a local JSON file so customizations survive app restarts. Provides load, save, and reset operations with deep-merge defaulting so that new preference fields introduced in future versions are automatically filled with defaults.

# Scope

## Covers
- JSON file persistence for preferences.
- Deep-merge with defaults on load.
- Atomic write (write-then-rename pattern).
- Error handling for corrupt/missing files.

## Does Not Cover
- Preference values or theme presets (governed by `themes-spec.md`).
- IPC exposure (governed by `ipc-handlers-spec.md`).
- Renderer-side state management (governed by `preferences-spec.md`).

# Inputs
- `filePath` (optional constructor argument): path to the JSON file. Defaults to `path.join(app.getPath('userData'), 'preferences.json')`.
- `SwitchboardPreferences` object for `save()`.

# Outputs
- `load(): SwitchboardPreferences` — returns persisted preferences deep-merged with defaults.
- `save(prefs: SwitchboardPreferences): void` — writes preferences to disk.
- `reset(): SwitchboardPreferences` — deletes preferences file, returns defaults.
- `getDefaults(): SwitchboardPreferences` — returns the default preferences (catppuccin-mocha theme).

# Responsibilities

## File Location
`preferences.json` in the Electron app's user data directory (`app.getPath('userData')`).

## Data Format
```json
{
  "terminalFontFamily": "'JetBrains Mono', 'Fira Code', ...",
  "terminalFontSize": 14,
  "themeName": "catppuccin-mocha",
  "terminalColors": { ... },
  "uiColors": { ... },
  ...
}
```

The file stores a flat `SwitchboardPreferences` object (no wrapping envelope).

## Deep-Merge on Load
When loading, the stored JSON is deep-merged with `getDefaults()`:
- Top-level primitive fields: stored value wins if present, default otherwise.
- Nested objects (`terminalColors`, `uiColors`, `shortcuts`): per-key merge — stored keys win, missing keys filled from defaults.
- Arrays (`sessionOrder`): stored value replaces default entirely (no merge).

This ensures that adding new preference fields in future versions does not require migration — the defaults fill in automatically.

## Default Values
Defaults are derived from the current hard-coded Catppuccin Mocha theme:
- `themeName`: `'catppuccin-mocha'`
- `terminalFontFamily`: `"'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace"`
- `terminalFontSize`: `14`
- `terminalLineHeight`: `1.2`
- `uiFontFamily`: `"system-ui, -apple-system, sans-serif"`
- `uiFontSize`: `13`
- `terminalColors`: extracted from current `TERMINAL_THEME` const
- `uiColors`: extracted from current inline CSS values across all components
- `terminalBackgroundImage`: `null`
- `terminalBackgroundOpacity`: `0.3`
- `sidebarBackgroundImage`: `null`
- `windowOpacity`: `1.0`
- `terminalBackgroundAlpha`: `1.0`
- `shortcuts`: `{}` (empty — defaults applied at consumer level)
- `sessionOrder`: `[]` (empty — natural order)
- `cursorBlink`: `true`
- `scrollbackLines`: `5000`

## Exports
- `PreferencesStore` class
- `getDefaultPreferences(): SwitchboardPreferences` (standalone function, also used by IPC reset handler)

# Edge Cases / Fault Handling
- **Missing file**: return defaults (no error).
- **Corrupt JSON**: log warning via `console.warn`, return defaults.
- **Partial JSON** (valid JSON but missing fields): deep-merge fills missing fields from defaults.
- **Unknown extra fields** in JSON: preserved on load (forward-compatible), stripped on next save if not in the interface.
- **Write failures**: log error via `console.error`, do not crash.
- **Missing parent directory**: create recursively before writing.

# Test Strategy
- Unit test: `load()` returns defaults when file doesn't exist.
- Unit test: `save()` then `load()` round-trip preserves all fields.
- Unit test: corrupt JSON returns defaults (with console.warn).
- Unit test: partial JSON deep-merges with defaults (missing top-level field filled, missing nested key filled).
- Unit test: `reset()` deletes file and returns defaults.
- Unit test: `getDefaults()` returns a complete `SwitchboardPreferences` with all required fields.
- Test file: `tests/main/preferences-store.test.ts`

# Completion Criteria
- `PreferencesStore` class implements load/save/reset/getDefaults.
- Deep-merge correctly fills missing fields at all nesting levels.
- All unit tests pass.
- TypeScript compilation succeeds.
