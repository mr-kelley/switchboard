---
title: Notifications Specification
version: 0.2.0
maintained_by: claude
domain_tags: [electron, main-process, notifications]
status: active
platform: claude-code
license: Apache-2.0
governs: src/main/notifications.ts
---

# Purpose
Show native OS desktop notifications when a session transitions to `needs-attention`, honoring a per-session notification priority (`high` / `normal` / `silent`) so the user can mute noisy sessions or escalate important ones.

# Scope

## Covers
- The decision logic for whether to fire an OS notification given focus state and per-session priority.
- Notification content.
- A focus-state helper.

## Does Not Cover
- Storage of per-session priorities (owned by `preferences-store` + `SwitchboardPreferences.notificationPriorities`).
- Resolving a session's priority from preferences (owned by `connection-manager`, which calls into this module).
- The tray attention count (owned by `tray-spec.md`); `silent` suppresses the OS notification only — it MUST NOT suppress tab status or the tray count.

# Inputs
- `notifyIfNeeded(sessionName: string, isFocused: boolean, priority?: NotificationPriority)`:
  - `sessionName` — display name for the notification body.
  - `isFocused` — whether any app window currently has focus.
  - `priority` — `'high' | 'normal' | 'silent'`; defaults to `'normal'` when omitted.
- `isAppFocused()` — no inputs.

# Outputs
- `notifyIfNeeded` — side effect only (may show an OS `Notification`); returns `void`.
- `isAppFocused(): boolean` — true if any `BrowserWindow` is focused.

# Responsibilities
- **Routing by priority:**
  - `silent` → never show a notification (return immediately).
  - `high` → always show, regardless of `isFocused`.
  - `normal` (default) → show only when `isFocused` is false.
- **Support check:** if `Notification.isSupported()` is false, do nothing.
- **Content:** title `Switchboard`; body `{sessionName} needs your attention`.
- **Cardinality:** one notification per call. The caller invokes `notifyIfNeeded` once per transition into `needs-attention`, so repeated transitions are not de-duplicated here.

# Edge Cases / Fault Handling
- Unknown/undefined `priority` → treated as `normal`.
- Notifications unsupported on platform → no-op, no error.
- Empty `sessionName` → still fires (body shows the empty name); not treated as an error.

# Test Strategy
Unit tests in `tests/main/notifications.test.ts` (Vitest), mocking electron `Notification`:
- `normal` + not focused → fires.
- `normal` + focused → does not fire.
- `high` + focused → fires.
- `silent` + not focused → does not fire.
- Omitted priority behaves as `normal`.
- `Notification.isSupported() === false` → no-op.

# Completion Criteria
- Priority routing matches the rules above.
- `silent` suppresses only the OS notification, not status/tray updates (verified at the call site in `connection-manager`).
- All tests in `tests/main/notifications.test.ts` pass.
