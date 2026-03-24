---
title: Theme Presets Specification
version: 0.1.0
maintained_by: claude
domain_tags: [shared, theming, presets]
status: active
governs: src/shared/themes.ts
---

# Purpose
Provide named theme presets that each supply a complete set of terminal colors and UI colors. Theme presets are the primary mechanism for visual customization — users select a preset and optionally override individual colors.

# Scope

## Covers
- Named theme preset definitions.
- Complete `TerminalThemeColors` and `UIThemeColors` for each preset.

## Does Not Cover
- User-defined custom themes (handled by preferences — user overrides individual colors on top of a preset).
- Theme application to components (each component spec governs its own color usage).

# Inputs
N/A — this module exports static data.

# Outputs

## Exports
- `THEME_PRESETS: Record<string, ThemePreset>` — map of preset name to color definitions.
- `ThemePreset` interface:
  ```typescript
  export interface ThemePreset {
    label: string;
    terminal: TerminalThemeColors;
    ui: UIThemeColors;
  }
  ```

## Required Presets

### catppuccin-mocha (default)
The current hard-coded theme. Terminal colors extracted from `TerminalPane.tsx` `TERMINAL_THEME`. UI colors extracted from inline CSS across all components:
- App background: `#1e1e2e`
- Sidebar: `#252536`
- Active tab: `#313244`
- Borders: `#313244`
- Text primary: `#cdd6f4`
- Text secondary: `#a6adc8`
- Text faint: `#6c7086`
- Button: `#45475a`
- Accent: `#89b4fa`
- Error: `#f38ba8`
- Status working: `#a6e3a1`
- Status idle: `#f9e2af`
- Status needs-attention: `#f38ba8`

### catppuccin-latte (light theme)
Light variant of Catppuccin. Light background with dark text.

### dracula
Classic Dracula theme — purple-tinted dark background.

### nord
Nord color palette — blue-grey arctic tones.

### solarized-dark
Solarized dark palette.

### one-dark
Atom One Dark palette.

# Responsibilities

## Completeness
Every preset MUST provide all keys defined in `TerminalThemeColors` and `UIThemeColors`. No partial presets.

## Consistency
- Terminal and UI colors within a preset should be visually harmonious.
- Background colors must provide sufficient contrast with their corresponding text colors (WCAG AA minimum for primary text).

## Extensibility
New presets can be added by appending to `THEME_PRESETS`. No code changes required in consumers — they iterate the preset map.

# Edge Cases / Fault Handling
- N/A — static data, no runtime errors possible.

# Test Strategy
- Unit test: every preset in `THEME_PRESETS` has all required `TerminalThemeColors` keys.
- Unit test: every preset in `THEME_PRESETS` has all required `UIThemeColors` keys.
- Unit test: `THEME_PRESETS` includes at least `catppuccin-mocha`.
- Unit test: all color values are valid hex strings (`/^#[0-9a-fA-F]{6}$/` or `rgba(...)` format).
- Test file: `tests/shared/themes.test.ts`

# Completion Criteria
- All 6 presets defined with complete color sets.
- All unit tests pass.
- TypeScript compilation succeeds.
