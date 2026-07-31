---
title: Remote Provisioning Modal Specification
version: 0.1.0
maintained_by: claude
domain_tags: [renderer, react, modal, remote-provisioning]
status: active
platform: claude-code
license: Apache-2.0
governs: src/renderer/components/RemoteProvisioningModal.tsx
---

# Purpose
Provide the UI for the remote daemon provisioning flow: a form to enter SSH connection details, a live progress checklist during the install, and a retry action when a step fails. Wraps the `switchboard.remoteProvision` preload surface; owns no state that's not driven by the main-process state machine.

# Scope

## Covers
- The form (host, user, port, identity file, daemon name).
- Subscribing to `remoteProvisioner:progress` broadcasts and rendering the step list.
- Wiring the Cancel / Retry / Done actions.
- Basic form validation (host and user required).
- Hiding itself on non-Linux platforms (via the parent's `platform === 'linux'` gate on the trigger button).

## Does Not Cover
- Installing / running the flow (owned by `remote-provisioner.ts`).
- The trigger button (owned by `PreferencesModal.tsx` → Daemons tab).
- Persisting SSH connection details across runs (deferred to a later Fleet sprint).

# Inputs
- Props: `{ isOpen: boolean; onClose: () => void }`.
- `window.switchboard.remoteProvision.{start, cancel, retryFrom, onProgress}` from the preload API.
- Theme colors via `usePreferences()`.

# Outputs
- On success: `onClose()` after the user clicks Done. The Preferences Daemons tab refreshes its daemon list via the parent's `refreshStatuses()` on close.
- On failure: modal stays open, showing the failed step + error and a Retry action.

# Responsibilities

## Phases
The modal has four phases (internal state, not user-visible label):
- `form` — collecting details. Initial state on open.
- `running` — install in progress. Progress list rendered live.
- `success` — all steps done. Done button closes the modal.
- `failed` — a step threw. Retry-from-failed-step + Close.

## Form
- **Host** (required): text input, autoFocus.
- **User** (required): text input.
- **Port**: text input, defaults to `22`. Parsed as int on submit; invalid → 22.
- **SSH identity file** (optional): text input; empty → let ssh pick from agent / defaults.
- **Daemon name** (optional): text input; empty → server hostname is used.
- Submit button: `Install & pair`. Cancel button: closes the modal.

## Progress list
- One row per step, rendered from the latest `RemoteProvisionStepState[]` snapshot.
- Row shape: status glyph (`○` pending / `●` active / `✓` done / `✗` failed) + label + optional message + optional error detail.
- Colors: pending/idle text color for pending, primary color for active, primary (green stand-in) for done, error color for failed.

## Cancel behavior
- If `phase === 'running'`, clicking Cancel or the overlay calls `remoteProvision.cancel()` first, then `onClose()`.
- If `phase === 'form' | 'success' | 'failed'`, Cancel/overlay closes immediately.

## Retry
- The failed step is the first `steps` element with `status === 'failed'`.
- Retry button label: `Retry from “<failed step label>”`.
- On click: calls `remoteProvision.retryFrom(failedStep.id)`; UI re-enters `running` phase.

## Progress subscription
- On mount (when `isOpen` becomes true): subscribe via `onProgress`.
- On unmount / close: unsubscribe.
- State is set directly from the emitted snapshot (main is the source of truth).

# Edge Cases / Fault Handling
- **Modal reopened after a failed run:** state resets to `form` (fresh); no zombie progress from the previous attempt.
- **Backend rejects `start` because another provisioning is in flight:** the thrown error surfaces as `error` in the form phase.
- **Cancel while running:** cancel IPC + close; the actual step may complete after close (harmless — the state machine sees `cancelled` and stops before the next step).
- **Progress broadcast arrives after unmount:** the returned unsubscribe from `onProgress` prevents setState-after-unmount.

# Test Strategy
Unit tests in `tests/renderer/components/RemoteProvisioningModal.test.tsx` (Vitest + RTL):
- Renders form fields when open; nothing when closed.
- Rejects submit with empty host or user; shows validation error.
- Submits with parsed port, calls `remoteProvision.start` with the expected request shape.
- Renders step list from a simulated `onProgress` snapshot.
- Failed step + Retry button: clicking it calls `remoteProvision.retryFrom(id)`.
- Cancel during running phase calls `remoteProvision.cancel` before `onClose`.

# Completion Criteria
- End-to-end live test: enter details for an Ubuntu VM, click Install & pair, watch all 10 steps go green in ~60s, click Done, new daemon in sidebar.
- Retry-from-step works when a step fails and the underlying cause is resolved.
- All unit tests pass.
