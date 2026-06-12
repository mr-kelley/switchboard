---
title: System Tray Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, main-process, tray, notifications]
status: active
platform: claude-code
license: Apache-2.0
governs: src/main/tray.ts
---

# Purpose
Provide a system-tray presence so Switchboard's attention-awareness lives outside the main window. The tray icon reflects the total number of sessions needing attention across all connected daemons, lets the user restore/focus the window, and enables minimize-to-tray so closing the window does not quit the app.

# Scope

## Covers
- Tray icon lifecycle (create on startup, destroy on quit).
- Icon variant selection driven by the aggregate `needs-attention` count.
- Tooltip and right-click context menu (show/hide, per-daemon status, quit).
- Left-click behavior (restore + focus the window and an attention-needing session).
- Signaling whether the tray initialized, so the caller can fall back to quit-on-close when the platform has no tray.

## Does Not Cover
- macOS menubar-style rendering or templating (future v5 concern).
- Numeric overlays above 9 (counts ≥ 10 render as a `9+` badge).
- The window-close/quit wiring itself (owned by `main-spec.md`); this spec only exposes the hooks main uses.
- Computing session status (owned by the daemon + `connection-manager`).

# Inputs
- A `ConnectionManager` reference, used to read `getAttentionSummary()` and to subscribe to status changes via `onAttentionChange(listener)`.
- Callbacks supplied by main:
  - `showWindow()` — restore and focus the main window (recreating it if destroyed).
  - `focusAttention()` — ask the renderer to focus a session needing attention.
  - `quit()` — perform a real application quit (bypassing minimize-to-tray).
- Embedded icon assets from `src/main/tray-icons.ts` (base64 PNGs, generated from `build/icon.png`): one base icon plus badged variants for counts `1`–`9` and `9+`.

# Outputs
- An Electron `Tray` instance owned by this module.
- Side effects on refresh: updates the tray image, tooltip, and context menu.
- Invocations of the injected `showWindow` / `focusAttention` / `quit` callbacks in response to user interaction.

# Responsibilities
- **Initialization (`createTray(deps)`):**
  - Build a `nativeImage` from the base icon and construct a `Tray`.
  - On success, perform an initial refresh and return a handle (object with `refresh()` and `destroy()`).
  - If `Tray` construction throws (platform without a StatusNotifier/tray host), the function MUST NOT throw to the caller; it returns `null` so main can fall back to quit-on-close.
- **Attention aggregation:** read `connectionManager.getAttentionSummary()` → `{ total, perDaemon }`. `total` is the count of sessions whose status is `needs-attention` across all daemons.
- **Icon variant selection (pure, testable):**
  - `total === 0` → base icon.
  - `1 ≤ total ≤ 9` → the badged variant for that digit.
  - `total ≥ 10` → the `9+` badged variant.
- **Tooltip:** `Switchboard` when `total === 0`; otherwise `Switchboard — N session{s} need attention` (singular/plural correct).
- **Context menu** (rebuilt on every refresh):
  - A show/hide entry: `Show Switchboard` (invokes `showWindow`). (Hide is optional; show is the required action.)
  - One line per daemon: `<name> — <sessionCount> session(s), <attentionCount> need attention`. Disconnected daemons are still listed with their status.
  - A separator, then `Quit` (invokes `quit`).
- **Left-click (`click` event):** invoke `showWindow()` then `focusAttention()`.
- **Live updates:** subscribe to `connectionManager.onAttentionChange(...)` during init and call `refresh()` on each event. Unsubscribe in `destroy()`.
- **Teardown (`destroy()`):** unsubscribe the listener and call `tray.destroy()`.

# Edge Cases / Fault Handling
- **No tray host (Linux without tray support):** `new Tray(...)` throwing is caught; `createTray` returns `null`. Main MUST then keep quit-on-close behavior.
- **Window destroyed:** `showWindow` is responsible for recreation; the tray only invokes it.
- **Rapid status churn:** `refresh()` is idempotent — it recomputes image/tooltip/menu from current state, so repeated calls converge.
- **Zero daemons:** `total === 0`, base icon, tooltip `Switchboard`, menu shows only the show entry, separator, and Quit.

# Test Strategy
Unit tests in `tests/main/tray.test.ts` (Vitest), mocking `electron` (`Tray`, `Menu`, `nativeImage`, `app`) and injecting a stub `ConnectionManager`:
- Variant selection: assert the chosen icon key for totals `0, 1, 9, 10, 99`.
- Tooltip text for `0`, `1` (singular), and `>1` (plural).
- Menu structure: includes a Show entry, a line per daemon with correct counts, and a Quit entry that invokes the `quit` callback.
- Left-click invokes `showWindow` then `focusAttention`.
- `createTray` returns `null` (no throw) when `Tray` construction throws; verifies the fallback contract.
- `onAttentionChange` subscription triggers `refresh()`; `destroy()` unsubscribes.

# Completion Criteria
- Tray appears on startup and shows the live aggregate attention count via icon variant + tooltip.
- Left-click restores/focuses the window and requests focus of an attention-needing session.
- `createTray` degrades gracefully (returns `null`) where no tray host exists.
- Per-daemon status lines and Quit work from the context menu.
- All tests in `tests/main/tray.test.ts` pass; no regressions elsewhere.
