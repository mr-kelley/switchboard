---
title: Shared Types Specification
version: 0.2.0
maintained_by: claude
domain_tags: [shared, types, preferences, theming]
status: active
governs: src/shared/types.ts
---

# Purpose
Define all shared TypeScript interfaces and types used across the main process and renderer. This spec extends the existing types (SessionStatus, SessionInfo, SessionConfig, SwitchboardAPI) with preference, theming, and customization types needed for the Flow milestone.

# Scope

## Covers
- Terminal color theme interface (xterm.js color slots).
- UI color theme interface (sidebar, header, tabs, modals, status dots).
- Preferences interface (fonts, theme, background images, transparency, shortcuts, session order, terminal behavior).
- Extensions to SwitchboardAPI for preferences namespace.

## Does Not Cover
- Implementation of preferences persistence (governed by `preferences-store-spec.md`).
- Theme preset values (governed by `themes-spec.md`).
- React context implementation (governed by `preferences-spec.md`).

# Existing Types (Unchanged)

These types remain as-is:
- `SessionStatus` — `'working' | 'idle' | 'needs-attention'`
- `SessionInfo` — `{ id, name, cwd, command, pid, status }`
- `SessionConfig` — `{ name, cwd, command? }`

# New Types

## TerminalThemeColors

All 20 xterm.js color slots as string hex values:

```typescript
export interface TerminalThemeColors {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}
```

## UIThemeColors

Colors used by all renderer UI components:

```typescript
export interface UIThemeColors {
  // App root
  appBg: string;
  appText: string;
  appTextMuted: string;
  appTextFaint: string;

  // Sidebar
  sidebarBg: string;
  sidebarBorder: string;
  sidebarHeaderText: string;

  // Header
  headerBg: string;
  headerBorder: string;
  headerText: string;

  // Tabs
  tabActiveBg: string;
  tabActiveText: string;
  tabInactiveText: string;

  // Buttons
  buttonBg: string;
  buttonText: string;
  buttonHoverBg: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonBorder: string;

  // Context menu
  contextMenuBg: string;
  contextMenuBorder: string;
  contextMenuText: string;
  contextMenuHoverBg: string;

  // Modal
  modalOverlayBg: string;
  modalBg: string;
  modalBorder: string;
  modalText: string;

  // Inputs
  inputBg: string;
  inputBorder: string;
  inputText: string;

  // Status dots
  statusWorking: string;
  statusIdle: string;
  statusNeedsAttention: string;
  statusDefault: string;

  // Accent
  accentPrimary: string;
  errorText: string;
}
```

## SwitchboardPreferences

The complete preferences object persisted to disk:

```typescript
export interface SwitchboardPreferences {
  // Terminal font
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalLineHeight: number;

  // UI font
  uiFontFamily: string;
  uiFontSize: number;

  // Theme
  themeName: string;
  terminalColors: TerminalThemeColors;
  uiColors: UIThemeColors;

  // Background images
  terminalBackgroundImage: string | null;
  terminalBackgroundOpacity: number;
  sidebarBackgroundImage: string | null;

  // Transparency
  windowOpacity: number;
  terminalBackgroundAlpha: number;

  // Keyboard shortcuts (action name -> keybinding string)
  shortcuts: Record<string, string>;

  // Tab ordering (array of session IDs in display order)
  sessionOrder: string[];

  // Terminal behavior
  cursorBlink: boolean;
  scrollbackLines: number;
}
```

Field constraints:
- `terminalFontSize`: integer, minimum 8, maximum 32.
- `terminalLineHeight`: number, minimum 1.0, maximum 2.0.
- `uiFontSize`: integer, minimum 10, maximum 24.
- `windowOpacity`: number, 0.5 to 1.0.
- `terminalBackgroundOpacity`: number, 0.0 to 1.0.
- `terminalBackgroundAlpha`: number, 0.0 to 1.0.
- `scrollbackLines`: integer, minimum 0, maximum 100000.
- `themeName`: must correspond to a key in theme presets or `'custom'`.
- `shortcuts`: keys are action identifiers, values are Electron accelerator-style strings.
- `sessionOrder`: may contain stale IDs (sessions that no longer exist); consumers filter.

## SwitchboardAPI Extension

The existing `SwitchboardAPI` interface is extended with a `preferences` namespace:

```typescript
export interface SwitchboardAPI {
  // ... existing pty and session namespaces unchanged ...
  preferences: {
    load(): Promise<SwitchboardPreferences>;
    save(prefs: SwitchboardPreferences): Promise<void>;
    reset(): Promise<SwitchboardPreferences>;
    onChanged(callback: (prefs: SwitchboardPreferences) => void): () => void;
  };
}
```

# Outputs
- All types exported from `src/shared/types.ts`.
- Types used by main process (PreferencesStore, IPC handlers) and renderer (React context, components).

# Edge Cases / Fault Handling
- Types are compile-time only; no runtime validation in this file.
- Runtime validation of preference values occurs in PreferencesStore (see `preferences-store-spec.md`).

# Test Strategy
- Tests: N/A — pure type definitions have no runtime behavior.
- Type correctness is verified by TypeScript compilation (`tsc --noEmit`).

# Completion Criteria
- All interfaces exported from `src/shared/types.ts`.
- TypeScript compilation succeeds with strict mode.
- Existing code continues to compile without changes to existing type usage.
