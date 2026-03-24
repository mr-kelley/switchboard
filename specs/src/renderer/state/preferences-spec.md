---
title: Preferences State Specification
version: 0.1.0
maintained_by: claude
domain_tags: [renderer, state, preferences, react-context]
status: active
governs: src/renderer/state/preferences.tsx
---

# Purpose
Provide a React context and hook for accessing and updating user preferences throughout the renderer. Handles loading preferences from the main process on mount, optimistic local updates, persistence via IPC, and subscription to external preference changes.

# Scope

## Covers
- `PreferencesProvider` component.
- `usePreferences()` hook.
- IPC communication for load/save/reset.
- Subscription to `preferences:changed` broadcasts.

## Does Not Cover
- Preferences persistence (governed by `preferences-store-spec.md`).
- IPC channel definitions (governed by `ipc-handlers-spec.md`).
- Individual component theming (each component spec governs its own color usage).

# Inputs
- `window.switchboard.preferences.load()` — initial preferences from main process.
- `window.switchboard.preferences.onChanged(callback)` — broadcast subscription for external changes.

# Outputs

## Exports
- `PreferencesProvider` — React context provider component.
- `usePreferences()` — hook returning `PreferencesContextValue`.

## PreferencesContextValue
```typescript
interface PreferencesContextValue {
  prefs: SwitchboardPreferences;
  updatePrefs: (partial: Partial<SwitchboardPreferences>) => void;
  resetPrefs: () => void;
  loading: boolean;
}
```

# Responsibilities

## Initialization
- On mount, `PreferencesProvider` calls `window.switchboard.preferences.load()` to fetch preferences.
- While loading, `loading` is `true` and `prefs` contains default values (imported from `getDefaultPreferences()`).
- After load completes, `loading` becomes `false` and `prefs` reflects the loaded values.

## Optimistic Updates
- `updatePrefs(partial)` immediately merges `partial` into local state (optimistic update).
- Then calls `window.switchboard.preferences.save(mergedPrefs)` to persist via IPC.
- If save fails, the optimistic update remains (fire-and-forget).

## Deep Merge for updatePrefs
- `updatePrefs` performs a shallow merge at the top level.
- For nested objects (`terminalColors`, `uiColors`, `shortcuts`): merges keys within the nested object.
- For arrays (`sessionOrder`): replaces entirely.

## Reset
- `resetPrefs()` calls `window.switchboard.preferences.reset()` via IPC.
- On success, updates local state with the returned defaults.

## External Change Subscription
- On mount, subscribes to `window.switchboard.preferences.onChanged(callback)`.
- When preferences change externally (e.g., another window), local state is replaced with the broadcast value.
- Unsubscribes on unmount.

## Context Error
- `usePreferences()` throws if used outside `PreferencesProvider`.

# Edge Cases / Fault Handling
- **Load failure** (IPC error): log warning, use defaults, set `loading` to `false`.
- **Save failure** (IPC error): log warning, optimistic update persists locally.
- **Provider missing**: `usePreferences()` throws descriptive error.

# Test Strategy
- Unit test: `usePreferences()` throws when used outside provider.
- Unit test: provider renders children and provides default prefs initially.
- Unit test: `updatePrefs` merges partial updates into state.
- Unit test: `loading` starts `true`, becomes `false` after load.
- Test file: `tests/renderer/state/preferences.test.tsx`

# Completion Criteria
- `PreferencesProvider` loads, saves, resets, and subscribes to preference changes.
- `usePreferences()` provides access to preferences and update functions.
- All unit tests pass.
- TypeScript compilation succeeds.
