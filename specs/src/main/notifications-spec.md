---
title: Notifications Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, main-process, notifications]
status: active
governs: src/main/notifications.ts
---

# Purpose
Show native OS desktop notifications when background sessions transition to needs-attention and the app window is not focused.

# Behavior

## Trigger
- A session transitions to `needs-attention` status AND the app window is not focused.
- Only one notification per session per transition (don't spam on repeated transitions).

## Notification Content
- Title: "Switchboard"
- Body: "{session name} needs your attention"

## Platform
- Uses Electron's `Notification` API (works on Linux, macOS, Windows).

# Exports
- `notifyIfNeeded(sessionName: string, isFocused: boolean): void`

# Test Strategy
- Unit test: notification fires when not focused.
- Unit test: notification does not fire when focused.
