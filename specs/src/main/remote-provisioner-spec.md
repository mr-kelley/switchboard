---
title: Remote Provisioner Specification
version: 0.1.0
maintained_by: claude
domain_tags: [electron, main-process, remote-provisioning, ssh, systemd, pairing]
status: active
platform: claude-code
license: Apache-2.0
governs: src/main/remote-provisioner.ts
---

# Purpose
Orchestrate the end-to-end install of the Switchboard daemon on a target Linux host over SSH: probe → transfer → extract → install as a `systemd --user` service → wait for readiness → auto-pair. Emits per-step progress so the renderer's modal can render a live checklist, supports cancellation, and supports resuming from a specific step after a failure.

# Scope

## Covers
- The 10-step state machine and its per-step commands.
- Idempotency of each step (a retry from a given step must not corrupt state left by a prior partial run).
- Progress callback protocol.
- Cancellation semantics.
- Locating the local daemon tarball on disk (dev + packaged).

## Does Not Cover
- SSH plumbing (delegated to `ssh-client-spec.md`).
- WebSocket pairing protocol (delegated to `ConnectionManager.pair()` / `submitPairingCode()`).
- Bundling the tarball (owned by `scripts/build-daemon-tarball.sh` and `dist:daemon-tarball` npm script).
- UI rendering (owned by `RemoteProvisioningModal-spec.md`).

# Inputs
- `ProvisionRequest = { target: SshTarget, daemonName?, tarballPath, daemonPort }`.
- `ConnectionManager` reference — for `pair(host, port, name)`, `submitPairingCode(code)`, `onPairSuccessOnce(cb)`, `onPairFailedOnce(cb)`.
- `ProgressCallback = (state: readonly StepState[]) => void` — invoked on every step transition.

# Outputs
- Progress callbacks with the current step list snapshot.
- On success: a new managed connection appears in `ConnectionManager`, persisted to preferences via the connection promotion flow.
- On failure: throws the underlying error; leaves the failed step marked `failed` with `errorKind` + `errorDetail`.

# Step Definitions

| # | id | Purpose | Remote command |
|---|----|---------|----------------|
| 1 | `test-connection` | Verify SSH auth + reachability | `true` |
| 2 | `probe-target` | Verify Node ≥ 20, resolve `$HOME` and node absolute path, verify systemd --user is active | `set -e; node --version; command -v node; echo "$HOME"; systemctl --user is-system-running \|\| true` |
| 3 | `check-existing` | Detect a prior install (informational; does not branch behavior in v1) | `test -f ~/.local/share/switchboard/switchboard-daemon/dist/daemon/daemon/daemon.js && echo yes \|\| echo no` |
| 4 | `upload-tarball` | scp the local daemon tarball to `/tmp/switchboard-daemon.tar.gz` | (scp) |
| 5 | `extract` | Overwrite prior install and extract | `mkdir -p ~/.local/share/switchboard && rm -rf ~/.local/share/switchboard/switchboard-daemon && tar -xzf /tmp/switchboard-daemon.tar.gz -C ~/.local/share/switchboard && rm -f /tmp/switchboard-daemon.tar.gz` |
| 6 | `install-service` | Write systemd user unit and enable+start | `mkdir -p ~/.config/systemd/user && FILE=~/.config/systemd/user/switchboard-daemon.service && cat > "$FILE" <<'SB_UNIT_END'\n<unit>\nSB_UNIT_END\n && systemctl --user daemon-reload && systemctl --user enable --now switchboard-daemon` |
| 7 | `wait-ready` | Poll `systemctl --user is-active` and the journal for a listening marker | Loop with 500ms sleep, 30s timeout |
| 8 | `read-code` | Placeholder step; the actual read happens inside `complete-pairing` after `pair:request` is sent | — |
| 9 | `complete-pairing` | Kick off client-side `pair()`, poll the remote `~/.switchboard/pairing-code.txt`, submit code, await `pair-success` | `cat ~/.switchboard/pairing-code.txt` (in a 10s poll) |
| 10 | `cleanup` | Remove tarball and pairing-code files | `rm -f /tmp/switchboard-daemon.tar.gz ~/.switchboard/pairing-code.txt` |

# Responsibilities

## State Machine
- `run(fromStep?)`: resets `steps[fromStep..]` to `pending`, iterates them in order, calling `runStep(id)` for each. On error: marks the step `failed`, populates `errorKind` and `errorDetail`, and throws.
- `cancel()`: sets an internal flag; the flag is checked between steps and inside `wait-ready`/`complete-pairing` polling loops. In-flight ssh/scp children do not receive SIGTERM (their timeouts fire naturally).
- `getState()`: snapshot of the current steps for inspection.

## Systemd Unit Template
- `[Unit] Description=Switchboard daemon; After=network.target`
- `[Service] Type=simple; ExecStart=<remote-node-path> ~/.local/share/switchboard/switchboard-daemon/dist/daemon/daemon/daemon.js; Restart=on-failure; RestartSec=5`
- `[Install] WantedBy=default.target`

The absolute paths (`remote-node-path`, `remoteHome`) are captured in step 2 and interpolated into the unit content. The heredoc marker `SB_UNIT_END` is single-quoted to disable shell expansion; the writer function refuses to run if the unit content contains the marker on its own line.

## Pairing Integration
- Step 9 first invokes `connectionManager.pair(host, 3717, daemonName)`. This opens a WS to the newly-installed daemon and sends `pair:request`, causing the daemon to write `~/.switchboard/pairing-code.txt`.
- The step then polls that file over ssh (300ms interval, 10s deadline) until it contains a 6-digit code.
- It submits the code via `connectionManager.submitPairingCode(code)`.
- It awaits `onPairSuccessOnce(cb)` / `onPairFailedOnce(cb)` (both single-shot per attempt) with a 15s client-side timeout.
- On `pair-success`, `ConnectionManager.promotePairingConnection(...)` has already persisted the connection to preferences; the modal closes.

# Edge Cases / Fault Handling
- **Node < 20 on target:** step 2 throws with a clear message. Step 2 is retriable after the user upgrades Node.
- **`systemctl --user` not active** (no user session, no linger): step 2 throws suggesting `loginctl enable-linger $USER` (requires sudo — outside our reach).
- **Existing install detected:** step 3 records a `message` but does not branch; step 5 always removes and re-extracts.
- **Daemon fails to bind port 3717 within 30s:** step 7 throws with the last observed service state or journal fragment. Retriable.
- **Pairing code file never appears:** step 9 throws after 10s. Retriable from step 9 (re-triggers `pair:request`).
- **Pairing rejected by daemon:** step 9 throws with the reason from `pair:fail`.
- **Cancel during a step:** the current step's shell child completes on its own (up to 30s worst case for `run()`); after control returns to the state machine, the loop notices the flag and stops before starting the next step.
- **Retry-from-step re-runs steps N and later:** intermediate steps must be safe against prior partial state (extract always removes first; install-service always daemon-reloads; wait-ready polls fresh).

# Tarball Path Resolution
`defaultTarballPath(version)` looks in this order:
1. `process.resourcesPath/switchboard-daemon-<version>-linux-x64.tar.gz` (packaged AppImage — asar-adjacent, if we choose to include it in the packaged build).
2. `<appPath>/../../release/…` (dev).
3. `process.cwd()/release/…` (fallback).

If none exist, `uploadTarball` throws with the resolved path in the error message.

# Test Strategy
Unit tests in `tests/main/remote-provisioner.test.ts` (Vitest):
- **State-machine sequencing:** stub `ssh-client` returns success for every call; verify all 10 steps run in order and end `done`.
- **Cancellation:** cancel during step 4; verify subsequent steps are not executed and the current step's status is not clobbered by an implicit "done".
- **Retry-from-step:** run through step 6, inject a step-7 failure, call `run('wait-ready')`; verify steps 1-6 are not re-executed and step 7 runs fresh.
- **Probe validation:** malformed probe output (Node 18, empty $HOME, systemctl offline) each throw with the specific error message.
- **Heredoc guard:** attempting to build a unit file whose content contains `\nSB_UNIT_END\n` throws before spawning.
- **Pairing:** stub `ConnectionManager.pair()` + `submitPairingCode()` + `onPairSuccessOnce()`; verify code is polled, submitted, and success awaited.

# Completion Criteria
- Live-tested end-to-end against a fresh Ubuntu 24.04 VM (Node 20, systemd --user, SSH key auth): the modal reports all 10 steps done in ~60s and the daemon appears in the sidebar as a new group.
- Retry-from-step is validated by hand: kill the daemon between steps 7 and 8, retry from `wait-ready`, and complete without re-uploading.
- No orphaned files on the target after either a successful run or an explicit uninstall path (uninstall path is out of scope for v1).
