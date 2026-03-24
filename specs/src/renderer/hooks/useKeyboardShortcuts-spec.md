---
title: Keyboard Shortcuts Hook Specification
version: 0.1.0
maintained_by: claude
domain_tags: [renderer, hooks, keyboard, shortcuts]
status: active
governs: src/renderer/hooks/useKeyboardShortcuts.ts
---

# Purpose
Provide a React hook that registers global keyboard shortcut listeners, parses shortcut strings into modifier+key matchers, and dispatches action callbacks when shortcuts are triggered.

# Scope

## Covers
- Shortcut string parsing (e.g., `"Control+Shift+Tab"` → modifier+key matcher).
- Global keydown listener registration and cleanup.
- Action dispatch on shortcut match.
- Default shortcut map with fallback when user shortcuts are empty.

## Does Not Cover
- What actions shortcuts trigger (consumers define handlers).
- Shortcut remapping UI (governed by PreferencesModal spec).

# Inputs
- `shortcuts: Record<string, string>` — user-configured shortcut map (action → keybinding string). May be empty.
- `handlers: Record<string, () => void>` — action → callback map.

# Outputs
- No return value. Side effect: registers/cleans up `keydown` listener on `window`.

# Responsibilities

## Shortcut String Format
Keybinding strings follow Electron accelerator format:
- Modifiers: `Control`, `Shift`, `Alt`, `Meta` (or `CommandOrControl` for cross-platform).
- Key: the `event.key` value (e.g., `Tab`, `1`, `b`, `,`, `=`, `-`).
- Joined with `+`: `"Control+Shift+Tab"`, `"Control+1"`.

## Default Shortcuts
When the user's `shortcuts` map has no entry for an action, the hook uses built-in defaults:

| Action | Default |
|--------|---------|
| `session:new` | `Control+n` |
| `session:close` | `Control+w` |
| `session:next` | `Control+Tab` |
| `session:prev` | `Control+Shift+Tab` |
| `session:1` through `session:9` | `Control+1` through `Control+9` |
| `app:toggle-sidebar` | `Control+b` |
| `app:preferences` | `Control+,` |
| `terminal:zoom-in` | `Control+=` |
| `terminal:zoom-out` | `Control+-` |
| `terminal:zoom-reset` | `Control+0` |

## Matching
- Parse each shortcut string into `{ ctrlKey, shiftKey, altKey, metaKey, key }`.
- On `keydown`, compare event modifiers and `event.key` (case-insensitive for letter keys).
- On match: call `event.preventDefault()` and invoke the handler.
- Only match actions that have a handler registered.

## Conflict Avoidance
- The hook MUST NOT intercept `Ctrl+C`, `Ctrl+V`, `Ctrl+X`, `Ctrl+A`, `Ctrl+Z` or other terminal-essential shortcuts.
- These are protected by the default map not including them.

# Edge Cases / Fault Handling
- Empty `shortcuts` map: use all defaults.
- Unknown action in `shortcuts` with no handler: ignored.
- Handler throws: catch and log, do not crash.

# Exports
- `useKeyboardShortcuts(shortcuts, handlers): void`
- `DEFAULT_SHORTCUTS: Record<string, string>`
- `parseShortcut(shortcut: string): ParsedShortcut`

# Test Strategy
- Unit test: `parseShortcut` correctly parses modifier+key combinations.
- Unit test: matching logic fires correct handler for a given KeyboardEvent.
- Unit test: protected shortcuts (Ctrl+C, etc.) are not intercepted.
- Unit test: user overrides take precedence over defaults.
- Test file: `tests/renderer/hooks/useKeyboardShortcuts.test.ts`

# Completion Criteria
- Hook registers and cleans up listeners.
- Default shortcuts work without configuration.
- User overrides take precedence.
- Tests pass.
